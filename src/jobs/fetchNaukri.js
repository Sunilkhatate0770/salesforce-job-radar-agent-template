// src/jobs/fetchNaukri.js
import { getNextPlanStartIndex } from "../db/fetchCursor.js";
import { fetchNaukriJobsDirect } from "./fetchNaukriDirect.js";
import { fetchNaukriJobsViaReader } from "./fetchNaukriReader.js";
import { fetchArbeitnowJobs } from "./fetchArbeitnow.js";
import { fetchAdzunaJobs } from "./fetchAdzuna.js";
import { filterSalesforceJobs } from "./filterSalesforceJobs.js";
import { fetchLinkedInJobs } from "./fetchLinkedIn.js";
import { fetchLinkedInPosts } from "./fetchLinkedInPosts.js";
import {
  buildPauseReason,
  getProviderGate,
  markProviderFailure,
  markProviderSuccess
} from "../db/providerHealth.js";

const APIFY_BASE = "https://api.apify.com/v2";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DEFAULT_LOCATION = process.env.NAUKRI_LOCATION || "India";
const DEFAULT_ACTOR_SOURCES = [
  { id: "nuclear_quietude~naukri-job-scraper", mode: "search_keywords" },
  { id: "techupservices~naukri-job-scraper", mode: "query_location" },
  { id: "muhammetakkurtt~naukri-job-scraper", mode: "query_location" }
];
const PROVIDER_META = {
  apify: { cost: "paid", healthKey: "apify" },
  naukri_reader: { cost: "free", healthKey: "naukri_reader" },
  linkedin: { cost: "free", healthKey: "linkedin" },
  linkedin_posts: { cost: "free", healthKey: "linkedin_posts" },
  direct: { cost: "free", healthKey: "naukri_direct" },
  arbeitnow: { cost: "free", healthKey: "arbeitnow" },
  adzuna: { cost: "free", healthKey: "adzuna" }
};
let lastFetchReport = null;

const SEARCH_PLANS = [
  {
    name: "core-dev",
    keywords: [
      "Salesforce Developer",
      "SFDC Developer",
      "Apex Developer",
      "LWC Developer"
    ],
    jobAge: 1
  },
  {
    name: "platform-dev",
    keywords: [
      "Salesforce Engineer",
      "Salesforce Platform Developer",
      "Lightning Developer",
      "Salesforce Integration Developer"
    ],
    jobAge: 2
  },
  {
    name: "specialized-clouds",
    keywords: [
      "Salesforce CPQ Developer",
      "Field Service Lightning Developer",
      "Salesforce Commerce Cloud Developer",
      "Apex LWC Developer"
    ],
    jobAge: 3
  }
];

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function trimError(error) {
  return String(error || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function getProviderMeta(provider) {
  return PROVIDER_META[provider] || {
    cost: "free",
    healthKey: provider
  };
}

function prioritizeProviders(providers) {
  const strategy = String(process.env.FETCH_PROVIDER_STRATEGY || "free_first")
    .trim()
    .toLowerCase();

  if (strategy !== "free_first") {
    return providers;
  }

  return [...providers].sort((left, right) => {
    const leftCost = getProviderMeta(left).cost === "paid" ? 1 : 0;
    const rightCost = getProviderMeta(right).cost === "paid" ? 1 : 0;
    return leftCost - rightCost;
  });
}

function shouldUsePaidOnlyWhenNeeded() {
  return isTruthy(process.env.PAID_PROVIDERS_FALLBACK_ONLY || "true");
}

async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.log("⚠️ Non-JSON response (ignored):", text.slice(0, 100));
    return null;
  }
  return res.json();
}

function normalizeApplyLink(link) {
  const raw = String(link || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function extractJobIdFromLink(link) {
  const canonical = normalizeApplyLink(link);
  if (!canonical) return "";

  const match = canonical.match(/-(\d{6,})$/);
  return match ? match[1] : "";
}

function normalizeRawJob(rawJob) {
  const applyLink = normalizeApplyLink(
    rawJob.apply_link ||
      rawJob.applyLink ||
      rawJob.job_url ||
      rawJob.jobUrl ||
      rawJob.jdURL ||
      rawJob["Job URL"] ||
      rawJob.url ||
      rawJob.link
  );

  return {
    ...rawJob,
    title:
      rawJob.title ||
      rawJob.jobTitle ||
      rawJob.designation ||
      rawJob["Job Title"] ||
      "",
    company:
      rawJob.company ||
      rawJob.companyName ||
      rawJob.company_name ||
      rawJob.Company ||
      "",
    location:
      rawJob.location ||
      rawJob.locations ||
      rawJob.Location ||
      "",
    experience:
      rawJob.experience ||
      rawJob.exp ||
      rawJob.experienceText ||
      rawJob["Experience Required"] ||
      "",
    description:
      rawJob.description ||
      rawJob.jobDescription ||
      rawJob.summary ||
      rawJob.Description ||
      "",
    skills:
      rawJob.skills ||
      rawJob.keySkills ||
      rawJob.tagsAndSkills ||
      rawJob["Skills/Tags"] ||
      "",
    apply_link: applyLink,
    source_job_id:
      rawJob.source_job_id ||
      rawJob.job_id ||
      rawJob.jobId ||
      rawJob["Job ID"] ||
      rawJob.id ||
      extractJobIdFromLink(applyLink)
  };
}

function getCanonicalKey(job) {
  return (
    String(job.source_job_id || "").trim().toLowerCase() ||
    normalizeApplyLink(job.apply_link).toLowerCase() ||
    `${String(job.title || "").trim().toLowerCase()}|${String(job.company || "").trim().toLowerCase()}|${String(job.location || "").trim().toLowerCase()}`
  );
}

function getActorSources() {
  const raw = String(process.env.NAUKRI_APIFY_SOURCES || "")
    .split(",")
    .map(source => source.trim())
    .filter(Boolean);

  if (raw.length > 0) {
    return raw
      .map(item => {
        const [idPart, modePart] = item.split(":");
        const id = String(idPart || "").trim();
        const mode = String(modePart || "search_keywords")
          .trim()
          .toLowerCase();
        return { id, mode };
      })
      .filter(source => source.id);
  }

  return DEFAULT_ACTOR_SOURCES;
}

function getFetchProviders() {
  return String(
    process.env.NAUKRI_FETCH_PROVIDERS || "naukri_reader,direct,linkedin,arbeitnow,adzuna,apify"
  )
    .split(",")
    .map(provider => provider.trim().toLowerCase())
    .filter(Boolean);
}

function getPostProviders() {
  if (!isTruthy(process.env.ENABLE_POST_PROVIDERS || "true")) {
    return [];
  }

  return String(process.env.POST_FETCH_PROVIDERS || "linkedin_posts")
    .split(",")
    .map(provider => provider.trim().toLowerCase())
    .filter(Boolean);
}

function getPrimaryKeyword(plan) {
  if (Array.isArray(plan.keywords) && plan.keywords.length > 0) {
    return String(plan.keywords[0]).trim();
  }

  return "Salesforce Developer";
}

function buildActorInput(plan, mode, maxItemsPerPlan) {
  const keyword = getPrimaryKeyword(plan);
  const shared = {
    maxItems: maxItemsPerPlan,
    maxResults: maxItemsPerPlan,
    max_results: maxItemsPerPlan
  };

  if (mode === "query_location") {
    return {
      ...shared,
      query: keyword,
      keyword,
      searchKeyword: keyword,
      q: keyword,
      location: DEFAULT_LOCATION,
      locations: [DEFAULT_LOCATION]
    };
  }

  return {
    ...shared,
    searchKeywords: plan.keywords,
    searchKeyword: keyword,
    keywords: plan.keywords,
    query: keyword,
    keyword,
    q: keyword,
    locations: [DEFAULT_LOCATION],
    location: DEFAULT_LOCATION,
    jobAge: plan.jobAge,
    days: plan.jobAge
  };
}

function getPlansForThisRun() {
  const planCount = SEARCH_PLANS.length;
  const plansPerRun = Math.min(
    planCount,
    Math.max(1, Number(process.env.NAUKRI_PLANS_PER_RUN || 1))
  );

  return getNextPlanStartIndex(planCount).then(startIndex => {
    const plans = [];
    for (let i = 0; i < plansPerRun; i++) {
      const index = (startIndex + i) % planCount;
      plans.push(SEARCH_PLANS[index]);
    }
    return plans;
  });
}

async function runActorSearchPlan(source, plan) {
  const token = process.env.APIFY_TOKEN;
  const actorId = source.id;
  const actorMode = source.mode || "search_keywords";
  const maxItemsPerPlan = Math.max(
    20,
    Number(process.env.NAUKRI_MAX_ITEMS_PER_PLAN || 120)
  );
  const pollAttempts = Math.max(
    6,
    Number(process.env.NAUKRI_POLL_ATTEMPTS || 24)
  );

  console.log(
    `🔎 Plan ${plan.name} via ${actorId} (${actorMode}): keywords=${plan.keywords.join(", ")} jobAge=${plan.jobAge}`
  );

  const actorInput = buildActorInput(plan, actorMode, maxItemsPerPlan);

  // 1️⃣ Start actor
  const startJson = await safeFetch(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput)
    }
  );

  const runId = startJson?.data?.id;
  if (!runId) {
    const reason =
      startJson?.error?.message ||
      startJson?.message ||
      "unknown reason";
    throw new Error(`Apify actor ${actorId} failed to start for ${plan.name}: ${reason}`);
  }

  console.log(`⏳ Actor ${actorId} run started for ${plan.name}: ${runId}`);
  console.log("⏳ Waiting for actor to finish...");

  // 2️⃣ Wait for SUCCEEDED
  let runInfo;
  for (let i = 0; i < pollAttempts; i++) {
    await sleep(10000);
    runInfo = await safeFetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    const status = runInfo?.data?.status;
    console.log(`⏱ [${plan.name}] [${actorId}] Run status: ${status}`);
    if (status === "SUCCEEDED") break;

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify actor ${actorId} ended with status ${status}`);
    }
  }

  const datasetId = runInfo?.data?.defaultDatasetId;
  if (!datasetId) {
    throw new Error(`Apify dataset missing for ${actorId} plan ${plan.name}`);
  }

  console.log(`📦 Dataset ready for ${plan.name} (${actorId}):`, datasetId);
  console.log(`⏳ Polling dataset until data appears for ${plan.name} (${actorId})...`);

  // 3️⃣ Retry dataset fetch
  for (let attempt = 1; attempt <= 6; attempt++) {
    await sleep(15000);

    const items = await safeFetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&limit=500&token=${token}`
    );

    if (Array.isArray(items) && items.length > 0) {
      console.log(`✅ ${items.length} jobs fetched for ${plan.name} via ${actorId}`);
      return items;
    }

    console.log(`⚠️ [${plan.name}] [${actorId}] Dataset empty (attempt ${attempt})`);
  }

  console.log(`❌ Dataset still empty after retries for ${plan.name} via ${actorId}`);
  return [];
}

async function runSearchPlan(plan) {
  const actorSources = getActorSources();
  let lastError = null;

  for (const source of actorSources) {
    try {
      const items = await runActorSearchPlan(source, plan);
      if (Array.isArray(items) && items.length > 0) {
        return items;
      }
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Actor source failed (${source.id}): ${error.message}`);
    }
  }

  if (lastError) {
    throw lastError;
  }
  console.log(`❌ All actor sources failed for plan ${plan.name}`);
  return [];
}

async function fetchNaukriJobsViaApify(plans, maxUniqueResults) {
  const uniqueJobs = new Map();

  for (const plan of plans) {
    const items = await runSearchPlan(plan);

    for (const rawItem of items) {
      const job = normalizeRawJob(rawItem);
      const key = getCanonicalKey(job);

      if (!key || uniqueJobs.has(key)) continue;
      uniqueJobs.set(key, job);

      if (uniqueJobs.size >= maxUniqueResults) {
        break;
      }
    }

    if (uniqueJobs.size >= maxUniqueResults) {
      break;
    }
  }

  const jobs = [...uniqueJobs.values()];
  console.log(`✅ Apify provider collected: ${jobs.length} unique job(s)`);
  return jobs;
}

function mergeUniqueJobs(uniqueMap, jobs, maxUniqueResults) {
  let added = 0;

  for (const job of jobs) {
    const key = getCanonicalKey(job);
    if (!key || uniqueMap.has(key)) continue;
    uniqueMap.set(key, job);
    added += 1;

    if (uniqueMap.size >= maxUniqueResults) break;
  }

  return added;
}

function getSearchKeywords(plans) {
  const keywords = [];
  for (const plan of plans) {
    if (!Array.isArray(plan.keywords)) continue;
    for (const keyword of plan.keywords) {
      const normalized = String(keyword || "").trim();
      if (normalized) keywords.push(normalized);
    }
  }
  return [...new Set(keywords)];
}

function inferJobSource(job) {
  const sourcePlatform = String(job?.source_platform || "").toLowerCase();
  const sourceId = String(job?.source_job_id || "").toLowerCase();
  const link = String(job?.apply_link || "").toLowerCase();
  const postUrl = String(job?.post_url || "").toLowerCase();

  if (
    sourcePlatform === "linkedin_posts" ||
    sourceId.startsWith("linkedin_post:") ||
    postUrl.includes("linkedin.com/posts")
  ) {
    return "LinkedIn Posts";
  }

  if (sourceId.startsWith("naukri:") || link.includes("naukri.com")) {
    return "Naukri";
  }
  if (sourceId.startsWith("linkedin:") || link.includes("linkedin.com")) {
    return "LinkedIn";
  }
  if (sourceId.startsWith("arbeitnow:") || link.includes("arbeitnow.com")) {
    return "Arbeitnow";
  }
  if (sourceId.startsWith("adzuna:") || link.includes("adzuna.")) {
    return "Adzuna";
  }
  return "Other";
}

function getSourceCounts(jobs) {
  const counts = {
    Naukri: 0,
    LinkedIn: 0,
    "LinkedIn Posts": 0,
    Arbeitnow: 0,
    Adzuna: 0,
    Other: 0
  };

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const source = inferJobSource(job);
    counts[source] = (counts[source] || 0) + 1;
  }

  return counts;
}

export function getLastNaukriFetchReport() {
  return lastFetchReport
    ? JSON.parse(JSON.stringify(lastFetchReport))
    : null;
}

export async function fetchNaukriJobs() {
  console.log("🔍 Fetching Salesforce jobs from Naukri...");

  const maxUniqueResults = Math.max(
    50,
    Number(process.env.NAUKRI_MAX_UNIQUE_RESULTS || 200)
  );
  const minTargetResults = Math.max(
    1,
    Number(process.env.NAUKRI_MIN_RESULTS_PER_RUN || 20)
  );
  const plans = await getPlansForThisRun();
  const searchKeywords = getSearchKeywords(plans);
  const providers = prioritizeProviders([
    ...getFetchProviders(),
    ...getPostProviders()
  ]);
  const uniqueJobs = new Map();
  const hasApifyToken = Boolean(process.env.APIFY_TOKEN);
  const fetchAllProviders = isTruthy(process.env.FETCH_ALL_PROVIDERS || "true");
  const paidFallbackOnly = shouldUsePaidOnlyWhenNeeded();
  const providerReports = [];

  lastFetchReport = {
    started_at: new Date().toISOString(),
    providers: providerReports
  };

  if (!hasApifyToken && providers.includes("apify")) {
    console.log("⚠️ APIFY_TOKEN missing; skipping apify provider");
  }

  for (const provider of providers) {
    if (uniqueJobs.size >= maxUniqueResults) break;
    const meta = getProviderMeta(provider);

    let providerJobs = [];
    const providerReport = {
      provider,
      status: "success",
      cost_tier: meta.cost,
      health_key: meta.healthKey,
      raw_count: 0,
      salesforce_count: 0,
      contributed_count: 0,
      reason: "",
      error: "",
      failure_kind: "",
      disabled_until: ""
    };
    providerReports.push(providerReport);
    const gate = await getProviderGate(meta.healthKey);

    if (gate.shouldSkip) {
      providerReport.status = "paused";
      providerReport.reason = buildPauseReason(gate.state);
      providerReport.disabled_until = String(gate.state?.disabled_until || "");
      providerReport.failure_kind = String(gate.state?.last_failure_kind || "");
      providerReport.error = trimError(gate.state?.last_error || "");
      console.log(`⏸ Provider '${provider}' skipped: ${providerReport.reason}`);
      continue;
    }

    if (
      meta.cost === "paid" &&
      paidFallbackOnly &&
      uniqueJobs.size >= minTargetResults
    ) {
      providerReport.status = "skipped";
      providerReport.reason = `Free providers already met target (${uniqueJobs.size})`;
      console.log(`⏭️ Provider '${provider}' skipped: ${providerReport.reason}`);
      continue;
    }

    try {
      if (provider === "apify") {
        if (!hasApifyToken) {
          providerReport.status = "skipped";
          providerReport.reason = "APIFY_TOKEN missing";
          continue;
        }
        providerJobs = await fetchNaukriJobsViaApify(
          plans,
          maxUniqueResults - uniqueJobs.size
        );
      } else if (provider === "linkedin") {
        providerJobs = await fetchLinkedInJobs({
          plans,
          maxUniqueResults: maxUniqueResults - uniqueJobs.size
        });
      } else if (provider === "linkedin_posts") {
        providerJobs = await fetchLinkedInPosts({
          plans,
          maxUniqueResults: maxUniqueResults - uniqueJobs.size
        });
      } else if (provider === "direct") {
        providerJobs = await fetchNaukriJobsDirect({
          plans,
          location: DEFAULT_LOCATION,
          maxUniqueResults: maxUniqueResults - uniqueJobs.size
        });
      } else if (provider === "naukri_reader") {
        providerJobs = await fetchNaukriJobsViaReader({
          plans,
          location: DEFAULT_LOCATION,
          maxUniqueResults: maxUniqueResults - uniqueJobs.size
        });
      } else if (provider === "arbeitnow") {
        providerJobs = await fetchArbeitnowJobs({
          keywords: searchKeywords,
          maxUniqueResults: maxUniqueResults - uniqueJobs.size
        });
      } else if (provider === "adzuna") {
        providerJobs = await fetchAdzunaJobs({
          keywords: searchKeywords,
          location: DEFAULT_LOCATION,
          maxUniqueResults: maxUniqueResults - uniqueJobs.size
        });
      } else {
        console.log(`⚠️ Unknown provider '${provider}' skipped`);
        providerReport.status = "skipped";
        providerReport.reason = "Unknown provider";
        continue;
      }
      const successState = await markProviderSuccess(meta.healthKey, {
        note: providerJobs.length > 0
          ? `${providerJobs.length} job(s) returned`
          : "provider completed with no results"
      });
      providerReport.status = successState.recovered ? "recovered" : "success";
      if (successState.recovered) {
        providerReport.reason = "Platform recovered and was re-enabled automatically";
      }
    } catch (error) {
      const failure = await markProviderFailure(meta.healthKey, { error });
      console.log(`⚠️ Provider '${provider}' failed: ${error.message}`);
      providerReport.status = "paused";
      providerReport.error = trimError(error.message);
      providerReport.reason = buildPauseReason(failure.state);
      providerReport.failure_kind = failure.kind;
      providerReport.disabled_until = failure.state?.disabled_until || "";
      continue;
    }

    const providerSalesforceJobs = filterSalesforceJobs(providerJobs);
    providerReport.raw_count = providerJobs.length;
    providerReport.salesforce_count = providerSalesforceJobs.length;
    const added = mergeUniqueJobs(
      uniqueJobs,
      providerSalesforceJobs,
      maxUniqueResults
    );
    providerReport.contributed_count = added;
    if (providerJobs.length === 0) {
      providerReport.reason = "No results returned";
    }
    console.log(
      `📦 Provider '${provider}': raw=${providerJobs.length}, salesforce=${providerSalesforceJobs.length}, contributed=${added}. Total: ${uniqueJobs.size}`
    );

    if (
      !fetchAllProviders &&
      uniqueJobs.size >= Math.min(maxUniqueResults, minTargetResults)
    ) {
      break;
    }
  }

  const jobs = [...uniqueJobs.values()];
  lastFetchReport = {
    started_at: lastFetchReport?.started_at || new Date().toISOString(),
    finished_at: new Date().toISOString(),
    providers: providerReports,
    totals: {
      unique_jobs: jobs.length,
      source_counts: getSourceCounts(jobs),
      kind_counts: {
        listing: jobs.filter(job => String(job?.opportunity_kind || "listing").toLowerCase() === "listing").length,
        post: jobs.filter(job => String(job?.opportunity_kind || "").toLowerCase() === "post").length
      }
    }
  };
  console.log(`✅ Total unique jobs collected this run: ${jobs.length}`);
  return jobs;
}
