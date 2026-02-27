---
phase: 02-event-data-pipeline
plan: 01
subsystem: event-ingestion
tags: [bullmq, ticketmaster, pg_trgm, redis, migrations, band-matching]
dependency-graph:
  requires: [01-01, 01-02, 01-03]
  provides: [schema-extensions, ticketmaster-adapter, band-matcher, redis-config]
  affects: [02-02, 02-03]
tech-stack:
  added: [bullmq]
  patterns: [adapter-pattern, entity-matching-cascade, pg_trgm-fuzzy, upsert-dedup]
key-files:
  created:
    - backend/src/config/redis.ts
    - backend/src/types/ticketmaster.ts
    - backend/src/services/TicketmasterAdapter.ts
    - backend/src/services/BandMatcher.ts
    - backend/migrations/012_add-venue-external-id.ts
    - backend/migrations/013_add-band-external-id.ts
    - backend/migrations/014_add-event-status-column.ts
    - backend/migrations/015_add-band-trgm-index.ts
    - backend/migrations/016_add-sync-regions-table.ts
    - backend/migrations/017_add-event-sync-log-table.ts
  modified:
    - backend/package.json
    - backend/package-lock.json
decisions:
  - id: 02-01-01
    decision: "Partial unique index (WHERE external_id IS NOT NULL) on venues and bands for source+external_id dedup"
    rationale: "Allows multiple NULL external_ids (user-created/legacy records) while preventing duplicate external IDs from the same source"
  - id: 02-01-02
    decision: "In-memory daily API call counter with midnight UTC reset (not Redis)"
    rationale: "Simple enough for single-process; no need for distributed counter until multi-instance deploys"
  - id: 02-01-03
    decision: "200ms inter-request delay (not BullMQ limiter) for Ticketmaster rate limiting"
    rationale: "TicketmasterAdapter handles per-second limits internally; BullMQ limiter is for job-level rate limiting in 02-02"
metrics:
  duration: 4 min
  completed: 2026-02-03
---

# Phase 2 Plan 1: Schema Extensions, Ticketmaster Adapter, and Band Matcher Summary

BullMQ installed, Redis config provides BullMQ-compatible IORedis connections (maxRetriesPerRequest: null), 6 migrations add external_id columns to venues/bands, status column to events, GIN trgm index on bands.name, sync_regions and event_sync_log tables. TicketmasterAdapter fetches/paginates/normalizes Discovery API v2 responses with rate limit awareness. BandMatcher resolves bands via external_id->exact->fuzzy->create cascade and venues via upsert.

## What Was Done

### Task 1: BullMQ, Redis Config, Ticketmaster Types, 6 Migrations
- Installed BullMQ (only new dependency -- ioredis, axios, pg already present)
- Created `backend/src/config/redis.ts` with `createBullMQConnection()` factory and `getRedisUrl()` helper
- Created `backend/src/types/ticketmaster.ts` with interfaces for TicketmasterEvent, TicketmasterVenue, TicketmasterAttraction, TicketmasterSearchResponse, NormalizedEvent, and TicketmasterSearchParams
- Migration 012: Added external_id + source to venues with partial unique index
- Migration 013: Added external_id + source to bands with partial unique index
- Migration 014: Added status column to events (active/cancelled/postponed/rescheduled) with CHECK constraint and backfill from is_cancelled
- Migration 015: Created GIN trigram index (idx_bands_name_trgm) on bands.name
- Migration 016: Created sync_regions table for geographic coverage tracking
- Migration 017: Created event_sync_log table for sync run history with counters
- All 6 migrations ran successfully against the database

### Task 2: TicketmasterAdapter and BandMatcher Services
- Created `TicketmasterAdapter` (281 lines) with:
  - `searchMusicEvents()` -- search by lat/lon with pagination metadata
  - `fetchAllEventsForRegion()` -- auto-paginates, date-range subdivision for >1000 results
  - `getEventById()` -- single event lookup, 404 returns null
  - `normalizeEvent()` -- converts raw TM response to NormalizedEvent
  - Daily API call tracking (warn at 4500, refuse at 4900, reset at midnight UTC)
  - 200ms delay between API calls (under 5/sec limit)
- Created `BandMatcher` (200 lines) with:
  - `matchOrCreateBand()` -- 4-step cascade: external_id -> exact -> fuzzy (0.8+) -> create
  - `matchOrCreateVenue()` -- upsert via ON CONFLICT for external_id, name+city fallback, or create new
  - Backfills external_id on existing bands/venues when matched by name

## Decisions Made

1. **Partial unique index for dedup columns**: Used `WHERE external_id IS NOT NULL` partial index instead of regular unique constraint. This allows multiple NULL external_ids for user-created/legacy records while preventing duplicate external IDs from the same source.

2. **In-memory daily API call counter**: Tracked daily Ticketmaster API calls with a simple in-memory counter (reset at midnight UTC) rather than Redis INCR. Sufficient for single-process; can be upgraded to Redis in 02-02 if needed for multi-instance.

3. **Separate rate limit strategies**: TicketmasterAdapter uses 200ms delays between requests for per-second limiting. BullMQ worker-level rate limiting (in 02-02) will handle job throughput. These are complementary, not redundant.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npm run build`: Zero TypeScript errors
- `npm run migrate:up`: All 6 migrations applied (012-017), second run reports "No migrations to run"
- `redis.ts` exports `createBullMQConnection` with `maxRetriesPerRequest: null`
- `ticketmaster.ts` exports all 6 type interfaces
- `TicketmasterAdapter.ts`: 281 lines, exports class with all 4 methods
- `BandMatcher.ts`: 200 lines, exports class with `matchOrCreateBand` and `matchOrCreateVenue`
- Key patterns verified: fuzzy threshold 0.8, ON CONFLICT upsert, partial unique index

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 122e3df | feat(02-01): install BullMQ, Redis config, Ticketmaster types, and 6 migrations |
| 2 | 325df52 | feat(02-01): create TicketmasterAdapter and BandMatcher services |

## Next Phase Readiness

Plan 02-02 can now proceed. It has:
- BullMQ installed and Redis config ready for Queue/Worker setup
- TicketmasterAdapter ready for the EventSyncService orchestrator to call
- BandMatcher ready for entity resolution during event ingestion
- sync_regions and event_sync_log tables ready for sync tracking
- All schema extensions (external_id on venues/bands, status on events) in place
