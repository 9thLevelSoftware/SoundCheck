---
phase: 05-social-feed-realtime
plan: 01
subsystem: feed-backend
tags: [feed, redis, cursor-pagination, cache, postgresql]
requires:
  - phase-01 (data model: users, checkins, events, venues, user_followers tables)
  - phase-03 (check-in flow: createEventCheckin, createCheckin methods)
  - phase-04 (badge engine: user_badges table for badge earned indicator)
provides:
  - FeedService with 3 feed query methods + unseen counts + mark-read + cache invalidation
  - FeedController with 5 HTTP endpoint handlers
  - feed_read_cursors table for per-user last-read tracking
  - Cache invalidation hook in CheckinService for all check-in creation paths
  - Cursor-based pagination infrastructure (encode/decode helpers)
affects:
  - phase-05-02 (WebSocket real-time will publish to same cache keys)
  - phase-05-03 (mobile feed UI consumes these endpoints)
tech-stack:
  added: []
  patterns: [cache-aside, cursor-pagination, fire-and-forget-invalidation]
key-files:
  created:
    - backend/migrations/020_add-feed-read-cursors.ts
    - backend/src/services/FeedService.ts
    - backend/src/controllers/FeedController.ts
  modified:
    - backend/src/routes/feedRoutes.ts
    - backend/src/services/CheckinService.ts
key-decisions:
  - "Badge earned indicator uses time-proximity heuristic (earned_at within 1min-1hour of created_at) instead of direct FK"
  - "Event feed unseen count returns 0 for global tab (event feeds are per-event, not per-user)"
  - "Happening Now expiry uses COALESCE chain: end_time+1h > start_time+4h > event_date+1day"
  - "Cache invalidation is fire-and-forget with try/catch (never blocks check-in response)"
  - "Backward-compat GET /api/feed/ forwards to getFriendsFeed"
duration: 4 min
completed: 2026-02-03
---

# Phase 5 Plan 1: Feed Backend Service Summary

Redis-cached three-tab feed backend with cursor pagination, unseen count tracking, and fire-and-forget cache invalidation on check-in creation.

## Performance

- Duration: 4 minutes
- Tasks: 2/2 complete
- TypeScript: zero compilation errors

## Accomplishments

1. **Migration 020**: Created `feed_read_cursors` table with uuid PK, user_id FK, feed_type varchar, last_seen_at timestamptz, unique constraint on (user_id, feed_type), and index on user_id.

2. **FeedService** (7 methods + 2 helpers):
   - `getFriendsFeed`: JOIN user_followers for social graph, cursor-based (created_at, id) row-value comparison pagination, includes toast/comment counts, badge earned indicator, has_user_toasted EXISTS check. Redis cache 60s TTL.
   - `getEventFeed`: All check-ins for a specific event with same cursor pattern. Redis cache 60s TTL.
   - `getHappeningNow`: Friends at events today grouped by event via json_agg + GROUP BY. COALESCE expiry strategy for event end_time. Redis cache 30s TTL.
   - `getUnseenCounts`: Per-tab unseen count based on feed_read_cursors last_seen_at.
   - `markFeedRead`: UPSERT to feed_read_cursors.
   - `invalidateUserFeedCache`: Deletes friends + happening_now cache patterns for a user.
   - `invalidateEventFeedCache`: Deletes event feed cache patterns.
   - `encodeCursor`/`decodeCursor`: Base64url JSON cursor encoding.

3. **FeedController** (5 endpoints):
   - GET /friends -- friends feed with cursor pagination
   - GET /events/:eventId -- event feed with cursor pagination
   - GET /happening-now -- grouped happening now
   - GET /unseen -- per-tab unseen counts
   - POST /mark-read -- mark feed tab as read
   - All handlers validate input, clamp limits to 1-50, validate feedType whitelist.

4. **Feed routes**: All 5 new routes + backward-compat GET / forwarding to getFriendsFeed.

5. **CheckinService cache invalidation**: Both `createEventCheckin` and `createCheckin` fire cache invalidation after successful creation. Queries followers, deletes their friends feed + happening_now caches, deletes event feed cache. Fire-and-forget pattern with error logging.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Feed read cursors migration + FeedService | 5207529 | 020_add-feed-read-cursors.ts, FeedService.ts |
| 2 | FeedController, routes, and check-in cache invalidation | 8c42eb2 | FeedController.ts, feedRoutes.ts, CheckinService.ts |

## Files Created

- `backend/migrations/020_add-feed-read-cursors.ts` - Migration creating feed_read_cursors table
- `backend/src/services/FeedService.ts` - Feed query engine with Redis cache and cursor pagination
- `backend/src/controllers/FeedController.ts` - Feed HTTP endpoint handlers

## Files Modified

- `backend/src/routes/feedRoutes.ts` - Replaced single-route file with 5 new routes + backward-compat
- `backend/src/services/CheckinService.ts` - Added cache import and invalidateFeedCachesForCheckin method, hooked into both creation methods

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Badge earned indicator uses time-proximity heuristic | No direct FK between checkin and badge award; time window (earned within 1min-1hr of checkin) is accurate enough for indicator |
| Event feed unseen count returns 0 globally | Event feeds are per-event context; a global "unseen event feed" count isn't meaningful |
| Happening Now expiry: COALESCE(end_time+1h, start_time+4h, event_date+1day) | Aligns with existing time window logic in CheckinService; covers events with/without time data |
| Fire-and-forget cache invalidation | Check-in response must not be blocked by cache ops; errors are logged but non-fatal |
| GET /api/feed/ backward-compat forwards to friends feed | Existing mobile app uses this endpoint; prevents breakage during transition |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Feed endpoints are ready for consumption by mobile UI (Plan 05-03)
- WebSocket integration (Plan 05-02) can publish to the same cache invalidation patterns
- Migration 020 ready for `npm run migrate up` deployment
- No blockers for next plans
