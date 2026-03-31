import {
  buildOpportunitySummary,
  getOpportunityConfidenceLabel,
  getOpportunityKindLabel,
  splitOpportunitiesForAlerts
} from "../jobs/opportunityPipeline.js";

export const ACTION_CARD_RENDERER_VERSION = "action_cards_v2";

function normalize(value, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trimText(value, maxLength = 220) {
  const text = normalize(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function sortByMatch(jobs) {
  return [...(Array.isArray(jobs) ? jobs : [])].sort((left, right) => {
    const scoreDiff = Number(right?.match_score || 0) - Number(left?.match_score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return normalize(left?.title).localeCompare(normalize(right?.title));
  });
}

function inferSourceLabel(job) {
  const sourcePlatform = normalize(job?.source_platform).toLowerCase();
  if (sourcePlatform === "linkedin_posts") return "LinkedIn Posts";
  if (sourcePlatform === "linkedin") return "LinkedIn";
  if (sourcePlatform === "naukri_reader" || sourcePlatform === "naukri_direct" || sourcePlatform === "naukri") {
    return "Naukri";
  }
  if (sourcePlatform === "arbeitnow") return "Arbeitnow";
  if (sourcePlatform === "adzuna") return "Adzuna";
  if (sourcePlatform === "greenhouse") return "Greenhouse";
  if (sourcePlatform === "lever") return "Lever";
  if (sourcePlatform === "ashby") return "Ashby";
  return normalize(job?.source_platform, "Other");
}

function getPostedLabel(job) {
  const value = normalize(job?.posted_at || job?.postedAt || job?.posted_date || job?.date);
  if (!value) return "Recent";

  const postedAt = new Date(value);
  if (Number.isNaN(postedAt.getTime())) {
    return trimText(value, 40);
  }

  const diffMs = Math.max(0, Date.now() - postedAt.getTime());
  const diffHours = Math.round(diffMs / 3600000);
  if (diffHours < 1) return "Under 1h ago";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffMs / 86400000);
  return `${diffDays}d ago`;
}

function getActionUrl(job) {
  return normalize(job?.canonical_apply_url || job?.apply_link || job?.post_url);
}

function getActionLabel(job) {
  return normalize(job?.opportunity_kind).toLowerCase() === "post"
    ? "Open post"
    : "Open job";
}

function getResumeSupportLabel(job) {
  const mode = normalize(job?.resume_support?.mode).toLowerCase();
  if (mode === "full_pack_attached") return "Tailored pack attached";
  if (mode === "full_pack_ready") return "Tailored pack ready";
  if (mode === "preview_only") return "ATS preview included";
  return "";
}

function getPreviewList(job, key) {
  return Array.isArray(job?.resume_support?.preview?.[key])
    ? job.resume_support.preview[key].filter(Boolean)
    : [];
}

function getPreviewValue(job, key) {
  return normalize(job?.resume_support?.preview?.[key]);
}

function buildCardMetaLine(job) {
  return [
    trimText(job?.company || "Unknown company", 60),
    trimText(job?.location || "Location unknown", 60),
    getPostedLabel(job)
  ].filter(Boolean).join(" | ");
}

function buildTelegramCard(job, index) {
  const actionUrl = getActionUrl(job);
  const whyMatched = getPreviewList(job, "whyMatched");
  const matchedKeywords = getPreviewList(job, "matchedKeywords");
  const missingKeywords = getPreviewList(job, "missingKeywords");
  const generatedArtifacts = getPreviewList(job, "generatedArtifacts");
  const resumeLabel = getResumeSupportLabel(job);
  const atsSummary = getPreviewValue(job, "atsSummary");
  const atsKeywordCoverage = getPreviewValue(job, "atsKeywordCoverage");
  const lines = [
    `<b>${index}. ${escapeHtml(trimText(job?.title || "Unknown role", 100))}</b>`,
    escapeHtml(buildCardMetaLine(job)),
    `${escapeHtml(getOpportunityKindLabel(job))} | ${escapeHtml(getOpportunityConfidenceLabel(job))} | ${escapeHtml(inferSourceLabel(job))}`,
    `Match: <b>${escapeHtml(String(job?.match_score ?? "n/a"))}</b>${atsSummary ? ` | ${escapeHtml(atsSummary)}` : ""}${atsKeywordCoverage ? ` | ${escapeHtml(atsKeywordCoverage)}` : ""}`
  ];

  if (resumeLabel) lines.push(`Resume: ${escapeHtml(resumeLabel)}`);
  if (generatedArtifacts.length > 0) lines.push(`Pack: ${escapeHtml(generatedArtifacts.join(", "))}`);
  if (whyMatched.length > 0) {
    lines.push(`Why matched: ${escapeHtml(whyMatched.slice(0, 2).join(", "))}`);
  }
  if (matchedKeywords.length > 0) {
    lines.push(`JD matched: ${escapeHtml(matchedKeywords.slice(0, 4).join(", "))}`);
  }
  if (missingKeywords.length > 0) {
    lines.push(`Missing: ${escapeHtml(missingKeywords.slice(0, 4).join(", "))}`);
  }
  if (getPreviewValue(job, "headline")) {
    lines.push(`Resume headline: ${escapeHtml(getPreviewValue(job, "headline"))}`);
  }
  if (trimText(job?.source_evidence?.snippet || job?.description, 180)) {
    lines.push(`Evidence: ${escapeHtml(trimText(job?.source_evidence?.snippet || job?.description, 180))}`);
  }
  lines.push(
    actionUrl
      ? `<a href="${escapeHtml(actionUrl)}">${escapeHtml(getActionLabel(job))}</a>`
      : "Link unavailable"
  );

  return lines.join("\n");
}

function buildEmailTextCard(job, index) {
  const actionUrl = getActionUrl(job);
  const whyMatched = getPreviewList(job, "whyMatched");
  const matchedKeywords = getPreviewList(job, "matchedKeywords");
  const missingKeywords = getPreviewList(job, "missingKeywords");
  const generatedArtifacts = getPreviewList(job, "generatedArtifacts");
  const resumeLabel = getResumeSupportLabel(job);
  const atsSummary = getPreviewValue(job, "atsSummary");
  const atsKeywordCoverage = getPreviewValue(job, "atsKeywordCoverage");
  const lines = [
    `${index}. ${trimText(job?.title || "Unknown role", 120)}`,
    buildCardMetaLine(job),
    `Type: ${getOpportunityKindLabel(job)} | Confidence: ${getOpportunityConfidenceLabel(job)} | Source: ${inferSourceLabel(job)}`,
    `Match: ${String(job?.match_score ?? "n/a")}${atsSummary ? ` | ${atsSummary}` : ""}${atsKeywordCoverage ? ` | ${atsKeywordCoverage}` : ""}`
  ];

  if (resumeLabel) lines.push(`Resume: ${resumeLabel}`);
  if (generatedArtifacts.length > 0) lines.push(`Pack: ${generatedArtifacts.join(", ")}`);
  if (whyMatched.length > 0) lines.push(`Why matched: ${whyMatched.slice(0, 2).join(", ")}`);
  if (matchedKeywords.length > 0) lines.push(`JD matched: ${matchedKeywords.slice(0, 4).join(", ")}`);
  if (missingKeywords.length > 0) lines.push(`Missing: ${missingKeywords.slice(0, 4).join(", ")}`);
  if (getPreviewValue(job, "headline")) lines.push(`Resume headline: ${getPreviewValue(job, "headline")}`);
  if (trimText(job?.source_evidence?.snippet || job?.description, 180)) {
    lines.push(`Evidence: ${trimText(job?.source_evidence?.snippet || job?.description, 180)}`);
  }
  lines.push(`${getActionLabel(job)}: ${actionUrl || "N/A"}`);
  return lines.join("\n");
}

function renderEmailButton(label, href, tone = "#0f172a") {
  if (!href) {
    return `<span style="color:#94a3b8;">Link unavailable</span>`;
  }

  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 14px;border-radius:12px;background:${tone};color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(label)}</a>`;
}

function renderEmailBadge(label, background = "#e2e8f0", color = "#0f172a") {
  return `<span style="display:inline-block;margin:0 8px 8px 0;padding:6px 10px;border-radius:999px;background:${background};color:${color};font-size:12px;font-weight:700;">${escapeHtml(label)}</span>`;
}

function buildEmailHtmlCard(job, index) {
  const actionUrl = getActionUrl(job);
  const whyMatched = getPreviewList(job, "whyMatched");
  const matchedKeywords = getPreviewList(job, "matchedKeywords");
  const missingKeywords = getPreviewList(job, "missingKeywords");
  const generatedArtifacts = getPreviewList(job, "generatedArtifacts");
  const resumeLabel = getResumeSupportLabel(job);
  const atsSummary = getPreviewValue(job, "atsSummary");
  const atsKeywordCoverage = getPreviewValue(job, "atsKeywordCoverage");
  const badges = [
    renderEmailBadge(getOpportunityKindLabel(job), "#dbeafe", "#1d4ed8"),
    renderEmailBadge(getOpportunityConfidenceLabel(job), "#fef3c7", "#92400e"),
    renderEmailBadge(inferSourceLabel(job), "#dcfce7", "#166534"),
    renderEmailBadge(`Match ${String(job?.match_score ?? "n/a")}`, "#ede9fe", "#6d28d9")
  ];
  if (atsSummary) {
    badges.push(renderEmailBadge(atsSummary, "#e2e8f0", "#334155"));
  }
  if (atsKeywordCoverage) {
    badges.push(renderEmailBadge(atsKeywordCoverage, "#fae8ff", "#86198f"));
  }

  return (
    `<div style="margin:0 0 16px 0;padding:18px;border:1px solid #dbe3ea;border-radius:18px;background:#ffffff;box-shadow:0 10px 22px rgba(15,23,42,0.06);">` +
    `<div style="font-size:17px;font-weight:800;color:#0f172a;margin:0 0 8px 0;">${index}. ${escapeHtml(trimText(job?.title || "Unknown role", 120))}</div>` +
    `<div style="font-size:14px;color:#475569;line-height:1.7;margin-bottom:10px;">${escapeHtml(buildCardMetaLine(job))}</div>` +
    `<div style="margin-bottom:8px;">${badges.join("")}</div>` +
    `${resumeLabel ? `<div style="margin:0 0 8px 0;font-size:14px;color:#0f172a;"><strong>Resume:</strong> ${escapeHtml(resumeLabel)}</div>` : ""}` +
    `${generatedArtifacts.length > 0 ? `<div style="margin:0 0 8px 0;font-size:14px;color:#0f172a;"><strong>Pack:</strong> ${escapeHtml(generatedArtifacts.join(", "))}</div>` : ""}` +
    `${getPreviewValue(job, "headline") ? `<div style="margin:0 0 8px 0;font-size:14px;color:#0f172a;"><strong>Resume headline:</strong> ${escapeHtml(getPreviewValue(job, "headline"))}</div>` : ""}` +
    `${whyMatched.length > 0 ? `<div style="margin:0 0 8px 0;font-size:14px;color:#0f172a;"><strong>Why matched:</strong> ${escapeHtml(whyMatched.slice(0, 2).join(", "))}</div>` : ""}` +
    `${matchedKeywords.length > 0 ? `<div style="margin:0 0 8px 0;font-size:14px;color:#0f172a;"><strong>JD matched:</strong> ${escapeHtml(matchedKeywords.slice(0, 4).join(", "))}</div>` : ""}` +
    `${missingKeywords.length > 0 ? `<div style="margin:0 0 8px 0;font-size:14px;color:#0f172a;"><strong>Missing:</strong> ${escapeHtml(missingKeywords.slice(0, 4).join(", "))}</div>` : ""}` +
    `${trimText(job?.source_evidence?.snippet || job?.description, 180) ? `<div style="margin:0 0 12px 0;font-size:14px;color:#334155;line-height:1.7;"><strong>Evidence:</strong> ${escapeHtml(trimText(job?.source_evidence?.snippet || job?.description, 180))}</div>` : ""}` +
    `<div>${renderEmailButton(getActionLabel(job), actionUrl, "#0f172a")}</div>` +
    `</div>`
  );
}

function buildSection(definition) {
  const jobs = sortByMatch(definition?.jobs);
  if (jobs.length === 0) {
    return null;
  }

  return {
    title: normalize(definition?.title),
    description: normalize(definition?.description),
    jobs
  };
}

function renderSections(definitions) {
  const sections = (Array.isArray(definitions) ? definitions : [])
    .map(buildSection)
    .filter(Boolean);

  return {
    telegram: sections
      .map(section =>
        `<b>${escapeHtml(section.title)} (${section.jobs.length})</b>\n` +
        `${section.description ? `<i>${escapeHtml(section.description)}</i>\n` : ""}` +
        `\n` +
        section.jobs.map((job, index) => buildTelegramCard(job, index + 1)).join("\n\n")
      )
      .join("\n\n"),
    emailText: sections
      .map(section =>
        `${section.title} (${section.jobs.length})${section.description ? `\n${section.description}` : ""}\n\n` +
        section.jobs.map((job, index) => buildEmailTextCard(job, index + 1)).join("\n\n")
      )
      .join("\n\n"),
    emailHtml: sections
      .map(section =>
        `<div style="margin-top:24px;">` +
        `<h3 style="margin:0 0 10px 0;color:#0f172a;font-size:20px;">${escapeHtml(section.title)} (${section.jobs.length})</h3>` +
        `${section.description ? `<div style="margin:0 0 12px 0;color:#475569;font-size:14px;line-height:1.7;">${escapeHtml(section.description)}</div>` : ""}` +
        section.jobs.map((job, index) => buildEmailHtmlCard(job, index + 1)).join("") +
        `</div>`
      )
      .join("")
  };
}

function renderHeader({
  agentName,
  headline,
  sourceSummary,
  metrics = [],
  tone = "blue"
}) {
  const gradient = tone === "green"
    ? "linear-gradient(135deg,#052e16 0%,#14532d 45%,#0f766e 100%)"
    : tone === "amber"
      ? "linear-gradient(135deg,#451a03 0%,#9a3412 45%,#f59e0b 100%)"
      : "linear-gradient(135deg,#0f172a 0%,#1e293b 45%,#1d4ed8 100%)";

  return {
    telegram: [
      `<b>${escapeHtml(agentName)}</b>`,
      escapeHtml(headline),
      sourceSummary ? `Source mix: ${escapeHtml(sourceSummary)}` : "",
      metrics.length > 0 ? metrics.map(metric => escapeHtml(metric)).join(" | ") : ""
    ].filter(Boolean).join("\n"),
    emailText: [
      agentName,
      headline,
      sourceSummary ? `Source mix: ${sourceSummary}` : "",
      metrics.length > 0 ? metrics.join(" | ") : ""
    ].filter(Boolean).join("\n"),
    emailHtml:
      `<div style="padding:28px;border-radius:24px;background:${gradient};color:#ffffff;box-shadow:0 18px 34px rgba(15,23,42,0.22);">` +
      `<div style="font-size:30px;font-weight:900;margin-bottom:8px;letter-spacing:-0.02em;">${escapeHtml(agentName)}</div>` +
      `<div style="font-size:17px;line-height:1.7;">${escapeHtml(headline)}</div>` +
      `${sourceSummary ? `<div style="margin-top:8px;font-size:14px;opacity:0.9;">Source mix: ${escapeHtml(sourceSummary)}</div>` : ""}` +
      `${metrics.length > 0 ? `<div style="margin-top:14px;font-size:14px;opacity:0.95;">${metrics.map(metric => escapeHtml(metric)).join(" | ")}</div>` : ""}` +
      `</div>`
  };
}

function renderExtraSections(extra) {
  return {
    telegram: normalize(extra?.telegram),
    emailText: normalize(extra?.emailText),
    emailHtml: normalize(extra?.emailHtml)
  };
}

function renderTrendSection(title, textBody, htmlBody) {
  const text = normalize(textBody);
  const html = normalize(htmlBody);

  return {
    telegram: text ? `<b>${escapeHtml(title)}</b>\n${escapeHtml(text)}` : "",
    emailText: text ? `${title}\n${text}` : "",
    emailHtml: html
      ? `<div style="margin-top:22px;"><h3 style="margin:0 0 10px 0;color:#0f172a;font-size:20px;">${escapeHtml(title)}</h3>${html}</div>`
      : ""
  };
}

function joinParts(parts, separator = "\n\n") {
  return (Array.isArray(parts) ? parts : []).filter(Boolean).join(separator);
}

export function buildActionCardJobAlertMessages({
  agentName,
  jobs,
  sourceSummary,
  reviewPostJobs = [],
  topPackJobs = [],
  extraSections = {}
}) {
  const primaryJobs = Array.isArray(jobs) ? jobs : [];
  const reviewJobs = Array.isArray(reviewPostJobs) ? reviewPostJobs : [];
  const topTailoredJobs = Array.isArray(topPackJobs) ? topPackJobs : [];
  const summary = buildOpportunitySummary([...primaryJobs, ...reviewJobs]);
  const split = splitOpportunitiesForAlerts(primaryJobs);
  const sections = renderSections([
    { title: "High-confidence job listings", jobs: split.highListings },
    { title: "High-confidence hiring posts", jobs: split.highPosts },
    { title: "Hiring post review", description: "Strong recruiter-led posts that need quick manual review.", jobs: reviewJobs },
    { title: "Top tailored apply packs", description: "Highest-priority opportunities prepared for full tailoring.", jobs: topTailoredJobs },
    { title: "Medium-confidence review queue", jobs: split.mediumQueue }
  ]);
  const header = renderHeader({
    agentName,
    headline: reviewJobs.length > 0
      ? `${primaryJobs.length} opportunities + ${reviewJobs.length} post review lead(s) ready`
      : `${primaryJobs.length} opportunities ready to review`,
    sourceSummary,
    metrics: [
      `Listings ${summary.by_kind?.listing || 0}`,
      `Posts ${summary.by_kind?.post || 0}`,
      `Review ${summary.by_confidence?.medium || 0}`,
      `Tailored ${topTailoredJobs.length}`
    ]
  });
  const extra = renderExtraSections(extraSections);
  const topRole = trimText(primaryJobs[0]?.title || reviewJobs[0]?.title || "Opportunity update", 70);
  const subject = reviewJobs.length > 0
    ? `${agentName}: ${primaryJobs.length} opportunities + ${reviewJobs.length} post review lead(s) | ${topRole}`
    : `${agentName}: ${primaryJobs.length} opportunities | ${topRole}`;

  return {
    subject,
    telegram: joinParts([header.telegram, extra.telegram, sections.telegram]),
    text: joinParts([header.emailText, extra.emailText, sections.emailText]),
    html:
      `<!doctype html><html><body style="margin:0;padding:24px;background:radial-gradient(circle at top,#e0f2fe 0%,#f8fafc 42%,#eef2ff 100%);font-family:Segoe UI,Arial,sans-serif;color:#111827;"><div style="max-width:820px;margin:0 auto;">` +
      joinParts([header.emailHtml, extra.emailHtml, sections.emailHtml], "") +
      `</div></body></html>`
  };
}

export function buildActionCardResumePackMessages({
  agentName,
  jobs,
  sourceSummary = "",
  extraSections = {}
}) {
  const packJobs = sortByMatch(Array.isArray(jobs) ? jobs : []);
  const sections = renderSections([
    {
      title: "Tailored resume pack ready",
      description:
        "JD-matched PDF resume, apply pack, and follow-up draft prepared for quick application.",
      jobs: packJobs
    }
  ]);
  const header = renderHeader({
    agentName,
    headline: `${packJobs.length} tailored apply pack${packJobs.length === 1 ? "" : "s"} ready`,
    sourceSummary,
    metrics: [
      `Tailored ${packJobs.length}`,
      `Top match ${String(packJobs[0]?.match_score ?? "n/a")}`
    ],
    tone: "green"
  });
  const extra = renderExtraSections(extraSections);
  const topRole = trimText(packJobs[0]?.title || "Tailored opportunity", 70);

  return {
    subject: `${agentName}: tailored resume pack ready | ${topRole}`,
    telegram: joinParts([header.telegram, extra.telegram, sections.telegram]),
    text: joinParts([header.emailText, extra.emailText, sections.emailText]),
    html:
      `<!doctype html><html><body style="margin:0;padding:24px;background:radial-gradient(circle at top,#ecfeff 0%,#f8fafc 48%,#e0f2fe 100%);font-family:Segoe UI,Arial,sans-serif;color:#111827;"><div style="max-width:820px;margin:0 auto;">` +
      joinParts([header.emailHtml, extra.emailHtml, sections.emailHtml], "") +
      `</div></body></html>`
  };
}

export function buildActionCardHiringPostReviewMessages({
  agentName,
  jobs,
  sourceSummary,
  extraSections = {}
}) {
  const reviewJobs = Array.isArray(jobs) ? jobs : [];
  const sections = renderSections([
    {
      title: "Hiring post review",
      description: "Strong public hiring posts surfaced below the instant ATS threshold.",
      jobs: reviewJobs
    }
  ]);
  const header = renderHeader({
    agentName,
    headline: `${reviewJobs.length} hiring post review lead(s)`,
    sourceSummary,
    metrics: [`Posts ${reviewJobs.length}`],
    tone: "green"
  });
  const extra = renderExtraSections(extraSections);

  return {
    subject: `${agentName}: ${reviewJobs.length} hiring post review lead(s)`,
    telegram: joinParts([header.telegram, extra.telegram, sections.telegram]),
    text: joinParts([header.emailText, extra.emailText, sections.emailText]),
    html:
      `<!doctype html><html><body style="margin:0;padding:24px;background:radial-gradient(circle at top,#ecfeff 0%,#f8fafc 48%,#fef3c7 100%);font-family:Segoe UI,Arial,sans-serif;color:#111827;"><div style="max-width:820px;margin:0 auto;">` +
      joinParts([header.emailHtml, extra.emailHtml, sections.emailHtml], "") +
      `</div></body></html>`
  };
}

export function buildActionCardHeartbeatMessages({
  agentName,
  timeLabel,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary,
  note,
  classificationSummary = null,
  extraSections = {}
}) {
  const listingCount = Number(classificationSummary?.by_kind?.listing || 0);
  const postCount = Number(classificationSummary?.by_kind?.post || 0);
  const reviewCount = Number(classificationSummary?.by_confidence?.medium || 0);
  const header = renderHeader({
    agentName,
    headline: `Heartbeat (${timeLabel})`,
    sourceSummary,
    metrics: [
      `Fetched ${fetchedCount}`,
      `Matched ${salesforceCount}`,
      `New ${newCount}`,
      `Pending ${pendingCount}`,
      `Listings ${listingCount}`,
      `Posts ${postCount}`,
      `Review ${reviewCount}`
    ]
  });
  const extra = renderExtraSections(extraSections);
  const noteText = normalize(note);

  return {
    subject: `${agentName}: heartbeat (${timeLabel})`,
    telegram: joinParts([header.telegram, extra.telegram, noteText ? `Note: ${escapeHtml(noteText)}` : ""]),
    text: joinParts([header.emailText, extra.emailText, noteText ? `Note: ${noteText}` : ""]),
    html:
      `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#111827;"><div style="max-width:780px;margin:0 auto;">` +
      joinParts([
        header.emailHtml,
        extra.emailHtml,
        noteText
          ? `<div style="margin-top:18px;padding:16px;border:1px solid #dbe3ea;border-radius:16px;background:#ffffff;"><strong>Note:</strong> ${escapeHtml(noteText)}</div>`
          : ""
      ], "") +
      `</div></body></html>`
  };
}

export function buildActionCardDailySummaryMessages({
  agentName,
  dateKey,
  fetchedCount,
  salesforceCount,
  newCount,
  pendingCount,
  sourceSummary,
  classificationSummary = null,
  newJobs = [],
  trendSections = {},
  extraSections = {}
}) {
  const listingCount = Number(classificationSummary?.by_kind?.listing || 0);
  const postCount = Number(classificationSummary?.by_kind?.post || 0);
  const reviewCount = Number(classificationSummary?.by_confidence?.medium || 0);
  const sections = renderSections([
    { title: "New opportunities today", jobs: newJobs }
  ]);
  const header = renderHeader({
    agentName,
    headline: `Daily Summary (${dateKey})`,
    sourceSummary,
    metrics: [
      `Fetched ${fetchedCount}`,
      `Matched ${salesforceCount}`,
      `New ${newCount}`,
      `Pending ${pendingCount}`,
      `Listings ${listingCount}`,
      `Posts ${postCount}`,
      `Review ${reviewCount}`
    ],
    tone: "amber"
  });
  const extra = renderExtraSections(extraSections);
  const companyTrend = renderTrendSection("Top Companies", trendSections?.companiesText, trendSections?.companiesHtml);
  const locationTrend = renderTrendSection("Top Locations", trendSections?.locationsText, trendSections?.locationsHtml);
  const missingTrend = renderTrendSection("Missing Skills Trend", trendSections?.missingSkillsText, trendSections?.missingSkillsHtml);

  return {
    subject: `${agentName} daily summary (${dateKey})`,
    telegram: joinParts([header.telegram, extra.telegram, sections.telegram, companyTrend.telegram, locationTrend.telegram, missingTrend.telegram]),
    text: joinParts([header.emailText, extra.emailText, sections.emailText, companyTrend.emailText, locationTrend.emailText, missingTrend.emailText]),
    html:
      `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#111827;"><div style="max-width:820px;margin:0 auto;">` +
      joinParts([header.emailHtml, extra.emailHtml, sections.emailHtml, companyTrend.emailHtml, locationTrend.emailHtml, missingTrend.emailHtml], "") +
      `</div></body></html>`
  };
}
