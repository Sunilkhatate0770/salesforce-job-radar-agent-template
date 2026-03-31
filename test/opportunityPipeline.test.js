import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpportunitySummary,
  prepareOpportunities,
  selectOpportunitiesForAlerts,
  splitOpportunitiesForAlerts
} from "../src/jobs/opportunityPipeline.js";
import {
  annotateJobsWithResumeSupport,
  selectTopResumePackJobs
} from "../src/resume/generateTailoredResume.js";
import {
  buildCoverageAlertMessages,
  monitorCoverageHealth
} from "../src/jobs/coverageMonitor.js";

function withEnv(overrides, fn) {
  const original = {};
  const restore = () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  const result = fn();
  if (result && typeof result.then === "function") {
    return Promise.resolve(result).finally(restore);
  }

  restore();
  return result;
}

test("prepareOpportunities merges listing and hiring post while keeping India/remote scope", () =>
  withEnv({ OPPORTUNITY_GEO_SCOPE: "india_remote" }, () => {
    const listing = {
      title: "Salesforce Developer",
      company: "Acme",
      location: "Bengaluru, India",
      apply_link: "https://jobs.acme.com/salesforce-developer?utm=tracker",
      source_job_id: "linkedin:123"
    };
    const post = {
      title: "We are hiring Salesforce Developer at Acme",
      company: "Acme",
      location: "Bengaluru",
      post_url: "https://www.linkedin.com/posts/acme_hiring-salesforce-developer-123/",
      apply_link: "https://www.linkedin.com/posts/acme_hiring-salesforce-developer-123/",
      source_job_id: "linkedin_post:abc123",
      source_platform: "linkedin_posts",
      description: "We are hiring a Salesforce Developer in Bengaluru. Apply now."
    };
    const outOfScope = {
      title: "Salesforce Developer",
      company: "Other",
      location: "London, UK",
      apply_link: "https://example.com/london-role"
    };

    const prepared = prepareOpportunities([listing, post, outOfScope]);

    assert.equal(prepared.jobs.length, 1);
    assert.equal(prepared.jobs[0].opportunity_kind, "listing");
    assert.equal(prepared.jobs[0].canonical_company, "acme");
    assert.match(prepared.jobs[0].canonical_apply_url, /jobs\.acme\.com\/salesforce-developer$/);
    assert.ok(prepared.jobs[0].related_post_urls.includes(post.post_url));
    assert.ok(prepared.jobs[0].related_sources.includes("linkedin_posts"));
    assert.equal(prepared.summary.raw_count, 3);
    assert.equal(prepared.summary.merged_count, 1);
    assert.equal(prepared.summary.merged_duplicate_count, 1);
  }));

test("splitOpportunitiesForAlerts separates high listings, high posts, medium review, and low suppress", () => {
  const jobs = [
    {
      title: "Salesforce Developer",
      company: "Acme",
      location: "Pune, India",
      apply_link: "https://jobs.acme.com/sfdc-dev",
      source_job_id: "linkedin:100"
    },
    {
      title: "Salesforce Hiring Post",
      company: "Acme",
      location: "Remote",
      apply_link: "https://www.linkedin.com/posts/acme_hiring-post",
      post_url: "https://www.linkedin.com/posts/acme_hiring-post",
      source_job_id: "linkedin_post:100",
      source_platform: "linkedin_posts",
      description: "We are hiring Salesforce Developer remote apply now."
    },
    {
      title: "Salesforce Consultant",
      company: "Beta",
      location: "India",
      description: "Hiring Salesforce Consultant. Share profile for India role."
    },
    {
      title: "Salesforce community update",
      company: "",
      location: "India",
      description: "Proud of the team and our Salesforce work."
    }
  ];

  const prepared = prepareOpportunities(jobs);
  const split = splitOpportunitiesForAlerts(prepared.jobs);

  assert.equal(split.highListings.length, 1);
  assert.equal(split.highPosts.length, 1);
  assert.equal(split.mediumQueue.length, 1);
  assert.equal(split.suppressedLow.length, 1);
});

test("selectTopResumePackJobs keeps only listing opportunities within the configured limit", () =>
  withEnv({ RESUME_TOP_OPPORTUNITY_LIMIT: "2" }, () => {
    const selected = selectTopResumePackJobs([
      { title: "Top listing", company: "A", match_score: 92, opportunity_kind: "listing" },
      { title: "Top post", company: "A", match_score: 99, opportunity_kind: "post" },
      { title: "Second listing", company: "B", match_score: 88, opportunity_kind: "listing" },
      { title: "Third listing", company: "C", match_score: 81, opportunity_kind: "listing" }
    ]);

    assert.equal(selected.length, 2);
    assert.deepEqual(selected.map(job => job.title), ["Top listing", "Second listing"]);
  }));

test("annotateJobsWithResumeSupport marks listing packs and post previews separately", async () =>
  withEnv({ RESUME_TOP_OPPORTUNITY_LIMIT: "3" }, async () => {
    const listing = {
      job_hash: "listing-1",
      title: "Salesforce Developer",
      company: "Acme",
      match_score: 93,
      opportunity_kind: "listing",
      resume_actions: ["Add Apex metrics"],
      resume_bullet_suggestions: ["Built Apex and LWC flows"],
      missing_skills: ["CPQ"]
    };
    const post = {
      job_hash: "post-1",
      title: "Salesforce Hiring Post",
      company: "Beta",
      match_score: 87,
      opportunity_kind: "post",
      resume_actions: ["Add recruiter-ready summary"],
      resume_bullet_suggestions: ["Mention remote delivery wins"],
      missing_skills: ["Experience Cloud"]
    };

    const annotated = await annotateJobsWithResumeSupport([listing, post], {
      fullPackJobs: [listing],
      attachmentsEnabled: true
    });

    const listingAnnotated = annotated.find(job => job.job_hash === "listing-1");
    const postAnnotated = annotated.find(job => job.job_hash === "post-1");

    assert.equal(listingAnnotated.resume_support.mode, "full_pack_attached");
    assert.equal(postAnnotated.resume_support.mode, "preview_only");
    assert.ok(Array.isArray(listingAnnotated.resume_support.preview.atsKeywords));
    assert.match(postAnnotated.resume_support.preview.draftSubject, /Application for/i);
  }));

test("buildOpportunitySummary reports kind and confidence counts", () => {
  const summary = buildOpportunitySummary([
    { opportunity_kind: "listing", confidence_tier: "high", source_platform: "linkedin" },
    { opportunity_kind: "post", confidence_tier: "high", source_platform: "linkedin_posts" },
    { opportunity_kind: "listing", confidence_tier: "medium", source_platform: "naukri" }
  ], { rawCount: 5, mergedDuplicateCount: 2 });

  assert.equal(summary.raw_count, 5);
  assert.equal(summary.merged_duplicate_count, 2);
  assert.equal(summary.by_kind.listing, 2);
  assert.equal(summary.by_kind.post, 1);
  assert.equal(summary.by_confidence.high, 2);
  assert.equal(summary.by_confidence.medium, 1);
});

test("selectOpportunitiesForAlerts respects post alert policy", { concurrency: false }, () =>
  withEnv(
    {
      POST_ALERT_POLICY: "high_only",
      ALERT_MEDIUM_DIGEST_MAX_ITEMS: "5"
    },
    () => {
      const prepared = prepareOpportunities([
        {
          title: "Salesforce Developer",
          company: "Acme",
          location: "Remote",
          apply_link: "https://jobs.acme.com/salesforce-dev"
        },
        {
          title: "Salesforce Hiring Post",
          company: "Acme",
          location: "India",
          post_url: "https://www.linkedin.com/posts/acme_hiring-post",
          apply_link: "https://www.linkedin.com/posts/acme_hiring-post",
          source_platform: "linkedin_posts",
          description: "We are hiring Salesforce Developer in India. Apply now."
        },
        {
          title: "Salesforce Consultant",
          company: "Beta",
          location: "India",
          description: "Hiring Salesforce Consultant for India role."
        },
        {
          title: "Salesforce Hiring Post",
          company: "Beta",
          location: "India",
          post_url: "https://www.linkedin.com/posts/beta_hiring-post",
          apply_link: "https://www.linkedin.com/posts/beta_hiring-post",
          source_platform: "linkedin_posts",
          description: "Hiring Salesforce Consultant remote. Share profile."
        }
      ]);

      const selection = selectOpportunitiesForAlerts(prepared.jobs, {
        maxItems: 10,
        mediumLimit: 5
      });

      assert.equal(selection.postPolicy, "high_only");
      assert.ok(selection.selectedHigh.length >= 2);
      assert.equal(
        selection.selectedMedium.every(job => job.opportunity_kind !== "post"),
        true
      );
    }
  ));

test("monitorCoverageHealth emits coverage alerts for repeated zero-post runs", { concurrency: false }, async () =>
  withEnv(
    {
      STATE_BACKEND: "local",
      STATE_BACKEND_REQUIRED: "false",
      COVERAGE_POST_ZERO_RUN_THRESHOLD: "1",
      COVERAGE_PROVIDER_PAUSE_RUN_THRESHOLD: "99",
      COVERAGE_ZERO_RESULT_RUN_THRESHOLD: "99",
      COVERAGE_BASELINE_MIN_TOTAL: "999"
    },
    async () => {
      const providerCoverage = {
        listing_count: 5,
        post_count: 0,
        medium_count: 1,
        paused_providers: [],
        zero_result_providers: ["linkedin_posts"],
        opportunity_summary: {
          merged_count: 5,
          by_kind: { listing: 5, post: 0 },
          by_confidence: { high: 4, medium: 1, low: 0 },
          by_source: { linkedin: 3, linkedin_posts: 0 }
        }
      };

      const coverage = await monitorCoverageHealth(providerCoverage, {
        runSource: "test-runner"
      });

      assert.ok(
        coverage.alerts.some(alert => alert.signature === "post-coverage-zero")
      );

      const messages = buildCoverageAlertMessages({
        agentName: "Agent",
        runSource: "test-runner",
        providerCoverage,
        alerts: coverage.alerts
      });

      assert.match(messages.emailSubject, /coverage alert/i);
      assert.match(messages.emailText, /Hiring-post coverage dropped to zero/i);
    }
  ));
