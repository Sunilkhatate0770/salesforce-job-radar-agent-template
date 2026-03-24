const ARBEITNOW_API = "https://www.arbeitnow.com/api/job-board-api";

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

function looksLikeSalesforceDeveloper(job, keywordSet) {
  const blockedPhrases = [
    "gtm",
    "go to market",
    "growth",
    "marketing"
  ];
  const titleText = String(job.title || "").toLowerCase();
  if (blockedPhrases.some(phrase => titleText.includes(phrase))) {
    return false;
  }

  const text = (
    `${job.title || ""} ${job.description || ""} ${Array.isArray(job.tags) ? job.tags.join(" ") : ""}`
  ).toLowerCase();
  const developerRoleHints = [
    "developer",
    "engineer",
    "technical"
  ];

  const hasSalesforceSignal = [...keywordSet].some(keyword => text.includes(keyword));
  const hasDeveloperRole = developerRoleHints.some(hint => titleText.includes(hint));

  return hasSalesforceSignal && hasDeveloperRole;
}

function mapJob(job) {
  const applyLink = normalizeApplyLink(job.url);

  return {
    source_platform: "arbeitnow",
    source_job_id: `arbeitnow:${job.slug || applyLink}`,
    title: job.title || "",
    company: job.company_name || "",
    location: job.location || (job.remote ? "Remote" : ""),
    experience: "",
    description: stripHtml(job.description),
    skills: Array.isArray(job.tags) ? job.tags.join(", ") : "",
    apply_link: applyLink,
    posted_at: job.created_at || null
  };
}

async function fetchPage(pageNo) {
  const url = `${ARBEITNOW_API}?page=${pageNo}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { jobs: [], hasNext: false };
  }

  const json = await res.json();
  const jobs = Array.isArray(json?.data) ? json.data : [];
  const hasNext = Boolean(json?.links?.next);

  return { jobs, hasNext };
}

export async function fetchArbeitnowJobs({
  keywords = [],
  maxUniqueResults = 120
} = {}) {
  const maxPages = Math.max(1, Number(process.env.ARBEITNOW_MAX_PAGES || 4));
  const keywordSet = new Set(
    [
      "salesforce developer",
      "sfdc developer",
      "apex",
      "lwc",
      "salesforce"
    ]
      .concat(keywords.map(k => String(k || "").toLowerCase().trim()))
      .filter(Boolean)
  );

  const unique = new Map();
  let hasNext = true;
  let lastError = null;

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    if (!hasNext || unique.size >= maxUniqueResults) break;

    try {
      const page = await fetchPage(pageNo);
      hasNext = page.hasNext;

      for (const rawJob of page.jobs) {
        if (!looksLikeSalesforceDeveloper(rawJob, keywordSet)) continue;

        const job = mapJob(rawJob);
        if (!job.apply_link && !job.source_job_id) continue;

        const key = job.source_job_id || job.apply_link;
        if (unique.has(key)) continue;

        unique.set(key, job);
        if (unique.size >= maxUniqueResults) break;
      }
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Arbeitnow fetch failed on page ${pageNo}: ${error.message}`);
      break;
    }
  }

  const jobs = [...unique.values()];
  if (jobs.length === 0 && lastError) {
    throw lastError;
  }
  console.log(`✅ Arbeitnow provider collected: ${jobs.length} unique job(s)`);
  return jobs;
}
