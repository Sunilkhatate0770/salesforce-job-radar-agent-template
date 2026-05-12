import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClientConfig,
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
  assert.equal(payload.degraded, true);
  assert.equal(payload.dependencies.mongo.required, false);
  assert.equal(payload.dependencies.mongo.status, "offline");
  assert.equal(payload.dependencies.turso.status, "configured");
  assert.equal(payload.dependencies.supabase.status, "configured");
  assert.deepEqual(payload.missingCore, []);
});

test("fully configured cloud health is not degraded only because legacy Mongo is offline", () => {
  const payload = buildHealthPayload({
    mongoConnected: false,
    runtime: "vercel",
    generatedAt: "2026-05-03T10:34:37.060Z",
    env: {
      GOOGLE_CLIENT_ID: "google-client",
      MONGODB_URI: "mongodb-uri",
      OPENAI_API_KEY: "openai-key",
      JOB_RADAR_GITHUB_REPO: "owner/repo",
      JOB_RADAR_GITHUB_TOKEN: "github-token",
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "992998090",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      TURSO_URL: "libsql://db",
      TURSO_AUTH_TOKEN: "token"
    }
  });

  assert.equal(payload.ready, true);
  assert.equal(payload.degraded, false);
  assert.equal(payload.dependencies.mongo.required, false);
  assert.equal(payload.dependencies.mongo.status, "offline");
  assert.deepEqual(payload.missingCore, []);
  assert.deepEqual(payload.missingRecommendedCloud, []);
});

test("job payload ignores legacy Mongo offline when cloud reads and dispatch are configured", () => {
  const degraded = buildJobsDegradedPayload({
    mongoConnected: false,
    sourceCounts: { supabaseAlerts: 8, applicationTracker: 2, turso: 4, mongo: 0 },
    env: {
      GOOGLE_CLIENT_ID: "google-client",
      MONGODB_URI: "mongodb-uri",
      OPENAI_API_KEY: "openai-key",
      JOB_RADAR_GITHUB_REPO: "owner/repo",
      JOB_RADAR_GITHUB_TOKEN: "github-token",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      TURSO_URL: "libsql://db",
      TURSO_AUTH_TOKEN: "token"
    }
  });

  assert.equal(degraded.active, false);
  assert.equal(degraded.scanMode, "github_actions");
  assert.equal(degraded.aiMode, "openai");
  assert.equal(degraded.statusStore, "cloud");
  assert.deepEqual(degraded.reasons, []);
  assert.deepEqual(degraded.liveSources, ["supabaseAlerts", "applicationTracker", "turso"]);
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

test("health reports Telegram notifications missing until chat id is configured", () => {
  const botOnly = buildHealthPayload({
    mongoConnected: false,
    runtime: "vercel",
    generatedAt: "2026-05-03T00:00:00.000Z",
    env: {
      GOOGLE_CLIENT_ID: "google-client",
      TURSO_URL: "libsql://db",
      TURSO_AUTH_TOKEN: "token",
      TELEGRAM_BOT_TOKEN: "bot-token"
    }
  });

  assert.equal(botOnly.env.TELEGRAM_BOT_TOKEN, true);
  assert.equal(botOnly.env.TELEGRAM_CHAT_ID, false);
  assert.equal(botOnly.dependencies.notifications.configured, false);
  assert.match(botOnly.missingRecommendedCloud.join(","), /TELEGRAM_BOT_TOKEN\/TELEGRAM_CHAT_ID/);

  const withChat = buildHealthPayload({
    mongoConnected: false,
    runtime: "vercel",
    generatedAt: "2026-05-03T00:00:00.000Z",
    env: {
      GOOGLE_CLIENT_ID: "google-client",
      TURSO_URL: "libsql://db",
      TURSO_AUTH_TOKEN: "token",
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "992998090"
    }
  });

  assert.equal(withChat.env.TELEGRAM_CHAT_ID, true);
  assert.equal(withChat.dependencies.notifications.configured, true);
});

test("client config exposes only public browser configuration", () => {
  const config = buildClientConfig({
    GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    OPENAI_API_KEY: "secret-openai-key",
    TELEGRAM_BOT_TOKEN: "secret-telegram-token"
  });

  assert.equal(config.success, true);
  assert.equal(config.authConfigured, true);
  assert.equal(config.googleClientId, "google-client-id.apps.googleusercontent.com");
  assert.equal(Object.hasOwn(config, "OPENAI_API_KEY"), false);
  assert.equal(Object.hasOwn(config, "TELEGRAM_BOT_TOKEN"), false);
});

test("radar status state keys are scoped per signed-in user", () => {
  assert.equal(
    getRadarStatusStateKey("  google-user-123  "),
    "job_radar_statuses:google-user-123"
  );
});

test("Radar API contract keeps job data routes protected", () => {
  assert.equal(isPublicApiPath("/api/health", "GET"), true);
  assert.equal(isPublicApiPath("/api/client-config", "GET"), true);
  assert.equal(isPublicApiPath("/api/code-practice/challenges", "GET"), true);
  assert.equal(isPublicApiPath("/api/jobs", "GET"), false);
  assert.equal(isPublicApiPath("/api/jobs/analytics", "GET"), false);
  assert.equal(isPublicApiPath("/api/jobs/scan", "POST"), false);
});
