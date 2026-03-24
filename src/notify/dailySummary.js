import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "../db/stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const STATE_PATH = new URL("../../.cache/daily-summary-state.json", import.meta.url);
const STATE_KEY = "daily_summary_state";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function getLocalDateParts(timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter
    .formatToParts(new Date())
    .reduce((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0)
  };
}

function normalizeState(parsed) {
  return {
    last_sent_date: String(parsed?.last_sent_date || "")
  };
}

async function readState() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return normalizeState(payload);
  }

  try {
    return normalizeState(await readJsonFile(STATE_PATH));
  } catch (error) {
    if (error.code === "ENOENT") {
      return { last_sent_date: "" };
    }
    console.log("⚠️ Daily summary state read failed:", error.message);
    return { last_sent_date: "" };
  }
}

async function writeState(state) {
  const payload = {
    ...normalizeState(state),
    updated_at: new Date().toISOString()
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(STATE_PATH, payload);
}

export async function shouldSendDailySummary() {
  const enabled = isTruthy(process.env.DAILY_SUMMARY_ENABLED || "true");
  if (!enabled) {
    return { shouldSend: false, reason: "disabled", dateKey: "" };
  }

  const timezone = String(process.env.DAILY_SUMMARY_TIMEZONE || "Asia/Kolkata");
  const triggerHour = Math.max(
    0,
    Math.min(23, Number(process.env.DAILY_SUMMARY_HOUR || 21))
  );
  const { dateKey, hour } = getLocalDateParts(timezone);

  if (hour < triggerHour) {
    return {
      shouldSend: false,
      reason: "before_trigger_hour",
      dateKey,
      timezone,
      hour,
      triggerHour
    };
  }

  const state = await readState();
  if (state.last_sent_date === dateKey) {
    return {
      shouldSend: false,
      reason: "already_sent_today",
      dateKey,
      timezone,
      hour,
      triggerHour
    };
  }

  return {
    shouldSend: true,
    reason: "ready",
    dateKey,
    timezone,
    hour,
    triggerHour
  };
}

export async function markDailySummarySent(dateKey) {
  const normalized = String(dateKey || "").trim();
  if (!normalized) return;
  await writeState({ last_sent_date: normalized });
}
