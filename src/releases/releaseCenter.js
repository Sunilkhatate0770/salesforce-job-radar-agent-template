import fs from "fs/promises";
import path from "path";
import { readSupabaseJsonState, writeSupabaseJsonState } from "../db/stateStore.js";

export const RELEASE_CENTER_STATE_KEY = "salesforce_release_center";

const CACHE_PATH = path.resolve(process.cwd(), ".cache/salesforce-release-center.json");
const RELEASES_URL = "https://www.salesforce.com/releases/";
const RELEASE_NOTES_URL =
  "https://help.salesforce.com/s/articleView?id=release-notes.salesforce_release_notes.htm&language=en_US&release=262&type=5";

const CATEGORY_BLUEPRINTS = [
  {
    category: "Apex",
    topicId: "adv_apex",
    keywords: ["apex", "api", "metadata api", "developer", "test"],
    title: "Review Apex, API, and developer platform changes",
    whyMatters: "Developer roles expect release-ready answers around test impact, API versions, limits, and production rollout risk.",
    interviewAngle: "Explain your release review process: scan notes, test in sandbox, update API/code assumptions, and document impact."
  },
  {
    category: "LWC",
    topicId: "lwc",
    keywords: ["lightning web components", "lwc", "ui api", "lightning"],
    title: "Refresh Lightning Web Components and UI development guidance",
    whyMatters: "Frontend Salesforce work must stay accessible, performant, and compatible with current Lightning platform behavior.",
    interviewAngle: "Connect release changes to Jest checks, component regression testing, accessibility, and UI API behavior."
  },
  {
    category: "Flow",
    topicId: "flows_guide",
    keywords: ["flow", "automation", "record-triggered", "builder"],
    title: "Track Flow Builder and automation behavior changes",
    whyMatters: "Most teams now mix Apex and Flow, so developers need to know where releases affect declarative automation.",
    interviewAngle: "Use a Flow vs Apex answer that includes limits, maintainability, error handling, and release regression testing."
  },
  {
    category: "Security",
    topicId: "security_full",
    keywords: ["security", "permission", "sharing", "identity", "trust", "session"],
    title: "Review security, sharing, and trust-impacting updates",
    whyMatters: "Security release changes can become production incidents if CRUD/FLS, identity, sharing, or access assumptions shift.",
    interviewAngle: "Describe how you validate permission sets, user mode, sharing, and sandbox access before release rollout."
  },
  {
    category: "Integration",
    topicId: "integration",
    keywords: ["integration", "connected app", "api", "event", "platform event", "named credential"],
    title: "Review API, integration, and event-driven architecture updates",
    whyMatters: "Mid-to-senior roles expect versioning, authentication, retries, and monitoring to be release-aware.",
    interviewAngle: "Walk through an integration checklist covering contracts, API versions, credentials, retry behavior, and observability."
  },
  {
    category: "Agentforce",
    topicId: "fde_ag_concept",
    keywords: ["agentforce", "agent", "prompt", "action", "grounding", "einstein"],
    title: "Study Agentforce, actions, grounding, and AI governance updates",
    whyMatters: "Agentforce is now a major differentiator for AI-focused Salesforce candidates and implementation teams.",
    interviewAngle: "Explain action selection, grounding, testing, monitoring, trust controls, and when a human approval step is needed."
  },
  {
    category: "Data Cloud/Data 360",
    topicId: "fde_dc_concept",
    keywords: ["data cloud", "data 360", "identity resolution", "segment", "activation", "dmo"],
    title: "Review Data Cloud/Data 360 identity, activation, and AI data changes",
    whyMatters: "Data Cloud underpins personalization, segmentation, analytics, and grounded AI architecture conversations.",
    interviewAngle: "Discuss DLOs, DMOs, identity resolution, activation, consent, and how trusted data supports AI."
  },
  {
    category: "Admin",
    topicId: "admin",
    keywords: ["setup", "sales cloud", "service cloud", "report", "dashboard", "admin"],
    title: "Review Admin, Sales Cloud, and Service Cloud usability updates",
    whyMatters: "Strong developers understand configuration impact, not only code changes.",
    interviewAngle: "Explain how you decide what to enable, test, train users on, document, or postpone."
  }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTextWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response?.ok) return "";
    return await response.text();
  } catch (error) {
    console.log(`Salesforce release source skipped: ${url} (${error.message})`);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function countKeywordHits(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return keywords.reduce((count, keyword) => {
    const escaped = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return count + (lower.match(new RegExp(escaped, "g")) || []).length;
  }, 0);
}

export function inferReleaseName(text = "", fallback = "Current Salesforce Release") {
  const normalized = stripHtml(text);
  const match = normalized.match(/\b(Spring|Summer|Winter)\s+[’']?(\d{2})\b/i);
  if (!match) return fallback;
  const season = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return `${season} '${match[2]}`;
}

function parseReleaseParts(releaseName) {
  const match = String(releaseName || "").match(/\b(Spring|Summer|Winter)\s+[’']?(\d{2})\b/i);
  if (!match) return { season: "Current", year: new Date().getFullYear() };
  return {
    season: match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(),
    year: 2000 + Number(match[2])
  };
}

function inferReleaseNameFromReleaseNotesUrl(url = RELEASE_NOTES_URL) {
  const match = String(url).match(/[?&]release=(\d+)/);
  if (!match) return "";
  const version = Number(match[1]);
  const seasonByRemainder = {
    0: "Winter",
    2: "Spring",
    4: "Summer"
  };
  const season = seasonByRemainder[version % 6] || "";
  if (!season) return "";
  const year = 2000 + Number(String(version).slice(0, 2));
  return `${season} '${String(year).slice(-2)}`;
}

function releaseSlug(releaseName) {
  return String(releaseName || "current")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildReleaseItems({ releaseName, text, source, lastChecked }) {
  return CATEGORY_BLUEPRINTS.map(blueprint => {
    const hits = countKeywordHits(text, blueprint.keywords);
    const signal = hits > 8
      ? "High official-note signal"
      : hits > 2
        ? "Moderate official-note signal"
        : "Baseline release-readiness watch";

    return {
      id: `${releaseSlug(releaseName)}-${blueprint.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      category: blueprint.category,
      releaseName,
      title: blueprint.title,
      whatChanged:
        `${signal}: use the latest official Salesforce release sources to review ${blueprint.category} changes, ` +
        "then confirm impact in sandbox before production rollout.",
      whyMatters: blueprint.whyMatters,
      interviewAngle: blueprint.interviewAngle,
      topicId: blueprint.topicId,
      experienceLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      designations: [
        "Admin + Developer",
        "Salesforce Developer",
        "Senior Salesforce Developer",
        "Technical Lead",
        "Architect",
        "FDE/Agentforce Specialist"
      ],
      source,
      lastChecked
    };
  });
}

export function buildOfficialReleasePayload({ releasesHtml = "", notesHtml = "", generatedAt = new Date().toISOString() } = {}) {
  const releasesText = stripHtml(releasesHtml);
  const notesText = stripHtml(notesHtml);
  const combinedText = `${notesText} ${releasesText}`;
  const releaseName = inferReleaseName(
    notesText,
    inferReleaseNameFromReleaseNotesUrl() || inferReleaseName(releasesText)
  );
  const parts = parseReleaseParts(releaseName);
  const lastChecked = generatedAt.slice(0, 10) || todayIso();
  const sources = [RELEASES_URL, RELEASE_NOTES_URL];

  return {
    version: `${releaseSlug(releaseName)}-${lastChecked}`,
    sourceMode: "official-refresh",
    generatedAt,
    activeRelease: {
      releaseName,
      season: parts.season,
      year: parts.year,
      lastChecked,
      sources
    },
    items: buildReleaseItems({
      releaseName,
      text: combinedText,
      source: RELEASE_NOTES_URL,
      lastChecked
    })
  };
}

export function normalizeReleaseCenterPayload(payload, fallback = { activeRelease: {}, items: [] }) {
  const activeRelease = payload?.activeRelease && typeof payload.activeRelease === "object"
    ? payload.activeRelease
    : fallback.activeRelease || {};
  const items = Array.isArray(payload?.items) && payload.items.length
    ? payload.items
    : fallback.items || [];

  return {
    ...(fallback || {}),
    ...(payload || {}),
    success: true,
    activeRelease,
    items
  };
}

export function selectPersonalizedReleaseItems(items = [], intelligence = {}, limit = 6) {
  const experienceYears = Number(intelligence.experienceYears || 1);
  const designation = String(intelligence.designation?.label || "").toLowerCase();
  const focusCategories = new Set((intelligence.releaseFocus?.items || [])
    .map(item => String(item.category || "").trim())
    .filter(Boolean));

  return [...items]
    .map(item => {
      const levelMatch = !Array.isArray(item.experienceLevels) ||
        item.experienceLevels.length === 0 ||
        item.experienceLevels.includes(experienceYears);
      const designationMatch = (item.designations || [])
        .some(value => String(value || "").toLowerCase() === designation);
      const categoryMatch = focusCategories.has(item.category);
      const score = (levelMatch ? 2 : 0) + (designationMatch ? 2 : 0) + (categoryMatch ? 3 : 0);
      return { item, score };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(match => match.item);
}

export async function readReleaseCenterPayload(fallback = { activeRelease: {}, items: [] }) {
  const state = await readSupabaseJsonState(RELEASE_CENTER_STATE_KEY);
  if (state) return normalizeReleaseCenterPayload(state, fallback);

  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    return normalizeReleaseCenterPayload(JSON.parse(raw), fallback);
  } catch (_) {
    return normalizeReleaseCenterPayload(fallback, fallback);
  }
}

export async function syncReleaseCenter({
  fetchImpl = fetch,
  timeoutMs = Number(process.env.SALESFORCE_RELEASE_FETCH_TIMEOUT_MS || 12000)
} = {}) {
  const [releasesHtml, notesHtml] = await Promise.all([
    fetchTextWithTimeout(fetchImpl, RELEASES_URL, timeoutMs),
    fetchTextWithTimeout(fetchImpl, RELEASE_NOTES_URL, timeoutMs)
  ]);

  if (!releasesHtml && !notesHtml) {
    throw new Error("Official Salesforce release sources were unavailable");
  }

  const payload = buildOfficialReleasePayload({ releasesHtml, notesHtml });
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
  await writeSupabaseJsonState(RELEASE_CENTER_STATE_KEY, payload);
  return payload;
}
