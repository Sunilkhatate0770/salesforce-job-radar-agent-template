import crypto from "node:crypto";
import { supabase, isSupabaseEnabled } from "../db/supabase.js";
import { hasLocalHash, saveLocalHash } from "../db/localDedupeStore.js";
import {
  flushJobOutbox,
  outboxHasHash,
  queueJobForSync
} from "../db/jobOutbox.js";

let supabaseCooldownUntil = 0;
let lastOutboxSyncAt = 0;

const SUPABASE_COOLDOWN_MS = Number(
  process.env.SUPABASE_RETRY_COOLDOWN_MS || 60_000
);
const OUTBOX_SYNC_INTERVAL_MS = Number(
  process.env.OUTBOX_SYNC_INTERVAL_MS || 15_000
);
const OUTBOX_MAX_SYNC_PER_RUN = Math.max(
  1,
  Number(process.env.OUTBOX_MAX_SYNC_PER_RUN || 5)
);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeApplyLink(link) {
  const raw = String(link || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw
      .toLowerCase()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
  }
}

function extractJobIdFromLink(link) {
  const canonical = normalizeApplyLink(link);
  if (!canonical) return "";

  const match = canonical.match(/-(\d{6,})$/);
  return match ? match[1] : "";
}

function buildJobRecord(job) {
  const sourceJobId = normalizeText(
    job.source_job_id ||
      job.job_id ||
      job.jobId ||
      job.id ||
      extractJobIdFromLink(job.apply_link)
  );
  const canonicalLink = normalizeApplyLink(
    job.canonical_apply_url || job.apply_link || job.post_url
  );
  const canonicalCompany = normalizeText(job.canonical_company || job.company);
  const canonicalRole = normalizeText(job.canonical_role || job.title);
  const opportunityKind = normalizeText(job.opportunity_kind || "listing");

  const raw = sourceJobId
    ? `id:${sourceJobId}`
    : canonicalLink
      ? `url:${canonicalLink}`
      : canonicalRole && canonicalCompany
        ? `canonical:${canonicalRole}|${canonicalCompany}|${normalizeText(job.location)}|${opportunityKind}`
        : [
            normalizeText(job.title),
            normalizeText(job.company),
            normalizeText(job.location),
            normalizeText(job.experience),
            opportunityKind
          ].join("|");

  const jobHash = crypto.createHash("sha256").update(raw).digest("hex");

  const payload = {
    job_hash: jobHash,
    title: job.title,
    company: job.company,
    location: job.location,
    experience: job.experience,
    apply_link: canonicalLink || job.apply_link || null,
    source_job_id: sourceJobId || null,
    source_platform: normalizeText(job.source_platform || "") || null,
    opportunity_kind: opportunityKind || "listing",
    confidence_tier: normalizeText(job.confidence_tier || "") || null,
    canonical_apply_url: canonicalLink || null,
    canonical_company: canonicalCompany || null,
    canonical_role: canonicalRole || null,
    post_author: String(job.post_author || "").trim() || null,
    post_url: normalizeApplyLink(job.post_url) || null,
    source_evidence:
      job.source_evidence && typeof job.source_evidence === "object"
        ? job.source_evidence
        : null,
    last_seen_at: new Date().toISOString()
  };

  return {
    job: {
      ...job,
      apply_link: payload.apply_link || job.apply_link,
      source_job_id: payload.source_job_id
    },
    jobHash,
    payload
  };
}

async function withRetry(
  fn,
  label,
  { retries = 3, delayMs = 2000, ignoreErrorCodes = [] } = {}
) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await fn();

      if (result?.error && !ignoreErrorCodes.includes(result.error.code)) {
        throw new Error(result.error.message);
      }

      return result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const waitMs = Math.round(delayMs * Math.pow(1.5, attempt - 1));
        await new Promise(res => setTimeout(res, waitMs));
      }
    }
  }

  throw new Error(`${label} failed after ${retries} attempts: ${lastError.message}`);
}

function canUseSupabase() {
  return isSupabaseEnabled() && Date.now() >= supabaseCooldownUntil;
}

function setSupabaseCooldown(reason) {
  supabaseCooldownUntil = Date.now() + SUPABASE_COOLDOWN_MS;
  console.log(
    `⚠️ Supabase unavailable, using local queue for now: ${reason}`
  );
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("column") &&
    message.includes(columnName.toLowerCase()) &&
    message.includes("does not exist")
  );
}

async function upsertJobPayload(payload) {
  const runUpsert = async (payloadToWrite) => {
    const { error } = await withRetry(
      () =>
        supabase.from("job_alerts").upsert(payloadToWrite, {
          onConflict: "job_hash",
          ignoreDuplicates: true
        }),
      "Supabase save job",
      { retries: 2, delayMs: 1500, ignoreErrorCodes: ["23505"] }
    );

    if (error && error.code !== "23505") {
      throw new Error(`Supabase save job error: ${error.message}`);
    }
  };

  try {
    await runUpsert(payload);
  } catch (error) {
    let fallbackPayload = { ...payload };
    let lastError = error;

    while (true) {
      let changed = false;

      for (const columnName of [
        "source_job_id",
        "last_seen_at",
        "source_platform",
        "opportunity_kind",
        "confidence_tier",
        "canonical_apply_url",
        "canonical_company",
        "canonical_role",
        "post_author",
        "post_url",
        "source_evidence"
      ]) {
        if (isMissingColumnError(lastError, columnName) && columnName in fallbackPayload) {
          const { [columnName]: _removed, ...nextPayload } = fallbackPayload;
          fallbackPayload = nextPayload;
          changed = true;
        }
      }

      if (!changed) {
        throw lastError;
      }

      try {
        await runUpsert(fallbackPayload);
        return;
      } catch (retryError) {
        lastError = retryError;
      }
    }
  }
}

async function syncOutboxIfPossible({ force = false } = {}) {
  if (!canUseSupabase()) return;

  const now = Date.now();
  if (!force && now - lastOutboxSyncAt < OUTBOX_SYNC_INTERVAL_MS) return;
  lastOutboxSyncAt = now;

  try {
    const maxItemsToSync = force
      ? Number.POSITIVE_INFINITY
      : OUTBOX_MAX_SYNC_PER_RUN;
    const result = await flushJobOutbox(
      async payload => {
        await upsertJobPayload(payload);
      },
      {
        maxItems: maxItemsToSync,
        stopOnFailure: !force
      }
    );

    if (result.failed > 0 && result.processed === 0) {
      setSupabaseCooldown("outbox sync failed");
      return;
    }

    if (result.failed > 0) {
      setSupabaseCooldown(
        `${result.failed} queued job(s) failed while syncing to Supabase`
      );
      return;
    }

    if (result.processed > 0) {
      console.log(`✅ Synced ${result.processed} queued job(s) to Supabase`);
    }
  } catch (error) {
    setSupabaseCooldown(error.message);
  }
}

export function generateJobHash(job) {
  return buildJobRecord(job).jobHash;
}

async function getRemoteExistingHashes(jobHashes) {
  if (jobHashes.length === 0 || !canUseSupabase()) {
    return new Set();
  }

  const { data, error } = await withRetry(
    () =>
      supabase
        .from("job_alerts")
        .select("job_hash")
        .in("job_hash", jobHashes),
    "Supabase batch duplicate check",
    { retries: 2, delayMs: 1500 }
  );

  if (error) {
    throw new Error(`Supabase batch duplicate check error: ${error.message}`);
  }

  return new Set((data || []).map(row => row.job_hash));
}

export async function getNewJobs(jobs) {
  const uniqueRecords = new Map();

  for (const job of jobs) {
    const record = buildJobRecord(job);
    uniqueRecords.set(record.jobHash, record);
  }

  const records = [...uniqueRecords.values()];
  if (records.length === 0) return [];

  await syncOutboxIfPossible();

  const fallbackDuplicates = new Set();
  const duplicateChecks = await Promise.all(
    records.map(async record => {
      const [localDuplicate, queuedDuplicate] = await Promise.all([
        hasLocalHash(record.jobHash),
        outboxHasHash(record.jobHash)
      ]);
      return {
        jobHash: record.jobHash,
        duplicate: localDuplicate || queuedDuplicate
      };
    })
  );

  for (const check of duplicateChecks) {
    if (check.duplicate) {
      fallbackDuplicates.add(check.jobHash);
    }
  }

  let remoteExisting = new Set();

  try {
    remoteExisting = await getRemoteExistingHashes(records.map(r => r.jobHash));
  } catch (error) {
    setSupabaseCooldown(error.message);
  }

  return records
    .filter(record =>
      !fallbackDuplicates.has(record.jobHash) &&
      !remoteExisting.has(record.jobHash)
    )
    .map(record => record.job);
}

export async function saveJobs(jobs) {
  const uniqueRecords = new Map();

  for (const job of jobs) {
    const record = buildJobRecord(job);
    uniqueRecords.set(record.jobHash, record);
  }

  for (const record of uniqueRecords.values()) {
    await saveLocalHash(record.jobHash);
    await queueJobForSync(record.payload);
  }

  await syncOutboxIfPossible({ force: true });
}

export async function isDuplicate(job) {
  const newJobs = await getNewJobs([job]);
  return newJobs.length === 0;
}

export async function saveJob(job) {
  await saveJobs([job]);
}
