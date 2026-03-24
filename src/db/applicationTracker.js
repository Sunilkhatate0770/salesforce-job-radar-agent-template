import crypto from "node:crypto";
import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const TRACKER_PATH = new URL("../../.cache/application-tracker.json", import.meta.url);
const STATE_KEY = "application_tracker";

const STATUS_ORDER = [
  "new",
  "shortlisted",
  "applied",
  "interview",
  "offer",
  "rejected",
  "ignored",
  "follow_up"
];
const ACTIONABLE_STATUSES = new Set(["new", "shortlisted", "follow_up"]);

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function nowIso() {
  return new Date().toISOString();
}

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

function deriveJobHash(job) {
  const explicit = String(job?.job_hash || "").trim();
  if (explicit) return explicit;

  const raw = [
    normalizeText(job?.source_job_id),
    normalizeApplyLink(job?.apply_link),
    normalizeText(job?.title),
    normalizeText(job?.company),
    normalizeText(job?.location),
    normalizeText(job?.experience)
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getAutoFollowUpHours() {
  const value = Number(process.env.TRACKER_AUTO_FOLLOWUP_HOURS || 36);
  if (!Number.isFinite(value)) return 36;
  return Math.max(1, value);
}

function isEnabled() {
  return isTruthy(process.env.APPLICATION_TRACKER_ENABLED || "true");
}

function normalizeStatus(value, fallback = "new") {
  const status = String(value || "").trim().toLowerCase();
  if (STATUS_ORDER.includes(status)) return status;
  return fallback;
}

async function readTrackerState() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);

    if (Array.isArray(payload)) {
      return { records: payload };
    }
    if (Array.isArray(payload?.records)) {
      return { records: payload.records };
    }
    return { records: [] };
  }

  try {
    const parsed = await readJsonFile(TRACKER_PATH);

    if (Array.isArray(parsed)) {
      return { records: parsed };
    }
    if (Array.isArray(parsed?.records)) {
      return { records: parsed.records };
    }
    return { records: [] };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { records: [] };
    }
    console.log("⚠️ Application tracker read failed:", error.message);
    return { records: [] };
  }
}

async function writeTrackerState(state) {
  const payload = {
    records: Array.isArray(state?.records) ? state.records : [],
    updated_at: nowIso()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(TRACKER_PATH, payload);
}

function makeRecord(job, { status = "new", event = "discovered" } = {}) {
  const ts = nowIso();
  const normalizedStatus = normalizeStatus(status, "new");
  const hash = deriveJobHash(job);
  const followUpAt = new Date(
    Date.now() + getAutoFollowUpHours() * 60 * 60 * 1000
  ).toISOString();

  return {
    job_hash: hash,
    status: normalizedStatus,
    title: String(job?.title || "").trim(),
    company: String(job?.company || "").trim(),
    location: String(job?.location || "").trim(),
    experience: String(job?.experience || "").trim(),
    apply_link: String(job?.apply_link || "").trim(),
    source_job_id: String(job?.source_job_id || "").trim(),
    source_variants: Array.isArray(job?.source_variants)
      ? [...new Set(job.source_variants.map(value => String(value || "").trim()).filter(Boolean))]
      : [],
    match_score: Number.isFinite(Number(job?.match_score))
      ? Number(job.match_score)
      : null,
    created_at: ts,
    updated_at: ts,
    last_seen_at: ts,
    last_alerted_at: event === "alerted" ? ts : null,
    follow_up_at: followUpAt,
    applied_at: null,
    interview_at: null,
    offer_at: null,
    rejected_at: null,
    ignored_at: null,
    notes: []
  };
}

function mergeRecord(existing, job, { event = "discovered" } = {}) {
  const ts = nowIso();
  const mergedVariants = new Set([
    ...(Array.isArray(existing?.source_variants) ? existing.source_variants : []),
    ...(Array.isArray(job?.source_variants) ? job.source_variants : [])
  ]);

  return {
    ...existing,
    title: String(job?.title || existing?.title || "").trim(),
    company: String(job?.company || existing?.company || "").trim(),
    location: String(job?.location || existing?.location || "").trim(),
    experience: String(job?.experience || existing?.experience || "").trim(),
    apply_link: String(job?.apply_link || existing?.apply_link || "").trim(),
    source_job_id: String(job?.source_job_id || existing?.source_job_id || "").trim(),
    source_variants: [...mergedVariants].map(value => String(value || "").trim()).filter(Boolean),
    match_score: Number.isFinite(Number(job?.match_score))
      ? Number(job.match_score)
      : existing?.match_score ?? null,
    updated_at: ts,
    last_seen_at: ts,
    last_alerted_at: event === "alerted" ? ts : existing?.last_alerted_at || null
  };
}

function buildStatusCounts(records) {
  const counts = Object.fromEntries(STATUS_ORDER.map(status => [status, 0]));

  for (const record of records) {
    const status = normalizeStatus(record?.status, "new");
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function sortByRecent(records) {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a?.last_alerted_at || a?.updated_at || a?.created_at || 0);
    const bTime = Date.parse(b?.last_alerted_at || b?.updated_at || b?.created_at || 0);
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function resolveRecordIndex(records, jobHashOrPrefix) {
  const key = String(jobHashOrPrefix || "").trim();
  if (!key) {
    throw new Error("job_hash is required");
  }

  const exactIdx = records.findIndex(
    record => String(record?.job_hash || "").trim() === key
  );
  if (exactIdx !== -1) {
    return exactIdx;
  }

  const prefixMatches = records
    .map((record, idx) => ({
      idx,
      hash: String(record?.job_hash || "").trim()
    }))
    .filter(item => item.hash.startsWith(key));

  if (prefixMatches.length === 1) {
    return prefixMatches[0].idx;
  }

  if (prefixMatches.length > 1) {
    throw new Error(
      `job_hash prefix is ambiguous: ${key} (${prefixMatches
        .slice(0, 5)
        .map(item => item.hash.slice(0, 12))
        .join(", ")})`
    );
  }

  throw new Error(`job_hash not found: ${key}`);
}

export async function registerApplicationJobs(jobs, options = {}) {
  if (!isEnabled()) {
    return { added: 0, updated: 0, total: 0 };
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    const state = await readTrackerState();
    return { added: 0, updated: 0, total: state.records.length };
  }

  const state = await readTrackerState();
  const records = Array.isArray(state.records) ? state.records : [];
  const byHash = new Map(
    records.map(record => [String(record?.job_hash || "").trim(), record])
  );

  let added = 0;
  let updated = 0;
  const event = String(options.event || "discovered").trim().toLowerCase();
  const defaultStatus = normalizeStatus(options.defaultStatus || "new", "new");

  for (const job of jobs) {
    const hash = deriveJobHash(job);
    if (!hash) continue;

    const existing = byHash.get(hash);
    if (!existing) {
      const created = makeRecord(job, {
        status: defaultStatus,
        event
      });
      byHash.set(hash, created);
      added += 1;
      continue;
    }

    const merged = mergeRecord(existing, job, { event });
    byHash.set(hash, merged);
    updated += 1;
  }

  const nextRecords = [...byHash.values()];
  await writeTrackerState({ records: nextRecords });

  return {
    added,
    updated,
    total: nextRecords.length
  };
}

export async function autoPromoteFollowUpJobs() {
  if (!isEnabled()) {
    return { changed: 0, total: 0 };
  }

  const state = await readTrackerState();
  const records = Array.isArray(state.records) ? state.records : [];
  const thresholdHours = getAutoFollowUpHours();
  const now = Date.now();
  let changed = 0;

  for (const record of records) {
    const status = normalizeStatus(record?.status, "new");
    if (status !== "new") continue;

    const alertedAt = Date.parse(record?.last_alerted_at || record?.updated_at || record?.created_at || 0);
    if (!Number.isFinite(alertedAt)) continue;
    const ageHours = (now - alertedAt) / (1000 * 60 * 60);
    if (ageHours < thresholdHours) continue;

    record.status = "follow_up";
    record.follow_up_at = nowIso();
    record.updated_at = nowIso();
    changed += 1;
  }

  if (changed > 0) {
    await writeTrackerState({ records });
  }

  return {
    changed,
    total: records.length
  };
}

export async function getApplicationTrackerSummary(options = {}) {
  const state = await readTrackerState();
  const records = Array.isArray(state.records) ? state.records : [];
  const counts = buildStatusCounts(records);
  const actionableLimit = Math.max(
    1,
    Number(options.limit || process.env.TRACKER_ACTIONABLE_LIMIT || 10)
  );
  const actionable = sortByRecent(
    records.filter(record => ACTIONABLE_STATUSES.has(normalizeStatus(record?.status, "new")))
  )
    .slice(0, actionableLimit)
    .map(record => ({
      job_hash: record.job_hash,
      status: normalizeStatus(record.status, "new"),
      title: record.title,
      company: record.company,
      location: record.location,
      apply_link: record.apply_link,
      last_alerted_at: record.last_alerted_at
    }));

  return {
    enabled: isEnabled(),
    total: records.length,
    counts,
    actionable
  };
}

export async function listTrackedApplications(options = {}) {
  const state = await readTrackerState();
  const records = Array.isArray(state.records) ? state.records : [];
  const status = options.status
    ? normalizeStatus(options.status, "new")
    : "";
  const limit = Math.max(1, Number(options.limit || 20));

  const filtered = status
    ? records.filter(record => normalizeStatus(record?.status, "new") === status)
    : records;

  return sortByRecent(filtered).slice(0, limit);
}

export async function setTrackedApplicationStatus(jobHash, status, note = "") {
  const hash = String(jobHash || "").trim();
  if (!hash) {
    throw new Error("job_hash is required");
  }
  const nextStatus = normalizeStatus(status, "new");

  const state = await readTrackerState();
  const records = Array.isArray(state.records) ? state.records : [];
  const idx = resolveRecordIndex(records, hash);

  const ts = nowIso();
  const record = {
    ...records[idx],
    status: nextStatus,
    updated_at: ts
  };

  if (nextStatus === "applied") record.applied_at = ts;
  if (nextStatus === "interview") record.interview_at = ts;
  if (nextStatus === "offer") record.offer_at = ts;
  if (nextStatus === "rejected") record.rejected_at = ts;
  if (nextStatus === "ignored") record.ignored_at = ts;

  if (note) {
    record.notes = Array.isArray(record.notes) ? record.notes : [];
    record.notes.push({
      at: ts,
      text: String(note).trim().slice(0, 400)
    });
  }

  records[idx] = record;
  await writeTrackerState({ records });
  return record;
}

export async function addTrackedApplicationNote(jobHash, note) {
  const hash = String(jobHash || "").trim();
  const noteText = String(note || "").trim();
  if (!hash) {
    throw new Error("job_hash is required");
  }
  if (!noteText) {
    throw new Error("note is required");
  }

  const state = await readTrackerState();
  const records = Array.isArray(state.records) ? state.records : [];
  const idx = resolveRecordIndex(records, hash);

  const ts = nowIso();
  const record = {
    ...records[idx],
    updated_at: ts,
    notes: Array.isArray(records[idx].notes) ? records[idx].notes : []
  };
  record.notes.push({
    at: ts,
    text: noteText.slice(0, 400)
  });
  records[idx] = record;
  await writeTrackerState({ records });
  return record;
}
