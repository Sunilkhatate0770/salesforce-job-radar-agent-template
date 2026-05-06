# Bug Audit - Salesforce Job Radar Agent

Generated: 2026-05-06

## Current App Structure

- Frontend: vanilla HTML/CSS/JavaScript (`index.html`, `app.js`, `styles.css`, `responsive.css`) with page fragments under `pages/`.
- Backend/Vercel: `api/router.js` serves protected API routes on Vercel; `src/webServer.js` serves the local Node app.
- Storage: MongoDB models in `src/models/models.js`, Supabase state/job-alert reads, Turso helper functions, and scoped browser localStorage.
- Auth: Google ID token in `google_auth_token`; private API routes resolve the authenticated Google user and reject missing tokens.
- Tests: Node built-in test runner through `npm test`.

## Bugs Found And Fixes Applied

| Area | Root Cause | Fix Applied | Files |
| --- | --- | --- | --- |
| Hamburger/sidebar content | A long static legacy sidebar was rendered after the dynamic placeholder, leaving fake badges and overloaded sections in the DOM. | Added a typed JS navigation config, hid the legacy DOM from visual and screen-reader output, and render one config-driven menu. | `src/data/navigation.js`, `index.html`, `app.js` |
| Mobile drawer behavior | Overlay used inline click handling; toggle was a `div`; focus and Escape behavior were incomplete. | Converted toggle/close controls to buttons, added aria state, Escape close, outside click close, body scroll lock, focus handoff, and active item scroll. | `index.html`, `app.js`, `styles.css` |
| Fake and duplicate labels | Sidebar used misleading badges like `Live`, `Beta`, `Spring '26`, and retention modal repeated `HARD/GOOD/EASY`. | Removed fake nav badges, use real bookmark/release/question-count badges only, and replaced duplicate confidence helper text. | `src/data/navigation.js`, `index.html`, `app.js` |
| Debug/system text | Footer exposed `SF Prep Agent v1411` and `Industrial Stability Sync` in the main UX. | Replaced with professional product text and moved implementation identity out of primary UX. | `index.html` |
| Empty states | Sidebar showed unsupported `0 Linked` and `No platforms linked yet`. | Replaced with user-specific private import messaging. | `index.html`, `app.js` |
| Hidden modal accessibility | Sync/confidence dialogs lacked complete aria state and focus handling. | Added dialog roles, `aria-modal`, labelled headings, close labels, `aria-hidden` updates, Escape close, and initial focus. | `index.html`, `app.js` |
| User data isolation | Local server read all Mongo job records and leaderboard aggregated all users. | Scoped local Mongo job reads to authenticated user plus explicit `system` public feed; changed leaderboard to current-user summary only. | `src/webServer.js`, `api/router.js` |
| Job uniqueness | `job_hash` was globally unique, so two users could conflict on the same job hash. | Replaced with compound `{ userId, job_hash }` unique sparse index. | `src/models/models.js` |
| Local cache reset | Local study reset wrote global cache files. | Reset now writes user-specific cache files. | `src/webServer.js` |
| Legacy localStorage | Old generic keys could be read by any signed-in browser profile. | Added one-time migration into `sfjr:${userId}:...` keys with a v2 sentinel. | `app.js` |
| Weak Salesforce content | Content depth was spread across many pages and not searchable as one bank. | Added structured Salesforce content bank with required minimum counts and unified search results. | `src/data/salesforceContent.js`, `app.js` |

## Verification Steps

- Run `npm test`.
- Run `node --check` for changed JS files.
- Run `npm run release:pulse`.
- Open the app locally and verify mobile drawer open/close, Escape close, outside click close, menu search, content search, bookmarks, and no horizontal overflow.

## Remaining Risks

- Production-grade isolation still depends on Google auth and correct env configuration on Vercel.
- Existing Mongo deployments may need the old global `job_hash` unique index dropped manually before the new compound index can be created.
- Public/system job feeds are intentionally visible as recommendations; private job notes/statuses remain user-scoped.
- The app still has large legacy `app.js` and CSS files. Further component splitting is recommended for long-term maintainability.
