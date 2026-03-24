# Job Agent Setup From Scratch (Simple English)

This guide helps you set up this agent on any machine from zero.

The agent sends Salesforce job alerts from:
- Naukri
- LinkedIn
- Other free fallback sources (Arbeitnow, Adzuna if keys are provided)

It sends alerts to:
- Telegram
- Email

It runs about every 10 minutes in GitHub Actions.
For accurate 10-minute execution:
- on macOS: use the included local `launchd` scheduler
- in the cloud: use an external HTTP scheduler that dispatches the GitHub workflow

---

## 1. Prerequisites

Install these first:
- Node.js 20+
- Git
- A GitHub account
- A Supabase account
- A Telegram account
- A Gmail account (with 2-step verification ON, and app password)
- Apify account (recommended, but fallback is available)

---

## 2. Clone and install

```bash
git clone <your-repo-url>
cd salesforce-job-radar-agent
npm ci
```

---

## 3. Create Supabase table

Open Supabase -> SQL Editor, then run this:

```sql
create table if not exists public.job_alerts (
  id bigserial primary key,
  job_hash text not null,
  title text,
  company text,
  location text,
  experience text,
  apply_link text,
  source_job_id text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);
```

Then run this project SQL file too:

- [sql/job_alerts_hardening.sql](sql/job_alerts_hardening.sql)

---

## 4. Get Supabase values

In Supabase dashboard:
- `Project Settings` -> `Data API`
  - Copy `Project URL` -> use as `SUPABASE_URL`
- `Project Settings` -> `API Keys`
  - Copy `service_role` key -> use as `SUPABASE_SERVICE_KEY`

Important:
- Keep `SUPABASE_SERVICE_KEY` private. Never share publicly.

---

## 5. Setup Telegram bot

1. Open Telegram and message `@BotFather`
2. Run `/newbot`
3. Save bot token -> `TELEGRAM_BOT_TOKEN`
4. Send at least one message to your bot
5. Get chat id:
   - Open: `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates`
   - Find `"chat":{"id":...}`
   - Save as `TELEGRAM_CHAT_ID`

---

## 6. Setup Email Delivery

You can use Gmail SMTP.

Use these values:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=your-gmail@gmail.com`
- `SMTP_PASS=your-16-char-app-password`
- `EMAIL_FROM=your-gmail@gmail.com`
- `EMAIL_TO=where-you-want-alerts@gmail.com`
- `EMAIL_FROM_NAME=Salesforce Job Radar Agent`

How to create Gmail app password:
1. Google Account -> `Security`
2. Ensure `2-Step Verification` is ON
3. Open `App passwords`
4. Choose app name (example: `naukri-agent`)
5. Copy generated 16-character password
6. Use it as `SMTP_PASS`

Optional fallback if Gmail blocks GitHub Actions:
- `RESEND_API_KEY=your_resend_api_key`
- `RESEND_FROM=your_verified_sender_email`
- `RESEND_REPLY_TO=your-gmail@gmail.com`
- `RESEND_TO=your-receiving-email@gmail.com`
- `EMAIL_PROVIDER_ORDER=resend,smtp`

This means:
- try Resend first
- if Resend is not configured, use Gmail SMTP

---

## 7. Create local `.env`

Create `.env` in project root:

```env
APIFY_TOKEN=your_apify_token

TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_SECURE=false
EMAIL_FROM=your-gmail@gmail.com
EMAIL_TO=your-receiving-email@gmail.com
EMAIL_FROM_NAME=Salesforce Job Radar Agent

RESEND_API_KEY=
RESEND_FROM=
RESEND_REPLY_TO=
RESEND_TO=
EMAIL_PROVIDER_ORDER=resend,smtp

ADZUNA_APP_ID=
ADZUNA_APP_KEY=

ALERT_MIN_MATCH_SCORE=20
ALERT_MAX_ITEMS=all

RESUME_SKILLS=apex,lwc,salesforce,soql,integration,flows
RESUME_EXPERIENCE_YEARS=4
RESUME_TARGET_ROLE=Salesforce Developer
RESUME_TEXT=

RESUME_MATCH_ENABLED=true
RESUME_AI_ENABLED=false
RESUME_AI_MAX_JOBS_PER_RUN=3
RESUME_TAILOR_WITH_AI=false
OPENAI_API_KEY=

APPLY_PACK_ENABLED=true
APPLY_PACK_MAX_FILES=3
APPLY_PACK_AI_ENABLED=true
APPLY_PACK_AI_MODEL=gpt-4.1-mini

RESUME_BASE_PDF_PATH=assets/resume/base/base-resume.pdf
RESUME_ATTACHMENT_MAX_FILES=3
RESUME_ATTACH_BASE_PDF=true
TELEGRAM_MAX_DOCS_PER_RUN=7

PRECISION_PROFILE=balanced
# optional manual overrides (leave blank to use profile defaults):
# PRECISION_REQUIRED_SKILLS=
# PRECISION_REQUIRED_SKILLS_MODE=
# PRECISION_EXCLUDE_KEYWORDS=
# PRECISION_MAX_POSTED_HOURS=
# PRECISION_KEEP_UNKNOWN_POSTED=
# PRECISION_CLUSTER_DUPLICATES=

NAUKRI_GAP_GUARD_ENABLED=true
NAUKRI_MIN_REQUIRED_PER_RUN=1

APPLICATION_TRACKER_ENABLED=true
TRACKER_AUTO_FOLLOWUP_HOURS=36
TRACKER_ACTIONABLE_LIMIT=10

DAILY_SUMMARY_ENABLED=true
DAILY_SUMMARY_TIMEZONE=Asia/Kolkata
DAILY_SUMMARY_HOUR=21
```

`ALERT_MAX_ITEMS` values:
- `all` (or `0`) => send all eligible jobs in that run
- number (example `20`) => send only that many

Base resume file in repo:
- `assets/resume/base/base-resume.pdf`

Then test locally:

```bash
npm run doctor
node src/run.js
npm run tracker -- summary
```

---

## 8. Setup GitHub Secrets (for scheduled runs)

In GitHub repo:
- `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Add these secrets:
- `APIFY_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `EMAIL_FROM`
- `EMAIL_TO`
- `RESEND_API_KEY` (optional)
- `RESEND_FROM` (optional)
- `RESEND_REPLY_TO` (optional)
- `RESEND_TO` (optional)
- `ADZUNA_APP_ID` (optional)
- `ADZUNA_APP_KEY` (optional)
- `RESUME_SKILLS` (example: `apex,lwc,soql,integration`)
- `RESUME_EXPERIENCE_YEARS` (example: `4`)
- `RESUME_TARGET_ROLE` (example: `Salesforce Developer`)
- `RESUME_TEXT` (optional full resume text)
- `OPENAI_API_KEY` (optional, only if you want AI suggestions)

Where to set `OPENAI_API_KEY`:
- Local run: add it in `.env`
- GitHub Actions run: add it as GitHub Secret named `OPENAI_API_KEY`

If you want AI-generated tailored resume files:
- Set `RESUME_TAILOR_WITH_AI=true`
- Set `OPENAI_API_KEY`

---

## 9. Schedule and runtime

Workflow file:
- [.github/workflows/salesforce-job-radar-agent.yml](.github/workflows/salesforce-job-radar-agent.yml)

Current schedule:
- Trigger poll: every 5 minutes
- Schedule gate keeps the effective cadence near 10 minutes
- Schedule gate now checks the last real `run-agent` execution, not skipped backup runs

Accurate 10-minute option on macOS:
- GitHub Actions cron is best-effort, not exact
- Use local `launchd` to run the agent every 600 seconds on your Mac
- Keep GitHub Actions as backup/secondary runner
- The installer runs a synced runtime copy from `~/Library/Application Support/SalesforceJobRadarAgent`
- This avoids macOS background-access issues with repos stored inside `Documents`

Install local scheduler:

```bash
npm run scheduler:install
```

After repo code changes, resync the runtime copy:

```bash
npm run scheduler:sync
launchctl kickstart -k gui/$(id -u)/com.salesforce-job-radar-agent
```

Check status:

```bash
launchctl print gui/$(id -u)/com.salesforce-job-radar-agent
tail -f "$HOME/Library/Application Support/SalesforceJobRadarAgent/local-scheduler.log"
```

Remove local scheduler:

```bash
npm run scheduler:uninstall
```

Accurate cloud-only option:
- use an external scheduler such as `cron-job.org`
- trigger GitHub workflow dispatch every 10 minutes
- setup guide: [CLOUD_AUTOMATION_SETUP.md](./CLOUD_AUTOMATION_SETUP.md)

Current behavior:
- Sends normal alert when new jobs are found
- Scheduled runs also send heartbeat when no new jobs are found
- Manual workflow runs still send summary so you can test format
- Runs precision filters (required skills, exclude keywords, posted-age, duplicate clustering)
- Includes provider health section (success/failed/skipped + counts) in alerts and heartbeat
- Keeps application tracker with statuses (new/shortlisted/applied/interview/offer/rejected/ignored/follow_up)
- Triggers Naukri source guard alert when Naukri count is below expected minimum
- Sends one daily summary with top companies, top locations, and missing skill trend
- Adds resume match score + missing skills + resume change suggestions for each new job
- Keeps local `.cache` state across GitHub Action runs for stronger dedupe/pending recovery
- Sends downloadable resume files:
  - Tailored resume markdown file (generated per top match)
  - AI apply-pack markdown (cover letter + interview Q&A + apply checklist)
  - Base resume PDF attachment

---

## 10. Fallback logic (important)

Main provider chain:
- `apify` (Naukri actors)
- `linkedin` (LinkedIn apify + LinkedIn direct fallback)
- `direct` (Naukri direct endpoint)
- `arbeitnow`
- `adzuna` (if keys available)

If Apify fails:
- LinkedIn direct fallback still works
- Other free sources still run

So agent can still send alerts even when Apify is down or over limit.

---

## 11. How to confirm everything is working

1. Run workflow manually in GitHub Actions.
2. Open logs and check lines like:
   - `Provider 'linkedin' ...`
   - `Total unique jobs collected ...`
   - `Newly discovered jobs this run ...`
   - `Telegram message sent`
   - `Email message sent`
3. Check Telegram and Gmail inbox.

You can also verify resume scoring lines in job alerts:
- `Match: XX%`
- `Missing Skills: ...`
- `Resume Change: ...`

You can also verify attachments in alerts:
- Email should include resume attachments (download button in Gmail)
- Telegram should include document files you can download

Application tracker commands:
- `npm run tracker -- summary`
- `npm run tracker -- list`
- `npm run tracker -- set <job_hash> applied "Applied via company portal"`
- `npm run tracker -- note <job_hash> "Followed up with recruiter"`
- Shortcut scripts:
  - `npm run tracker:summary`
  - `npm run tracker:list -- new 20`
  - `npm run tracker:set -- <job_hash> applied "Applied via company portal"`
  - `npm run tracker:note -- <job_hash> "Follow up in 2 days"`

Precision profile quick tuning:
- `PRECISION_PROFILE=wide` -> more jobs (broader matching)
- `PRECISION_PROFILE=balanced` -> recommended default
- `PRECISION_PROFILE=strict` -> fewer jobs (high precision)

---

## 12. Common issues

- `Monthly usage hard limit exceeded` (Apify):
  - Apify account limit finished.
  - Fallback sources continue, but Apify source stops until limit reset.

- No email received:
  - Check spam folder.
  - Verify `SMTP_PASS` app password and `SMTP_PORT/SMTP_SECURE`.

- No Telegram received:
  - Verify bot token.
  - Verify chat id.
  - Send one message to bot before using `getUpdates`.

- Supabase errors:
  - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
  - Ensure `job_alerts` table exists.

---

## 13. Final note

After this setup, your agent is fully automatic:
- runs about every 10 minutes
- fetches from Naukri + LinkedIn + fallback providers
- dedupes old jobs
- sends alerts to Telegram and Email

