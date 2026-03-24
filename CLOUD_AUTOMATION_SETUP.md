# Free Scheduling Setup

Use this when you want the agent to keep running without paying for GitHub-hosted runner minutes.

## Important truth

If GitHub Actions monthly hosted-runner limits are exhausted, GitHub will stop starting those hosted jobs.

That means:

- an external HTTP cron that only dispatches GitHub workflows is not enough
- the fallback must run outside GitHub

## Recommended free architecture

Use two schedulers:

1. GitHub Actions as the primary cloud runner
2. Windows Task Scheduler as the free fallback runner on your own machine

How the fallback works:

- Windows Task Scheduler runs every 10 minutes
- it checks the latest GitHub workflow run through the GitHub API
- if GitHub has run recently, it does nothing
- if GitHub has stopped running, it starts the agent locally

This gives you automatic failover without paying for another scheduler platform.

## Files added for this

- `src/tools/fallbackScheduler.js`
- `scripts/run-agent-fallback.ps1`
- `scripts/install-task-scheduler.ps1`
- `scripts/uninstall-task-scheduler.ps1`

## Modes

### Fallback mode

Best when you still want GitHub Actions first.

- `LOCAL_SCHEDULER_MODE=fallback`
- local scheduler only runs when GitHub has a gap

### Always-local mode

Best when you want zero GitHub dependency for execution.

- `LOCAL_SCHEDULER_MODE=always`
- local scheduler runs every interval directly

### Disabled

- `LOCAL_SCHEDULER_MODE=disabled`

## Required env for fallback mode

Put these in your local `.env`:

```text
LOCAL_SCHEDULER_MODE=fallback
GITHUB_REPO=Sunilkhatate0770/salesforce-job-radar-agent
GITHUB_WORKFLOW_FILE=salesforce-job-radar-agent.yml
GITHUB_TOKEN=YOUR_GITHUB_TOKEN
GITHUB_ACTIONS_MAX_GAP_MINUTES=20
```

GitHub token permissions for a private repo:

- `Actions: Read`
- `Contents: Read`

If you do not want to use a GitHub token, use:

```text
LOCAL_SCHEDULER_MODE=always
```

## Install the free Windows scheduler

Run:

```powershell
npm run scheduler:install:windows
```

Optional custom interval:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-task-scheduler.ps1 -IntervalMinutes 10
```

Remove it with:

```powershell
npm run scheduler:uninstall:windows
```

## Manual test

Run the local fallback scheduler once:

```powershell
npm run scheduler:run:fallback
```

## Free-provider defaults

The workflow and fetch pipeline are now configured to prefer free sources first:

- `naukri_reader`
- `direct`
- `linkedin` direct mode
- `arbeitnow`
- `adzuna`

Paid Apify is no longer in the default GitHub workflow provider list.

## Recommended final setup

If you want no paid scheduler:

1. Keep GitHub Actions enabled as primary
2. Install Windows Task Scheduler fallback
3. Use `LOCAL_SCHEDULER_MODE=fallback`

If you want the simplest zero-GitHub execution path:

1. Install Windows Task Scheduler
2. Set `LOCAL_SCHEDULER_MODE=always`
3. Optionally disable the GitHub workflow schedule

## What this solves

- GitHub-hosted runner monthly minutes exhausted
- GitHub workflow schedule delays
- missed cloud runs
- free automatic failover to your own machine

## Limitation

The free fallback machine must be on and connected to the internet.
