import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { getRunLeaseHeartbeat } from "../db/runLease.js";
import {
  decideSchedulerRun,
  decideSharedLeaseFallback
} from "../utils/failover.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const CACHE_DIR = path.resolve(REPO_ROOT, ".cache");
const LOCK_DIR = path.resolve(CACHE_DIR, "local-fallback.lock");
const LOG_PATH = path.resolve(CACHE_DIR, "local-fallback.log");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function trimText(value, maxLength = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function appendLog(message) {
  await ensureCacheDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(LOG_PATH, line, "utf8");
}

async function recordStatus(message) {
  console.log(message);
  await appendLog(message);
}

async function acquireLock() {
  try {
    await fs.mkdir(LOCK_DIR);
  } catch (error) {
    if (error.code === "EEXIST") {
      return null;
    }
    throw error;
  }

  return async () => {
    try {
      await fs.rmdir(LOCK_DIR);
    } catch {
      // ignore cleanup errors
    }
  };
}

function getGitHubRepo() {
  return normalize(
    process.env.GITHUB_REPO || process.env.GITHUB_FALLBACK_REPO,
    "Sunilkhatate0770/salesforce-job-radar-agent"
  );
}

function getGitHubWorkflow() {
  return normalize(
    process.env.GITHUB_WORKFLOW_FILE || process.env.GITHUB_FALLBACK_WORKFLOW,
    "salesforce-job-radar-agent.yml"
  );
}

function getGitHubToken() {
  return normalize(
    process.env.GITHUB_TOKEN ||
      process.env.GITHUB_PAT ||
      process.env.GITHUB_FALLBACK_TOKEN
  );
}

function getMaxGapMinutes() {
  return Math.max(
    5,
    toFiniteNumber(process.env.GITHUB_ACTIONS_MAX_GAP_MINUTES, 20)
  );
}

function getSchedulerMode() {
  return normalize(
    process.env.SCHEDULER_MODE ||
      process.env.CLOUD_SCHEDULER_MODE ||
      process.env.LOCAL_SCHEDULER_MODE,
    "fallback"
  )
    .toLowerCase();
}

function getFallbackDelayMs() {
  return Math.max(
    0,
    toFiniteNumber(process.env.FALLBACK_START_DELAY_SECONDS, 0)
  ) * 1000;
}

function getCurrentSource() {
  return normalize(process.env.AGENT_RUN_SOURCE, "fallback-runner");
}

async function getLatestWorkflowRun() {
  const repo = getGitHubRepo();
  const workflow = getGitHubWorkflow();
  const token = getGitHubToken();

  if (!repo || !workflow || !token) {
    return {
      ok: false,
      reason: "GitHub workflow check not configured"
    };
  }

  const url =
    `https://api.github.com/repos/${encodeURIComponent(repo).replace("%2F", "/")}` +
    `/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=1`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      reason: `GitHub API ${response.status}: ${trimText(body)}`
    };
  }

  const json = await response.json();
  const latestRun = Array.isArray(json?.workflow_runs)
    ? json.workflow_runs[0]
    : null;

  if (!latestRun) {
    return {
      ok: false,
      reason: "No GitHub workflow runs found"
    };
  }

  return {
    ok: true,
    run: latestRun
  };
}

async function decideRunMode() {
  const mode = getSchedulerMode();
  if (mode === "disabled" || mode === "always") {
    return decideSchedulerRun({ mode });
  }

  const latest = await getLatestWorkflowRun();
  if (!latest.ok) {
    return {
      shouldRun: true,
      reason: latest.reason
    };
  }

  const githubDecision = decideSchedulerRun({
    mode,
    latestRun: latest.run,
    now: Date.now(),
    maxGapMinutes: getMaxGapMinutes()
  });

  if (!githubDecision.shouldRun) {
    return githubDecision;
  }

  const heartbeat = await getRunLeaseHeartbeat();
  const leaseDecision = decideSharedLeaseFallback({
    latestLease: heartbeat,
    currentSource: getCurrentSource(),
    now: Date.now(),
    maxGapMinutes: getMaxGapMinutes()
  });

  if (!leaseDecision.shouldRun) {
    return {
      shouldRun: false,
      reason: `${githubDecision.reason}; ${leaseDecision.reason}`
    };
  }

  return {
    shouldRun: true,
    reason: `${githubDecision.reason}; ${leaseDecision.reason}`
  };
}

async function runAgent() {
  await recordStatus("Starting fallback scheduler run");

  const child = spawn(process.execPath, ["src/run.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      AGENT_RUN_SOURCE: process.env.AGENT_RUN_SOURCE || "local-fallback",
      NOTIFY_EVERY_RUN: process.env.NOTIFY_EVERY_RUN || "true"
    },
    stdio: "inherit"
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", async code => {
      await recordStatus(`Fallback scheduler run finished with exit code ${code}`);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`local fallback run failed with exit code ${code}`));
    });
  });
}

async function main() {
  const decision = await decideRunMode();
  await recordStatus(`Scheduler decision: ${decision.reason}`);

  if (!decision.shouldRun) {
    await recordStatus("Fallback scheduler skipped this cycle");
    return;
  }

  const releaseLock = await acquireLock();
  if (!releaseLock) {
    await recordStatus("Skip: previous fallback run is still active");
    return;
  }

  try {
    const delayMs = getFallbackDelayMs();
    if (delayMs > 0) {
      await recordStatus(
        `Waiting ${Math.round(delayMs / 1000)} second(s) before fallback attempt`
      );
      await sleep(delayMs);
    }
    await runAgent();
  } finally {
    await releaseLock();
  }
}

main().catch(async error => {
  try {
    await appendLog(`fallback scheduler crashed: ${trimText(error.message || error)}`);
  } finally {
    console.error("❌ Fallback scheduler failed:", error.message);
    process.exitCode = 1;
  }
});
