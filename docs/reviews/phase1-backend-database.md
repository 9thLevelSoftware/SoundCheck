# Phase 1 Backend Database Audit -- Findings Report

**Auditor:** Backend Architect Agent
**Date:** 2026-03-18
**Scope:** All 43 migrations, all service SQL queries, trigger integrity, index coverage, FK graph, transaction boundaries
**Target:** Beta readiness review for ~500--2,000 users

---

## Executive Summary

The database layer is generally well-engineered for a pre-beta product. Migrations use conditional DDL (IF NOT EXISTS, DO blocks) for idempotency, search indexes leverage tsvector + pg_trgm appropriately, and the recent reviews-table removal was clean. However, the audit identified **3 blockers**, **5 high-severity issues**, **8 medium-severity issues**, and **5 low-severity improvements** that should be addressed before public beta.

The most critical finding is a stale INSERT-only trigger (migration 009) that never fires on DELETE, meaning denormalized user/band/venue stat counters will drift upward and never self-correct when check-ins are deleted.

---

## Findings

### [DB-001]: Stale stats trigger only fires on INSERT -- DELETE not handled
**Severity:** Blocker
**File(s):** `backend/migrations/009_expand-update-triggers.ts:143-147`
**Description:** The `update_user_stats_on_checkin()` trigger created in migration 009 (and surviving through migration 037/040/041) is defined as `AFTER INSERT ON checkins` only. When a check-in is deleted via `CheckinCreatorService.deleteCheckin()`, the trigger never fires. This means `users.total_checkins`, `users.unique_bands`, `users.unique_venues`, `bands.total_checkins`, `bands.unique_fans`, `venues.total_checkins`, and `venues.unique_visitors` will monotonically increase and never decrease, leading to permanent counter drift.

**Evidence:**
```sql
-- Migration 009, line 143-147:
CREATE TRIGGER trigger_update_stats_on_checkin
  AFTER INSERT ON checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_on_checkin();
-- No AFTER DELETE trigger exists
```

```typescript
// CheckinCreatorService.ts:245
await this.db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);
// No manual stat recalculation after delete
```

**Recommended Fix:** Add an `AFTER DELETE` trigger on checkins that decrements `total_checkins` and recomputes `unique_bands`/`unique_venues`/`unique_fans`/`unique_visitors` for the affected user, band, and venue. Alternatively, replace the increment-on-insert approach with a periodic full-recount job (simpler but less real-time).

---

### [DB-002]: Migration 036 adds columns to dropped `reviews` table
**Severity:** Blocker
**File(s):** `backend/migrations/036_review-owner-response.ts:13-21`
**Description:** Migration 036 runs `ALTER TABLE reviews ADD COLUMN owner_response TEXT` and `ALTER TABLE reviews ADD COLUMN owner_response_at TIMESTAMPTZ`. Migration 043 subsequently drops the `reviews` table entirely. On a fresh database running all 43 migrations in sequence, migration 036 will fail with `relation "reviews" does not exist` because the `reviews` table is only created via `database-schema.sql` (not via any migration). On a database that previously had the reviews table, migration 036 succeeds but migration 043 then drops everything.

**Evidence:**
```typescript
// Migration 036, line 15-16:
pgm.sql(`ALTER TABLE reviews ADD COLUMN owner_response TEXT;`);
pgm.sql(`ALTER TABLE reviews ADD COLUMN owner_response_at TIMESTAMPTZ;`);
// No IF EXISTS guard
```
```typescript
// Migration 043, line 12-13:
pgm.sql(`DROP TABLE IF EXISTS review_helpfulness;`);
pgm.sql(`DROP TABLE IF EXISTS reviews;`);
```

**Recommended Fix:** Add `IF EXISTS` guards to migration 036 by wrapping in a DO block that checks `information_schema.tables` before altering. Since the reviews table is now permanently dropped, this is a forward-compatibility fix to ensure clean migration runs on fresh databases.

---

### [DB-003]: Check-in creation not wrapped in a transaction
**Severity:** Blocker
**File(s):** `backend/src/services/checkin/CheckinCreatorService.ts:110-143`
**Description:** `createEventCheckin()` performs multiple sequential writes (INSERT checkin, INSERT checkin_vibes, UPDATE events for organic verification) without a database transaction. If the checkin INSERT succeeds but the vibe tags INSERT fails, the check-in exists without its tags. More critically, the INSERT fires the `trigger_update_stats_on_checkin` trigger which updates users/bands/venues stats -- if the application then throws (e.g., on vibe tag insertion), the stats are already incremented but the caller sees an error and may retry, causing double-counting.

**Evidence:**
```typescript
// CheckinCreatorService.ts:120-134 -- no BEGIN/COMMIT wrapping
result = await this.db.query(insertQuery, [...]);
// ... trigger fires, stats updated
if (vibeTagIds && vibeTagIds.length > 0) {
  await this.addVibeTagsToCheckin(checkinId, vibeTagIds); // could fail
}
await this.eventService.promoteIfVerified(eventId); // could fail
```

Compare with `EventService.createEvent()` which correctly uses `BEGIN`/`COMMIT`/`ROLLBACK`.

**Recommended Fix:** Wrap the checkin INSERT + vibe tags INSERT in a transaction using `this.db.getClient()`, `BEGIN`, `COMMIT`, `ROLLBACK`, `client.release()` -- matching the pattern already used in `EventService.createEvent()`.

---

### [DB-004]: User search uses ILIKE without index support -- seq scan at scale
**Severity:** High
**File(s):** `backend/src/services/UserService.ts:264-280`, `backend/src/services/SearchService.ts:189-206`
**Description:** `UserService.searchUsers()` and `SearchService.searchUsers()` both use `LOWER(username) LIKE $1` and `LOWER(first_name) LIKE $1` with leading-wildcard patterns (`%query%`). No trigram (pg_trgm) or tsvector index exists on the `users` table. At 2,000 users this is acceptable, but performance degrades linearly. More importantly, unlike bands and venues (which have tsvector `search_vector` columns from migration 034 and trigram indexes), users have no search index at all.

**Evidence:**
```sql
-- UserService.ts:270-273 (sequential scan with leading wildcard):
WHERE is_active = true
  AND (LOWER(username) LIKE $1
       OR LOWER(first_name) LIKE $1
       OR LOWER(last_name) LIKE $1 ...)
```
No migration creates a trigram or tsvector index on users.username, users.first_name, or users.last_name.

**Recommended Fix:** Add a GIN trigram index on `users.username` (most common search target): `CREATE INDEX idx_users_username_trgm ON users USING gin (username gin_trgm_ops)`. Consider adding a `search_vector` tsvector column to users, matching the pattern used for bands/venues in migration 034.

---

### [DB-005]: Correlated subqueries in EventService list queries cause N+1 at database level
**Severity:** High
**File(s):** `backend/src/services/EventService.ts:218-222`, `backend/src/services/EventService.ts:254-255`, `backend/src/services/EventService.ts:279-288`
**Description:** Multiple event-listing methods (`getEventsByVenue`, `getEventsByBand`, `getUpcomingEvents`, `getTrendingEvents`, `getNearbyEvents`, `getNearbyUpcoming`, `getTrendingNearby`, `getByGenre`) include a correlated subquery `(SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count` inside the SELECT list. For N events returned, this executes N additional index lookups. While the events table has a denormalized `total_checkins` column (from migration 002), the service queries ignore it and recompute from checkins every time.

**Evidence:**
```sql
-- EventService.ts:219 (repeated in 8+ locations):
(SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count
```
```sql
-- Migration 002 already defines:
total_checkins: { type: 'integer', default: 0 },
-- And migration 009 trigger increments it:
UPDATE events SET total_checkins = total_checkins + 1 WHERE id = NEW.event_id;
```

**Recommended Fix:** Replace `(SELECT COUNT(*) FROM checkins ...)` with `e.total_checkins` in all event listing queries. The column is already maintained by the trigger in migration 009. This eliminates N correlated subqueries per list request.

---

### [DB-006]: `getUserStats()` uses 7 scalar subqueries instead of denormalized columns
**Severity:** High
**File(s):** `backend/src/services/UserService.ts:308-317`
**Description:** `getUserStats()` executes a single SQL statement with 7 scalar subqueries (COUNT from checkins, user_badges, user_followers x2, COUNT DISTINCT venue_id, COUNT DISTINCT band_id). The users table already has denormalized `total_checkins`, `unique_bands`, and `unique_venues` columns maintained by triggers. This method ignores them and recomputes from scratch, which is both slower and inconsistent with the denormalized values shown elsewhere.

**Evidence:**
```sql
-- UserService.ts:309-317:
(SELECT COUNT(*) FROM checkins WHERE user_id = $1) as checkin_count,
(SELECT COUNT(DISTINCT venue_id) FROM checkins WHERE user_id = $1) as unique_venues,
(SELECT COUNT(DISTINCT band_id) FROM checkins WHERE user_id = $1) as unique_bands
```

**Recommended Fix:** Read `total_checkins`, `unique_bands`, `unique_venues` directly from the `users` row. Keep the follower/badge counts as subqueries (those are not denormalized). This reduces 7 subqueries to 3.

---

### [DB-007]: Missing composite index for feed cursor pagination
**Severity:** High
**File(s):** `backend/src/services/FeedService.ts:87-88`, `backend/src/services/FeedService.ts:122`
**Description:** All three feed queries (friends, event, global) use cursor pagination with `ORDER BY c.created_at DESC, c.id DESC` and a cursor clause `(c.created_at, c.id) < ($3, $4)`. The existing index `idx_checkins_created_at` only covers `created_at DESC`. For correct cursor pagination, a composite index on `(created_at DESC, id DESC)` is needed so the database can seek directly to the cursor position instead of scanning and filtering.

**Evidence:**
```sql
-- FeedService.ts:122:
ORDER BY c.created_at DESC, c.id DESC
-- Cursor clause:
AND (c.created_at, c.id) < ($3::timestamptz, $4::uuid)
```
No migration creates an index on `(created_at DESC, id DESC)` for the checkins table.

**Recommended Fix:** `CREATE INDEX idx_checkins_created_id ON checkins (created_at DESC, id DESC)`. This supports the tuple comparison used in cursor pagination.

---

### [DB-008]: `BadgeService.getBadgeLeaderboard()` has N+1 query pattern
**Severity:** High
**File(s):** `backend/src/services/BadgeService.ts:296-310`
**Description:** `getBadgeLeaderboard()` fetches the top N users by badge count, then for each user, executes a separate query to fetch their 3 most recent badges. For a leaderboard of 20 users, this is 21 queries (1 + 20). This is a classic N+1 problem that will scale linearly with the leaderboard size.

**Evidence:**
```typescript
// BadgeService.ts:299-309:
for (const row of result.rows) {
  const recentBadgesQuery = `
    SELECT b.id, b.name, ...
    FROM user_badges ub JOIN badges b ON ...
    WHERE ub.user_id = $1
    ORDER BY ub.earned_at DESC LIMIT 3
  `;
  const recentBadgesResult = await this.db.query(recentBadgesQuery, [row.id]);
  // ...
}
```

**Recommended Fix:** Use a single query with `LATERAL JOIN` or a window function (`ROW_NUMBER() OVER (PARTITION BY ub.user_id ORDER BY ub.earned_at DESC)`) to fetch all users' recent badges in one round trip.

---

### [DB-009]: Toast/comment count triggers do not use GREATEST() for decrement in `database-schema.sql`
**Severity:** Medium
**File(s):** `backend/database-schema.sql:389`, `backend/database-schema.sql:408`
**Description:** The canonical `database-schema.sql` defines toast and comment count triggers that decrement without a floor: `SET toast_count = toast_count - 1`. If a race condition or bug causes a double-delete, the count can go negative. Migration 037 correctly uses `GREATEST(toast_count - 1, 0)` but the `database-schema.sql` version does not. If a fresh database is seeded from `database-schema.sql` instead of running migrations, it gets the vulnerable trigger.

**Evidence:**
```sql
-- database-schema.sql:389 (no GREATEST):
UPDATE checkins SET toast_count = toast_count - 1 WHERE id = OLD.checkin_id;

-- Migration 037 (correct):
UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
```

**Recommended Fix:** Update `database-schema.sql` to match migration 037's `GREATEST(..., 0)` pattern for both toast and comment count decrements.

---

### [DB-010]: `DataRetentionService.executeAccountDeletion()` does not delete badges, band ratings, toasts, or comments
**Severity:** Medium
**File(s):** `backend/src/services/DataRetentionService.ts:160-227`
**Description:** The account deletion transaction anonymizes the user and deletes notifications, follows, wishlists, and refresh tokens. However, it does not delete `user_badges`, `checkin_band_ratings`, `toasts`, or `checkin_comments` belonging to the user. While some of these CASCADE from checkins (toasts, comments), checkins themselves are not deleted -- only `photo_url` is nullified. This means a "deleted" user's check-ins, band ratings, badge records, toasts given to others, and comments on others' check-ins survive indefinitely with the anonymized user_id still referencing them.

**Evidence:**
```typescript
// DataRetentionService.ts:194-198 -- only nullifies photo_url on checkins:
const checkinPhotoResult = await client.query(
  'UPDATE checkins SET photo_url = NULL WHERE user_id = $1',
  [userId]
);
// No DELETE FROM checkins, user_badges, checkin_band_ratings, toasts, checkin_comments
```

**Recommended Fix:** For GDPR compliance, either (a) DELETE the user's checkins (which CASCADEs to toasts, comments, band_ratings) and DELETE user_badges, or (b) anonymize the `user_id` FK on those rows. Option (a) is simpler and more thorough. Add explicit DELETE statements for `user_badges` and `checkins` (in that order, since user_badges may reference checkins via earned_checkin_id).

---

### [DB-011]: `events.unique_external_event` constraint allows duplicate user-created events
**Severity:** Medium
**File(s):** `backend/migrations/002_expand-create-events-table.ts:38-40`
**Description:** The unique constraint `UNIQUE(source, external_id)` on the events table is designed for deduplication of externally-sourced events. However, `external_id` is nullable, and PostgreSQL's UNIQUE constraint treats NULLs as distinct. This means unlimited events with `source='user_created'` and `external_id=NULL` can be created. While `EventService.createEvent()` has application-level dedup logic (checking venue+band+date), a race condition under concurrent requests could create duplicate user-created events at the same venue on the same date.

**Evidence:**
```typescript
// Migration 002:38-40:
pgm.addConstraint('events', 'unique_external_event', {
  unique: ['source', 'external_id'],
});
// NULL external_id bypasses uniqueness for user-created events
```

**Recommended Fix:** Add a partial unique index for user-created events: `CREATE UNIQUE INDEX idx_events_user_created_dedup ON events (venue_id, event_date) WHERE source = 'user_created' AND external_id IS NULL`. This prevents duplicate user-created events at the same venue on the same date.

---

### [DB-012]: Migration 018 unconditionally DELETEs all badges and user_badges
**Severity:** Medium
**File(s):** `backend/migrations/018_seed-badge-definitions.ts:22-23`
**Description:** Migration 018 starts with `DELETE FROM user_badges; DELETE FROM badges;` without any conditional check. If this migration is re-run (e.g., during a migration repair), it destroys all earned badges. The `down()` method also does `DELETE FROM user_badges; DELETE FROM badges;`, meaning rolling back and re-running also destroys data. Since badges use `gen_random_uuid()` for IDs, re-seeding produces different UUIDs, making any surviving `user_badges.badge_id` references point to nonexistent badges.

**Evidence:**
```typescript
// Migration 018:22-23:
pgm.sql('DELETE FROM user_badges;');
pgm.sql('DELETE FROM badges;');
```

**Recommended Fix:** This migration has already run successfully on production. No immediate action needed, but document that migration 018 is non-idempotent and must never be re-run. Consider adding stable UUIDs (hardcoded) for badge definitions to make future re-seeding safe.

---

### [DB-013]: `deletion_requests` table referenced but never created by any migration
**Severity:** Medium
**File(s):** `backend/src/services/DataRetentionService.ts:80-99`, `backend/database-schema.sql:541-553`
**Description:** The `DataRetentionService` queries the `deletion_requests` table (INSERT, SELECT, UPDATE), but this table is only defined in `database-schema.sql`. No migration creates it. On a database bootstrapped purely from migrations (which is the standard path), the `deletion_requests` table does not exist, and any call to `requestAccountDeletion()` will fail with a "relation does not exist" error.

**Evidence:**
```typescript
// DataRetentionService.ts:94-98:
const result = await this.db.query(
  `INSERT INTO deletion_requests (user_id, status, scheduled_for) ...`,
  [userId, scheduledFor]
);
```
No migration file contains `CREATE TABLE ... deletion_requests`.

**Recommended Fix:** Create a new migration (044) that creates the `deletion_requests` table with the schema from `database-schema.sql` lines 541-553.

---

### [DB-014]: Missing migration for `vibe_tags`, `checkin_vibes`, `user_wishlist`, `user_social_accounts`, `refresh_tokens`, `user_consents` tables
**Severity:** Medium
**File(s):** `backend/database-schema.sql:95-134`, `backend/database-schema.sql:221-233`, `backend/database-schema.sql:520-591`
**Description:** Six tables defined in `database-schema.sql` have no corresponding migration: `vibe_tags`, `checkin_vibes`, `user_wishlist`, `user_social_accounts`, `refresh_tokens`, `user_consents`. These tables exist on production only because `database-schema.sql` was run directly. Services actively query them (`CheckinService.addVibeTagsToCheckin`, `WishlistService`, `SocialAuthService`, `DataRetentionService`, `ConsentService`). Any fresh environment bootstrapped from migrations alone will be missing these tables.

**Evidence:**
```typescript
// CheckinService.ts:173:
INSERT INTO checkin_vibes (checkin_id, vibe_tag_id) VALUES ...
// CheckinQueryService.ts:238:
SELECT id, name, icon, category FROM vibe_tags ...
```
Grepping all 43 migration files for `checkin_vibes`, `vibe_tags`, `user_wishlist`, `user_social_accounts`, `refresh_tokens`, `user_consents` yields zero results.

**Recommended Fix:** Create a migration (044 or 045) that creates all six missing tables with `IF NOT EXISTS` guards. This ensures migration-only bootstrapping produces a complete schema.

---

### [DB-015]: `bands.total_reviews` and `venues.total_reviews` are stale after reviews table drop
**Severity:** Medium
**File(s):** `backend/migrations/043_drop-reviews-tables.ts`, `backend/src/services/BandService.ts:225-226`, `backend/src/services/VenueService.ts:250-251`
**Description:** Migration 043 drops the `reviews` table, but `bands.total_reviews` and `venues.total_reviews` columns survive with their last values. `BandService.getPopularBands()` filters on `total_reviews >= 3` and `VenueService.getPopularVenues()` filters on `total_reviews >= 5`. These values are now frozen leftovers from the old reviews system. `BandService.updateBandRating()` does update `total_reviews` from `checkin_band_ratings`, but this is only called after individual rating changes, not during migration. Bands/venues that never received a `checkin_band_rating` retain stale `total_reviews` counts from the dropped reviews table.

**Evidence:**
```typescript
// BandService.ts:225 (uses stale column):
WHERE is_active = true AND total_reviews >= 3

// BandService.ts:296-308 (updates from new source but only per-band):
total_reviews = (SELECT COUNT(*) FROM checkin_band_ratings WHERE band_id = $1)
```

**Recommended Fix:** Run a one-time backfill migration that recomputes `bands.total_reviews` from `checkin_band_ratings` and `venues.total_reviews` from `checkins WHERE venue_rating IS NOT NULL`. Consider renaming these columns to `total_ratings` for clarity now that reviews are gone.

---

### [DB-016]: Missing index on `checkins.user_id` + `checkins.event_id` for duplicate check prevention
**Severity:** Medium
**File(s):** `backend/migrations/004_expand-add-event-id-to-checkins.ts:113-117`
**Description:** The partial unique index `idx_unique_user_event_checkin` is correctly defined as `UNIQUE(user_id, event_id) WHERE event_id IS NOT NULL`. However, the `WHERE event_id IS NOT NULL` condition means the index is only useful for the constraint check and for queries that also filter on `event_id IS NOT NULL`. The common feed query pattern `WHERE c.user_id = $1` does not benefit from this index for filtering. The separate `idx_checkins_user_created` composite index covers user+created_at but not user+event_id lookups used in `DiscoveryService.computeRecommendations()` (`WHERE user_id = $1 AND event_id IS NOT NULL`).

**Evidence:**
```sql
-- DiscoveryService.ts:194:
AND e.id NOT IN (SELECT event_id FROM checkins WHERE user_id = $1 AND event_id IS NOT NULL)
```
No index on `(user_id, event_id)` for this exclusion subquery.

**Recommended Fix:** `CREATE INDEX idx_checkins_user_event ON checkins (user_id, event_id) WHERE event_id IS NOT NULL`. This supports both the uniqueness constraint lookups and the recommendation exclusion query.

---

### [DB-017]: `getBlockFilterSQL()` uses string interpolation instead of parameterized query
**Severity:** Medium
**File(s):** `backend/src/services/BlockService.ts:131-138`
**Description:** `getBlockFilterSQL()` interpolates `userId` directly into a SQL string fragment: `blocker_id = '${userId}'`. While the method validates `userId` as a UUID format before interpolation (preventing classic SQL injection), this pattern is fragile -- any future caller could pass an unvalidated value, or the UUID regex could be relaxed. Parameterized queries are the standard defense-in-depth approach.

**Evidence:**
```typescript
// BlockService.ts:134-137:
return `AND NOT EXISTS (
  SELECT 1 FROM user_blocks
  WHERE (blocker_id = '${userId}' AND blocked_id = ${userColumn})
     OR (blocker_id = ${userColumn} AND blocked_id = '${userId}')
)`;
```

**Recommended Fix:** Refactor the block filter to use parameterized queries. This requires either (a) passing the userId as an additional query parameter and adjusting parameter indices, or (b) using a CTE at the top of each feed query to pre-select blocked user IDs. Option (a) is simpler but requires coordinating parameter numbers across the calling services.

---

### [DB-018]: Venue search by coordinates has no bounding-box pre-filter
**Severity:** Low
**File(s):** `backend/src/services/VenueService.ts:271-287`
**Description:** `getVenuesNear()` computes Haversine distance for every active venue with non-null coordinates, then filters by distance. The `getNearbyUpcoming()` method in EventService correctly uses a bounding-box pre-filter (`latitude BETWEEN ... AND ...`) to reduce the working set before computing Haversine. `VenueService.getVenuesNear()` lacks this optimization.

**Evidence:**
```sql
-- VenueService.ts:276-283 (no bounding box):
FROM venues WHERE is_active = true AND latitude IS NOT NULL AND longitude IS NOT NULL
-- Computes Haversine for ALL venues

-- EventService.ts:620-621 (has bounding box):
AND v.latitude BETWEEN ($1 - $4 / 111.0) AND ($1 + $4 / 111.0)
AND v.longitude BETWEEN ($2 - $4 / (111.0 * cos(radians($1)))) ...
```

**Recommended Fix:** Add the same bounding-box pre-filter to `VenueService.getVenuesNear()` before the Haversine computation. This is a simple copy of the pattern from `EventService.getNearbyUpcoming()`.

---

### [DB-019]: `DataExportService.getCheckins()` has unbounded SELECT
**Severity:** Low
**File(s):** `backend/src/services/DataExportService.ts:175-186`
**Description:** The GDPR data export `getCheckins()` method has no LIMIT clause. For a power user with thousands of check-ins, this could return a very large result set. While GDPR exports are infrequent and intentional, an unbounded query could cause memory pressure or timeout on the application server.

**Evidence:**
```sql
-- DataExportService.ts:176-185:
SELECT c.id, c.rating, c.comment, c.photo_url, c.event_date, c.created_at, ...
FROM checkins c
LEFT JOIN venues v ON c.venue_id = v.id
LEFT JOIN bands b ON c.band_id = b.id
WHERE c.user_id = $1
ORDER BY c.created_at DESC
-- No LIMIT
```

**Recommended Fix:** Add a reasonable LIMIT (e.g., 10,000) or implement streaming/pagination for the export. For beta scale this is acceptable, but should be addressed before scaling beyond ~10K users.

---

### [DB-020]: `database-schema.sql` canonical checkins table defines `band_id` and `venue_id` as NOT NULL, but migrations make them nullable
**Severity:** Low
**File(s):** `backend/database-schema.sql:108-109`, `backend/migrations/024_add-missing-checkin-columns.ts:29-39`
**Description:** The canonical schema in `database-schema.sql` defines `checkins.band_id UUID NOT NULL REFERENCES bands(id)` and `checkins.venue_id UUID NOT NULL REFERENCES venues(id)`. Migration 024 adds these columns as nullable (no NOT NULL constraint). The actual production schema has them nullable, which is correct for the event-first check-in flow (where band/venue come from the event). But the canonical schema file is misleading.

**Evidence:**
```sql
-- database-schema.sql:108-109:
band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

-- Migration 024:29-30 (actual production schema):
ALTER TABLE checkins ADD COLUMN band_id UUID REFERENCES bands(id) ON DELETE CASCADE;
ALTER TABLE checkins ADD COLUMN venue_id UUID REFERENCES venues(id) ON DELETE CASCADE;
-- No NOT NULL
```

**Recommended Fix:** Update `database-schema.sql` to reflect the actual nullable constraints. The canonical schema should match the migration-produced schema.

---

### [DB-021]: `checkins.rating` defaults to 0 but CHECK constraint in schema requires `>= 0`
**Severity:** Low
**File(s):** `backend/database-schema.sql:111`, `backend/src/services/checkin/CheckinCreatorService.ts:132`
**Description:** The canonical schema defines `rating DECIMAL(2,1) NOT NULL CHECK (rating >= 0 AND rating <= 5)`. Migration 024 adds `rating DECIMAL(2,1) DEFAULT 0`. `CheckinCreatorService.createEventCheckin()` inserts `rating = 0` (line 132). Meanwhile, `checkin_band_ratings` has a CHECK constraint of `rating >= 0.5`. This creates an inconsistency: the legacy `rating` column allows 0 (meaning "unrated"), while per-band ratings require at least 0.5. The 0 value pollutes average calculations in the trigger (`average_rating = AVG(rating)` includes 0-rated rows).

**Evidence:**
```typescript
// CheckinCreatorService.ts:132:
0, // rating starts at 0, set via PATCH /ratings

// Migration 009 trigger:
average_rating = COALESCE(
  (SELECT AVG(rating) FROM checkins WHERE band_id = v_band_id AND rating IS NOT NULL)
  ...
)
// rating=0 rows are NOT NULL, so they drag the average down
```

**Recommended Fix:** Either (a) change the default to NULL and filter `WHERE rating IS NOT NULL AND rating > 0` in average computations, or (b) add `CHECK (rating >= 0.5 OR rating = 0)` and explicitly exclude 0-rated rows from averages. Option (a) is cleaner.

---

### [DB-022]: Migration 001 `down()` is a no-op -- cannot reverse extension or DROP
**Severity:** Low
**File(s):** `backend/migrations/001_setup-migration-infrastructure.ts:33-36`
**Description:** Migration 001's `up()` enables `pg_trgm` extension and conditionally drops old tables. The `down()` is documented as a no-op. While this is intentional and commented, it means rolling back migration 001 leaves the extension enabled and old tables dropped. This is acceptable for an extension, but worth noting that the migration chain is not fully reversible from the start.

**Evidence:**
```typescript
// Migration 001:33-36:
export async function down(pgm: MigrationBuilder): Promise<void> {
  // No-op: cannot un-detect old schema or un-enable an extension safely.
}
```

**Recommended Fix:** No action needed. Document in runbook that migration 001 is irreversible by design.

---

---

## Summary Table

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| DB-001 | Stats trigger INSERT-only, no DELETE handler | Blocker | Trigger Integrity |
| DB-002 | Migration 036 alters dropped reviews table | Blocker | Migration Correctness |
| DB-003 | Check-in creation not transactional | Blocker | Transaction Boundary |
| DB-004 | User search has no index, seq scan | High | Index Coverage |
| DB-005 | Correlated subqueries for event checkin_count | High | Query Performance |
| DB-006 | getUserStats() ignores denormalized columns | High | Query Performance |
| DB-007 | Missing composite index for feed cursor pagination | High | Index Coverage |
| DB-008 | Badge leaderboard N+1 query pattern | High | Query Performance |
| DB-009 | Schema.sql toast/comment triggers lack GREATEST() | Medium | Trigger Integrity |
| DB-010 | Account deletion does not purge badges/ratings | Medium | Data Retention |
| DB-011 | User-created events lack dedup constraint | Medium | Data Integrity |
| DB-012 | Migration 018 unconditionally deletes badges | Medium | Migration Safety |
| DB-013 | deletion_requests table missing from migrations | Medium | Schema Completeness |
| DB-014 | 6 tables missing from migration chain | Medium | Schema Completeness |
| DB-015 | total_reviews stale after reviews drop | Medium | Data Integrity |
| DB-016 | Missing index for recommendation exclusion query | Medium | Index Coverage |
| DB-017 | Block filter uses string interpolation | Medium | Security |
| DB-018 | Venue proximity search lacks bounding-box | Low | Query Performance |
| DB-019 | GDPR export has unbounded checkin SELECT | Low | Query Performance |
| DB-020 | Schema.sql NOT NULL mismatch with migrations | Low | Documentation |
| DB-021 | rating=0 default pollutes averages | Low | Data Integrity |
| DB-022 | Migration 001 down() is no-op | Low | Migration Reversibility |

---

## Recommended Priority Order for Beta

**Must fix before beta launch (Blockers):**
1. DB-001 -- Add DELETE trigger for stat counters (or add periodic recount job)
2. DB-002 -- Guard migration 036 with IF EXISTS check
3. DB-003 -- Wrap check-in creation in a transaction

**Should fix before beta launch (High):**
4. DB-007 -- Add composite cursor pagination index (quick win, immediate feed perf)
5. DB-005 -- Replace correlated subqueries with `e.total_checkins` (quick win)
6. DB-006 -- Read denormalized user stat columns (quick win)
7. DB-004 -- Add user search trigram index
8. DB-008 -- Refactor badge leaderboard to single query

**Fix during beta (Medium):**
9. DB-014 -- Create migration for 6 missing tables
10. DB-013 -- Create migration for deletion_requests
11. DB-010 -- Expand account deletion scope
12. DB-015 -- Backfill total_reviews from new source
13. DB-011 -- Add user-created event dedup constraint
14. DB-016 -- Add user+event index for recommendations
15. DB-017 -- Parameterize block filter SQL
16. DB-009 -- Sync database-schema.sql with migration triggers
17. DB-012 -- Document non-idempotent migration 018

**Track for post-beta (Low):**
18. DB-018 through DB-022

---

## Appendix: Tables Created by Migrations vs. database-schema.sql Only

### Created by migrations (confirmed):
- events (002)
- event_lineup (003)
- checkin_band_ratings (005)
- sync_regions (016)
- event_sync_log (017)
- feed_read_cursors (020)
- device_tokens (021)
- toasts (023)
- checkin_comments (023)
- audit_logs (025)
- reports (026)
- moderation_items (026)
- user_blocks (027)
- password_reset_tokens (028)
- event_rsvps (032)
- user_genre_preferences (032)
- verification_claims (033)
- processed_webhook_events (038)

### Created by database-schema.sql only (no migration):
- users
- venues
- bands
- checkins (base table)
- vibe_tags
- checkin_vibes
- shows
- user_wishlist
- notifications (base; migration 007 handles event_id column)
- badges (base; migration 018 handles seed data)
- user_badges (base)
- reviews (dropped by migration 043)
- review_helpfulness (dropped by migration 043)
- refresh_tokens
- deletion_requests
- user_consents
- user_social_accounts
- user_followers
