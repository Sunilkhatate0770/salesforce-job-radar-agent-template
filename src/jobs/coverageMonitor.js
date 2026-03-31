import {
  readSupabaseJsonState,
  writeSupabaseJsonState
} from "../db/stateStore.js";

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function uniqueList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => normalizeText(value)).filter(Boolean))];
}

function getStateKey(runSource) {
  const prefix = normalizeText(
    process.env.COVERAGE_MONITOR_STATE_KEY || "coverage_monitor"
  );
  const suffix = normalizeText(runSource || "agent")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "agent";
  return `${prefix}:${suffix}`;
}

function getIsoNow() {
  return new Date().toISOString();
}

function getCooldownMs() {
  return Math.max(
    5,
    toNumber(process.env.COVERAGE_ALERT_COOLDOWN_MINUTES, 240)
  ) * 60 * 1000;
}

function computeStreakMap(previous, currentValues) {
  const previousMap = previous && typeof previous === "object" ? previous : {};
  const currentSet = new Set(uniqueList(currentValues));
  const next = {};

  for (const value of currentSet) {
    next[value] = toNumber(previousMap[value], 0) + 1;
  }

  return next;
}

function computeAverage(values) {
  const list = (Array.isArray(values) ? values : [])
    .map(value => toNumber(value, 0))
    .filter(value => value >= 0);
  if (list.length === 0) {
    return 0;
  }
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function buildAlert(signature, title, summary, lines = [], severity = "warning") {
  return {
    signature,
    title,
    summary,
    lines: lines.filter(Boolean).map(line => normalizeText(line)),
    severity
  };
}

function shouldSendAlert(signature, lastAlertAt, nowMs, cooldownMs) {
  const previous = Date.parse(String(lastAlertAt?.[signature] || ""));
  if (!Number.isFinite(previous)) {
    return true;
  }
  return nowMs - previous >= cooldownMs;
}

export async function monitorCoverageHealth(providerCoverage, { runSource = "agent" } = {}) {
  if (!isTruthy(process.env.COVERAGE_MONITOR_ENABLED || "true")) {
    return {
      stateKey: getStateKey(runSource),
      alerts: [],
      state: null
    };
  }

  const summary = providerCoverage?.opportunity_summary || {};
  const totalCount = toNumber(summary?.merged_count, 0);
  const listingCount = toNumber(providerCoverage?.listing_count, 0);
  const postCount = toNumber(providerCoverage?.post_count, 0);
  const mediumCount = toNumber(providerCoverage?.medium_count, 0);
  const pausedProviders = uniqueList(providerCoverage?.paused_providers);
  const zeroResultProviders = uniqueList(providerCoverage?.zero_result_providers);
  const stateKey = getStateKey(runSource);
  const previousState = await readSupabaseJsonState(stateKey);
  const historyWindow = Math.max(3, toNumber(process.env.COVERAGE_BASELINE_WINDOW, 8));
  const previousTotals = Array.isArray(previousState?.total_history)
    ? previousState.total_history.slice(-historyWindow)
    : [];
  const baselineAverage = computeAverage(previousTotals);
  const dropRatio = Math.min(
    0.95,
    Math.max(0.05, toNumber(process.env.COVERAGE_TOTAL_DROP_RATIO, 0.45))
  );
  const baselineMinTotal = Math.max(
    1,
    toNumber(process.env.COVERAGE_BASELINE_MIN_TOTAL, 8)
  );
  const postZeroThreshold = Math.max(
    1,
    toNumber(process.env.COVERAGE_POST_ZERO_RUN_THRESHOLD, 4)
  );
  const pauseThreshold = Math.max(
    1,
    toNumber(process.env.COVERAGE_PROVIDER_PAUSE_RUN_THRESHOLD, 2)
  );
  const zeroResultThreshold = Math.max(
    1,
    toNumber(process.env.COVERAGE_ZERO_RESULT_RUN_THRESHOLD, 3)
  );
  const nowIso = getIsoNow();
  const nowMs = Date.parse(nowIso);
  const cooldownMs = getCooldownMs();
  const nextState = {
    updated_at: nowIso,
    total_history: [...previousTotals, totalCount].slice(-historyWindow),
    post_zero_streak: postCount === 0 ? toNumber(previousState?.post_zero_streak, 0) + 1 : 0,
    paused_provider_streaks: computeStreakMap(previousState?.paused_provider_streaks, pausedProviders),
    zero_result_provider_streaks: computeStreakMap(previousState?.zero_result_provider_streaks, zeroResultProviders),
    last_alert_at: previousState?.last_alert_at && typeof previousState.last_alert_at === "object"
      ? { ...previousState.last_alert_at }
      : {},
    last_snapshot: {
      totalCount,
      listingCount,
      postCount,
      mediumCount,
      pausedProviders,
      zeroResultProviders,
      baselineAverage
    }
  };

  const pendingAlerts = [];

  if (postCount === 0 && nextState.post_zero_streak >= postZeroThreshold) {
    pendingAlerts.push(
      buildAlert(
        "post-coverage-zero",
        "Hiring-post coverage dropped to zero",
        `No hiring-post opportunities were captured for ${nextState.post_zero_streak} consecutive run(s).`,
        [
          `Listings this run: ${listingCount}`,
          `Posts this run: ${postCount}`,
          baselineAverage > 0 ? `Recent average total opportunities: ${baselineAverage.toFixed(1)}` : "",
          zeroResultProviders.length > 0 ? `Zero-result providers: ${zeroResultProviders.join(", ")}` : ""
        ]
      )
    );
  }

  for (const provider of pausedProviders) {
    const streak = toNumber(nextState.paused_provider_streaks?.[provider], 0);
    if (streak < pauseThreshold) {
      continue;
    }
    pendingAlerts.push(
      buildAlert(
        `provider-paused:${provider}`,
        "Provider paused",
        `${provider} has been paused for ${streak} consecutive run(s).`,
        [
          `Paused providers: ${pausedProviders.join(", ")}`,
          `Zero-result providers: ${zeroResultProviders.join(", ") || "None"}`,
          `Total opportunities this run: ${totalCount}`
        ]
      )
    );
  }

  for (const provider of zeroResultProviders) {
    const streak = toNumber(nextState.zero_result_provider_streaks?.[provider], 0);
    if (streak < zeroResultThreshold) {
      continue;
    }
    pendingAlerts.push(
      buildAlert(
        `provider-zero:${provider}`,
        "Provider returned zero results repeatedly",
        `${provider} returned zero results for ${streak} consecutive run(s).`,
        [
          `Total opportunities this run: ${totalCount}`,
          `Listings this run: ${listingCount}`,
          `Posts this run: ${postCount}`
        ]
      )
    );
  }

  if (
    baselineAverage >= baselineMinTotal &&
    totalCount < Math.max(1, Math.floor(baselineAverage * dropRatio))
  ) {
    pendingAlerts.push(
      buildAlert(
        "total-coverage-drop",
        "Overall opportunity volume dropped",
        `This run produced ${totalCount} opportunities against a recent average of ${baselineAverage.toFixed(1)}.`,
        [
          `Listings this run: ${listingCount}`,
          `Posts this run: ${postCount}`,
          `Medium-confidence review queue: ${mediumCount}`
        ]
      )
    );
  }

  const alerts = pendingAlerts.filter(alert =>
    shouldSendAlert(alert.signature, nextState.last_alert_at, nowMs, cooldownMs)
  );

  for (const alert of alerts) {
    nextState.last_alert_at[alert.signature] = nowIso;
  }

  await writeSupabaseJsonState(stateKey, nextState);

  return {
    stateKey,
    alerts,
    state: nextState
  };
}

export function buildCoverageAlertMessages({
  agentName,
  runSource,
  providerCoverage,
  alerts
}) {
  const summary = providerCoverage?.opportunity_summary || {};
  const listings = toNumber(providerCoverage?.listing_count, toNumber(summary?.by_kind?.listing, 0));
  const posts = toNumber(providerCoverage?.post_count, toNumber(summary?.by_kind?.post, 0));
  const review = toNumber(providerCoverage?.medium_count, toNumber(summary?.by_confidence?.medium, 0));
  const sourceCounts = summary?.by_source && typeof summary.by_source === "object"
    ? Object.entries(summary.by_source)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([source, count]) => `${source}: ${count}`)
        .join(" | ")
    : "";
  const paused = uniqueList(providerCoverage?.paused_providers).join(", ") || "None";
  const zeroResult = uniqueList(providerCoverage?.zero_result_providers).join(", ") || "None";
  const alertList = Array.isArray(alerts) ? alerts : [];

  const telegramBody = alertList
    .map((alert, index) =>
      `<b>${index + 1}. ${alert.title}</b>\n` +
      `${alert.summary}\n` +
      alert.lines.map(line => `- ${line}`).join("\n")
    )
    .join("\n\n");
  const emailTextBody = alertList
    .map((alert, index) =>
      `${index + 1}. ${alert.title}\n` +
      `${alert.summary}\n` +
      alert.lines.map(line => `- ${line}`).join("\n")
    )
    .join("\n\n");
  const emailHtmlBody = alertList
    .map((alert, index) =>
      `<div style="margin:0 0 16px 0;padding:16px;border:1px solid #fed7aa;border-radius:16px;background:#fff7ed;">` +
      `<div style="font-size:16px;font-weight:800;color:#9a3412;margin-bottom:8px;">${index + 1}. ${escapeHtml(alert.title)}</div>` +
      `<div style="font-size:14px;color:#7c2d12;margin-bottom:8px;">${escapeHtml(alert.summary)}</div>` +
      `<ul style="margin:0;padding-left:18px;color:#9a3412;">${alert.lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` +
      `</div>`
    )
    .join("");

  return {
    telegramText:
      `<b>${normalizeText(agentName || "Salesforce Job Radar Agent")} coverage alert</b>\n\n` +
      `Runner: <b>${escapeHtml(normalizeText(runSource || "agent"))}</b>\n` +
      `Listings: <b>${listings}</b> | Posts: <b>${posts}</b> | Review: <b>${review}</b>\n` +
      `Paused providers: <b>${escapeHtml(paused)}</b>\n` +
      `Zero-result providers: <b>${escapeHtml(zeroResult)}</b>\n` +
      `${sourceCounts ? `Source mix: ${escapeHtml(sourceCounts)}\n\n` : "\n"}` +
      telegramBody,
    emailSubject: `${normalizeText(agentName || "Salesforce Job Radar Agent")}: coverage alert`,
    emailText:
      `${normalizeText(agentName || "Salesforce Job Radar Agent")} coverage alert\n\n` +
      `Runner: ${normalizeText(runSource || "agent")}\n` +
      `Listings: ${listings} | Posts: ${posts} | Review: ${review}\n` +
      `Paused providers: ${paused}\n` +
      `Zero-result providers: ${zeroResult}\n` +
      `${sourceCounts ? `Source mix: ${sourceCounts}\n\n` : "\n"}` +
      emailTextBody,
    emailHtml:
      `<!doctype html><html><body style="margin:0;padding:24px;background:#fff7ed;font-family:Arial,sans-serif;color:#7c2d12;">` +
      `<div style="max-width:760px;margin:0 auto;">` +
      `<div style="padding:24px;border-radius:20px;background:#9a3412;color:#ffffff;">` +
      `<div style="font-size:28px;font-weight:800;margin-bottom:8px;">${escapeHtml(normalizeText(agentName || "Salesforce Job Radar Agent"))} coverage alert</div>` +
      `<div style="font-size:15px;line-height:1.7;">Runner: <strong>${escapeHtml(normalizeText(runSource || "agent"))}</strong></div>` +
      `<div style="font-size:15px;line-height:1.7;">Listings: <strong>${listings}</strong> | Posts: <strong>${posts}</strong> | Review: <strong>${review}</strong></div>` +
      `<div style="font-size:15px;line-height:1.7;">Paused providers: <strong>${escapeHtml(paused)}</strong></div>` +
      `<div style="font-size:15px;line-height:1.7;">Zero-result providers: <strong>${escapeHtml(zeroResult)}</strong></div>` +
      `${sourceCounts ? `<div style="font-size:15px;line-height:1.7;">Source mix: <strong>${escapeHtml(sourceCounts)}</strong></div>` : ""}` +
      `</div>` +
      `<div style="margin-top:18px;">${emailHtmlBody}</div>` +
      `</div></body></html>`
  };
}
