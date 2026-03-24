import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const OUTBOX_PATH = new URL("../../.cache/job-outbox.json", import.meta.url);
const STATE_KEY = "job_outbox";

function normalizeJobs(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.jobs)) return parsed.jobs;
  return [];
}

async function readOutbox() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return normalizeJobs(payload);
  }

  try {
    return normalizeJobs(await readJsonFile(OUTBOX_PATH));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.log("⚠️ Job outbox read failed:", error.message);
    return [];
  }
}

async function writeOutbox(jobs) {
  const payload = {
    jobs,
    updated_at: new Date().toISOString()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(OUTBOX_PATH, payload);
}

export async function queueJobForSync(jobPayload) {
  const jobs = await readOutbox();
  const exists = jobs.some(job => job.job_hash === jobPayload.job_hash);
  if (exists) return false;

  jobs.push(jobPayload);
  await writeOutbox(jobs);
  return true;
}

export async function outboxHasHash(jobHash) {
  const jobs = await readOutbox();
  return jobs.some(job => job.job_hash === jobHash);
}

export async function flushJobOutbox(processor, options = {}) {
  const maxItems = Number(options.maxItems || Number.POSITIVE_INFINITY);
  const stopOnFailure = options.stopOnFailure !== false;
  const jobs = await readOutbox();
  if (jobs.length === 0) {
    return { total: 0, processed: 0, failed: 0, remaining: 0 };
  }

  const processCount = Number.isFinite(maxItems)
    ? Math.max(0, Math.min(jobs.length, Math.trunc(maxItems)))
    : jobs.length;
  const toProcess = jobs.slice(0, processCount);
  const untouched = jobs.slice(processCount);

  let processed = 0;
  let failed = 0;
  const pending = [...untouched];

  for (let index = 0; index < toProcess.length; index += 1) {
    const job = toProcess[index];
    try {
      await processor(job);
      processed += 1;
    } catch {
      failed += 1;
      pending.push(job);

      if (stopOnFailure) {
        pending.push(...toProcess.slice(index + 1));
        break;
      }
    }
  }

  await writeOutbox(pending);

  return {
    total: jobs.length,
    processed,
    failed,
    remaining: pending.length
  };
}
