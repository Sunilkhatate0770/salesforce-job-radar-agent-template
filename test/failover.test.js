import test from "node:test";
import assert from "node:assert/strict";
import {
  decideSchedulerRun,
  decideSharedLeaseFallback
} from "../src/utils/failover.js";

const NOW = Date.parse("2026-03-20T12:00:00.000Z");

test("disabled mode always skips", () => {
  const result = decideSchedulerRun({
    mode: "disabled",
    now: NOW
  });

  assert.equal(result.shouldRun, false);
  assert.match(result.reason, /disabled/i);
});

test("always mode always runs", () => {
  const result = decideSchedulerRun({
    mode: "always",
    now: NOW
  });

  assert.equal(result.shouldRun, true);
  assert.match(result.reason, /always/i);
});

test("fallback mode skips when GitHub is fresh", () => {
  const result = decideSchedulerRun({
    mode: "fallback",
    now: NOW,
    maxGapMinutes: 20,
    latestRun: {
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-03-20T11:50:00.000Z"
    }
  });

  assert.equal(result.shouldRun, false);
  assert.match(result.reason, /seen 10 minute/i);
});

test("fallback mode runs when GitHub is stale", () => {
  const result = decideSchedulerRun({
    mode: "fallback",
    now: NOW,
    maxGapMinutes: 20,
    latestRun: {
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-03-20T11:20:00.000Z"
    }
  });

  assert.equal(result.shouldRun, true);
  assert.match(result.reason, /exceeds 20 minute/i);
});

test("fallback mode runs when latest timestamp is missing", () => {
  const result = decideSchedulerRun({
    mode: "fallback",
    now: NOW,
    maxGapMinutes: 20,
    latestRun: {
      status: "queued",
      conclusion: null
    }
  });

  assert.equal(result.shouldRun, true);
  assert.match(result.reason, /timestamp is missing/i);
});

test("fallback mode runs when no GitHub run exists", () => {
  const result = decideSchedulerRun({
    mode: "fallback",
    now: NOW,
    maxGapMinutes: 20,
    latestRun: null
  });

  assert.equal(result.shouldRun, true);
  assert.match(result.reason, /no github workflow runs found/i);
});

test("shared lease fallback skips when another source ran recently", () => {
  const result = decideSharedLeaseFallback({
    currentSource: "oci-backup-2",
    now: NOW,
    maxGapMinutes: 20,
    latestLease: {
      source: "cloudrun-backup-1",
      updated_at: "2026-03-20T11:55:00.000Z"
    }
  });

  assert.equal(result.shouldRun, false);
  assert.match(result.reason, /shared lease heartbeat seen 5 minute/i);
});

test("shared lease fallback allows run when heartbeat belongs to current source", () => {
  const result = decideSharedLeaseFallback({
    currentSource: "cloudrun-backup-1",
    now: NOW,
    maxGapMinutes: 20,
    latestLease: {
      source: "cloudrun-backup-1",
      updated_at: "2026-03-20T11:55:00.000Z"
    }
  });

  assert.equal(result.shouldRun, true);
  assert.match(result.reason, /current source/i);
});

test("shared lease fallback runs when another source is stale", () => {
  const result = decideSharedLeaseFallback({
    currentSource: "oci-backup-2",
    now: NOW,
    maxGapMinutes: 20,
    latestLease: {
      source: "cloudrun-backup-1",
      updated_at: "2026-03-20T11:20:00.000Z"
    }
  });

  assert.equal(result.shouldRun, true);
  assert.match(result.reason, /gap 40.0 minute/i);
});
