# Salesforce Job Radar Agent Bug And Best-Practices Audit

**Audit date:** 2026-05-08  
**Scope:** local vanilla HTML/CSS/JS app, Vercel API router, local web server, data/content files, tests, and deployment support files.

## Current App Structure

- `index.html` is the SPA shell and loads global scripts/styles directly.
- `app.js` owns most frontend behavior: navigation, profile dashboard, study tracking, job radar, release center, and page switching.
- `styles.css` owns the global design system and shared component styling.
- `responsive.css` owns broad responsive breakpoints.
- `src/styles/navigation.css` owns the config-driven sidebar, hamburger drawer, accordion groups, and collapsed-sidebar states.
- `src/styles/job-radar.css` owns the job radar dashboard layout.
- `src/data/navigation.js` is the typed navigation/menu configuration.
- `src/data/salesforceContent.js` is the structured Salesforce interview content bank.
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

## Large-File Review

The app still has several legacy monoliths. The safe split completed in this pass was CSS ownership for the sidebar. Larger JavaScript splits should be done feature-by-feature with tests because `app.js` has shared global state across dashboard, job radar, study tracker, releases, and navigation.

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

- `npm run check:syntax` — passed for 92 JavaScript files.
- `npm test` — passed 55/55 tests.
- `npm run responsive:verify` — passed mobile 390/430, tablet 768/1024, and desktop 1365/1440 checks with no horizontal document overflow, no console errors, valid mobile drawer open/Escape close, valid mobile Job Radar status selector, and 80px desktop collapsed sidebar.
- `npm run release:pulse` — synced Summer '26 release center items with expected local Supabase fallback warning.
- Browser check at `http://127.0.0.1:3000/?verify=sidebar-control` — verified desktop expanded sidebar, one-open accordion behavior, collapsed 80px icon-only sidebar, mobile drawer open/close, body scroll lock, overlay visibility, and no horizontal overflow at desktop/tablet/mobile widths.

## Remaining Risks

- No bundler/build step means there is no automatic tree shaking or CSS pruning.
- No lint script exists yet; adding ESLint should be a separate pass because the legacy app will need staged rule adoption.
- Several files remain intentionally large until feature boundaries can be split safely with visual and API regression coverage.
- Google Client ID is still documented as a hardcoded frontend limitation and should move to environment-injected config in a production hardening pass.
