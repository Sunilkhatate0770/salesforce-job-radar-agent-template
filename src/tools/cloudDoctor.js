import "dotenv/config";

function mask(value) {
  const raw = String(value || "").trim();
  if (!raw) return "missing";
  if (raw.length <= 8) return "***";
  return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}

function normalize(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function hasAll(keys) {
  return keys.every(key => normalize(process.env[key]));
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function getSchedulerMode() {
  return normalize(
    process.env.SCHEDULER_MODE ||
      process.env.CLOUD_SCHEDULER_MODE ||
      process.env.LOCAL_SCHEDULER_MODE,
    "fallback"
  ).toLowerCase();
}

function requiresGitHubFreshnessCheck() {
  return getSchedulerMode() === "fallback";
}

function usesSupabaseStateBackend() {
  const explicit = normalize(
    process.env.STATE_BACKEND ||
      process.env.AGENT_STATE_BACKEND,
    ""
  ).toLowerCase();

  if (explicit === "supabase") return true;
  if (explicit === "local") return false;

  return (
    normalize(process.env.AGENT_RUNTIME_TARGET, "").toLowerCase() === "supabase_edge" ||
    isTruthy(process.env.SUPABASE_CLOUD_MODE)
  );
}

async function checkSupabaseTable(tableName, label) {
  const url = normalize(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = normalize(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY
  );

  if (!url || !key) {
    return {
      ok: false,
      label,
      message: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY is missing"
    };
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/${encodeURIComponent(tableName)}?select=*&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        }
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        label,
        message: `HTTP ${response.status}: ${body.slice(0, 160)}`
      };
    }

    return {
      ok: true,
      label,
      message: `${tableName} table is reachable`
    };
  } catch (error) {
    return {
      ok: false,
      label,
      message: error.message
    };
  }
}

async function checkSupabaseLeaseTable() {
  return checkSupabaseTable("agent_run_leases", "Lease Table");
}

async function checkSupabaseStateTable() {
  if (!usesSupabaseStateBackend()) {
    return {
      ok: true,
      label: "State Table",
      message: "Supabase state backend not required in this runtime"
    };
  }

  return checkSupabaseTable("agent_state", "State Table");
}

async function checkSupabaseRunHistoryTable() {
  return checkSupabaseTable("agent_run_history", "Run History");
}

async function checkGitHubWorkflowAccess() {
  if (!requiresGitHubFreshnessCheck()) {
    return {
      ok: true,
      label: "GitHub API",
      message: `GitHub freshness check not required in ${getSchedulerMode()} mode`
    };
  }

  const repo = normalize(process.env.GITHUB_REPO);
  const workflow = normalize(process.env.GITHUB_WORKFLOW_FILE);
  const token = normalize(
    process.env.GITHUB_TOKEN ||
      process.env.GITHUB_PAT ||
      process.env.GITHUB_FALLBACK_TOKEN
  );

  if (!repo || !workflow || !token) {
    return {
      ok: false,
      label: "GitHub API",
      message: "GITHUB_REPO, GITHUB_WORKFLOW_FILE, or GITHUB_TOKEN is missing"
    };
  }

  try {
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
        label: "GitHub API",
        message: `HTTP ${response.status}: ${body.slice(0, 160)}`
      };
    }

    const json = await response.json();
    const count = Array.isArray(json?.workflow_runs)
      ? json.workflow_runs.length
      : 0;

    return {
      ok: true,
      label: "GitHub API",
      message: `Workflow run API reachable for ${repo} using token ${mask(token)} (latest page count ${count})`
    };
  } catch (error) {
    return {
      ok: false,
      label: "GitHub API",
      message: error.message
    };
  }
}

function checkSharedLeaseEnv() {
  const ok = hasAll([
    "RUN_LEASE_ENABLED",
    "RUN_LEASE_REQUIRED",
    "RUN_LEASE_KEY",
    "RUN_LEASE_DURATION_MINUTES"
  ]) && isTruthy(process.env.RUN_LEASE_ENABLED) && isTruthy(process.env.RUN_LEASE_REQUIRED);

  return {
    ok,
    label: "Lease Env",
    message: ok
      ? `Lease enabled with key ${normalize(process.env.RUN_LEASE_KEY)}`
      : "Set RUN_LEASE_ENABLED=true, RUN_LEASE_REQUIRED=true, RUN_LEASE_KEY, RUN_LEASE_DURATION_MINUTES"
  };
}

function checkBackupEnv() {
  if (!requiresGitHubFreshnessCheck()) {
    return {
      ok: true,
      label: "Backup Env",
      message: `GitHub fallback configuration not required in ${getSchedulerMode()} mode`
    };
  }

  const ok = hasAll([
    "GITHUB_REPO",
    "GITHUB_WORKFLOW_FILE",
    "GITHUB_ACTIONS_MAX_GAP_MINUTES"
  ]);

  return {
    ok,
    label: "Backup Env",
    message: ok
      ? `Fallback scheduler configured for ${normalize(process.env.GITHUB_REPO)}`
      : "Set GITHUB_REPO, GITHUB_WORKFLOW_FILE, and GITHUB_ACTIONS_MAX_GAP_MINUTES"
  };
}

async function run() {
  console.log("🩺 Salesforce Job Radar cloud doctor started");

  const checks = await Promise.all([
    Promise.resolve(checkSharedLeaseEnv()),
    Promise.resolve(checkBackupEnv()),
    checkSupabaseLeaseTable(),
    checkSupabaseStateTable(),
    checkSupabaseRunHistoryTable(),
    checkGitHubWorkflowAccess()
  ]);

  let failed = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`✅ ${check.label}: ${check.message}`);
    } else {
      failed += 1;
      console.log(`❌ ${check.label}: ${check.message}`);
    }
  }

  if (failed > 0) {
    console.log(`\n❌ Cloud doctor failed: ${failed} check(s) need attention`);
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Cloud doctor passed: cloud failover prerequisites look good");
}

run().catch(error => {
  console.log("❌ Cloud doctor crashed:", error.message);
  process.exitCode = 1;
});
