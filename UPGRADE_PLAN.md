# Salesforce Job Radar Agent — Upgrade Plan

**Generated:** 2026-05-06  
**Codebase Version:** v1412 → v1413 (post-audit + big upgrade)

## 2026-05-14 Career Intelligence Upgrade Addendum

- Added `src/data/careerIntelligence.js` for browser-side job freshness, source health, Today Command Center, study-roadmap, release-study, content-search, and mock-interview helpers.
- Added `src/services/dashboardSummary.js` so API routes can produce dashboard summary, release study actions, job source health, and mock-session records without trusting client `userId` values.
- Added dashboard UI for Today Command Center, Next 7 Days Plan, and Apex/LWC/Integration/Security/Agentforce/Data Cloud roadmap tracks.
- Upgraded Job Radar with newest-first helper sorting, `New today` / `Updated` / `Stale` / `Needs review` badges, source health metrics, and filters for Remote, Pune, India, Fresh, Resume Ready, and Follow-up.
- Added `/api/dashboard/summary`, `/api/releases/study-actions`, and `/api/mock-interview/session` to both Vercel and local server paths.
- Added mock interview role/company/topic setup, save flow, cloud/local persistence, and user-specific session history.
- Upgraded Code Practice single-file attempts with richer result categories and cloud persistence for custom HTML/JS/Apex class/trigger practice when signed in.
- Added `src/styles/career-upgrades.css` instead of increasing `styles.css` or `responsive.css`.
- Added `test/careerIntelligence.test.js` to verify job ordering/freshness, source health, release actions, mock sessions, and user-scoped dashboard summary behavior.

## 2026-05-08 Best-Practices Addendum

- Removed stale desktop sidebar collapse overrides from `styles.css` and consolidated active sidebar/collapsed-menu ownership into `src/styles/navigation.css`.
- Added `npm run check:syntax` and `npm run quality` so the repo has a repeatable JavaScript syntax gate in addition to the Node test suite.
- Added `npm run responsive:verify` for Puppeteer-based mobile/tablet/desktop checks covering 320px login fit, horizontal overflow, 44px mobile touch targets, mobile drawer behavior, desktop sidebar collapse, Job Radar flyout/search/filter/pagination, and the Job Radar mobile status selector.
- Added `BUG_AUDIT.md` with current large-file risks, user-data isolation notes, verification steps, and remaining production risks.
- Current large-file reality: `app.js`, `styles.css`, `src/styles/job-radar.css`, `src/run.js`, `api/router.js`, and `code-practice.js` are still legacy monoliths. Further splitting should happen by feature boundary with tests and browser verification, not by moving arbitrary blocks.
- Next safe split candidates: job radar CSS into board/cards/activity-log/responsive files, `app.js` navigation shell into a standalone module, and API route handlers into auth/profile/jobs/releases/study services.

## 2026-05-12 Study Analytics Addendum

- Extracted reusable study tracker math into `src/data/studyAnalytics.js` so totals, course targets, suggestion models, chart rows, tracker rows, and history analytics are tested outside the large SPA controller.
- Wired `app.js` tracker/history rendering to the shared analytics module while keeping the existing DOM/UI structure stable.
- Added `test/studyAnalytics.test.js` covering live session totals, interview-focused suggestions, and history chart aggregation.
- Syntax coverage is now 102 JavaScript files, and the Node suite is now 70 tests.
- Tightened the mobile header zone minimum width to remove the remaining 320px/390px responsive verifier warning.
- Repaired the theme shell so the app defaults to the original dark UI, the old broken `theme=light` preference is migrated away, and the theme toggle is bound only once.

## 2026-05-06 Production Fix Addendum

### Fixes Completed In This Pass

- Replaced the overloaded legacy sidebar with a config-driven navigation model in `src/data/navigation.js`.
- Added the required professional menu groups for Salesforce Core, LWC/UI, Security/Data Model, Integration, Flow/Admin, Agentforce/Data Cloud, FDE, company prep, and mock interview communication.
- Hid the old static sidebar DOM from visual output and assistive technology to remove fake badges and duplicate/broken labels.
- Added mobile drawer hardening: accessible buttons, overlay click close, Escape close, body scroll lock, focus movement, and active item scroll-into-view.
- Added structured Salesforce interview content in `src/data/salesforceContent.js` with the requested minimum question counts across Apex, SOQL/SOSL, triggers, async Apex, LWC, integration, security, Flow/Admin, Data Cloud, Agentforce, FDE, behavioral, record-page/LWC communication, and architecture scenarios.
- Added unified question search results with section, difficulty, tags, preview, open action, and user-scoped revised/mastered actions.
- Added one-time legacy localStorage migration into `sfjr:${userId}:...` keys.
- Scoped local Mongo job reads to the signed-in user plus explicit `system` public feed records.
- Replaced global leaderboard exposure with current-user-only study summary behavior.
- Changed Mongo job uniqueness from global `job_hash` to compound `{ userId, job_hash }`.

### User-Based Data Architecture

- Authenticated API routes resolve the current user from Google ID token and should ignore client-supplied `userId`.
- Private client state uses `sfjr:${userId}:...` keys for pipeline jobs, activity log, bookmarks, progress, recent topics, and user settings.
- Public/system job feeds remain separate from private job radar state. Users may see the same public opportunity, but their saved status, notes, and progress are private.
- Mongo, Turso, and Supabase user data must stay scoped by `userId`; any future route must follow this pattern before it is exposed.

### Auth And Database Roadmap

- Drop the old Mongo `job_hash_1` unique index manually if it already exists, then allow the new `{ userId: 1, job_hash: 1 }` sparse unique index to build.
- Google Client ID now loads from `/api/client-config` instead of being hardcoded in `index.html`.
- Add server-side schema validation helpers for every mutation route.
- Add repository-level tests for cross-user update/delete rejection.
- Consider replacing leaderboard with an opt-in anonymized aggregate if social ranking is needed later.

### Vercel Checklist

- Required: `GOOGLE_CLIENT_ID`, `GITHUB_REPOSITORY`, `GITHUB_TOKEN`, plus at least one writable storage backend for full private persistence.
- Recommended: `MONGODB_URI`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TURSO_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Build remains serverless/static; do not deploy until `npm test`, syntax checks, and release pulse pass locally.

---

## Current Implementation Summary

The Salesforce Job Radar Agent is a **vanilla HTML/CSS/JS Single Page Application (SPA)** deployed on **Vercel** with a serverless API backend (`api/router.js`). It uses a **hybrid hot-cold storage** pattern:

- **MongoDB Atlas** — Primary write (hot) storage
- **Turso** — Archival tier (cold) SQLite-over-HTTP
- **Supabase** — Job alerts, application tracking, agent state

Authentication is Google OAuth2 via ID tokens. AI features use OpenAI with deterministic fallbacks. The frontend is a monolithic SPA with `app.js` (5000+ lines, 222KB), `styles.css` (8600+ lines, 189KB), and `components.js` (1350 lines, 64KB).

---

## Critical Gaps Found

| # | Category | Gap | Severity |
|---|---|---|---|
| 1 | **Security** | Google Client ID now runtime-configured through `/api/client-config`; future work can add build-time public config versioning | Low |
| 2 | **Security** | Error responses leaked stack traces and internal errors in production | High ✅ Fixed |
| 3 | **Security** | Missing CORS preflight handling | Medium ✅ Fixed |
| 4 | **Security** | Missing security headers (HSTS, CSP, X-Frame-Options, etc.) | High ✅ Fixed |
| 5 | **SEO** | No meta description tag | Medium ✅ Fixed |
| 6 | **Accessibility** | No skip-to-content link | Medium ✅ Fixed |
| 7 | **Accessibility** | No focus-visible styles for keyboard navigation | High ✅ Fixed |
| 8 | **Accessibility** | No reduced-motion support | Medium ✅ Fixed |
| 9 | **Performance** | `app.js` is 222KB monolith — no code splitting | Medium |
| 10 | **Performance** | `styles.css` is 189KB — no CSS purging or splitting | Medium |
| 11 | **Architecture** | No TypeScript — no compile-time type safety | Low |
| 12 | **Architecture** | No bundler/build step — no tree shaking, minification, or module bundling | Medium |
| 13 | **Backend** | `parse-resume` endpoint returns hardcoded simulated data instead of real parsing | Low |
| 14 | **Backend** | `sync-cloud` endpoint has hardcoded fallback certifications | Low |
| 15 | **Frontend** | `var` declarations in global scope (legacy pattern) | Low |
| 16 | **Frontend** | Console logging suppressed in production but RADAR_DEBUG check could be cleaner | Low |
| 17 | **Deployment** | Service worker cache name is manually versioned | Low |
| 18 | **Deployment** | PWA icons are self-hosted in `assets/icons`; keep external icon dependencies out of manifest | Done |
| 19 | **Documentation** | README was minimal — needed architecture docs, env guide, deployment steps | Medium ✅ Fixed |

---

## Fixes Completed (v1413)

### Security
- ✅ Added comprehensive security headers to `vercel.json`: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS
- ✅ Added CORS preflight (OPTIONS) handling in API router
- ✅ Error responses now mask internal details in production (Vercel or NODE_ENV=production)
- ✅ Added cache control headers for static assets (CSS/JS immutable, data files stale-while-revalidate)

### Accessibility
- ✅ Added skip-to-content link in `index.html`
- ✅ Added `:focus-visible` outlines for all interactive elements
- ✅ Added `prefers-reduced-motion` media query to respect user preferences
- ✅ Added minimum touch target sizing (44px)
- ✅ Added high-contrast mode support via `prefers-contrast: high`
- ✅ Added print styles

### SEO
- ✅ Added `<meta name="description">` tag
- ✅ Improved `<title>` tag (removed version number, added descriptive text)

### Documentation
- ✅ Complete README rewrite with architecture table, env variable guide, project structure, and deployment steps
- ✅ Created this UPGRADE_PLAN.md

### Quality
- ✅ All 50 existing tests pass
- ✅ No npm install errors
- ✅ Vulnerability fixed via `npm audit fix` (ip-address XSS)

### Enhanced UI/UX (v1413 Big Upgrade)
- ✅ **Toast Notification System** — Queue-based with success/error/warning/info types, stacking animations, auto-dismiss, dismissable
- ✅ **Loading Skeleton System** — CSS skeleton shimmer animations for async data loading states
- ✅ **Empty State Patterns** — Reusable empty state components with icons, descriptions, and CTAs
- ✅ **Loading Spinner Utility** — Consistent spinner in sm/md/lg sizes
- ✅ **Micro-Interactions** — Page transitions, button hover lifts, card glow effects, nav active indicator glow
- ✅ **Glassmorphism Card** — `.card-glass` utility class for premium blur-background cards
- ✅ **Progress Animations** — `.progress-animate` for animated progress bars
- ✅ **Gradient Text** — `.gradient-text` utility for branded heading treatments

### Backend Improvements (v1413)
- ✅ **Input Validation** — Added shared request sanitization for Vercel and local API routes, including prototype-pollution protection and payload caps
- ✅ **CORS Preflight** — Full OPTIONS handler with configurable headers
- ✅ **Error Masking** — Production-safe error responses that never leak stack traces

### Infrastructure (v1413)
- ✅ **GitHub Actions CI** — Automated test + audit + vercel.json validation on every push/PR
- ✅ **Service Worker Upgrade** — Auto-versioning, cache-first for static assets, network-first for HTML, old cache cleanup
- ✅ **PWA Manifest** — Updated with proper app name, categories, orientation

---

## Remaining Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Google Client ID is public browser config | Low (OAuth client IDs are designed to be public) | Served from `/api/client-config`; keep secrets out of this endpoint |
| CSP still requires legacy allowances | Medium (XSS protection) | Compatibility CSP is now in `vercel.json`; remove inline handlers and code-practice eval later so `'unsafe-inline'` and `'unsafe-eval'` can be removed |
| Rate limiting is per serverless instance | Medium (abuse risk) | Dependency-free API rate limiter is now active; move to Vercel Edge Middleware or Upstash for distributed limits |
| Service worker may cache stale versions | Low | Implement cache-busting with content hashing or use Vercel's automatic headers |
| MongoDB connection timeout in serverless | Low (5s timeout configured) | Already handled with graceful fallback |

---

## High-Impact Upgrades

### 1. Frontend Modularization
**Priority:** High  
**Effort:** Large

Split `app.js` (222KB) into ES modules:
- `modules/auth.js` — Authentication flow
- `modules/router.js` — SPA page routing
- `modules/study-tracker.js` — Study time tracking
- `modules/job-radar.js` — Job pipeline management
- `modules/profile.js` — Profile matching and roadmap
- `modules/knowledge.js` — Topic loading and rendering

Use native ES module imports with `<script type="module">` or adopt a minimal bundler (Vite).

### 2. Build Pipeline
**Priority:** High  
**Effort:** Medium

Add a build step with Vite or esbuild:
- Bundle and minify JS (222KB → ~60KB gzipped)
- Bundle and purge CSS (189KB → ~40KB gzipped)
- Content-hash filenames for cache busting
- Tree-shake unused code
- Source maps for debugging

### 3. TypeScript Migration
**Priority:** Medium  
**Effort:** Large

Gradually migrate to TypeScript:
- Start with `api/router.js` → `api/router.ts`
- Add types for API request/response contracts
- Add types for database models
- Use JSDoc types as intermediate step

---

## Backend Upgrade Ideas

| Upgrade | Priority | Effort | Description |
|---|---|---|---|
| Rate limiting | Partial | Small | Best-effort serverless API limiter added; Upstash/Vercel Edge should replace it for distributed enforcement |
| Input validation | Medium | Medium | Add Zod schema validation for all POST endpoints |
| API versioning | Low | Medium | Prefix routes with `/api/v1/` for future compatibility |
| Webhook support | Medium | Medium | Add webhook endpoint for GitHub/Supabase events |
| Resume parsing | Medium | Large | Implement real PDF parsing with `pdf-parse` instead of simulated extraction |
| Caching layer | Medium | Medium | Add in-memory or Redis cache for expensive operations (roadmap, releases) |
| Background jobs | Low | Large | Move archival overflow to a scheduled cron function |

---

## UI/UX Upgrade Ideas

| Upgrade | Priority | Effort | Description |
|---|---|---|---|
| Dark/Light theme toggle | Medium | Medium | Add theme switcher with CSS custom properties |
| Toast notification system | Low | Small | Replace inline toast with proper notification queue |
| Loading skeletons | Medium | Small | Add skeleton screens for all async data loads |
| Empty state illustrations | Low | Medium | Add meaningful empty states for each section |
| Sidebar collapse animation | Low | Small | Smooth sidebar toggle on desktop with icon-only mode |
| Table view for jobs | Medium | Medium | Add table/list view option alongside Kanban board |
| Drag-and-drop Kanban | Medium | Large | Add native drag-and-drop for job card status changes |
| Chart visualizations | Medium | Medium | Add Chart.js/D3 for study analytics and job market trends |

---

## Performance Upgrades

| Upgrade | Priority | Effort | Description |
|---|---|---|---|
| Code splitting | High | Medium | Split app.js into lazy-loaded modules |
| CSS optimization | High | Medium | Purge unused CSS, split critical/deferred styles |
| Image optimization | Low | Small | Self-host PWA icons, use WebP format |
| Font optimization | Medium | Small | Subset Google Fonts, use `font-display: swap` |
| Virtual scrolling | Medium | Medium | Use virtual lists for long job/session lists |
| API response caching | Medium | Small | Cache roadmap and release data client-side with SWR pattern |
| Service worker update | Low | Small | Implement proper cache versioning with content hash |

---

## Security Upgrades

| Upgrade | Priority | Effort | Description |
|---|---|---|---|
| Content Security Policy | Done | Medium | Compatibility CSP added for Google Sign-In, Google Fonts, profile images, and current code-practice execution |
| Rate limiting | Partial | Small | API burst limiter added without new dependencies; future distributed limiter remains recommended |
| Input sanitization | Medium | Medium | Add systematic sanitization for all user inputs |
| CSRF protection | Low | Medium | Not critical for API-token auth, but consider for form submissions |
| Dependency audit | Medium | Small | Run `npm audit fix` and update vulnerable packages |
| Secrets management | Partial | Small | Google Client ID moved to runtime config; keep migrating any future public config through safe endpoints and never expose secrets |

---

## Testing Upgrades

| Upgrade | Priority | Effort | Description |
|---|---|---|---|
| Integration tests | Medium | Medium | Add API endpoint integration tests using `supertest` |
| Frontend unit tests | Medium | Large | Add component rendering tests with JSDOM |
| E2E tests | Low | Large | Add Playwright/Cypress for critical user flows |
| Visual regression | Low | Large | Add screenshot comparison for UI consistency |
| Load testing | Low | Medium | Verify Vercel serverless function performance under load |
| CI pipeline | Medium | Small | Add GitHub Actions workflow for lint + test on PR |

---

## Suggested Roadmap

### Immediate (This Week)
- [x] Security headers hardening
- [x] CORS preflight handling
- [x] Error response masking in production
- [x] Accessibility improvements (focus, motion, touch targets)
- [x] SEO meta tags
- [x] Documentation overhaul
- [x] Run `npm audit fix` to address vulnerability
- [x] Enhanced toast notification system (queue-based, typed)
- [x] Loading skeleton CSS system
- [x] Empty state patterns
- [x] Micro-interaction improvements (page transitions, hover effects)
- [x] Split Code Practice CSS into `src/styles/code-practice.css` and lazy-load on demand
- [x] Split Job Radar CSS into `src/styles/job-radar.css` and lazy-load before rendering the dashboard
- [x] GitHub Actions CI pipeline
- [x] Service worker auto-versioning
- [x] Backend input validation helpers
- [x] API health verification command for public routes and unauthenticated private-route protection
- [x] PWA manifest upgrade
- [x] Add compatibility Content-Security-Policy header for Google Sign-In, fonts, profile images, and current code-practice execution
- [x] Add dependency-free API burst limiter for public and private route protection
- [x] Move Google Client ID from hardcoded HTML to `/api/client-config`
- [x] Confirm PWA icons are self-hosted

### Short-term (1-2 Weeks)
- [ ] Replace in-memory API limiter with distributed Upstash or Vercel Edge Middleware enforcement
- [x] Apply shared request-body sanitization to Vercel and local POST/PATCH endpoints
- [x] Integrate skeleton/spinner states into core async data sections
- [x] Extract study tracker analytics into a reusable tested module

### Medium-term (1-2 Months)
- [ ] Add Vite build pipeline for bundling and minification
- [ ] Split `app.js` into ES modules
- [ ] Continue CSS optimization and duplicate selector cleanup after feature-level stylesheet splits
- [ ] Add Chart.js for study analytics visualization
- [ ] Implement real PDF resume parsing
- [ ] Add drag-and-drop to Kanban board
- [x] Repair dark/light theme toggle and preserve original dark default

### Long-term (3-6 Months)
- [ ] Migrate API layer to TypeScript
- [ ] Add comprehensive integration test suite
- [ ] Add E2E testing with Playwright
- [ ] Add API versioning (`/api/v1/`)
- [ ] Add webhook support for real-time updates
- [ ] Consider migration to Next.js for SSR/SSG benefits
- [ ] Add virtual scrolling for large datasets
- [ ] Add offline-first data sync with service worker

---

## Manual QA Checklist

Since there is no automated E2E test suite, verify these flows before each deployment:

### Authentication
- [ ] Google Sign-In works from login overlay
- [ ] User profile picture and name render in header and sidebar
- [ ] Sign out clears session and shows login overlay
- [ ] Premium/Classic UI mode toggle persists across page loads

### Job Radar Dashboard
- [ ] Jobs load from hybrid storage (Mongo + Turso + Supabase)
- [x] Kanban board renders all 5 columns
- [x] Job card click opens detail flyout
- [ ] Status change (move to applied/interview/offer/rejected) persists
- [x] Search and filter work correctly
- [x] Pagination works per column
- [x] Mobile stage selector works on phones

### Profile & Roadmap
- [ ] Experience/designation dropdowns save and reload
- [ ] Profile import (text paste) extracts skills and generates roadmap
- [ ] Roadmap preview updates live when form values change
- [ ] Release center shows personalized items

### Study Tracker
- [ ] Timer starts when navigating to a topic
- [ ] Session saves to backend when navigating away
- [ ] Study history shows correct entries
- [ ] Leaderboard loads and displays

### Responsive Design
- [x] Login overlay fits on 320px width screens
- [x] Sidebar opens/closes cleanly on mobile
- [x] Kanban board is single-column on mobile, 2-column on tablet
- [x] All cards and forms are readable without horizontal scroll
- [x] Touch targets are 44px minimum

### API Health
- [x] `GET /api/health` returns 200 with connectivity details
- [x] `GET /api/code-practice/challenges` works without auth
- [x] Critical private job/profile/study mutation and read endpoints return 401 without auth token
