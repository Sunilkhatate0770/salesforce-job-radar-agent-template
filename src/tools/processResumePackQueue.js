import "dotenv/config";
import {
  createResumeAttachments,
  annotateJobsWithResumeSupport
} from "../resume/generateTailoredResume.js";
import {
  flushResumePackQueue,
  getResumePackQueueCount
} from "../db/resumePackQueue.js";
import { sendEmailMessage } from "../notify/email.js";
import { sendTelegramMessage } from "../notify/telegram.js";
import { buildActionCardResumePackMessages } from "../notify/actionCards.js";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function getAgentName() {
  return String(process.env.AGENT_NAME || "Salesforce Job Radar Agent").trim();
}

function getProcessLimit() {
  const parsed = Number(process.env.RESUME_PACK_QUEUE_MAX_ITEMS || 3);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3;
  }
  return Math.floor(parsed);
}

function shouldProcessQueue() {
  return isTruthy(process.env.RESUME_PACK_QUEUE_ENABLED || "true") &&
    isTruthy(process.env.RESUME_PACK_FOLLOWUP_ENABLED || "true");
}

function pickTelegramAttachments(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const used = new Set();
  const picks = [];
  const patterns = [
    /tailored-resume-.*\.pdf$/i,
    /apply-bundle-.*\.zip$/i,
    /apply-pack-.*\.pdf$/i
  ];

  for (const pattern of patterns) {
    const match = list.find(attachment => {
      const filename = String(attachment?.filename || "").trim();
      return filename && !used.has(filename) && pattern.test(filename);
    });
    if (!match) continue;
    used.add(String(match.filename));
    picks.push(match);
  }

  for (const attachment of list) {
    const filename = String(attachment?.filename || "").trim();
    if (!filename || used.has(filename)) continue;
    picks.push(attachment);
    used.add(filename);
    if (picks.length >= 3) break;
  }

  return picks;
}

function inferSourceSummary(job) {
  const sourcePlatform = String(job?.source_platform || "").trim().toLowerCase();
  if (sourcePlatform === "linkedin_posts") return "LinkedIn Posts";
  if (sourcePlatform === "linkedin") return "LinkedIn";
  if (sourcePlatform === "naukri_reader" || sourcePlatform === "naukri_direct" || sourcePlatform === "naukri") {
    return "Naukri";
  }
  if (sourcePlatform === "greenhouse") return "Greenhouse";
  if (sourcePlatform === "lever") return "Lever";
  if (sourcePlatform === "ashby") return "Ashby";
  return String(job?.source_platform || "").trim() || "Job Radar";
}

async function sendResumePackFollowUp(job, attachments) {
  const [annotatedJob] = await annotateJobsWithResumeSupport([job], {
    fullPackJobs: [job],
    attachmentsEnabled: true
  });
  const sourceSummary = inferSourceSummary(job);
  const messages = buildActionCardResumePackMessages({
    agentName: getAgentName(),
    jobs: [annotatedJob || job],
    sourceSummary
  });

  const emailOk = await sendEmailMessage({
    subject: messages.subject,
    text: messages.text,
    html: messages.html,
    attachments
  });
  const telegramOk = await sendTelegramMessage(messages.telegram, {
    attachments: pickTelegramAttachments(attachments)
  });

  return {
    emailOk,
    telegramOk,
    anyOk: emailOk || telegramOk
  };
}

async function processQueueItem(item) {
  const job = item?.job;
  if (!job || !job.job_hash) {
    throw new Error("resume pack queue item missing job payload");
  }

  const attachments = await createResumeAttachments([job]);
  if (!Array.isArray(attachments) || attachments.length === 0) {
    throw new Error(`no resume pack attachments generated for ${job.job_hash}`);
  }

  const notifyResult = await sendResumePackFollowUp(job, attachments);
  if (!notifyResult.anyOk) {
    throw new Error(`resume pack follow-up failed for ${job.job_hash}`);
  }

  console.log(
    `?? Resume pack sent for ${job.title || "Salesforce role"} (${job.job_hash})` +
      ` | email=${notifyResult.emailOk} telegram=${notifyResult.telegramOk}`
  );
}

async function main() {
  if (!shouldProcessQueue()) {
    console.log("?? Resume pack queue processing disabled.");
    return;
  }

  const initialCount = await getResumePackQueueCount();
  if (initialCount === 0) {
    console.log("?? Resume pack queue is empty.");
    return;
  }

  console.log(`?? Resume pack queue: ${initialCount} item(s) pending`);
  const result = await flushResumePackQueue(processQueueItem, {
    maxItems: getProcessLimit(),
    stopOnFailure: false
  });

  console.log(
    `?? Resume pack queue processed=${result.processed} failed=${result.failed} remaining=${result.remaining}`
  );

  if (result.failed > 0) {
    console.log("?? Some resume pack jobs were kept in queue for retry on the next run.");
  }
}

main().catch(error => {
  console.error("Resume pack queue processor failed:", error);
  process.exit(1);
});
