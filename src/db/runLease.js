import crypto from "node:crypto";
import { supabase, isSupabaseEnabled } from "./supabase.js";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getLeaseKey() {
  return normalize(process.env.RUN_LEASE_KEY, "salesforce-job-radar-agent");
}

function getLeaseDurationMinutes() {
  return Math.max(
    5,
    toFiniteNumber(process.env.RUN_LEASE_DURATION_MINUTES, 25)
  );
}

function isLeaseEnabled() {
  return isTruthy(process.env.RUN_LEASE_ENABLED || "false");
}

function isLeaseRequired() {
  return isTruthy(process.env.RUN_LEASE_REQUIRED || "false");
}

function trimText(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function buildHolderId(source) {
  return [
    normalize(source, "agent"),
    normalize(process.env.HOSTNAME || process.env.COMPUTERNAME || "host"),
    process.pid,
    crypto.randomUUID().slice(0, 8)
  ].join(":");
}

function getLeasePayload({ leaseKey, holder, source, note }) {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (getLeaseDurationMinutes() * 60 * 1000)
  );

  return {
    lease_key: leaseKey,
    holder,
    source,
    note: trimText(note || "", 180),
    updated_at: now.toISOString(),
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  };
}

function isExpired(row) {
  const expiresAt = Date.parse(String(row?.expires_at || ""));
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

async function insertLease(payload) {
  const { data, error } = await supabase
    .from("agent_run_leases")
    .insert(payload)
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function readLease(leaseKey) {
  const { data, error } = await supabase
    .from("agent_run_leases")
    .select("*")
    .eq("lease_key", leaseKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getRunLeaseHeartbeat(leaseKey = getLeaseKey()) {
  if (!isSupabaseEnabled()) {
    return null;
  }

  try {
    return await readLease(leaseKey);
  } catch (error) {
    console.log("⚠️ Run lease heartbeat read failed:", trimText(error.message));
    return null;
  }
}

async function replaceExpiredLease(existing, payload) {
  const query = supabase
    .from("agent_run_leases")
    .update(payload)
    .eq("lease_key", payload.lease_key);

  if (existing?.holder) {
    query.eq("holder", existing.holder);
  }
  if (existing?.expires_at) {
    query.eq("expires_at", existing.expires_at);
  }

  const { data, error } = await query.select();

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function releaseLease(leaseKey, holder) {
  try {
    await supabase
      .from("agent_run_leases")
      .update({
        expires_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        note: "released"
      })
      .eq("lease_key", leaseKey)
      .eq("holder", holder);
  } catch (error) {
    console.log("⚠️ Run lease release failed:", error.message);
  }
}

export async function acquireRunLease({
  source = "",
  note = ""
} = {}) {
  if (!isLeaseEnabled()) {
    return {
      acquired: true,
      reason: "RUN_LEASE_ENABLED is false",
      release: async () => {}
    };
  }

  if (!isSupabaseEnabled()) {
    return {
      acquired: true,
      reason: "Supabase unavailable; proceeding without shared run lease",
      release: async () => {}
    };
  }

  const leaseKey = getLeaseKey();
  const holder = buildHolderId(source);
  const payload = getLeasePayload({
    leaseKey,
    holder,
    source: normalize(source, "unknown"),
    note
  });

  try {
    const inserted = await insertLease(payload);
    return {
      acquired: true,
      reason: "new lease acquired",
      lease: inserted,
      release: async () => releaseLease(leaseKey, holder)
    };
  } catch (error) {
    const message = trimText(error?.message || "");
    const duplicate =
      message.toLowerCase().includes("duplicate") ||
      String(error?.code || "") === "23505";

    if (!duplicate) {
      console.log("⚠️ Run lease insert failed:", message);
      if (isLeaseRequired()) {
        return {
          acquired: false,
          reason: `required lease failed: ${message || "unknown error"}`,
          release: async () => {}
        };
      }
      return {
        acquired: true,
        reason: `lease check bypassed: ${message || "unknown error"}`,
        release: async () => {}
      };
    }
  }

  try {
    const existing = await readLease(leaseKey);

    if (!existing) {
      const inserted = await insertLease(payload);
      return {
        acquired: true,
        reason: "lease acquired after retry",
        lease: inserted,
        release: async () => releaseLease(leaseKey, holder)
      };
    }

    if (!isExpired(existing)) {
      return {
        acquired: false,
        reason:
          `lease held by ${normalize(existing.holder, "another runner")} ` +
          `until ${normalize(existing.expires_at, "unknown")}`,
        release: async () => {}
      };
    }

    const replaced = await replaceExpiredLease(existing, payload);
    if (!replaced) {
      return {
        acquired: false,
        reason: "lease takeover lost to another runner",
        release: async () => {}
      };
    }

    return {
      acquired: true,
      reason: "expired lease taken over",
      lease: replaced,
      release: async () => releaseLease(leaseKey, holder)
    };
  } catch (error) {
    console.log("⚠️ Run lease read/update failed:", trimText(error.message));
    if (isLeaseRequired()) {
      return {
        acquired: false,
        reason: `required lease failed: ${trimText(error.message)}`,
        release: async () => {}
      };
    }
    return {
      acquired: true,
      reason: `lease check bypassed: ${trimText(error.message)}`,
      release: async () => {}
    };
  }
}
