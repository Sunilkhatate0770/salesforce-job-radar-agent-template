import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTION_CARD_RENDERER_VERSION,
  buildActionCardDailySummaryMessages,
  buildActionCardHeartbeatMessages,
  buildActionCardJobAlertMessages,
  buildActionCardResumePackMessages
} from "../src/notify/actionCards.js";

const listingJob = {
  title: "Salesforce Developer",
  company: "Acme",
  location: "Bengaluru, India",
  source_platform: "greenhouse",
  opportunity_kind: "listing",
  confidence_tier: "high",
  match_score: 92,
  canonical_apply_url: "https://boards.greenhouse.io/acme/jobs/123",
  posted_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  source_evidence: {
    snippet: "Public ATS listing for a Salesforce Developer role."
  },
  resume_support: {
    mode: "full_pack_ready",
    preview: {
      atsSummary: "92% High | Priority High",
      atsKeywordCoverage: "75% keyword coverage",
      matchedKeywords: ["Apex", "LWC", "Sales Cloud"],
      whyMatched: ["Matched skills: Apex, LWC."],
      missingKeywords: ["CPQ"],
      generatedArtifacts: ["Tailored resume PDF", "Apply-pack PDF", "ZIP bundle"],
      headline: "Salesforce Developer | ATS 92%"
    }
  }
};

const postJob = {
  title: "Salesforce Hiring Post",
  company: "Beta",
  location: "India Remote",
  source_platform: "linkedin_posts",
  opportunity_kind: "post",
  confidence_tier: "medium",
  match_score: 74,
  post_url: "https://www.linkedin.com/posts/beta_salesforce-hiring-123",
  posted_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  source_evidence: {
    snippet: "We are hiring a Salesforce Developer. Share your resume."
  },
  resume_support: {
    mode: "preview_only",
    preview: {
      atsSummary: "74% Medium | Priority Medium",
      atsKeywordCoverage: "50% keyword coverage",
      whyMatched: ["Role/title fit is strong."],
      missingKeywords: ["Experience Cloud"]
    }
  }
};

test("action-card job alerts render split sections and top tailored packs", () => {
  const payload = buildActionCardJobAlertMessages({
    agentName: "Salesforce Job Radar Agent",
    jobs: [listingJob, { ...postJob, confidence_tier: "high" }],
    reviewPostJobs: [postJob],
    topPackJobs: [listingJob],
    sourceSummary: "Greenhouse: 1 | LinkedIn Posts: 1",
    extraSections: {
      telegram: "Provider health is stable.",
      emailText: "Provider health is stable.",
      emailHtml: "<p>Provider health is stable.</p>"
    }
  });

  assert.match(payload.subject, /opportunities/i);
  assert.match(payload.telegram, /High-confidence job listings/i);
  assert.match(payload.telegram, /High-confidence hiring posts/i);
  assert.match(payload.telegram, /Top tailored apply packs/i);
  assert.match(payload.telegram, /JD matched/i);
  assert.match(payload.telegram, /Tailored resume PDF/i);
  assert.match(payload.html, /Greenhouse/i);
  assert.match(payload.html, /keyword coverage/i);
  assert.match(payload.text, /Provider health is stable/i);
});

test("action-card heartbeat and daily summary keep shared renderer version compatible", () => {
  const heartbeat = buildActionCardHeartbeatMessages({
    agentName: "Salesforce Job Radar Agent",
    timeLabel: "2026-03-31 14:00 Asia/Kolkata",
    fetchedCount: 24,
    salesforceCount: 5,
    newCount: 2,
    pendingCount: 1,
    sourceSummary: "Greenhouse: 2 | LinkedIn: 3",
    note: "Run healthy."
  });
  const daily = buildActionCardDailySummaryMessages({
    agentName: "Salesforce Job Radar Agent",
    dateKey: "2026-03-31",
    fetchedCount: 40,
    salesforceCount: 8,
    newCount: 3,
    pendingCount: 1,
    sourceSummary: "Greenhouse: 2 | LinkedIn: 4",
    classificationSummary: {
      by_kind: { listing: 7, post: 1 },
      by_confidence: { high: 4, medium: 2, low: 2 }
    },
    newJobs: [listingJob],
    trendSections: {
      companiesText: "Acme (2)",
      companiesHtml: "<ul><li>Acme (2)</li></ul>"
    }
  });

  assert.equal(ACTION_CARD_RENDERER_VERSION, "action_cards_v2");
  assert.match(heartbeat.subject, /heartbeat/i);
  assert.match(heartbeat.telegram, /Run healthy/i);
  assert.match(daily.subject, /daily summary/i);
  assert.match(daily.html, /Top Companies/i);
  assert.match(daily.html, /Acme/);
});

test("action-card resume pack follow-up renders tailored pack section", () => {
  const payload = buildActionCardResumePackMessages({
    agentName: "Salesforce Job Radar Agent",
    jobs: [listingJob],
    sourceSummary: "Greenhouse"
  });

  assert.match(payload.subject, /tailored resume pack ready/i);
  assert.match(payload.telegram, /Tailored resume pack ready/i);
  assert.match(payload.telegram, /JD matched/i);
  assert.match(payload.text, /Pack: Tailored resume PDF/i);
  assert.match(payload.html, /JD-matched PDF resume/i);
});
