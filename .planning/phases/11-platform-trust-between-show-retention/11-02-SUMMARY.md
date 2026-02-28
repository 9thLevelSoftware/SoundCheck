---
phase: 11-platform-trust-between-show-retention
plan: 02
subsystem: api
tags: [trending, wilson-score, denormalization, feed-optimization, express, postgres]

# Dependency graph
requires:
  - phase: 11-platform-trust-between-show-retention
    provides: wilson_lower_bound SQL function (migration 033), event_rsvps table, toast_count/comment_count columns with triggers, TrendingEvent type
provides:
  - TrendingService with Wilson-scored multi-signal ranking (RSVP, velocity, friend signals, proximity decay)
  - GET /api/trending endpoint with auth and rate limiting
  - Denormalized count queries in FeedService and CheckinQueryService (c.toast_count, c.comment_count)
affects: [11-05-mobile-trending, 11-06-mobile-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [Wilson-scored trending with LATERAL joins and proximity decay, denormalized column reads replacing COUNT(DISTINCT) JOINs]

key-files:
  created:
    - backend/src/services/TrendingService.ts
    - backend/src/controllers/TrendingController.ts
    - backend/src/routes/trendingRoutes.ts
  modified:
    - backend/src/services/FeedService.ts
    - backend/src/services/checkin/CheckinQueryService.ts
    - backend/src/index.ts

key-decisions:
  - "TrendingService uses LATERAL joins for signal computation to avoid correlated subquery performance issues"
  - "Trending score applies proximity decay formula: wilson_result * (1.0 / (1.0 + distance_km / 50.0))"
  - "Feed denormalization removes GROUP BY clauses entirely since no aggregate functions remain"

patterns-established:
  - "Wilson trending pattern: LATERAL joins for rsvp_count, checkin_velocity, friend_signals -> wilson_lower_bound() -> proximity decay -> ORDER BY score DESC"
  - "Denormalized count read pattern: c.toast_count and c.comment_count directly from checkins table, with has_user_toasted still via EXISTS subquery"

requirements-completed: [EVENT-03, EVENT-04, SCALE-02]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 11 Plan 02: Trending Service & Feed Denormalization Summary

**Wilson-scored trending feed with multi-signal composite (RSVP, velocity, friend signals, proximity) at GET /api/trending + all feed queries switched to denormalized toast_count/comment_count columns**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T15:36:59Z
- **Completed:** 2026-02-28T15:39:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built TrendingService with Wilson lower bound scoring combining RSVP count (3x weight), check-in velocity (2x), friend signals (5x), with proximity decay factor
- Created GET /api/trending endpoint with auth middleware, rate limiting (60 req/15min), and lat/lon/radius/days/limit parameters
- Switched all 5 feed queries (FeedService: getFriendsFeed, getEventFeed; CheckinQueryService: getCheckinById, getActivityFeed, getCheckins) from COUNT(DISTINCT) JOINs to denormalized column reads
- Preserved has_user_toasted EXISTS subquery in all queries since it is per-viewer and cannot be denormalized

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TrendingService, Controller, and Routes** - `bfe36d5` (feat)
2. **Task 2: Switch feed queries to denormalized count columns** - `eaed67a` (feat)

## Files Created/Modified
- `backend/src/services/TrendingService.ts` - Wilson-scored trending with LATERAL joins for multi-signal composite, proximity decay, Haversine distance
- `backend/src/controllers/TrendingController.ts` - HTTP handler with lat/lon validation, optional radius/days/limit params
- `backend/src/routes/trendingRoutes.ts` - GET /api/trending with authenticateToken and rateLimit middleware
- `backend/src/index.ts` - Added trending route mount at /api/trending
- `backend/src/services/FeedService.ts` - Switched getFriendsFeed and getEventFeed to c.toast_count/c.comment_count, removed toast/comment JOINs and GROUP BY
- `backend/src/services/checkin/CheckinQueryService.ts` - Switched getCheckinById, getActivityFeed, getCheckins to denormalized columns, removed toast/comment JOINs and GROUP BY

## Decisions Made
- TrendingService uses LATERAL joins for signal computation rather than correlated subqueries -- more explicit, avoids N+1 per-event computation
- Proximity decay uses `1.0 / (1.0 + distance_km / 50.0)` -- events at 50km get ~50% of their raw score, events at 0km get full score
- Feed denormalization removes GROUP BY entirely since there are no remaining aggregate functions -- simpler query plans

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `claimRoutes.ts` (referencing non-existent `getEntityStats` and `respondToReview` methods on ClaimController) -- unrelated to this plan's work. These are from uncommitted claim route files outside this plan's scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TrendingService is ready for mobile consumption (Plan 11-05)
- Feed queries are optimized with denormalized columns -- performance bottleneck resolved
- Wilson scoring function integrates with existing PostgreSQL function from migration 033

## Self-Check: PASSED

All 6 files verified present. Both task commits (bfe36d5, eaed67a) verified in git log.
