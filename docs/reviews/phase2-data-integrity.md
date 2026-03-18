# Phase 2 Data Integrity Audit -- Findings Report

**Auditor:** Data Integrity Specialist
**Date:** 2026-03-18
**Scope:** Denormalized count triggers, FK coverage, migration rollback safety, seed scripts, schema drift
**Depends on:** Phase 1 findings (`phase1-backend-database.md`) -- DB-001 through DB-022
**Target:** Beta readiness review for ~500--2,000 users

---

## Executive Summary

This audit verifies data integrity guarantees across the SoundCheck database layer: trigger-maintained counters, referential integrity via foreign keys, migration reversibility, seed script correctness, and schema drift between `database-schema.sql` and the migration chain.

The database has **significant data integrity gaps**. The most critical problem is the complete absence of DELETE-side triggers for checkin stat counters (confirming and extending Phase 1 DB-001). Eight tables referenced by production services have no migration and exist only if `database-schema.sql` was run manually. Multiple FK relationships are missing ON DELETE behavior, creating orphan risk. And the seed scripts have inconsistencies that can cause demo environments to diverge from production.

**Totals:** 5 Blocker, 6 High, 7 Medium, 4 Low findings.

---

## Step 1: Denormalized Count Trigger Verification

### Trigger Verification Matrix

| Denormalized Column | Table | INSERT Trigger | DELETE Trigger | UPDATE Trigger | Backfill | Status |
|---|---|---|---|---|---|---|
| `checkins.toast_count` | checkins | Yes (037) | Yes (037) | N/A | Yes (037) | OK |
| `checkins.comment_count` | checkins | Yes (037) | Yes (037) | N/A | Yes (037) | OK |
| `users.total_checkins` | users | Yes (009) | NO | N/A | Yes (040) | BROKEN |
| `users.unique_bands` | users | Yes (009) | NO | N/A | Yes (040) | BROKEN |
| `users.unique_venues` | users | Yes (009) | NO | N/A | Yes (040) | BROKEN |
| `bands.total_checkins` | bands | Yes (009) | NO | N/A | Yes (041) | BROKEN |
| `bands.unique_fans` | bands | Yes (009) | NO | N/A | Yes (041) | BROKEN |
| `bands.average_rating` | bands | Yes (009) | NO | N/A | No | BROKEN |
| `venues.total_checkins` | venues | Yes (009) | NO | N/A | Yes (041) | BROKEN |
| `venues.unique_visitors` | venues | Yes (009) | NO | N/A | Yes (041) | BROKEN |
| `venues.average_rating` | venues | Yes (009) | NO | N/A | No | BROKEN |
| `events.total_checkins` | events | Yes (009) | NO | N/A | No | BROKEN |
| `bands.total_reviews` | bands | None (stale) | None | N/A | No | STALE |
| `venues.total_reviews` | venues | None (stale) | None | N/A | No | STALE |
| `bands.monthly_checkins` | bands | None | None | N/A | No | DEAD |

---

### [DI-001]: Checkin stat counters have no DELETE trigger -- monotonic upward drift
**Severity:** Blocker
**File(s):** `backend/migrations/009_expand-update-triggers.ts:143-147`
**Description:** The `trigger_update_stats_on_checkin` fires `AFTER INSERT ON checkins` only. When `CheckinCreatorService.deleteCheckin()` runs `DELETE FROM checkins WHERE id = $1` (line 245), no trigger fires to decrement `users.total_checkins`, `users.unique_bands`, `users.unique_venues`, `bands.total_checkins`, `bands.unique_fans`, `venues.total_checkins`, `venues.unique_visitors`, or `events.total_checkins`. These counters monotonically increase and never self-correct.
**Evidence:**
```sql
-- Migration 009, line 143-147:
CREATE TRIGGER trigger_update_stats_on_checkin
  AFTER INSERT ON checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_on_checkin();
-- No AFTER DELETE trigger exists anywhere in the 43 migrations
```
```typescript
// CheckinCreatorService.ts:245
await this.db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);
// No manual stat recalculation after delete
```
**Recommended Fix:** Create migration 044 that adds an AFTER DELETE trigger on checkins. The trigger must reverse the INSERT logic: decrement `total_checkins` using `GREATEST(total_checkins - 1, 0)`, and recompute `unique_bands`/`unique_venues`/`unique_fans`/`unique_visitors` for the affected user, band, and venue. The `events.total_checkins` must also be decremented. Use the same dual-path resolution (event_id vs. direct band_id/venue_id) from the INSERT path.

---

### [DI-002]: Checkin stat trigger has no UPDATE handler for event_id, band_id, or venue_id changes
**Severity:** High
**File(s):** `backend/migrations/009_expand-update-triggers.ts:27`
**Description:** The trigger function only handles `TG_OP = 'INSERT'`. If a checkin's `event_id`, `band_id`, or `venue_id` is updated (e.g., via admin correction or reassignment), the old entity's counters are not decremented and the new entity's counters are not incremented. While no current code path updates these columns on an existing checkin, there is no database-level protection against it, and future code could introduce counter drift.
**Evidence:**
```sql
-- Migration 009:27
IF TG_OP = 'INSERT' THEN
  -- All logic here
END IF;
-- No ELSIF TG_OP = 'UPDATE' branch
```
**Recommended Fix:** Add an `ELSIF TG_OP = 'UPDATE'` branch to the trigger function that checks if `OLD.event_id != NEW.event_id` (or band_id/venue_id). If changed, decrement the old entity's stats and increment the new entity's stats. Alternatively, add a CHECK or policy that prevents updates to these columns and forces delete+re-insert.

---

### [DI-003]: average_rating computed in INSERT trigger includes rating=0 rows
**Severity:** High
**File(s):** `backend/migrations/009_expand-update-triggers.ts:88-97`, `backend/migrations/009_expand-update-triggers.ts:114-124`
**Description:** The trigger computes `average_rating` for bands and venues using `AVG(rating)` over all checkins, including rows where `rating = 0` (the default). Since `CheckinCreatorService.createEventCheckin()` inserts `rating = 0` at line 132, every checkin that hasn't been explicitly rated drags the average toward zero. The same issue exists for venue ratings computed via `AVG(venue_rating)` where `venue_rating` can be NULL (correctly excluded) but the `checkins.rating` field is NOT NULL with default 0 (incorrectly included).
**Evidence:**
```sql
-- Migration 009:88-96 (band average_rating):
average_rating = COALESCE(
  (SELECT AVG(rating) FROM (
    SELECT rating FROM checkins
    WHERE band_id = v_band_id AND rating IS NOT NULL
    -- rating=0 is NOT NULL, so it IS included in AVG
    UNION ALL
    SELECT cbr.rating FROM checkin_band_ratings cbr
    WHERE cbr.band_id = v_band_id
  ) sub), 0)
```
```typescript
// CheckinCreatorService.ts:132:
0,  // rating starts at 0, set via PATCH /ratings
```
**Recommended Fix:** Filter out `rating = 0` rows from the AVG computation: `WHERE band_id = v_band_id AND rating IS NOT NULL AND rating > 0`. This aligns with the `checkin_band_ratings` table which has a `CHECK (rating >= 0.5)` constraint. Alternatively, change `checkins.rating` default from `0` to `NULL`.

---

### [DI-004]: Toast and comment count triggers do not handle CASCADE deletes from parent checkin
**Severity:** Medium
**File(s):** `backend/migrations/037_denormalized-count-triggers.ts:25-29`, `backend/migrations/037_denormalized-count-triggers.ts:58-62`
**Description:** When a checkin is deleted, its toasts and comments are CASCADE-deleted. The CASCADE delete fires the `trg_toast_count_delete` and `trg_comment_count_delete` triggers, which attempt to update `checkins SET toast_count = ...` for the checkin that is *being deleted*. This is a wasted UPDATE that targets a row about to be removed. While not causing data corruption (the row is gone either way), it adds unnecessary trigger overhead during cascade operations and could cause locking contention under concurrent deletes.
**Evidence:**
```sql
-- Migration 037: toast count DELETE trigger
ELSIF TG_OP = 'DELETE' THEN
  UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
  -- This UPDATE targets a row that is being CASCADE-deleted
```
**Recommended Fix:** Add a guard in the DELETE branch: check if the parent checkin still exists before attempting the UPDATE. Use `IF EXISTS (SELECT 1 FROM checkins WHERE id = OLD.checkin_id) THEN ... END IF;`. This prevents wasted work during cascade operations.

---

### [DI-005]: bands.monthly_checkins column defined in database-schema.sql but never maintained
**Severity:** Low
**File(s):** `backend/database-schema.sql:83`
**Description:** The `bands` table in `database-schema.sql` defines `monthly_checkins INTEGER DEFAULT 0`, but no trigger, migration, or service code ever updates this column. It is permanently 0. No query references it.
**Evidence:**
```sql
-- database-schema.sql:83
monthly_checkins INTEGER DEFAULT 0,
```
Grep for `monthly_checkins` across all migrations and services returns zero results.
**Recommended Fix:** Remove `monthly_checkins` from `database-schema.sql`. If monthly analytics are needed later, implement as a materialized view or periodic job rather than a denormalized column with no maintenance logic.

---

## Step 2: Foreign Key Coverage Map

### Complete FK Map (from migrations)

| Child Table | Child Column | Parent Table | ON DELETE | Source |
|---|---|---|---|---|
| events | venue_id | venues | CASCADE | 002 |
| events | created_by_user_id | users | **NO ACTION** (implicit) | 002 |
| event_lineup | event_id | events | CASCADE | 003 |
| event_lineup | band_id | bands | CASCADE | 003 |
| checkins | event_id | events | CASCADE | 004 |
| checkins | band_id | bands | CASCADE | 024 |
| checkins | venue_id | venues | CASCADE | 024 |
| checkin_band_ratings | checkin_id | checkins | CASCADE | 005 |
| checkin_band_ratings | band_id | bands | CASCADE | 005 |
| notifications | user_id | users | CASCADE | 007 |
| notifications | checkin_id | checkins | CASCADE | 007 |
| notifications | from_user_id | users | CASCADE | 007 |
| notifications | badge_id | badges | CASCADE | 007 |
| notifications | event_id | events | CASCADE | 007 |
| event_sync_log | region_id | sync_regions | SET NULL | 017 |
| feed_read_cursors | user_id | users | CASCADE | 020 |
| device_tokens | user_id | users | CASCADE | 021 |
| toasts | user_id | users | CASCADE | 023 |
| toasts | checkin_id | checkins | CASCADE | 023 |
| checkin_comments | checkin_id | checkins | CASCADE | 023 |
| checkin_comments | user_id | users | CASCADE | 023 |
| audit_logs | user_id | users | SET NULL | 025 |
| reports | reporter_id | users | CASCADE | 026 |
| reports | target_user_id | users | SET NULL | 026 |
| reports | reviewed_by | users | SET NULL | 026 |
| moderation_items | report_id | reports | SET NULL | 026 |
| moderation_items | reviewed_by | users | SET NULL | 026 |
| user_blocks | blocker_id | users | CASCADE | 027 |
| user_blocks | blocked_id | users | CASCADE | 027 |
| password_reset_tokens | user_id | users | CASCADE | 028 |
| event_rsvps | user_id | users | CASCADE | 032 |
| event_rsvps | event_id | events | CASCADE | 032 |
| user_genre_preferences | user_id | users | CASCADE | 032 |
| verification_claims | user_id | users | CASCADE | 033 |
| verification_claims | reviewed_by | users | SET NULL | 033 |
| venues | claimed_by_user_id | users | SET NULL | 033 |
| bands | claimed_by_user_id | users | SET NULL | 033 |
| user_badges | earned_checkin_id | checkins | SET NULL | 042 |

### FK Coverage from database-schema.sql Only (no migration)

| Child Table | Child Column | Parent Table | ON DELETE | Notes |
|---|---|---|---|---|
| checkins | user_id | users | CASCADE | schema-only, no migration |
| checkin_vibes | checkin_id | checkins | CASCADE | schema-only, no migration |
| checkin_vibes | vibe_tag_id | vibe_tags | CASCADE | schema-only, no migration |
| user_followers | follower_id | users | CASCADE | schema-only, no migration |
| user_followers | following_id | users | CASCADE | schema-only, no migration |
| user_wishlist | user_id | users | CASCADE | schema-only, no migration |
| user_wishlist | band_id | bands | CASCADE | schema-only, no migration |
| user_badges | user_id | users | CASCADE | schema-only, no migration |
| user_badges | badge_id | badges | CASCADE | schema-only, no migration |
| shows | venue_id | venues | CASCADE | schema-only, legacy |
| shows | band_id | bands | CASCADE | schema-only, legacy |
| notifications | show_id | shows | CASCADE | schema-only, legacy |
| refresh_tokens | user_id | users | CASCADE | schema-only, no migration |
| deletion_requests | user_id | users | CASCADE | schema-only, no migration |
| user_consents | user_id | users | CASCADE | schema-only, no migration |
| user_social_accounts | user_id | users | CASCADE | schema-only, no migration |

---

### [DI-006]: events.created_by_user_id FK has no ON DELETE behavior -- user deletion blocks event existence
**Severity:** Blocker
**File(s):** `backend/migrations/002_expand-create-events-table.ts:30`
**Description:** The `events.created_by_user_id` column references `users(id)` but specifies no `onDelete` behavior. node-pg-migrate defaults to PostgreSQL's default `NO ACTION`, which means deleting a user who created events will fail with a foreign key constraint violation. The `DataRetentionService.executeAccountDeletion()` does not delete or nullify `events.created_by_user_id`, so account deletion will fail for any user who created events.
**Evidence:**
```typescript
// Migration 002:30 -- no onDelete specified:
created_by_user_id: { type: 'uuid', references: 'users' },
// node-pg-migrate maps this to: REFERENCES users(id) -- no ON DELETE clause
```
```typescript
// DataRetentionService.ts:200-216 -- does not address events.created_by_user_id
// The anonymize-user UPDATE succeeds, but any future DELETE of the users row
// would be blocked by events referencing it
```
**Recommended Fix:** Create a migration that alters the FK to `ON DELETE SET NULL`: `ALTER TABLE events DROP CONSTRAINT events_created_by_user_id_fkey; ALTER TABLE events ADD CONSTRAINT events_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;`. This preserves events when their creator's account is deleted.

---

### [DI-007]: verification_claims.entity_id is a polymorphic FK with no referential constraint
**Severity:** High
**File(s):** `backend/migrations/033_verification-claims-and-claimed-profiles.ts:23`
**Description:** `verification_claims.entity_id` stores either a `venues.id` or `bands.id` depending on `entity_type`. No FK constraint exists on `entity_id` because PostgreSQL does not support conditional FKs. If a venue or band is deleted, any `verification_claims` rows referencing it remain as orphans. The `ClaimService` performs LEFT JOINs that would return NULLs for the entity name, but the claim row itself persists with a dangling `entity_id`.
**Evidence:**
```sql
-- Migration 033:23
entity_id UUID NOT NULL,
-- No REFERENCES clause -- polymorphic FK
```
```typescript
// ClaimService.ts:75-76 -- relies on LEFT JOIN, returns NULL entity names for deleted entities
LEFT JOIN venues v ON vc.entity_type = 'venue' AND vc.entity_id = v.id
LEFT JOIN bands b ON vc.entity_type = 'band' AND vc.entity_id = b.id
```
**Recommended Fix:** Add application-level cleanup: when a venue or band is deleted, run `DELETE FROM verification_claims WHERE entity_type = 'venue' AND entity_id = $1` (or 'band'). Alternatively, add a database trigger on venues/bands DELETE that cascades to verification_claims. The polymorphic FK pattern makes database-level constraints impossible, so application-level enforcement is required.

---

### [DI-008]: reports.content_id and moderation_items.content_id are polymorphic FKs with no constraint
**Severity:** High
**File(s):** `backend/migrations/026_reports-and-moderation.ts:46,69`
**Description:** Both `reports.content_id` and `moderation_items.content_id` store UUIDs pointing to checkins, comments, photos, or users depending on `content_type`. No FK constraint exists. If the reported content is deleted (e.g., user deletes their checkin), the report and moderation item remain with dangling `content_id` references. The moderation dashboard would show reports for content that no longer exists.
**Evidence:**
```sql
-- Migration 026:46
content_id UUID NOT NULL,
-- No REFERENCES clause

-- Migration 026:69
content_id UUID NOT NULL,
-- No REFERENCES clause
```
**Recommended Fix:** Add application-level cleanup in `CheckinCreatorService.deleteCheckin()` and comment deletion paths: when content is deleted, update associated reports and moderation_items status to 'dismissed' and nullify `content_id` (or delete them). Add a periodic cleanup job that identifies reports with non-existent content_ids.

---

### [DI-009]: checkins.user_id FK only exists on databases created via database-schema.sql
**Severity:** Blocker
**File(s):** `backend/database-schema.sql:107`, `backend/migrations/024_add-missing-checkin-columns.ts`
**Description:** The `checkins` base table is created by `database-schema.sql` with `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`. However, on a migration-only database, the checkins table exists only because `database-schema.sql` was run. No migration creates the checkins base table or its `user_id` FK. If a fresh environment is bootstrapped from migrations alone, the checkins table does not exist at all, and every checkin operation fails.

This is the root cause of the schema-drift problem identified in Phase 1 (DB-013, DB-014) but has a deeper data integrity implication: the `user_id` FK on checkins is the single most important referential constraint in the entire database (it ensures orphan checkins cannot exist for deleted users), and it only exists if someone manually ran `database-schema.sql`.
**Evidence:**
```sql
-- database-schema.sql:107-108:
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
-- This FK only exists if database-schema.sql was run

-- No migration creates the checkins base table
```
**Recommended Fix:** This is part of the larger missing-migration issue (Phase 1 DB-014). The migration that creates the missing base tables MUST include the `user_id` FK with `ON DELETE CASCADE`. Priority: this is the most critical FK in the system.

---

### [DI-010]: user_badges FK to users and badges only exists on schema-bootstrapped databases
**Severity:** Blocker
**File(s):** `backend/database-schema.sql:188-194`
**Description:** The `user_badges` table is created by `database-schema.sql` with FKs to both `users(id) ON DELETE CASCADE` and `badges(id) ON DELETE CASCADE`, plus a `UNIQUE(user_id, badge_id)` constraint. No migration creates this table. Migration 018 seeds badge data into it, migration 019 adds a `metadata` column to it, and migration 042 adds `earned_checkin_id`. All three assume the table already exists. On a migration-only database, these migrations fail.

The UNIQUE constraint on `(user_id, badge_id)` is critical -- without it, the seed-demo script's `ON CONFLICT (user_id, badge_id) DO NOTHING` clause will fail, and users could earn duplicate badges.
**Evidence:**
```typescript
// Migration 019:15 -- assumes user_badges exists:
pgm.addColumn('user_badges', { metadata: { type: 'jsonb', ... } });
// Will fail with "relation user_badges does not exist" on migration-only DB
```
```typescript
// seed-demo.ts:212 -- depends on UNIQUE(user_id, badge_id):
ON CONFLICT (user_id, badge_id) DO NOTHING
// Will fail without the constraint
```
**Recommended Fix:** Include `user_badges` creation in the missing-tables migration, with both FK constraints and the UNIQUE constraint.

---

### [DI-011]: user_followers table has no migration -- follow counts depend on schema-only table
**Severity:** Blocker
**File(s):** `backend/database-schema.sql:160-167`
**Description:** The `user_followers` table is only defined in `database-schema.sql`. Services that depend on it include `FollowService`, `UserService.getUserStats()`, `StatsService.getBasicStats()`, `DataRetentionService`, `FeedService`, and the seed-demo script. The table has a critical `UNIQUE(follower_id, following_id)` constraint and a `CHECK (follower_id != following_id)` self-follow prevention constraint. Without this table, the entire social graph (friends feed, follow counts, follower notifications) is broken.
**Evidence:**
```sql
-- database-schema.sql:160-167:
CREATE TABLE IF NOT EXISTS user_followers (
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);
```
Grep across all 43 migrations for `user_followers` returns zero results.
**Recommended Fix:** Include in the missing-tables migration with both FKs, the UNIQUE constraint, and the self-follow CHECK constraint.

---

## Step 3: Migration Rollback Safety Assessment

### Rollback Safety Matrix

| Migration | DOWN Reverses UP? | Data Loss Risk | Notes |
|---|---|---|---|
| 001 | No (no-op) | None | Extension enable + conditional DROP. Documented as irreversible. |
| 002 | Yes | Medium | `DROP TABLE events CASCADE` destroys all event data and cascades to lineup, checkins.event_id, RSVPs |
| 003 | Yes | Medium | `DROP TABLE event_lineup CASCADE` destroys lineup data |
| 004 | Yes | Low | Drops added columns only |
| 005 | Yes | Medium | `DROP TABLE checkin_band_ratings CASCADE` destroys all band ratings |
| 006 | Yes | Low | Drops single column |
| 007 | Partial | Low | Drops event_id column/index, but if table was created by this migration, full table remains |
| 008 | Yes | Low | Drops criteria column from badges |
| 009 | Yes | Low | Replaces trigger with original version (loses dual-path) |
| 010 | No (no-op) | None | Data migration. Commented as safe no-op. Migrated data stays in events. |
| 011 | No (no-op) | None | Data backfill. Commented as safe no-op. |
| 012 | Yes | Low | Drops external_id/source from venues |
| 013 | Yes | Low | Drops external_id/source from bands |
| 014 | Yes | Low | Drops status column from events |
| 015 | Yes | None | Drops index only |
| 016 | Yes | Medium | `DROP TABLE sync_regions` loses all sync config |
| 017 | Yes | Medium | `DROP TABLE event_sync_log CASCADE` loses sync history |
| 018 | **DESTRUCTIVE** | **HIGH** | DOWN does `DELETE FROM user_badges; DELETE FROM badges;` -- destroys all earned badges |
| 019 | Yes | Low | Drops metadata column |
| 020 | Yes | Low | Drops feed_read_cursors table |
| 021 | Yes | Low | Drops device_tokens table |
| 022 | Yes | None | Drops indexes only |
| 023 | Yes | Medium | `DROP TABLE CASCADE` on toasts and comments |
| 024 | Yes | Medium | Drops 10 columns from checkins -- data loss if columns had data |
| 025 | Yes | Medium | Drops audit_logs table |
| 026 | Yes | Medium | Drops reports + moderation_items + enum types |
| 027 | Yes | Low | Drops user_blocks table |
| 028 | Yes | Low | Drops password_reset_tokens |
| 029 | Yes | Low | Drops is_admin column |
| 030 | Yes | Low | Drops is_hidden columns |
| 031 | Yes | None | Drops indexes only |
| 032 | Yes | Medium | Drops RSVPs, genre prefs, onboarding column |
| 033 | Yes | Medium | Drops verification_claims + claimed_by columns + wilson function |
| 034 | Yes | Low | Drops search_vector generated columns |
| 035 | Yes | Medium | Drops genres array + GIN index -- loses multi-genre data |
| 036 | **FAILS** | N/A | UP does `ALTER TABLE reviews ADD COLUMN` -- reviews table may not exist |
| 037 | Yes | Low | Drops triggers, resets counts to 0 |
| 038 | Yes | Low | Drops is_premium + processed_webhook_events |
| 039 | **IRREVERSIBLE** | None | Cannot restore plaintext sentinel values. Intentional and documented. |
| 040 | Yes | Medium | Drops user stat columns -- loses backfilled data |
| 041 | Yes | Medium | Drops band/venue stat columns |
| 042 | Yes | Low | Drops earned_checkin_id column |
| 043 | Yes | None | DOWN recreates reviews + review_helpfulness tables (empty) |

---

### [DI-012]: Migration 018 down() destroys all badge data including user-earned badges
**Severity:** High
**File(s):** `backend/migrations/018_seed-badge-definitions.ts:116-117`
**Description:** Rolling back migration 018 executes `DELETE FROM user_badges; DELETE FROM badges;`. This destroys ALL earned badges across ALL users -- not just the seed data inserted by the UP migration. If a rollback to migration 017 is needed for any reason, all badge progress is permanently lost. The UP migration also uses `gen_random_uuid()` for badge IDs, so re-running the migration produces different UUIDs, breaking any surviving `user_badges.badge_id` references.
**Evidence:**
```typescript
// Migration 018:116-117 (down):
pgm.sql('DELETE FROM user_badges;');
pgm.sql('DELETE FROM badges;');
// Destroys ALL badges, not just the ones seeded by this migration
```
**Recommended Fix:** Replace the unconditional DELETE with targeted cleanup: `DELETE FROM badges WHERE name IN ('First Check-in', 'Regular', ...);` listing only the specific badges seeded by this migration. For future safety, hardcode stable UUIDs for badge definitions instead of using `gen_random_uuid()`.

---

### [DI-013]: Migration 036 UP will fail on fresh databases -- reviews table does not exist
**Severity:** High
**File(s):** `backend/migrations/036_review-owner-response.ts:14-21`
**Description:** Migration 036 runs `ALTER TABLE reviews ADD COLUMN owner_response TEXT` without any `IF EXISTS` guard. On a fresh database running all migrations in sequence, the `reviews` table does not exist (it is only in `database-schema.sql`). This migration will fail, blocking all subsequent migrations (037-043). Migration 043 later drops the reviews table, making this migration entirely vestigial.
**Evidence:**
```typescript
// Migration 036:14-15 (no guard):
pgm.sql(`ALTER TABLE reviews ADD COLUMN owner_response TEXT;`);
pgm.sql(`ALTER TABLE reviews ADD COLUMN owner_response_at TIMESTAMPTZ;`);
```
**Recommended Fix:** Wrap in a DO block: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN ALTER TABLE reviews ADD COLUMN IF NOT EXISTS owner_response TEXT; ... END IF; END $$;`. This is the same fix recommended in Phase 1 DB-002.

---

### [DI-014]: Migration 039 generates a new random hash on every run -- non-deterministic
**Severity:** Medium
**File(s):** `backend/migrations/039_replace-social-auth-sentinel.ts:17-18`
**Description:** Migration 039 generates a random password and bcrypt-hashes it at runtime. Every time this migration runs, it produces a different hash. While this is a one-time migration, it means: (a) the DOWN is documented as irreversible, (b) running the migration on two different environments produces different replacement hashes, and (c) if the migration needs to be re-run (repair scenario), previously updated rows get a new hash. The non-determinism makes migration behavior unpredictable across environments.
**Evidence:**
```typescript
// Migration 039:17-18:
const randomPassword = crypto.randomBytes(32).toString('hex');
const hashedPlaceholder = await bcrypt.hash(randomPassword, 10);
// Different result every run
```
**Recommended Fix:** Since social-auth users cannot log in with passwords anyway, use a fixed sentinel hash: `const hashedPlaceholder = '$2a$10$SOCIAL_AUTH_PLACEHOLDER_HASH_DO_NOT_USE';`. This makes the migration deterministic and reproducible. The DOWN should be a no-op (already is).

---

## Step 4: Seed Script Analysis

### [DI-015]: seed.ts uses ON CONFLICT DO NOTHING without a unique constraint target on venues
**Severity:** Medium
**File(s):** `backend/src/scripts/seed.ts:436`
**Description:** The venue INSERT uses `ON CONFLICT DO NOTHING` but the venues table has no unique constraint on `name` (or any combination of name+city+state). PostgreSQL requires a conflict target for `ON CONFLICT DO NOTHING` to work meaningfully with specific constraints. Without a unique constraint, `ON CONFLICT DO NOTHING` only triggers on the PK (`id`), which is `uuid_generate_v4()` -- meaning every run generates new UUIDs and the conflict clause never fires. Running `seed.ts` twice creates duplicate venues.
**Evidence:**
```typescript
// seed.ts:431-436:
INSERT INTO venues (name, description, address, city, state, ...)
VALUES ($1, $2, $3, $4, $5, ...)
ON CONFLICT DO NOTHING  -- only catches PK conflicts, not name duplicates
RETURNING id
```
No unique constraint on `venues.name` exists in any migration or `database-schema.sql`.
**Recommended Fix:** Either (a) add `ON CONFLICT (name) DO NOTHING` after adding a unique index on venue names, or (b) add a check before each insert: `WHERE NOT EXISTS (SELECT 1 FROM venues WHERE name = $1 AND city = $4)`. For seed data specifically, option (b) is simpler and doesn't require schema changes.

---

### [DI-016]: seed-demo.ts inserts checkins with rating=0, polluting trigger-computed averages
**Severity:** Medium
**File(s):** `backend/src/scripts/seed-demo.ts:158`
**Description:** The demo seed inserts checkins with `rating = 0`. The INSERT fires `trigger_update_stats_on_checkin`, which computes `bands.average_rating = AVG(rating)` including these `rating=0` rows. This drags average ratings toward zero for any band that has demo check-ins. The effect persists in production if demo data is not cleaned up before beta.
**Evidence:**
```typescript
// seed-demo.ts:158-159:
`INSERT INTO checkins (user_id, event_id, venue_rating, is_verified, event_date, rating)
 VALUES ($1, $2, $3, $4, $5, 0)  -- rating=0 pollutes AVG
```
**Recommended Fix:** Either (a) set `rating = NULL` in seed data (requires changing the column to nullable), or (b) exclude `rating = 0` from the trigger's AVG computation (the root fix from DI-003). At minimum, document that demo seed data must be purged before production use.

---

### [DI-017]: seed-demo.ts adds is_demo column without checking migration state
**Severity:** Low
**File(s):** `backend/src/scripts/seed-demo.ts:236`
**Description:** The seed-demo script runs `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false` directly, bypassing the migration system. This ad-hoc schema change: (a) is not tracked in migration history, (b) creates a column that no migration knows about, and (c) could cause confusion if a future migration tries to add the same column.
**Evidence:**
```typescript
// seed-demo.ts:236:
await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`);
```
No migration adds `is_demo` to users.
**Recommended Fix:** Move the `is_demo` column addition into a proper migration. The seed script should assume the column exists (or check via `information_schema` without adding it).

---

### [DI-018]: seed-demo.ts badge lookup uses imprecise ILIKE pattern matching
**Severity:** Low
**File(s):** `backend/src/scripts/seed-demo.ts:202-205`
**Description:** The badge lookup uses `badge_type = $1 OR name ILIKE $2` with a pattern like `%first show%`. This can match unintended badges (e.g., `First Check-in` matches `%first%` but so would any badge with "first" in the name). If badge names change, the seed script silently awards wrong badges.
**Evidence:**
```typescript
// seed-demo.ts:201-205:
const badgeNames = ['first_show', 'genre_explorer', 'venue_collector'];
// ...
'SELECT id FROM badges WHERE badge_type = $1 OR name ILIKE $2 LIMIT 1',
[badgeName, `%${badgeName.replace('_', ' ')}%`]
// 'first_show' -> badge_type='first_show' (no match) OR name ILIKE '%first show%'
```
The `badge_type` values from migration 018 are `checkin_count`, `genre_explorer`, `unique_venues`, `superfan`, `festival_warrior`, `road_warrior`. None match `first_show` or `venue_collector` exactly.
**Recommended Fix:** Look up badges by their actual `badge_type` values: `checkin_count` for the first check-in, `unique_venues` for venue collector. Use exact matching: `WHERE badge_type = $1 ORDER BY requirement_value ASC LIMIT 1`.

---

## Step 5: Schema Drift Analysis

### Tables in database-schema.sql with No Migration

Phase 1 identified this list. I confirm it and add annotations for service dependencies:

| Table | Services That Query It | Impact if Missing |
|---|---|---|
| users (base) | All services | Total system failure |
| venues (base) | VenueService, EventService, SearchService, CheckinCreatorService | No venue operations |
| bands (base) | BandService, EventService, SearchService, BadgeService | No band operations |
| checkins (base) | CheckinService, FeedService, StatsService, DataExportService | No check-in operations |
| vibe_tags | CheckinQueryService (line 238) | Vibe tag listing fails |
| checkin_vibes | CheckinCreatorService.addVibeTagsToCheckin() | Vibe tag assignment fails |
| user_followers | FollowService, UserService, StatsService, FeedService, seed-demo | Social graph broken |
| user_wishlist | WishlistService | Wishlist feature broken |
| user_badges (base) | BadgeService, StatsService, DataExportService | Badge system broken |
| badges (base) | BadgeService (migration 018 seeds into it) | Badge system broken |
| shows | Legacy -- migration 010 reads from it if it exists | Not critical (migration handles absence) |
| notifications (base) | NotificationService | Notifications broken |
| refresh_tokens | DataRetentionService, PasswordResetService | Token revocation fails |
| deletion_requests | DataRetentionService | Account deletion fails |
| user_consents | ConsentService | GDPR consent tracking fails |
| user_social_accounts | SocialAuthService | Social login fails |

### [DI-019]: 10 tables actively queried by services have no migration -- fresh DB is non-functional
**Severity:** Blocker (aggregate of Phase 1 DB-013 and DB-014, elevated due to data integrity impact)
**File(s):** `backend/database-schema.sql` (lines 16-35, 38-64, 67-88, 95-102, 128-134, 160-167, 174-184, 187-195, 220-228, 520-527, 541-549, 561-569, 580-587)
**Description:** Ten tables that are actively queried by production services exist only in `database-schema.sql` and have no corresponding migration: `users`, `venues`, `bands`, `checkins`, `vibe_tags`, `checkin_vibes`, `user_followers`, `user_wishlist`, `refresh_tokens`, `deletion_requests`, `user_consents`, `user_social_accounts`. Plus `badges` and `user_badges` base tables that migrations 008, 018, 019, and 042 assume already exist.

A database bootstrapped purely from migrations produces a schema missing these tables, causing immediate failures across all major features. This is not just a theoretical concern -- any new developer, CI environment, or disaster recovery scenario that relies on migrations alone will get a broken database.
**Evidence:** See FK Coverage Map above. Every migration that references these tables (e.g., migration 002 referencing `venues`, migration 007 referencing `users`, `checkins`, `badges`) will fail during migration execution because the parent table does not exist.
**Recommended Fix:** Create migration 044 that creates ALL missing base tables with `IF NOT EXISTS` guards, including:
- All FK constraints with proper ON DELETE behavior
- All UNIQUE constraints (especially `user_followers(follower_id, following_id)`, `user_badges(user_id, badge_id)`)
- All CHECK constraints (e.g., `no_self_follow`)
- Column defaults matching `database-schema.sql`

This single migration must be inserted BEFORE migration 001 in the migration sequence (or use conditional DDL to handle both fresh and existing databases).

---

### [DI-020]: database-schema.sql triggers diverge from migration-created triggers
**Severity:** Medium
**File(s):** `backend/database-schema.sql:384-419`, `backend/migrations/037_denormalized-count-triggers.ts`
**Description:** The trigger functions in `database-schema.sql` differ from those in the migration chain:
1. `database-schema.sql` toast/comment count triggers lack `GREATEST(..., 0)` floor (Phase 1 DB-009)
2. `database-schema.sql` `update_user_stats_on_checkin()` uses the original single-path logic; migration 009 replaces it with dual-path
3. `database-schema.sql` has `update_toast_count()` function name; migration 037 uses `update_checkin_toast_count()`

Any database initialized from `database-schema.sql` has different trigger behavior than one built from migrations.
**Evidence:**
```sql
-- database-schema.sql:389 (no GREATEST):
UPDATE checkins SET toast_count = toast_count - 1 WHERE id = OLD.checkin_id;

-- Migration 037:28 (with GREATEST):
UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
```
**Recommended Fix:** Update `database-schema.sql` to match migration-produced state. Better yet, deprecate `database-schema.sql` as a bootstrapping mechanism and make the migration chain self-sufficient (see DI-019).

---

### [DI-021]: bands.total_reviews and venues.total_reviews columns never created by any migration
**Severity:** Medium
**File(s):** `backend/database-schema.sql` (not present), `backend/src/services/BandService.ts:225`, `backend/src/services/VenueService.ts:250`
**Description:** The `total_reviews` column on `bands` and `venues` is referenced extensively by `BandService` and `VenueService` (for filtering popular entities, sorting, and display). However, no migration creates this column. It exists only on databases bootstrapped from `database-schema.sql`. On a migration-only database, queries like `WHERE total_reviews >= 3` will fail with "column does not exist".

Furthermore, even where the column exists, its values are stale remnants from the dropped reviews system (Phase 1 DB-015). `BandService.updateBandRating()` recomputes it from `checkin_band_ratings`, but only on a per-band basis after individual rating changes, not as a bulk backfill.
**Evidence:**
```typescript
// BandService.ts:225 -- used in popular bands query:
WHERE is_active = true AND total_reviews >= 3

// VenueService.ts:250 -- used in popular venues query:
WHERE is_active = true AND total_reviews >= 5
```
Grep for `total_reviews` across all 43 migrations returns zero results.
**Recommended Fix:** Include `total_reviews` column creation in the missing-tables migration for both `bands` and `venues`. Add a backfill step that computes correct values from `checkin_band_ratings` (for bands) and `checkins WHERE venue_rating IS NOT NULL AND venue_rating > 0` (for venues). Consider renaming to `total_ratings` since reviews no longer exist.

---

### [DI-022]: average_rating column on bands/venues not created by any migration
**Severity:** Medium
**File(s):** `backend/database-schema.sql:59,84`
**Description:** Like `total_reviews`, the `average_rating` column on both `bands` and `venues` exists only via `database-schema.sql`. Migration 009's trigger function updates it, but the column itself is never created by a migration. On migration-only databases, the trigger would fail when trying to `UPDATE bands SET average_rating = ...`.
**Evidence:**
```sql
-- database-schema.sql:59 (venues):
average_rating DECIMAL(3, 2) DEFAULT 0.00,
-- database-schema.sql:84 (bands):
average_rating DECIMAL(3, 2) DEFAULT 0.00,
```
Migration 009 trigger function (line 88): `average_rating = COALESCE(...)` -- assumes column exists.
**Recommended Fix:** Include in the missing-tables migration. Backfill from existing ratings data.

---

## Summary Table

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| DI-001 | Checkin stat counters have no DELETE trigger | Blocker | Trigger Integrity |
| DI-002 | Checkin stat trigger has no UPDATE handler | High | Trigger Integrity |
| DI-003 | average_rating includes rating=0 rows | High | Trigger Integrity |
| DI-004 | Toast/comment triggers fire during CASCADE deletes | Medium | Trigger Integrity |
| DI-005 | bands.monthly_checkins never maintained | Low | Dead Column |
| DI-006 | events.created_by_user_id FK has no ON DELETE | Blocker | FK Integrity |
| DI-007 | verification_claims.entity_id polymorphic FK | High | FK Integrity |
| DI-008 | reports/moderation content_id polymorphic FK | High | FK Integrity |
| DI-009 | checkins.user_id FK only via database-schema.sql | Blocker | FK Integrity |
| DI-010 | user_badges FKs and UNIQUE only via schema.sql | Blocker | FK Integrity |
| DI-011 | user_followers has no migration | Blocker | Schema Completeness |
| DI-012 | Migration 018 down() destroys all badge data | High | Migration Safety |
| DI-013 | Migration 036 fails on fresh databases | High | Migration Safety |
| DI-014 | Migration 039 is non-deterministic | Medium | Migration Safety |
| DI-015 | seed.ts ON CONFLICT DO NOTHING ineffective | Medium | Seed Correctness |
| DI-016 | seed-demo.ts rating=0 pollutes averages | Medium | Seed Correctness |
| DI-017 | seed-demo.ts adds is_demo column outside migrations | Low | Seed Correctness |
| DI-018 | seed-demo.ts badge lookup uses imprecise matching | Low | Seed Correctness |
| DI-019 | 10+ tables have no migration -- fresh DB broken | Blocker (aggregate) | Schema Completeness |
| DI-020 | database-schema.sql triggers diverge from migrations | Medium | Schema Drift |
| DI-021 | total_reviews column not created by any migration | Medium | Schema Drift |
| DI-022 | average_rating column not created by any migration | Medium | Schema Drift |

---

## Recommended Priority Order for Beta

**Must fix before beta launch (Blockers):**
1. DI-019/DI-009/DI-010/DI-011 -- Create the missing-tables migration (single migration, highest priority)
2. DI-001 -- Add DELETE trigger for checkin stat counters
3. DI-006 -- Fix events.created_by_user_id ON DELETE behavior
4. DI-013 -- Guard migration 036 with IF EXISTS check

**Should fix before beta launch (High):**
5. DI-003 -- Exclude rating=0 from average_rating trigger computation
6. DI-002 -- Add UPDATE handler to stat trigger (or add column-change constraint)
7. DI-012 -- Make migration 018 down() targeted instead of destructive
8. DI-007 -- Add application-level cleanup for verification_claims orphans
9. DI-008 -- Add application-level cleanup for reports/moderation orphans

**Fix during beta (Medium):**
10. DI-021/DI-022 -- Add total_reviews and average_rating to migration chain
11. DI-020 -- Synchronize database-schema.sql with migration-produced state
12. DI-015 -- Fix seed.ts idempotency
13. DI-016 -- Fix demo seed rating=0 pollution
14. DI-014 -- Make migration 039 deterministic
15. DI-004 -- Add CASCADE-aware guard in toast/comment triggers

**Track for post-beta (Low):**
16. DI-005, DI-017, DI-018

---

## Cross-References to Phase 1

| Phase 2 Finding | Confirms/Extends Phase 1 | Notes |
|---|---|---|
| DI-001 | Confirms DB-001 | Extended with specific affected columns and dual-path analysis |
| DI-003 | Confirms DB-021 | Extended from low to high severity -- affects trigger, not just schema |
| DI-006 | New finding | Not in Phase 1 |
| DI-009 | Extends DB-014 | Elevated data integrity implication of missing migration |
| DI-013 | Confirms DB-002 | Same migration 036 issue |
| DI-019 | Extends DB-013 + DB-014 | Elevated to blocker -- aggregate of all missing tables |
| DI-020 | Extends DB-009 | Broadened to all trigger divergences |
| DI-021 | Extends DB-015 | Added missing-migration dimension |
