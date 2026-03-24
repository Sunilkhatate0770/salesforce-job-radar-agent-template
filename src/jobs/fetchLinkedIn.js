const APIFY_BASE = "https://api.apify.com/v2";
const LINKEDIN_GUEST_API =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_LOCATION =
  process.env.LINKEDIN_LOCATION || process.env.NAUKRI_LOCATION || "India";

const DEFAULT_ACTOR_SOURCES = [
  { id: "curious_coder~linkedin-jobs-scraper", mode: "urls" },
  { id: "worldunboxer~rapid-linkedin-scraper", mode: "query_location" }
];

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "));
}

function toText(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v || "").trim()).filter(Boolean).join(", ");
  }
  if (value == null) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function normalizeApplyLink(link) {
  const raw = decodeHtml(String(link || "").trim());
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

  const idMatch = canonical.match(/\/jobs\/view\/(\d+)/i);
  if (idMatch) return idMatch[1];

  const suffixMatch = canonical.match(/-(\d{6,})$/);
  return suffixMatch ? suffixMatch[1] : "";
}

function normalizeLinkedInJob(rawJob) {
  const applyLink = normalizeApplyLink(
    rawJob.apply_link ||
      rawJob.applyUrl ||
      rawJob.apply_url ||
      rawJob.job_url ||
      rawJob.jobUrl ||
      rawJob.link ||
      rawJob.url
  );

  const sourceJobId =
    rawJob.source_job_id ||
    rawJob.job_id ||
    rawJob.jobId ||
    rawJob.id ||
    rawJob.refId ||
    extractJobIdFromLink(applyLink);

  const title = toText(
    rawJob.title || rawJob.job_title || rawJob.jobTitle || rawJob.position
  );
  const company = toText(
    rawJob.company ||
      rawJob.company_name ||
      rawJob.companyName ||
      rawJob.companyTitle
  );
  const location = toText(
    rawJob.location || rawJob.job_location || rawJob.jobLocation
  );
  const description = toText(
    rawJob.description ||
      rawJob.descriptionText ||
      rawJob.job_description ||
      rawJob.jobDescription ||
      rawJob.job_description_raw_html ||
      rawJob.descriptionHtml
  );

  const skills = [
    toText(rawJob.skills),
    toText(rawJob.skill_set),
    toText(rawJob.jobFunction),
    toText(rawJob.job_function),
    toText(rawJob.industries),
    toText(rawJob.tagsAndSkills)
  ]
    .filter(Boolean)
    .join(", ");

  const experience = toText(
    rawJob.experience ||
      rawJob.seniorityLevel ||
      rawJob.seniority_level ||
      rawJob.employmentType ||
      rawJob.employment_type
  );

  return {
    ...rawJob,
    source_platform: rawJob.source_platform || "linkedin",
    title,
    company,
    location,
    experience,
    description,
    skills,
    apply_link: applyLink,
    source_job_id: sourceJobId ? `linkedin:${sourceJobId}` : ""
  };
}

function canonicalKey(job) {
  return (
    String(job.source_job_id || "").trim().toLowerCase() ||
    normalizeApplyLink(job.apply_link).toLowerCase() ||
    `${String(job.title || "").trim().toLowerCase()}|${String(job.company || "").trim().toLowerCase()}|${String(job.location || "").trim().toLowerCase()}`
  );
}

function parseActorSources() {
  const raw = String(process.env.LINKEDIN_APIFY_SOURCES || "")
    .split(",")
    .map(source => source.trim())
    .filter(Boolean);

  if (raw.length === 0) {
    return DEFAULT_ACTOR_SOURCES;
  }

  return raw
    .map(item => {
      const [idPart, modePart] = item.split(":");
      const id = String(idPart || "").trim();
      const mode = String(modePart || "urls")
        .trim()
        .toLowerCase();
      return { id, mode };
    })
    .filter(source => source.id);
}

function getLinkedInFetchProviders() {
  return String(process.env.LINKEDIN_FETCH_PROVIDERS || "direct,apify")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
}

function getPlanKeywords(plan, maxKeywords = 2) {
  const keywords = Array.isArray(plan?.keywords)
    ? plan.keywords.map(v => String(v || "").trim()).filter(Boolean)
    : [];

  if (keywords.length > 0) return keywords.slice(0, maxKeywords);
  return ["Salesforce Developer"];
}

function buildLinkedInSearchUrl({ keyword, location, jobAgeDays }) {
  const url = new URL("https://www.linkedin.com/jobs/search/");
  url.searchParams.set("keywords", keyword);
  url.searchParams.set("location", location);

  const boundedDays = Math.max(1, Math.min(30, Number(jobAgeDays || 1)));
  const seconds = boundedDays * 24 * 60 * 60;
  url.searchParams.set("f_TPR", `r${seconds}`);

  return url.toString();
}

function buildActorInput(plan, mode, maxItemsPerPlan) {
  const maxKeywords = Math.max(
    1,
    Number(process.env.LINKEDIN_MAX_URLS_PER_PLAN || 2)
  );
  const keywords = getPlanKeywords(plan, maxKeywords);
  const primaryKeyword = keywords[0];
  const shared = {
    maxItems: maxItemsPerPlan,
    maxResults: maxItemsPerPlan,
    max_results: maxItemsPerPlan
  };

  if (mode === "query_location") {
    return {
      ...shared,
      query: primaryKeyword,
      keyword: primaryKeyword,
      searchKeyword: primaryKeyword,
      searchKeywords: keywords,
      keywords,
      jobTitle: primaryKeyword,
      location: DEFAULT_LOCATION,
      locations: [DEFAULT_LOCATION]
    };
  }

  const urls = keywords.map(keyword =>
    buildLinkedInSearchUrl({
      keyword,
      location: DEFAULT_LOCATION,
      jobAgeDays: plan?.jobAge || 1
    })
  );

  return {
    ...shared,
    urls,
    includeCompanyDetails: false
  };
}

async function safeFetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    console.log("⚠️ LinkedIn provider returned non-JSON response:", text.slice(0, 120));
    return null;
  }
  return response.json();
}

async function getDatasetItems(datasetId, token, limit = 300) {
  if (!datasetId) return [];

  try {
    const items = await safeFetchJson(
      `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&limit=${limit}&token=${token}`
    );
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function runLinkedInActorPlan(source, plan) {
  const token = process.env.APIFY_TOKEN;
  const actorId = source.id;
  const actorMode = source.mode || "urls";

  const maxItemsPerPlan = Math.max(
    20,
    Number(process.env.LINKEDIN_MAX_ITEMS_PER_PLAN || 60)
  );
  const pollAttempts = Math.max(
    6,
    Number(process.env.LINKEDIN_POLL_ATTEMPTS || 12)
  );
  const pollIntervalMs = Math.max(
    4000,
    Number(process.env.LINKEDIN_POLL_INTERVAL_MS || 8000)
  );

  console.log(
    `🔎 LinkedIn plan ${plan.name} via ${actorId} (${actorMode}): keywords=${getPlanKeywords(plan, 4).join(", ")}`
  );

  const startJson = await safeFetchJson(
    `${APIFY_BASE}/acts/${actorId}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildActorInput(plan, actorMode, maxItemsPerPlan))
    }
  );

  const runId = startJson?.data?.id;
  if (!runId) {
    const reason =
      startJson?.error?.message ||
      startJson?.message ||
      "unknown reason";
    console.log(`❌ Failed to start LinkedIn actor ${actorId}: ${reason}`);
    return [];
  }

  console.log(`⏳ LinkedIn actor ${actorId} run started for ${plan.name}: ${runId}`);

  let runInfo = startJson;
  let datasetId = runInfo?.data?.defaultDatasetId || "";

  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    await sleep(pollIntervalMs);

    runInfo = await safeFetchJson(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    const status = runInfo?.data?.status || "UNKNOWN";
    datasetId = runInfo?.data?.defaultDatasetId || datasetId;

    console.log(
      `⏱ [LinkedIn:${plan.name}] [${actorId}] status=${status} dataset=${datasetId || "n/a"}`
    );

    const items = await getDatasetItems(datasetId, token);
    if (items.length > 0) {
      console.log(
        `✅ LinkedIn fetched ${items.length} job(s) for ${plan.name} via ${actorId}`
      );
      return items;
    }

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      console.log(`❌ LinkedIn actor ${actorId} ended with ${status}`);
      return [];
    }

    if (status === "SUCCEEDED" && items.length === 0) {
      break;
    }
  }

  const fallbackItems = await getDatasetItems(datasetId, token);
  if (fallbackItems.length > 0) {
    console.log(
      `✅ LinkedIn fetched ${fallbackItems.length} job(s) after final poll for ${plan.name} via ${actorId}`
    );
    return fallbackItems;
  }

  console.log(`❌ LinkedIn dataset empty for ${plan.name} via ${actorId}`);
  return [];
}

async function runLinkedInSearchPlan(plan) {
  const actorSources = parseActorSources();

  for (const source of actorSources) {
    try {
      const items = await runLinkedInActorPlan(source, plan);
      if (Array.isArray(items) && items.length > 0) {
        return items;
      }
    } catch (error) {
      console.log(`⚠️ LinkedIn actor source failed (${source.id}): ${error.message}`);
    }
  }

  console.log(`❌ All LinkedIn actor sources failed for plan ${plan?.name || "unknown"}`);
  return [];
}

async function fetchLinkedInJobsViaApify(plans, maxUniqueResults) {
  if (!process.env.APIFY_TOKEN) {
    console.log("⚠️ APIFY_TOKEN missing; LinkedIn apify source skipped");
    return [];
  }

  const unique = new Map();

  for (const plan of plans) {
    if (unique.size >= maxUniqueResults) break;

    const items = await runLinkedInSearchPlan(plan);
    for (const rawItem of items) {
      const job = normalizeLinkedInJob(rawItem);
      const key = canonicalKey(job);
      if (!key || unique.has(key)) continue;
      unique.set(key, job);
      if (unique.size >= maxUniqueResults) break;
    }
  }

  const jobs = [...unique.values()];
  console.log(`✅ LinkedIn apify source collected: ${jobs.length} unique job(s)`);
  return jobs;
}

function extractFirstMatch(text, pattern, flags = "i") {
  const re = new RegExp(pattern, flags);
  const match = String(text || "").match(re);
  return match ? match[1] : "";
}

function parseLinkedInGuestCards(html) {
  const blocks = String(html || "").split(/<li[^>]*>/i).slice(1);
  const jobs = [];

  for (const block of blocks) {
    const link = extractFirstMatch(
      block,
      'class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"'
    );
    const title = stripHtml(
      extractFirstMatch(
        block,
        '<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\\s\\S]*?)<\\/h3>'
      )
    );
    const company = stripHtml(
      extractFirstMatch(
        block,
        '<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\\s\\S]*?)<\\/h4>'
      )
    );
    const location = stripHtml(
      extractFirstMatch(
        block,
        '<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\\s\\S]*?)<\\/span>'
      )
    );
    const postedAt = decodeHtml(
      extractFirstMatch(block, '<time[^>]*datetime="([^"]+)"')
    );
    const snippet = stripHtml(
      extractFirstMatch(
        block,
        '<p[^>]*class="[^"]*base-search-card__snippet[^"]*"[^>]*>([\\s\\S]*?)<\\/p>'
      )
    );
    const urn = decodeHtml(
      extractFirstMatch(block, 'data-entity-urn="urn:li:jobPosting:([^"]+)"')
    );

    const applyLink = normalizeApplyLink(link);
    const extractedId = urn || extractJobIdFromLink(applyLink);
    if (!applyLink && !extractedId) continue;
    if (!title) continue;

    jobs.push(
      normalizeLinkedInJob({
        source_platform: "linkedin_direct",
        title,
        company,
        location,
        description: snippet,
        apply_link: applyLink,
        source_job_id: extractedId,
        posted_at: postedAt
      })
    );
  }

  return jobs;
}

async function fetchLinkedInGuestPage({ keyword, location, start, jobAgeDays }) {
  const url = new URL(LINKEDIN_GUEST_API);
  url.searchParams.set("keywords", keyword);
  url.searchParams.set("location", location);
  url.searchParams.set("start", String(start));

  const boundedDays = Math.max(1, Math.min(30, Number(jobAgeDays || 1)));
  const seconds = boundedDays * 24 * 60 * 60;
  url.searchParams.set("f_TPR", `r${seconds}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `LinkedIn direct request failed (${response.status}): ${body.slice(0, 120)}`
    );
  }

  return response.text();
}

async function fetchLinkedInJobsViaDirect(plans, maxUniqueResults) {
  const maxPages = Math.max(
    1,
    Number(process.env.LINKEDIN_DIRECT_MAX_PAGES || 2)
  );
  const pageSize = Math.max(
    10,
    Number(process.env.LINKEDIN_DIRECT_PAGE_SIZE || 25)
  );
  const keywordsPerPlan = Math.max(
    1,
    Number(process.env.LINKEDIN_DIRECT_KEYWORDS_PER_PLAN || 2)
  );

  const unique = new Map();

  for (const plan of plans) {
    if (unique.size >= maxUniqueResults) break;
    const keywords = getPlanKeywords(plan, keywordsPerPlan);

    for (const keyword of keywords) {
      if (unique.size >= maxUniqueResults) break;

      for (let page = 0; page < maxPages; page += 1) {
        if (unique.size >= maxUniqueResults) break;

        const start = page * pageSize;
        try {
          const html = await fetchLinkedInGuestPage({
            keyword,
            location: DEFAULT_LOCATION,
            start,
            jobAgeDays: plan?.jobAge || 1
          });
          const jobs = parseLinkedInGuestCards(html);

          if (jobs.length === 0) {
            break;
          }

          for (const job of jobs) {
            const key = canonicalKey(job);
            if (!key || unique.has(key)) continue;
            unique.set(key, job);
            if (unique.size >= maxUniqueResults) break;
          }
        } catch (error) {
          console.log(
            `⚠️ LinkedIn direct fetch failed (${keyword}, page ${page + 1}): ${error.message}`
          );
          break;
        }
      }
    }
  }

  const jobs = [...unique.values()];
  console.log(`✅ LinkedIn direct source collected: ${jobs.length} unique job(s)`);
  return jobs;
}

export async function fetchLinkedInJobs({
  plans = [],
  maxUniqueResults = 120
} = {}) {
  const plansToRun =
    Array.isArray(plans) && plans.length > 0
      ? plans.slice(0, Math.max(1, Number(process.env.LINKEDIN_PLANS_PER_RUN || 1)))
      : [
          {
            name: "core-dev",
            keywords: ["Salesforce Developer", "SFDC Developer"],
            jobAge: 1
          }
        ];

  const providers = getLinkedInFetchProviders();
  const unique = new Map();

  for (const provider of providers) {
    if (unique.size >= maxUniqueResults) break;

    let providerJobs = [];

    try {
      if (provider === "apify") {
        providerJobs = await fetchLinkedInJobsViaApify(
          plansToRun,
          maxUniqueResults - unique.size
        );
      } else if (provider === "direct") {
        providerJobs = await fetchLinkedInJobsViaDirect(
          plansToRun,
          maxUniqueResults - unique.size
        );
      } else {
        console.log(`⚠️ Unknown LinkedIn source '${provider}' skipped`);
        continue;
      }
    } catch (error) {
      console.log(`⚠️ LinkedIn source '${provider}' failed: ${error.message}`);
      continue;
    }

    let added = 0;
    for (const job of providerJobs) {
      const key = canonicalKey(job);
      if (!key || unique.has(key)) continue;
      unique.set(key, job);
      added += 1;
      if (unique.size >= maxUniqueResults) break;
    }

    console.log(
      `📦 LinkedIn source '${provider}' contributed ${added} unique job(s). Total LinkedIn: ${unique.size}`
    );
  }

  const jobs = [...unique.values()];
  console.log(`✅ LinkedIn provider collected: ${jobs.length} unique job(s)`);
  return jobs;
}
