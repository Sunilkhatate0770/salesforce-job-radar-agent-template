const JOBAPI_BASE = "https://www.naukri.com/jobapi/v3/search";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers
      .getSetCookie()
      .map(cookie => cookie.split(";")[0]?.trim())
      .filter(Boolean);
  }

  const raw = headers.get("set-cookie");
  if (!raw) return [];

  return raw
    .split(/,(?=[^;]+?=)/)
    .map(cookie => cookie.split(";")[0]?.trim())
    .filter(Boolean);
}

function mergeCookies(cookieJar, setCookies) {
  const jarMap = new Map();

  for (const cookie of cookieJar) {
    const [name] = cookie.split("=");
    if (!name) continue;
    jarMap.set(name.trim(), cookie);
  }

  for (const cookie of setCookies) {
    const [name] = cookie.split("=");
    if (!name) continue;
    jarMap.set(name.trim(), cookie);
  }

  return [...jarMap.values()];
}

function buildCookieHeader(cookieJar) {
  return cookieJar.join("; ");
}

async function warmupSession(keyword, location, cookieJar) {
  const searchUrl = `https://www.naukri.com/${slugify(keyword)}-jobs-in-${slugify(location)}?k=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}`;
  const warmupHeaders = {
    "user-agent": BROWSER_UA,
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache"
  };

  const targets = ["https://www.naukri.com/", searchUrl];
  let currentJar = [...cookieJar];

  for (const target of targets) {
    try {
      const res = await fetch(target, {
        method: "GET",
        headers: warmupHeaders,
        redirect: "follow"
      });
      const setCookies = parseSetCookieHeaders(res.headers);
      currentJar = mergeCookies(currentJar, setCookies);
      await res.arrayBuffer();
    } catch {
      // ignore warmup errors and continue
    }
  }

  return currentJar;
}

function buildSearchUrl({ keyword, location, pageNo, noOfResults }) {
  const url = new URL(JOBAPI_BASE);
  url.searchParams.set("noOfResults", String(noOfResults));
  url.searchParams.set("urlType", "search_by_keyword");
  url.searchParams.set("searchType", "adv");
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("k", keyword);
  url.searchParams.set("l", location);
  url.searchParams.set("location", location);
  url.searchParams.set("nignbevent_src", "jobsearchDeskGNB");
  return url.toString();
}

function isRecaptchaPayload(status, payload, rawText) {
  if (status === 406) return true;

  const text = String(payload?.message || rawText || "").toLowerCase();
  return text.includes("recaptcha required");
}

function getItemsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jobDetails)) return payload.jobDetails;
  if (Array.isArray(payload?.data?.jobDetails)) return payload.data.jobDetails;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  return [];
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

function normalizeJob(rawJob) {
  const applyLink = normalizeApplyLink(
    rawJob.jdURL ||
      rawJob.apply_link ||
      rawJob.applyLink ||
      rawJob.job_url ||
      rawJob.jobUrl ||
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
    location: rawJob.location || rawJob.locations || rawJob.Location || "",
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
      rawJob.jobIdV3 ||
      rawJob["Job ID"] ||
      rawJob.id ||
      extractJobIdFromLink(applyLink)
  };
}

function canonicalKey(job) {
  return (
    String(job.source_job_id || "").trim().toLowerCase() ||
    normalizeApplyLink(job.apply_link).toLowerCase() ||
    `${String(job.title || "").trim().toLowerCase()}|${String(job.company || "").trim().toLowerCase()}|${String(job.location || "").trim().toLowerCase()}`
  );
}

async function fetchSearchPage({ keyword, location, pageNo, noOfResults, cookieJar }) {
  const url = buildSearchUrl({ keyword, location, pageNo, noOfResults });
  const headers = {
    "user-agent": BROWSER_UA,
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    referer: `https://www.naukri.com/${slugify(keyword)}-jobs-in-${slugify(location)}`,
    appid: "109",
    systemid: "109",
    "x-requested-with": "XMLHttpRequest"
  };

  const cookieHeader = buildCookieHeader(cookieJar);
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    redirect: "follow"
  });

  const setCookies = parseSetCookieHeaders(res.headers);
  const rawText = await res.text();

  let payload = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = null;
  }

  return {
    status: res.status,
    payload,
    rawText,
    setCookies
  };
}

export async function fetchNaukriJobsDirect({
  plans,
  location = "India",
  maxUniqueResults = 200
}) {
  const maxPages = Math.max(1, Number(process.env.NAUKRI_DIRECT_MAX_PAGES || 2));
  const pageSize = Math.max(
    20,
    Math.min(100, Number(process.env.NAUKRI_DIRECT_PAGE_SIZE || 20))
  );
  const keywordsPerPlan = Math.max(
    1,
    Number(process.env.NAUKRI_DIRECT_KEYWORDS_PER_PLAN || 2)
  );

  let cookieJar = [];
  const unique = new Map();
  let recaptchaBlocked = false;
  let lastError = null;

  for (const plan of plans) {
    const keywords = Array.isArray(plan.keywords)
      ? plan.keywords.slice(0, keywordsPerPlan)
      : [];

    for (const keyword of keywords) {
      if (unique.size >= maxUniqueResults) break;

      cookieJar = await warmupSession(keyword, location, cookieJar);

      for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
        if (unique.size >= maxUniqueResults) break;

        try {
          const result = await fetchSearchPage({
            keyword,
            location,
            pageNo,
            noOfResults: pageSize,
            cookieJar
          });

          cookieJar = mergeCookies(cookieJar, result.setCookies);

          if (isRecaptchaPayload(result.status, result.payload, result.rawText)) {
            recaptchaBlocked = true;
            break;
          }

          const items = getItemsFromPayload(result.payload);
          if (!Array.isArray(items) || items.length === 0) {
            break;
          }

          for (const item of items) {
            const job = normalizeJob(item);
            const key = canonicalKey(job);
            if (!key || unique.has(key)) continue;
            unique.set(key, job);
            if (unique.size >= maxUniqueResults) break;
          }
        } catch (error) {
          lastError = error;
          console.log(`⚠️ Direct Naukri fetch failed (${keyword}, page ${pageNo}): ${error.message}`);
          break;
        }
      }

      if (recaptchaBlocked) break;
    }

    if (recaptchaBlocked || unique.size >= maxUniqueResults) break;
  }

  const jobs = [...unique.values()];

  if (recaptchaBlocked) {
    console.log("⚠️ Direct Naukri endpoint blocked by recaptcha");
    if (jobs.length === 0) {
      throw new Error("Direct Naukri blocked by recaptcha");
    }
  }
  if (jobs.length === 0 && lastError) {
    throw lastError;
  }
  console.log(`✅ Direct Naukri provider collected: ${jobs.length} unique job(s)`);

  return jobs;
}

