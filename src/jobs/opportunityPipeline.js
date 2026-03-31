import crypto from "node:crypto";

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

const HIRING_KEYWORDS = [
  "hiring",
  "we are hiring",
  "looking for",
  "opening",
  "open position",
  "job opening",
  "vacancy",
  "apply now",
  "join our team"
];

const SALESFORCE_POST_KEYWORDS = [
  "salesforce",
  "sfdc",
  "apex",
  "lwc",
  "lightning",
  "cpq",
  "service cloud",
  "sales cloud",
  "experience cloud",
  "field service"
];

const ROLE_PATTERNS = [
  /salesforce(?:\s+platform)?\s+developer/i,
  /salesforce\s+engineer/i,
  /salesforce\s+consultant/i,
  /apex\s+developer/i,
  /lwc\s+developer/i,
  /lightning\s+developer/i,
  /sfdc\s+developer/i,
  /salesforce\s+administrator/i
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplay(value, fallback = "") {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function normalizeApplyLink(link) {
  const raw = String(link || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw
      .toLowerCase()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
  }
}

function safeJsonClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function extractEmail(text) {
  const match = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function inferSourcePlatform(job) {
  const explicit = normalizeText(job?.source_platform);
  if (explicit) return explicit;

  const sourceId = normalizeText(job?.source_job_id);
  const applyLink = normalizeText(job?.apply_link);
  const postUrl = normalizeText(job?.post_url);
  const combinedLink = postUrl || applyLink;

  if (sourceId.startsWith("linkedin_post:") || combinedLink.includes("linkedin.com/posts")) {
    return "linkedin_posts";
  }
  if (sourceId.startsWith("linkedin:") || combinedLink.includes("linkedin.com")) {
    return "linkedin";
  }
  if (sourceId.startsWith("naukri:") || combinedLink.includes("naukri.com")) {
    return "naukri";
  }
  if (sourceId.startsWith("arbeitnow:") || combinedLink.includes("arbeitnow.com")) {
    return "arbeitnow";
  }
  if (sourceId.startsWith("adzuna:") || combinedLink.includes("adzuna.")) {
    return "adzuna";
  }

  return "other";
}

function inferOpportunityKind(job) {
  const explicit = normalizeText(job?.opportunity_kind);
  if (explicit === "listing" || explicit === "post") {
    return explicit;
  }

  const sourcePlatform = inferSourcePlatform(job);
  const postUrl = normalizeText(job?.post_url);
  const evidence = normalizeText(
    `${job?.description || ""} ${job?.source_platform || ""} ${job?.source_job_id || ""}`
  );

  if (
    sourcePlatform.endsWith("_posts") ||
    postUrl ||
    evidence.includes("linkedin post") ||
    evidence.includes("hiring post")
  ) {
    return "post";
  }

  return "listing";
}

function inferCanonicalRole(job) {
  const title = normalizeDisplay(job?.title);
  const combinedText = normalizeDisplay(
    [job?.title, job?.description, job?.source_evidence?.title]
      .filter(Boolean)
      .join(" ")
  );
  if (!combinedText) return "";

  const matched = ROLE_PATTERNS.find(pattern => pattern.test(combinedText));
  if (matched) {
    const roleMatch = combinedText.match(matched);
    return normalizeText(roleMatch?.[0] || combinedText);
  }

  const cleaned = title
    .replace(/^we are hiring[:\s-]*/i, "")
    .replace(/^hiring[:\s-]*/i, "")
    .replace(/^looking for[:\s-]*/i, "")
    .trim();

  return normalizeText(cleaned);
}

function inferCanonicalCompany(job) {
  return normalizeText(job?.company);
}

function getOpportunityText(job) {
  return normalizeText(
    [
      job?.title,
      job?.company,
      job?.location,
      job?.description,
      job?.skills,
      job?.source_evidence?.snippet
    ].filter(Boolean).join(" ")
  );
}

function inferLocationScope(job) {
  const text = getOpportunityText(job);
  if (REMOTE_KEYWORDS.some(keyword => text.includes(keyword))) {
    return "remote";
  }
  if (INDIA_LOCATION_KEYWORDS.some(keyword => text.includes(keyword))) {
    return "india";
  }
  return "other";
}

function isInGeoScope(job) {
  const scope = String(process.env.OPPORTUNITY_GEO_SCOPE || "india_remote")
    .trim()
    .toLowerCase();
  const locationScope = inferLocationScope(job);

  if (scope === "india") return locationScope === "india";
  if (scope === "global") return true;
  return locationScope === "india" || locationScope === "remote";
}

function inferConfidenceTier(job) {
  const kind = inferOpportunityKind(job);
  const text = getOpportunityText(job);
  const hasRole = Boolean(inferCanonicalRole(job));
  const hasCompany = Boolean(inferCanonicalCompany(job));
  const hasLocation = Boolean(normalizeDisplay(job?.location));
  const applyLink = normalizeApplyLink(job?.apply_link);
  const postUrl = normalizeApplyLink(job?.post_url);
  const email = extractEmail(text);
  const hasContactSignal = Boolean(email);
  const hiringSignals = HIRING_KEYWORDS.filter(keyword => text.includes(keyword));
  const salesforceSignals = SALESFORCE_POST_KEYWORDS.filter(keyword => text.includes(keyword));

  if (kind === "listing") {
    if (hasRole && hasCompany && applyLink) return "high";
    if ((hasRole && hasCompany) || (hasRole && hasLocation && hiringSignals.length >= 1)) {
      return "medium";
    }
    return "low";
  }

  const hasPostLink = Boolean(postUrl || applyLink);
  if (
    hiringSignals.length >= 1 &&
    salesforceSignals.length >= 1 &&
    hasRole &&
    hasCompany &&
    (hasPostLink || hasContactSignal)
  ) {
    return "high";
  }

  if (
    hiringSignals.length >= 1 &&
    salesforceSignals.length >= 1 &&
    hasRole &&
    (hasCompany || hasLocation || hasPostLink)
  ) {
    return "medium";
  }

  return "low";
}

function buildCanonicalApplyUrl(job) {
  return normalizeApplyLink(job?.canonical_apply_url || job?.apply_link || job?.post_url);
}

function buildLocationKey(job) {
  const location = normalizeDisplay(job?.location);
  if (!location) {
    return inferLocationScope(job);
  }

  return normalizeText(location.split(",")[0]);
}

function buildMergeKey(job) {
  const role = inferCanonicalRole(job);
  const company = inferCanonicalCompany(job);
  const location = buildLocationKey(job);
  if (role && company) {
    return `canonical:${role}|${company}|${location}`;
  }

  const sourceJobId = normalizeText(job?.source_job_id);
  if (sourceJobId) {
    return `source:${sourceJobId}`;
  }

  const canonicalApplyUrl = buildCanonicalApplyUrl(job);
  if (canonicalApplyUrl) {
    return `url:${canonicalApplyUrl}`;
  }

  const postUrl = normalizeApplyLink(job?.post_url);
  if (postUrl) {
    return `post:${postUrl}`;
  }

  return `fallback:${hashValue(JSON.stringify([
    normalizeText(job?.title),
    normalizeText(job?.company),
    normalizeText(job?.location),
    normalizeText(job?.description)
  ]))}`;
}

function getConfidenceRank(tier) {
  if (tier === "high") return 3;
  if (tier === "medium") return 2;
  return 1;
}

function getKindRank(kind) {
  return kind === "listing" ? 2 : 1;
}

function getMatchRank(job) {
  const score = Number(job?.match_score);
  return Number.isFinite(score) ? score : 0;
}

function sortOpportunities(jobs) {
  return [...jobs].sort((left, right) => {
    const confidenceDiff =
      getConfidenceRank(right.confidence_tier) - getConfidenceRank(left.confidence_tier);
    if (confidenceDiff !== 0) return confidenceDiff;

    const kindDiff = getKindRank(right.opportunity_kind) - getKindRank(left.opportunity_kind);
    if (kindDiff !== 0) return kindDiff;

    const matchDiff = getMatchRank(right) - getMatchRank(left);
    if (matchDiff !== 0) return matchDiff;

    return normalizeDisplay(left?.title).localeCompare(normalizeDisplay(right?.title));
  });
}

function mergeEvidenceRecords(records) {
  const mergedSources = [...new Set(records.map(record => inferSourcePlatform(record)).filter(Boolean))];
  const mergedKinds = [...new Set(records.map(record => inferOpportunityKind(record)).filter(Boolean))];
  const postUrls = [...new Set(records.map(record => normalizeDisplay(record?.post_url)).filter(Boolean))];
  const applyLinks = [...new Set(records.map(record => normalizeDisplay(record?.apply_link)).filter(Boolean))];
  const evidenceItems = records
    .map(record => record?.source_evidence)
    .filter(value => value && typeof value === "object")
    .map(value => safeJsonClone(value));

  return {
    merged_sources: mergedSources,
    merged_kinds: mergedKinds,
    merged_count: records.length,
    post_urls: postUrls,
    apply_links: applyLinks,
    items: evidenceItems.slice(0, 6)
  };
}

export function normalizeOpportunity(job) {
  const sourcePlatform = inferSourcePlatform(job);
  const opportunityKind = inferOpportunityKind(job);
  const canonicalRole = normalizeDisplay(
    job?.canonical_role || inferCanonicalRole(job)
  );
  const canonicalCompany = normalizeDisplay(
    job?.canonical_company || inferCanonicalCompany(job)
  );
  const canonicalApplyUrl = buildCanonicalApplyUrl(job);
  const postUrl = normalizeDisplay(job?.post_url);
  const confidenceTier = inferConfidenceTier(job);
  const locationScope = inferLocationScope(job);
  const sourceEvidence = {
    snippet: normalizeDisplay(job?.source_evidence?.snippet || job?.description).slice(0, 320),
    matched_signals: {
      hiring: HIRING_KEYWORDS.filter(keyword => getOpportunityText(job).includes(keyword)).slice(0, 4),
      salesforce: SALESFORCE_POST_KEYWORDS.filter(keyword => getOpportunityText(job).includes(keyword)).slice(0, 4)
    },
    location_scope: locationScope,
    provider: sourcePlatform
  };

  return {
    ...job,
    source_platform: sourcePlatform,
    opportunity_kind: opportunityKind,
    confidence_tier: confidenceTier,
    canonical_apply_url: canonicalApplyUrl,
    canonical_company: canonicalCompany,
    canonical_role: canonicalRole,
    post_author: normalizeDisplay(job?.post_author),
    post_url: postUrl,
    source_evidence: {
      ...(typeof job?.source_evidence === "object" && job?.source_evidence !== null
        ? safeJsonClone(job.source_evidence)
        : {}),
      ...sourceEvidence
    },
    location_scope: locationScope,
    alert_bucket: confidenceTier === "high"
      ? "instant"
      : confidenceTier === "medium"
        ? "review"
        : "suppress"
  };
}

export function prepareOpportunities(jobs) {
  const normalized = (Array.isArray(jobs) ? jobs : [])
    .map(normalizeOpportunity)
    .filter(job => isInGeoScope(job));

  const groups = new Map();
  for (const job of normalized) {
    const mergeKey = buildMergeKey(job);
    if (!groups.has(mergeKey)) {
      groups.set(mergeKey, []);
    }
    groups.get(mergeKey).push(job);
  }

  const merged = [];
  let mergedDuplicateCount = 0;

  for (const records of groups.values()) {
    const ordered = sortOpportunities(records);
    const primary = ordered[0];
    const mergedEvidence = mergeEvidenceRecords(records);
    const mergedRecord = {
      ...primary,
      source_evidence: {
        ...(primary?.source_evidence || {}),
        ...mergedEvidence
      },
      related_post_urls: mergedEvidence.post_urls,
      related_sources: mergedEvidence.merged_sources
    };

    if (records.length > 1) {
      mergedDuplicateCount += records.length - 1;
      if (
        mergedEvidence.merged_kinds.includes("listing") &&
        mergedEvidence.merged_kinds.includes("post")
      ) {
        mergedRecord.opportunity_kind = "listing";
      }
      if (mergedEvidence.merged_sources.includes("linkedin_posts")) {
        mergedRecord.post_url = mergedRecord.post_url || mergedEvidence.post_urls[0] || "";
      }
    }

    merged.push(mergedRecord);
  }

  const sorted = sortOpportunities(merged);
  const summary = buildOpportunitySummary(sorted, {
    rawCount: Array.isArray(jobs) ? jobs.length : 0,
    mergedDuplicateCount
  });

  return {
    jobs: sorted,
    summary
  };
}

export function buildOpportunitySummary(jobs, extra = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  const byKind = { listing: 0, post: 0 };
  const byConfidence = { high: 0, medium: 0, low: 0 };
  const bySource = {};

  for (const job of list) {
    const kind = inferOpportunityKind(job);
    const confidence = normalizeText(job?.confidence_tier || inferConfidenceTier(job));
    const source = inferSourcePlatform(job);
    byKind[kind] = (byKind[kind] || 0) + 1;
    byConfidence[confidence] = (byConfidence[confidence] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
  }

  return {
    raw_count: Number(extra.rawCount || list.length),
    merged_count: list.length,
    merged_duplicate_count: Number(extra.mergedDuplicateCount || 0),
    by_kind: byKind,
    by_confidence: byConfidence,
    by_source: bySource
  };
}

export function getOpportunityKindLabel(job) {
  return inferOpportunityKind(job) === "post" ? "Hiring Post" : "Job Listing";
}

export function getOpportunityConfidenceLabel(job) {
  const tier = normalizeText(job?.confidence_tier || inferConfidenceTier(job));
  if (tier === "high") return "High confidence";
  if (tier === "medium") return "Medium confidence";
  return "Low confidence";
}

export function splitOpportunitiesForAlerts(jobs) {
  const list = sortOpportunities(Array.isArray(jobs) ? jobs : []);
  return {
    highListings: list.filter(job =>
      normalizeText(job?.confidence_tier) === "high" &&
      inferOpportunityKind(job) === "listing"
    ),
    highPosts: list.filter(job =>
      normalizeText(job?.confidence_tier) === "high" &&
      inferOpportunityKind(job) === "post"
    ),
    mediumQueue: list.filter(job => normalizeText(job?.confidence_tier) === "medium"),
    suppressedLow: list.filter(job => normalizeText(job?.confidence_tier) === "low")
  };
}

export function getPostAlertPolicy() {
  const policy = normalizeText(process.env.POST_ALERT_POLICY || "high_and_medium");
  if (["off", "disabled", "none"].includes(policy)) {
    return "off";
  }
  if (["high_only", "high"].includes(policy)) {
    return "high_only";
  }
  return "high_and_medium";
}

export function selectOpportunitiesForAlerts(
  jobs,
  {
    maxItems = Number.POSITIVE_INFINITY,
    mediumLimit = Number(process.env.ALERT_MEDIUM_DIGEST_MAX_ITEMS || 4)
  } = {}
) {
  const split = splitOpportunitiesForAlerts(jobs);
  const postPolicy = getPostAlertPolicy();
  const includeHighPosts = postPolicy !== "off";
  const includeMediumPosts = postPolicy === "high_and_medium";
  const effectiveHighPosts = includeHighPosts ? split.highPosts : [];
  const effectiveMediumQueue = split.mediumQueue.filter(job =>
    inferOpportunityKind(job) !== "post" || includeMediumPosts
  );
  const prioritizedHigh = sortOpportunities([
    ...split.highListings,
    ...effectiveHighPosts
  ]);
  const selectedHigh = Number.isFinite(maxItems)
    ? prioritizedHigh.slice(0, Math.max(0, Math.floor(Number(maxItems))))
    : prioritizedHigh;
  const selectedHighKeys = new Set(
    selectedHigh.map(job =>
      String(job?.job_hash || job?.source_job_id || buildMergeKey(job)).trim()
    )
  );
  const selectedMedium = sortOpportunities(effectiveMediumQueue)
    .filter(job => {
      const key = String(
        job?.job_hash || job?.source_job_id || buildMergeKey(job)
      ).trim();
      return !selectedHighKeys.has(key);
    })
    .slice(0, Math.max(0, Number(mediumLimit || 0)));
  const suppressedByPolicy = [
    ...(includeHighPosts ? [] : split.highPosts),
    ...(includeMediumPosts ? [] : split.mediumQueue.filter(job => inferOpportunityKind(job) === "post"))
  ];

  return {
    split,
    postPolicy,
    selectedHigh,
    selectedMedium,
    jobsToAlert: [...selectedHigh, ...selectedMedium],
    prioritizedHigh,
    effectiveHighPosts,
    effectiveMediumQueue,
    suppressedByPolicy
  };
}

export function shouldGenerateFullResumePack(job) {
  return inferOpportunityKind(job) === "listing";
}

export function buildCoverageHealth(fetchReport, summary = {}) {
  const providers = Array.isArray(fetchReport?.providers) ? fetchReport.providers : [];
  const pausedProviders = providers
    .filter(provider => String(provider?.status || "").toLowerCase() === "paused")
    .map(provider => provider.provider);
  const zeroResultProviders = providers
    .filter(provider =>
      Number(provider?.raw_count || 0) === 0 &&
      String(provider?.status || "").toLowerCase() !== "paused"
    )
    .map(provider => provider.provider);

  return {
    provider_count: providers.length,
    paused_providers: pausedProviders,
    zero_result_providers: zeroResultProviders,
    listing_count: Number(summary?.by_kind?.listing || 0),
    post_count: Number(summary?.by_kind?.post || 0),
    medium_count: Number(summary?.by_confidence?.medium || 0),
    high_count: Number(summary?.by_confidence?.high || 0),
    low_count: Number(summary?.by_confidence?.low || 0),
    opportunity_summary: summary
  };
}
