import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { fetchNaukriJobs, getLastNaukriFetchReport } from "./jobs/fetchNaukri.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { applyPrecisionFilters } from "./jobs/precisionFilters.js";
import { filterSalesforceJobs } from "./jobs/filterSalesforceJobs.js";
import { sendTelegramMessage } from "./notify/telegram.js";
import { sendEmailMessage } from "./notify/email.js";
import {
  markDailySummarySent,
  shouldSendDailySummary
} from "./notify/dailySummary.js";
import { generateJobHash, getNewJobs, saveJobs } from "./jobs/dedupe.js";
import {
  autoPromoteFollowUpJobs,
  getApplicationTrackerSummary,
  registerApplicationJobs
} from "./db/applicationTracker.js";
import { enrichJobsWithResumeMatch } from "./resume/matchResume.js";
import { createResumeAttachments } from "./resume/generateTailoredResume.js";
import {
  acknowledgePendingAlerts,
  enqueuePendingAlerts,
  getPendingAlertCount,
  peekPendingAlerts
} from "./db/pendingAlertQueue.js";
import { acquireRunLease } from "./db/runLease.js";
import { startRunHistory } from "./db/runHistory.js";
import { getStateBackend } from "./db/stateStore.js";

const AGENT_NAME = String(process.env.AGENT_NAME || "Salesforce Job Radar Agent").trim();

/**
 * Safe retry wrapper to handle transient network / Apify failures
 */
async function safeFetch(fn, retries = 3, delayMs = 5000) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.log(`⚠️ Network error (attempt ${attempt}): ${err.message}`);

      if (attempt < retries) {
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }

  throw lastError;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function areCloudAttachmentsEnabled() {
  const configured = String(process.env.CLOUD_ATTACHMENTS_ENABLED || "").trim();
  if (configured) {
    return isTruthy(configured);
  }

  const runtimeTarget = String(process.env.AGENT_RUNTIME_TARGET || "")
    .trim()
    .toLowerCase();

  return runtimeTarget !== "supabase_edge" && !isTruthy(process.env.SUPABASE_CLOUD_MODE);
}

function inferJobSource(job) {
  const sourceId = String(job?.source_job_id || "").trim().toLowerCase();
  const link = String(job?.apply_link || "").trim().toLowerCase();

  if (
    sourceId.startsWith("naukri:") ||
    link.includes("naukri.com")
  ) {
    return "Naukri";
  }
  if (
    sourceId.startsWith("linkedin:") ||
    link.includes("linkedin.com")
  ) {
    return "LinkedIn";
  }
  if (
    sourceId.startsWith("arbeitnow:") ||
    link.includes("arbeitnow.com")
  ) {
    return "Arbeitnow";
  }
  if (
    sourceId.startsWith("adzuna:") ||
    link.includes("adzuna.")
  ) {
    return "Adzuna";
  }
  return "Other";
}

function buildSourceSummary(jobs) {
  const counts = getSourceCounts(jobs);

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}: ${count}`)
    .join(" | ") || "No jobs";
}

function getSourceCounts(jobs) {
  const counts = {
    Naukri: 0,
    LinkedIn: 0,
    Arbeitnow: 0,
    Adzuna: 0,
    Other: 0
  };

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const source = inferJobSource(job);
    counts[source] = (counts[source] || 0) + 1;
  }

  return counts;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeTelegramHtml(value) {
  return escapeHtml(value).replace(/\s+/g, " ").trim();
}

function normalizeInlineText(value, fallback = "N/A") {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function formatListValue(values, limit = 3, fallback = "None") {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }

  return values
    .map(value => normalizeInlineText(value, ""))
    .filter(Boolean)
    .slice(0, Math.max(1, limit))
    .join(", ") || fallback;
}

function formatPostedAge(job) {
  const postedDate = getJobPostedDate(job);
  if (!postedDate) {
    return "Unknown";
  }

  const diffMs = Math.max(0, Date.now() - postedDate.getTime());
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)}m ago`;
  }

  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 8) {
    return `${diffDays}d ago`;
  }

  return postedDate.toISOString().slice(0, 10);
}

function getUrgencyCountdown(job) {
  if (!isMustApplyNow(job)) {
    return "";
  }

  const postedDate = getJobPostedDate(job);
  if (!postedDate) {
    return "";
  }

  const maxHours = Math.max(
    1,
    toFiniteNumber(process.env.ALERT_MUST_APPLY_HOURS, 48)
  );
  const deadlineMs = postedDate.getTime() + (maxHours * 60 * 60 * 1000);
  const remainingMs = deadlineMs - Date.now();

  if (remainingMs <= 0) {
    return "Apply now";
  }

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes < 60) {
    return `Apply within ${remainingMinutes}m`;
  }

  const remainingHours = Math.ceil(remainingMinutes / 60);
  return `Apply within ${remainingHours}h`;
}

function getJobApplyUrl(job) {
  return String(job?.apply_link || "").trim();
}

function getJobSourceLabel(job, fallbackSource = "") {
  const source = String(fallbackSource || inferJobSource(job)).trim();
  return source || "Other";
}

function getJobResumeMatchValue(job) {
  if (!Number.isFinite(Number(job?.match_score))) {
    return "N/A";
  }
  return `${Number(job.match_score)}% (${normalizeInlineText(job?.match_level)})`;
}

function getJobApplyPriority(job) {
  const existing = normalizeInlineText(job?.apply_priority, "");
  const score = Number(job?.match_score || 0);
  const urgent = isMustApplyNow(job);

  if (urgent && score >= 60) return "High";
  if (existing === "High" || existing === "Medium" || existing === "Low") {
    if (urgent && existing === "Medium") return "High";
    if (urgent && existing === "Low") return "Medium";
    return existing;
  }
  if (urgent && score >= 40) return "High";
  if (score >= 75) return "High";
  if (urgent || score >= 50) return "Medium";
  return "Low";
}

function getJobPriorityTone(job) {
  const priority = getJobApplyPriority(job);
  if (priority === "High") return "urgency";
  if (priority === "Medium") return "age";
  return "neutral";
}

function getJobWhyMatched(job) {
  const reasons = Array.isArray(job?.why_matched)
    ? job.why_matched
    : [];

  if (reasons.length > 0) {
    return reasons;
  }

  const fallbacks = [];
  const matchedSkills = Array.isArray(job?.matched_skills)
    ? job.matched_skills.slice(0, 4)
    : [];
  if (matchedSkills.length > 0) {
    fallbacks.push(`Matched skills: ${matchedSkills.join(", ")}.`);
  }
  if (String(job?.title || "").toLowerCase().includes("salesforce")) {
    fallbacks.push("Job title is aligned with Salesforce developer work.");
  }
  if (String(job?.experience || "").trim()) {
    fallbacks.push(`Experience expectation: ${normalizeInlineText(job.experience)}.`);
  }

  return fallbacks.slice(0, 3);
}

function getJobMatchedSkills(job) {
  const matched = Array.isArray(job?.matched_skills)
    ? job.matched_skills
    : [];

  return matched
    .map(value => normalizeInlineText(value, ""))
    .filter(Boolean)
    .slice(0, 5);
}

function getJobTopMissingKeywords(job) {
  const values = Array.isArray(job?.top_missing_keywords) && job.top_missing_keywords.length > 0
    ? job.top_missing_keywords
    : Array.isArray(job?.missing_skills)
      ? job.missing_skills
      : [];

  return values
    .map(value => normalizeInlineText(value, ""))
    .filter(Boolean)
    .slice(0, 5);
}

function getJobResumeBulletSuggestions(job) {
  const suggestions = Array.isArray(job?.resume_bullet_suggestions)
    ? job.resume_bullet_suggestions
    : [];

  if (suggestions.length > 0) {
    return suggestions
      .map(value => normalizeInlineText(value, ""))
      .filter(Boolean)
      .slice(0, 3);
  }

  const matchedSkills = getJobMatchedSkills(job);
  const topMissing = getJobTopMissingKeywords(job);
  const fallbacks = [
    `Show measurable Salesforce delivery using ${matchedSkills.slice(0, 3).join(", ") || "your strongest matched skills"}.`,
    "Add one bullet with metrics such as users, records, time saved, or automation count.",
    topMissing.length > 0
      ? `If accurate, include proof points for ${topMissing.slice(0, 2).join(", ")}.`
      : "Tailor one bullet directly to the role title and business outcome."
  ];

  return fallbacks.slice(0, 3);
}

function getJobPriorityLabel(job) {
  const base = getJobApplyPriority(job);
  if (isMustApplyNow(job) && base === "High") {
    return "High | Must apply now";
  }
  if (isMustApplyNow(job)) {
    return `${base} | Must apply now`;
  }
  return base;
}

function isTrackerEnabled() {
  return isTruthy(process.env.APPLICATION_TRACKER_ENABLED || "true");
}

function getTrackerKeyLength() {
  const parsed = Number(process.env.TRACKER_SHORT_HASH_LENGTH || 8);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(6, Math.min(12, Math.floor(parsed)));
}

function getJobTrackerKey(job) {
  const hash = String(job?.job_hash || "").trim();
  if (!hash) return "";
  return hash.slice(0, getTrackerKeyLength());
}

function buildTrackerCommands(job) {
  if (!isTrackerEnabled()) return null;

  const key = getJobTrackerKey(job);
  if (!key) return null;

  return {
    key,
    apply: `npm run tracker -- apply ${key}`,
    save: `npm run tracker -- save ${key}`,
    ignore: `npm run tracker -- ignore ${key}`,
    note: `npm run tracker -- note ${key} "Follow up in 2 days"`
  };
}

function renderEmailChip(label, tone = "neutral") {
  const palette = {
    neutral: {
      background: "#e5e7eb",
      color: "#111827"
    },
    source: {
      background: "#dbeafe",
      color: "#1d4ed8"
    },
    score: {
      background: "#dcfce7",
      color: "#166534"
    },
    urgency: {
      background: "#fee2e2",
      color: "#b91c1c"
    },
    age: {
      background: "#fef3c7",
      color: "#92400e"
    }
  };
  const colors = palette[tone] || palette.neutral;

  return (
    `<span style="display:inline-block;margin:0 8px 8px 0;padding:4px 10px;border-radius:999px;` +
    `background:${colors.background};color:${colors.color};font-size:12px;font-weight:600;">` +
    `${escapeHtml(label)}</span>`
  );
}

function renderEmailPanel({ title, chips = [], body = "" }) {
  return (
    `<div style="margin:18px 0;padding:18px;border:1px solid #dbe3ea;border-radius:16px;background:#ffffff;">` +
    `<div style="font-size:17px;font-weight:800;color:#0f172a;margin:0 0 10px 0;">${escapeHtml(title)}</div>` +
    `${chips.length > 0 ? `<div style="margin:0 0 8px 0;">${chips.join("")}</div>` : ""}` +
    `<div style="font-size:14px;line-height:1.65;color:#1f2937;">${body}</div>` +
    `</div>`
  );
}

function renderEmailSummaryCard({ newJobsCount, sourceSummary, bestJob }) {
  const bestJobTitle = escapeHtml(bestJob?.title || "Best match job");
  const bestJobCompany = escapeHtml(bestJob?.company || "");
  const bestJobUrl = escapeHtml(getJobApplyUrl(bestJob) || "");
  const bestJobScore = escapeHtml(getJobResumeMatchValue(bestJob));

  return (
    `<div style="margin:20px 0;padding:20px;border-radius:18px;background:#1f2937;color:#f8fafc;">` +
    `<div style="font-size:20px;font-weight:800;margin-bottom:8px;">${escapeHtml(AGENT_NAME)} — New jobs</div>` +
    `<div style="font-size:14px;line-height:1.6;margin-bottom:12px;">` +
    `<strong>${newJobsCount}</strong> new jobs detected. Source mix: <strong>${escapeHtml(sourceSummary || "N/A")}</strong>` +
    `</div>` +
    `<div style="padding:16px;border-radius:14px;background:#0f172a;">` +
    `<div style="font-size:16px;font-weight:700;margin-bottom:4px;">Top match: ${bestJobTitle}</div>` +
    `<div style="font-size:13px;color:#cbd5e1;margin-bottom:10px;">${bestJobCompany} • Score: ${bestJobScore}</div>` +
    (bestJobUrl
      ? `<a href="${bestJobUrl}" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;">` +
        `Apply now →` +
        `</a>`
      : `<span style="color:#94a3b8;">Apply link not available</span>`) +
    `</div>` +
    `</div>`
  );
}

function summarizeProviderStatuses(providers) {
  const summary = {
    working: 0,
    recovered: 0,
    failed: 0,
    paused: 0,
    skipped: 0
  };

  for (const provider of providers) {
    const status = String(provider?.status || "").toLowerCase();
    if (status === "failed") {
      summary.failed += 1;
    } else if (status === "paused") {
      summary.paused += 1;
    } else if (status === "skipped") {
      summary.skipped += 1;
    } else if (status === "recovered") {
      summary.recovered += 1;
      summary.working += 1;
    } else {
      summary.working += 1;
    }
  }

  return summary;
}

function buildProviderHealthBlocks(fetchReport) {
  const providers = Array.isArray(fetchReport?.providers)
    ? fetchReport.providers
    : [];

  if (providers.length === 0) {
    return {
      compactText: "",
      telegramBlock: "",
      emailTextBlock: "",
      emailHtmlBlock: ""
    };
  }

  const plainLines = providers.map(provider => {
    const name = String(provider?.provider || "unknown");
    const status = String(provider?.status || "unknown");
    const rawCount = Math.max(0, Number(provider?.raw_count || 0));
    const salesforceCount = Math.max(0, Number(provider?.salesforce_count || 0));
    const contributedCount = Math.max(0, Number(provider?.contributed_count || 0));
    const reason = String(provider?.reason || "").trim();
    const error = String(provider?.error || "").trim();

    const suffix = error
      ? ` error=${error}`
      : reason
        ? ` reason=${reason}`
        : "";

    return `${name}[${status}] raw=${rawCount} sf=${salesforceCount} add=${contributedCount}${suffix}`;
  });

  const statusSummary = summarizeProviderStatuses(providers);
  const telegramLines = providers.map(provider => {
    const name = String(provider?.provider || "unknown");
    const status = String(provider?.status || "unknown");
    const rawCount = Math.max(0, Number(provider?.raw_count || 0));
    const salesforceCount = Math.max(0, Number(provider?.salesforce_count || 0));
    const contributedCount = Math.max(0, Number(provider?.contributed_count || 0));
    const reason = String(provider?.reason || "").trim();
    const error = String(provider?.error || "").trim();
    const marker = status === "failed"
      ? "❌"
      : status === "paused"
        ? "⏸"
        : status === "skipped"
          ? "⏭"
          : status === "recovered"
            ? "♻️"
            : contributedCount > 0
              ? "✅"
              : "⚪";
    const detail = error || reason;

    return (
      `${marker} <b>${escapeTelegramHtml(name)}</b> ` +
      `<code>${escapeTelegramHtml(status)}</code>\n` +
      `raw ${rawCount} | sf ${salesforceCount} | kept ${contributedCount}` +
      `${detail ? `\n↳ ${escapeTelegramHtml(detail)}` : ""}`
    );
  });

  const emailHtmlList = providers
    .map(provider => {
      const name = String(provider?.provider || "unknown");
      const status = String(provider?.status || "unknown");
      const rawCount = Math.max(0, Number(provider?.raw_count || 0));
      const salesforceCount = Math.max(0, Number(provider?.salesforce_count || 0));
      const contributedCount = Math.max(0, Number(provider?.contributed_count || 0));
      const reason = String(provider?.reason || "").trim();
      const error = String(provider?.error || "").trim();
      const detail = error || reason;
      const statusTone = status === "failed"
        ? "urgency"
        : status === "paused"
          ? "urgency"
          : status === "skipped"
            ? "age"
            : status === "recovered"
              ? "source"
              : "score";

      return (
        `<div style="margin:0 0 12px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">` +
        `<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${escapeHtml(name)}</div>` +
        `<div style="margin:0 0 6px 0;">${renderEmailChip(status, statusTone)}</div>` +
        `<div>Raw fetched: <strong>${rawCount}</strong></div>` +
        `<div>Salesforce filtered: <strong>${salesforceCount}</strong></div>` +
        `<div>Used in final pool: <strong>${contributedCount}</strong></div>` +
        `${detail ? `<div style="margin-top:6px;color:#475569;">${escapeHtml(detail)}</div>` : ""}` +
        `</div>`
      );
    })
    .join("");

  return {
    compactText:
      `providers ok=${statusSummary.working} recovered=${statusSummary.recovered} ` +
      `paused=${statusSummary.paused} failed=${statusSummary.failed} skipped=${statusSummary.skipped}`,
    telegramBlock:
      `🧪 <b>Provider Health</b>\n` +
      `working ${statusSummary.working} | recovered ${statusSummary.recovered} | paused ${statusSummary.paused} | failed ${statusSummary.failed} | skipped ${statusSummary.skipped}\n` +
      `${telegramLines.join("\n")}\n\n`,
    emailTextBlock:
      `Provider Health\n` +
      `Working: ${statusSummary.working} | Recovered: ${statusSummary.recovered} | Paused: ${statusSummary.paused} | Failed: ${statusSummary.failed} | Skipped: ${statusSummary.skipped}\n` +
      `${plainLines.join("\n")}\n\n`,
    emailHtmlBlock:
      renderEmailPanel({
        title: "Provider Health",
        chips: [
          renderEmailChip(`Working ${statusSummary.working}`, "score"),
          renderEmailChip(`Recovered ${statusSummary.recovered}`, statusSummary.recovered > 0 ? "source" : "neutral"),
          renderEmailChip(`Paused ${statusSummary.paused}`, statusSummary.paused > 0 ? "urgency" : "neutral"),
          renderEmailChip(`Failed ${statusSummary.failed}`, statusSummary.failed > 0 ? "urgency" : "neutral"),
          renderEmailChip(`Skipped ${statusSummary.skipped}`, "age")
        ],
        body: emailHtmlList
      }),
    heartbeatTelegramBlock:
      `• Providers: working ${statusSummary.working} | recovered ${statusSummary.recovered} | paused ${statusSummary.paused} | failed ${statusSummary.failed} | skipped ${statusSummary.skipped}\n`,
    heartbeatTextBlock:
      `- Providers: working ${statusSummary.working} | recovered ${statusSummary.recovered} | paused ${statusSummary.paused} | failed ${statusSummary.failed} | skipped ${statusSummary.skipped}\n`,
    heartbeatHtmlBlock:
      `<div><strong>Providers:</strong> working ${statusSummary.working} | recovered ${statusSummary.recovered} | paused ${statusSummary.paused} | failed ${statusSummary.failed} | skipped ${statusSummary.skipped}</div>`
  };
}

function emptyMessageBlocks() {
  return {
    compactText: "",
    telegramBlock: "",
    emailTextBlock: "",
    emailHtmlBlock: "",
    heartbeatTelegramBlock: "",
    heartbeatTextBlock: "",
    heartbeatHtmlBlock: ""
  };
}

function mergeMessageBlocks(...blocks) {
  const merged = emptyMessageBlocks();

  for (const block of blocks) {
    if (!block) continue;
    merged.compactText += block.compactText ? `${block.compactText} ` : "";
    merged.telegramBlock += block.telegramBlock || "";
    merged.emailTextBlock += block.emailTextBlock || "";
    merged.emailHtmlBlock += block.emailHtmlBlock || "";
    merged.heartbeatTelegramBlock += block.heartbeatTelegramBlock || "";
    merged.heartbeatTextBlock += block.heartbeatTextBlock || "";
    merged.heartbeatHtmlBlock += block.heartbeatHtmlBlock || "";
  }

  merged.compactText = merged.compactText.trim();
  return merged;
}

function buildPrecisionFilterBlocks(report) {
  if (!report || typeof report !== "object") {
    return emptyMessageBlocks();
  }

  const before = Number(report.before_count || 0);
  const after = Number(report.after_count || 0);
  const removed = report.removed || {};
  const requiredSkills = Array.isArray(report.required_skills)
    ? report.required_skills
    : [];
  const requiredMode = String(report.required_mode || "any");
  const postedHours = Number(report.max_posted_hours || 0);
  const settings = [
    report.profile ? `Profile: ${report.profile}` : "",
    requiredSkills.length > 0
      ? `Required skills (${requiredMode}): ${requiredSkills.join(", ")}`
      : "Required skills: none",
    postedHours > 0 ? `Posted limit: ${postedHours}h` : "Posted limit: none",
    `Duplicate clustering: ${report.cluster_duplicates ? "on" : "off"}`
  ].filter(Boolean);

  const reduction = before > 0
    ? `${Math.max(0, Math.round(((before - after) / before) * 100))}% reduced`
    : "0% reduced";

  const telegramLine =
    `🎯 <b>Precision Filters</b>\n` +
    `before ${before} -> after ${after} (${reduction})\n` +
    `removed\n` +
    `• exclude keywords: ${removed.exclude_keywords || 0}\n` +
    `• missing required skills: ${removed.missing_required_skills || 0}\n` +
    `• stale posted date: ${removed.stale_posted || 0}\n` +
    `• duplicate cluster: ${removed.duplicate_cluster || 0}\n` +
    `${settings.map(item => `• ${escapeTelegramHtml(item)}`).join("\n")}\n\n`;

  const textLine =
    `Precision Filters\n` +
    `Before ${before} -> After ${after} (${reduction})\n` +
    `Removed\n` +
    `- Exclude keywords: ${removed.exclude_keywords || 0}\n` +
    `- Missing required skills: ${removed.missing_required_skills || 0}\n` +
    `- Stale posted date: ${removed.stale_posted || 0}\n` +
    `- Duplicate cluster: ${removed.duplicate_cluster || 0}\n` +
    `${settings.map(item => `- ${item}`).join("\n")}\n\n`;

  const htmlBlock =
    renderEmailPanel({
      title: "Precision Filters",
      chips: [
        renderEmailChip(`Before ${before}`, "neutral"),
        renderEmailChip(`After ${after}`, "score"),
        renderEmailChip(reduction, "age")
      ],
      body:
        `<div style="margin-bottom:8px;"><strong>Removed</strong></div>` +
        `<ul style="margin:0 0 10px 18px;padding:0;">` +
        `<li>Exclude keywords: ${removed.exclude_keywords || 0}</li>` +
        `<li>Missing required skills: ${removed.missing_required_skills || 0}</li>` +
        `<li>Stale posted date: ${removed.stale_posted || 0}</li>` +
        `<li>Duplicate cluster: ${removed.duplicate_cluster || 0}</li>` +
        `</ul>` +
        `<div style="margin-bottom:8px;"><strong>Rules</strong></div>` +
        `<ul style="margin:0 0 0 18px;padding:0;">${settings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    });

  return {
    compactText: `precision ${before}->${after} removed=${before - after}`,
    telegramBlock: telegramLine,
    emailTextBlock: textLine,
    emailHtmlBlock: htmlBlock,
    heartbeatTelegramBlock:
      `• Precision: ${before} -> ${after} kept | removed ${Math.max(0, before - after)}\n`,
    heartbeatTextBlock:
      `- Precision: ${before} -> ${after} kept | removed ${Math.max(0, before - after)}\n`,
    heartbeatHtmlBlock:
      `<div><strong>Precision:</strong> ${before} -> ${after} kept | removed ${Math.max(0, before - after)}</div>`
  };
}

function buildTrackerSummaryBlocks(summary) {
  if (!summary || !summary.enabled) {
    return emptyMessageBlocks();
  }

  const counts = summary.counts || {};
  const statusItems = [
    `new ${counts.new || 0}`,
    `shortlisted ${counts.shortlisted || 0}`,
    `follow-up ${counts.follow_up || 0}`,
    `applied ${counts.applied || 0}`,
    `interview ${counts.interview || 0}`,
    `offer ${counts.offer || 0}`
  ];
  const statusText = statusItems.join(" | ");

  const actionable = Array.isArray(summary.actionable)
    ? summary.actionable.slice(0, 3)
    : [];
  const actionableTelegram = actionable.length > 0
    ? actionable
      .map((item, idx) => {
        const trackerCommands = buildTrackerCommands(item);
        return (
          `${idx + 1}. <b>${escapeTelegramHtml(item.title || "N/A")}</b>\n` +
          `status: <code>${escapeTelegramHtml(item.status || "new")}</code> | company: ${escapeTelegramHtml(item.company || "N/A")}\n` +
          `${trackerCommands
            ? `key: <code>${escapeTelegramHtml(trackerCommands.key)}</code>\n` +
              `apply <code>${escapeTelegramHtml(trackerCommands.apply)}</code>\n` +
              `save <code>${escapeTelegramHtml(trackerCommands.save)}</code>\n` +
              `ignore <code>${escapeTelegramHtml(trackerCommands.ignore)}</code>`
            : ""}`
        );
      })
      .join("\n")
    : "none";
  const actionableText = actionable.length > 0
    ? actionable
      .map((item, idx) => {
        const trackerCommands = buildTrackerCommands(item);
        return (
          `${idx + 1}. ${item.title || "N/A"}\n` +
          `status: ${item.status || "new"} | company: ${item.company || "N/A"}\n` +
          `${trackerCommands
            ? `key: ${trackerCommands.key}\n` +
              `apply: ${trackerCommands.apply}\n` +
              `save: ${trackerCommands.save}\n` +
              `ignore: ${trackerCommands.ignore}`
            : ""}`
        );
      })
      .join("\n")
    : "none";
  const actionableHtml = actionable.length > 0
    ? actionable
      .map(item => {
        const trackerCommands = buildTrackerCommands(item);
        return (
          `<div style="margin:0 0 10px 0;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">` +
          `<div style="font-weight:700;color:#0f172a;margin-bottom:4px;">${escapeHtml(item.title || "N/A")}</div>` +
          `<div style="margin-bottom:4px;">${renderEmailChip(item.status || "new", "source")}</div>` +
          `<div>Company: ${escapeHtml(item.company || "N/A")}</div>` +
          `${trackerCommands
            ? `<div style="margin-top:8px;padding:8px 10px;border:1px dashed #cbd5e1;border-radius:10px;background:#ffffff;">` +
              `<div><strong>Key:</strong> <code>${escapeHtml(trackerCommands.key)}</code></div>` +
              `<div><strong>Apply:</strong> <code>${escapeHtml(trackerCommands.apply)}</code></div>` +
              `<div><strong>Save:</strong> <code>${escapeHtml(trackerCommands.save)}</code></div>` +
              `<div><strong>Ignore:</strong> <code>${escapeHtml(trackerCommands.ignore)}</code></div>` +
              `</div>`
            : ""}` +
          `</div>`
        );
      })
      .join("")
    : "<div>None</div>";

  return {
    compactText: `tracker total=${summary.total} actionable=${actionable.length}`,
    telegramBlock:
      `🗂 <b>Application Tracker</b>\n` +
      `total ${summary.total}\n` +
      `${statusItems.map(item => `• ${escapeTelegramHtml(item)}`).join("\n")}\n` +
      `next actions\n${actionableTelegram}\n\n`,
    emailTextBlock:
      `Application Tracker\n` +
      `Total: ${summary.total}\n` +
      `${statusItems.map(item => `- ${item}`).join("\n")}\n` +
      `Next actions\n${actionableText}\n\n`,
    emailHtmlBlock:
      renderEmailPanel({
        title: "Application Tracker",
        chips: [
          renderEmailChip(`Total ${summary.total}`, "neutral"),
          renderEmailChip(`Actionable ${actionable.length}`, actionable.length > 0 ? "score" : "age")
        ],
        body:
          `<div style="margin-bottom:8px;">${statusItems.map(item => renderEmailChip(item, "neutral")).join("")}</div>` +
          `<div style="font-weight:700;margin:6px 0 10px 0;">Next actions</div>` +
          actionableHtml
      }),
    heartbeatTelegramBlock:
      `• Tracker: total ${summary.total} | actionable ${actionable.length}\n`,
    heartbeatTextBlock:
      `- Tracker: total ${summary.total} | actionable ${actionable.length}\n`,
    heartbeatHtmlBlock:
      `<div><strong>Tracker:</strong> total ${summary.total} | actionable ${actionable.length}</div>`
  };
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getMinMatchScore() {
  return Math.max(0, toFiniteNumber(process.env.ALERT_MIN_MATCH_SCORE, 0));
}

function getAlertBatchLimit() {
  const raw = String(process.env.ALERT_MAX_ITEMS || "").trim().toLowerCase();
  if (!raw) return 20;
  if (["all", "unlimited", "max", "0"].includes(raw)) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 20;
  if (parsed <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(parsed));
}

function parsePriorityList(value, fallback) {
  const items = String(value || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

function getLocationPriorityList() {
  return parsePriorityList(
    process.env.ALERT_LOCATION_PRIORITY,
    [
      "remote",
      "bengaluru",
      "pune",
      "hyderabad",
      "mumbai",
      "delhi",
      "gurugram",
      "noida",
      "chennai",
      "india"
    ]
  );
}

function getLocationRank(job) {
  const location = String(job?.location || "").toLowerCase();
  if (!location) return Number.POSITIVE_INFINITY;

  const priorities = getLocationPriorityList();
  const idx = priorities.findIndex(token => location.includes(token));
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

function extractNaukriDateFromSourceId(job) {
  const sourceId = String(job?.source_job_id || "").toLowerCase();
  const match = sourceId.match(/naukri:(\d{6})\d*/i);
  if (!match) return null;

  const raw = match[1];
  const day = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4));
  const year = 2000 + Number(raw.slice(4, 6));

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getJobPostedDate(job) {
  const fields = [
    job?.posted_at,
    job?.postedAt,
    job?.posted_date,
    job?.published_at,
    job?.publishedAt,
    job?.created_at
  ];

  for (const field of fields) {
    if (!field) continue;
    const date = new Date(field);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return extractNaukriDateFromSourceId(job);
}

function isMustApplyNow(job) {
  const maxHours = Math.max(
    1,
    toFiniteNumber(process.env.ALERT_MUST_APPLY_HOURS, 48)
  );
  const postedDate = getJobPostedDate(job);
  if (!postedDate) return false;

  const ageHours = (Date.now() - postedDate.getTime()) / (1000 * 60 * 60);
  return ageHours >= 0 && ageHours <= maxHours;
}

function isAboveMinMatchScore(job, minMatchScore) {
  const score = toFiniteNumber(job?.match_score, 0);
  return score >= minMatchScore;
}

function sortJobsForAlerts(jobs) {
  return [...jobs].sort((a, b) => {
    const urgentDiff = Number(isMustApplyNow(b)) - Number(isMustApplyNow(a));
    if (urgentDiff !== 0) return urgentDiff;

    const scoreDiff = toFiniteNumber(b?.match_score, 0) - toFiniteNumber(a?.match_score, 0);
    if (scoreDiff !== 0) return scoreDiff;

    const postedTimeDiff =
      (getJobPostedDate(b)?.getTime() || 0) - (getJobPostedDate(a)?.getTime() || 0);
    if (postedTimeDiff !== 0) return postedTimeDiff;

    const rankDiff = getLocationRank(a) - getLocationRank(b);
    if (rankDiff !== 0) return rankDiff;

    return String(a?.title || "").localeCompare(String(b?.title || ""));
  });
}

function getTopPicks(jobs) {
  const topCount = Math.max(
    0,
    Math.min(10, Number(process.env.ALERT_TOP_PICKS_COUNT || 5))
  );
  if (topCount === 0) return [];
  return sortJobsForAlerts(Array.isArray(jobs) ? jobs : []).slice(0, topCount);
}

function buildSourceGroups(jobs) {
  const groups = new Map();

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const source = inferJobSource(job);
    if (!groups.has(source)) {
      groups.set(source, []);
    }
    groups.get(source).push(job);
  }

  return groups;
}

function sortJobsByMatch(jobs) {
  return sortJobsForAlerts(jobs);
}

function getHighlightLimit(envName, fallback) {
  const parsed = Number(process.env[envName] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, Math.floor(parsed)));
}

function buildSourceHighlightBlocks(jobs) {
  const highlightLimit = getHighlightLimit("ALERT_SOURCE_HIGHLIGHTS_LIMIT", 3);
  const configs = [
    {
      source: "Naukri",
      emoji: "🟠",
      title: "Naukri New Jobs",
      tone: "age",
      background: "#fff7ed",
      border: "#fdba74",
      color: "#9a3412"
    },
    {
      source: "LinkedIn",
      emoji: "🔵",
      title: "LinkedIn New Jobs",
      tone: "source",
      background: "#eff6ff",
      border: "#93c5fd",
      color: "#1d4ed8"
    }
  ];

  const telegramSections = [];
  const textSections = [];
  const htmlSections = [];

  for (const config of configs) {
    const sourceJobs = sortJobsForAlerts(
      (Array.isArray(jobs) ? jobs : []).filter(job => getJobSourceLabel(job) === config.source)
    );
    if (sourceJobs.length === 0) continue;

    const highlights = sourceJobs.slice(0, highlightLimit);
    telegramSections.push(
      `${config.emoji} <b>${escapeTelegramHtml(config.title)} (${sourceJobs.length})</b>\n` +
      highlights
        .map((job, idx) =>
          `${idx + 1}. <b>${escapeTelegramHtml(normalizeInlineText(job?.title, "Untitled role"))}</b>\n` +
          `📊 ${escapeTelegramHtml(getJobResumeMatchValue(job))} | ⚡ ${escapeTelegramHtml(getJobApplyPriority(job))}${getUrgencyCountdown(job) ? ` | ⏳ ${escapeTelegramHtml(getUrgencyCountdown(job))}` : ""}\n` +
          `🏢 ${escapeTelegramHtml(normalizeInlineText(job?.company))}\n` +
          `🔗 ${getJobApplyUrl(job) ? `<a href="${escapeHtml(getJobApplyUrl(job))}">Open job</a>` : "N/A"}`
        )
        .join("\n\n")
    );

    textSections.push(
      `${config.title} (${sourceJobs.length})\n` +
      highlights
        .map((job, idx) =>
          `${idx + 1}. ${normalizeInlineText(job?.title, "Untitled role")}\n` +
          `Resume Match Score: ${getJobResumeMatchValue(job)} | Apply Priority: ${getJobApplyPriority(job)}${getUrgencyCountdown(job) ? ` | ${getUrgencyCountdown(job)}` : ""}\n` +
          `Company: ${normalizeInlineText(job?.company)}\n` +
          `Apply: ${getJobApplyUrl(job) || "N/A"}`
        )
        .join("\n\n")
    );

    htmlSections.push(
      `<div style="margin:20px 0;padding:18px;border:1px solid ${config.border};border-radius:16px;background:${config.background};">` +
      `<div style="font-size:18px;font-weight:800;color:${config.color};margin:0 0 12px 0;">${escapeHtml(config.title)} (${sourceJobs.length})</div>` +
      `<div style="margin:0 0 10px 0;">${renderEmailChip(`Top ${highlights.length}`, config.tone)}${renderEmailChip(`Total ${sourceJobs.length}`, "neutral")}</div>` +
      highlights
        .map((job, idx) =>
          `<div style="margin:0 0 12px 0;padding:14px 16px;border:1px solid rgba(15,23,42,0.08);border-radius:12px;background:#ffffff;">` +
          `<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${idx + 1}. ${escapeHtml(normalizeInlineText(job?.title, "Untitled role"))}</div>` +
          `<div style="margin:0 0 6px 0;">${renderEmailChip(`Resume ${getJobResumeMatchValue(job)}`, "score")}${renderEmailChip(`Apply ${getJobApplyPriority(job)}`, getJobPriorityTone(job))}${getUrgencyCountdown(job) ? renderEmailChip(getUrgencyCountdown(job), "urgency") : ""}</div>` +
          `<div style="font-size:14px;color:#334155;line-height:1.6;">Company: ${escapeHtml(normalizeInlineText(job?.company))}</div>` +
          `<div style="margin-top:8px;">${getJobApplyUrl(job) ? `<a href="${escapeHtml(getJobApplyUrl(job))}" style="color:${config.color};font-weight:700;">Open job</a>` : `<span style="color:#6b7280;">Apply link not available</span>`}</div>` +
          `</div>`
        )
        .join("") +
      `</div>`
    );
  }

  return {
    telegram: telegramSections.join("\n\n"),
    emailText: textSections.join("\n\n"),
    emailHtml: htmlSections.join("")
  };
}

function buildPrioritySections(jobs) {
  const highlightLimit = getHighlightLimit("ALERT_PRIORITY_HIGHLIGHTS_LIMIT", 4);
  const configs = [
    {
      priority: "High",
      emoji: "🔴",
      title: "High Priority",
      tone: "urgency",
      background: "#fef2f2",
      border: "#fca5a5",
      color: "#b91c1c"
    },
    {
      priority: "Medium",
      emoji: "🟡",
      title: "Medium Priority",
      tone: "age",
      background: "#fffbeb",
      border: "#fcd34d",
      color: "#92400e"
    },
    {
      priority: "Low",
      emoji: "⚪",
      title: "Low Priority",
      tone: "neutral",
      background: "#f8fafc",
      border: "#cbd5e1",
      color: "#334155"
    }
  ];

  const telegramSections = [];
  const textSections = [];
  const htmlSections = [];

  for (const config of configs) {
    const priorityJobs = sortJobsForAlerts(
      (Array.isArray(jobs) ? jobs : []).filter(job => getJobApplyPriority(job) === config.priority)
    );
    if (priorityJobs.length === 0) continue;

    const highlights = priorityJobs.slice(0, highlightLimit);
    telegramSections.push(
      `${config.emoji} <b>${escapeTelegramHtml(config.title)} (${priorityJobs.length})</b>\n` +
      highlights
        .map((job, idx) =>
          `${idx + 1}. <b>${escapeTelegramHtml(normalizeInlineText(job?.title, "Untitled role"))}</b>\n` +
          `📊 ${escapeTelegramHtml(getJobResumeMatchValue(job))} | 🔎 ${escapeTelegramHtml(getJobSourceLabel(job))}${getUrgencyCountdown(job) ? ` | ⏳ ${escapeTelegramHtml(getUrgencyCountdown(job))}` : ""}\n` +
          `🏢 ${escapeTelegramHtml(normalizeInlineText(job?.company))}`
        )
        .join("\n\n")
    );

    textSections.push(
      `${config.title} (${priorityJobs.length})\n` +
      highlights
        .map((job, idx) =>
          `${idx + 1}. ${normalizeInlineText(job?.title, "Untitled role")}\n` +
          `Resume Match Score: ${getJobResumeMatchValue(job)} | Source: ${getJobSourceLabel(job)}${getUrgencyCountdown(job) ? ` | ${getUrgencyCountdown(job)}` : ""}\n` +
          `Company: ${normalizeInlineText(job?.company)}`
        )
        .join("\n\n")
    );

    htmlSections.push(
      `<div style="margin:20px 0;padding:18px;border:1px solid ${config.border};border-radius:16px;background:${config.background};">` +
      `<div style="font-size:18px;font-weight:800;color:${config.color};margin:0 0 12px 0;">${escapeHtml(config.title)} (${priorityJobs.length})</div>` +
      `<div style="margin:0 0 10px 0;">${renderEmailChip(`Count ${priorityJobs.length}`, config.tone)}</div>` +
      highlights
        .map((job, idx) =>
          `<div style="margin:0 0 12px 0;padding:14px 16px;border:1px solid rgba(15,23,42,0.08);border-radius:12px;background:#ffffff;">` +
          `<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${idx + 1}. ${escapeHtml(normalizeInlineText(job?.title, "Untitled role"))}</div>` +
          `<div style="margin:0 0 6px 0;">${renderEmailChip(`Resume ${getJobResumeMatchValue(job)}`, "score")}${renderEmailChip(getJobSourceLabel(job), "source")}${getUrgencyCountdown(job) ? renderEmailChip(getUrgencyCountdown(job), "urgency") : ""}</div>` +
          `<div style="font-size:14px;color:#334155;line-height:1.6;">${escapeHtml(normalizeInlineText(job?.company))}</div>` +
          `<div style="margin-top:8px;">${getJobApplyUrl(job) ? `<a href="${escapeHtml(getJobApplyUrl(job))}" style="color:${config.color};font-weight:700;">Open job</a>` : `<span style="color:#6b7280;">Apply link not available</span>`}</div>` +
          `</div>`
        )
        .join("") +
      `</div>`
    );
  }

  return {
    telegram: telegramSections.length > 0
      ? `🎯 <b>Priority Snapshot</b>\n${telegramSections.join("\n\n")}\n\n`
      : "",
    emailText: textSections.length > 0
      ? `Priority Snapshot\n${textSections.join("\n\n")}\n\n`
      : "",
    emailHtml: htmlSections.length > 0
      ? `<div style="margin-top:18px;">${htmlSections.join("")}</div>`
      : ""
  };
}

function buildTelegramJobLine(job, options = {}) {
  const verbose = isTruthy(process.env.TELEGRAM_VERBOSE || "false");
  const indexLabel = Number.isFinite(options.index) ? `${options.index}. ` : "";
  const source = getJobSourceLabel(job, options.source);
  const title = escapeTelegramHtml(job?.title || "Untitled role");
  const company = escapeTelegramHtml(normalizeInlineText(job?.company));
  const location = escapeTelegramHtml(normalizeInlineText(job?.location));
  const experience = escapeTelegramHtml(normalizeInlineText(job?.experience));
  const relevance = escapeTelegramHtml(normalizeInlineText(job?.relevance));
  const resumeMatch = escapeTelegramHtml(getJobResumeMatchValue(job));
  const posted = escapeTelegramHtml(formatPostedAge(job));
  const countdown = escapeTelegramHtml(getUrgencyCountdown(job));
  const applyPriority = escapeTelegramHtml(getJobPriorityLabel(job));
  const applyUrl = getJobApplyUrl(job);
  const applyLine = applyUrl
    ? `🔗 <a href="${escapeHtml(applyUrl)}">Open job</a>`
    : `🔗 N/A`;

  const trackerCommands = verbose ? buildTrackerCommands(job) : null;

  const baseLines = [
    `<b>${indexLabel}${title}</b>`,
    `📊 Match: <b>${resumeMatch}</b> | ⚡ ${applyPriority}`,
    `${countdown ? `⏳ ${countdown}` : ""}`,
    `🏢 ${company}`,
    `${applyLine}`
  ]
    .filter(Boolean)
    .join("\n");

  if (!verbose) {
    return baseLines;
  }

  const matchedSkills = escapeTelegramHtml(
    formatListValue(getJobMatchedSkills(job), 5, "None")
  );
  const missing = escapeTelegramHtml(
    formatListValue(getJobTopMissingKeywords(job), 5, "None")
  );
  const resumeAction = escapeTelegramHtml(formatListValue(job?.resume_actions, 2, "No change suggested"));
  const whyMatched = escapeTelegramHtml(
    formatListValue(getJobWhyMatched(job), 2, "Role/title fit")
  );
  const bulletSuggestions = getJobResumeBulletSuggestions(job)
    .map(item => `• ${escapeTelegramHtml(item)}`)
    .join("\n");

  return (
    baseLines +
    `\n🔎 Source: ${escapeTelegramHtml(source)} | ⏱ Posted: ${posted}` +
    `\n📍 ${location} | 💼 ${experience}` +
    `\n🧠 Matched Skills: ${matchedSkills}` +
    `\n✅ Why this matched: ${whyMatched}` +
    `\n🧩 Top missing keywords: ${missing}` +
    `\n✍️ Suggested resume bullets:\n${bulletSuggestions}` +
    `\n📝 Resume fix: ${resumeAction}` +
    `${trackerCommands
      ? `\n🗂 Tracker: <code>${escapeTelegramHtml(trackerCommands.key)}</code>\n` +
        `• Apply: <code>${escapeTelegramHtml(trackerCommands.apply)}</code>\n` +
        `• Save: <code>${escapeTelegramHtml(trackerCommands.save)}</code>\n` +
        `• Ignore: <code>${escapeTelegramHtml(trackerCommands.ignore)}</code>\n` +
        `• Note: <code>${escapeTelegramHtml(trackerCommands.note)}</code>\n`
      : ""}`
  );
}

function buildEmailTextJobLine(job, options = {}) {
  const indexLabel = Number.isFinite(options.index) ? `[${options.index}] ` : "";
  const source = getJobSourceLabel(job, options.source);
  const trackerCommands = buildTrackerCommands(job);
  const lines = [
    `${indexLabel}${normalizeInlineText(job?.title, "Untitled role")}`,
    `${normalizeInlineText(job?.relevance)}`,
    `Source: ${source} | Resume Match Score: ${getJobResumeMatchValue(job)} | Posted: ${formatPostedAge(job)} | Apply Priority: ${getJobPriorityLabel(job)}`,
    ...(getUrgencyCountdown(job) ? [`Urgency: ${getUrgencyCountdown(job)}`] : []),
    `Company: ${normalizeInlineText(job?.company)}`,
    `Location: ${normalizeInlineText(job?.location)}`,
    `Experience: ${normalizeInlineText(job?.experience)}`,
    `Matched Skills: ${formatListValue(getJobMatchedSkills(job), 5, "None")}`,
    `Why this matched: ${formatListValue(getJobWhyMatched(job), 3, "Role/title fit")}`,
    `Top missing keywords: ${formatListValue(getJobTopMissingKeywords(job), 5, "None")}`,
    `Suggested resume bullets: ${formatListValue(getJobResumeBulletSuggestions(job), 3, "Use measurable Salesforce project bullets")}`,
    `Resume fix: ${formatListValue(job?.resume_actions, 3, "No change suggested")}`,
    ...(trackerCommands
      ? [
          `Tracker key: ${trackerCommands.key}`,
          `Apply action: ${trackerCommands.apply}`,
          `Save action: ${trackerCommands.save}`,
          `Ignore action: ${trackerCommands.ignore}`,
          `Note action: ${trackerCommands.note}`
        ]
      : []),
    `Apply: ${getJobApplyUrl(job) || "N/A"}`
  ];

  return lines.join("\n");
}

function buildEmailHtmlJobLine(job, options = {}) {
  const indexLabel = Number.isFinite(options.index) ? `${options.index}. ` : "";
  const source = getJobSourceLabel(job, options.source);
  const applyUrl = getJobApplyUrl(job);
  const trackerCommands = buildTrackerCommands(job);
  const chips = [
    renderEmailChip(source, "source"),
    renderEmailChip(`Resume ${getJobResumeMatchValue(job)}`, "score"),
    renderEmailChip(formatPostedAge(job), "age"),
    renderEmailChip(`Apply ${getJobApplyPriority(job)}`, getJobPriorityTone(job))
  ];
  const countdown = getUrgencyCountdown(job);
  if (countdown) {
    chips.push(renderEmailChip(countdown, "urgency"));
  }

  return (
    `<div style="margin:0 0 16px 0;padding:16px 18px;border:1px solid #dbe3ea;border-radius:14px;background:#ffffff;">` +
    `<div style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px 0;">${escapeHtml(indexLabel)}${escapeHtml(normalizeInlineText(job?.title, "Untitled role"))}</div>` +
    `<div style="font-size:13px;font-weight:600;color:#475569;margin:0 0 10px 0;">${escapeHtml(normalizeInlineText(job?.relevance))}</div>` +
    `<div style="margin:0 0 10px 0;">${chips.join("")}</div>` +
    `<div style="font-size:14px;line-height:1.6;color:#111827;">` +
    `<div><strong>Resume Match Score:</strong> ${escapeHtml(getJobResumeMatchValue(job))}</div>` +
    `<div><strong>Apply Priority:</strong> ${escapeHtml(getJobPriorityLabel(job))}</div>` +
    `${countdown ? `<div><strong>Urgency:</strong> ${escapeHtml(countdown)}</div>` : ""}` +
    `<div><strong>Company:</strong> ${escapeHtml(normalizeInlineText(job?.company))}</div>` +
    `<div><strong>Location:</strong> ${escapeHtml(normalizeInlineText(job?.location))}</div>` +
    `<div><strong>Experience:</strong> ${escapeHtml(normalizeInlineText(job?.experience))}</div>` +
    `<div><strong>Matched Skills:</strong> ${escapeHtml(formatListValue(getJobMatchedSkills(job), 5, "None"))}</div>` +
    `<div><strong>Why this matched:</strong> ${escapeHtml(formatListValue(getJobWhyMatched(job), 3, "Role/title fit"))}</div>` +
    `<div><strong>Top missing keywords:</strong> ${escapeHtml(formatListValue(getJobTopMissingKeywords(job), 5, "None"))}</div>` +
    `<div><strong>Suggested resume bullets:</strong><ul style="margin:6px 0 0 18px;padding:0;">${getJobResumeBulletSuggestions(job).map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` +
    `<div><strong>Resume fix:</strong> ${escapeHtml(formatListValue(job?.resume_actions, 3, "No change suggested"))}</div>` +
    `${trackerCommands
      ? `<div style="margin-top:10px;padding:10px 12px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;">` +
        `<div style="font-weight:700;color:#0f172a;margin-bottom:6px;">Tracker actions</div>` +
        `<div><strong>Tracker key:</strong> <code>${escapeHtml(trackerCommands.key)}</code></div>` +
        `<div><strong>Apply:</strong> <code>${escapeHtml(trackerCommands.apply)}</code></div>` +
        `<div><strong>Save:</strong> <code>${escapeHtml(trackerCommands.save)}</code></div>` +
        `<div><strong>Ignore:</strong> <code>${escapeHtml(trackerCommands.ignore)}</code></div>` +
        `<div><strong>Note:</strong> <code>${escapeHtml(trackerCommands.note)}</code></div>` +
        `</div>`
      : ""}` +
    `<div style="margin-top:10px;">` +
    (applyUrl
      ? `<a href="${escapeHtml(applyUrl)}" style="display:inline-block;padding:8px 12px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">Open Job</a>`
      : `<span style="color:#6b7280;">Apply link not available</span>`) +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

const ALERT_REPORT_DIR = path.resolve(__dirname, "../..", ".cache/alert-reports");

async function writeAlertReport(jobs, options = {}) {
  const dir = ALERT_REPORT_DIR;
  await fs.mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = String(options.name || "job-alert-report").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `${name}-${timestamp}.html`;
  const filePath = path.join(dir, filename);

  const html = `<!doctype html>` +
    `<html><head><meta charset="utf-8"><title>Job Alert Report</title></head><body style="font-family:Arial,sans-serif;color:#111827;">` +
    `<h1 style="margin-bottom:0.5rem;">${escapeHtml(AGENT_NAME)} - Full Job Alert Report</h1>` +
    `<p>Generated: ${new Date().toLocaleString()}</p>` +
    `<div style="margin-top:20px;">` +
    jobs.map((job, idx) =>
      `<div style="margin-bottom:18px;padding:16px;border:1px solid #dbe3ea;border-radius:12px;background:#ffffff;">` +
      `<h2 style="margin:0 0 8px 0;font-size:18px;">${idx + 1}. ${escapeHtml(normalizeInlineText(job?.title, "Untitled role"))}</h2>` +
      buildEmailHtmlJobLine(job, { index: idx + 1, source: getJobSourceLabel(job) }) +
      `</div>`
    ).join("") +
    `</div></body></html>`;

  await fs.writeFile(filePath, html, "utf8");

  return {
    filename,
    path: filePath,
    contentType: "text/html",
    caption: "Full job alert report"
  };
}

function buildJobMessages(newJobs, options = {}) {
  const compact = options.compact ?? isTruthy(process.env.ALERT_COMPACT || "true");
  const sourceOrder = ["Naukri", "LinkedIn", "Arbeitnow", "Adzuna", "Other"];
  const groups = buildSourceGroups(newJobs);
  const sourceSummary = buildSourceSummary(newJobs);
  const messageBlocks = options.messageBlocks || emptyMessageBlocks();
  const sourceHighlights = buildSourceHighlightBlocks(newJobs);
  const prioritySections = buildPrioritySections(newJobs);
  const topPicks = getTopPicks(newJobs);
  const mustApplyJobs = sortJobsForAlerts(
    (Array.isArray(newJobs) ? newJobs : []).filter(job => isMustApplyNow(job))
  ).slice(0, 5);
  const orderedSources = [...sourceOrder, ...[...groups.keys()].filter(source => !sourceOrder.includes(source))];
  const minMatchScore = getMinMatchScore();

  const topPicksTelegram = topPicks.length > 0
    ? (
      `⭐ <b>Top Picks (${topPicks.length})</b>\n` +
      topPicks
        .map((job, idx) =>
          `${idx + 1}. <b>${escapeTelegramHtml(normalizeInlineText(job?.title, "Untitled role"))}</b>${isMustApplyNow(job) ? " <b>🚨</b>" : ""}\n` +
          `📊 Resume Match Score: <b>${escapeTelegramHtml(getJobResumeMatchValue(job))}</b>\n` +
          `⚡ ${escapeTelegramHtml(getJobPriorityLabel(job))}\n` +
          `${getUrgencyCountdown(job) ? `⏳ ${escapeTelegramHtml(getUrgencyCountdown(job))}\n` : ""}` +
          `🔎 ${escapeTelegramHtml(getJobSourceLabel(job))} | ⏱ ${escapeTelegramHtml(formatPostedAge(job))}\n` +
          `🔗 ${getJobApplyUrl(job) ? `<a href="${escapeHtml(getJobApplyUrl(job))}">Open job</a>` : "N/A"}`
        )
        .join("\n\n") +
      "\n\n"
    )
    : "";

  const topPicksEmailText = topPicks.length > 0
    ? (
      `Top Picks (${topPicks.length})\n` +
      topPicks
        .map((job, idx) =>
          `${idx + 1}. ${normalizeInlineText(job?.title, "Untitled role")}${isMustApplyNow(job) ? " [Must apply now]" : ""}\n` +
          `Source: ${getJobSourceLabel(job)} | Resume Match Score: ${getJobResumeMatchValue(job)} | Apply Priority: ${getJobPriorityLabel(job)} | Posted: ${formatPostedAge(job)}${getUrgencyCountdown(job) ? ` | ${getUrgencyCountdown(job)}` : ""}\n` +
          `Apply: ${getJobApplyUrl(job) || "N/A"}`
        )
        .join("\n\n") +
      "\n\n"
    )
    : "";

  const topPicksEmailHtml = topPicks.length > 0
    ? (
      `<h3 style="margin:24px 0 12px 0;color:#0f172a;">Top Picks (${topPicks.length})</h3>` +
      topPicks
        .map(
          (job, idx) =>
            `<div style="margin:0 0 12px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;">` +
            `<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">${idx + 1}. ${escapeHtml(normalizeInlineText(job?.title, "Untitled role"))}</div>` +
            `<div style="margin-bottom:6px;">${renderEmailChip(getJobSourceLabel(job), "source")}${renderEmailChip(`Resume ${getJobResumeMatchValue(job)}`, "score")}${renderEmailChip(`Apply ${getJobApplyPriority(job)}`, getJobPriorityTone(job))}${renderEmailChip(formatPostedAge(job), "age")}${getUrgencyCountdown(job) ? renderEmailChip(getUrgencyCountdown(job), "urgency") : ""}${isMustApplyNow(job) ? renderEmailChip("Must apply now", "urgency") : ""}</div>` +
            `<div><a href="${escapeHtml(getJobApplyUrl(job) || "#")}" style="color:#1d4ed8;font-weight:700;">Open job</a></div>` +
            `</div>`
        )
        .join("")
    )
    : "";

  const mustApplyTelegram = mustApplyJobs.length > 0
    ? (
      `🚨 <b>Must Apply Now (${mustApplyJobs.length})</b>\n` +
      mustApplyJobs
        .map((job, idx) =>
          `${idx + 1}. <b>${escapeTelegramHtml(normalizeInlineText(job?.title, "Untitled role"))}</b>\n` +
          `📊 Resume Match Score: <b>${escapeTelegramHtml(getJobResumeMatchValue(job))}</b>\n` +
          `⚡ ${escapeTelegramHtml(getJobPriorityLabel(job))}\n` +
          `${getUrgencyCountdown(job) ? `⏳ ${escapeTelegramHtml(getUrgencyCountdown(job))}\n` : ""}` +
          `🔎 ${escapeTelegramHtml(getJobSourceLabel(job))} | ⏱ ${escapeTelegramHtml(formatPostedAge(job))}\n` +
          `🔗 ${getJobApplyUrl(job) ? `<a href="${escapeHtml(getJobApplyUrl(job))}">Open job</a>` : "N/A"}`
        )
        .join("\n\n") +
      "\n\n"
    )
    : "";

  const mustApplyEmailText = mustApplyJobs.length > 0
    ? (
      `Must Apply Now (${mustApplyJobs.length})\n` +
      mustApplyJobs
        .map((job, idx) =>
          `${idx + 1}. ${normalizeInlineText(job?.title, "Untitled role")}\n` +
          `Source: ${getJobSourceLabel(job)} | Resume Match Score: ${getJobResumeMatchValue(job)} | Apply Priority: ${getJobPriorityLabel(job)} | Posted: ${formatPostedAge(job)}${getUrgencyCountdown(job) ? ` | ${getUrgencyCountdown(job)}` : ""}\n` +
          `Apply: ${getJobApplyUrl(job) || "N/A"}`
        )
        .join("\n\n") +
      "\n\n"
    )
    : "";

  const mustApplyEmailHtml = mustApplyJobs.length > 0
    ? (
      `<h3 style="margin:24px 0 12px 0;color:#b91c1c;">Must Apply Now (${mustApplyJobs.length})</h3>` +
      mustApplyJobs
        .map(
          (job, idx) =>
            `<div style="margin:0 0 12px 0;padding:14px 16px;border:1px solid #fecaca;border-radius:12px;background:#fff7ed;">` +
            `<div style="font-size:15px;font-weight:700;color:#7f1d1d;margin-bottom:6px;">${idx + 1}. ${escapeHtml(normalizeInlineText(job?.title, "Untitled role"))}</div>` +
            `<div style="margin-bottom:6px;">${renderEmailChip(getJobSourceLabel(job), "source")}${renderEmailChip(`Resume ${getJobResumeMatchValue(job)}`, "score")}${renderEmailChip(`Apply ${getJobApplyPriority(job)}`, getJobPriorityTone(job))}${renderEmailChip(formatPostedAge(job), "age")}${getUrgencyCountdown(job) ? renderEmailChip(getUrgencyCountdown(job), "urgency") : ""}${renderEmailChip("Must apply now", "urgency")}</div>` +
            `<div><a href="${escapeHtml(getJobApplyUrl(job) || "#")}" style="color:#b91c1c;font-weight:700;">Open job</a></div>` +
            `</div>`
        )
        .join("")
    )
    : "";

  const reportAttachment = options.reportAttachment;
  const compactNotice = reportAttachment
    ? `\n📄 Full report attached: ${escapeTelegramHtml(reportAttachment.filename)}`
    : "";

  const telegramBody =
    `🔥 <b>${escapeTelegramHtml(AGENT_NAME)}</b>\n` +
    `🆕 <b>${newJobs.length} new Salesforce jobs</b>\n` +
    `🎚 <b>Filter:</b> match >= ${minMatchScore}%\n` +
    `🧭 <b>Source mix:</b> ${escapeTelegramHtml(sourceSummary)}\n\n` +
    messageBlocks.telegramBlock +
    `${sourceHighlights.telegram ? `${sourceHighlights.telegram}\n\n` : ""}` +
    topPicksTelegram +
    mustApplyTelegram +
    prioritySections.telegram +
    (compact
      ? compactNotice
      : orderedSources
          .filter(source => groups.has(source) && groups.get(source).length > 0)
          .map(source => {
            const sourceJobs = sortJobsByMatch(groups.get(source));
            return (
              `📌 <b>${escapeTelegramHtml(source)} Jobs (${sourceJobs.length})</b>\n\n` +
              sourceJobs.map((job, idx) => buildTelegramJobLine(job, {
                index: idx + 1,
                source
              })).join("\n\n")
            );
          })
          .join("\n\n"));

  const reportTextNotice = reportAttachment
    ? `\nFull report attached: ${reportAttachment.filename}\n`
    : "";

  const emailText =
    `${AGENT_NAME}\n` +
    `${newJobs.length} new Salesforce jobs\n` +
    `Filter: match >= ${minMatchScore}%\n` +
    `Source mix: ${sourceSummary}\n\n` +
    messageBlocks.emailTextBlock +
    `${sourceHighlights.emailText ? `${sourceHighlights.emailText}\n\n` : ""}` +
    topPicksEmailText +
    mustApplyEmailText +
    prioritySections.emailText +
    (compact
      ? reportTextNotice
      : orderedSources
          .filter(source => groups.has(source) && groups.get(source).length > 0)
          .map(source => {
            const sourceJobs = sortJobsByMatch(groups.get(source));
            return (
              `${source} Jobs (${sourceJobs.length})\n\n` +
              sourceJobs.map((job, idx) => buildEmailTextJobLine(job, {
                index: idx + 1,
                source
              })).join("\n\n")
            );
          })
          .join("\n\n"));

  const bestJob = topPicks[0] || (newJobs[0] || null);
  const summaryCardHtml = renderEmailSummaryCard({
    newJobsCount: newJobs.length,
    sourceSummary,
    bestJob
  });

  const emailHtml =
    `<!doctype html>` +
    `<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">` +
    `<div style="max-width:860px;margin:0 auto;">` +
    `<div style="padding:24px;border-radius:18px;background:#0f172a;color:#ffffff;">` +
    `<div style="font-size:24px;font-weight:800;margin-bottom:8px;">${escapeHtml(AGENT_NAME)}</div>` +
    `<div style="font-size:18px;font-weight:700;margin-bottom:10px;">${newJobs.length} new Salesforce jobs</div>` +
    `<div style="font-size:14px;line-height:1.6;">` +
    `<div><strong>Filter:</strong> match &gt;= ${minMatchScore}%</div>` +
    `<div><strong>Source mix:</strong> ${escapeHtml(sourceSummary)}</div>` +
    `</div>` +
    `</div>` +
    summaryCardHtml +
    `<div style="padding:20px 0 0 0;">` +
    messageBlocks.emailHtmlBlock +
    sourceHighlights.emailHtml +
    topPicksEmailHtml +
    mustApplyEmailHtml +
    prioritySections.emailHtml +
    (compact
      ? reportAttachment
        ? `<div style="margin:24px 0;padding:16px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;">` +
          `<strong>Full report attached:</strong> ${escapeHtml(reportAttachment.filename)}</div>`
        : ""
      : orderedSources
          .filter(source => groups.has(source) && groups.get(source).length > 0)
          .map(source => {
            const sourceJobs = sortJobsByMatch(groups.get(source));
            return (
              `<h3 style="margin:24px 0 12px 0;color:#0f172a;">${escapeHtml(source)} Jobs (${sourceJobs.length})</h3>` +
              sourceJobs
                .map((job, idx) => buildEmailHtmlJobLine(job, {
                  index: idx + 1,
                  source
                }))
                .join("")
            );
          })
          .join("")) +
    `</div>` +
    `</div>` +
    `</body></html>`;

  return { telegramBody, emailText, emailHtml };
}

function buildTopCounts(values, limit = 5) {
  const counts = new Map();

  for (const value of Array.isArray(values) ? values : []) {
    const key = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      const diff = b[1] - a[1];
      if (diff !== 0) return diff;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, Math.max(1, limit))
    .map(([label, count]) => ({ label, count }));
}

function extractPrimaryLocation(locationText) {
  const value = String(locationText || "")
    .split(",")[0]
    .trim();
  return value || "";
}

function formatTrendText(items, fallbackLabel) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallbackLabel;
  }
  return items.map(item => `${item.label} (${item.count})`).join(", ");
}

function formatTrendHtml(items, fallbackLabel) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p>${escapeHtml(fallbackLabel)}</p>`;
  }
  const list = items
    .map(item => `<li>${escapeHtml(item.label)} (${item.count})</li>`)
    .join("");
  return `<ul>${list}</ul>`;
}

function buildDailySummaryMessages({
  dateKey,
  fetchedCount,
  salesforceJobs,
  scoredNewJobs,
  sourceSummary,
  messageBlocks
}) {
  const companies = buildTopCounts(
    (Array.isArray(salesforceJobs) ? salesforceJobs : []).map(job => job.company),
    5
  );
  const locations = buildTopCounts(
    (Array.isArray(salesforceJobs) ? salesforceJobs : []).map(job =>
      extractPrimaryLocation(job.location)
    ),
    5
  );
  const missingSkills = buildTopCounts(
    (Array.isArray(scoredNewJobs) ? scoredNewJobs : [])
      .flatMap(job => (Array.isArray(job?.missing_skills) ? job.missing_skills : [])),
    7
  );

  const companyText = formatTrendText(companies, "No company trend for this window");
  const locationText = formatTrendText(locations, "No location trend for this window");
  const missingSkillsText = formatTrendText(
    missingSkills,
    "No missing-skills trend (no scored new jobs)"
  );

  const companyHtml = formatTrendHtml(companies, "No company trend for this window");
  const locationHtml = formatTrendHtml(locations, "No location trend for this window");
  const missingSkillsHtml = formatTrendHtml(
    missingSkills,
    "No missing-skills trend (no scored new jobs)"
  );

  const telegramText =
    `📊 <b>${AGENT_NAME} Daily Summary (${dateKey})</b>\n\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceJobs.length}\n` +
    `Source mix: ${sourceSummary || "No jobs"}\n\n` +
    `${messageBlocks.telegramBlock}` +
    `🏢 <b>Top Companies</b>\n${companyText}\n\n` +
    `📍 <b>Top Locations</b>\n${locationText}\n\n` +
    `🧩 <b>Missing Skills Trend</b>\n${missingSkillsText}`;

  const emailText =
    `${AGENT_NAME} Daily Summary (${dateKey})\n\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceJobs.length}\n` +
    `Source mix: ${sourceSummary || "No jobs"}\n\n` +
    `${messageBlocks.emailTextBlock}` +
    `Top Companies\n${companyText}\n\n` +
    `Top Locations\n${locationText}\n\n` +
    `Missing Skills Trend\n${missingSkillsText}`;

  const emailHtml =
    `<h2>${AGENT_NAME} Daily Summary (${escapeHtml(dateKey)})</h2>` +
    `<p><strong>Fetched:</strong> ${fetchedCount}</p>` +
    `<p><strong>Salesforce matched:</strong> ${salesforceJobs.length}</p>` +
    `<p><strong>Source mix:</strong> ${escapeHtml(sourceSummary || "No jobs")}</p>` +
    messageBlocks.emailHtmlBlock +
    `<h3>Top Companies</h3>${companyHtml}` +
    `<h3>Top Locations</h3>${locationHtml}` +
    `<h3>Missing Skills Trend</h3>${missingSkillsHtml}`;

  return {
    telegramText,
    emailText,
    emailHtml
  };
}

function selectAlertsForBatch(queueJobs, limit, requireSourceMix) {
  const ordered = Array.isArray(queueJobs) ? queueJobs : [];
  const maxItems = Number.isFinite(limit) && Number(limit) > 0
    ? Math.floor(Number(limit))
    : ordered.length;

  if (!requireSourceMix || ordered.length <= maxItems) {
    return ordered.slice(0, maxItems);
  }

  const selected = [];
  const selectedHashes = new Set();
  const preferredSources = ["Naukri", "LinkedIn"];

  for (const source of preferredSources) {
    const candidate = ordered.find(job => inferJobSource(job) === source);
    if (!candidate) continue;
    if (selectedHashes.has(candidate.job_hash)) continue;
    selected.push(candidate);
    selectedHashes.add(candidate.job_hash);
    if (selected.length >= maxItems) {
      return selected;
    }
  }

  for (const job of ordered) {
    if (selectedHashes.has(job.job_hash)) continue;
    selected.push(job);
    selectedHashes.add(job.job_hash);
    if (selected.length >= maxItems) break;
  }

  return selected;
}

async function notifyAll({
  telegramText,
  emailSubject,
  emailText,
  emailHtml,
  attachments = []
}) {
  const [telegramResult, emailResult] = await Promise.allSettled([
    sendTelegramMessage(telegramText, { attachments }),
    sendEmailMessage({
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
      attachments
    })
  ]);

  const telegramOk =
    telegramResult.status === "fulfilled" && telegramResult.value === true;
  const emailOk =
    emailResult.status === "fulfilled" && emailResult.value === true;

  return {
    telegramOk,
    emailOk,
    anyOk: telegramOk || emailOk
  };
}

function getNotificationTimeLabel() {
  const timezone = String(process.env.DAILY_SUMMARY_TIMEZONE || "Asia/Kolkata").trim() || "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${timezone}`;
}

async function sendRunSummary({
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  note,
  sourceSummary = "",
  messageBlocks = emptyMessageBlocks()
}) {
  const timeLabel = getNotificationTimeLabel();
  const diagnosticsTelegram = String(messageBlocks.heartbeatTelegramBlock || "").trim();
  const diagnosticsText = String(messageBlocks.heartbeatTextBlock || "").trim();
  const diagnosticsHtml = String(messageBlocks.heartbeatHtmlBlock || "").trim();
  const telegramText =
    `ℹ️ <b>${escapeTelegramHtml(AGENT_NAME)} Heartbeat</b>\n\n` +
    `📥 Fetched: <b>${fetchedCount}</b>\n` +
    `🎯 Salesforce matched: <b>${salesforceCount}</b>\n` +
    `${sourceSummary ? `🧭 Source mix: ${escapeTelegramHtml(sourceSummary)}\n` : ""}` +
    `🆕 New this run: <b>${newCount}</b>\n` +
    `📦 Pending queue: <b>${pendingCount}</b>\n` +
    `${diagnosticsTelegram ? `\n🧪 <b>Diagnostics</b>\n${diagnosticsTelegram}\n` : ""}` +
    `📝 Note: ${escapeTelegramHtml(note)}`;

  const emailText =
    `${AGENT_NAME} Heartbeat\n\n` +
    `Time: ${timeLabel}\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceCount}\n` +
    `${sourceSummary ? `Source mix: ${sourceSummary}\n` : ""}` +
    `New this run: ${newCount}\n` +
    `Pending queue: ${pendingCount}\n` +
    `${diagnosticsText ? `\nDiagnostics\n${diagnosticsText}` : ""}` +
    `Note: ${note}`;

  const emailHtml =
    `<!doctype html>` +
    `<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">` +
    `<div style="max-width:760px;margin:0 auto;">` +
    `<div style="padding:22px;border-radius:18px;background:#111827;color:#ffffff;">` +
    `<div style="font-size:24px;font-weight:800;margin-bottom:8px;">${escapeHtml(AGENT_NAME)} Heartbeat</div>` +
    `<div style="font-size:14px;line-height:1.8;">` +
    `<div><strong>Time:</strong> ${escapeHtml(timeLabel)}</div>` +
    `<div><strong>Fetched:</strong> ${fetchedCount}</div>` +
    `<div><strong>Salesforce matched:</strong> ${salesforceCount}</div>` +
    `${sourceSummary ? `<div><strong>Source mix:</strong> ${escapeHtml(sourceSummary)}</div>` : ""}` +
    `<div><strong>New this run:</strong> ${newCount}</div>` +
    `<div><strong>Pending queue:</strong> ${pendingCount}</div>` +
    `<div><strong>Note:</strong> ${escapeHtml(note)}</div>` +
    `</div>` +
    `</div>` +
    `${diagnosticsHtml ? renderEmailPanel({ title: "Diagnostics", body: diagnosticsHtml }) : ""}` +
    `</div>` +
    `</body></html>`;

  const result = await notifyAll({
    telegramText,
    emailSubject: `${AGENT_NAME}: ${newCount} new jobs | heartbeat (${timeLabel})`,
    emailText,
    emailHtml
  });

  if (result.anyOk) {
    console.log("📣 Heartbeat summary sent");
  } else {
    console.log("⚠️ Heartbeat summary failed on all channels");
  }
}

async function maybeSendDailySummary({
  fetchedCount = 0,
  salesforceJobs = [],
  scoredNewJobs = [],
  sourceSummary = "",
  messageBlocks = emptyMessageBlocks()
}) {
  const check = await shouldSendDailySummary();
  if (!check.shouldSend) {
    console.log(`ℹ️ Daily summary skipped: ${check.reason}`);
    return false;
  }

  const messages = buildDailySummaryMessages({
    dateKey: check.dateKey,
    fetchedCount,
    salesforceJobs,
    scoredNewJobs,
    sourceSummary,
    messageBlocks
  });

  const result = await notifyAll({
    telegramText: messages.telegramText,
    emailSubject: `${AGENT_NAME} daily summary (${check.dateKey})`,
    emailText: messages.emailText,
    emailHtml: messages.emailHtml
  });

  if (result.anyOk) {
    await markDailySummarySent(check.dateKey);
    console.log(`📊 Daily summary sent for ${check.dateKey}`);
    return true;
  }

  console.log("⚠️ Daily summary failed on all channels");
  return false;
}

async function processPendingAlerts(alertBatchLimit, options = {}) {
  const baseMessageBlocks = options.messageBlocks || emptyMessageBlocks();
  const pendingCount = await getPendingAlertCount();
  console.log(`📦 Pending alerts in queue: ${pendingCount}`);

  if (pendingCount === 0) {
    console.log("♻️ No new pending jobs to alert");
    return {
      pendingCount: 0,
      alertedCount: 0,
      notified: false
    };
  }

  const queueScanLimit = Number.isFinite(alertBatchLimit)
    ? Math.max(Math.floor(alertBatchLimit), Math.min(pendingCount, 2000))
    : Math.min(pendingCount, 2000);
  const queueSnapshot = await peekPendingAlerts(queueScanLimit);
  const minMatchScore = getMinMatchScore();
  const ineligible = queueSnapshot.filter(
    job => !isAboveMinMatchScore(job, minMatchScore)
  );
  if (ineligible.length > 0) {
    await acknowledgePendingAlerts(ineligible.map(job => job.job_hash));
    console.log(
      `🧹 Removed ${ineligible.length} queued job(s) below match score ${minMatchScore}`
    );
  }
  const eligibleQueue = queueSnapshot.filter(job =>
    isAboveMinMatchScore(job, minMatchScore)
  );
  if (eligibleQueue.length === 0) {
    const remaining = await getPendingAlertCount();
    console.log(
      `ℹ️ No queued jobs meet ALERT_MIN_MATCH_SCORE=${minMatchScore}`
    );
    return {
      pendingCount: remaining,
      alertedCount: 0,
      notified: false
    };
  }

  const requireSourceMix = isTruthy(
    process.env.ALERT_REQUIRE_SOURCE_MIX || "true"
  );
  const prioritizedQueue = sortJobsForAlerts(eligibleQueue);
  const jobsToAlert = selectAlertsForBatch(
    prioritizedQueue,
    alertBatchLimit,
    requireSourceMix
  );
  console.log(
    `🧭 Alert batch source mix: ${buildSourceSummary(jobsToAlert)}`
  );
  const trackerSummary = await getApplicationTrackerSummary({ limit: 3 });
  const trackerBlocks = buildTrackerSummaryBlocks(trackerSummary);
  const messageBlocks = mergeMessageBlocks(
    baseMessageBlocks,
    trackerBlocks
  );

  const compact = isTruthy(process.env.ALERT_COMPACT || "true");
  const attachmentsEnabled = areCloudAttachmentsEnabled();
  const reportAttachment = compact
    && attachmentsEnabled
    ? await writeAlertReport(jobsToAlert, { name: "job-alert" })
    : null;

  const { telegramBody, emailText, emailHtml } = buildJobMessages(
    jobsToAlert,
    {
      messageBlocks,
      compact,
      reportAttachment
    }
  );

  const attachments = attachmentsEnabled
    ? await createResumeAttachments(jobsToAlert)
    : [];
  if (reportAttachment) {
    attachments.push(reportAttachment);
  }

  if (!attachmentsEnabled) {
    console.log("ℹ️ Cloud attachment generation disabled for this runtime");
  }

  if (attachments.length > 0) {
    console.log(
      `📎 Resume attachment prepared (${attachments.length} file${attachments.length > 1 ? "s" : ""})`
    );
  }

  const notifyResult = await notifyAll({
    telegramText: telegramBody,
    emailSubject: `${AGENT_NAME}: ${jobsToAlert.length} new jobs | ${buildSourceSummary(jobsToAlert)}`,
    emailText,
    emailHtml,
    attachments
  });

  if (notifyResult.anyOk) {
    await acknowledgePendingAlerts(jobsToAlert.map(job => job.job_hash));
    const trackerResult = await registerApplicationJobs(jobsToAlert, {
      event: "alerted",
      defaultStatus: "new"
    });
    console.log(
      `🗂 Tracker updated for alerted jobs: +${trackerResult.added} / updated ${trackerResult.updated}`
    );
    console.log("📄 Sample NEW Salesforce job:");
    console.log({
      title: jobsToAlert[0].title,
      company: jobsToAlert[0].company,
      experience: jobsToAlert[0].experience,
      location: jobsToAlert[0].location,
      relevance: jobsToAlert[0].relevance,
      apply: jobsToAlert[0].apply_link
    });
    return {
      pendingCount,
      alertedCount: jobsToAlert.length,
      notified: true
    };
  } else {
    console.log("⚠️ Notifications failed on all channels. Pending queue retained.");
    return {
      pendingCount,
      alertedCount: 0,
      notified: false
    };
  }
}

async function run() {
  console.log(`🚀 ${AGENT_NAME} started`);
  console.log("🔍 Fetching Salesforce jobs from Naukri...");
  const runSource = String(
    process.env.AGENT_RUN_SOURCE ||
      process.env.GITHUB_EVENT_NAME ||
      "agent"
  ).trim();
  const alertBatchLimit = getAlertBatchLimit();
  const alertBatchLabel = Number.isFinite(alertBatchLimit)
    ? String(alertBatchLimit)
    : "all";
  const alertOnEmpty = isTruthy(process.env.ALERT_ON_EMPTY);
  const isManualRun = String(process.env.GITHUB_EVENT_NAME || "").trim() === "workflow_dispatch";
  const notifyEveryRun = isTruthy(process.env.NOTIFY_EVERY_RUN) || isManualRun;
  const naukriGuardEnabled = isTruthy(
    process.env.NAUKRI_GAP_GUARD_ENABLED || "true"
  );
  const naukriMinRequired = Math.max(
    0,
    Number(process.env.NAUKRI_MIN_REQUIRED_PER_RUN || 1)
  );
  const attachmentsEnabled = areCloudAttachmentsEnabled();
  console.log(
    `Alert settings: min_match_score=${getMinMatchScore()} | max_items=${alertBatchLabel}`
  );

  let releaseRunLease = async () => {};
  let runStatus = "succeeded";
  let runNote = "Agent run completed";
  let runErrorMessage = "";
  let runSourceSummary = "";
  let runFetchedCount = 0;
  let runSalesforceCount = 0;
  let runNewJobsCount = 0;
  let runPendingCount = 0;
  let runAlertsSentCount = 0;
  const runDetails = {
    agentName: AGENT_NAME,
    runSource,
    schedulerMode: String(process.env.SCHEDULER_MODE || "").trim() || "default",
    stateBackend: getStateBackend(),
    notifyEveryRun,
    alertBatchLimit: alertBatchLabel,
    attachmentsEnabled
  };
  const runHistory = await startRunHistory({
    source: runSource,
    note: AGENT_NAME,
    details: runDetails
  });
  try {
    const lease = await acquireRunLease({
      source: runSource,
      note: AGENT_NAME
    });
    if (!lease.acquired) {
      console.log(`Run skipped by shared lease: ${lease.reason}`);
      runStatus = "skipped";
      runNote = `Skipped by shared lease: ${lease.reason}`;
      return;
    }
    releaseRunLease = lease.release || (async () => {});
    console.log(`🔐 Run lease: ${lease.reason}`);

    const trackerAutoResult = await autoPromoteFollowUpJobs();
    if (trackerAutoResult.changed > 0) {
      console.log(
        `🗂 Tracker auto-follow-up promoted: ${trackerAutoResult.changed}`
      );
    }

    // 🔁 Fetch jobs safely with retry
    const jobs = await safeFetch(() => fetchNaukriJobs());
    const fetchReport = getLastNaukriFetchReport();
    const providerHealthBlocks = buildProviderHealthBlocks(fetchReport);
    const baseMessageBlocks = mergeMessageBlocks(providerHealthBlocks);
    runFetchedCount = Array.isArray(jobs) ? jobs.length : 0;
    runDetails.fetchReport = fetchReport || null;
    runDetails.providerHealth = providerHealthBlocks.compactText || "";

    if (providerHealthBlocks.compactText) {
      console.log(`🧪 Provider health: ${providerHealthBlocks.compactText}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log("❌ No jobs fetched");
      if (alertOnEmpty) {
        await notifyAll({
          telegramText:
            `⚠️ ${AGENT_NAME} ran successfully, but no jobs were returned from Naukri.\n\n` +
            baseMessageBlocks.telegramBlock,
          emailSubject: `${AGENT_NAME}: No jobs fetched`,
          emailText:
            `${AGENT_NAME} ran successfully, but no jobs were returned from Naukri.\n\n` +
            baseMessageBlocks.emailTextBlock,
          emailHtml:
            `<p>${AGENT_NAME} ran successfully, but no jobs were returned from Naukri.</p>` +
            baseMessageBlocks.emailHtmlBlock
        });
      } else {
        console.log("ℹ️ ALERT_ON_EMPTY disabled; skipping no-jobs notification");
      }
      const pendingResult = await processPendingAlerts(alertBatchLimit, {
        messageBlocks: baseMessageBlocks
      });
      const trackerBlocks = buildTrackerSummaryBlocks(
        await getApplicationTrackerSummary({ limit: 3 })
      );
      const summaryMessageBlocks = mergeMessageBlocks(
        baseMessageBlocks,
        trackerBlocks
      );
      if (notifyEveryRun && !pendingResult.notified) {
        await sendRunSummary({
          fetchedCount: 0,
          salesforceCount: 0,
          newCount: 0,
          pendingCount: pendingResult.pendingCount,
          note: "No jobs fetched in this run.",
          messageBlocks: summaryMessageBlocks
        });
      }
      await maybeSendDailySummary({
        fetchedCount: 0,
        salesforceJobs: [],
        scoredNewJobs: [],
        sourceSummary: "",
        messageBlocks: summaryMessageBlocks
      });
      runNote = "No jobs fetched in this run.";
      runPendingCount = pendingResult.pendingCount;
      runAlertsSentCount = pendingResult.alertedCount;
      runDetails.summaryReason = "no_jobs_fetched";
      return;
    }

    // 🔥 Salesforce role filter first, then precision pipeline
    const salesforceJobsRaw = filterSalesforceJobs(jobs);
    const guardSourceSummary = buildSourceSummary(salesforceJobsRaw);
    const guardSourceCounts = getSourceCounts(salesforceJobsRaw);
    const naukriCount = guardSourceCounts.Naukri || 0;

    const { jobs: salesforceJobs, report: precisionReport } =
      applyPrecisionFilters(salesforceJobsRaw);
    const precisionBlocks = buildPrecisionFilterBlocks(precisionReport);
    const runMessageBlocks = mergeMessageBlocks(
      baseMessageBlocks,
      precisionBlocks
    );
    const sourceSummary = buildSourceSummary(salesforceJobs);
    runSourceSummary = sourceSummary;
    runSalesforceCount = salesforceJobs.length;
    runDetails.precisionReport = precisionReport;
    runDetails.guardSourceSummary = guardSourceSummary;

    console.log(
      `🎯 Salesforce jobs found (before precision): ${salesforceJobsRaw.length}`
    );
    console.log(
      `🎯 Salesforce jobs after precision filters: ${salesforceJobs.length}`
    );
    console.log(`🧭 Salesforce source mix: ${sourceSummary}`);

    if (naukriGuardEnabled && naukriCount < naukriMinRequired) {
      const guardText =
        `🚨 <b>Naukri Source Guard Triggered</b>\n\n` +
        `Expected minimum Naukri jobs: ${naukriMinRequired}\n` +
        `Naukri jobs in this run: ${naukriCount}\n` +
        `Total Salesforce jobs (before precision): ${salesforceJobsRaw.length}\n` +
        `Source mix: ${guardSourceSummary || "No jobs"}\n\n` +
        runMessageBlocks.telegramBlock;
      const guardEmailText =
        `Naukri Source Guard Triggered\n\n` +
        `Expected minimum Naukri jobs: ${naukriMinRequired}\n` +
        `Naukri jobs in this run: ${naukriCount}\n` +
        `Total Salesforce jobs (before precision): ${salesforceJobsRaw.length}\n` +
        `Source mix: ${guardSourceSummary || "No jobs"}\n\n` +
        runMessageBlocks.emailTextBlock;
      const guardEmailHtml =
        `<h2>Naukri Source Guard Triggered</h2>` +
        `<p><strong>Expected minimum Naukri jobs:</strong> ${naukriMinRequired}</p>` +
        `<p><strong>Naukri jobs in this run:</strong> ${naukriCount}</p>` +
        `<p><strong>Total Salesforce jobs (before precision):</strong> ${salesforceJobsRaw.length}</p>` +
        `<p><strong>Source mix:</strong> ${escapeHtml(guardSourceSummary || "No jobs")}</p>` +
        runMessageBlocks.emailHtmlBlock;

      await notifyAll({
        telegramText: guardText,
        emailSubject: `${AGENT_NAME}: Naukri source gap detected`,
        emailText: guardEmailText,
        emailHtml: guardEmailHtml
      });
    }

    if (salesforceJobs.length === 0) {
      if (alertOnEmpty) {
        await notifyAll({
          telegramText:
            "⚠️ No Salesforce-related jobs found in this run.\n\n" +
            runMessageBlocks.telegramBlock,
          emailSubject: `${AGENT_NAME}: No Salesforce jobs found`,
          emailText:
            "No Salesforce-related jobs found in this run.\n\n" +
            runMessageBlocks.emailTextBlock,
          emailHtml:
            "<p>No Salesforce-related jobs found in this run.</p>" +
            runMessageBlocks.emailHtmlBlock
        });
      } else {
        console.log("ℹ️ ALERT_ON_EMPTY disabled; skipping empty Salesforce alert");
      }
      const pendingResult = await processPendingAlerts(alertBatchLimit, {
        messageBlocks: runMessageBlocks
      });
      const trackerBlocks = buildTrackerSummaryBlocks(
        await getApplicationTrackerSummary({ limit: 3 })
      );
      const summaryMessageBlocks = mergeMessageBlocks(
        runMessageBlocks,
        trackerBlocks
      );
      if (notifyEveryRun && !pendingResult.notified) {
        await sendRunSummary({
          fetchedCount: jobs.length,
          salesforceCount: 0,
          newCount: 0,
          pendingCount: pendingResult.pendingCount,
          note: "No Salesforce developer jobs matched.",
          sourceSummary,
          messageBlocks: summaryMessageBlocks
        });
      }
      await maybeSendDailySummary({
        fetchedCount: jobs.length,
        salesforceJobs: [],
        scoredNewJobs: [],
        sourceSummary,
        messageBlocks: summaryMessageBlocks
      });
      runNote = "No Salesforce developer jobs matched.";
      runPendingCount = pendingResult.pendingCount;
      runAlertsSentCount = pendingResult.alertedCount;
      runDetails.summaryReason = "no_salesforce_matches";
      console.log("Agent run completed");
      return;
    }

    const newJobs = await getNewJobs(salesforceJobs);
    runNewJobsCount = newJobs.length;
    console.log(`Newly discovered jobs this run: ${newJobs.length}`);
    let alertableJobsCount = 0;
    let scoredNewJobs = [];

    if (newJobs.length > 0) {
      scoredNewJobs = await enrichJobsWithResumeMatch(newJobs);
      await saveJobs(scoredNewJobs);
      const trackerResult = await registerApplicationJobs(scoredNewJobs, {
        event: "discovered",
        defaultStatus: "new"
      });
      console.log(
        `🗂 Tracker updated for discovered jobs: +${trackerResult.added} / updated ${trackerResult.updated}`
      );

      const minMatchScore = getMinMatchScore();
      const alertableJobs = scoredNewJobs.filter(job =>
        isAboveMinMatchScore(job, minMatchScore)
      );
      const skippedByScore = scoredNewJobs.length - alertableJobs.length;
      if (skippedByScore > 0) {
        console.log(
          `🧮 Alert filter skipped ${skippedByScore} job(s) below match score ${minMatchScore}`
        );
      }
      alertableJobsCount = alertableJobs.length;

      const pendingPayload = alertableJobs.map(job => ({
        ...job,
        job_hash: generateJobHash(job)
      }));
      const addedCount = await enqueuePendingAlerts(pendingPayload);
      console.log(`📥 Added to pending alert queue: ${addedCount}`);
    }

    const pendingResult = await processPendingAlerts(alertBatchLimit, {
      messageBlocks: runMessageBlocks
    });
    runPendingCount = pendingResult.pendingCount;
    runAlertsSentCount = pendingResult.alertedCount;

    const trackerBlocks = buildTrackerSummaryBlocks(
      await getApplicationTrackerSummary({ limit: 3 })
    );
    const summaryMessageBlocks = mergeMessageBlocks(
      runMessageBlocks,
      trackerBlocks
    );

    if (notifyEveryRun && !pendingResult.notified) {
      let note = "";
      if (newJobs.length === 0) {
        note = "No new jobs after dedupe in this run.";
      } else if (alertableJobsCount === 0) {
        note = `New jobs found, but all were below ALERT_MIN_MATCH_SCORE=${getMinMatchScore()}.`;
      }

      if (note) {
        runNote = note;
        runDetails.summaryReason = newJobs.length === 0
          ? "no_new_jobs_after_dedupe"
          : "below_min_match_score";
        await sendRunSummary({
          fetchedCount: jobs.length,
          salesforceCount: salesforceJobs.length,
          newCount: 0,
          pendingCount: pendingResult.pendingCount,
          note,
          sourceSummary,
          messageBlocks: summaryMessageBlocks
        });
      }
    }

    await maybeSendDailySummary({
      fetchedCount: jobs.length,
      salesforceJobs,
      scoredNewJobs,
      sourceSummary,
      messageBlocks: summaryMessageBlocks
    });

    if (pendingResult.notified) {
      runNote = `Alerted ${pendingResult.alertedCount} queued job(s).`;
      runDetails.summaryReason = "alerts_sent";
    } else if (runNote === "Agent run completed" && newJobs.length > 0) {
      runNote = "Run completed without sending new alerts.";
      runDetails.summaryReason = "completed_without_alerts";
    }

    console.log("Agent run completed");
  } catch (error) {
    runStatus = "failed";
    runErrorMessage = String(error?.message || error || "unknown error");
    runNote = `Failed: ${runErrorMessage}`;
    runDetails.failureName = String(error?.name || "Error");
    process.exitCode = 1;
    console.error("Agent failed:", runErrorMessage);

    await notifyAll({
      telegramText:
        `Agent failed after retries.

Error:
${runErrorMessage}`,
      emailSubject: `${AGENT_NAME} failed`,
      emailText: `${AGENT_NAME} failed after retries.

Error:
${runErrorMessage}`,
      emailHtml: `<p>${AGENT_NAME} failed after retries.</p><pre>${runErrorMessage}</pre>`
    });
  } finally {
    await runHistory.finish({
      status: runStatus,
      note: runNote,
      sourceSummary: runSourceSummary,
      fetchedCount: runFetchedCount,
      salesforceCount: runSalesforceCount,
      newJobsCount: runNewJobsCount,
      pendingCount: runPendingCount,
      alertsSentCount: runAlertsSentCount,
      errorMessage: runErrorMessage,
      details: runDetails
    });
    await releaseRunLease();
  }
}

run();
