---
phase: 10-viral-growth-engine
plan: 02
subsystem: api
tags: [satori, resvg-js, og-image, share-cards, social-sharing, landing-page]

# Dependency graph
requires:
  - phase: 09-trust-safety
    provides: "R2Service for file uploads, CheckinService, BadgeService"
provides:
  - "ShareCardService with OG and Stories image generation pipeline"
  - "Check-in and badge card Satori templates"
  - "Public share landing pages with OG meta tags at /share/c/ and /share/b/"
  - "ShareController with authenticated card generation and public landing endpoints"
  - "R2Service.uploadBuffer for direct server-side file uploads"
affects: [10-viral-growth-engine, share-links, deep-linking]

# Tech tracking
tech-stack:
  added: [satori, "@resvg/resvg-js", Inter-Bold.ttf]
  patterns: [satori-element-objects, server-side-image-generation, dual-router-export]

key-files:
  created:
    - backend/src/services/ShareCardService.ts
    - backend/src/templates/share-cards/checkin-card.ts
    - backend/src/templates/share-cards/badge-card.ts
    - backend/src/templates/share-cards/landing-page.html
    - backend/src/controllers/ShareController.ts
    - backend/src/routes/shareRoutes.ts
    - backend/src/fonts/Inter-Bold.ttf
  modified:
    - backend/src/services/R2Service.ts
    - backend/src/index.ts
    - backend/package.json

key-decisions:
  - "Used plain TS objects instead of JSX/TSX to avoid adding React as a dependency for card templates"
  - "Dual router export pattern (api + public) for shareRoutes to separate auth boundaries"
  - "Content-addressable R2 keys with timestamp suffix to avoid OG image cache staleness"

patterns-established:
  - "Satori element objects: plain { type, props, children } objects instead of JSX for server-side image generation"
  - "Dual router export: routes file exports { api, public } for mixed-auth route sets"
  - "Landing page template: HTML with {{TOKEN}} placeholders + escapeHtml for XSS safety"

requirements-completed: [SHARE-01, SHARE-04]

# Metrics
duration: 5min
completed: 2026-02-27
---

# Phase 10 Plan 02: Share Card Generation Summary

**Server-side share card image pipeline using satori + resvg-js with OG/Stories variants, R2 upload, and public landing pages with OG meta tags**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-28T02:24:24Z
- **Completed:** 2026-02-28T02:30:19Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Complete image generation pipeline: Satori JSX-like elements to SVG to PNG via resvg-js, uploaded to R2
- Two card types (check-in and badge) each with two variants (1200x630 OG and 1080x1920 Stories)
- Public landing pages at /share/c/:id and /share/b/:id with correct OG/Twitter meta tags for social previews
- XSS-safe HTML rendering with escapeHtml for all user-generated content

## Task Commits

Each task was committed atomically:

1. **Task 1: Install satori + resvg-js, create ShareCardService and card templates** - `540363d` (feat)
2. **Task 2: ShareController, routes, landing page, and route mounting** - `7dc89cc` (feat)

## Files Created/Modified
- `backend/src/services/ShareCardService.ts` - Satori + resvg-js card generation pipeline with R2 upload
- `backend/src/templates/share-cards/checkin-card.ts` - Check-in card templates (OG + Stories) using Satori elements
- `backend/src/templates/share-cards/badge-card.ts` - Badge unlock card templates (OG + Stories) using Satori elements
- `backend/src/templates/share-cards/landing-page.html` - HTML landing page template with OG meta tags and store CTAs
- `backend/src/controllers/ShareController.ts` - Card generation endpoints and public landing page handlers
- `backend/src/routes/shareRoutes.ts` - Dual router export (api with auth, public without)
- `backend/src/fonts/Inter-Bold.ttf` - Inter Bold font for consistent card rendering
- `backend/src/services/R2Service.ts` - Added uploadBuffer method for server-side uploads
- `backend/src/index.ts` - Mounted share API and public landing page routes
- `backend/package.json` - Added satori and @resvg/resvg-js dependencies

## Decisions Made
- **Plain TS objects instead of JSX:** Used `{ type, props, children }` element objects compatible with satori instead of `.tsx` files. This avoids adding React as a dependency just for card templates, keeps tsconfig simpler, and is the idiomatic approach for satori without React.
- **Dual router export pattern:** shareRoutes exports `{ api, public }` routers. API routes under `/api/share/*` require auth; public routes under `/share/*` have no auth (needed for social platform crawlers).
- **Timestamp-based R2 keys:** Card image paths include a timestamp (`cards/checkin/${id}-${ts}-og.png`) to prevent OG image caching issues when cards are regenerated.
- **Dynamic badge award lookup:** Badge landing pages query user_badges directly with a JOIN to avoid requiring a userId (public pages have no auth context).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used .ts files instead of .tsx for card templates**
- **Found during:** Task 1
- **Issue:** tsconfig.json has no JSX configuration (no `jsx` compiler option). Creating .tsx files would require either adding React as a dependency or modifying tsconfig, both adding unnecessary complexity.
- **Fix:** Created .ts files that return satori-compatible plain element objects. Same runtime behavior, no JSX compilation needed.
- **Files modified:** checkin-card.ts, badge-card.ts (created as .ts instead of .tsx)
- **Verification:** TypeScript compiles cleanly with `npx tsc --noEmit`
- **Committed in:** 540363d (Task 1 commit)

**2. [Rule 1 - Bug] Fixed ArrayBuffer type incompatibility**
- **Found during:** Task 1
- **Issue:** `Buffer.prototype.buffer.slice()` returns `ArrayBuffer | SharedArrayBuffer` but satori's font data parameter expects `ArrayBuffer`. TypeScript correctly flagged type mismatch.
- **Fix:** Used `new Uint8Array(fontData).buffer` to get a clean ArrayBuffer copy.
- **Files modified:** backend/src/services/ShareCardService.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 540363d (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep. Functional behavior identical to plan intent.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no new external service configuration required. Existing R2 credentials (if configured) are reused. APP_STORE_URL and PLAY_STORE_URL env vars are optional (fallback to '#' placeholder).

## Next Phase Readiness
- Share card generation pipeline is complete and ready for mobile app integration
- Deep linking from landing pages to the app can be added in a future plan
- Card caching/memoization could be added if generation becomes a performance concern

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (540363d, 7dc89cc) verified in git log.

---
*Phase: 10-viral-growth-engine*
*Completed: 2026-02-27*
