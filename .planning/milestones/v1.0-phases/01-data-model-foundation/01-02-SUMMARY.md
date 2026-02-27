---
phase: 01-data-model-foundation
plan: 02
subsystem: database
tags: [data-migration, triggers, shows-to-events, checkins-backfill, conditional-ddl, idempotent]

# Dependency graph
requires:
  - phase: 01-data-model-foundation plan 01
    provides: events table, event_lineup table, checkin_band_ratings table, checkins expanded with event_id/venue_rating/review_text/image_urls
provides:
  - Dual-path trigger function (update_user_stats_on_checkin) that works with both legacy and new-style checkins
  - Data migration from shows to events + event_lineup (conditional, idempotent)
  - Checkins backfill for event_id, split ratings, review_text, image_urls (conditional on legacy columns)
  - Notifications show_id to event_id migration (conditional on show_id column)
affects:
  - 01-data-model-foundation plan 03 (contract phase can now safely remove old columns)
  - 02-event-discovery (trigger correctly updates event.total_checkins)
  - 03-checkin-flow (trigger handles event_id path for new checkins)

# Tech tracking
tech-stack:
  added: []
  patterns: [conditional data migration with column existence checks, DO $$ DECLARE pattern for schema-aware migration logic, dual-path trigger functions for expand-contract transitions]

key-files:
  created:
    - backend/migrations/009_expand-update-triggers.ts
    - backend/migrations/010_migrate-shows-to-events.ts
    - backend/migrations/011_migrate-checkins-data.ts
  modified: []

key-decisions:
  - "Conditional column checks in migration 011: production DB checkins table lacks legacy columns (band_id, venue_id, rating, etc.) -- migration detects and skips backfill gracefully"
  - "Shows table absence handled: migration 010 checks for shows table existence before attempting data copy"
  - "Notifications show_id absence handled: migration 010 checks for show_id column before migration"
  - "Dual-path trigger uses UNION to avoid double-counting stats across legacy and new-style data paths"

patterns-established:
  - "Schema-aware data migrations: use DO $$ DECLARE has_column BOOLEAN; BEGIN SELECT EXISTS(...) for column/table existence before DML"
  - "Dual-path trigger pattern: IF NEW.event_id IS NOT NULL for new path, ELSE for legacy path"
  - "Data migration down() as no-op: original columns preserved, backfilled data harmless if reverted"

# Metrics
duration: 5min
completed: 2026-02-02
---

# Phase 1 Plan 2: Data Migration (Shows-to-Events, Checkins Backfill, Triggers) Summary

**Dual-path trigger function + conditional data migrations for shows-to-events and checkins backfill, handling production DB without legacy columns**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-02T23:42:36Z
- **Completed:** 2026-02-02T23:47:13Z
- **Tasks:** 2/2
- **Files created:** 3

## Accomplishments

- Rewrote `update_user_stats_on_checkin()` trigger to dual-path mode: resolves venue/band through events table when event_id is present, falls back to direct columns for legacy rows
- Wrote conditional data migration for shows-to-events (migration 010): copies shows to events, creates event_lineup entries, migrates notifications show_id -- all conditional on table/column existence
- Wrote conditional checkins backfill (migration 011): event_id matching, rating splitting, comment/photo copying -- all conditional on legacy column existence
- All 3 migrations (009-011) applied successfully to Railway database
- Production DB correctly detected as lacking shows table and legacy checkins columns -- all conditional paths gracefully skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Write trigger update migration** - `be1bfd0` (feat)
2. **Task 2: Write and run data migration (shows to events + checkins backfill)** - `baf260e` (feat)

## Files Created

- `backend/migrations/009_expand-update-triggers.ts` - Dual-path trigger function for user/band/venue stats, event total_checkins
- `backend/migrations/010_migrate-shows-to-events.ts` - Conditional shows-to-events copy, event_lineup creation, notifications migration
- `backend/migrations/011_migrate-checkins-data.ts` - Conditional checkins backfill: event_id matching, rating split, comment/photo copy

## Decisions Made

1. **Conditional column existence checks for data migrations**: The production database was set up from the old `migrate-events-model.ts`, which created a checkins table with a fundamentally different schema (no band_id, venue_id, rating, comment, photo_url, event_date columns). Migration 011 was rewritten to use `DO $$ DECLARE has_legacy BOOLEAN; BEGIN SELECT EXISTS(...) INTO has_legacy; IF NOT ... RETURN; END $$;` to detect this state and skip all backfill operations gracefully. This makes the migration correct for BOTH database states (full schema from database-schema.sql AND minimal schema from old migration).

2. **Shows table absence handling**: The shows table was defined in database-schema.sql but never created in production. Migration 010 wraps all shows-related operations in `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shows')` checks.

3. **Notifications show_id absence handling**: The notifications table in production was created by migration 007 (from scratch) which did not include the show_id column. Migration 010 checks for show_id column existence before attempting the show_id-to-event_id migration.

4. **Dual-path trigger uses UNION for stats**: The trigger function uses UNION (not UNION ALL for counts, UNION ALL for averages) to combine data from both legacy paths (direct columns) and new paths (via events/event_lineup joins). This avoids double-counting during the transition period when some rows have both paths populated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] checkins table lacks legacy columns (band_id, venue_id, etc.)**
- **Found during:** Task 2 (first migration run attempt)
- **Issue:** Migration 011 referenced `c.venue_id`, `c.band_id`, `c.event_date`, `c.rating`, `c.comment`, `c.photo_url` -- none of which exist in the production checkins table. The table was created by the old `migrate-events-model.ts` with a different schema: only id, user_id, event_id, venue_rating, band_rating, review_text, image_urls, is_verified, created_at, updated_at.
- **Fix:** Rewrote migration 011 to wrap all SQL in a single `DO $$ DECLARE has_legacy_columns BOOLEAN; BEGIN ... END $$;` block that checks for `band_id` column existence and skips all backfill if absent.
- **Files modified:** `backend/migrations/011_migrate-checkins-data.ts`
- **Verification:** Migration ran successfully, NOTICE emitted: "Checkins table does not have legacy columns -- skipping data backfill"
- **Committed in:** `baf260e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was necessary because the plan assumed the production database had the full schema from database-schema.sql. In reality, the checkins table was created by a different migration script with a different column set. The fix preserves the original migration logic for databases that DO have the full schema while gracefully handling the production state.

## Issues Encountered

- **Production database schema mismatch**: The production checkins table has only 10 columns (missing band_id, venue_id, rating, comment, photo_url, event_date) compared to the 14 columns defined in database-schema.sql. This is because the production database was set up from `migrate-events-model.ts` (not database-schema.sql). All 01-02 migrations handle this via conditional checks.
- **No shows table in production**: The shows table was never created. Migration 010 handles this with table existence checks. Zero shows were migrated (expected).
- **No notifications show_id column**: The notifications table was created by migration 007 from scratch without show_id. Migration 010 handles this with column existence checks.

## User Setup Required

None - all migrations were applied directly to the existing Railway database.

## Next Phase Readiness

- All 11 migrations (001-011) applied successfully
- Trigger function ready for both legacy and new-style checkins
- Data migrations are idempotent and safe to re-run (ON CONFLICT DO NOTHING, WHERE IS NULL guards)
- Ready for Plan 03 (contract phase): old columns can be safely removed once code paths are migrated
- Key concern: The checkins table in production does not have the legacy columns at all -- the contract phase may need to handle this (nothing to contract/remove for columns that don't exist)
- The `band_rating` INTEGER column from the old migration still exists on checkins -- should be addressed in contract phase

---
*Phase: 01-data-model-foundation*
*Completed: 2026-02-02*
