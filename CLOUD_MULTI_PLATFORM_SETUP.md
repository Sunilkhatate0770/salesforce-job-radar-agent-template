# Cloud-Only Multi-Platform Setup

Use this when you want the agent to run in the cloud only, with automatic fallback across multiple platforms.

## Goal

Run the same agent on multiple cloud platforms with this order:

1. GitHub Actions as primary
2. Cloud Run as first backup
3. Third cloud runner as second backup

If GitHub-hosted runner minutes are exhausted, the GitHub schedule will stop running, but the backup clouds still keep their own schedules and take over automatically.

## Architecture

Every platform keeps its own schedule.

Example:

- GitHub Actions schedule every 10 minutes
- Cloud Run Job schedule every 10 minutes
- Oracle Cloud VM cron every 10 minutes

All of them point to the same codebase, but only one run is allowed to proceed because the app now supports a shared Supabase lease.

## Why this works

- GitHub does not control the other clouds
- each cloud has an independent scheduler
- the agent acquires a shared run lease before doing work
- backup clouds also check the latest shared lease heartbeat before running
- lower-priority backups wait before trying, so primary platforms get first chance

## Repo support added

- Shared run lease: `src/db/runLease.js`
- Shared lease SQL: `sql/agent_run_leases.sql`
- Shared cloud runtime defaults: `cloud/shared/runtimeConfig.js`
- Cloud env sync helper: `scripts/render-cloud-env.js`
- Portable fallback entrypoint: `src/tools/fallbackScheduler.js`
- Docker image: `Dockerfile`
- Cloud Run backup templates:
  - `cloud/cloudrun/deploy-backup1.sh`
  - `cloud/cloudrun/create-scheduler-backup1.sh`
  - `cloud/cloudrun/attach-secrets-backup1.sh`
  - `cloud/cloudrun/env.backup1.yaml.example`
- OCI backup templates:
  - `cloud/oci/bootstrap-backup2.sh`
  - `cloud/oci/install-backup2-cron.sh`
  - `cloud/oci/run-backup2.sh`
  - `cloud/oci/backup2.env.example`

## Required setup

### 1. Create the lease table

Run:

```sql
\i sql/agent_run_leases.sql
```

or paste the SQL from `sql/agent_run_leases.sql` into Supabase SQL Editor.

### 2. Enable the shared lease

Add these env vars on every cloud platform:

```text
RUN_LEASE_ENABLED=true
RUN_LEASE_REQUIRED=true
RUN_LEASE_KEY=salesforce-job-radar-agent
RUN_LEASE_DURATION_MINUTES=25
```

### 3. Sync the same runtime defaults everywhere

The repo now keeps non-secret cloud defaults in one place:

- GitHub Actions loads them automatically from `cloud/shared/runtimeConfig.js`
- Cloud Run and OCI example env files are generated from the same source

Regenerate the backup env examples any time you change cloud defaults:

```bash
npm run cloud:sync
```

### 4. Give every platform a source label

Examples:

```text
AGENT_RUN_SOURCE=github-actions
AGENT_RUN_SOURCE=cloudrun-backup
AGENT_RUN_SOURCE=oci-backup
```

### 5. Set backup ordering

Use delay so the first backup gets first chance and the second backup waits.

Example:

GitHub primary:

```text
FALLBACK_START_DELAY_SECONDS=0
```

Cloud Run first backup:

```text
SCHEDULER_MODE=fallback
FALLBACK_START_DELAY_SECONDS=0
GITHUB_ACTIONS_MAX_GAP_MINUTES=20
```

Third cloud backup:

```text
SCHEDULER_MODE=fallback
FALLBACK_START_DELAY_SECONDS=90
GITHUB_ACTIONS_MAX_GAP_MINUTES=20
```

The third cloud waits 90 seconds. If Cloud Run already took the shared lease, the third cloud skips.

## Platform commands

### GitHub Actions primary

Use the normal workflow schedule.

Run command:

```text
node src/run.js
```

### Cloud Run backup

Use:

- `cloud/cloudrun/env.backup1.yaml.example`
- `cloud/cloudrun/deploy-backup1.sh`
- `cloud/cloudrun/create-scheduler-backup1.sh`
- `cloud/cloudrun/attach-secrets-backup1.sh`

Generate the example env file from shared defaults:

```bash
npm run cloud:sync
```

Run command:

```text
node src/tools/fallbackScheduler.js
```

### Third cloud backup

Oracle Cloud VM template files:

- `cloud/oci/backup2.env.example`
- `cloud/oci/run-backup2.sh`
- `cloud/oci/install-backup2-cron.sh`

Generate the example env file from shared defaults:

```bash
npm run cloud:sync
```

Run command:

```text
node src/tools/fallbackScheduler.js
```

## Recommended cloud order

Recommended practical order:

1. GitHub Actions
2. Google Cloud Run
3. Oracle Cloud Always Free VM or another container platform

## Important env for backup clouds

```text
SCHEDULER_MODE=fallback
GITHUB_REPO=Sunilkhatate0770/salesforce-job-radar-agent
GITHUB_WORKFLOW_FILE=salesforce-job-radar-agent.yml
GITHUB_TOKEN=YOUR_GITHUB_TOKEN
GITHUB_ACTIONS_MAX_GAP_MINUTES=20
RUN_LEASE_ENABLED=true
RUN_LEASE_REQUIRED=true
RUN_LEASE_KEY=salesforce-job-radar-agent
RUN_LEASE_DURATION_MINUTES=25
```

GitHub token permissions:

- `Actions: Read`
- `Contents: Read`

## Validation

Check the cloud fallback prerequisites after secrets are set:

```bash
npm run doctor:cloud
```

## Scheduling pattern

Run every 10 minutes on all clouds.

Behavior:

- if GitHub ran recently, backup clouds skip
- if GitHub becomes stale, first backup runs
- if first backup already ran recently, lower-priority backups skip
- if first backup is down too, next backup eventually runs
- shared lease prevents duplicate processing
- if GitHub starts running again later, backup clouds see fresh GitHub activity and skip automatically on the next scheduled checks

## Automatic failback

Yes, failback is automatic.

Example:

1. GitHub Actions runs normally
2. GitHub hosted minutes are exhausted
3. Cloud Run backup starts taking runs
4. GitHub quota resets later or GitHub starts running again
5. Backup clouds detect a fresh GitHub run and skip
6. GitHub becomes primary again automatically

No manual switching is needed after deployment.

## Limitation

This does not let GitHub "start" another cloud directly after quota exhaustion.

Instead, each cloud keeps its own schedule, and the backup clouds detect that GitHub has become stale and take over automatically.
