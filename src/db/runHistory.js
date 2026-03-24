import crypto from "node:crypto";
import { isSupabaseEnabled, supabase } from "./supabase.js";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function trimText(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function normalizeDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }

  return details;
}

function isRunHistoryEnabled() {
  return isTruthy(process.env.RUN_HISTORY_ENABLED || "true");
}

function getRunHistoryTable() {
  return normalize(process.env.RUN_HISTORY_TABLE, "agent_run_history");
}

function canWriteRunHistory() {
  return isRunHistoryEnabled() && isSupabaseEnabled();
}

function buildRunKey(source) {
  return [
    normalize(source, "agent"),
    Date.now(),
    crypto.randomUUID().slice(0, 8)
  ].join(":");
}

async function updateRunHistory(runKey, payload) {
  if (!canWriteRunHistory() || !runKey) {
    return false;
  }

  const { error } = await supabase
    .from(getRunHistoryTable())
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq("run_key", runKey);

  if (error) {
    throw error;
  }

  return true;
}

export async function startRunHistory({ source = "", note = "", details = {} } = {}) {
  if (!canWriteRunHistory()) {
    return {
      enabled: false,
      runKey: "",
      finish: async () => false
    };
  }

  const now = new Date().toISOString();
  const runKey = buildRunKey(source);
  const payload = {
    run_key: runKey,
    source: normalize(source, "unknown"),
    status: "running",
    note: trimText(note, 180),
    started_at: now,
    created_at: now,
    updated_at: now,
    details: normalizeDetails(details)
  };

  try {
    const { error } = await supabase.from(getRunHistoryTable()).insert(payload);
    if (error) {
      throw error;
    }
  } catch (error) {
    console.log("⚠️ Run history start failed:", trimText(error.message));
    return {
      enabled: false,
      runKey: "",
      finish: async () => false
    };
  }

  return {
    enabled: true,
    runKey,
    finish: async fields => finishRunHistory(runKey, fields)
  };
}

export async function finishRunHistory(runKey, fields = {}) {
  if (!canWriteRunHistory() || !runKey) {
    return false;
  }

  const payload = {
    status: normalize(fields.status, "succeeded"),
    note: trimText(fields.note, 180),
    source_summary: trimText(fields.sourceSummary, 180),
    finished_at: new Date().toISOString(),
    fetched_count: normalizeInteger(fields.fetchedCount),
    salesforce_count: normalizeInteger(fields.salesforceCount),
    new_jobs_count: normalizeInteger(fields.newJobsCount),
    pending_count: normalizeInteger(fields.pendingCount),
    alerts_sent_count: normalizeInteger(fields.alertsSentCount),
    error_message: trimText(fields.errorMessage, 400),
    details: normalizeDetails(fields.details)
  };

  try {
    return await updateRunHistory(runKey, payload);
  } catch (error) {
    console.log("⚠️ Run history finish failed:", trimText(error.message));
    return false;
  }
}

export async function getLatestSuccessfulRun() {
  if (!canWriteRunHistory()) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from(getRunHistoryTable())
      .select("*")
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  } catch (error) {
    console.log("⚠️ Run history read failed:", trimText(error.message));
    return null;
  }
}
