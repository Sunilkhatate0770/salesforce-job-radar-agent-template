import test from "node:test";
import assert from "node:assert/strict";

import { sharedRuntimeDefaults } from "../cloud/shared/runtimeConfig.js";

test("shared runtime defaults favor broader LinkedIn recall with controlled fallback", () => {
  assert.equal(sharedRuntimeDefaults.PRECISION_PROFILE, "wide");
  assert.equal(sharedRuntimeDefaults.SALESFORCE_ROLE_MODE, "relaxed");
  assert.equal(sharedRuntimeDefaults.LINKEDIN_FETCH_PROVIDERS, "direct,apify");
  assert.equal(sharedRuntimeDefaults.LINKEDIN_PAID_FALLBACK_ONLY, "true");
  assert.equal(sharedRuntimeDefaults.LINKEDIN_PLANS_PER_RUN, "3");
  assert.equal(sharedRuntimeDefaults.LINKEDIN_DIRECT_MAX_PAGES, "3");
  assert.equal(sharedRuntimeDefaults.LINKEDIN_DIRECT_KEYWORDS_PER_PLAN, "3");
});
