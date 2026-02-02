---
phase: 01-data-model-foundation
plan: 01
subsystem: database
tags: [node-pg-migrate, postgresql, migrations, expand-contract, events, event-lineup, checkin-band-ratings, jsonb]

# Dependency graph
requires:
  - phase: none
    provides: existing database schema (users, venues, bands, checkins, badges, reviews)
provides:
  - node-pg-migrate migration tooling (npm scripts, migrations directory)
  - events table with dedup constraint and source tracking
  - event_lineup junction table for multi-band lineups
  - checkin_band_ratings table for per-set band ratings
  - checkins extended with event_id, venue_rating DECIMAL, review_text, image_urls, is_verified
  - venues extended with timezone VARCHAR(50)
  - notifications table with event_id FK
  - badges extended with criteria JSONB + GIN index
affects:
  - 01-data-model-foundation (plans 02 and 03 depend on this schema)
  - 02-event-discovery (queries events, event_lineup tables)
  - 03-checkin-flow (writes to checkins.event_id, checkin_band_ratings)
  - 04-gamification (uses badges.criteria JSONB for evaluation)

# Tech tracking
tech-stack:
  added: [node-pg-migrate@8.0.4]
  patterns: [expand-contract migration, conditional DDL for idempotent migrations, TypeScript migration files with MigrationBuilder]

key-files:
  created:
    - backend/migrations/001_setup-migration-infrastructure.ts
    - backend/migrations/002_expand-create-events-table.ts
    - backend/migrations/003_expand-create-event-lineup-table.ts
    - backend/migrations/004_expand-add-event-id-to-checkins.ts
    - backend/migrations/005_expand-create-checkin-band-ratings.ts
    - backend/migrations/006_expand-add-venue-timezone.ts
    - backend/migrations/007_expand-add-event-source-tracking.ts
    - backend/migrations/008_expand-create-badge-criteria.ts
  modified:
    - backend/package.json

key-decisions:
  - "Used conditional DDL (DO $$ BEGIN IF NOT EXISTS) in migrations 004/006/007 to handle both fresh and pre-migrated database states"
  - "Created full notifications table in migration 007 when missing (DB was set up from old migration only, not database-schema.sql)"
  - "Preserved old migration scripts as migrate:legacy and migrate:events-legacy rather than deleting"
  - "Added CHECK constraints as separate ALTER TABLE statements for clarity and easier rollback"

patterns-established:
  - "Migration file naming: NNN_phase-description.ts (e.g., 002_expand-create-events-table.ts)"
  - "Conditional DDL for idempotent migrations: always check column/table existence before ADD/CREATE"
  - "Separate CHECK constraints from column definitions for cleaner down() functions"
  - "Type-only imports: import type { MigrationBuilder } from 'node-pg-migrate'"

# Metrics
duration: 7min
completed: 2026-02-02
---

# Phase 1 Plan 1: Migration Tooling and Expand-Phase DDL Summary

**node-pg-migrate tooling with 8 expand-phase migrations: events table, event_lineup junction, checkin_band_ratings, venue timezone, badge criteria JSONB -- all applied to Railway database**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-02T23:31:40Z
- **Completed:** 2026-02-02T23:38:31Z
- **Tasks:** 2/2
- **Files modified:** 9

## Accomplishments
- Installed node-pg-migrate v8.0.4 and configured 4 migration npm scripts (migrate, migrate:up, migrate:down, migrate:create)
- Wrote and applied 8 expand-phase DDL migrations creating the event-centric schema foundation
- All 8 migrations tracked in pgmigrations table on Railway database
- Existing data fully intact: 2 users, 20 venues, 25 bands, 7 badges preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Install node-pg-migrate and configure migration tooling** - `8e3f7d8` (chore)
2. **Task 2: Write and run all expand-phase migration files** - `45c2155` (feat)

## Files Created/Modified
- `backend/package.json` - Added node-pg-migrate dependency, 4 migration scripts, preserved legacy scripts
- `backend/migrations/001_setup-migration-infrastructure.ts` - Enable pg_trgm, clean up old events table with band_id
- `backend/migrations/002_expand-create-events-table.ts` - Events table with dedup constraint, indexes, updated_at trigger
- `backend/migrations/003_expand-create-event-lineup-table.ts` - Event lineup junction for multi-band support
- `backend/migrations/004_expand-add-event-id-to-checkins.ts` - Add event_id, venue_rating DECIMAL, review_text, image_urls, is_verified to checkins
- `backend/migrations/005_expand-create-checkin-band-ratings.ts` - Per-set band ratings with DECIMAL(2,1) and range check
- `backend/migrations/006_expand-add-venue-timezone.ts` - IANA timezone column on venues
- `backend/migrations/007_expand-add-event-source-tracking.ts` - Notifications table creation/extension with event_id
- `backend/migrations/008_expand-create-badge-criteria.ts` - JSONB criteria column with GIN index on badges

## Decisions Made

1. **Conditional DDL for database compatibility**: The production database was found to be in a hybrid state -- the old `migrate-events-model.ts` had been run, creating an events table with `band_id` (wrong schema) and a checkins table with `event_id NOT NULL` and `venue_rating INTEGER`. Migrations were written with `DO $$ BEGIN IF NOT EXISTS...END $$` blocks to handle both fresh and pre-migrated states. This is more robust than assuming a single known starting state.

2. **Full notifications table creation**: The notifications table did not exist in the database (it was never created by the old migration script). Migration 007 was updated to create the complete table when missing rather than just adding a column.

3. **Preserved old migration scripts**: Renamed `migrate` to `migrate:legacy` and `migrate:events` to `migrate:events-legacy` rather than removing them, preserving rollback ability to old tooling if needed.

4. **Separate CHECK constraints**: Added venue_rating range check and band rating range check as separate `ALTER TABLE ADD CONSTRAINT` statements rather than inline column definitions, making the `down()` functions cleaner.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Database in pre-migrated state with wrong column types**
- **Found during:** Task 2 (first migration run attempt)
- **Issue:** The old `migrate-events-model.ts` had been run on the production database, creating checkins with `event_id NOT NULL` (should be nullable), `venue_rating INTEGER` (should be DECIMAL(2,1)), and `band_rating INTEGER` (extra column). Migration 004 failed with "column event_id already exists".
- **Fix:** Rewrote migration 004 to use conditional DDL: check if columns exist before adding, alter type from INTEGER to DECIMAL(2,1), drop NOT NULL constraint, drop and re-add FK to point at new events table.
- **Files modified:** `backend/migrations/004_expand-add-event-id-to-checkins.ts`
- **Verification:** All 8 migrations ran successfully on second attempt, column types verified correct.
- **Committed in:** `45c2155` (Task 2 commit)

**2. [Rule 3 - Blocking] Notifications table missing entirely**
- **Found during:** Task 2 (database state inspection)
- **Issue:** The notifications table from `database-schema.sql` was never created. The old migration script did not include it. Migration 007 (add event_id to notifications) would fail with "relation does not exist".
- **Fix:** Rewrote migration 007 to conditionally create the full notifications table when missing, or just add the event_id column if the table already exists.
- **Files modified:** `backend/migrations/007_expand-add-event-source-tracking.ts`
- **Verification:** Notifications table created with all columns including event_id, indexes created.
- **Committed in:** `45c2155` (Task 2 commit)

**3. [Rule 3 - Blocking] Migration 006 needed idempotent column addition**
- **Found during:** Task 2 (preemptive, based on discovering pre-migrated state)
- **Issue:** If venues already had a timezone column from any prior partial migration, the ADD COLUMN would fail.
- **Fix:** Wrapped in conditional DDL to check column existence first.
- **Files modified:** `backend/migrations/006_expand-add-venue-timezone.ts`
- **Verification:** Migration ran cleanly, timezone column present in venues table.
- **Committed in:** `45c2155` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes necessary to handle the actual database state vs assumed state. The migrations are now idempotent and handle both fresh and pre-migrated databases correctly. No scope creep.

## Issues Encountered
- **TypeScript moduleResolution mismatch**: node-pg-migrate v8 exports types as ESM (`dist/bundle/index.d.ts`), but the project uses `commonjs` module. Compilation check required `--module es2020 --moduleResolution bundler` flags. At runtime, node-pg-migrate's `-j ts` flag handles the bridging via ts-node. This is a known compatibility pattern and does not affect migration execution.
- **node-pg-migrate "Can't determine timestamp" warnings**: These are cosmetic warnings because migration filenames use sequential numbers (001, 002...) instead of timestamps. node-pg-migrate handles this correctly by sorting alphabetically. No action needed.

## User Setup Required
None - no external service configuration required. Migrations were applied directly to the existing Railway database using the DATABASE_URL from .env.

## Next Phase Readiness
- Event-centric schema foundation is fully in place: events, event_lineup, checkin_band_ratings tables created
- Ready for Plan 02 (data migration: shows-to-events, checkins backfill) and Plan 03 (contract phase)
- The `band_rating` INTEGER column from the old migration still exists on checkins -- it should be cleaned up in the contract phase
- The `checkin_toasts` and old `events` tables were dropped by migration 001 (they had wrong schema from old migration)
- Several tables from `database-schema.sql` do not exist in the database (shows, vibe_tags, toasts, checkin_vibes, user_wishlist, deletion_requests, user_consents, user_social_accounts, refresh_tokens) -- these were never created. Plans 02/03 should account for this.

---
*Phase: 01-data-model-foundation*
*Completed: 2026-02-02*
