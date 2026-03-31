import "dotenv/config";
import { isSupabaseEnabled, supabase } from "../db/supabase.js";

function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    timeZone: process.env.TZ || "Asia/Calcutta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function parseArgs(argv) {
  const options = {
    limit: 12,
    source: "",
    json: false
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Math.max(1, Math.min(100, toNumber(arg.split("=")[1], 12)));
      continue;
    }
    if (arg.startsWith("--source=")) {
      options.source = normalize(arg.split("=")[1]);
    }
  }

  return options;
}

function getRunHistoryTable() {
  return normalize(process.env.RUN_HISTORY_TABLE, "agent_run_history");
}

function summarizeRun(run) {
  const details = run?.details || {};
  const providerCoverage = details.providerCoverage || {};
  const opportunitySummary =
    providerCoverage.opportunity_summary || details.classificationSummary || {};
  const lastNotification = details.lastNotification || {};

  return {
    source: normalize(run?.source, "unknown"),
    status: normalize(run?.status, "unknown"),
    started_at: run?.started_at || "",
    finished_at: run?.finished_at || "",
    new_jobs_count: toNumber(run?.new_jobs_count),
    alerts_sent_count: toNumber(run?.alerts_sent_count),
    listing_count: toNumber(
      providerCoverage.listing_count,
      toNumber(opportunitySummary?.by_kind?.listing)
    ),
    post_count: toNumber(
      providerCoverage.post_count,
      toNumber(opportunitySummary?.by_kind?.post)
    ),
    medium_count: toNumber(
      providerCoverage.medium_count,
      toNumber(opportunitySummary?.by_confidence?.medium)
    ),
    paused_providers: Array.isArray(providerCoverage.paused_providers)
      ? providerCoverage.paused_providers
      : [],
    zero_result_providers: Array.isArray(providerCoverage.zero_result_providers)
      ? providerCoverage.zero_result_providers
      : [],
    coverage_alerts: Array.isArray(details.coverageAlerts)
      ? details.coverageAlerts.map(alert => normalize(alert?.signature || alert?.title))
      : [],
    telegram_ok: Boolean(lastNotification?.telegramOk),
    email_ok: Boolean(lastNotification?.emailOk),
    subject: normalize(lastNotification?.subject),
    source_summary: normalize(run?.source_summary || details?.sourceSummary),
    note: normalize(run?.note || details?.note)
  };
}

function buildAggregate(runs) {
  const aggregate = {
    total_runs: runs.length,
    succeeded_runs: runs.filter(run => run.status === "succeeded").length,
    total_new_jobs: 0,
    total_alerts_sent: 0,
    total_listings: 0,
    total_posts: 0,
    total_medium_review: 0,
    zero_post_streak: 0,
    zero_post_streak_source: "",
    paused_providers: new Set(),
    zero_result_providers: new Set(),
    coverage_alerts: new Set()
  };

  for (const run of runs) {
    aggregate.total_new_jobs += run.new_jobs_count;
    aggregate.total_alerts_sent += run.alerts_sent_count;
    aggregate.total_listings += run.listing_count;
    aggregate.total_posts += run.post_count;
    aggregate.total_medium_review += run.medium_count;

    for (const provider of run.paused_providers) {
      aggregate.paused_providers.add(provider);
    }
    for (const provider of run.zero_result_providers) {
      aggregate.zero_result_providers.add(provider);
    }
    for (const alert of run.coverage_alerts) {
      aggregate.coverage_alerts.add(alert);
    }
  }

  for (const run of runs) {
    if (run.post_count > 0) {
      break;
    }
    aggregate.zero_post_streak += 1;
    aggregate.zero_post_streak_source = run.source;
  }

  return {
    ...aggregate,
    paused_providers: Array.from(aggregate.paused_providers),
    zero_result_providers: Array.from(aggregate.zero_result_providers),
    coverage_alerts: Array.from(aggregate.coverage_alerts)
  };
}

function printTextReport(runs, aggregate, options) {
  console.log("Job Radar coverage report");
  console.log(
    `- scope: ${options.source || "all sources"} | recent runs: ${aggregate.total_runs}`
  );
  console.log(
    `- succeeded: ${aggregate.succeeded_runs}/${aggregate.total_runs} | new jobs: ${aggregate.total_new_jobs} | alerts sent: ${aggregate.total_alerts_sent}`
  );
  console.log(
    `- listings: ${aggregate.total_listings} | posts: ${aggregate.total_posts} | medium review: ${aggregate.total_medium_review}`
  );
  console.log(
    `- zero-post streak: ${aggregate.zero_post_streak} recent run(s)${
      aggregate.zero_post_streak_source
        ? ` on ${aggregate.zero_post_streak_source}`
        : ""
    }`
  );
  console.log(
    `- paused providers: ${
      aggregate.paused_providers.join(", ") || "none"
    }`
  );
  console.log(
    `- zero-result providers seen: ${
      aggregate.zero_result_providers.join(", ") || "none"
    }`
  );
  console.log(
    `- coverage alerts seen: ${
      aggregate.coverage_alerts.join(", ") || "none"
    }`
  );

  console.log("\nRecent runs");
  for (const run of runs) {
    console.log(
      `- ${formatDateTime(run.started_at)} | ${run.source} | ${run.status} | listings ${run.listing_count} | posts ${run.post_count} | review ${run.medium_count} | new ${run.new_jobs_count} | alerts ${run.alerts_sent_count} | telegram ${run.telegram_ok ? "ok" : "no"} | email ${run.email_ok ? "ok" : "no"}`
    );
    if (run.coverage_alerts.length > 0) {
      console.log(`  coverage: ${run.coverage_alerts.join(", ")}`);
    }
    if (run.source_summary) {
      console.log(`  sources: ${run.source_summary}`);
    }
    if (run.subject) {
      console.log(`  notify: ${run.subject}`);
    }
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (!isSupabaseEnabled()) {
    console.log(
      "Coverage report needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY in the environment."
    );
    process.exitCode = 1;
    return;
  }

  let query = supabase
    .from(getRunHistoryTable())
    .select(
      "source,status,started_at,finished_at,new_jobs_count,alerts_sent_count,source_summary,note,details"
    )
    .order("started_at", { ascending: false })
    .limit(options.limit);

  if (options.source) {
    query = query.eq("source", options.source);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const runs = Array.isArray(data) ? data.map(summarizeRun) : [];
  const aggregate = buildAggregate(runs);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          options,
          aggregate,
          runs
        },
        null,
        2
      )
    );
    return;
  }

  printTextReport(runs, aggregate, options);
}

run().catch(error => {
  console.log("Coverage report failed:", error.message);
  process.exitCode = 1;
});
