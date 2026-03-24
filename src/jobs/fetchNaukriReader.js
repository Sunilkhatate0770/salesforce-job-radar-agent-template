const READER_PREFIX = "https://r.jina.ai/http://";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function getCanonicalKey(job) {
  return (
    String(job.source_job_id || "").trim().toLowerCase() ||
    normalizeApplyLink(job.apply_link).toLowerCase() ||
    `${String(job.title || "").trim().toLowerCase()}|${String(job.company || "").trim().toLowerCase()}|${String(job.location || "").trim().toLowerCase()}`
  );
}

function buildSearchUrl(keyword, location) {
  return `http://www.naukri.com/${slugify(keyword)}-jobs-in-${slugify(location)}?k=${encodeURIComponent(keyword)}&l=${encodeURIComponent(location)}`;
}

async function fetchReaderMarkdown(searchUrl) {
  const readerUrl = `${READER_PREFIX}${searchUrl.replace(/^https?:\/\//, "")}`;
  const res = await fetch(readerUrl, {
    headers: {
      "user-agent": BROWSER_UA,
      accept: "text/plain, text/markdown, */*"
    }
  });

  if (!res.ok) {
    const body = await res.text();
    console.log(`⚠️ Naukri reader fetch failed (${res.status}): ${body.slice(0, 120)}`);
    return "";
  }

  return res.text();
}

function extractTitleAndLink(line) {
  const match = line.match(
    /\[([^\]]+)\]\((https?:\/\/www\.naukri\.com\/job-listings-[^) \t]+)(?:\s+"[^"]*")?\)/
  );
  if (!match) return null;

  return {
    title: String(match[1] || "").trim(),
    applyLink: normalizeApplyLink(match[2] || "")
  };
}

function extractCompany(lines, startIndex) {
  for (let i = startIndex + 1; i <= Math.min(lines.length - 1, startIndex + 6); i++) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;

    const companyMatch = line.match(
      /^\[([^\]]+)\]\((https?:\/\/www\.naukri\.com\/[^)]+-jobs-careers-[^)]+)\b/i
    );
    if (companyMatch) {
      return String(companyMatch[1] || "").trim();
    }
  }

  return "";
}

function extractExperience(lines, startIndex) {
  for (let i = startIndex; i <= Math.min(lines.length - 1, startIndex + 8); i++) {
    const line = String(lines[i] || "");
    const match = line.match(/(\d+\s*-\s*\d+\s*Yrs|\d+\+?\s*Yrs)/i);
    if (match) {
      return String(match[1] || "").replace(/\s+/g, " ").trim();
    }
  }

  return "";
}

function extractDescription(lines, startIndex) {
  const parts = [];
  for (let i = startIndex + 1; i <= Math.min(lines.length - 1, startIndex + 10); i++) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;
    if (line.startsWith("[")) continue;
    if (line.startsWith("![")) continue;
    if (line.includes("http://") || line.includes("https://")) continue;
    if (line.length < 20) continue;
    parts.push(line);
    if (parts.join(" ").length > 260) break;
  }

  return parts.join(" ").slice(0, 280);
}

function parseJobsFromMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const jobs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || "");
    if (!line.includes("https://www.naukri.com/job-listings-")) continue;

    const info = extractTitleAndLink(line);
    if (!info || !info.title || !info.applyLink) continue;

    const jobId = extractJobIdFromLink(info.applyLink);
    const company = extractCompany(lines, i);
    const experience = extractExperience(lines, i);
    const description = extractDescription(lines, i);

    jobs.push({
      title: info.title,
      company,
      location: "",
      experience,
      description,
      skills: "",
      apply_link: info.applyLink,
      source_platform: "naukri_reader",
      source_job_id: jobId ? `naukri:${jobId}` : `naukri:${info.applyLink}`
    });
  }

  return jobs;
}

export async function fetchNaukriJobsViaReader({
  plans,
  location = "India",
  maxUniqueResults = 200
}) {
  const keywordsPerPlan = Math.max(
    1,
    Number(process.env.NAUKRI_READER_KEYWORDS_PER_PLAN || 2)
  );
  const uniqueJobs = new Map();
  let lastError = null;

  for (const plan of Array.isArray(plans) ? plans : []) {
    const keywords = Array.isArray(plan.keywords)
      ? plan.keywords.slice(0, keywordsPerPlan)
      : [];

    for (const keyword of keywords) {
      if (uniqueJobs.size >= maxUniqueResults) break;

      const searchUrl = buildSearchUrl(keyword, location);
      try {
        const markdown = await fetchReaderMarkdown(searchUrl);
        if (!markdown) continue;

        const parsedJobs = parseJobsFromMarkdown(markdown);
        for (const job of parsedJobs) {
          const key = getCanonicalKey(job);
          if (!key || uniqueJobs.has(key)) continue;
          uniqueJobs.set(key, job);
          if (uniqueJobs.size >= maxUniqueResults) break;
        }
      } catch (error) {
        lastError = error;
        console.log(`⚠️ Naukri reader source failed (${keyword}): ${error.message}`);
      }
    }

    if (uniqueJobs.size >= maxUniqueResults) break;
  }

  const jobs = [...uniqueJobs.values()];
  if (jobs.length === 0 && lastError) {
    throw lastError;
  }
  console.log(`✅ Naukri reader provider collected: ${jobs.length} unique job(s)`);
  return jobs;
}
