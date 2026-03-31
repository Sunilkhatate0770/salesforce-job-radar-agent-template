function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

const PRECISION_PROFILES = {
  wide: {
    required_skills: "salesforce,apex,lwc,flow,integration",
    required_mode: "any",
    exclude_keywords: "admin,administrator,qa,tester,intern,internship,trainee,walk-in",
    max_posted_hours: 336,
    keep_unknown_posted: true,
    cluster_duplicates: true
  },
  balanced: {
    required_skills: "apex,lwc,soql,integration",
    required_mode: "any",
    exclude_keywords: "admin,administrator,qa,tester,intern,internship,trainee,walk-in,support engineer",
    max_posted_hours: 168,
    keep_unknown_posted: true,
    cluster_duplicates: true
  },
  strict: {
    required_skills: "apex,lwc,soql,integration",
    required_mode: "all",
    exclude_keywords: "admin,administrator,qa,tester,intern,internship,trainee,walk-in,support engineer,support,analyst,non-it",
    max_posted_hours: 96,
    keep_unknown_posted: false,
    cluster_duplicates: true
  }
};

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function extractEmail(text) {
  const match = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
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

function getLocationToken(location) {
  const token = String(location || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return token;
}

function inferJobSource(job) {
  const sourceId = String(job?.source_job_id || "").toLowerCase();
  const link = String(job?.apply_link || "").toLowerCase();

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

function getSourcePriority(job) {
  const source = inferJobSource(job);
  const priorities = {
    Naukri: 5,
    LinkedIn: 4,
    Adzuna: 3,
    Arbeitnow: 2,
    Other: 1
  };
  return priorities[source] || 0;
}

function extractNaukriDateFromSourceId(job) {
  const sourceId = String(job?.source_job_id || "").toLowerCase();
  const match = sourceId.match(/naukri:(\d{6})\d*/i);
  if (!match) return null;

  const raw = match[1];
  const day = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4));
  const year = 2000 + Number(raw.slice(4, 6));
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPostedDate(job) {
  const candidates = [
    job?.posted_at,
    job?.postedAt,
    job?.posted_date,
    job?.published_at,
    job?.publishedAt,
    job?.created_at
  ];

  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return extractNaukriDateFromSourceId(job);
}

function buildFilterText(job) {
  return normalizeText(
    [
      job?.title,
      job?.company,
      job?.location,
      job?.experience,
      job?.skills,
      job?.description,
      job?.post_author,
      job?.source_evidence?.snippet,
      job?.source_evidence?.contact_email
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getEnvValue(name) {
  const value = String(process.env[name] || "").trim();
  return value ? value : "";
}

function parseMode(value, fallback = "any") {
  return String(value || fallback).trim().toLowerCase() === "all"
    ? "all"
    : "any";
}

function parseProfile() {
  const requested = String(process.env.PRECISION_PROFILE || "balanced")
    .trim()
    .toLowerCase();
  return PRECISION_PROFILES[requested] ? requested : "balanced";
}

function inferOpportunityKind(job) {
  const explicit = normalizeText(job?.opportunity_kind);
  if (explicit === "post" || explicit === "listing") {
    return explicit;
  }

  const sourcePlatform = normalizeText(job?.source_platform);
  const sourceId = normalizeText(job?.source_job_id);
  const postUrl = normalizeApplyLink(job?.post_url);
  if (
    explicit === "post" ||
    sourcePlatform.endsWith("_posts") ||
    sourceId.startsWith("linkedin_post:") ||
    postUrl.includes("linkedin.com/posts") ||
    postUrl.includes("linkedin.com/feed/update")
  ) {
    return "post";
  }

  return "listing";
}

function keepHighSignalPostsEnabled() {
  return isTruthy(process.env.PRECISION_KEEP_HIGH_SIGNAL_POSTS || "true");
}

function shouldKeepHighSignalPost(job, text) {
  if (!keepHighSignalPostsEnabled()) {
    return false;
  }

  if (inferOpportunityKind(job) !== "post") {
    return false;
  }

  const normalizedText = normalizeText(text);
  const postUrl = normalizeApplyLink(job?.post_url || job?.apply_link);
  const author = normalizeText(job?.post_author);
  const contactEmail = normalizeText(
    job?.source_evidence?.contact_email || extractEmail(normalizedText)
  );

  const hasSalesforceSignal =
    /\b(salesforce|apex|lwc|sfdc|lightning|cpq|service cloud|sales cloud)\b/i.test(
      normalizedText
    );
  const hasHiringSignal =
    /\b(hiring|looking for|job opening|opening|apply now|vacancy|share your resume|send your cv|send your resume|talent acquisition|immediate joiner)\b/i.test(
      normalizedText
    );
  const hasRoleSignal =
    /\b(salesforce developer|salesforce engineer|salesforce consultant|apex developer|lwc developer|lightning developer|sfdc developer|salesforce architect|salesforce administrator)\b/i.test(
      normalizedText
    );
  const hasRecruiterSignal =
    /\b(recruiter|talent acquisition|hiring manager|hr)\b/i.test(
      `${author} ${normalizedText}`
    );
  const hasPostLink =
    postUrl.includes("linkedin.com/posts") ||
    postUrl.includes("linkedin.com/feed/update");

  return (
    hasSalesforceSignal &&
    (hasHiringSignal || hasRecruiterSignal || Boolean(contactEmail)) &&
    (hasRoleSignal || Boolean(contactEmail)) &&
    (hasPostLink || Boolean(contactEmail) || Boolean(author))
  );
}

function resolvePrecisionConfig() {
  const profileName = parseProfile();
  const profile = PRECISION_PROFILES[profileName];

  const requiredSkills = parseCsv(
    getEnvValue("PRECISION_REQUIRED_SKILLS") || profile.required_skills
  );
  const requiredMode = parseMode(
    getEnvValue("PRECISION_REQUIRED_SKILLS_MODE") || profile.required_mode,
    profile.required_mode
  );
  const excludedKeywords = parseCsv(
    getEnvValue("PRECISION_EXCLUDE_KEYWORDS") || profile.exclude_keywords
  );
  const maxPostedHours = toFiniteNumber(
    getEnvValue("PRECISION_MAX_POSTED_HOURS") || profile.max_posted_hours,
    profile.max_posted_hours
  );
  const keepUnknownPosted = isTruthy(
    getEnvValue("PRECISION_KEEP_UNKNOWN_POSTED") || String(profile.keep_unknown_posted)
  );
  const clusterDuplicates = isTruthy(
    getEnvValue("PRECISION_CLUSTER_DUPLICATES") || String(profile.cluster_duplicates)
  );

  return {
    profile: profileName,
    requiredSkills,
    requiredMode,
    excludedKeywords,
    maxPostedHours,
    keepUnknownPosted,
    clusterDuplicates
  };
}

function getSourceCounts(jobs) {
  const counts = {
    Naukri: 0,
    LinkedIn: 0,
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

function getClusteringSignature(job) {
  const title = normalizeText(job?.title);
  const company = normalizeText(job?.company);
  const location = getLocationToken(job?.location);
  const experience = normalizeText(job?.experience);

  return `${title}|${company}|${location}|${experience}`;
}

function chooseRepresentative(existing, candidate) {
  if (!existing) return candidate;

  const existingPriority = getSourcePriority(existing);
  const candidatePriority = getSourcePriority(candidate);
  if (candidatePriority !== existingPriority) {
    return candidatePriority > existingPriority ? candidate : existing;
  }

  const existingDate = getPostedDate(existing)?.getTime() || 0;
  const candidateDate = getPostedDate(candidate)?.getTime() || 0;
  if (candidateDate !== existingDate) {
    return candidateDate > existingDate ? candidate : existing;
  }

  const existingScore = toFiniteNumber(existing?.match_score, 0);
  const candidateScore = toFiniteNumber(candidate?.match_score, 0);
  if (candidateScore !== existingScore) {
    return candidateScore > existingScore ? candidate : existing;
  }

  const existingDescLen = String(existing?.description || "").length;
  const candidateDescLen = String(candidate?.description || "").length;
  return candidateDescLen > existingDescLen ? candidate : existing;
}

function clusterDuplicateJobs(jobs, report) {
  const byLink = new Map();
  const clustered = [];
  let linkMergeCount = 0;

  for (const job of jobs) {
    const linkKey = normalizeApplyLink(job?.apply_link);
    if (!linkKey) {
      clustered.push(job);
      continue;
    }

    const existing = byLink.get(linkKey);
    if (!existing) {
      byLink.set(linkKey, job);
      clustered.push(job);
      continue;
    }

    const chosen = chooseRepresentative(existing, job);
    if (chosen !== existing) {
      const idx = clustered.indexOf(existing);
      if (idx >= 0) clustered[idx] = chosen;
      byLink.set(linkKey, chosen);
    }
    linkMergeCount += 1;
  }

  const bySignature = new Map();
  const deduped = [];
  let signatureMergeCount = 0;

  for (const job of clustered) {
    const signature = getClusteringSignature(job);
    if (!signature || signature === "|||") {
      deduped.push(job);
      continue;
    }

    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, {
        representative: job,
        sources: new Set([inferJobSource(job)]),
        links: new Set([normalizeApplyLink(job?.apply_link)])
      });
      deduped.push(job);
      continue;
    }

    existing.sources.add(inferJobSource(job));
    const canonicalLink = normalizeApplyLink(job?.apply_link);
    if (canonicalLink) existing.links.add(canonicalLink);

    const chosen = chooseRepresentative(existing.representative, job);
    if (chosen !== existing.representative) {
      const idx = deduped.indexOf(existing.representative);
      if (idx >= 0) deduped[idx] = chosen;
      existing.representative = chosen;
    }
    signatureMergeCount += 1;
  }

  const enriched = deduped.map(job => {
    const signature = getClusteringSignature(job);
    const bucket = bySignature.get(signature);
    if (!bucket) return job;

    return {
      ...job,
      source_variants: [...bucket.sources].sort(),
      duplicate_links: [...bucket.links].slice(0, 6)
    };
  });

  report.removed.duplicate_cluster = linkMergeCount + signatureMergeCount;
  report.cluster = {
    link_merge_count: linkMergeCount,
    signature_merge_count: signatureMergeCount
  };

  return enriched;
}

function applyRequiredSkillsFilter(jobs, requiredSkills, mode, report) {
  if (!requiredSkills.length) return jobs;

  const filtered = [];
  let removed = 0;
  let preservedHighSignalPosts = 0;

  for (const job of jobs) {
    const text = buildFilterText(job);
    const matches = requiredSkills.filter(skill => text.includes(skill));
    const keep = mode === "all"
      ? matches.length === requiredSkills.length
      : matches.length > 0;

    if (!keep) {
      if (shouldKeepHighSignalPost(job, text)) {
        filtered.push({
          ...job,
          precision_override: "high_signal_post"
        });
        preservedHighSignalPosts += 1;
        continue;
      }
      removed += 1;
      continue;
    }
    filtered.push(job);
  }

  report.removed.missing_required_skills = removed;
  report.preserved_high_signal_posts = preservedHighSignalPosts;
  return filtered;
}

function applyExcludeKeywordsFilter(jobs, excludedKeywords, report) {
  if (!excludedKeywords.length) return jobs;

  const filtered = [];
  let removed = 0;

  for (const job of jobs) {
    const text = buildFilterText(job);
    const blocked = excludedKeywords.some(keyword => text.includes(keyword));
    if (blocked) {
      removed += 1;
      continue;
    }
    filtered.push(job);
  }

  report.removed.exclude_keywords = removed;
  return filtered;
}

function applyPostedHoursFilter(jobs, maxPostedHours, keepUnknownPosted, report) {
  if (!Number.isFinite(maxPostedHours) || maxPostedHours <= 0) return jobs;

  const filtered = [];
  let removed = 0;

  for (const job of jobs) {
    const postedDate = getPostedDate(job);
    if (!postedDate) {
      if (keepUnknownPosted) {
        filtered.push(job);
      } else {
        removed += 1;
      }
      continue;
    }

    const ageHours = (Date.now() - postedDate.getTime()) / (1000 * 60 * 60);
    if (ageHours > maxPostedHours) {
      removed += 1;
      continue;
    }
    filtered.push(job);
  }

  report.removed.stale_posted = removed;
  return filtered;
}

export function applyPrecisionFilters(jobs) {
  const inputJobs = Array.isArray(jobs) ? jobs : [];
  const config = resolvePrecisionConfig();

  const report = {
    profile: config.profile,
    before_count: inputJobs.length,
    after_count: inputJobs.length,
    required_skills: config.requiredSkills,
    required_mode: config.requiredMode,
    excluded_keywords: config.excludedKeywords,
    max_posted_hours: config.maxPostedHours,
    keep_unknown_posted: config.keepUnknownPosted,
    cluster_duplicates: config.clusterDuplicates,
    removed: {
      exclude_keywords: 0,
      missing_required_skills: 0,
      stale_posted: 0,
      duplicate_cluster: 0
    },
    preserved_high_signal_posts: 0,
    source_mix_before: getSourceCounts(inputJobs),
    source_mix_after: {}
  };

  let filtered = [...inputJobs];
  filtered = applyExcludeKeywordsFilter(filtered, config.excludedKeywords, report);
  filtered = applyRequiredSkillsFilter(
    filtered,
    config.requiredSkills,
    config.requiredMode,
    report
  );
  filtered = applyPostedHoursFilter(
    filtered,
    config.maxPostedHours,
    config.keepUnknownPosted,
    report
  );
  if (config.clusterDuplicates) {
    filtered = clusterDuplicateJobs(filtered, report);
  }

  report.after_count = filtered.length;
  report.source_mix_after = getSourceCounts(filtered);

  return {
    jobs: filtered,
    report
  };
}
