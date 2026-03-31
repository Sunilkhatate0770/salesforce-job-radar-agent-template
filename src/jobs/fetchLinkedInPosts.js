const DUCKDUCKGO_HTML = "https://html.duckduckgo.com/html/";

const DEFAULT_LOCATION =
  process.env.LINKEDIN_LOCATION || process.env.NAUKRI_LOCATION || "India";

const ROLE_PATTERNS = [
  /salesforce(?:\s+platform)?\s+developer/i,
  /salesforce\s+engineer/i,
  /salesforce\s+consultant/i,
  /apex\s+developer/i,
  /lwc\s+developer/i,
  /lightning\s+developer/i,
  /sfdc\s+developer/i
];

const LOCATION_PATTERNS = [
  "Remote",
  "India",
  "Bengaluru",
  "Bangalore",
  "Hyderabad",
  "Pune",
  "Mumbai",
  "Delhi",
  "Gurugram",
  "Noida",
  "Chennai",
  "Kolkata"
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

function makeStablePostId(url) {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function getPlanKeywords(plan, maxKeywords = 2) {
  const keywords = Array.isArray(plan?.keywords)
    ? plan.keywords.map(value => String(value || "").trim()).filter(Boolean)
    : [];

  if (keywords.length > 0) return keywords.slice(0, maxKeywords);
  return ["Salesforce Developer"];
}

function buildSearchQueries(plans) {
  const maxQueries = Math.max(
    1,
    Number(process.env.LINKEDIN_POSTS_QUERIES_PER_RUN || 3)
  );
  const queries = [];

  for (const plan of Array.isArray(plans) ? plans : []) {
    for (const keyword of getPlanKeywords(plan, 2)) {
      queries.push(
        `site:linkedin.com/posts "${keyword}" hiring ${DEFAULT_LOCATION}`,
        `site:linkedin.com/posts "${keyword}" hiring remote`
      );
    }
  }

  return [...new Set(queries)].slice(0, maxQueries);
}

function decodeDuckDuckGoUrl(rawHref) {
  const href = decodeHtml(String(rawHref || "").trim());
  if (!href) return "";

  try {
    const normalized = href.startsWith("//")
      ? `https:${href}`
      : href.startsWith("/")
        ? `https://duckduckgo.com${href}`
        : href;
    const url = new URL(normalized);
    const nested = url.searchParams.get("uddg");
    return normalizeApplyLink(nested || normalized);
  } catch {
    return normalizeApplyLink(href);
  }
}

function parseSearchResults(html) {
  const results = [];
  const regex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;

  for (const match of html.matchAll(regex)) {
    const href = decodeDuckDuckGoUrl(match[1]);
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[4] || match[5] || "");
    if (!href || !title) continue;

    results.push({ href, title, snippet });
  }

  return results;
}

function isLikelyLinkedInPost(url) {
  const normalized = normalizeText(url);
  return (
    normalized.includes("linkedin.com/posts/") ||
    normalized.includes("linkedin.com/feed/update/")
  );
}

function hasHiringSignals(text) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("hiring") ||
    normalized.includes("looking for") ||
    normalized.includes("job opening") ||
    normalized.includes("opening") ||
    normalized.includes("apply now") ||
    normalized.includes("vacancy")
  );
}

function hasSalesforceSignals(text) {
  const normalized = normalizeText(text);
  return (
    normalized.includes("salesforce") ||
    normalized.includes("apex") ||
    normalized.includes("lwc") ||
    normalized.includes("sfdc") ||
    normalized.includes("lightning")
  );
}

function extractRole(text) {
  const raw = String(text || "");
  const matched = ROLE_PATTERNS.find(pattern => pattern.test(raw));
  if (!matched) return "";
  const result = raw.match(matched);
  return decodeHtml(result?.[0] || "");
}

function extractCompany(text) {
  const raw = decodeHtml(String(text || ""));
  const match = raw.match(/\b(?:at|with|for)\s+([A-Z][A-Za-z0-9&.,\- ]{2,60})/);
  return match ? match[1].trim().replace(/\s+on LinkedIn$/i, "") : "";
}

function extractAuthor(title) {
  const raw = decodeHtml(String(title || ""));
  const match = raw.match(/^(.+?)\s+on LinkedIn/i);
  return match ? match[1].trim() : "";
}

function extractLocation(text) {
  const raw = decodeHtml(String(text || ""));
  for (const keyword of LOCATION_PATTERNS) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (regex.test(raw)) return keyword;
  }
  return "";
}

function createPostRecord(result, query) {
  const combinedText = `${result.title} ${result.snippet}`;
  if (!hasHiringSignals(combinedText) || !hasSalesforceSignals(combinedText)) {
    return null;
  }

  const role = extractRole(combinedText) || "Salesforce Hiring Post";
  const company = extractCompany(combinedText);
  const author = extractAuthor(result.title);
  const location = extractLocation(combinedText) || DEFAULT_LOCATION;
  const applyLink = result.href;

  return {
    source_platform: "linkedin_posts",
    opportunity_kind: "post",
    title: role,
    company,
    location,
    experience: "",
    description: result.snippet || result.title,
    skills: "",
    apply_link: applyLink,
    post_url: result.href,
    post_author: author,
    source_job_id: `linkedin_post:${makeStablePostId(result.href)}`,
    source_evidence: {
      query,
      title: result.title,
      snippet: result.snippet
    },
    posted_at: null
  };
}

async function fetchSearchPage(query) {
  const url = new URL(DUCKDUCKGO_HTML);
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`LinkedIn posts search failed with status ${response.status}`);
  }

  return response.text();
}

export async function fetchLinkedInPosts({
  plans = [],
  maxUniqueResults = 30
} = {}) {
  if (!isTruthy(process.env.ENABLE_POST_PROVIDERS || "true")) {
    console.log("ℹ️ LinkedIn posts provider skipped: post providers disabled");
    return [];
  }

  const queries = buildSearchQueries(plans);
  const unique = new Map();

  for (const query of queries) {
    if (unique.size >= maxUniqueResults) break;

    try {
      const html = await fetchSearchPage(query);
      const results = parseSearchResults(html)
        .filter(result => isLikelyLinkedInPost(result.href));

      for (const result of results) {
        if (unique.size >= maxUniqueResults) break;
        const record = createPostRecord(result, query);
        if (!record) continue;
        unique.set(record.post_url, record);
      }
    } catch (error) {
      console.log(`⚠️ LinkedIn posts query failed (${query}): ${error.message}`);
    }
  }

  const jobs = [...unique.values()];
  console.log(`✅ LinkedIn posts provider collected: ${jobs.length} public hiring post(s)`);
  return jobs;
}
