---
phase: 05-social-feed-realtime
plan: 02
subsystem: realtime-notifications
tags: [websocket, redis-pubsub, push-notifications, fcm, bullmq, batching, device-tokens]
requires:
  - phase-01 (data model: users, checkins, events, venues, user_followers tables)
  - phase-03 (check-in flow: createEventCheckin, createCheckin methods)
  - phase-04 (badge engine: badgeQueue/badgeWorker pattern)
provides:
  - Redis Pub/Sub WebSocket fan-out for real-time check-in events
  - Same-event detection with 'same_event_checkin' WebSocket event
  - PushNotificationService with FCM multicast and stale token cleanup
  - BullMQ notification batching queue and worker (2-minute window)
  - device_tokens table and registration endpoint
  - createPubSubConnection() factory for dedicated subscriber connections
affects:
  - phase-05-plan-03 (mobile feed: needs new_checkin and same_event_checkin WebSocket handlers)
  - future phases (push notification service is reusable for any feature needing FCM delivery)
tech-stack:
  added: [firebase-admin]
  patterns: [redis-pubsub-fanout, bullmq-delayed-dedup-batching, fire-and-forget-hooks]
key-files:
  created:
    - backend/migrations/021_add-device-tokens.ts
    - backend/src/services/PushNotificationService.ts
    - backend/src/jobs/notificationQueue.ts
    - backend/src/jobs/notificationWorker.ts
  modified:
    - backend/src/config/redis.ts
    - backend/src/utils/websocket.ts
    - backend/src/services/CheckinService.ts
    - backend/src/routes/userRoutes.ts
    - backend/src/index.ts
    - backend/package.json
key-decisions:
  - Dedicated Pub/Sub subscriber connection (ioredis subscriber mode blocks regular commands)
  - Same-event detection uses existing WebSocket room membership (event:${eventId})
  - Notification batching uses Redis lists + BullMQ delayed jobs with jobId dedup
  - PushNotificationService uses dynamic require for firebase-admin (graceful degradation)
  - publishCheckinAndNotify combines Pub/Sub publish + notification enqueue in single method
duration: 7 min
completed: 2026-02-03
---

# Phase 5 Plan 2: Real-time Notifications & WebSocket Fan-out Summary

Redis Pub/Sub WebSocket fan-out with same-event detection, FCM push notifications via firebase-admin with 2-minute BullMQ batching, and device token management endpoint.

## Performance

- Total duration: ~7 minutes
- Task 1 (Pub/Sub + WebSocket + publish hook): ~4 minutes
- Task 2 (FCM service + batching + migration + endpoints): ~3 minutes
- TypeScript compilation: clean on both tasks

## Accomplishments

1. **Redis Pub/Sub connection factory** - Added `createPubSubConnection()` to redis.ts, producing dedicated ioredis connections for subscriber mode (separate from cache/rate-limiter connections).

2. **WebSocket Pub/Sub fan-out** - WebSocket server subscribes to `checkin:new` Redis channel on init. `handleCheckinPubSub()` fans out events to each follower's WebSocket connections across all server instances.

3. **Same-event detection** - When a follower is in the `event:${eventId}` WebSocket room, they receive `same_event_checkin` instead of `new_checkin`, enabling the "Alex is here too!" FOMO feature.

4. **CheckinService publish hook** - `publishCheckinAndNotify()` queries followers once, publishes to Pub/Sub for WebSocket fan-out, AND enqueues batched push notifications for each follower. Added to both `createEventCheckin` and legacy `createCheckin`.

5. **PushNotificationService** - Firebase Admin SDK integration with `sendEachForMulticast()` for FCM delivery. Automatically cleans up stale tokens on `messaging/registration-token-not-registered` errors. Gracefully degrades when `FIREBASE_SERVICE_ACCOUNT_JSON` is not set.

6. **Notification batching** - BullMQ queue + worker with 2-minute delayed jobs and `jobId` dedup per user. Worker reads Redis list (`notif:batch:${userId}`), sends either direct FOMO notification (1 item) or summary (multiple items).

7. **Device token endpoint** - `POST /api/users/device-token` (register/upsert) and `DELETE /api/users/device-token` (remove). Platform validation, authentication required.

8. **Migration 021** - `device_tokens` table with uuid PK, user_id FK, token, platform, timestamps, unique constraint on (user_id, token).

9. **App startup integration** - Notification worker starts alongside badge eval and event sync workers, with graceful shutdown on SIGTERM/SIGINT.

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Redis Pub/Sub, WebSocket fan-out, check-in publish hook | `7dbf54d` | redis.ts, websocket.ts, CheckinService.ts |
| 2 | Push notifications, batching queue/worker, device token endpoint | `73a8171` | migration 021, PushNotificationService, notificationQueue/Worker, userRoutes, index.ts |

## Files Created

| File | Purpose |
|------|---------|
| `backend/migrations/021_add-device-tokens.ts` | FCM device token storage table |
| `backend/src/services/PushNotificationService.ts` | FCM sending, token management, stale cleanup |
| `backend/src/jobs/notificationQueue.ts` | BullMQ queue for batched push notifications |
| `backend/src/jobs/notificationWorker.ts` | BullMQ worker processes 2-min batched notifications |

## Files Modified

| File | Changes |
|------|---------|
| `backend/src/config/redis.ts` | Added `createPubSubConnection()` factory |
| `backend/src/utils/websocket.ts` | Added subscriber field, Pub/Sub init, handleCheckinPubSub, same-event detection, SAME_EVENT_CHECKIN event |
| `backend/src/services/CheckinService.ts` | Added `publishCheckinAndNotify()`, notification batch enqueue, getRedis + notificationQueue imports |
| `backend/src/routes/userRoutes.ts` | Added POST/DELETE /api/users/device-token endpoints |
| `backend/src/index.ts` | Integrated notification worker startup and graceful shutdown |
| `backend/package.json` | Added firebase-admin dependency |

## Decisions Made

1. **Dedicated Pub/Sub connection** - ioredis enters subscriber mode after `.subscribe()`, blocking all other commands. A dedicated connection via `createPubSubConnection()` keeps cache/rate-limiter connections unaffected.

2. **Same-event detection via WebSocket rooms** - Rather than querying the database, we check if the follower is in the `event:${eventId}` room (which the mobile app joins on check-in). This is O(1) per follower and avoids DB round trips.

3. **Combined publishCheckinAndNotify method** - Instead of separate Pub/Sub publish and notification enqueue methods that each query followers, a single method queries once and does both. Eliminates duplicate DB queries.

4. **Dynamic require for firebase-admin** - Using `require('firebase-admin')` instead of static import allows graceful degradation at module load time. If `FIREBASE_SERVICE_ACCOUNT_JSON` is missing, the service no-ops all methods.

5. **BullMQ jobId dedup for batching** - `jobId: notif-batch:${followerId}` ensures only one delayed job per user per batching window. Second check-in within 2 minutes adds to the Redis list but doesn't create a duplicate job.

## Deviations from Plan

None -- plan executed exactly as written. Plan 01 had already committed its cache invalidation changes to CheckinService.ts, so the Pub/Sub publish and notification enqueue were added additively after the cache invalidation call, as the parallel execution note specified.

## Issues Encountered

None. TypeScript compiled cleanly on both task completions.

## Next Phase Readiness

**For Plan 03 (mobile feed UI):**
- WebSocket events `new_checkin` and `same_event_checkin` are ready for mobile client consumption
- Device token endpoint at `POST /api/users/device-token` is ready for mobile FCM integration
- All backend real-time infrastructure is in place

**User setup required:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` env var must be set for push notifications to work
- Firebase Cloud Messaging must be enabled in the Firebase project
