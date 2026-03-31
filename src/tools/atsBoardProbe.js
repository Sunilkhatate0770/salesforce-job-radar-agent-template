import "dotenv/config";
import {
  getEnabledAtsProviders,
  groupAtsBoardsByProvider,
  isAtsEnabled,
  loadAtsBoardRegistry
} from "../jobs/atsRegistry.js";
import { fetchAshbyJobs } from "../jobs/fetchAshby.js";
import { fetchGreenhouseJobs } from "../jobs/fetchGreenhouse.js";
import { fetchLeverJobs } from "../jobs/fetchLever.js";
import { filterSalesforceJobs } from "../jobs/filterSalesforceJobs.js";

const INDIA_LOCATION_KEYWORDS = [
  "india",
  "bengaluru",
  "bangalore",
  "hyderabad",
  "pune",
  "mumbai",
  "delhi",
  "gurugram",
  "gurgaon",
  "noida",
  "chennai",
  "kolkata",
  "ahmedabad",
  "coimbatore",
  "india remote"
];

const REMOTE_KEYWORDS = [
  "remote",
  "work from home",
  "wfh",
  "anywhere",
  "distributed"
];

const RESTRICTED_REMOTE_KEYWORDS = [
  "u.s.",
  "us only",
  "usa",
  "united states",
  "north america",
  "canada",
  "latin america",
  "europe",
  "emea",
  "uk",
  "united kingdom",
  "mexico",
  "australia",
  "new zealand",
  "ireland",
  "germany",
  "france",
  "japan"
];

function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeText(value) {
  return normalize(value).toLowerCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const options = {
    provider: "",
    json: false
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg.startsWith("--provider=")) {
      options.provider = normalizeText(arg.split("=")[1]);
    }
  }

  return options;
}

export function inferProbeLocationScope(job) {
  const location = normalizeText(job?.location);
  const combined = normalizeText(
    `${job?.location || ""} ${job?.description || ""} ${job?.title || ""}`
  );

  if (
    INDIA_LOCATION_KEYWORDS.some(keyword => location.includes(keyword)) ||
    INDIA_LOCATION_KEYWORDS.some(keyword => combined.includes(keyword))
  ) {
    return "india";
  }

  const hasRemoteInLocation = REMOTE_KEYWORDS.some(keyword => location.includes(keyword));
  const hasRemoteInCombined = REMOTE_KEYWORDS.some(keyword => combined.includes(keyword));
  const hasRestrictedLocation = RESTRICTED_REMOTE_KEYWORDS.some(keyword => location.includes(keyword));
  const hasRestrictedCombined = RESTRICTED_REMOTE_KEYWORDS.some(keyword => combined.includes(keyword));

  if (location && !hasRemoteInLocation) {
    return "other";
  }

  if (
    hasRemoteInLocation ||
    hasRemoteInCombined
  ) {
    if (hasRestrictedLocation || hasRestrictedCombined) {
      return "restricted_remote";
    }
    return "remote_open";
  }

  return "other";
}

function getFetcher(provider) {
  if (provider === "greenhouse") return fetchGreenhouseJobs;
  if (provider === "lever") return fetchLeverJobs;
  if (provider === "ashby") return fetchAshbyJobs;
  return null;
}

function buildRecommendation(board) {
  if (board.error) {
    return "investigate";
  }

  if (board.mode === "live") {
    if (board.geo_fit_salesforce_count > 0) {
      return "keep_live";
    }
    if (board.salesforce_count > 0) {
      return "review_live_geo";
    }
    return "observe_live";
  }

  if (board.geo_fit_salesforce_count > 0) {
    return "candidate_for_live";
  }
  if (board.salesforce_count > 0) {
    return "keep_shadow_geo_mismatch";
  }
  return "observe";
}

function rankBoards(left, right) {
  return (
    toNumber(right.geo_fit_salesforce_count) - toNumber(left.geo_fit_salesforce_count) ||
    toNumber(right.salesforce_count) - toNumber(left.salesforce_count) ||
    toNumber(right.raw_count) - toNumber(left.raw_count) ||
    normalize(left.provider).localeCompare(normalize(right.provider)) ||
    normalize(left.company).localeCompare(normalize(right.company))
  );
}

async function probeProvider(provider, boards) {
  const fetcher = getFetcher(provider);
  if (!fetcher || !Array.isArray(boards) || boards.length === 0) {
    return [];
  }

  const result = await fetcher({
    boards,
    maxUniqueResults: Math.max(100, boards.length * 150)
  });
  const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
  const coverage = new Map(
    (Array.isArray(result?.coverage) ? result.coverage : []).map(entry => [
      normalize(entry?.board_key),
      entry
    ])
  );

  const salesforceJobs = filterSalesforceJobs(jobs);
  const byBoard = new Map();

  for (const board of boards) {
    byBoard.set(normalize(board?.board_key), {
      provider,
      company: normalize(board?.company || board?.board_key),
      board_key: normalize(board?.board_key),
      mode: normalizeText(board?.mode || "shadow") || "shadow",
      raw_count: toNumber(coverage.get(normalize(board?.board_key))?.raw_count),
      salesforce_count: 0,
      geo_fit_salesforce_count: 0,
      india_count: 0,
      remote_count: 0,
      other_count: 0,
      sample_titles: [],
      sample_geo_fit_titles: [],
      error: normalize(coverage.get(normalize(board?.board_key))?.error),
      recommendation: "observe"
    });
  }

  for (const job of salesforceJobs) {
    const boardKey = normalize(job?.ats_board_key);
    if (!byBoard.has(boardKey)) {
      continue;
    }

    const board = byBoard.get(boardKey);
    board.salesforce_count += 1;
    if (board.sample_titles.length < 5) {
      board.sample_titles.push({
        title: normalize(job?.title),
        location: normalize(job?.location),
        apply_link: normalize(job?.apply_link)
      });
    }

    const scope = inferProbeLocationScope(job);
    if (scope === "india") {
      board.india_count += 1;
      board.geo_fit_salesforce_count += 1;
    } else if (scope === "remote_open") {
      board.remote_count += 1;
      board.geo_fit_salesforce_count += 1;
    } else {
      board.other_count += 1;
    }

    if (scope !== "other" && board.sample_geo_fit_titles.length < 5) {
      board.sample_geo_fit_titles.push({
        title: normalize(job?.title),
        location: normalize(job?.location),
        apply_link: normalize(job?.apply_link),
        scope
      });
    }
  }

  return [...byBoard.values()]
    .map(board => ({
      ...board,
      recommendation: buildRecommendation(board)
    }))
    .sort(rankBoards);
}

function printTextReport(report) {
  console.log("Job Radar ATS live probe");
  console.log(
    `- boards probed: ${report.aggregate.board_count} | providers: ${report.aggregate.provider_count}`
  );
  console.log(
    `- geo-fit live candidates: ${report.aggregate.live_candidates} | keep-live boards: ${report.aggregate.keep_live}`
  );

  for (const board of report.boards) {
    console.log(
      `- ${board.provider}/${board.board_key} | ${board.company} | mode ${board.mode} | geo-fit ${board.geo_fit_salesforce_count} | SF ${board.salesforce_count} | raw ${board.raw_count} | ${board.recommendation}`
    );
    if (board.sample_geo_fit_titles.length > 0) {
      for (const sample of board.sample_geo_fit_titles) {
        console.log(`  fit: ${sample.title} | ${sample.location} | ${sample.scope}`);
      }
    } else if (board.sample_titles.length > 0) {
      for (const sample of board.sample_titles.slice(0, 2)) {
        console.log(`  seen: ${sample.title} | ${sample.location}`);
      }
    }
    if (board.error) {
      console.log(`  error: ${board.error}`);
    }
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (!isAtsEnabled()) {
    console.log("ATS live probe needs ATS providers enabled.");
    process.exitCode = 1;
    return;
  }

  const registry = await loadAtsBoardRegistry();
  const filteredRegistry = options.provider
    ? registry.filter(entry => normalizeText(entry?.provider) === options.provider)
    : registry;
  const grouped = groupAtsBoardsByProvider(filteredRegistry);

  const boards = [];
  for (const provider of getEnabledAtsProviders()) {
    if (options.provider && provider !== options.provider) {
      continue;
    }
    const providerBoards = grouped.get(provider) || [];
    const probed = await probeProvider(provider, providerBoards);
    boards.push(...probed);
  }

  const report = {
    options,
    aggregate: {
      provider_count: new Set(boards.map(board => board.provider)).size,
      board_count: boards.length,
      live_candidates: boards.filter(board => board.recommendation === "candidate_for_live").length,
      keep_live: boards.filter(board => board.recommendation === "keep_live").length
    },
    boards: boards.sort(rankBoards)
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(report);
}

run().catch(error => {
  console.log("ATS live probe failed:", error.message);
  process.exitCode = 1;
});
