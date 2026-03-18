# Phase 1: Backend Service Layer Audit

**Audit Date:** 2026-03-18
**Auditor:** Backend Architect Agent
**Scope:** All 43 backend services, controllers, and job workers
**Target:** Beta readiness review (~500-2,000 users)
**Finding Count:** 22

---

## Executive Summary

The SoundCheck backend is architecturally sound for beta launch. The service decomposition (facade + sub-services for CheckinService), event-driven badge evaluation, cursor-based feed pagination, and fire-and-forget patterns for non-critical paths are all well-designed.

However, this audit identified **3 Blockers**, **6 High**, **8 Medium**, and **5 Low** severity issues that should be triaged before public beta. The blockers center on race conditions in the core check-in flow, a non-transactional rating update path, and a TOCTOU race in the toast flow that can produce duplicate toasts under concurrent requests.

---

## Findings by Severity

| Severity | Count | Category |
|----------|-------|----------|
| Blocker  | 3     | Race conditions, data consistency |
| High     | 6     | Error handling gaps, missing validation |
| Medium   | 8     | Edge cases, performance, logic errors |
| Low      | 5     | Code quality, minor correctness |

---

## Blocker Findings

### [BE-001]: Toast check-in has TOCTOU race condition allowing duplicate toasts
**Severity:** Blocker
**File(s):** `backend/src/services/checkin/CheckinToastService.ts:29-41`
**Description:** The `toastCheckin()` method performs a SELECT check for existing toast, then INSERTs if not found. Under concurrent requests (double-tap, laggy mobile network retry), two requests can both pass the existence check and both insert, creating duplicate toasts. The toasts table apparently lacks a UNIQUE constraint on `(checkin_id, user_id)` since the code uses a manual check instead of relying on `ON CONFLICT`.
**Evidence:**
```typescript
// Line 29-36: read-then-write without transaction or constraint
const existingToast = await this.db.query(
  'SELECT id FROM toasts WHERE checkin_id = $1 AND user_id = $2',
  [checkinId, userId]
);
if (existingToast.rows.length > 0) {
  throw new Error('Already toasted this check-in');
}
// Line 39-41: INSERT without ON CONFLICT
await this.db.query(
  'INSERT INTO toasts (checkin_id, user_id) VALUES ($1, $2)',
  [checkinId, userId]
);
```
**Recommended Fix:** Replace the SELECT-then-INSERT pattern with a single `INSERT ... ON CONFLICT (checkin_id, user_id) DO NOTHING` statement. If the `(checkin_id, user_id)` UNIQUE constraint does not exist on the `toasts` table, add it via migration. Then check `result.rowCount` to determine if the toast was already present.

---

### [BE-002]: Rating updates are not transactional -- partial failure leaves inconsistent state
**Severity:** Blocker
**File(s):** `backend/src/services/checkin/CheckinRatingService.ts:34-125`
**Description:** The `addRatings()` method performs multiple independent database writes (venue_rating UPDATE, N band rating UPSERTs, legacy rating column UPDATE) without wrapping them in a transaction. If the process crashes or the database connection drops mid-execution, the check-in can end up with some band ratings written but the legacy `rating` average column not updated, or the venue rating written but band ratings missing. At beta scale this is unlikely to be frequent, but it causes silent data inconsistency that is hard to debug.
**Evidence:**
```typescript
// Line 55-58: first write -- venue rating
await this.db.query(
  'UPDATE checkins SET venue_rating = $1 ...', [ratings.venueRating, checkinId]
);
// Line 63-84: second writes -- N band ratings in a loop
for (const br of ratings.bandRatings) {
  await this.db.query('INSERT INTO checkin_band_ratings ...', [...]);
}
// Line 87-97: third write -- legacy avg rating
await this.db.query('UPDATE checkins SET rating = $1 ...', [avgRating, checkinId]);
// None of these are wrapped in BEGIN/COMMIT
```
**Recommended Fix:** Acquire a client via `this.db.getClient()`, wrap all writes in `BEGIN`/`COMMIT` with a `ROLLBACK` in the catch block, and release the client in `finally`. The existing `EventService.createEvent()` already demonstrates this pattern.

---

### [BE-003]: Check-in creation does not use a database transaction for insert + vibe tags
**Severity:** Blocker
**File(s):** `backend/src/services/checkin/CheckinCreatorService.ts:110-149`
**Description:** The `createEventCheckin()` method inserts the checkin row (line 122) and then inserts vibe tags (line 149) as two separate database operations without a transaction. If the vibe tag insertion fails (e.g., invalid vibe tag ID causes FK violation), the check-in is already committed to the database but without its intended vibe tags. The user receives an error, but the check-in exists in a partially-created state. The user cannot retry (unique constraint on user+event will return 409), and the orphaned check-in has no vibe tags.
**Evidence:**
```typescript
// Line 122: INSERT checkin (auto-committed)
result = await this.db.query(insertQuery, [...]);
// Line 148-149: separate INSERT for vibe tags
if (vibeTagIds && vibeTagIds.length > 0) {
  await this.addVibeTagsToCheckin(checkinId, vibeTagIds); // can throw
}
```
**Recommended Fix:** Wrap the checkin INSERT and vibe tag INSERT in a single transaction using `this.db.getClient()` with BEGIN/COMMIT/ROLLBACK. Alternatively, since the vibe tag insert uses `ON CONFLICT DO NOTHING`, the risk is primarily on FK violations for invalid vibe tag IDs -- validate the vibe tag IDs before inserting the checkin.

---

## High Severity Findings

### [BE-004]: CheckinController.getCheckinById swallows all errors as 404
**Severity:** High
**File(s):** `backend/src/controllers/CheckinController.ts:91-113`
**Description:** The `getCheckinById` controller handler catches all errors and returns 404. If the database is down, the user receives a 404 "Check-in not found" instead of a 500 "Internal server error". This makes production debugging harder and gives misleading feedback to the client. Other controller methods correctly use `error.statusCode` or default to 500.
**Evidence:**
```typescript
// Line 104-113
} catch (error) {
  const response: ApiResponse = {
    success: false,
    error: 'Check-in not found',  // always 404, even for DB errors
  };
  res.status(404).json(response);
}
```
**Recommended Fix:** Check if the error message is exactly "Check-in not found" to return 404; otherwise return 500 with a generic error message. Or propagate `statusCode` from the service error like other controller methods do.

---

### [BE-005]: CheckinCreatorService.deleteCheckin errors always surface as 500
**Severity:** High
**File(s):** `backend/src/services/checkin/CheckinCreatorService.ts:219-273`, `backend/src/controllers/CheckinController.ts:369-401`
**Description:** The `deleteCheckin()` service method throws plain `Error` objects for "Check-in not found" and "Unauthorized" without setting `statusCode`. The controller then catches these and always returns 500. A user deleting a non-existent check-in should receive 404, and deleting someone else's should receive 403.
**Evidence:**
```typescript
// Service (line 228-232): no statusCode set
if (checkin.rows.length === 0) {
  throw new Error('Check-in not found'); // should be 404
}
if (checkin.rows[0].user_id !== userId) {
  throw new Error('Unauthorized to delete this check-in'); // should be 403
}
// Controller (line 400): always 500
res.status(500).json(response);
```
**Recommended Fix:** Set `(err as any).statusCode = 404` and `403` respectively in the service. In the controller, use `error.statusCode || 500` for the response status code (same pattern as `createCheckin`).

---

### [BE-006]: R2Service has conflicting property name and getter for `configured`
**Severity:** High
**File(s):** `backend/src/services/R2Service.ts:35,153-155`
**Description:** The R2Service class has a private field `isConfigured` (line 35) and a getter named `configured` (line 153). But the class also has a constructor property `this.isConfigured` being set. The getter `get configured()` will shadow the private field name if TypeScript allows it, but at minimum this creates confusion. More critically, the getter at line 153 returns `this.isConfigured` -- but this will compile because `isConfigured` is the private field. However, the getter name `configured` conflicts with TypeScript conventions and may cause issues if someone tries to access `r2Service.configured` thinking it is the boolean field.
**Evidence:**
```typescript
private isConfigured: boolean;          // line 35
// ...
get configured(): boolean {             // line 153
  return this.isConfigured;
}
```
**Recommended Fix:** Rename the getter to `isReady()` or `isEnabled()` to avoid the naming overlap with the private field. Or remove the getter entirely and expose `isConfigured` as a public readonly property.

---

### [BE-007]: TicketmasterAdapter daily call counter is in-memory -- resets on deploy/restart
**Severity:** High
**File(s):** `backend/src/services/TicketmasterAdapter.ts:44-45`
**Description:** The `dailyCallCount` is stored as an instance-level counter. On Railway (the deployment platform), each deploy or restart creates a fresh instance with `dailyCallCount = 0`. This means the 4900-call hard limit provides no protection across process restarts. If a sync job triggers on startup and the previous instance had already consumed 4000 calls, the new instance has no awareness and will consume another full quota, potentially exceeding the 5000/day Ticketmaster limit and causing API key suspension.
**Evidence:**
```typescript
private dailyCallCount = 0;        // line 44 -- in-memory only
private dailyResetTime: number;     // line 45 -- in-memory only
```
**Recommended Fix:** Move the daily call counter into Redis using an atomic `INCR` with `EXPIREAT` set to midnight UTC. This persists the counter across restarts and works correctly with multiple processes. Fall back to the in-memory counter if Redis is unavailable.

---

### [BE-008]: Haversine SQL query will return NaN for venues at exact poles or antipodal points
**Severity:** High
**File(s):** `backend/src/services/EventService.ts:548-552`, `backend/src/services/checkin/CheckinQueryService.ts:119-125`
**Description:** The Haversine formula used in several SQL queries computes `acos(...)` where the argument can exceed the range [-1, 1] due to floating-point precision errors, especially at identical or near-identical coordinates. PostgreSQL's `acos()` returns NaN for inputs outside [-1, 1], which causes the entire distance calculation to return NaN. Rows with NaN distance will fail the `<= radiusKm` comparison and be silently excluded, or worse, cause query errors depending on the PostgreSQL version.
**Evidence:**
```sql
-- This expression can produce acos(1.0000000000000002) = NaN
(6371 * acos(
  cos(radians($1)) * cos(radians(v.latitude)) *
  cos(radians(v.longitude) - radians($2)) +
  sin(radians($1)) * sin(radians(v.latitude))
))
```
**Recommended Fix:** Wrap the `acos()` argument with `LEAST(GREATEST(..., -1), 1)` to clamp the value to the valid range. This is a standard Haversine safety measure: `acos(LEAST(GREATEST(cos(...)*cos(...)*cos(...) + sin(...)*sin(...), -1.0), 1.0))`.

---

### [BE-009]: FeedService event feed does not filter blocked users
**Severity:** High
**File(s):** `backend/src/services/FeedService.ts:158-227`
**Description:** The `getEventFeed()` method does not apply the block filter SQL. A blocked user's check-ins at an event will still appear in the event feed. The `getFriendsFeed()` and `getGlobalFeed()` methods both correctly use `this.blockService.getBlockFilterSQL()`, but `getEventFeed()` omits it. The event feed also hardcodes `false AS has_user_toasted` instead of checking the actual toast status.
**Evidence:**
```typescript
// Line 170-198: getEventFeed query
// No blockService.getBlockFilterSQL() call
// Line 189: hardcoded false
false AS has_user_toasted
```
**Recommended Fix:** Accept `userId` as a parameter to `getEventFeed()`, add the block filter SQL, and compute the actual `has_user_toasted` EXISTS subquery like the other feeds do.

---

## Medium Severity Findings

### [BE-010]: Badge evaluator uses criteria from first badge in group -- may be incorrect for different thresholds
**Severity:** Medium
**File(s):** `backend/src/services/BadgeService.ts:131`
**Description:** When evaluating grouped badges (e.g., all `checkin_count` badges), the evaluator is called once with `criteria` from `badges[0]`. This works for type/genre grouping, but if badges of the same type have different criteria fields (e.g., one has `{ type: "checkin_count", field: "verified_only" }`), those criteria differences are silently ignored. Currently the badge definitions may not have such differences, but this is a latent bug that will surface as new badges are added.
**Evidence:**
```typescript
const criteria = badges[0].criteria || {};
const result: EvalResult = await evaluator(userId, criteria);
```
**Recommended Fix:** Document the invariant that all badges in a group must share identical criteria (except threshold). Add a runtime assertion or warning if badges in the same group have differing non-threshold criteria fields.

---

### [BE-011]: CheckinCreatorService time window validation does not handle late-night events spanning midnight
**Severity:** Medium
**File(s):** `backend/src/services/checkin/CheckinCreatorService.ts:337-417`
**Description:** The `isWithinTimeWindow()` method compares today's date to the event date and then checks if the current time falls within the window. For a show that starts at 11 PM and runs until 2 AM, the window end is clamped to `23:59` (line 408: `Math.min(24 * 60 - 1, ...)`). After midnight, the date check at line 371 (`todayStr !== eventDateStr`) will fail because today is now the next day, blocking valid check-ins for attendees at shows that run past midnight.
**Evidence:**
```typescript
// Line 404: end time clamped to same day
windowEndMinutes = Math.min(24 * 60 - 1, parseTimeToMinutes(endTime) + 60);
// Line 371: strict date match
if (todayStr !== eventDateStr) return false;
```
**Recommended Fix:** Allow check-ins until a grace period after midnight (e.g., 4 AM the next day). Check both `eventDateStr` and `eventDateStr + 1 day` when the current time is between midnight and the grace hour.

---

### [BE-012]: CheckinQueryService.getActivityFeed Haversine query crashes if venue latitude/longitude is NULL
**Severity:** Medium
**File(s):** `backend/src/services/checkin/CheckinQueryService.ts:117-125`
**Description:** When `filter === 'nearby'`, the SQL Haversine formula is applied to `v.latitude` and `v.longitude` without a NULL check. If any venue has NULL coordinates (which is valid for venues imported without GPS data), the `acos()` call receives NULL operands, causing the entire expression to evaluate to NULL. Rows with NULL distance will pass the `<= 64.4` check as NULL (which evaluates to false), so those rows are silently excluded. This is not a crash but means nearby feed results are incomplete.
**Evidence:**
```sql
WHERE (6371 * acos(
  cos(radians($2)) * cos(radians(v.latitude)) * ...
)) <= 64.4
-- No: AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
```
**Recommended Fix:** Add `AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL` to the WHERE clause for the `nearby` filter, consistent with how `EventService.getNearbyEvents()` handles this.

---

### [BE-013]: FollowService.followUser has TOCTOU race but is saved by ON CONFLICT
**Severity:** Medium
**File(s):** `backend/src/services/FollowService.ts:23-49`
**Description:** The `followUser()` method first calls `isFollowing()` (SELECT), then does an INSERT with `ON CONFLICT DO NOTHING`. The initial check is redundant -- the `ON CONFLICT` handles the race. However, the method returns `{ success: true, isFollowing: true }` regardless of whether the INSERT actually happened or the `ON CONFLICT` triggered. This is functionally correct but the `isFollowing()` check at line 26 is a wasted database round-trip under normal conditions.
**Evidence:**
```typescript
const existingFollow = await this.isFollowing(followerId, followingId);
if (existingFollow) {
  return { success: true, isFollowing: true }; // early return
}
// ... INSERT with ON CONFLICT DO NOTHING
```
**Recommended Fix:** Remove the `isFollowing()` pre-check and rely solely on the `ON CONFLICT` clause. Check `result.rowCount` to differentiate "newly followed" from "already following" if needed.

---

### [BE-014]: BandService.getPopularBands and getTrendingBands use stale total_reviews column
**Severity:** Medium
**File(s):** `backend/src/services/BandService.ts:219-232, 255-270`
**Description:** `getPopularBands()` filters by `total_reviews >= 3` and sorts by a formula involving `total_reviews`. But `total_reviews` is updated by `updateBandRating()` which counts `checkin_band_ratings`, and this method is never called automatically -- it must be explicitly invoked. If the `total_reviews` column gets stale (which it will unless called after every rating), the popular/trending band queries return incorrect results. The DiscoveryService correctly computes aggregates from `checkin_band_ratings` directly.
**Evidence:**
```typescript
// getPopularBands line 225
WHERE is_active = true AND total_reviews >= 3
ORDER BY (average_rating * 0.7 + LEAST(total_reviews/50.0, 1.0) * 0.3) DESC
```
**Recommended Fix:** Either add a call to `bandService.updateBandRating(bandId)` in `CheckinRatingService.addRatings()` after writing band ratings, or replace the `total_reviews` filter with a subquery counting `checkin_band_ratings` directly (matching the DiscoveryService pattern).

---

### [BE-015]: EventService.getNearbyUpcoming uses string concatenation for interval which may be SQL-injectable
**Severity:** Medium
**File(s):** `backend/src/services/EventService.ts:616`
**Description:** The query uses `($3 || ' days')::INTERVAL` where `$3` is the `days` parameter. PostgreSQL parameterized queries should protect against injection here since `$3` is bound as a parameter. However, the pattern of building an interval via string concatenation of a parameter is fragile. If the `days` value is a non-numeric string (passed from a controller without validation), it will cause a PostgreSQL cast error at runtime instead of being caught at validation.
**Evidence:**
```sql
WHERE e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($3 || ' days')::INTERVAL
```
**Recommended Fix:** Use `CURRENT_DATE + ($3 * INTERVAL '1 day')` which is cleaner and ensures `$3` is treated as a numeric multiplier. Alternatively, validate that `days` is a positive integer in the caller.

---

### [BE-016]: DataRetentionService.executeAccountDeletion uses getPool().connect() instead of getClient()
**Severity:** Medium
**File(s):** `backend/src/services/DataRetentionService.ts:151`
**Description:** The `executeAccountDeletion()` method uses `this.db.getPool().connect()` to acquire a transaction client, while every other service that uses transactions (EventService, ClaimService) uses `this.db.getClient()`. This suggests `getPool()` may expose the raw pg Pool, bypassing any connection wrappers or monitoring the Database class provides. This inconsistency could cause issues if the Database class adds connection tracking or instrumentation.
**Evidence:**
```typescript
const client = await this.db.getPool().connect(); // line 151
// vs. EventService line 80:
const client = await this.db.getClient();
```
**Recommended Fix:** Change to `this.db.getClient()` for consistency with the rest of the codebase.

---

### [BE-017]: Notification query may return duplicate event headliners if multiple headliners exist
**Severity:** Medium
**File(s):** `backend/src/services/NotificationService.ts:138`
**Description:** The notification query joins `event_lineup el ON ev.id = el.event_id AND el.is_headliner = true`. If an event has multiple bands marked as headliner (which is possible in the schema -- `is_headliner` is a boolean without a unique constraint on `(event_id, is_headliner=true)`), this JOIN will produce duplicate notification rows. The `getNotifications()` method does not use DISTINCT, so a single notification could appear multiple times in the result set.
**Evidence:**
```sql
LEFT JOIN event_lineup el ON ev.id = el.event_id AND el.is_headliner = true
LEFT JOIN bands evb ON el.band_id = evb.id
-- No LIMIT 1 or DISTINCT ON for the headliner join
```
**Recommended Fix:** Add `AND el.set_order = 0` to the JOIN condition, or use a lateral subquery with `LIMIT 1` to pick exactly one headliner per event.

---

## Low Severity Findings

### [BE-018]: CheckinCreatorService writes comment to both review_text and comment columns
**Severity:** Low
**File(s):** `backend/src/services/checkin/CheckinCreatorService.ts:110-134`
**Description:** The INSERT statement writes the `comment` value to both the `review_text` column (parameter $6) and the `comment` column (parameter $11). This is likely a legacy artifact from the reviews removal refactor. It wastes storage and may confuse anyone reading the database directly.
**Evidence:**
```typescript
// Line 128-133: comment written twice
result = await this.db.query(insertQuery, [
  userId, eventId, event.venue_id, headlinerBandId,
  isVerified,
  comment || null,        // $6 -> review_text
  locationLat || null,
  locationLon || null,
  event.event_date,
  0,                      // rating
  comment || null,        // $11 -> comment
]);
```
**Recommended Fix:** Remove the `review_text` column from the INSERT or set it to NULL. The `comment` column should be the canonical location for user text.

---

### [BE-019]: CheckinRatingService.validateRating uses floating-point modulo which can be unreliable
**Severity:** Low
**File(s):** `backend/src/services/checkin/CheckinRatingService.ts:131-138`
**Description:** The `validateRating()` method uses `rating % 0.5 !== 0` to check 0.5 increments. Floating-point modulo can produce unexpected results (e.g., `2.5 % 0.5` might return `2.220446049250313e-16` instead of 0). The controller performs the same validation (line 734), so this is a defense-in-depth issue rather than a functional bug, but the service-level check could falsely reject valid ratings.
**Evidence:**
```typescript
if (rating % 0.5 !== 0) {
  throw new Error('Rating must be in 0.5 increments');
}
```
**Recommended Fix:** Use `Math.round(rating * 2) / 2 !== rating` or check `(rating * 2) % 1 !== 0` which operates on integers and avoids floating-point issues.

---

### [BE-020]: AuditService type still references 'reviews' resource type
**Severity:** Low
**File(s):** `backend/src/services/AuditService.ts:43`
**Description:** The `AuditResourceType` type union includes `'reviews'` even though the reviews system has been fully removed (per the recent refactors in the git log). This is a dead code artifact.
**Evidence:**
```typescript
export type AuditResourceType =
  | 'users'
  | 'checkins'
  | 'user_badges'
  | 'refresh_tokens'
  | 'reviews'    // <-- reviews system has been deleted
  | 'events'
  | 'venues'
  | 'bands';
```
**Recommended Fix:** Remove `'reviews'` from the union type.

---

### [BE-021]: FoursquareService and MusicBrainzService map functions reference stale total_reviews column
**Severity:** Low
**File(s):** `backend/src/services/FoursquareService.ts:309`, `backend/src/services/MusicBrainzService.ts:250`
**Description:** Both services' `mapDbVenueToVenue()` and `mapDbBandToBand()` methods read and return `total_reviews` from the database row. Since the reviews system has been removed and this column now reflects `checkin_band_ratings` counts (per `BandService.updateBandRating()`), the field name is misleading. This is cosmetic since the data source was updated, but the API contract still uses the name `totalReviews`.
**Evidence:**
```typescript
totalReviews: parseInt(row.total_reviews || 0),  // FoursquareService line 309
totalReviews: parseInt(row.total_reviews || 0),  // MusicBrainzService line 250
```
**Recommended Fix:** Consider aliasing this field to `totalRatings` in the API response to match the new data model. This is a breaking change for mobile clients, so coordinate with the mobile team.

---

### [BE-022]: WishlistService.getWishlist references b.total_checkins but maps it to totalReviews
**Severity:** Low
**File(s):** `backend/src/services/WishlistService.ts:157,252`
**Description:** The wishlist query selects `b.total_checkins as b_total_checkins` (line 157) but the mapper function assigns it to `totalReviews` (line 252: `totalReviews: parseInt(row.b_total_checkins) || 0`). The Band type interface uses `totalReviews` but the data now comes from `total_checkins` -- a semantic mismatch.
**Evidence:**
```typescript
b.total_checkins as b_total_checkins   // SQL query line 157
totalReviews: parseInt(row.b_total_checkins) || 0  // mapper line 252
```
**Recommended Fix:** Align the column name, alias, and interface property name. Since the reviews system is removed, all three should reference the same concept (total ratings or total checkins).

---

## Services Reviewed -- No Issues Found

The following services were reviewed and found to be well-implemented with no notable issues:

- **BlockService** -- Proper bilateral filtering, UUID validation for SQL interpolation, idempotent block/unblock
- **ConsentService** -- Correct append-only audit trail pattern, proper DISTINCT ON for current state
- **DataExportService** -- Comprehensive GDPR export with parallel queries, excludes password_hash
- **ClaimService** -- Proper transaction for admin review + entity update, partial unique index enforcement
- **FeedService** -- Well-implemented cursor-based pagination with cache-aside pattern
- **DiscoveryService** -- Correct CTE-based recommendation engine with cold-start fallback
- **UserDiscoveryService** -- Good shared-activity scoring algorithm with block filtering
- **RsvpService** -- Proper ON CONFLICT for race condition safety on toggle
- **PushNotificationService** -- Graceful degradation, stale token cleanup
- **ModerationService** -- Proper content hiding with feed cache invalidation
- **ReportService** -- Content validation, duplicate report handling via UNIQUE constraint
- **SearchService** -- Good two-tier search (FTS + fuzzy fallback)
- **StatsService** -- Efficient parallel subqueries with cache-aside
- **SyncScheduler** -- Idempotent repeatable job registration
- **EventSyncWorker** -- Proper concurrency=1 for rate limiting, graceful shutdown

---

## Recommendations for Beta Launch

### Must Fix Before Beta (Blockers)
1. **BE-001**: Add UNIQUE constraint and use INSERT ON CONFLICT for toasts
2. **BE-002**: Wrap rating updates in a database transaction
3. **BE-003**: Wrap check-in creation + vibe tags in a transaction

### Should Fix Before Beta (High)
4. **BE-004**: Fix getCheckinById error handling to distinguish 404 from 500
5. **BE-005**: Add statusCode to deleteCheckin errors
6. **BE-009**: Add block filter to event feed

### Can Fix During Beta (Medium/Low)
7. **BE-007**: Move TM daily counter to Redis (important if deploying frequently)
8. **BE-008**: Add Haversine NaN safety clamp
9. **BE-011**: Handle post-midnight check-ins for late shows
10. **BE-014**: Keep band rating aggregates fresh

---

*Report generated by Backend Architect Agent -- 2026-03-18*
