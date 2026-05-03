import { isSupabaseEnabled, supabase } from "../db/supabase.js";

export function parseMaybeArray(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(item => String(item || "").trim()).filter(Boolean);
  } catch (_) {
    // Fall through to comma/newline parsing.
  }
  return raw.split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
}

export function getJobRecordTime(job = {}) {
  const value = job.first_seen_at || job.firstSeenAt || job.created_at || job.createdAt || job.date_added || job.dateAdded ||
    job.posted_at || job.postedAt || job.posted_date || job.last_seen_at || job.lastSeenAt || job.updated_at || job.updatedAt;
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function probabilityFromScore(score) {
  const n = Number(score || 0);
  if (n >= 85) return "high";
  if (n >= 70) return "medium";
  return "stretch";
}

export function normalizeDashboardJob(row = {}, source = "") {
  const score = Number(row.match_score ?? row.score ?? row.resume_match_score ?? 75);
  const title = row.title || row.role || row.canonical_role || "Salesforce Role";
  const lastSeen = row.last_seen_at || row.lastSeenAt || row.updated_at || row.updatedAt || row.created_at || row.createdAt || row.date_added || row.dateAdded || "";
  const created = row.first_seen_at || row.firstSeenAt || row.created_at || row.createdAt || row.date_added || row.dateAdded || lastSeen || "";
  return {
    ...row,
    id: String(row.id || row._id || row.job_hash || ""),
    job_hash: row.job_hash || row.jobHash || "",
    title,
    role: row.role || title,
    company: row.company || row.canonical_company || "Confidential",
    location: row.location || row.loc || "India",
    experience: row.experience || "3-5 Yrs",
    apply_link: row.apply_link || row.url || row.canonical_apply_url || row.post_url || "",
    url: row.url || row.apply_link || row.canonical_apply_url || row.post_url || "",
    match_score: Number.isFinite(score) ? score : 75,
    probability: row.probability || row.prob || probabilityFromScore(score),
    status: row.board_status || row.status || "new",
    date_added: row.date_added || row.dateAdded || created,
    first_seen_at: row.first_seen_at || row.firstSeenAt || created,
    created_at: created,
    updated_at: row.updated_at || row.updatedAt || lastSeen,
    last_seen_at: lastSeen,
    posted_at: row.posted_at || row.postedAt || row.posted_date || "",
    matched_skills: parseMaybeArray(row.matched_skills || row.skills),
    missing_skills: parseMaybeArray(row.missing_skills),
    resume_actions: parseMaybeArray(row.resume_actions),
    source: source || row.source || row.source_platform || "dashboard"
  };
}

function getDashboardJobKey(job = {}) {
  if (job.job_hash) return `hash:${job.job_hash}`;
  const raw = [
    job.apply_link || job.url,
    job.company,
    job.title || job.role,
    job.location
  ].map(value => String(value || "").trim().toLowerCase()).join("|");
  return `raw:${raw}`;
}

export function mergeArrayValues(...values) {
  return [...new Set(values.flatMap(parseMaybeArray))];
}

export function mergeDashboardJobs(...groups) {
  const byKey = new Map();
  groups.flat().filter(Boolean).forEach(raw => {
    const job = normalizeDashboardJob(raw, raw.source);
    const key = getDashboardJobKey(job);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, job);
      return;
    }
    const newer = getJobRecordTime(job) >= getJobRecordTime(existing) ? job : existing;
    const older = newer === job ? existing : job;
    byKey.set(key, {
      ...older,
      ...newer,
      matched_skills: mergeArrayValues(older.matched_skills, newer.matched_skills),
      missing_skills: mergeArrayValues(older.missing_skills, newer.missing_skills),
      resume_actions: mergeArrayValues(older.resume_actions, newer.resume_actions),
      status: newer.status || older.status || "new",
      source: newer.source || older.source || "dashboard"
    });
  });
  return Array.from(byKey.values()).sort((a, b) => getJobRecordTime(b) - getJobRecordTime(a));
}

function normalizeFreshnessStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "new" || normalized === "shortlisted" || normalized === "follow_up") return "todo";
  if (normalized === "ignored") return "rejected";
  if (["todo", "applied", "interview", "offer", "rejected"].includes(normalized)) return normalized;
  return "todo";
}

export function getDashboardFreshnessDays() {
  return Math.max(1, Number(process.env.JOB_RADAR_MAX_BACKLOG_DAYS || 45));
}

export function filterDashboardFreshness(records = []) {
  const cutoff = Date.now() - getDashboardFreshnessDays() * 86400000;
  return records.filter(record => {
    const status = normalizeFreshnessStatus(record.board_status || record.status);
    if (status !== "todo") return true;
    const time = getJobRecordTime(record);
    return !time || time >= cutoff;
  });
}

export async function readSupabaseTrackerJobs() {
  if (!isSupabaseEnabled()) return [];
  const table = process.env.STATE_BACKEND_TABLE || "agent_state";
  try {
    const { data, error } = await supabase
      .from(table)
      .select("payload")
      .eq("state_key", "application_tracker")
      .maybeSingle();
    if (error) throw error;
    const records = Array.isArray(data?.payload)
      ? data.payload
      : Array.isArray(data?.payload?.records)
        ? data.payload.records
        : [];
    return records.map(record => normalizeDashboardJob(record, "Application Tracker"));
  } catch (err) {
    console.warn(`[Supabase] application_tracker unavailable: ${err.message}`);
    return [];
  }
}

export async function readSupabaseJobAlertRows(limit = 160) {
  if (!isSupabaseEnabled()) return [];
  try {
    const { data, error } = await supabase
      .from("job_alerts")
      .select("*")
      .order("first_seen_at", { ascending: false, nullsFirst: false })
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(record => normalizeDashboardJob(record, "Supabase Alerts"));
  } catch (err) {
    console.warn(`[Supabase] job_alerts unavailable: ${err.message}`);
    return [];
  }
}
