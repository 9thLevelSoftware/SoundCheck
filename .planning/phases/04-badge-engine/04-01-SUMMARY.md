---
phase: 04-badge-engine
plan: 01
subsystem: api
tags: [bullmq, badges, evaluators, websocket, notifications, postgresql, jsonb]

# Dependency graph
requires:
  - phase: 01-data-model-foundation
    provides: badges table with criteria JSONB column, user_badges table, checkins table, event_lineup table
  - phase: 02-event-data-pipeline
    provides: BullMQ queue/worker pattern (queue.ts, eventSyncWorker.ts), Redis config
  - phase: 03-core-check-in-flow
    provides: CheckinService.createEventCheckin(), NotificationService, WebSocket sendToUser
provides:
  - Evaluator registry with 6 parameterized badge evaluator functions
  - Data-driven BadgeService.evaluateAndAward() using JSONB criteria dispatch
  - BullMQ badge-eval queue and worker (async badge evaluation pipeline)
  - Check-in -> badge evaluation wiring (non-fatal, 30s delay)
  - Badge award notification (DB row + WebSocket event)
affects: [04-02 badge seed data, 04-03 mobile badge UI, 05-social-discovery push notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Evaluator registry pattern: Map<string, BadgeEvaluator> for data-driven dispatch"
    - "N+1 optimization: Group badges by criteria.type, run evaluator once per type"
    - "Dual notification: DB row (NotificationService) + WebSocket (sendToUser) for each badge"

key-files:
  created:
    - backend/src/services/BadgeEvaluators.ts
    - backend/src/jobs/badgeQueue.ts
    - backend/src/jobs/badgeWorker.ts
  modified:
    - backend/src/services/BadgeService.ts
    - backend/src/types/index.ts
    - backend/src/services/CheckinService.ts
    - backend/src/index.ts

key-decisions:
  - "Evaluator registry uses Map<string, BadgeEvaluator> for extensible criteria dispatch"
  - "N+1 optimization groups badges by criteria.type, genre_explorer subgroups by genre"
  - "road_warrior uses safe column mapping (whitelist) instead of string interpolation for SQL safety"
  - "Badge eval job has 30s delay for anti-farming and jobId dedup per user+checkin"
  - "Badge worker concurrency 3 (DB-bound, no external API rate limits)"
  - "Notification failure is non-fatal: badge award persists even if notification or WebSocket fails"
  - "user_badges metadata column deferred to plan 02 migration (INSERT omits metadata for now)"

patterns-established:
  - "Evaluator registry pattern for extensible badge criteria evaluation"
  - "Dual notification pattern: NotificationService (DB) + sendToUser (WebSocket)"

# Metrics
duration: 5min
completed: 2026-02-03
---

# Phase 4 Plan 1: Badge Engine Core Summary

**Data-driven badge evaluation pipeline with 6 evaluator functions, BullMQ async queue, and dual notification (DB + WebSocket) on badge award**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-03T17:18:42Z
- **Completed:** 2026-02-03T17:23:42Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created evaluator registry with 6 parameterized evaluator functions (checkin_count, genre_explorer, unique_venues, superfan, festival_warrior, road_warrior)
- Rewrote BadgeService for data-driven evaluation via JSONB criteria dispatch with N+1 optimization
- Created BullMQ badge-eval queue and worker with graceful Redis degradation
- Wired check-in creation to async badge evaluation (30s delay, non-fatal, jobId dedup)
- Badge awards trigger both NotificationService (DB row) and sendToUser (WebSocket event)
- Removed old review-based badge evaluation code (getUserStats, checkBadgeType)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create evaluator registry and rewrite BadgeService** - `a3fdb54` (feat)
2. **Task 2: Create BullMQ badge queue, worker, and wire check-in trigger** - `9f449ce` (feat)

## Files Created/Modified
- `backend/src/services/BadgeEvaluators.ts` - Evaluator registry with 6 parameterized evaluator functions
- `backend/src/services/BadgeService.ts` - Rewritten data-driven badge service using evaluator registry
- `backend/src/jobs/badgeQueue.ts` - BullMQ badge-eval queue with graceful degradation
- `backend/src/jobs/badgeWorker.ts` - BullMQ worker processing badge evaluation jobs at concurrency 3
- `backend/src/services/CheckinService.ts` - Added badge eval enqueue after check-in INSERT
- `backend/src/types/index.ts` - Updated BadgeType enum, added criteria/metadata fields
- `backend/src/index.ts` - Badge worker startup/shutdown alongside event sync worker

## Decisions Made
- Evaluator registry uses Map<string, BadgeEvaluator> for extensible criteria dispatch
- N+1 optimization groups badges by criteria.type; genre_explorer subgroups by genre value
- road_warrior uses safe column mapping (whitelist: 'city' or 'state') instead of string interpolation
- Badge eval job uses 30s delay for anti-farming and jobId dedup (`badge-eval-${userId}-${checkinId}`)
- Badge worker concurrency set to 3 (DB-bound queries, no external API rate limits)
- Notification failure is non-fatal: badge award persists even if notification/WebSocket fails
- user_badges.metadata column deferred to plan 02 migration (INSERT omits metadata for now)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Badge evaluation uses existing Redis (REDIS_URL) which gracefully degrades if not configured.

## Next Phase Readiness
- Badge evaluation pipeline is wired end-to-end: check-in -> BullMQ job -> worker -> evaluators -> award + notification
- Plan 02 (seed data migration) needed next to populate badges table with criteria JSONB for the 6 evaluator types
- Plan 03 (mobile badge UI) depends on badge definitions existing in DB
- Native push notifications (FCM/APNs) explicitly deferred to Phase 5

---
*Phase: 04-badge-engine*
*Completed: 2026-02-03*
