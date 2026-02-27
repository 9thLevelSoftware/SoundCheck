---
phase: 04-badge-engine
plan: 02
subsystem: database, api
tags: [badges, seed-data, rarity, rate-limit, anti-farming, jsonb, migrations]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Badge evaluator registry, BadgeService.evaluateAndAward, BullMQ badge queue"
  - phase: 01-01
    provides: "badges and user_badges tables with criteria JSONB column"
provides:
  - "37 badge definitions across 6 categories seeded in database"
  - "GET /api/badges/rarity endpoint with earned_count and rarity_pct"
  - "Daily check-in rate limit middleware (10/day per user)"
  - "user_badges.metadata JSONB column for contextual badge data"
  - "awardBadge writes evaluator metadata to user_badges"
affects: [04-03, 05-social-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anti-farming triple-layer: location verify + daily rate limit + 30s delayed eval"
    - "JSONB metadata column for contextual badge award data"
    - "Named routes before parameterized routes in Express for path conflict prevention"

key-files:
  created:
    - "backend/migrations/018_seed-badge-definitions.ts"
    - "backend/migrations/019_add-user-badges-metadata.ts"
    - "backend/src/middleware/checkinRateLimit.ts"
  modified:
    - "backend/src/controllers/BadgeController.ts"
    - "backend/src/services/BadgeService.ts"
    - "backend/src/routes/badgeRoutes.ts"
    - "backend/src/routes/checkinRoutes.ts"

key-decisions:
  - "Daily check-in rate limit applied to POST /api/checkins (covers both event-first and legacy flows)"
  - "Rate limit middleware fails open on error (allows request through rather than blocking)"
  - "Rarity endpoint is public (no auth required) for discovery/marketing use"
  - "Badge route reorder: named routes (/rarity, /my-badges) before parameterized (/:id) to prevent path conflicts"
  - "awardBadge stores evaluator metadata (e.g. superfan band info) in user_badges.metadata JSONB"

patterns-established:
  - "Seed migration pattern: DELETE existing data, INSERT fresh definitions with gen_random_uuid()"
  - "Anti-farming middleware: database-backed per-user daily count check"

# Metrics
duration: 4min
completed: 2026-02-03
---

# Phase 4 Plan 2: Badge Seed Data, Rarity API, and Anti-Farming Rate Limit Summary

**37 badge definitions seeded across 6 categories, rarity percentage endpoint live, and daily 10-checkin rate limit enforced**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-03T17:26:40Z
- **Completed:** 2026-02-03T17:30:28Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Seeded 37 badge definitions across 6 categories (checkin_count, genre_explorer, unique_venues, superfan, festival_warrior, road_warrior) with JSONB criteria
- Deleted old review-based badge definitions (review_count, venue_explorer, music_lover, event_attendance, helpful_count)
- Added GET /api/badges/rarity endpoint returning earned_count and rarity_pct per badge
- Created dailyCheckinRateLimit middleware enforcing 10 check-ins per user per rolling 24-hour window
- Added user_badges.metadata JSONB column for contextual badge data (superfan band info, etc.)
- Updated awardBadge to persist evaluator metadata through the full evaluation pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed badge definitions and add user_badges metadata column** - `fcf99f3` (feat)
2. **Task 2: Add rarity endpoint, update progress, and daily check-in rate limit** - `19954d0` (feat)

## Files Created/Modified
- `backend/migrations/018_seed-badge-definitions.ts` - Seeds 37 badge definitions across 6 categories, deletes old review-based badges
- `backend/migrations/019_add-user-badges-metadata.ts` - Adds metadata JSONB column to user_badges table
- `backend/src/middleware/checkinRateLimit.ts` - Daily per-user check-in cap (10/day) middleware
- `backend/src/controllers/BadgeController.ts` - Added getBadgeRarity controller method
- `backend/src/services/BadgeService.ts` - Added getBadgeRarity query, updated awardBadge with metadata parameter
- `backend/src/routes/badgeRoutes.ts` - Added /rarity route, reordered routes for path conflict safety
- `backend/src/routes/checkinRoutes.ts` - Wired dailyCheckinRateLimit middleware to POST /

## Decisions Made
- **Rate limit on POST / instead of POST /event:** The checkinRoutes.ts uses a single POST / route that handles both event-first and legacy check-in flows (dispatching internally based on eventId presence). The daily rate limit is applied to this unified route, covering all check-in creation paths.
- **Rate limit fails open:** On database query error, the middleware calls next() rather than blocking the request. Rate limiting should not prevent legitimate check-ins if the count query fails temporarily.
- **Rarity endpoint is public:** No auth required for GET /rarity, enabling use in discovery/marketing contexts and reducing auth overhead for read-only aggregate data.
- **Badge route reorder:** Moved parameterized routes (/:id, /user/:userId) after all named routes (/rarity, /leaderboard, /my-badges, /my-progress, /check-awards) to prevent Express path matching conflicts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied rate limit to POST / instead of POST /event**
- **Found during:** Task 2 (wiring dailyCheckinRateLimit)
- **Issue:** Plan specified `router.post('/event', ...)` but no /event route exists; all check-in creation goes through POST / (which internally delegates to createEventCheckin when eventId is present)
- **Fix:** Applied dailyCheckinRateLimit to existing `router.post('/', ...)` route instead
- **Files modified:** backend/src/routes/checkinRoutes.ts
- **Verification:** TypeScript compiles, middleware correctly positioned after router.use(authenticateToken)
- **Committed in:** 19954d0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Route path corrected to match actual codebase. Same anti-farming protection, correct wiring.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 37 badge definitions in database with JSONB criteria for evaluator dispatch
- Rarity endpoint live for mobile app badge catalog screen
- Badge progress endpoint uses evaluator registry for real-time current/target counts
- All 3 anti-farming layers now active: location verification (Phase 3), daily rate limit (this plan), 30-second delayed eval (Plan 01)
- Ready for 04-03: mobile badge UI and notification display

---
*Phase: 04-badge-engine*
*Completed: 2026-02-03*
