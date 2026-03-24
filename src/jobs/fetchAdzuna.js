const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";

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

function mapResult(result, country) {
  const applyLink = normalizeApplyLink(result.redirect_url || result.adref);
  return {
    source_platform: "adzuna",
    source_job_id: `adzuna:${country}:${result.id || result.adref || applyLink}`,
    title: result.title || "",
    company: result.company?.display_name || "",
    location: result.location?.display_name || "",
    experience: "",
    description: String(result.description || "").replace(/\s+/g, " ").trim(),
    skills: "",
    apply_link: applyLink,
    posted_at: result.created || null
  };
}

function buildUrl({
  country,
  page,
  appId,
  appKey,
  keyword,
  location,
  maxDaysOld
}) {
  const url = new URL(
    `${ADZUNA_BASE}/${country}/search/${page}`
  );
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "50");
  url.searchParams.set("what", keyword);
  if (location) url.searchParams.set("where", location);
  if (maxDaysOld) url.searchParams.set("max_days_old", String(maxDaysOld));
  url.searchParams.set("content-type", "application/json");
  return url.toString();
}

export async function fetchAdzunaJobs({
  keywords = [],
  location = "India",
  maxUniqueResults = 120
} = {}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    console.log("ℹ️ Adzuna provider skipped: ADZUNA_APP_ID/ADZUNA_APP_KEY missing");
    return [];
  }

  const countries = String(process.env.ADZUNA_COUNTRIES || "in")
    .split(",")
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
  const maxPages = Math.max(1, Number(process.env.ADZUNA_MAX_PAGES || 2));
  const maxDaysOld = Math.max(1, Number(process.env.ADZUNA_MAX_DAYS_OLD || 3));
  const keywordList = Array.from(
    new Set(
      [
        "salesforce developer",
        "sfdc developer",
        "apex developer",
        "lwc developer"
      ].concat(keywords).map(k => String(k || "").trim()).filter(Boolean)
    )
  );

  const unique = new Map();
  let lastError = null;

  for (const country of countries) {
    if (unique.size >= maxUniqueResults) break;

    for (const keyword of keywordList) {
      if (unique.size >= maxUniqueResults) break;

      for (let page = 1; page <= maxPages; page += 1) {
        if (unique.size >= maxUniqueResults) break;

        const url = buildUrl({
          country,
          page,
          appId,
          appKey,
          keyword,
          location,
          maxDaysOld
        });

        try {
          const res = await fetch(url, {
            headers: {
              accept: "application/json"
            }
          });

          if (!res.ok) {
            const body = await res.text();
            lastError = new Error(
              `Adzuna error (${country}, page ${page}): ${res.status} ${body.slice(0, 120)}`
            );
            console.log(`⚠️ ${lastError.message}`);
            break;
          }

          const json = await res.json();
          const results = Array.isArray(json?.results) ? json.results : [];
          if (results.length === 0) break;

          for (const result of results) {
            const job = mapResult(result, country);
            const key = job.source_job_id || job.apply_link;
            if (!key || unique.has(key)) continue;
            unique.set(key, job);
            if (unique.size >= maxUniqueResults) break;
          }
        } catch (error) {
          lastError = error;
          console.log(`⚠️ Adzuna fetch failed (${country}, page ${page}): ${error.message}`);
          break;
        }
      }
    }
  }

  const jobs = [...unique.values()];
  if (jobs.length === 0 && lastError) {
    throw lastError;
  }
  console.log(`✅ Adzuna provider collected: ${jobs.length} unique job(s)`);
  return jobs;
}

