import { fetchNaukriJobs, getLastNaukriFetchReport } from "../jobs/fetchNaukri.js";
import { filterSalesforceJobs } from "../jobs/filterSalesforceJobs.js";
import { applyPrecisionFilters } from "../jobs/precisionFilters.js";
import { enrichJobsWithResumeMatch } from "../resume/matchResume.js";
import {
  annotateJobsWithResumeSupport,
  selectTopResumePackJobs
} from "../resume/generateTailoredResume.js";
import { generateJobHash, getNewJobs, saveJobs } from "../jobs/dedupe.js";
import {
  acknowledgePendingAlerts,
  enqueuePendingAlerts,
  getPendingAlertCount,
  peekPendingAlerts
} from "../db/pendingAlertQueue.js";
import {
  enqueueResumePackJobs,
  getResumePackQueueCount
} from "../db/resumePackQueue.js";
import {
  autoPromoteFollowUpJobs,
  registerApplicationJobs
} from "../db/applicationTracker.js";
import { acquireRunLease } from "../db/runLease.js";
import { startRunHistory } from "../db/runHistory.js";
import { markDailySummarySent, shouldSendDailySummary } from "../notify/dailySummary.js";
import { sendEmailMessage } from "../notify/email.js";
import { sendTelegramMessage } from "../notify/telegram.js";
import {
  ACTION_CARD_RENDERER_VERSION,
  buildActionCardDailySummaryMessages,
  buildActionCardHeartbeatMessages,
  buildActionCardHiringPostReviewMessages,
  buildActionCardJobAlertMessages
} from "../notify/actionCards.js";
import { getStateBackend } from "../db/stateStore.js";
import {
  buildCoverageHealth,
  buildOpportunitySummary,
  getOpportunitySelectionKey,
  getOpportunityConfidenceLabel,
  getOpportunityKindLabel,
  prepareOpportunities,
  selectHiringPostReviewJobs,
  selectOpportunitiesForAlerts,
  splitOpportunitiesForAlerts
} from "../jobs/opportunityPipeline.js";
import {
  buildCoverageAlertMessages,
  monitorCoverageHealth
} from "../jobs/coverageMonitor.js";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function isActionCardRendererEnabled() {
  return isTruthy(process.env.ACTION_CARD_RENDERER_ENABLED || "true");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function trimText(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getAgentName() {
  return String(process.env.AGENT_NAME || "Salesforce Job Radar Agent").trim();
}

function getRunSource() {
  return String(process.env.AGENT_RUN_SOURCE || "supabase-edge").trim();
}

function shouldQueueResumePacks() {
  return isTruthy(process.env.RESUME_PACK_QUEUE_ENABLED || "true");
}

function getAlertBatchLimit() {
  const raw = String(process.env.ALERT_MAX_ITEMS || "20").trim().toLowerCase();
  if (!raw || raw === "all") return Number.POSITIVE_INFINITY;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.floor(parsed);
}

function getMinMatchScore() {
  const parsed = Number(process.env.ALERT_MIN_MATCH_SCORE || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function inferJobSource(job) {
  const sourcePlatform = String(job?.source_platform || "").trim().toLowerCase();
  const sourceId = String(job?.source_job_id || "").trim().toLowerCase();
  const link = String(job?.apply_link || "").trim().toLowerCase();
  const postUrl = String(job?.post_url || "").trim().toLowerCase();

  if (sourcePlatform === "greenhouse" || sourceId.startsWith("greenhouse:")) {
    return "Greenhouse";
  }
  if (sourcePlatform === "lever" || sourceId.startsWith("lever:")) {
    return "Lever";
  }
  if (sourcePlatform === "ashby" || sourceId.startsWith("ashby:")) {
    return "Ashby";
  }
  if (
    sourcePlatform === "linkedin_posts" ||
    sourceId.startsWith("linkedin_post:") ||
    postUrl.includes("linkedin.com/posts") ||
    postUrl.includes("linkedin.com/feed/update")
  ) {
    return "LinkedIn Posts";
  }
  if (sourceId.startsWith("naukri:") || link.includes("naukri.com")) {
    return "Naukri";
  }
  if (sourceId.startsWith("linkedin:") || link.includes("linkedin.com")) {
    return "LinkedIn";
  }
  if (sourceId.startsWith("arbeitnow:") || link.includes("arbeitnow.com")) {
    return "Arbeitnow";
  }
  if (sourceId.startsWith("adzuna:") || link.includes("adzuna")) {
    return "Adzuna";
  }
  return "Other";
}

function buildSourceSummary(jobs) {
  const counts = new Map();

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const source = inferJobSource(job);
    counts.set(source, (counts.get(source) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([source, count]) => `${source}: ${count}`)
    .join(" | ");
}

function formatListValue(values, limit = 4, fallback = "None") {
  const list = Array.isArray(values)
    ? values.map(value => trimText(value, 120)).filter(Boolean)
    : [];
  if (list.length === 0) return fallback;
  return list.slice(0, limit).join(", ");
}

function getOpportunityActionUrl(job) {
  return String(
    job?.canonical_apply_url || job?.apply_link || job?.post_url || ""
  ).trim();
}

function getOpportunityActionLabel(job) {
  return String(job?.opportunity_kind || "listing").trim().toLowerCase() === "post"
    ? "Open post"
    : "Open job";
}

function getResumeSupportLabel(job) {
  const mode = String(job?.resume_support?.mode || "").trim().toLowerCase();
  if (mode === "full_pack_attached") return "Full tailored resume pack attached";
  if (mode === "full_pack_ready") return "Full tailored resume pack ready";
  if (mode === "preview_only") return "ATS preview included";
  return "";
}

function getResumePreview(job) {
  return job?.resume_support?.preview || null;
}

function getOpportunityEvidence(job) {
  return trimText(job?.source_evidence?.snippet || job?.description || "", 200);
}

function getPreviewList(job, key, fallback = []) {
  return Array.isArray(job?.resume_support?.preview?.[key])
    ? job.resume_support.preview[key].filter(Boolean)
    : fallback;
}

function getPreviewValue(job, key, fallback = "") {
  return trimText(job?.resume_support?.preview?.[key] || fallback, 160);
}

function getPostedLabel(job) {
  const value = String(job?.posted_at || "").trim();
  if (!value) return "Recent";

  const postedAt = new Date(value);
  if (Number.isNaN(postedAt.getTime())) return trimText(value, 40);

  const diffMs = Math.max(0, Date.now() - postedAt.getTime());
  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 1) return "Under 1h ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffMs / 86400000);
  return `${diffDays}d ago`;
}

function getOpportunityMetaLine(job) {
  const company = trimText(job?.company || "Unknown company", 60);
  const location = trimText(job?.location || "Location unknown", 60);
  return `${company} | ${location} | ${getPostedLabel(job)}`;
}

function buildTelegramOpportunityCard(job, index) {
  const actionUrl = getOpportunityActionUrl(job);
  const evidence = getOpportunityEvidence(job);
  const whyMatched = getPreviewList(job, "whyMatched");
  const missingKeywords = getPreviewList(job, "missingKeywords");
  const bulletSuggestions = getPreviewList(job, "bulletSuggestions");
  const atsSummary = getPreviewValue(job, "atsSummary");
  const headline = getPreviewValue(job, "headline");
  const lines = [
    `<b>${index}. ${escapeHtml(job?.title || "Unknown title")}</b>`,
    `${escapeHtml(getOpportunityMetaLine(job))}`,
    `<b>${escapeHtml(getOpportunityKindLabel(job))}</b> | ${escapeHtml(getOpportunityConfidenceLabel(job))} | ${escapeHtml(inferJobSource(job))}`,
    `Match: <b>${escapeHtml(String(job?.match_score ?? "n/a"))}</b>${atsSummary ? ` | ${escapeHtml(atsSummary)}` : ""}`
  ];

  const resumeSupport = getResumeSupportLabel(job);
  if (resumeSupport) lines.push(`Tailored support: ${escapeHtml(resumeSupport)}`);
  if (headline) lines.push(`Resume headline: ${escapeHtml(headline)}`);
  if (getPreviewList(job, "atsKeywords").length > 0) {
    lines.push(`ATS keywords: ${escapeHtml(formatListValue(getPreviewList(job, "atsKeywords"), 5))}`);
  }
  if (whyMatched.length > 0) {
    lines.push(`Why matched: ${escapeHtml(formatListValue(whyMatched, 2))}`);
  }
  if (missingKeywords.length > 0) {
    lines.push(`Missing: ${escapeHtml(formatListValue(missingKeywords, 4))}`);
  }
  if (bulletSuggestions.length > 0) {
    lines.push(`Resume bullets: ${escapeHtml(formatListValue(bulletSuggestions, 2))}`);
  }
  if (getPreviewValue(job, "draftSubject")) {
    lines.push(`Draft subject: ${escapeHtml(getPreviewValue(job, "draftSubject"))}`);
  }
  if (evidence) lines.push(`Evidence: ${escapeHtml(evidence)}`);
  lines.push(actionUrl ? `<a href="${escapeHtml(actionUrl)}">${escapeHtml(getOpportunityActionLabel(job))}</a>` : "Link unavailable");
  return lines.join("\n");
}

function buildEmailTextOpportunityCard(job, index) {
  const actionUrl = getOpportunityActionUrl(job);
  const evidence = getOpportunityEvidence(job);
  const whyMatched = getPreviewList(job, "whyMatched");
  const missingKeywords = getPreviewList(job, "missingKeywords");
  const bulletSuggestions = getPreviewList(job, "bulletSuggestions");
  const lines = [
    `${index}. ${trimText(job?.title || "Unknown title", 140)}`,
    `${getOpportunityMetaLine(job)}`,
    `Type: ${getOpportunityKindLabel(job)} | Confidence: ${getOpportunityConfidenceLabel(job)} | Source: ${inferJobSource(job)}`,
    `Match: ${String(job?.match_score ?? "n/a")}${getPreviewValue(job, "atsSummary") ? ` | ${getPreviewValue(job, "atsSummary")}` : ""}`
  ];
  const resumeSupport = getResumeSupportLabel(job);
  if (resumeSupport) lines.push(`Tailored support: ${resumeSupport}`);
  if (getPreviewValue(job, "headline")) {
    lines.push(`Resume headline: ${getPreviewValue(job, "headline")}`);
  }
  if (getPreviewList(job, "atsKeywords").length > 0) {
    lines.push(`ATS keywords: ${formatListValue(getPreviewList(job, "atsKeywords"), 5)}`);
  }
  if (whyMatched.length > 0) {
    lines.push(`Why matched: ${formatListValue(whyMatched, 2)}`);
  }
  if (missingKeywords.length > 0) {
    lines.push(`Missing: ${formatListValue(missingKeywords, 4)}`);
  }
  if (bulletSuggestions.length > 0) {
    lines.push(`Resume bullets: ${formatListValue(bulletSuggestions, 2)}`);
  }
  if (getPreviewValue(job, "draftSubject")) {
    lines.push(`Draft subject: ${getPreviewValue(job, "draftSubject")}`);
  }
  if (evidence) lines.push(`Evidence: ${evidence}`);
  lines.push(`${getOpportunityActionLabel(job)}: ${actionUrl || "Link unavailable"}`);
  return lines.join("\n");
}

function buildEmailHtmlOpportunityCard(job, index) {
  const actionUrl = getOpportunityActionUrl(job);
  const evidence = getOpportunityEvidence(job);
  const resumeSupport = getResumeSupportLabel(job);
  const whyMatched = getPreviewList(job, "whyMatched");
  const missingKeywords = getPreviewList(job, "missingKeywords");
  const bulletSuggestions = getPreviewList(job, "bulletSuggestions");
  const chips = [
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:800;">${escapeHtml(getOpportunityKindLabel(job))}</span>`,
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:800;">${escapeHtml(getOpportunityConfidenceLabel(job))}</span>`,
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#f8fafc;color:#334155;font-size:12px;font-weight:800;">${escapeHtml(inferJobSource(job))}</span>`,
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:800;">Match ${escapeHtml(String(job?.match_score ?? "n/a"))}</span>`
  ];
  if (getPreviewValue(job, "atsSummary")) {
    chips.push(`<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:800;">${escapeHtml(getPreviewValue(job, "atsSummary"))}</span>`);
  }
  return (
    `<div style="margin:0 0 18px 0;padding:22px;border:1px solid #dbe3ea;border-radius:18px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);box-shadow:0 8px 18px rgba(15,23,42,0.05);">` +
    `<div style="font-size:17px;font-weight:900;color:#0f172a;margin-bottom:8px;">${escapeHtml(index)}. ${escapeHtml(job?.title || "Unknown title")}</div>` +
    `<div style="font-size:14px;color:#475569;margin-bottom:12px;">${escapeHtml(getOpportunityMetaLine(job))}</div>` +
    `<div style="margin-bottom:10px;">${chips.join("")}</div>` +
    `${resumeSupport ? `<div style="margin:6px 0;"><strong>Tailored support:</strong> ${escapeHtml(resumeSupport)}</div>` : ""}` +
    `${getPreviewValue(job, "headline") ? `<div style="margin:6px 0;"><strong>Resume headline:</strong> ${escapeHtml(getPreviewValue(job, "headline"))}</div>` : ""}` +
    `${getPreviewList(job, "atsKeywords").length ? `<div style="margin:6px 0;"><strong>ATS keywords:</strong> ${escapeHtml(formatListValue(getPreviewList(job, "atsKeywords"), 5))}</div>` : ""}` +
    `${whyMatched.length ? `<div style="margin:6px 0;"><strong>Why matched:</strong> ${escapeHtml(formatListValue(whyMatched, 2))}</div>` : ""}` +
    `${missingKeywords.length ? `<div style="margin:6px 0;"><strong>Missing:</strong> ${escapeHtml(formatListValue(missingKeywords, 4))}</div>` : ""}` +
    `${bulletSuggestions.length ? `<div style="margin:6px 0;"><strong>Resume bullets:</strong> ${escapeHtml(formatListValue(bulletSuggestions, 2))}</div>` : ""}` +
    `${getPreviewValue(job, "draftSubject") ? `<div style="margin:6px 0;"><strong>Draft subject:</strong> ${escapeHtml(getPreviewValue(job, "draftSubject"))}</div>` : ""}` +
    `${evidence ? `<div style="margin:6px 0;"><strong>Evidence:</strong> ${escapeHtml(evidence)}</div>` : ""}` +
    `${actionUrl
      ? `<div style="margin-top:14px;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 16px;border-radius:12px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:800;">${escapeHtml(getOpportunityActionLabel(job))}</a></div>`
      : `<div style="margin-top:12px;color:#6b7280;">Link unavailable</div>`}` +
    `</div>`
  );
}

function buildOpportunitySectionsFromDefinitions(definitions) {
  const sections = (Array.isArray(definitions) ? definitions : [])
    .filter(section => Array.isArray(section.jobs) && section.jobs.length > 0);

  return {
    telegram: sections.map(section =>
      `<b>${escapeHtml(section.title)} (${section.jobs.length})</b>

` +
      `${section.description ? `<i>${escapeHtml(section.description)}</i>\n\n` : ""}` +
      section.jobs.map((job, index) => buildTelegramOpportunityCard(job, index + 1)).join("\n\n")
    ).join("\n\n"),
    emailText: sections.map(section =>
      `${section.title} (${section.jobs.length})${section.description ? `\n${section.description}` : ""}

` +
      section.jobs.map((job, index) => buildEmailTextOpportunityCard(job, index + 1)).join("\n\n")
    ).join("\n\n"),
    emailHtml: sections.map(section =>
      `<div style="margin-top:22px;"><h3 style="margin:0 0 12px 0;color:#0f172a;">${escapeHtml(section.title)} (${section.jobs.length})</h3>${section.description ? `<div style="margin:0 0 12px 0;color:#475569;font-size:14px;line-height:1.6;">${escapeHtml(section.description)}</div>` : ""}${section.jobs.map((job, index) => buildEmailHtmlOpportunityCard(job, index + 1)).join("")}</div>`
    ).join("")
  };
}

function buildOpportunitySections(jobs, { reviewPostJobs = [] } = {}) {
  const split = splitOpportunitiesForAlerts(jobs);
  return buildOpportunitySectionsFromDefinitions([
    { title: "High-confidence listings", jobs: split.highListings },
    { title: "High-confidence hiring posts", jobs: split.highPosts },
    { title: "Medium-confidence review queue", jobs: split.mediumQueue },
    {
      title: "Hiring post review",
      description:
        "Strong public hiring posts that stayed outside the instant ATS path. Review manually before applying.",
      jobs: Array.isArray(reviewPostJobs) ? reviewPostJobs : []
    }
  ]);
}

function buildJobAlertMessages(
  agentName,
  jobs,
  sourceSummary,
  { reviewPostJobs = [], topPackJobs = [], extraSections = {} } = {}
) {
  if (isActionCardRendererEnabled()) {
    return buildActionCardJobAlertMessages({
      agentName,
      jobs,
      sourceSummary,
      reviewPostJobs,
      topPackJobs,
      extraSections
    });
  }

  const primaryJobs = Array.isArray(jobs) ? jobs : [];
  const reviewJobs = Array.isArray(reviewPostJobs) ? reviewPostJobs : [];
  const summary = buildOpportunitySummary([...primaryJobs, ...reviewJobs]);
  const sections = buildOpportunitySections(primaryJobs, { reviewPostJobs: reviewJobs });
  const topRole = trimText(primaryJobs[0]?.title || reviewJobs[0]?.title || "Opportunity update", 70);
  const reviewLine = reviewJobs.length > 0
    ? `Hiring post review leads: ${reviewJobs.length}`
    : "";
  const subject = reviewJobs.length > 0
    ? `${agentName}: ${primaryJobs.length} opportunities + ${reviewJobs.length} post review lead(s) | ${topRole}`
    : `${agentName}: ${primaryJobs.length} opportunities | ${topRole}`;
  const text = [
    `${agentName}` ,
    "",
    `${primaryJobs.length} opportunity(ies) ready to review`,
    sourceSummary ? `Source mix: ${sourceSummary}` : "",
    `Listings: ${summary.by_kind?.listing || 0} | Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}` ,
    reviewLine,
    "",
    sections.emailText
  ].filter(Boolean).join("\n");
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:radial-gradient(circle at top,#e0f2fe 0%,#f8fafc 42%,#eef2ff 100%);font-family:Segoe UI,Arial,sans-serif;color:#111827;">` +
    `<div style="max-width:780px;margin:0 auto;">` +
    `<div style="padding:28px;border-radius:24px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 45%,#1d4ed8 100%);color:#ffffff;box-shadow:0 18px 34px rgba(15,23,42,0.22);">` +
    `<div style="font-size:30px;font-weight:900;margin-bottom:8px;letter-spacing:-0.02em;">${escapeHtml(agentName)}</div>` +
    `<div style="font-size:17px;line-height:1.7;">${primaryJobs.length} opportunity(ies) ready to review</div>` +
    `${sourceSummary ? `<div style="margin-top:8px;font-size:14px;opacity:0.9;">Source mix: ${escapeHtml(sourceSummary)}</div>` : ""}` +
    `<div style="margin-top:14px;font-size:14px;opacity:0.95;">Listings: ${summary.by_kind?.listing || 0} | Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}</div>` +
    `${reviewLine ? `<div style="margin-top:8px;font-size:14px;opacity:0.95;">${escapeHtml(reviewLine)}</div>` : ""}` +
    `</div>` +
    sections.emailHtml +
    `</div></body></html>`;
  const telegram = [
    `<b>${escapeHtml(agentName)}</b>`,
    `${primaryJobs.length} opportunity(ies) ready to review`,
    sourceSummary ? `${escapeHtml(sourceSummary)}` : "",
    `Listings: ${summary.by_kind?.listing || 0} | Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}` ,
    reviewLine ? escapeHtml(reviewLine) : "",
    "",
    sections.telegram
  ].filter(Boolean).join("\n");
  return { subject, text, html, telegram };
}

function buildHiringPostReviewMessages(agentName, jobs, sourceSummary, { extraSections = {} } = {}) {
  if (isActionCardRendererEnabled()) {
    return buildActionCardHiringPostReviewMessages({
      agentName,
      jobs,
      sourceSummary,
      extraSections
    });
  }

  const reviewJobs = Array.isArray(jobs) ? jobs : [];
  const summary = buildOpportunitySummary(reviewJobs);
  const sections = buildOpportunitySections([], { reviewPostJobs: reviewJobs });
  const subject = `${agentName}: ${reviewJobs.length} hiring post review lead(s)`;
  const intro = "Strong public hiring posts surfaced below the instant ATS threshold. Review them manually so we do not miss recruiter-led opportunities.";
  const text = [
    `${agentName}`,
    "",
    `${reviewJobs.length} hiring post review lead(s)`,
    intro,
    sourceSummary ? `Source mix: ${sourceSummary}` : "",
    `Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}`,
    "",
    sections.emailText
  ].filter(Boolean).join("\n");
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:radial-gradient(circle at top,#ecfeff 0%,#f8fafc 48%,#fef3c7 100%);font-family:Segoe UI,Arial,sans-serif;color:#111827;">` +
    `<div style="max-width:780px;margin:0 auto;">` +
    `<div style="padding:28px;border-radius:24px;background:linear-gradient(135deg,#0f172a 0%,#14532d 45%,#0f766e 100%);color:#ffffff;box-shadow:0 18px 34px rgba(15,23,42,0.22);">` +
    `<div style="font-size:30px;font-weight:900;margin-bottom:8px;letter-spacing:-0.02em;">${escapeHtml(agentName)}</div>` +
    `<div style="font-size:17px;line-height:1.7;">${reviewJobs.length} hiring post review lead(s)</div>` +
    `<div style="margin-top:8px;font-size:14px;opacity:0.95;">${escapeHtml(intro)}</div>` +
    `${sourceSummary ? `<div style="margin-top:8px;font-size:14px;opacity:0.9;">Source mix: ${escapeHtml(sourceSummary)}</div>` : ""}` +
    `</div>` +
    sections.emailHtml +
    `</div></body></html>`;
  const telegram = [
    `<b>${escapeHtml(agentName)}</b>`,
    `${reviewJobs.length} hiring post review lead(s)`,
    escapeHtml(intro),
    sourceSummary ? `${escapeHtml(sourceSummary)}` : "",
    "",
    sections.telegram
  ].filter(Boolean).join("\n");
  return { subject, text, html, telegram };
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

function buildHeartbeatMessages({
  agentName,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary,
  note,
  classificationSummary = null
}) {
  const timeLabel = getNotificationTimeLabel();
  if (isActionCardRendererEnabled()) {
    const actionCard = buildActionCardHeartbeatMessages({
      agentName,
      timeLabel,
      fetchedCount,
      salesforceCount,
      newCount,
      pendingCount,
      sourceSummary,
      note,
      classificationSummary
    });
    return {
      telegramText: actionCard.telegram,
      emailSubject: actionCard.subject,
      emailText: actionCard.text,
      emailHtml: actionCard.html
    };
  }

  const listingCount = Number(classificationSummary?.by_kind?.listing || 0);
  const postCount = Number(classificationSummary?.by_kind?.post || 0);
  const reviewCount = Number(classificationSummary?.by_confidence?.medium || 0);
  const telegramText =
    `<b>${escapeHtml(agentName)} heartbeat</b>\n\n` +
    `Time: <b>${escapeHtml(timeLabel)}</b>\n` +
    `Fetched: <b>${fetchedCount}</b>\n` +
    `Salesforce matched: <b>${salesforceCount}</b>\n` +
    `${sourceSummary ? `Source mix: ${escapeHtml(sourceSummary)}\n` : ""}` +
    `Listings: <b>${listingCount}</b> | Posts: <b>${postCount}</b> | Review: <b>${reviewCount}</b>\n` +
    `New this run: <b>${newCount}</b>\n` +
    `Pending queue: <b>${pendingCount}</b>\n` +
    `Note: ${escapeHtml(note)}`;

  const emailSubject = `${agentName}: heartbeat (${timeLabel})`;
  const emailText =
    `${agentName} heartbeat\n\n` +
    `Time: ${timeLabel}\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceCount}\n` +
    `${sourceSummary ? `Source mix: ${sourceSummary}\n` : ""}` +
    `Listings: ${listingCount} | Posts: ${postCount} | Review: ${reviewCount}\n` +
    `New this run: ${newCount}\n` +
    `Pending queue: ${pendingCount}\n` +
    `Note: ${note}`;
  const emailHtml =
    `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">` +
    `<h2>${escapeHtml(agentName)} heartbeat</h2>` +
    `<p>Time: <strong>${escapeHtml(timeLabel)}</strong></p>` +
    `<p>Fetched: <strong>${fetchedCount}</strong></p>` +
    `<p>Salesforce matched: <strong>${salesforceCount}</strong></p>` +
    `${sourceSummary ? `<p>Source mix: ${escapeHtml(sourceSummary)}</p>` : ""}` +
    `<p>Listings: <strong>${listingCount}</strong> | Posts: <strong>${postCount}</strong> | Review: <strong>${reviewCount}</strong></p>` +
    `<p>New this run: <strong>${newCount}</strong></p>` +
    `<p>Pending queue: <strong>${pendingCount}</strong></p>` +
    `<p>Note: ${escapeHtml(note)}</p>` +
    `</body></html>`;

  return { telegramText, emailSubject, emailText, emailHtml };
}

function buildDailySummaryMessages({
  agentName,
  dateKey,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary,
  classificationSummary = null,
  newJobs = []
}) {
  if (isActionCardRendererEnabled()) {
    const actionCard = buildActionCardDailySummaryMessages({
      agentName,
      dateKey,
      fetchedCount,
      salesforceCount,
      newCount,
      pendingCount,
      sourceSummary,
      classificationSummary,
      newJobs
    });
    return {
      telegramText: actionCard.telegram,
      emailSubject: actionCard.subject,
      emailText: actionCard.text,
      emailHtml: actionCard.html
    };
  }

  const listingCount = Number(classificationSummary?.by_kind?.listing || 0);
  const postCount = Number(classificationSummary?.by_kind?.post || 0);
  const reviewCount = Number(classificationSummary?.by_confidence?.medium || 0);
  const sections = buildOpportunitySections(newJobs);
  const telegramText =
    `<b>${escapeHtml(agentName)} daily summary</b>\n\n` +
    `Date: <b>${escapeHtml(dateKey)}</b>\n` +
    `Fetched: <b>${fetchedCount}</b>\n` +
    `Salesforce matched: <b>${salesforceCount}</b>\n` +
    `Listings: <b>${listingCount}</b> | Posts: <b>${postCount}</b> | Review: <b>${reviewCount}</b>\n` +
    `New jobs: <b>${newCount}</b>\n` +
    `Pending queue: <b>${pendingCount}</b>\n` +
    `${sourceSummary ? `Source mix: ${escapeHtml(sourceSummary)}` : ""}` +
    `${sections.telegram ? `\n\n${sections.telegram}` : ""}`;

  const emailSubject = `${agentName} daily summary (${dateKey})`;
  const emailText =
    `${agentName} daily summary\n\n` +
    `Date: ${dateKey}\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceCount}\n` +
    `Listings: ${listingCount} | Posts: ${postCount} | Review: ${reviewCount}\n` +
    `New jobs: ${newCount}\n` +
    `Pending queue: ${pendingCount}\n` +
    `${sourceSummary ? `Source mix: ${sourceSummary}` : ""}` +
    `${sections.emailText ? `\n\n${sections.emailText}` : ""}`;
  const emailHtml =
    `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">` +
    `<h2>${escapeHtml(agentName)} daily summary</h2>` +
    `<p>Date: <strong>${escapeHtml(dateKey)}</strong></p>` +
    `<p>Fetched: <strong>${fetchedCount}</strong></p>` +
    `<p>Salesforce matched: <strong>${salesforceCount}</strong></p>` +
    `<p>Listings: <strong>${listingCount}</strong> | Posts: <strong>${postCount}</strong> | Review: <strong>${reviewCount}</strong></p>` +
    `<p>New jobs: <strong>${newCount}</strong></p>` +
    `<p>Pending queue: <strong>${pendingCount}</strong></p>` +
    `${sourceSummary ? `<p>Source mix: ${escapeHtml(sourceSummary)}</p>` : ""}` +
    `${sections.emailHtml || ""}` +
    `</body></html>`;

  return { telegramText, emailSubject, emailText, emailHtml };
}

async function notifyAll({ telegramText, emailSubject, emailText, emailHtml }) {
  const [telegramResult, emailResult] = await Promise.allSettled([
    sendTelegramMessage(telegramText),
    sendEmailMessage({
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
      attachments: []
    })
  ]);

  const telegramOk =
    telegramResult.status === "fulfilled" && telegramResult.value === true;
  const emailOk =
    emailResult.status === "fulfilled" && emailResult.value === true;
  const telegramError = telegramOk
    ? ""
    : trimText(
      telegramResult.status === "rejected"
        ? telegramResult.reason?.message || telegramResult.reason || "unknown telegram error"
        : "telegram returned false",
      260
    );
  const emailError = emailOk
    ? ""
    : trimText(
      emailResult.status === "rejected"
        ? emailResult.reason?.message || emailResult.reason || "unknown email error"
        : "email returned false",
      260
    );

  return {
    telegramOk,
    emailOk,
    anyOk: telegramOk || emailOk,
    telegramError,
    emailError
  };
}

function recordNotificationAttempt(runDetails, kind, notifyResult, extra = {}) {
  if (!runDetails || typeof runDetails !== "object" || !notifyResult) {
    return;
  }

  const attempts = Array.isArray(runDetails.notificationAttempts)
    ? runDetails.notificationAttempts.slice(-9)
    : [];
  const entry = {
    kind: trimText(kind, 80),
    at: new Date().toISOString(),
    telegramOk: notifyResult.telegramOk === true,
    emailOk: notifyResult.emailOk === true,
    anyOk: notifyResult.anyOk === true,
    telegramError: trimText(notifyResult.telegramError, 260),
    emailError: trimText(notifyResult.emailError, 260)
  };

  for (const [key, value] of Object.entries(extra || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    entry[key] = typeof value === "string"
      ? trimText(value, 180)
      : value;
  }

  attempts.push(entry);
  runDetails.notificationAttempts = attempts;
  runDetails.lastNotification = entry;
}

async function sendHiringPostReviewDigestCloud(agentName, runDetails, reviewJobs) {
  const reviewList = Array.isArray(reviewJobs) ? reviewJobs : [];
  if (reviewList.length === 0) {
    return {
      notified: false,
      reviewDigestCount: 0
    };
  }

  const reviewedJobs = await annotateJobsWithResumeSupport(reviewList, {
    fullPackJobs: [],
    attachmentsEnabled: false
  });
  const sourceSummary = buildSourceSummary(reviewedJobs);
  const messagePayload = buildHiringPostReviewMessages(
    agentName,
    reviewedJobs,
    sourceSummary
  );
  const notifyResult = await notifyAll({
    telegramText: messagePayload.telegram,
    emailSubject: messagePayload.subject,
    emailText: messagePayload.text,
    emailHtml: messagePayload.html
  });
  recordNotificationAttempt(runDetails, "post_review_digest", notifyResult, {
    subject: messagePayload.subject,
    reviewDigestCount: reviewedJobs.length
  });

  return {
    notified: notifyResult.anyOk,
    notifyResult,
    reviewDigestCount: reviewedJobs.length
  };
}

async function processPendingAlertsCloud(agentName, runDetails, options = {}) {
  const reviewDigestJobs = Array.isArray(options.reviewDigestJobs)
    ? options.reviewDigestJobs
    : [];
  const pendingCount = await getPendingAlertCount();
  if (pendingCount === 0 && reviewDigestJobs.length === 0) {
    return {
      pendingCount: 0,
      alertedCount: 0,
      notified: false
    };
  }

  if (pendingCount === 0) {
    const reviewResult = await sendHiringPostReviewDigestCloud(
      agentName,
      runDetails,
      reviewDigestJobs
    );
    return {
      pendingCount: 0,
      alertedCount: 0,
      notified: reviewResult.notified,
      reviewDigestCount: reviewResult.reviewDigestCount
    };
  }

  const queueSnapshot = await peekPendingAlerts(Math.min(pendingCount, 200));
  const minMatchScore = getMinMatchScore();
  const eligibleQueue = queueSnapshot.filter(job => {
    const score = Number(job?.match_score || 0);
    return score >= minMatchScore;
  });

  if (eligibleQueue.length === 0) {
    if (reviewDigestJobs.length > 0) {
      const reviewResult = await sendHiringPostReviewDigestCloud(
        agentName,
        runDetails,
        reviewDigestJobs
      );
      return {
        pendingCount,
        alertedCount: 0,
        notified: reviewResult.notified,
        reviewDigestCount: reviewResult.reviewDigestCount
      };
    }

    return {
      pendingCount,
      alertedCount: 0,
      notified: false
    };
  }

  const suppressedLow = eligibleQueue.filter(
    job => String(job?.alert_bucket || "").toLowerCase() === "suppress"
  );
  if (suppressedLow.length > 0) {
    await acknowledgePendingAlerts(suppressedLow.map(job => job.job_hash));
  }

  const actionableQueue = eligibleQueue.filter(
    job => String(job?.alert_bucket || "").toLowerCase() !== "suppress"
  );
  if (actionableQueue.length === 0) {
    if (reviewDigestJobs.length > 0) {
      const reviewResult = await sendHiringPostReviewDigestCloud(
        agentName,
        runDetails,
        reviewDigestJobs
      );
      return {
        pendingCount: await getPendingAlertCount(),
        alertedCount: 0,
        notified: reviewResult.notified,
        reviewDigestCount: reviewResult.reviewDigestCount
      };
    }

    return {
      pendingCount: await getPendingAlertCount(),
      alertedCount: 0,
      notified: false
    };
  }

  const maxItems = getAlertBatchLimit();
  const selection = selectOpportunitiesForAlerts(actionableQueue, {
    maxItems,
    mediumLimit: Math.max(
      0,
      Number(process.env.ALERT_MEDIUM_DIGEST_MAX_ITEMS || 4)
    )
  });
  const split = selection.split;
  const selectedHigh = selection.selectedHigh;
  const mediumQueue = selection.selectedMedium;
  const jobsToAlert = selection.jobsToAlert;
  if (jobsToAlert.length === 0) {
    if (reviewDigestJobs.length > 0) {
      const reviewResult = await sendHiringPostReviewDigestCloud(
        agentName,
        runDetails,
        reviewDigestJobs
      );
      return {
        pendingCount: await getPendingAlertCount(),
        alertedCount: 0,
        notified: reviewResult.notified,
        reviewDigestCount: reviewResult.reviewDigestCount
      };
    }

    return {
      pendingCount: await getPendingAlertCount(),
      alertedCount: 0,
      notified: false
    };
  }

  const alertKeys = new Set(
    jobsToAlert.map(job => getOpportunitySelectionKey(job))
  );
  const reviewKeys = new Set(
    reviewDigestJobs.map(job => getOpportunitySelectionKey(job))
  );
  const jobsForNotification = [
    ...jobsToAlert,
    ...reviewDigestJobs.filter(job => {
      const key = getOpportunitySelectionKey(job);
      return key && !alertKeys.has(key);
    })
  ];
  const resumePackJobs = selectTopResumePackJobs(selectedHigh);
  const jobsWithResumeSupport = await annotateJobsWithResumeSupport(jobsForNotification, {
    fullPackJobs: resumePackJobs,
    attachmentsEnabled: false
  });
  const resumePackKeys = new Set(
    resumePackJobs.map(job => getOpportunitySelectionKey(job))
  );
  const alertedJobsWithResumeSupport = jobsWithResumeSupport.filter(job =>
    alertKeys.has(getOpportunitySelectionKey(job))
  );
  const reviewJobsWithResumeSupport = jobsWithResumeSupport.filter(job =>
    reviewKeys.has(getOpportunitySelectionKey(job)) &&
    !alertKeys.has(getOpportunitySelectionKey(job))
  );
  const topPackJobsWithResumeSupport = jobsWithResumeSupport.filter(job =>
    resumePackKeys.has(getOpportunitySelectionKey(job))
  );
  if (runDetails && typeof runDetails === "object") {
    runDetails.applyPackJobs = topPackJobsWithResumeSupport.map(job => ({
      key: getOpportunitySelectionKey(job),
      title: trimText(job?.title, 120),
      company: trimText(job?.company, 120),
      kind: String(job?.opportunity_kind || ""),
      matchScore: Number(job?.match_score || 0)
    }));
  }
  const sourceSummary = buildSourceSummary(jobsWithResumeSupport);
  const messagePayload = buildJobAlertMessages(
    agentName,
    alertedJobsWithResumeSupport,
    sourceSummary,
    {
      reviewPostJobs: reviewJobsWithResumeSupport,
      topPackJobs: topPackJobsWithResumeSupport
    }
  );
  const notifyResult = await notifyAll({
    telegramText: messagePayload.telegram,
    emailSubject: messagePayload.subject,
    emailText: messagePayload.text,
    emailHtml: messagePayload.html
  });
  recordNotificationAttempt(runDetails, "job_alert", notifyResult, {
    subject: messagePayload.subject,
    pendingCount,
    alertedCount: jobsToAlert.length,
    highListings: split.highListings.length,
    highPosts: selection.effectiveHighPosts.length,
    mediumReviewCount: mediumQueue.length,
    reviewDigestCount: reviewJobsWithResumeSupport.length,
    topPackCount: topPackJobsWithResumeSupport.length,
    suppressedByPolicyCount: selection.suppressedByPolicy.length,
    postAlertPolicy: selection.postPolicy,
    rendererVersion: runDetails?.rendererVersion || ""
  });

  if (!notifyResult.anyOk) {
    return {
      pendingCount,
      alertedCount: 0,
      notified: false,
      notifyResult
    };
  }

  await acknowledgePendingAlerts(jobsToAlert.map(job => job.job_hash));
  await registerApplicationJobs(alertedJobsWithResumeSupport, {
    event: "alerted",
    defaultStatus: "new"
  });

  let queuedResumePacks = 0;
  if (shouldQueueResumePacks() && topPackJobsWithResumeSupport.length > 0) {
    queuedResumePacks = await enqueueResumePackJobs(topPackJobsWithResumeSupport, {
      source: runDetails?.runSource || getRunSource(),
      reason: "supabase_primary_followup"
    });
    if (queuedResumePacks > 0) {
      console.log(`?? Queued ${queuedResumePacks} tailored resume pack follow-up job(s)`);
    }
  }
  if (runDetails && typeof runDetails === "object") {
    runDetails.applyPackQueuedCount = queuedResumePacks;
    runDetails.resumePackQueueCount = await getResumePackQueueCount();
  }

  return {
    pendingCount,
    alertedCount: jobsToAlert.length,
    notified: true,
    reviewDigestCount: reviewJobsWithResumeSupport.length,
    queuedResumePacks,
    notifyResult
  };
}

async function maybeSendDailySummaryCloud({
  runDetails,
  agentName,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary,
  classificationSummary = null,
  newJobs = []
}) {
  const check = await shouldSendDailySummary();
  if (!check.shouldSend) {
    return false;
  }

  const messages = buildDailySummaryMessages({
    agentName,
    dateKey: check.dateKey,
    fetchedCount,
    salesforceCount,
    newCount,
    pendingCount,
    sourceSummary,
    classificationSummary,
    newJobs
  });

  const result = await notifyAll(messages);
  recordNotificationAttempt(runDetails, "daily_summary", result, {
    subject: messages.emailSubject,
    dateKey: check.dateKey
  });
  if (result.anyOk) {
    await markDailySummarySent(check.dateKey);
    return {
      attempted: true,
      sent: true,
      notifyResult: result
    };
  }

  return {
    attempted: true,
    sent: false,
    notifyResult: result
  };
}

export async function runSupabaseCloudAgent() {
  const agentName = getAgentName();
  const runSource = getRunSource();
  const notifyEveryRun = isTruthy(process.env.NOTIFY_EVERY_RUN);

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
    agentName,
    runSource,
    runtimeTarget: "supabase_edge",
    stateBackend: getStateBackend(),
    rendererVersion: isActionCardRendererEnabled()
      ? ACTION_CARD_RENDERER_VERSION
      : "legacy"
  };
  const runHistory = await startRunHistory({
    source: runSource,
    note: agentName,
    details: runDetails
  });

  try {
    const lease = await acquireRunLease({
      source: runSource,
      note: agentName
    });
    if (!lease.acquired) {
      runStatus = "skipped";
      runNote = `Skipped by shared lease: ${lease.reason}`;
      return {
        ok: true,
        status: runStatus,
        note: runNote
      };
    }

    releaseRunLease = lease.release || (async () => {});

    await autoPromoteFollowUpJobs();

    const jobs = await fetchNaukriJobs();
    const fetchReport = getLastNaukriFetchReport();
    runFetchedCount = Array.isArray(jobs) ? jobs.length : 0;
    runDetails.fetchReport = fetchReport || null;
    runDetails.classificationSummary = buildOpportunitySummary([], {
      rawCount: runFetchedCount,
      mergedDuplicateCount: 0
    });
    runDetails.dedupeSummary = {
      rawCount: runFetchedCount,
      mergedCount: 0,
      mergedDuplicateCount: 0
    };

    const salesforceJobsRaw = filterSalesforceJobs(jobs || []);
    const { jobs: precisionJobs, report: precisionReport } =
      applyPrecisionFilters(salesforceJobsRaw);
    const preparedOpportunities = prepareOpportunities(precisionJobs);
    const salesforceJobs = preparedOpportunities.jobs;
    runSalesforceCount = salesforceJobs.length;
    runSourceSummary = buildSourceSummary(salesforceJobs);
    runDetails.precisionReport = precisionReport;
    runDetails.classificationSummary = preparedOpportunities.summary;
    runDetails.dedupeSummary = {
      rawCount: preparedOpportunities.summary.raw_count,
      mergedCount: preparedOpportunities.summary.merged_count,
      mergedDuplicateCount: preparedOpportunities.summary.merged_duplicate_count
    };
    runDetails.dedupeSources = preparedOpportunities.summary.by_source || {};
    runDetails.providerCoverage = buildCoverageHealth(
      fetchReport,
      preparedOpportunities.summary
    );
    runDetails.atsCoverage = runDetails.providerCoverage?.ats_coverage || null;
    const coverageMonitor = await monitorCoverageHealth(runDetails.providerCoverage, {
      runSource
    });
    runDetails.coverageAlerts = coverageMonitor.alerts;
    runDetails.sourceSummary = runSourceSummary;

    const newJobs = await getNewJobs(salesforceJobs);
    runNewJobsCount = newJobs.length;
    runDetails.newOpportunitySummary = buildOpportunitySummary(newJobs, {
      rawCount: newJobs.length,
      mergedDuplicateCount: 0
    });

    let scoredNewJobs = [];
    let reviewDigestSelection = {
      selected: [],
      selectedCount: 0,
      candidateCount: 0,
      summary: buildOpportunitySummary([])
    };
    if (newJobs.length > 0) {
      scoredNewJobs = await enrichJobsWithResumeMatch(newJobs);
      await saveJobs(scoredNewJobs);
      await registerApplicationJobs(scoredNewJobs, {
        event: "discovered",
        defaultStatus: "new"
      });

      const minMatchScore = getMinMatchScore();
      const pendingPayload = scoredNewJobs
        .filter(job => Number(job?.match_score || 0) >= minMatchScore)
        .map(job => ({
          ...job,
          job_hash: generateJobHash(job)
        }));
      runDetails.alertableOpportunitySummary = buildOpportunitySummary(pendingPayload, {
        rawCount: scoredNewJobs.length,
        mergedDuplicateCount: 0
      });
      reviewDigestSelection = selectHiringPostReviewJobs(scoredNewJobs, {
        excludeKeys: pendingPayload.map(job => getOpportunitySelectionKey(job))
      });
      runDetails.postReviewDigestSummary = reviewDigestSelection.summary;

      await enqueuePendingAlerts(pendingPayload);
    }

    if (Array.isArray(runDetails.coverageAlerts) && runDetails.coverageAlerts.length > 0) {
      const coverageMessages = buildCoverageAlertMessages({
        agentName,
        runSource,
        providerCoverage: runDetails.providerCoverage,
        alerts: runDetails.coverageAlerts
      });
      const coverageResult = await notifyAll(coverageMessages);
      recordNotificationAttempt(runDetails, "coverage_alert", coverageResult, {
        subject: coverageMessages.emailSubject,
        alertCount: runDetails.coverageAlerts.length
      });
    }

    const pendingResult = await processPendingAlertsCloud(agentName, runDetails, {
      reviewDigestJobs: reviewDigestSelection.selected
    });
    runPendingCount = pendingResult.pendingCount;
    runAlertsSentCount = pendingResult.alertedCount;

    if (notifyEveryRun && !pendingResult.notified) {
      const messages = buildHeartbeatMessages({
        agentName,
        fetchedCount: runFetchedCount,
        salesforceCount: runSalesforceCount,
        newCount: runNewJobsCount,
        pendingCount: runPendingCount,
        sourceSummary: runSourceSummary,
        classificationSummary: runDetails.classificationSummary,
        note: newJobs.length === 0
          ? "No new jobs after dedupe in this run."
          : "Run completed without sending alert notifications."
      });
      const heartbeatResult = await notifyAll(messages);
      recordNotificationAttempt(runDetails, "heartbeat", heartbeatResult, {
        subject: messages.emailSubject,
        pendingCount: runPendingCount,
        newJobsCount: runNewJobsCount
      });
    }

    await maybeSendDailySummaryCloud({
      runDetails,
      agentName,
      fetchedCount: runFetchedCount,
      salesforceCount: runSalesforceCount,
      newCount: runNewJobsCount,
      pendingCount: runPendingCount,
      sourceSummary: runSourceSummary,
      classificationSummary: runDetails.classificationSummary,
      newJobs: scoredNewJobs
    });

    if (pendingResult.notified && Number(pendingResult.alertedCount || 0) > 0) {
      runNote = `Alerted ${pendingResult.alertedCount} queued job(s).`;
    } else if (pendingResult.notified && Number(pendingResult.reviewDigestCount || 0) > 0) {
      runNote = `Sent hiring post review digest for ${pendingResult.reviewDigestCount} lead(s).`;
    } else if (runNewJobsCount === 0) {
      runNote = "No new jobs after dedupe in this run.";
    } else {
      runNote = "Run completed without sending alert notifications.";
    }

    return {
      ok: true,
      status: runStatus,
      note: runNote,
      fetchedCount: runFetchedCount,
      salesforceCount: runSalesforceCount,
      newJobsCount: runNewJobsCount,
      pendingCount: runPendingCount,
      alertsSentCount: runAlertsSentCount,
      sourceSummary: runSourceSummary
    };
  } catch (error) {
    runStatus = "failed";
    runErrorMessage = String(error?.message || error || "unknown error");
    runNote = `Failed: ${runErrorMessage}`;

    const failureNotifyResult = await notifyAll({
      telegramText: `${agentName} failed.\n\nError:\n${runErrorMessage}`,
      emailSubject: `${agentName} failed`,
      emailText: `${agentName} failed.\n\nError:\n${runErrorMessage}`,
      emailHtml: `<p>${escapeHtml(agentName)} failed.</p><pre>${escapeHtml(runErrorMessage)}</pre>`
    });
    recordNotificationAttempt(runDetails, "failure", failureNotifyResult, {
      subject: `${agentName} failed`
    });

    return {
      ok: false,
      status: runStatus,
      note: runNote,
      error: runErrorMessage
    };
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
