# Salesforce Job Radar Agent

Industrial-grade Salesforce career intelligence platform with job tracking, interview prep, and AI-powered career roadmapping.

**Live Deployment:** [salesforce-job-radar-agent-template.vercel.app](https://salesforce-job-radar-agent-template.vercel.app/)

## Architecture

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML/CSS/JS SPA (no framework) |
| **Backend/API** | Vercel Serverless Functions (Node.js ESM) |
| **Primary DB** | MongoDB Atlas (hot storage) |
| **Archival DB** | Turso (SQLite-over-HTTP, cold storage) |
| **State Store** | Supabase (job alerts, agent state) |
| **Auth** | Google Sign-In (OAuth2 ID tokens) |
| **AI** | OpenAI API (optional, with deterministic fallbacks) |
| **CI/CD** | GitHub Actions + Vercel auto-deploy |
| **Styling** | Custom CSS design system with responsive breakpoints |

## Features

- **Job Radar Dashboard** — Kanban board for Salesforce job tracking with status overrides
- **AI Profile Matching** — Resume skill extraction and job market intelligence
- **Career Roadmap** — Experience-based study plan with designation targeting
- **Interview Prep** — 40+ topic modules (Apex, LWC, Integration, Security, etc.)
- **Code Practice** — Browser-based coding challenges with static + AI review
- **Study Tracker** — Time tracking, leaderboard, spaced repetition
- **Release Center** — Personalized Salesforce release intelligence
- **Platform Sync** — LinkedIn/Naukri profile import (text-based, no credentials)
- **PWA** — Installable progressive web app with offline support

## Quick Start

### Prerequisites
- Node.js 20+
- npm 9+
- MongoDB Atlas account (recommended)
- Google Cloud project with OAuth 2.0 Client ID

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/SunilKhatate122150/salesforce-job-radar-agent-template.git
cd salesforce-job-radar-agent-template

# 2. Install dependencies
npm ci

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 4. Run diagnostics
npm run doctor

# 5. Start local web server
npm run web

# 6. Or run the full agent
npm start
```

### Environment Variables

See `.env.example` for the complete list. Critical variables:

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | **Yes** | Google OAuth 2.0 Client ID for authentication |
| `MONGODB_URI` | Recommended | MongoDB Atlas connection string |
| `TURSO_URL` | Recommended | Turso database URL for archival storage |
| `TURSO_AUTH_TOKEN` | Recommended | Turso authentication token |
| `SUPABASE_URL` | Recommended | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Supabase service role key |
| `OPENAI_API_KEY` | Optional | OpenAI key for AI features (falls back to deterministic) |
| `JOB_RADAR_GITHUB_REPO` | Optional | GitHub repo for cloud job scan dispatch |
| `JOB_RADAR_GITHUB_TOKEN` | Optional | GitHub token for workflow dispatch |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot for notifications |
| `TELEGRAM_CHAT_ID` | Optional | Telegram chat for notifications |

### Vercel Deployment

1. Connect your GitHub repo to Vercel
2. Add all environment variables to Vercel project settings
3. Deploy — Vercel auto-detects the static frontend + serverless API
4. The `vercel.json` handles API routing and security headers

## Project Structure

```
├── index.html           # Main SPA entry point
├── app.js               # Frontend application logic (222KB)
├── styles.css           # Design system and component styles
├── responsive.css       # Responsive breakpoints and accessibility
├── api/
│   └── router.js        # Vercel serverless API (all routes)
├── src/
│   ├── components.js    # UI template/rendering logic
│   ├── db/              # Database drivers (Turso, Supabase)
│   ├── models/          # Mongoose schemas
│   ├── jobs/            # Job processing and dashboard logic
│   ├── api/             # API contracts and health checks
│   └── tools/           # CLI tools (doctor, tracker, etc.)
├── data/                # Static JSON data (roadmaps, releases, topics)
├── pages/               # HTML page templates
├── test/                # Node.js test suite (50 tests)
└── vercel.json          # Vercel deployment config
```

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:failover
npm run test:opportunities
```

## Known Limitations

- No TypeScript — the codebase is vanilla JavaScript (ESM)
- No bundler/build step — files are served directly
- `app.js` is a large monolith (5000+ lines) — modularization planned
- Google Client ID is currently hardcoded in `index.html` — should use env injection
- Service worker caches aggressively — may need manual cache clear after deploys

## Full Setup Guide

See [SETUP_FROM_SCRATCH.md](./SETUP_FROM_SCRATCH.md) for detailed platform-specific setup instructions.

## Upgrade Plan

See [UPGRADE_PLAN.md](./UPGRADE_PLAN.md) for the roadmap of planned improvements.
