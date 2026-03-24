import { fetchNaukriJobs, getLastNaukriFetchReport } from "../jobs/fetchNaukri.js";
import { filterSalesforceJobs } from "../jobs/filterSalesforceJobs.js";
import { applyPrecisionFilters } from "../jobs/precisionFilters.js";
import { enrichJobsWithResumeMatch } from "../resume/matchResume.js";
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
  const sourceId = String(job?.source_job_id || "").trim().toLowerCase();
  const link = String(job?.apply_link || "").trim().toLowerCase();

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

function buildJobLine(job) {
  const score = Number.isFinite(Number(job?.match_score))
    ? ` | Score ${Number(job.match_score)}`
    : "";
  const location = String(job?.location || "").trim();
  const link = String(job?.apply_link || "").trim();

  return [
    `${job?.title || "Unknown title"} - ${job?.company || "Unknown company"}`,
    location ? `Location: ${location}` : "",
    score ? score.replace(/^ \| /, "Score: ") : "",
    link ? `Apply: ${link}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTelegramJobAlert(agentName, jobs, sourceSummary) {
  const header =
    `<b>${escapeHtml(agentName)}</b>\n` +
    `${jobs.length} queued job(s) ready to review\n` +
    `${sourceSummary ? `${escapeHtml(sourceSummary)}\n\n` : "\n"}`;

  const body = jobs.map((job, index) => {
    const score = Number.isFinite(Number(job?.match_score))
      ? ` | <b>Score:</b> ${Number(job.match_score)}`
      : "";
    const location = String(job?.location || "").trim();
    const link = String(job?.apply_link || "").trim();

    return [
      `<b>${index + 1}. ${escapeHtml(job?.title || "Unknown title")}</b>`,
      `${escapeHtml(job?.company || "Unknown company")}${location ? ` | ${escapeHtml(location)}` : ""}${score}`,
      link ? escapeHtml(link) : ""
    ]
      .filter(Boolean)
      .join("\n");
  }).join("\n\n");

  return `${header}${body}`.trim();
}

function buildEmailJobAlert(agentName, jobs, sourceSummary) {
  const subject = `${agentName}: ${jobs.length} new jobs`;
  const text =
    `${agentName}\n\n` +
    `${jobs.length} queued job(s) ready to review\n` +
    `${sourceSummary ? `Source mix: ${sourceSummary}\n\n` : "\n"}` +
    jobs.map(buildJobLine).join("\n\n");

  const html =
    `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">` +
    `<h2>${escapeHtml(agentName)}</h2>` +
    `<p><strong>${jobs.length}</strong> queued job(s) ready to review</p>` +
    `${sourceSummary ? `<p><strong>Source mix:</strong> ${escapeHtml(sourceSummary)}</p>` : ""}` +
    jobs.map((job, index) =>
      `<div style="margin:18px 0;padding:14px;border:1px solid #e5e7eb;border-radius:12px;">` +
      `<div style="font-weight:700;">${index + 1}. ${escapeHtml(job?.title || "Unknown title")}</div>` +
      `<div>${escapeHtml(job?.company || "Unknown company")}</div>` +
      `${job?.location ? `<div>${escapeHtml(job.location)}</div>` : ""}` +
      `${Number.isFinite(Number(job?.match_score)) ? `<div>Score: ${Number(job.match_score)}</div>` : ""}` +
      `${job?.apply_link ? `<div><a href="${escapeHtml(job.apply_link)}">${escapeHtml(job.apply_link)}</a></div>` : ""}` +
      `</div>`
    ).join("") +
    `</body></html>`;

  return { subject, text, html };
}

function buildHeartbeatMessages({
  agentName,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary,
  note
}) {
  const telegramText =
    `<b>${escapeHtml(agentName)} heartbeat</b>\n\n` +
    `Fetched: <b>${fetchedCount}</b>\n` +
    `Salesforce matched: <b>${salesforceCount}</b>\n` +
    `${sourceSummary ? `Source mix: ${escapeHtml(sourceSummary)}\n` : ""}` +
    `New this run: <b>${newCount}</b>\n` +
    `Pending queue: <b>${pendingCount}</b>\n` +
    `Note: ${escapeHtml(note)}`;

  const emailSubject = `${agentName}: heartbeat`;
  const emailText =
    `${agentName} heartbeat\n\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceCount}\n` +
    `${sourceSummary ? `Source mix: ${sourceSummary}\n` : ""}` +
    `New this run: ${newCount}\n` +
    `Pending queue: ${pendingCount}\n` +
    `Note: ${note}`;
  const emailHtml =
    `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">` +
    `<h2>${escapeHtml(agentName)} heartbeat</h2>` +
    `<p>Fetched: <strong>${fetchedCount}</strong></p>` +
    `<p>Salesforce matched: <strong>${salesforceCount}</strong></p>` +
    `${sourceSummary ? `<p>Source mix: ${escapeHtml(sourceSummary)}</p>` : ""}` +
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
  sourceSummary
}) {
  const telegramText =
    `<b>${escapeHtml(agentName)} daily summary</b>\n\n` +
    `Date: <b>${escapeHtml(dateKey)}</b>\n` +
    `Fetched: <b>${fetchedCount}</b>\n` +
    `Salesforce matched: <b>${salesforceCount}</b>\n` +
    `New jobs: <b>${newCount}</b>\n` +
    `Pending queue: <b>${pendingCount}</b>\n` +
    `${sourceSummary ? `Source mix: ${escapeHtml(sourceSummary)}` : ""}`;

  const emailSubject = `${agentName} daily summary (${dateKey})`;
  const emailText =
    `${agentName} daily summary\n\n` +
    `Date: ${dateKey}\n` +
    `Fetched: ${fetchedCount}\n` +
    `Salesforce matched: ${salesforceCount}\n` +
    `New jobs: ${newCount}\n` +
    `Pending queue: ${pendingCount}\n` +
    `${sourceSummary ? `Source mix: ${sourceSummary}` : ""}`;
  const emailHtml =
    `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;">` +
    `<h2>${escapeHtml(agentName)} daily summary</h2>` +
    `<p>Date: <strong>${escapeHtml(dateKey)}</strong></p>` +
    `<p>Fetched: <strong>${fetchedCount}</strong></p>` +
    `<p>Salesforce matched: <strong>${salesforceCount}</strong></p>` +
    `<p>New jobs: <strong>${newCount}</strong></p>` +
    `<p>Pending queue: <strong>${pendingCount}</strong></p>` +
    `${sourceSummary ? `<p>Source mix: ${escapeHtml(sourceSummary)}</p>` : ""}` +
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

  return {
    telegramOk,
    emailOk,
    anyOk: telegramOk || emailOk
  };
}

async function processPendingAlertsCloud(agentName) {
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

  const maxItems = getAlertBatchLimit();
  const jobsToAlert = Number.isFinite(maxItems)
    ? eligibleQueue.slice(0, maxItems)
    : eligibleQueue;
  const sourceSummary = buildSourceSummary(jobsToAlert);
  const telegramText = buildTelegramJobAlert(agentName, jobsToAlert, sourceSummary);
  const emailPayload = buildEmailJobAlert(agentName, jobsToAlert, sourceSummary);
  const notifyResult = await notifyAll({
    telegramText,
    emailSubject: emailPayload.subject,
    emailText: emailPayload.text,
    emailHtml: emailPayload.html
  });

  if (!notifyResult.anyOk) {
    return {
      pendingCount,
      alertedCount: 0,
      notified: false
    };
  }

  await acknowledgePendingAlerts(jobsToAlert.map(job => job.job_hash));
  await registerApplicationJobs(jobsToAlert, {
    event: "alerted",
    defaultStatus: "new"
  });

  return {
    pendingCount,
    alertedCount: jobsToAlert.length,
    notified: true
  };
}

async function maybeSendDailySummaryCloud({
  agentName,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary
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
    sourceSummary
  });

  const result = await notifyAll(messages);
  if (result.anyOk) {
    await markDailySummarySent(check.dateKey);
    return true;
  }

  return false;
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

    const salesforceJobsRaw = filterSalesforceJobs(jobs || []);
    const { jobs: salesforceJobs, report: precisionReport } =
      applyPrecisionFilters(salesforceJobsRaw);
    runSalesforceCount = salesforceJobs.length;
    runSourceSummary = buildSourceSummary(salesforceJobs);
    runDetails.precisionReport = precisionReport;

    const newJobs = await getNewJobs(salesforceJobs);
    runNewJobsCount = newJobs.length;

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

      await enqueuePendingAlerts(pendingPayload);
    }

    const pendingResult = await processPendingAlertsCloud(agentName);
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
        note: newJobs.length === 0
          ? "No new jobs after dedupe in this run."
          : "Run completed without sending alert notifications."
      });
      await notifyAll(messages);
    }

    await maybeSendDailySummaryCloud({
      agentName,
      fetchedCount: runFetchedCount,
      salesforceCount: runSalesforceCount,
      newCount: runNewJobsCount,
      pendingCount: runPendingCount,
      sourceSummary: runSourceSummary
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

    await notifyAll({
      telegramText: `${agentName} failed.\n\nError:\n${runErrorMessage}`,
      emailSubject: `${agentName} failed`,
      emailText: `${agentName} failed.\n\nError:\n${runErrorMessage}`,
      emailHtml: `<p>${escapeHtml(agentName)} failed.</p><pre>${escapeHtml(runErrorMessage)}</pre>`
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
