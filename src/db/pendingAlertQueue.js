import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const QUEUE_PATH = new URL("../../.cache/pending-alerts.json", import.meta.url);
const STATE_KEY = "pending_alerts";

function normalizeJobs(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.jobs)) return parsed.jobs;
  return [];
}

async function readQueue() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return normalizeJobs(payload);
  }

  try {
    return normalizeJobs(await readJsonFile(QUEUE_PATH));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.log("⚠️ Pending alert queue read failed:", error.message);
    return [];
  }
}

async function writeQueue(jobs) {
  const payload = {
    jobs,
    updated_at: new Date().toISOString()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(QUEUE_PATH, payload);
}

export async function enqueuePendingAlerts(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return 0;

  const queue = await readQueue();
  const existingHashes = new Set(queue.map(job => job.job_hash));

  let added = 0;
  for (const job of jobs) {
    if (!job.job_hash) continue;
    if (existingHashes.has(job.job_hash)) continue;

    queue.push({
      ...job,
      queued_at: new Date().toISOString()
    });
    existingHashes.add(job.job_hash);
    added += 1;
  }

  if (added > 0) {
    await writeQueue(queue);
  }

  return added;
}

export async function peekPendingAlerts(limit = 20) {
  const queue = await readQueue();
  return queue.slice(0, Math.max(0, limit));
}

export async function acknowledgePendingAlerts(jobHashes) {
  if (!Array.isArray(jobHashes) || jobHashes.length === 0) return 0;

  const ackSet = new Set(jobHashes);
  const queue = await readQueue();
  const remaining = queue.filter(job => !ackSet.has(job.job_hash));
  const removed = queue.length - remaining.length;

  if (removed > 0) {
    await writeQueue(remaining);
  }

  return removed;
}

export async function getPendingAlertCount() {
  const queue = await readQueue();
  return queue.length;
}
