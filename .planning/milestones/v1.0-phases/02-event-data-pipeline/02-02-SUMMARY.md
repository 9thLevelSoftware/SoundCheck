---
phase: 02-event-data-pipeline
plan: 02
subsystem: event-sync-pipeline
tags: [bullmq, event-sync, orchestrator, worker, scheduler, upsert, dedup]
dependency-graph:
  requires: [02-01]
  provides: [event-sync-service, bullmq-worker, sync-scheduler, app-startup-integration]
  affects: [02-03]
tech-stack:
  added: []
  patterns: [sync-orchestrator, bullmq-repeatable-jobs, upsert-dedup, status-change-notification]
key-files:
  created:
    - backend/src/services/EventSyncService.ts
    - backend/src/jobs/queue.ts
    - backend/src/jobs/eventSyncWorker.ts
    - backend/src/jobs/syncScheduler.ts
  modified:
    - backend/src/index.ts
decisions:
  - id: 02-02-01
    decision: "EventSyncService creates TicketmasterAdapter in constructor with graceful flag if API key missing"
    rationale: "Allows the service to be instantiated safely in any environment without throwing"
  - id: 02-02-02
    decision: "BullMQ queue exports null when REDIS_URL unavailable, all consumers guard against null"
    rationale: "Consistent graceful degradation pattern matching existing redisRateLimiter.ts approach"
metrics:
  duration: 4 min
  completed: 2026-02-03
---

# Phase 2 Plan 2: EventSyncService Orchestrator and BullMQ Job Infrastructure Summary

EventSyncService orchestrates full Ticketmaster event ingestion (fetch->dedup->match->upsert->log) with per-event/per-region error isolation. BullMQ queue/worker/scheduler provides persistent 4-hour repeatable sync and daily cancellation check, wired into app startup with graceful shutdown.

## What Was Done

### Task 1: EventSyncService Orchestrator (466 lines)
- Created `EventSyncService` with `runSync(regionId?)` as core method
- Pipeline: load sync regions -> fetch events per region -> resolve venues via BandMatcher -> resolve bands via BandMatcher -> UPSERT events on `(source, external_id)` -> UPSERT lineup entries -> detect status changes -> log sync run
- Event deduplication via `INSERT ... ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO UPDATE` with `(xmax = 0)` to detect insert vs update
- Status change detection: queries existing event status before upsert, notifies checked-in users when status changes to cancelled/rescheduled
- `ingestSingleEvent(tmEvent)` for on-demand lookups (Plan 03 integration point)
- `handleStatusChange()` creates notifications for affected users following NotificationService INSERT pattern
- Per-event try/catch prevents one bad event from killing sync; per-region try/catch prevents one failed region from stopping others
- Graceful degradation: returns immediately if TICKETMASTER_API_KEY not set
- Sync runs logged to `event_sync_log` with counters (events_created, events_updated, events_skipped, bands_created, bands_matched, venues_created)

### Task 2: BullMQ Queue, Worker, Scheduler, and App Startup
- `queue.ts` (55 lines): BullMQ Queue with exponential backoff retry (3 attempts, 5s/10s/20s), keeps last 100 completed / 200 failed jobs. Exports null if REDIS_URL not set.
- `eventSyncWorker.ts` (109 lines): Worker with concurrency 1, processes scheduled-sync, check-cancellations, and region-sync job types. Event listeners for completed/failed/error monitoring.
- `syncScheduler.ts` (102 lines): Registers two repeatable jobs:
  - `scheduled-sync`: every 4 hours (`0 */4 * * *`)
  - `check-cancellations`: daily at 6 AM UTC (`0 6 * * *`)
  - `triggerManualSync(regionId?)` for on-demand testing
- `index.ts` modified: imports worker + scheduler, starts worker after `server.listen()`, registers sync jobs, adds `stopEventSyncWorker()` to both SIGTERM and SIGINT handlers

## Decisions Made

1. **Graceful constructor pattern for EventSyncService**: The service sets an `apiKeyConfigured` flag in the constructor rather than throwing. This allows safe instantiation in any environment (tests, dev without TM key, production).

2. **Null queue pattern for BullMQ**: The queue module exports null when REDIS_URL is unavailable. Worker and scheduler check for null before operating. This matches the existing `redisRateLimiter.ts` graceful degradation pattern.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npm run build`: Zero TypeScript errors
- EventSyncService.ts: 466 lines, exports `EventSyncService` class
- queue.ts: 55 lines, exports `eventSyncQueue`
- eventSyncWorker.ts: 109 lines, exports `startEventSyncWorker`, `stopEventSyncWorker`
- syncScheduler.ts: 102 lines, exports `registerSyncJobs`, `triggerManualSync`
- Event upsert uses `ON CONFLICT (source, external_id)` with `DO UPDATE`
- Sync runs logged to `event_sync_log` (4 references)
- `handleStatusChange` present (2 references)
- `ingestSingleEvent` present (1 reference)
- Queue name `event-sync` in queue.ts
- Cron `0 */4 * * *` in syncScheduler.ts
- `registerSyncJobs` and `startEventSyncWorker` in index.ts
- `stopEventSyncWorker` in both SIGTERM and SIGINT handlers

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 59218af | feat(02-02): create EventSyncService sync pipeline orchestrator |
| 2 | a026ba6 | feat(02-02): create BullMQ queue/worker/scheduler and wire into app startup |

## Next Phase Readiness

Plan 02-03 can now proceed. It has:
- EventSyncService with `ingestSingleEvent()` ready for on-demand lookups
- BullMQ infrastructure ready for manual triggers via `triggerManualSync()`
- Full sync pipeline operational for all configured sync regions
- All BullMQ components degrade gracefully without Redis (app starts normally)
- Event deduplication prevents duplicates across sync runs and on-demand ingestion
