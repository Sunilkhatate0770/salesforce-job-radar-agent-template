import test from "node:test";
import assert from "node:assert/strict";

import { applyPrecisionFilters } from "../src/jobs/precisionFilters.js";

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

test("applyPrecisionFilters preserves recruiter-signaled post leads missing strict skills", () =>
  withEnv(
    {
      PRECISION_PROFILE: "balanced",
      PRECISION_KEEP_HIGH_SIGNAL_POSTS: "true"
    },
    () => {
      const result = applyPrecisionFilters([
        {
          opportunity_kind: "post",
          source_platform: "linkedin_posts",
          title: "Salesforce Hiring Post",
          company: "Acme",
          location: "Pune, India",
          description:
            "We are hiring Salesforce Developer in Pune. Send your resume to jobs@acme.com.",
          post_author: "Asha Recruiter",
          post_url:
            "https://www.linkedin.com/posts/acme_salesforce-hiring-activity-123/",
          apply_link:
            "https://www.linkedin.com/posts/acme_salesforce-hiring-activity-123/",
          source_evidence: {
            contact_email: "jobs@acme.com"
          }
        }
      ]);

      assert.equal(result.jobs.length, 1);
      assert.equal(result.report.preserved_high_signal_posts, 1);
      assert.equal(result.jobs[0].precision_override, "high_signal_post");
    }
  ));

test("applyPrecisionFilters still removes stale old hiring posts", () =>
  withEnv(
    {
      PRECISION_PROFILE: "balanced",
      PRECISION_KEEP_HIGH_SIGNAL_POSTS: "true",
      PRECISION_MAX_POSTED_HOURS: "168"
    },
    () => {
      const result = applyPrecisionFilters([
        {
          opportunity_kind: "post",
          source_platform: "linkedin_posts",
          title: "Salesforce Hiring Post",
          company: "Acme",
          location: "India",
          description:
            "We are hiring Salesforce Developer. Send your resume to jobs@acme.com.",
          post_author: "Asha Recruiter",
          post_url:
            "https://www.linkedin.com/posts/acme_salesforce-hiring-activity-123/",
          source_evidence: {
            contact_email: "jobs@acme.com"
          },
          posted_at: "2024-01-01T00:00:00.000Z"
        }
      ]);

      assert.equal(result.jobs.length, 0);
      assert.equal(result.report.removed.stale_posted, 1);
    }
  ));
