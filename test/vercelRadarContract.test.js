import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHealthPayload,
  buildJobsDegradedPayload,
  getRadarStatusStateKey,
  isPublicApiPath
} from "../src/api/radarContract.js";

test("Vercel health treats Mongo as optional when Turso or Supabase is configured", () => {
  const payload = buildHealthPayload({
    mongoConnected: false,
    runtime: "vercel",
    generatedAt: "2026-05-03T00:00:00.000Z",
    env: {
      GOOGLE_CLIENT_ID: "google-client",
      MONGODB_URI: "mongodb-uri",
      TURSO_URL: "libsql://db",
      TURSO_AUTH_TOKEN: "token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      JOB_RADAR_GITHUB_REPO: "owner/repo",
      JOB_RADAR_GITHUB_TOKEN: "github-token"
    }
  });

  assert.equal(payload.ready, true);
  assert.equal(payload.dependencies.mongo.required, false);
  assert.equal(payload.dependencies.mongo.status, "offline");
  assert.equal(payload.dependencies.turso.status, "configured");
  assert.equal(payload.dependencies.supabase.status, "configured");
  assert.deepEqual(payload.missingCore, []);
});

test("job payload reports degraded scan and fallback AI modes when optional cloud envs are missing", () => {
  const degraded = buildJobsDegradedPayload({
    mongoConnected: false,
    sourceCounts: { turso: 2, mongo: 0 },
    env: {
      GOOGLE_CLIENT_ID: "google-client",
      TURSO_URL: "libsql://db",
      TURSO_AUTH_TOKEN: "token"
    }
  });

  assert.equal(degraded.active, true);
  assert.equal(degraded.scanMode, "cached");
  assert.equal(degraded.aiMode, "deterministic_fallback");
  assert.equal(degraded.statusStore, "local_only");
  assert.deepEqual(degraded.liveSources, ["turso"]);
  assert.match(degraded.reasons.join(","), /github_dispatch_missing/);
});

test("radar status state keys are scoped per signed-in user", () => {
  assert.equal(
    getRadarStatusStateKey("  google-user-123  "),
    "job_radar_statuses:google-user-123"
  );
});

test("Radar API contract keeps job data routes protected", () => {
  assert.equal(isPublicApiPath("/api/health", "GET"), true);
  assert.equal(isPublicApiPath("/api/code-practice/challenges", "GET"), true);
  assert.equal(isPublicApiPath("/api/jobs", "GET"), false);
  assert.equal(isPublicApiPath("/api/jobs/analytics", "GET"), false);
  assert.equal(isPublicApiPath("/api/jobs/scan", "POST"), false);
});
