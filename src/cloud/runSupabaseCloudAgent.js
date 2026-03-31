import { fetchNaukriJobs, getLastNaukriFetchReport } from "../jobs/fetchNaukri.js";
import { filterSalesforceJobs } from "../jobs/filterSalesforceJobs.js";
import { applyPrecisionFilters } from "../jobs/precisionFilters.js";
import { enrichJobsWithResumeMatch } from "../resume/matchResume.js";
import { annotateJobsWithResumeSupport } from "../resume/generateTailoredResume.js";
import { generateJobHash, getNewJobs, saveJobs } from "../jobs/dedupe.js";
import {
  acknowledgePendingAlerts,
  enqueuePendingAlerts,
  getPendingAlertCount,
  peekPendingAlerts
} from "../db/pendingAlertQueue.js";
import {
  autoPromoteFollowUpJobs,
  registerApplicationJobs
} from "../db/applicationTracker.js";
import { acquireRunLease } from "../db/runLease.js";
import { startRunHistory } from "../db/runHistory.js";
import { markDailySummarySent, shouldSendDailySummary } from "../notify/dailySummary.js";
import { sendEmailMessage } from "../notify/email.js";
import { sendTelegramMessage } from "../notify/telegram.js";
import { getStateBackend } from "../db/stateStore.js";
import {
  buildCoverageHealth,
  buildOpportunitySummary,
  getOpportunityConfidenceLabel,
  getOpportunityKindLabel,
  prepareOpportunities,
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

function buildTelegramOpportunityCard(job, index) {
  const actionUrl = getOpportunityActionUrl(job);
  const resumePreview = getResumePreview(job);
  const evidence = getOpportunityEvidence(job);
  const lines = [
    `<b>${index}. ${escapeHtml(job?.title || "Unknown title")}</b>`,
    `${escapeHtml(job?.company || "Unknown company")}${job?.location ? ` | ${escapeHtml(job.location)}` : ""}`,
    `<b>${escapeHtml(getOpportunityKindLabel(job))}</b> | ${escapeHtml(getOpportunityConfidenceLabel(job))} | ${escapeHtml(inferJobSource(job))}`,
    `Match: <b>${escapeHtml(String(job?.match_score ?? "n/a"))}</b>`
  ];

  const resumeSupport = getResumeSupportLabel(job);
  if (resumeSupport) lines.push(`Tailored support: ${escapeHtml(resumeSupport)}`);
  if (resumePreview?.atsKeywords?.length) {
    lines.push(`ATS keywords: ${escapeHtml(formatListValue(resumePreview.atsKeywords, 5))}`);
  }
  if (resumePreview?.draftSubject) {
    lines.push(`Draft subject: ${escapeHtml(trimText(resumePreview.draftSubject, 120))}`);
  }
  if (job?.missing_skills?.length) {
    lines.push(`Missing: ${escapeHtml(formatListValue(job.missing_skills, 4))}`);
  }
  if (evidence) lines.push(`Evidence: ${escapeHtml(evidence)}`);
  lines.push(actionUrl ? `<a href="${escapeHtml(actionUrl)}">${escapeHtml(getOpportunityActionLabel(job))}</a>` : "Link unavailable");
  return lines.join("\n");
}

function buildEmailTextOpportunityCard(job, index) {
  const actionUrl = getOpportunityActionUrl(job);
  const resumePreview = getResumePreview(job);
  const evidence = getOpportunityEvidence(job);
  const lines = [
    `${index}. ${trimText(job?.title || "Unknown title", 140)}`,
    `${trimText(job?.company || "Unknown company", 120)}${job?.location ? ` | ${trimText(job.location, 80)}` : ""}`,
    `Type: ${getOpportunityKindLabel(job)} | Confidence: ${getOpportunityConfidenceLabel(job)} | Source: ${inferJobSource(job)}`,
    `Match: ${String(job?.match_score ?? "n/a")}`
  ];
  const resumeSupport = getResumeSupportLabel(job);
  if (resumeSupport) lines.push(`Tailored support: ${resumeSupport}`);
  if (resumePreview?.atsKeywords?.length) {
    lines.push(`ATS keywords: ${formatListValue(resumePreview.atsKeywords, 5)}`);
  }
  if (resumePreview?.draftSubject) {
    lines.push(`Draft subject: ${trimText(resumePreview.draftSubject, 120)}`);
  }
  if (job?.missing_skills?.length) {
    lines.push(`Missing: ${formatListValue(job.missing_skills, 4)}`);
  }
  if (evidence) lines.push(`Evidence: ${evidence}`);
  lines.push(`${getOpportunityActionLabel(job)}: ${actionUrl || "Link unavailable"}`);
  return lines.join("\n");
}

function buildEmailHtmlOpportunityCard(job, index) {
  const actionUrl = getOpportunityActionUrl(job);
  const resumePreview = getResumePreview(job);
  const evidence = getOpportunityEvidence(job);
  const resumeSupport = getResumeSupportLabel(job);
  const chips = [
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:700;">${escapeHtml(getOpportunityKindLabel(job))}</span>`,
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:12px;font-weight:700;">${escapeHtml(getOpportunityConfidenceLabel(job))}</span>`,
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:#f8fafc;color:#334155;font-size:12px;font-weight:700;">${escapeHtml(inferJobSource(job))}</span>`,
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;">Match ${escapeHtml(String(job?.match_score ?? "n/a"))}</span>`
  ];
  return (
    `<div style="margin:0 0 16px 0;padding:18px;border:1px solid #dbe3ea;border-radius:16px;background:#ffffff;">` +
    `<div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:8px;">${escapeHtml(index)}. ${escapeHtml(job?.title || "Unknown title")}</div>` +
    `<div style="font-size:14px;color:#334155;margin-bottom:10px;">${escapeHtml(job?.company || "Unknown company")}${job?.location ? ` | ${escapeHtml(job.location)}` : ""}</div>` +
    `<div style="margin-bottom:8px;">${chips.join("")}</div>` +
    `${resumeSupport ? `<div style="margin:6px 0;"><strong>Tailored support:</strong> ${escapeHtml(resumeSupport)}</div>` : ""}` +
    `${resumePreview?.atsKeywords?.length ? `<div style="margin:6px 0;"><strong>ATS keywords:</strong> ${escapeHtml(formatListValue(resumePreview.atsKeywords, 5))}</div>` : ""}` +
    `${resumePreview?.draftSubject ? `<div style="margin:6px 0;"><strong>Draft subject:</strong> ${escapeHtml(trimText(resumePreview.draftSubject, 120))}</div>` : ""}` +
    `${job?.missing_skills?.length ? `<div style="margin:6px 0;"><strong>Missing:</strong> ${escapeHtml(formatListValue(job.missing_skills, 4))}</div>` : ""}` +
    `${evidence ? `<div style="margin:6px 0;"><strong>Evidence:</strong> ${escapeHtml(evidence)}</div>` : ""}` +
    `${actionUrl
      ? `<div style="margin-top:12px;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:8px 12px;border-radius:10px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(getOpportunityActionLabel(job))}</a></div>`
      : `<div style="margin-top:12px;color:#6b7280;">Link unavailable</div>`}` +
    `</div>`
  );
}

function buildOpportunitySections(jobs) {
  const split = splitOpportunitiesForAlerts(jobs);
  const sections = [
    { title: "High-confidence listings", jobs: split.highListings },
    { title: "High-confidence hiring posts", jobs: split.highPosts },
    { title: "Medium-confidence review queue", jobs: split.mediumQueue }
  ].filter(section => Array.isArray(section.jobs) && section.jobs.length > 0);

  return {
    telegram: sections.map(section =>
      `<b>${escapeHtml(section.title)} (${section.jobs.length})</b>

` +
      section.jobs.map((job, index) => buildTelegramOpportunityCard(job, index + 1)).join("\n\n")
    ).join("\n\n"),
    emailText: sections.map(section =>
      `${section.title} (${section.jobs.length})

` +
      section.jobs.map((job, index) => buildEmailTextOpportunityCard(job, index + 1)).join("\n\n")
    ).join("\n\n"),
    emailHtml: sections.map(section =>
      `<div style="margin-top:22px;"><h3 style="margin:0 0 12px 0;color:#0f172a;">${escapeHtml(section.title)} (${section.jobs.length})</h3>${section.jobs.map((job, index) => buildEmailHtmlOpportunityCard(job, index + 1)).join("")}</div>`
    ).join("")
  };
}

function buildJobAlertMessages(agentName, jobs, sourceSummary) {
  const summary = buildOpportunitySummary(jobs);
  const sections = buildOpportunitySections(jobs);
  const subject = `${agentName}: ${jobs.length} opportunities | Listings ${summary.by_kind?.listing || 0} | Posts ${summary.by_kind?.post || 0}`;
  const text = [
    `${agentName}` ,
    "",
    `${jobs.length} opportunity(ies) ready to review`,
    sourceSummary ? `Source mix: ${sourceSummary}` : "",
    `Listings: ${summary.by_kind?.listing || 0} | Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}` ,
    "",
    sections.emailText
  ].filter(Boolean).join("\n");
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">` +
    `<div style="max-width:780px;margin:0 auto;">` +
    `<div style="padding:24px;border-radius:20px;background:#0f172a;color:#ffffff;">` +
    `<div style="font-size:28px;font-weight:800;margin-bottom:8px;">${escapeHtml(agentName)}</div>` +
    `<div style="font-size:16px;line-height:1.7;">${jobs.length} opportunity(ies) ready to review</div>` +
    `${sourceSummary ? `<div style="margin-top:8px;font-size:14px;opacity:0.88;">Source mix: ${escapeHtml(sourceSummary)}</div>` : ""}` +
    `<div style="margin-top:12px;font-size:14px;opacity:0.88;">Listings: ${summary.by_kind?.listing || 0} | Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}</div>` +
    `</div>` +
    sections.emailHtml +
    `</div></body></html>`;
  const telegram = [
    `<b>${escapeHtml(agentName)}</b>`,
    `${jobs.length} opportunity(ies) ready to review`,
    sourceSummary ? `${escapeHtml(sourceSummary)}` : "",
    `Listings: ${summary.by_kind?.listing || 0} | Posts: ${summary.by_kind?.post || 0} | Review: ${summary.by_confidence?.medium || 0}` ,
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

async function processPendingAlertsCloud(agentName, runDetails) {
  const pendingCount = await getPendingAlertCount();
  if (pendingCount === 0) {
    return {
      pendingCount: 0,
      alertedCount: 0,
      notified: false
    };
  }

  const queueSnapshot = await peekPendingAlerts(Math.min(pendingCount, 200));
  const minMatchScore = getMinMatchScore();
  const eligibleQueue = queueSnapshot.filter(job => {
    const score = Number(job?.match_score || 0);
    return score >= minMatchScore;
  });

  if (eligibleQueue.length === 0) {
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
    return {
      pendingCount: await getPendingAlertCount(),
      alertedCount: 0,
      notified: false
    };
  }

  const jobsWithResumeSupport = await annotateJobsWithResumeSupport(jobsToAlert, {
    fullPackJobs: selectedHigh,
    attachmentsEnabled: false
  });
  const sourceSummary = buildSourceSummary(jobsWithResumeSupport);
  const messagePayload = buildJobAlertMessages(
    agentName,
    jobsWithResumeSupport,
    sourceSummary
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
    suppressedByPolicyCount: selection.suppressedByPolicy.length,
    postAlertPolicy: selection.postPolicy
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
  await registerApplicationJobs(jobsWithResumeSupport, {
    event: "alerted",
    defaultStatus: "new"
  });

  return {
    pendingCount,
    alertedCount: jobsToAlert.length,
    notified: true,
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
    stateBackend: getStateBackend()
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
    runDetails.providerCoverage = buildCoverageHealth(
      fetchReport,
      preparedOpportunities.summary
    );
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

    const pendingResult = await processPendingAlertsCloud(agentName, runDetails);
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

    if (pendingResult.notified) {
      runNote = `Alerted ${pendingResult.alertedCount} queued job(s).`;
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
