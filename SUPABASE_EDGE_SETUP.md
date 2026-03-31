# Supabase Cloud Migration

This repo is now prepared for the first Supabase-backed cloud phase:

- shared state can move from local `.cache` files into `agent_state`
- run telemetry can be written into `agent_run_history`
- cloud runs can disable filesystem attachments with `CLOUD_ATTACHMENTS_ENABLED=false`
- `supabase/functions/job-radar-run/index.ts` can execute the cloud-safe runner path
- `supabase/functions/job-radar-watchdog/index.ts` can alert when successful runs go stale
- `supabase/config.toml` is now initialized for Supabase CLI deployment

This is the right migration path for a free, cloud-first deployment, but it is not a "never stops" guarantee. It removes the GitHub hosted-runner minute limit and gives us a clean path to Supabase Cron + Edge Functions.

## 1. Apply SQL in Supabase

Run these files in the Supabase SQL Editor in this order:

1. `sql/job_alerts_hardening.sql`
2. `sql/agent_run_leases.sql`
3. `sql/agent_state.sql`
4. `sql/agent_run_history.sql`
5. `sql/job_alerts_opportunity_fields.sql`
6. `sql/supabase_edge_cron_template.sql` after your functions are deployed and you replace the placeholders

## 2. Cloud env for the Supabase-backed path

Use these env values for the cloud runtime:

```env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
# Supabase Edge Functions also expose SUPABASE_SERVICE_ROLE_KEY automatically.

STATE_BACKEND=supabase
STATE_BACKEND_REQUIRED=true
STATE_BACKEND_TABLE=agent_state

RUN_LEASE_ENABLED=true
RUN_LEASE_REQUIRED=true
RUN_LEASE_KEY=salesforce-job-radar-agent
RUN_LEASE_DURATION_MINUTES=25

RUN_HISTORY_ENABLED=true
RUN_HISTORY_TABLE=agent_run_history

CLOUD_ATTACHMENTS_ENABLED=false
EMAIL_PROVIDER_ORDER=smtp

ENABLE_POST_PROVIDERS=true
POST_FETCH_PROVIDERS=linkedin_posts
OPPORTUNITY_GEO_SCOPE=india_remote
ALERT_MEDIUM_DIGEST_MAX_ITEMS=4
POST_ALERT_POLICY=high_and_medium
COVERAGE_MONITOR_ENABLED=true
COVERAGE_BASELINE_WINDOW=8
COVERAGE_BASELINE_MIN_TOTAL=8
COVERAGE_TOTAL_DROP_RATIO=0.45
COVERAGE_POST_ZERO_RUN_THRESHOLD=4
COVERAGE_PROVIDER_PAUSE_RUN_THRESHOLD=2
COVERAGE_ZERO_RESULT_RUN_THRESHOLD=3
COVERAGE_ALERT_COOLDOWN_MINUTES=240
RESUME_TOP_OPPORTUNITY_LIMIT=2

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_TO=

JOB_RADAR_CRON_SECRET=

ADZUNA_APP_ID=
ADZUNA_APP_KEY=
APIFY_TOKEN=
```

Notes:

- `STATE_BACKEND=supabase` moves these state stores into Supabase: pending alerts, provider health, application tracker, fetch cursor, local dedupe fallback, daily summary state, and outbox.
- `sql/job_alerts_opportunity_fields.sql` adds the new listing/post/confidence/canonical fields used by the vNext opportunity engine.
- `CLOUD_ATTACHMENTS_ENABLED=false` keeps the cloud path away from PDF/ZIP/file attachment generation while still sending inline ATS/tailoring previews in alerts.
- `ENABLE_POST_PROVIDERS=true` enables the public hiring-post pipeline. Today that starts with `linkedin_posts`.
- `POST_ALERT_POLICY` lets you tune whether post-based opportunities are disabled, included only when high-confidence, or included in both the high-confidence and review digest sections.
- `COVERAGE_*` settings enable stale-coverage monitoring so the agent can alert when hiring-post coverage drops to zero, providers stay paused, or total opportunity volume falls well below the recent baseline.
- `EMAIL_PROVIDER_ORDER=smtp` is valid for the Gmail SMTP 465 path you are already using in Supabase.
- `JOB_RADAR_CRON_SECRET` is optional but recommended; pass it as `x-job-radar-secret` or `Authorization: Bearer ...` when your scheduler calls `job-radar-run`.
- For Supabase Cron HTTP calls, use your project's legacy `anon` JWT in the `Authorization` header. The SQL template now expects `YOUR_SUPABASE_ANON_KEY`.

## 3. Validate before scheduling

Run:

```bash
npm run doctor
npm run doctor:cloud
```

`doctor:cloud` now checks:

- `agent_run_leases`
- `agent_state`
- `agent_run_history`
- GitHub API access when fallback scheduling is enabled

## 4. Supabase function files

The repo now includes:

- `supabase/functions/job-radar-run/index.ts`
- `supabase/functions/job-radar-run/deno.json`
- `supabase/functions/job-radar-watchdog/index.ts`
- `supabase/functions/job-radar-watchdog/deno.json`

`job-radar-run` dynamically imports the cloud-safe runner from `src/cloud/runSupabaseCloudAgent.js`.

Suggested Supabase CLI deploy commands:

```bash
supabase functions deploy job-radar-run
supabase functions deploy job-radar-watchdog
```

Template env files are included:

- `supabase/.env.remote.example`
- `supabase/.env.local.example`

## 5. What is already migrated

These modules now support Supabase-backed state storage:

- `src/db/localDedupeStore.js`
- `src/db/applicationTracker.js`
- `src/db/pendingAlertQueue.js`
- `src/db/fetchCursor.js`
- `src/db/providerHealth.js`
- `src/db/jobOutbox.js`
- `src/notify/dailySummary.js`

`src/run.js` now also writes per-run telemetry into `agent_run_history`.

## 6. What comes next

The next implementation slice is:

1. deploy `job-radar-run` and `job-radar-watchdog`
2. wire Supabase Cron to `job-radar-run`
3. wire Supabase Cron to `job-radar-watchdog`
4. add a small deployment guide for Supabase CLI / dashboard scheduling

That next slice is what will fully remove GitHub Actions from scheduled execution.
