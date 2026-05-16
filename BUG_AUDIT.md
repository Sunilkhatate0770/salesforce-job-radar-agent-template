# Salesforce Job Radar Agent Bug And Best-Practices Audit

**Audit date:** 2026-05-08  
**Scope:** local vanilla HTML/CSS/JS app, Vercel API router, local web server, data/content files, tests, and deployment support files.

## 2026-05-16 Backend Stability Upgrade

| Area | Finding | Fix Applied | Files |
|---|---|---|---|
| Auth/session duplication | Vercel and local API servers each created their own Google OAuth client and manually parsed bearer tokens, increasing drift risk. | Added `src/auth/session.js` with shared bearer extraction, Google token verification, normalized user shape, and authenticated user-id resolution. | `src/auth/session.js`, `api/router.js`, `src/webServer.js` |
| API response shape | Unauthorized/auth failure responses were inconsistent between local and serverless paths. | Added `src/api/apiResponse.js` and wired auth/private-route failures through a consistent safe `{ success:false, error, code }` envelope. | `src/api/apiResponse.js`, `api/router.js`, `src/webServer.js` |
| Legacy local fallback routes | `src/webServer.js` still contained dead post-handler fallback blocks, including an unscoped `StudySession.find()` summary path. | Removed the unreachable legacy blocks and added a regression test to prevent unscoped private-data reads from returning. | `src/webServer.js`, `test/localServerSafety.test.js` |
| Auth regression coverage | Token parsing and server-owned identity resolution were not directly tested. | Added tests proving `userId` comes from the verified Google token, invalid tokens fail closed, and response envelopes stay stable. | `test/authSession.test.js` |
| Study route duplication | Study stats/history/task/summary calculations were repeated in Vercel and local routes, and local `/api/summary/all` still called the legacy summary generator with a `userId` string. | Added `src/services/studyService.js`, wired shared retention/history/task/summary helpers into both route surfaces, and added focused service tests. | `src/services/studyService.js`, `api/router.js`, `src/webServer.js`, `test/studyService.test.js` |

## 2026-05-14 Upgrade Pass

| Area | Finding | Fix Applied | Files |
|---|---|---|---|
| Career dashboard | Command-center logic was embedded in the profile renderer and could not be reused by API tests. | Added a shared career-intelligence helper and dashboard summary service, then surfaced Today Command Center, Next 7 Days Plan, and track-level roadmap cards with real local/user data and empty-safe fallbacks. | `src/data/careerIntelligence.js`, `src/services/dashboardSummary.js`, `src/components.js`, `src/styles/career-upgrades.css` |
| Job Radar freshness | Cards were sorted mostly by local merge behavior and did not show whether a role was fresh, updated, stale, or incomplete. | Added newest-first sorting helpers, freshness badges, source health metrics, and expanded filters for remote/Pune/India/fresh/resume-ready/follow-up. | `app.js`, `src/components.js`, `pages/job_radar.html`, `src/data/careerIntelligence.js` |
| Activity log exposure risk | The activity log DOM is global, so renderer calls from non-radar tabs could repopulate hidden log content. | Hardened `renderLog()` to close/hide the panel unless Job Radar is active and escaped log text before rendering. | `src/components.js` |
| Interview mode persistence | AI interview sessions were chat-only and did not persist user attempts. | Added role/company/topic setup, finish-and-save action, user-scoped local fallback, cloud `/api/mock-interview/session` persistence, and a mock interview history panel. | `pages/ai_interview.html`, `app.js`, `api/router.js`, `src/webServer.js`, `src/models/models.js` |
| Code practice custom files | Single-file practice existed but custom attempts stayed local-only. | Added richer structure/syntax/accessibility/security/best-practice result cards and allowed custom single-file attempts to persist through the existing code-practice endpoint. | `code-practice.js`, `api/router.js`, `src/webServer.js`, `src/styles/career-upgrades.css` |
| Release intelligence | Release cards lacked a structured study-action mapping. | Added Admin/Developer/Agentforce/Data Cloud/Security/Flow study-action cards and a `/api/releases/study-actions` endpoint. | `src/components.js`, `api/router.js`, `src/webServer.js`, `src/services/dashboardSummary.js` |
| User data model | New upgrade entities were not explicitly represented on the profile model. | Added profile fields for `questionAttempts`, `mockInterviewSessions`, `releaseStudyActions`, `dailyStudyPlan`, `userSettings`, and `notes`. | `src/models/models.js` |

## Current App Structure

- `index.html` is the SPA shell and loads global scripts/styles directly.
- `app.js` owns most frontend behavior: navigation, profile dashboard, study tracking, job radar, release center, and page switching.
- `styles.css` owns the global design system and shared component styling.
- `responsive.css` owns broad responsive breakpoints.
- `src/styles/navigation.css` owns the config-driven sidebar, hamburger drawer, accordion groups, and collapsed-sidebar states.
- `src/styles/job-radar.css` owns the job radar dashboard layout.
- `src/data/navigation.js` is the typed navigation/menu configuration.
- `src/data/salesforceContent.js` is the structured Salesforce interview content bank.
- `src/data/studyAnalytics.js` owns reusable study totals, course-target, suggestion, tracker-row, and history-analytics calculations.
- `api/router.js` is the Vercel serverless API router.
- `src/webServer.js` is the local development server.
- `test/` uses Node's built-in test runner.

## Bugs Found And Fixed In This Pass

| Area | Root Cause | Fix Applied | Files |
|---|---|---|---|
| Sidebar accordion state | Search reset could leave DOM groups visually open without the active section owning the accordion state. | Search clear now restores the active navigation item and group state without forced scrolling. | `app.js` |
| Sidebar search filtering | Filtered sections were setting `hidden`/`aria-expanded`, but not the new visual `is-open` / `is-closed` classes. | Search results now synchronize class state with accessibility state. | `app.js` |
| Sidebar CSS ownership | A legacy desktop-collapse block remained in `styles.css` while the modern sidebar was controlled from `src/styles/navigation.css`, creating override risk. | Moved the remaining needed collapsed width/transition rules into `src/styles/navigation.css` and removed the stale duplicate block from `styles.css`. | `styles.css`, `src/styles/navigation.css` |
| Cache-busted assets | Browser could keep using older sidebar CSS/JS after fixes. | Updated the navigation stylesheet and app script query versions. | `index.html` |
| Quality checks | Syntax checks existed only as manual one-off commands. | Added `npm run check:syntax` and `npm run quality` so all JS files can be validated consistently. | `package.json`, `src/tools/checkSyntax.js` |
| API health regression coverage | Public/private route behavior was manually checked but not repeatable. | Added `npm run api:verify` to confirm health/code-practice public access and 401 responses for critical private user routes without auth. | `package.json`, `src/tools/verifyApiHealth.js`, `test/apiHealthTool.test.js` |
| Missing CSP header | Vercel had security headers but no Content Security Policy. | Added a compatibility CSP that supports Google Sign-In, Google Fonts, profile images, and the current code-practice runner while blocking object embeds and limiting base/frame behavior. | `vercel.json`, `test/vercelHeaders.test.js` |
| No API burst guard | Public and private API routes had no rate-limit protection before database/auth work. | Added a dependency-free per-instance limiter with `X-RateLimit-*` and `Retry-After` headers, plus tests. | `api/router.js`, `src/api/rateLimit.js`, `test/rateLimit.test.js` |
| Google Client ID hardcoded in HTML | `index.html` embedded one project-specific OAuth client ID, making Vercel environment changes brittle. | Added `/api/client-config`, initializes Google Sign-In from runtime config, and added regression coverage to keep the static shell free of hardcoded client IDs. | `index.html`, `api/router.js`, `src/webServer.js`, `src/api/radarContract.js`, `test/apiHealthTool.test.js`, `test/vercelRadarContract.test.js` |
| Request bodies not centrally sanitized | Vercel and local API paths parsed JSON in multiple places, leaving inconsistent protection and one unused helper block. | Added a shared request sanitizer, wired Vercel/local body parsing through it, removed unused router-only validation code, and added prototype-pollution/string-cap tests. | `src/api/requestSanitizer.js`, `api/router.js`, `src/webServer.js`, `test/requestSanitizer.test.js` |
| Loading states inconsistent | Some async sections still displayed plain loading text even though skeleton utilities existed. | Replaced key release, code-practice, leaderboard, and daily schedule placeholders with skeleton/spinner states. | `index.html`, `app.js` |
| Study analytics coupled to SPA shell | Study totals, course targets, suggestions, tracker chart rows, and history analytics were embedded in `app.js`, making regression tests difficult. | Extracted the calculations into `src/data/studyAnalytics.js`, wired the tracker/history UI to the shared module, and added focused Node tests. | `src/data/studyAnalytics.js`, `app.js`, `index.html`, `test/studyAnalytics.test.js` |
| Mobile header width warning | The responsive verifier reported a small 320px/390px header side-zone scroll-width mismatch. | Set mobile header side zones and the narrow header grid track to a real 44px minimum so layout width and touch target width agree. | `styles.css`, `responsive.css` |
| Theme shell defaulted to broken light UI | The token layer made `:root` inherit light colors, and both `index.html` and `app.js` bound the same theme button, causing inconsistent/double toggles. | Restored dark as the default app theme, added a versioned `sfjr_theme_v2` preference, guarded the click binding, and kept light mode explicit. | `styles.css`, `index.html`, `app.js`, `test/themeShell.test.js` |

## Large-File Review

The app still has several legacy monoliths. Safe splits completed so far include sidebar CSS ownership and the study analytics calculation layer. Larger JavaScript splits should still be done feature-by-feature with tests because `app.js` has shared global state across dashboard, job radar, study tracker, releases, and navigation.

| File | Current Risk | Recommendation |
|---|---|---|
| `app.js` | 6000+ lines, many shared globals, hard to reason about side effects. | Split by feature into navigation shell, user state, job radar, study tracker, releases, and profile modules after adding browser smoke tests. |
| `styles.css` | Still 5000+ lines, but reduced by removing stale sidebar collapse code. | Continue moving feature-owned styles into `src/styles/*.css`. |
| `src/styles/job-radar.css` | 3600+ lines dedicated to one complex dashboard. | Split into board layout, cards, activity log, responsive, and print/accessibility sections after visual regression checks. |
| `src/run.js` | 3000+ lines agent runtime. | Split provider clients, job normalization, notification dispatch, and orchestration. |
| `api/router.js` | 1700+ lines serverless router. | Move validation, auth/session, jobs, profile, releases, and study APIs into route services. |
| `code-practice.js` | 1600+ lines. | Split single-file practice, challenge bank rendering, evaluator UI, and persistence. |

## User Data Isolation Findings

- The current direction is user-scoped: local browser keys use `sfjr:${userId}:...`, and tests cover user-specific localStorage behavior.
- Public job feeds are treated as shared recommendations; private user actions such as status, notes, saved/applied state, activity logs, and analytics must remain per user.
- API routes must continue deriving identity from the authenticated token and must not trust `userId` from client bodies.
- Remaining production risk: full route-level ownership tests are not yet exhaustive across every API mutation.

## UI And Accessibility Notes

- Sidebar top-level groups are semantic buttons with `aria-expanded` and controlled panels.
- Collapsed desktop sidebar now shows icons only without old text leakage.
- Mobile drawer behavior should be verified after each sidebar change: overlay close, Escape close, body scroll lock, and focus return.
- The activity log and job radar overlay fixes from the previous pass should remain isolated in feature styles, not in global sidebar styles.

## Verification Steps

- `npm run check:syntax` — passed for 102 JavaScript files.
- `npm test` — passed 70/70 tests.
- `npm run responsive:verify` — passed mobile 320/390/430, tablet 768/1024, and desktop 1365/1440 checks with no horizontal document overflow, no console errors, valid 320px login fit, valid mobile drawer open/Escape close, 44px mobile touch targets, Job Radar flyout/search/filter/pagination checks, valid mobile Job Radar status selector, and 80px desktop collapsed sidebar.
- `npm run api:verify` — verifies `GET /api/health`, `GET /api/code-practice/challenges`, `GET /api/client-config`, and unauthenticated 401 protection for sampled private job, profile, study, scan, save, and status routes.
- Vercel header tests — verify the global Content Security Policy includes required Google/auth/font/profile-image allowances and blocks object embeds.
- Rate-limit tests — verify normal public traffic is allowed, bursts are blocked, and windows reset.
- Request sanitizer tests — verify dangerous keys are dropped, code-shaped text is preserved, and extreme payloads are capped.
- Study analytics tests — verify current-user totals, live session time, suggestion models, and history chart aggregation.
- Theme shell tests — verify the app defaults to dark mode and binds the theme toggle only once.
- `npm run release:pulse` — synced Summer '26 release center items with expected local Supabase fallback warning.
- Browser check at `http://127.0.0.1:3000/?verify=sidebar-control` — verified desktop expanded sidebar, one-open accordion behavior, collapsed 80px icon-only sidebar, mobile drawer open/close, body scroll lock, overlay visibility, and no horizontal overflow at desktop/tablet/mobile widths.

## Remaining Risks

- No bundler/build step means there is no automatic tree shaking or CSS pruning.
- No lint script exists yet; adding ESLint should be a separate pass because the legacy app will need staged rule adoption.
- Several files remain intentionally large until feature boundaries can be split safely with visual and API regression coverage.
- Google Client ID now loads from `/api/client-config`; it remains public browser configuration but is no longer hardcoded into `index.html`.
