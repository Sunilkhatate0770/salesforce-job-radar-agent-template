function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function extractLastWorkflowActivityAt(run) {
  return normalize(
    run?.run_started_at ||
      run?.created_at ||
      run?.updated_at ||
      run?.completed_at
  );
}

export function extractLastLeaseActivityAt(lease) {
  return normalize(
    lease?.updated_at ||
      lease?.started_at ||
      lease?.expires_at
  );
}

export function decideSchedulerRun({
  mode = "fallback",
  latestRun = null,
  now = Date.now(),
  maxGapMinutes = 20
} = {}) {
  const normalizedMode = normalize(mode, "fallback").toLowerCase();

  if (normalizedMode === "disabled") {
    return {
      shouldRun: false,
      reason: "scheduler mode is disabled"
    };
  }

  if (normalizedMode === "always") {
    return {
      shouldRun: true,
      reason: "scheduler mode is always"
    };
  }

  if (!latestRun || typeof latestRun !== "object") {
    return {
      shouldRun: true,
      reason: "No GitHub workflow runs found"
    };
  }

  const lastActivityAt = extractLastWorkflowActivityAt(latestRun);
  const lastActivityMs = Date.parse(lastActivityAt);
  if (!Number.isFinite(lastActivityMs)) {
    return {
      shouldRun: true,
      reason: "Latest GitHub run timestamp is missing"
    };
  }

  const gapMinutes = (now - lastActivityMs) / 60000;
  const boundedGap = Math.max(5, toFiniteNumber(maxGapMinutes, 20));
  const status = normalize(latestRun?.status, "unknown");
  const conclusion = normalize(latestRun?.conclusion, "n/a");

  if (gapMinutes <= boundedGap) {
    return {
      shouldRun: false,
      reason:
        `GitHub workflow seen ${Math.round(gapMinutes)} minute(s) ago ` +
        `(${status}/${conclusion})`
    };
  }

  return {
    shouldRun: true,
    reason:
      `GitHub workflow gap ${gapMinutes.toFixed(1)} minute(s) exceeds ` +
      `${boundedGap} minute(s) (${status}/${conclusion})`
  };
}

export function decideSharedLeaseFallback({
  latestLease = null,
  currentSource = "",
  now = Date.now(),
  maxGapMinutes = 20
} = {}) {
  if (!latestLease || typeof latestLease !== "object") {
    return {
      shouldRun: true,
      reason: "No shared lease heartbeat found"
    };
  }

  const current = normalize(currentSource, "unknown");
  const heartbeatSource = normalize(latestLease?.source, "unknown");
  const lastActivityAt = extractLastLeaseActivityAt(latestLease);
  const lastActivityMs = Date.parse(lastActivityAt);

  if (!Number.isFinite(lastActivityMs)) {
    return {
      shouldRun: true,
      reason: "Shared lease heartbeat timestamp is missing"
    };
  }

  const gapMinutes = (now - lastActivityMs) / 60000;
  const boundedGap = Math.max(5, toFiniteNumber(maxGapMinutes, 20));

  if (heartbeatSource === current) {
    return {
      shouldRun: true,
      reason:
        `Shared lease heartbeat belongs to current source ${current}; ` +
        `allowing scheduled run`
    };
  }

  if (gapMinutes <= boundedGap) {
    return {
      shouldRun: false,
      reason:
        `Shared lease heartbeat seen ${Math.round(gapMinutes)} minute(s) ago ` +
        `from ${heartbeatSource}`
    };
  }

  return {
    shouldRun: true,
    reason:
      `Shared lease heartbeat gap ${gapMinutes.toFixed(1)} minute(s) exceeds ` +
      `${boundedGap} minute(s) from ${heartbeatSource}`
  };
}
