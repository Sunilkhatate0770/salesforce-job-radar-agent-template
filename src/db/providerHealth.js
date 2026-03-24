import {
  readSupabaseJsonState,
  usesSupabaseStateBackend,
  writeSupabaseJsonState
} from "./stateStore.js";
import { readJsonFile, writeJsonFile } from "../utils/localJsonFile.js";

const STATE_PATH = new URL("../../.cache/provider-health.json", import.meta.url);
const STATE_KEY = "provider_health";

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function getEmptyState() {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    providers: {}
  };
}

function normalizeState(parsed) {
  return {
    version: Number(parsed?.version || 1) || 1,
    updated_at:
      String(parsed?.updated_at || "").trim() || new Date().toISOString(),
    providers:
      parsed && typeof parsed.providers === "object" && parsed.providers
        ? parsed.providers
        : {}
  };
}

async function readState() {
  if (usesSupabaseStateBackend()) {
    const payload = await readSupabaseJsonState(STATE_KEY);
    return payload ? normalizeState(payload) : getEmptyState();
  }

  try {
    return normalizeState(await readJsonFile(STATE_PATH));
  } catch (error) {
    if (error.code === "ENOENT") {
      return getEmptyState();
    }
    console.log("⚠️ Provider health read failed:", error.message);
    return getEmptyState();
  }
}

async function writeState(state) {
  const payload = {
    version: 1,
    updated_at: new Date().toISOString(),
    providers:
      state && typeof state.providers === "object" && state.providers
        ? state.providers
        : {}
  };

  if (usesSupabaseStateBackend()) {
    await writeSupabaseJsonState(STATE_KEY, payload);
    return;
  }

  await writeJsonFile(STATE_PATH, payload);
}

function normalizeProviderKey(providerKey) {
  return String(providerKey || "")
    .trim()
    .toLowerCase();
}

function trimText(value, maxLength = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function classifyFailureKind(message) {
  const text = trimText(message, 400).toLowerCase();

  if (!text) return "unknown";
  if (
    /billing|payment required|quota|credits?|insufficient funds|usage limit|spend limit|monthly limit/.test(text)
  ) {
    return "billing";
  }
  if (/rate limit|too many requests|429|throttl/.test(text)) {
    return "rate_limit";
  }
  if (/captcha|recaptcha|cloudflare|blocked/.test(text)) {
    return "blocked";
  }
  if (/unauthorized|forbidden|401|403|invalid token|authentication/.test(text)) {
    return "auth";
  }
  if (/missing|not set|not configured|unknown provider|invalid configuration/.test(text)) {
    return "config";
  }
  if (
    /enotfound|etimedout|econn|network|socket|fetch failed|non-json|timed out|timeout/.test(text)
  ) {
    return "network";
  }

  return "unknown";
}

function getCooldownMinutes(kind) {
  const defaults = {
    billing: 360,
    rate_limit: 30,
    blocked: 180,
    auth: 180,
    config: 720,
    network: 20,
    unknown: 60
  };
  const envMap = {
    billing: "PROVIDER_BILLING_COOLDOWN_MINUTES",
    rate_limit: "PROVIDER_RATE_LIMIT_COOLDOWN_MINUTES",
    blocked: "PROVIDER_BLOCKED_COOLDOWN_MINUTES",
    auth: "PROVIDER_AUTH_COOLDOWN_MINUTES",
    config: "PROVIDER_CONFIG_COOLDOWN_MINUTES",
    network: "PROVIDER_NETWORK_COOLDOWN_MINUTES",
    unknown: "PROVIDER_UNKNOWN_COOLDOWN_MINUTES"
  };
  const raw = Number(process.env[envMap[kind]] || defaults[kind] || defaults.unknown);
  if (!Number.isFinite(raw)) {
    return defaults[kind] || defaults.unknown;
  }
  return Math.max(1, Math.floor(raw));
}

function shouldPauseFailures() {
  return isTruthy(process.env.PROVIDER_HEALTH_ENABLED || "true");
}

function getProviderRecord(state, providerKey) {
  return state.providers[providerKey] || {
    provider: providerKey,
    consecutive_failures: 0,
    disabled_until: "",
    last_status: "idle"
  };
}

function toIsoFuture(minutes) {
  return new Date(Date.now() + (minutes * 60 * 1000)).toISOString();
}

function isStillDisabled(record) {
  const until = String(record?.disabled_until || "").trim();
  if (!until) return false;

  const ms = Date.parse(until);
  if (!Number.isFinite(ms)) return false;
  return ms > Date.now();
}

export function buildPauseReason(record) {
  const failureKind = trimText(record?.last_failure_kind || "", 40) || "unknown";
  const until = trimText(record?.disabled_until || "", 40);
  const error = trimText(record?.last_error || "", 140);

  return [
    `Paused after ${failureKind} failure`,
    until ? `until ${until}` : "",
    error ? `(${error})` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export async function getProviderGate(providerKey) {
  const key = normalizeProviderKey(providerKey);
  const state = await readState();
  const record = getProviderRecord(state, key);
  const disabled = isStillDisabled(record);

  return {
    provider: key,
    state: record,
    shouldSkip: shouldPauseFailures() && disabled,
    retrying:
      shouldPauseFailures() &&
      !disabled &&
      Boolean(String(record?.disabled_until || "").trim())
  };
}

export async function markProviderSuccess(providerKey, details = {}) {
  const key = normalizeProviderKey(providerKey);
  const state = await readState();
  const record = getProviderRecord(state, key);
  const recovered =
    Boolean(String(record?.disabled_until || "").trim()) ||
    String(record?.last_status || "").trim().toLowerCase() === "failed" ||
    String(record?.last_status || "").trim().toLowerCase() === "paused";

  state.providers[key] = {
    ...record,
    provider: key,
    last_status: "success",
    last_success_at: new Date().toISOString(),
    last_recovered_at: recovered ? new Date().toISOString() : record.last_recovered_at || "",
    last_error: "",
    last_failure_kind: "",
    disabled_until: "",
    consecutive_failures: 0,
    last_note: trimText(details.note || "", 160)
  };

  await writeState(state);
  return {
    provider: key,
    recovered,
    state: state.providers[key]
  };
}

export async function markProviderFailure(providerKey, details = {}) {
  const key = normalizeProviderKey(providerKey);
  const state = await readState();
  const record = getProviderRecord(state, key);
  const rawMessage =
    trimText(details.error?.message || "", 240) ||
    trimText(details.error || "", 240) ||
    trimText(details.reason || "", 240);
  const kind =
    trimText(details.kind || "", 40).toLowerCase() ||
    classifyFailureKind(rawMessage);
  const cooldownMinutes = getCooldownMinutes(kind);
  const disabledUntil = shouldPauseFailures()
    ? toIsoFuture(cooldownMinutes)
    : "";

  state.providers[key] = {
    ...record,
    provider: key,
    last_status: shouldPauseFailures() ? "paused" : "failed",
    last_failure_at: new Date().toISOString(),
    last_failure_kind: kind,
    last_error: rawMessage,
    disabled_until: disabledUntil,
    consecutive_failures: Math.max(0, Number(record?.consecutive_failures || 0)) + 1
  };

  await writeState(state);
  return {
    provider: key,
    kind,
    cooldownMinutes,
    state: state.providers[key]
  };
}
