import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const QUEUE_PATH = new URL("../../.cache/resume-pack-queue.json", import.meta.url);
const STATE_KEY = "resume_pack_queue";

function normalizeEntries(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

async function readQueue() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return normalizeEntries(payload);
  }

  try {
    return normalizeEntries(await readJsonFile(QUEUE_PATH));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.log("?? Resume pack queue read failed:", error.message);
    return [];
  }
}

async function writeQueue(items) {
  const payload = {
    items,
    updated_at: new Date().toISOString()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(QUEUE_PATH, payload);
}

function buildQueueItem(job, options = {}) {
  return {
    job_hash: String(job?.job_hash || "").trim(),
    queued_at: new Date().toISOString(),
    source: String(options.source || "").trim(),
    reason: String(options.reason || "tailored_resume_followup").trim(),
    job
  };
}

export async function enqueueResumePackJobs(jobs, options = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) return 0;

  const queue = await readQueue();
  const existingHashes = new Set(
    queue
      .map(item => String(item?.job_hash || "").trim())
      .filter(Boolean)
  );

  let added = 0;
  for (const job of jobs) {
    const jobHash = String(job?.job_hash || "").trim();
    if (!jobHash || existingHashes.has(jobHash)) continue;

    queue.push(buildQueueItem(job, options));
    existingHashes.add(jobHash);
    added += 1;
  }

  if (added > 0) {
    await writeQueue(queue);
  }

  return added;
}

export async function peekResumePackQueue(limit = 20) {
  const queue = await readQueue();
  return queue.slice(0, Math.max(0, limit));
}

export async function getResumePackQueueCount() {
  const queue = await readQueue();
  return queue.length;
}

export async function acknowledgeResumePackJobs(jobHashes) {
  if (!Array.isArray(jobHashes) || jobHashes.length === 0) return 0;

  const ackSet = new Set(
    jobHashes
      .map(value => String(value || "").trim())
      .filter(Boolean)
  );
  const queue = await readQueue();
  const remaining = queue.filter(item => !ackSet.has(String(item?.job_hash || "").trim()));
  const removed = queue.length - remaining.length;

  if (removed > 0) {
    await writeQueue(remaining);
  }

  return removed;
}

export async function flushResumePackQueue(processor, options = {}) {
  const maxItems = Number(options.maxItems || Number.POSITIVE_INFINITY);
  const stopOnFailure = options.stopOnFailure !== false;
  const items = await readQueue();
  if (items.length === 0) {
    return { total: 0, processed: 0, failed: 0, remaining: 0 };
  }

  const processCount = Number.isFinite(maxItems)
    ? Math.max(0, Math.min(items.length, Math.trunc(maxItems)))
    : items.length;
  const toProcess = items.slice(0, processCount);
  const untouched = items.slice(processCount);

  let processed = 0;
  let failed = 0;
  const pending = [...untouched];

  for (let index = 0; index < toProcess.length; index += 1) {
    const item = toProcess[index];
    try {
      await processor(item);
      processed += 1;
    } catch (error) {
      failed += 1;
      console.log(
        `?? Resume pack queue item failed (${String(item?.job_hash || "unknown")}): ${String(error?.message || error || "unknown error")}`
      );
      pending.push(item);

      if (stopOnFailure) {
        pending.push(...toProcess.slice(index + 1));
        break;
      }
    }
  }

  await writeQueue(pending);

  return {
    total: items.length,
    processed,
    failed,
    remaining: pending.length
  };
}
