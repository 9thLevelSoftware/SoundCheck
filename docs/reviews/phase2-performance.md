# Phase 2: Performance Benchmarking Report

**Auditor:** Performance Benchmarker Agent
**Date:** 2026-03-18
**Scope:** All 47 service files (41 top-level + 6 checkin subdirectory), database config, Redis config, WebSocket infrastructure, caching layer
**Target:** Beta readiness for ~500-2,000 users with ~50,000 checkins, ~5,000 events
**Finding Count:** 22 findings (2 Blocker, 5 High, 10 Medium, 5 Low)

---

## Executive Summary

The SoundCheck backend has solid architectural foundations for beta scale -- cursor-based feed pagination, Redis cache-aside with TTL, fire-and-forget patterns for non-critical paths, and BullMQ for async badge evaluation. However, this performance audit identified **2 blockers**, **5 high-severity**, **10 medium-severity**, and **5 low-severity** issues that will degrade user experience or cause failures under concurrent beta load.

The most critical findings are: (1) the `cache.delPattern()` method uses Redis `KEYS` command which blocks the single-threaded Redis event loop and will stall all Redis operations under load, and (2) the WebSocket fan-out architecture iterates all connections in-memory per check-in with no back-pressure, creating O(followers * connections) CPU work that compounds under concurrent check-ins.

Cross-references to Phase 1 findings (DB-005 through DB-008, BE-001) are noted where relevant. This report focuses on performance characteristics not covered by the database or service-layer audits.

---

## Query Catalog Summary

Total unique SQL query patterns cataloged across all 47 service files: **~140 queries**.

| Category | Count | Notable Concerns |
|----------|-------|-----------------|
| Simple lookups (PK/FK) | 48 | Well-indexed, < 1ms expected |
| List/search with pagination | 26 | Some missing indexes (DB-004, DB-007, DB-016) |
| Aggregation / analytics | 24 | WrappedService runs 9 sequential aggregate queries; UserStats runs 7 subqueries |
| Writes (INSERT/UPDATE/DELETE) | 22 | Non-transactional paths (DB-003, BE-002) |
| Correlated subqueries | 12 | EventService checkin_count in 10+ locations (DB-005) |
| CTE / window-function queries | 4 | DiscoveryService recommendations, SearchService FTS+fuzzy |
| Haversine distance queries | 6 | 2 missing bounding-box pre-filter (DB-018) |

---

## Findings

### [PERF-001]: `cache.delPattern()` uses Redis `KEYS` command -- blocks entire Redis instance
**Severity:** Blocker
**File(s):** `backend/src/utils/cache.ts:217`
**Description:** The `delPattern()` method calls `redis.keys(pattern)` to find matching keys, then bulk-deletes them. The Redis `KEYS` command is O(N) where N is the total number of keys in the database, and it blocks the single-threaded Redis event loop until completion. At beta scale, every check-in triggers `cache.delPattern('feed:friends:${followerId}:*')` for each follower, plus `cache.delPattern('feed:global:*')`. With 2,000 users and active feed caching, the Redis keyspace will contain thousands of keys. Each `KEYS` call blocks all other Redis operations (rate limiting, cache reads, BullMQ job dispatch, Pub/Sub) for the duration of the scan. Under sustained check-in load (e.g., 20 concurrent check-ins at a concert), multiple `KEYS` calls will serialize and stall the entire Redis instance, causing cascading timeouts across rate limiting, feed reads, and badge job dispatch.
**Evidence:**
```typescript
// cache.ts:217 -- KEYS is O(N) on total keyspace, blocks Redis
async delPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(pattern);  // <-- BLOCKS REDIS
      if (keys.length > 0) {
        await redis.del(...keys);
      }
```
This is called from:
- `CheckinCreatorService.ts:463` -- `cache.delPattern('feed:friends:${followerId}:*')` per follower
- `CheckinCreatorService.ts:469` -- `cache.delPattern('feed:event:${eventId}:*')`
- `FeedService.ts:452` -- `cache.delPattern('feed:friends:${userId}:*')`
- `FeedService.ts:465` -- `cache.delPattern('feed:event:${eventId}:*')`
- `FeedService.ts:477` -- `cache.delPattern('feed:global:*')`

For a user with 100 followers, a single check-in triggers 102 `KEYS` scans (100 follower friend feeds + 1 event feed + 1 global feed).
**Recommended Fix:** Replace `redis.keys()` with `redis.scanStream()` using `SCAN` (non-blocking cursor-based iteration). Better yet, switch to a key naming convention that allows direct `DEL` without pattern matching: instead of `feed:friends:${userId}:${cursor}`, use a single key `feed:friends:${userId}` storing the serialized page, or use Redis hash sets. For immediate mitigation, use `UNLINK` instead of `DEL` for non-blocking key removal. Alternatively, use a generation counter: store `feed:friends:${userId}:gen` and increment it on invalidation -- cache reads compare the gen counter and treat stale entries as misses, avoiding pattern deletion entirely.

---

### [PERF-002]: WebSocket fan-out iterates all connections with no back-pressure or batching
**Severity:** Blocker
**File(s):** `backend/src/utils/websocket.ts:302-308`, `backend/src/services/checkin/CheckinCreatorService.ts:564-581`
**Description:** When a user checks in, `CheckinCreatorService.publishCheckinAndNotify()` queries all follower IDs, then for each follower: (a) pushes to a Redis notification batch list via `redis.rpush()`, (b) sets TTL via `redis.expire()`, and (c) enqueues a BullMQ job. This is O(followers) sequential Redis commands per check-in. On the WebSocket side, `handleCheckinPubSub()` iterates all follower IDs and for each one calls `sendToUser()`, which itself iterates the entire `clients` Map to find matching userId connections -- making it O(followers * total_connections). With 500 concurrent WebSocket connections and a popular user with 200 followers, a single check-in triggers 200 * 500 = 100,000 Map iterations. Under 10 concurrent check-ins, this becomes 1M iterations on the event loop, blocking all WebSocket message processing.
**Evidence:**
```typescript
// websocket.ts:302-308 -- O(clients.size) per follower
sendToUser(userId: string, type: string, payload: any): void {
  for (const [clientId, client] of this.clients.entries()) {
    if (client.userId === userId) {
      this.send(clientId, type, payload);
    }
  }
}

// CheckinCreatorService.ts:564-581 -- O(followers) sequential Redis ops
for (const followerId of followerIds) {
  const listKey = `notif:batch:${followerId}`;
  await redis.rpush(listKey, notifData);    // sequential await
  await redis.expire(listKey, 300);         // sequential await
  if (notificationQueue) {
    await notificationQueue.add(...);       // sequential await
  }
}
```
**Recommended Fix:** (1) Index WebSocket clients by userId using a `Map<string, Set<string>>` (userId -> clientIds) for O(1) user lookup instead of O(N) iteration. (2) Use Redis pipeline for batch `RPUSH` + `EXPIRE` operations instead of sequential awaits -- reduces round trips from 2*N to 1. (3) Add back-pressure: if follower count exceeds a threshold (e.g., 50), chunk the fan-out with `setImmediate()` between batches to yield the event loop.

---

### [PERF-003]: Feed queries execute 2 EXISTS subqueries per row -- O(rows * 2) index lookups
**Severity:** High
**File(s):** `backend/src/services/FeedService.ts:103-112`, `backend/src/services/FeedService.ts:259-268`
**Description:** The friends feed and global feed queries include two EXISTS subqueries per checkin row: (1) `EXISTS(SELECT 1 FROM user_badges ub WHERE ub.user_id = c.user_id AND ub.earned_at >= c.created_at - INTERVAL '1 minute' AND ub.earned_at <= c.created_at + INTERVAL '1 hour')` for badge detection, and (2) `EXISTS(SELECT 1 FROM toasts t2 WHERE t2.checkin_id = c.id AND t2.user_id = $1)` for toast status. For a feed page of 20 items, this executes 40 additional index seeks. The badge EXISTS is particularly expensive because it uses a time-range condition on `earned_at` which requires a range scan rather than a point lookup, and there is no composite index on `(user_id, earned_at)` in the user_badges table.
**Evidence:**
```sql
-- FeedService.ts:103-108 -- badge EXISTS: range scan per row
EXISTS(
  SELECT 1 FROM user_badges ub
  WHERE ub.user_id = c.user_id
    AND ub.earned_at >= c.created_at - INTERVAL '1 minute'
    AND ub.earned_at <= c.created_at + INTERVAL '1 hour'
) AS has_badge_earned
```
At 50,000 checkins and ~500 user_badges rows, the time-range condition requires scanning user_badges per feed item. With 20 items per page, this is 20 range scans plus 20 point lookups (toasts). Estimated per-page overhead: 5-15ms additional latency.
**Recommended Fix:** (1) Add a composite index: `CREATE INDEX idx_user_badges_user_earned ON user_badges (user_id, earned_at DESC)`. (2) Consider moving `has_badge_earned` to a denormalized boolean column on checkins, set by the badge evaluation job when it awards a badge (since badges are already tied to a specific check-in via `earned_checkin_id`). This eliminates the subquery entirely.

---

### [PERF-004]: WrappedService runs 9 sequential aggregate queries without caching
**Severity:** High
**File(s):** `backend/src/services/WrappedService.ts:60-107`
**Description:** `getWrappedDetailStats()` runs `getWrappedStats()` (4 parallel queries) followed by 4 additional parallel queries -- but `getWrappedStats()` itself is called as part of the parallel batch in `getWrappedDetailStats()`, so 8 queries run in two parallel batches. Each query scans the checkins table with `EXTRACT(YEAR FROM c.created_at) = $2`, which cannot use a standard btree index on `created_at` (function application prevents index usage). At 50,000 checkins, each of these 8 queries performs a sequential scan of the checkins table filtered by user_id. The `getFriendOverlap()` query at line 264-288 performs a self-join on checkins (`c1 JOIN c2 ON c1.event_id = c2.event_id`) which is O(checkins^2) for the user's event set. There is no caching -- every Wrapped request recomputes from scratch.
**Evidence:**
```typescript
// WrappedService.ts:91-98 -- 8 queries, no cache
const [basicStats, monthlyBreakdown, genreEvolution, friendOverlap, topRatedSets] =
  await Promise.all([
    this.getWrappedStats(userId, year),      // 4 parallel queries inside
    this.getMonthlyBreakdown(userId, year),
    this.getGenreEvolution(userId, year),
    this.getFriendOverlap(userId, year),     // self-join on checkins
    this.getTopRatedSets(userId, year),
  ]);
```

```sql
-- WrappedService.ts:117 -- EXTRACT prevents index usage
AND EXTRACT(YEAR FROM c.created_at) = $2
```

```sql
-- WrappedService.ts:270-271 -- O(n^2) self-join
FROM checkins c1
JOIN checkins c2 ON c1.event_id = c2.event_id AND c1.user_id != c2.user_id
```
**Recommended Fix:** (1) Add Redis caching with a long TTL (e.g., 1 hour) since Wrapped data is historical and changes infrequently. (2) Replace `EXTRACT(YEAR FROM c.created_at) = $2` with `c.created_at >= '$year-01-01'::timestamptz AND c.created_at < '$nextYear-01-01'::timestamptz` to enable the existing `idx_checkins_created_at` index. (3) Add the existing `idx_checkins_user_created` index usage by filtering on `user_id` first (verify this composite index exists). (4) For the friend overlap self-join, use a CTE to pre-filter the user's event IDs first, then join only on that subset.

---

### [PERF-005]: Notification query joins 8 tables with no index on `notifications.user_id + created_at`
**Severity:** High
**File(s):** `backend/src/services/NotificationService.ts:98-142`
**Description:** `getNotifications()` executes a query joining `notifications`, `users`, `checkins`, `bands` (x2), `venues` (x2), `badges`, `events`, and `event_lineup` -- 8 LEFT JOINs total. It is followed by two additional COUNT queries (unread count and total count) that scan the notifications table independently. The query uses `ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`, but there is no evidence of a composite index on `(user_id, created_at DESC)` for the notifications table. At beta scale, a user with 500 notifications will require a sort operation on unindexed data for each page load. The three serial queries (main + unread count + total count) could be parallelized.
**Evidence:**
```sql
-- NotificationService.ts:129-142 -- 8 LEFT JOINs, no composite index
FROM notifications n
LEFT JOIN users fu ON n.from_user_id = fu.id
LEFT JOIN checkins c ON n.checkin_id = c.id
LEFT JOIN bands cb ON c.band_id = cb.id
LEFT JOIN venues cv ON c.venue_id = cv.id
LEFT JOIN badges b ON n.badge_id = b.id
LEFT JOIN events ev ON n.event_id = ev.id
LEFT JOIN venues evv ON ev.venue_id = evv.id
LEFT JOIN event_lineup el ON ev.id = el.event_id AND el.is_headliner = true
LEFT JOIN bands evb ON el.band_id = evb.id
WHERE n.user_id = $1
ORDER BY n.created_at DESC
LIMIT $2 OFFSET $3
```

```typescript
// NotificationService.ts:147-159 -- 2 additional sequential COUNT queries
const unreadResult = await this.db.query(
  'SELECT COUNT(*) ... WHERE user_id = $1 AND is_read = FALSE', [userId]);
const totalResult = await this.db.query(
  'SELECT COUNT(*) ... WHERE user_id = $1', [userId]);
```
**Recommended Fix:** (1) Add composite index: `CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC)`. (2) Fold the unread count and total count into the main query using window functions: `COUNT(*) FILTER (WHERE NOT is_read) OVER() AS unread_count, COUNT(*) OVER() AS total_count`. This eliminates 2 round trips. (3) As noted in Phase 1 (BE-017), the `event_lineup` JOIN can produce duplicates if multiple headliners exist -- add `LIMIT 1` via a LATERAL subquery.

---

### [PERF-006]: UserDiscoveryService recommendation query is O(users * checkins) with no result limit on intermediate CTEs
**Severity:** High
**File(s):** `backend/src/services/UserDiscoveryService.ts:51-98`
**Description:** The `getSuggestions()` query uses 3 CTEs (`user_bands`, `user_venues`, `candidates`) where the `candidates` CTE joins `users` with `checkins` and performs LEFT JOINs against `event_lineup` and a subquery of shared venues. The query scans all checkins for all users who share at least one band or venue with the requesting user -- at 2,000 users and 50,000 checkins, this involves scanning tens of thousands of rows. The `user_bands` and `user_venues` CTEs are unbounded (no LIMIT), and PostgreSQL materializes CTEs by default in older versions (though PG12+ may inline them). The `shared_venue` subquery (lines 74-79) performs a nested scan of `checkins` joined with `events` filtered by `venue_id IN (SELECT ...)`.
**Evidence:**
```sql
-- UserDiscoveryService.ts:64-89 -- candidates CTE scans all user checkins
candidates AS (
  SELECT u.id, ... FROM users u
  JOIN checkins c ON c.user_id = u.id
  LEFT JOIN event_lineup shared_band ON shared_band.event_id = c.event_id
    AND shared_band.band_id IN (SELECT band_id FROM user_bands)
  LEFT JOIN (
    SELECT c2.user_id, e.venue_id FROM checkins c2
    JOIN events e ON c2.event_id = e.id
    WHERE e.venue_id IN (SELECT venue_id FROM user_venues)
  ) shared_venue ON shared_venue.user_id = u.id
  WHERE u.id != $1 AND u.is_active = true ...
  GROUP BY u.id, u.total_checkins
  HAVING COUNT(c.id) > 0
)
```
Estimated execution time at beta scale: 200-800ms depending on how many shared bands/venues exist.
**Recommended Fix:** The 5-minute Redis cache (line 115) partially mitigates this, but the cold-cache penalty is significant. (1) Add LIMIT to the intermediate CTEs to cap the working set. (2) Consider pre-computing suggestion scores in a background job (BullMQ) rather than computing on demand. (3) Add an index on `event_lineup(band_id, event_id)` if not already present to speed up the shared_band JOIN.

---

### [PERF-007]: TrendingService query computes Haversine + Wilson + 3 LATERAL subqueries per event
**Severity:** High
**File(s):** `backend/src/services/TrendingService.ts:40-106`
**Description:** The `getTrendingNearUser()` query is one of the most complex in the codebase. For each event, it computes: (1) Haversine distance, (2) RSVP count via LATERAL subquery, (3) check-in velocity via LATERAL subquery with block filter, (4) friend signal count via LATERAL subquery with block filter, (5) Wilson lower bound scoring, and (6) lineup band aggregation via a correlated subquery. The LATERAL subqueries execute per-row against `event_rsvps`, `checkins`, and `user_followers`. The block filter SQL (string-interpolated) adds an EXISTS subquery inside each LATERAL. With 5,000 events, even with the bounding-box pre-filter, a 80km radius in a metro area could match 500+ events, each requiring 3 LATERAL subquery evaluations plus a correlated array aggregation.
**Evidence:**
```sql
-- TrendingService.ts:74-94 -- 3 LATERAL subqueries per event
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS rsvp_count FROM event_rsvps er WHERE er.event_id = e.id
) rsvp_stats ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS checkin_velocity FROM checkins c
  WHERE c.event_id = e.id AND c.created_at >= NOW() - INTERVAL '7 days' AND c.is_hidden IS NOT TRUE
  ${this.blockService.getBlockFilterSQL(userId, 'c.user_id')}
) velocity_stats ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT er.user_id)::int AS friend_signals FROM event_rsvps er
  JOIN user_followers uf ON er.user_id = uf.following_id
  WHERE er.event_id = e.id AND uf.follower_id = $1
  ${this.blockService.getBlockFilterSQL(userId, 'er.user_id')}
) friend_stats ON TRUE
```
Estimated execution time at beta scale: 300-1200ms depending on event density in the search radius. This is the most likely endpoint to exceed the 500ms target.
**Recommended Fix:** (1) Cache results aggressively (this endpoint has no caching currently). Add Redis cache with 60-120 second TTL keyed on `trending:${userId}:${lat.toFixed(1)}:${lon.toFixed(1)}`. (2) Pre-compute RSVP counts as a denormalized column on events (updated by trigger or on RSVP toggle). (3) Pre-compute check-in velocity in a scheduled job and store in a materialized view or denormalized column. (4) Replace the inline block filter with a pre-computed blocked-user set passed as a parameter.

---

### [PERF-008]: CheckinRatingService.addRatings executes N+2 sequential queries per band without transaction
**Severity:** Medium
**File(s):** `backend/src/services/checkin/CheckinRatingService.ts:62-97`
**Description:** For each band rating submitted, `addRatings()` executes: (1) a lineup verification query, (2) a band rating UPSERT. After all bands, it executes: (3) an AVG query, (4) a legacy rating UPDATE. With 4 bands in a typical lineup, this is 10 sequential database round trips (1 ownership check + 4 lineup checks + 4 upserts + 1 avg + 1 update = 11 queries). As noted in Phase 1 (BE-002), these are not wrapped in a transaction. The performance concern is that each query incurs a network round-trip to PostgreSQL (~0.5-2ms on Railway's internal network), so 11 queries adds 5-22ms of pure round-trip overhead before query execution time.
**Evidence:**
```typescript
// CheckinRatingService.ts:67-84 -- N sequential query pairs per band
for (const br of ratings.bandRatings) {
  this.validateRating(br.rating);
  if (eventId) {
    const lineupCheck = await this.db.query(
      'SELECT 1 FROM event_lineup WHERE event_id = $1 AND band_id = $2',
      [eventId, br.bandId]
    );
  }
  await this.db.query(
    `INSERT INTO checkin_band_ratings ... ON CONFLICT ... DO UPDATE SET rating = $3`,
    [checkinId, br.bandId, br.rating]
  );
}
```
**Recommended Fix:** (1) Batch the lineup verification into a single query: `SELECT band_id FROM event_lineup WHERE event_id = $1 AND band_id = ANY($2::uuid[])`. (2) Batch the UPSERTS using a single multi-row INSERT with `unnest()`: `INSERT INTO checkin_band_ratings SELECT $1, unnest($2::uuid[]), unnest($3::numeric[]) ON CONFLICT DO UPDATE`. (3) Wrap in a transaction (as recommended by BE-002).

---

### [PERF-009]: EventService.getEventById fires 3 serial queries instead of 1 joined query
**Severity:** Medium
**File(s):** `backend/src/services/EventService.ts:147-196`
**Description:** `getEventById()` executes three separate queries: (1) event + venue data, (2) lineup with band details, (3) checkin count. These could be reduced to a single query or at minimum parallelized with `Promise.all()`. Since this method is called at the end of `createEventCheckin()` to return the full check-in details, and is also called by `createEvent()`, the overhead is incurred on every check-in creation.
**Evidence:**
```typescript
// EventService.ts:160-185 -- 3 serial queries
const eventResult = await this.db.query(eventQuery, [eventId]);
const lineupResult = await this.db.query(lineupQuery, [eventId]);
const countResult = await this.db.query(countQuery, [eventId]);
```
Additionally, the checkin count query `SELECT COUNT(*) FROM checkins WHERE event_id = $1` recomputes from checkins despite the `events.total_checkins` denormalized column being maintained by triggers (same issue as DB-005).
**Recommended Fix:** (1) Replace the COUNT query with `e.total_checkins` from the first query. (2) Execute the event and lineup queries in parallel with `Promise.all()`. (3) Consider combining event+lineup into a single query using `json_agg()` for the lineup, though this trades readability for performance.

---

### [PERF-010]: FollowService.getFollowers/getFollowing execute redundant COUNT query
**Severity:** Medium
**File(s):** `backend/src/services/FollowService.ts:87-133`, `backend/src/services/FollowService.ts:139-185`
**Description:** Both `getFollowers()` and `getFollowing()` execute three sequential queries: (1) user existence check, (2) COUNT for total, (3) paginated data fetch. The user existence check is redundant when called from an authenticated endpoint (the auth middleware already validated the user). The COUNT query scans the entire followers set for the user. These three queries could be reduced to one by using `COUNT(*) OVER()` in the main query.
**Evidence:**
```typescript
// FollowService.ts:92-124 -- 3 serial queries
const userCheckResult = await this.db.query(userCheckQuery, [userId]);
const countResult = await this.db.query(countQuery, [userId]);
const result = await this.db.query(query, [userId, limit, offset]);
```
**Recommended Fix:** Fold the COUNT into the main query using `COUNT(*) OVER() AS total_count` and remove the user existence pre-check (or make it conditional on whether the caller is viewing their own profile vs. another user's).

---

### [PERF-011]: PostgreSQL connection pool hardcoded at 20 -- may be insufficient or wasteful
**Severity:** Medium
**File(s):** `backend/src/config/database.ts:64-66`
**Description:** The PostgreSQL pool is configured with `max: 20` connections. Railway's free/hobby tier PostgreSQL instances typically allow 20-50 max connections. With `max: 20` in the pool and BullMQ workers potentially running in the same process (each needing their own connection for blocking operations), the effective available connections for HTTP request handling may be lower. Under sustained load with 50 concurrent requests (realistic at a concert with 200 users), connection queueing will add latency. The `connectionTimeoutMillis: 2000` means any request waiting more than 2 seconds for a connection will throw an error. Conversely, if Railway provides 100 max connections, 20 is underutilizing capacity.
**Evidence:**
```typescript
// database.ts:64-66 -- hardcoded pool size
this.pool = new Pool({
  connectionString,
  ssl: sslConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```
**Recommended Fix:** (1) Make pool size configurable via `DB_POOL_SIZE` environment variable with a sensible default: `max: parseInt(process.env.DB_POOL_SIZE || '20')`. (2) Set the pool size to roughly `(Railway max connections - 5 reserved for BullMQ workers - 2 reserved for migrations) / number of application instances`. (3) Add pool monitoring: log when pool utilization exceeds 80% (`pool.totalCount`, `pool.idleCount`, `pool.waitingCount`). (4) Consider adding `statement_timeout` to prevent long-running queries from holding connections: `this.pool.query("SET statement_timeout = '30s'")`.

---

### [PERF-012]: Rate limiter sorted set keys accumulate without bounded TTL alignment
**Severity:** Medium
**File(s):** `backend/src/utils/redisRateLimiter.ts:93-99`
**Description:** The sliding window rate limiter uses Redis sorted sets with `ZADD` for each request. The `PEXPIRE` on line 99 resets the TTL on every request, so the key lives as long as the user keeps making requests. Each request adds a new member to the sorted set (`${now}-${Math.random()}`). While `ZREMRANGEBYSCORE` cleans old entries, the key itself persists. With 2,000 users hitting the API regularly, this creates 2,000+ persistent sorted set keys. Each member is ~30 bytes (timestamp + random string), and at 100 requests/window, a key holds ~3KB. Total memory: ~6MB -- manageable, but the `Math.random()` member value means entries are never truly deduplicated (each request creates a unique member).
**Evidence:**
```typescript
// redisRateLimiter.ts:96-99
pipeline.zremrangebyscore(key, 0, windowStart);
pipeline.zcard(key);
pipeline.zadd(key, now, `${now}-${Math.random()}`);
pipeline.pexpire(key, windowMs);
```
**Recommended Fix:** This is acceptable at beta scale. For post-beta optimization: (1) Use a simpler counter-based rate limiter with `INCR` + `EXPIRE` (less memory, O(1) per check) since the sliding window precision is unnecessary for API rate limiting. (2) If sliding window is needed, use a fixed-bucket approach with `${now}-${Math.floor(Math.random() * 100)}` to cap the maximum entries per key.

---

### [PERF-013]: CheckinCreatorService.invalidateFeedCachesForCheckin queries followers twice
**Severity:** Medium
**File(s):** `backend/src/services/checkin/CheckinCreatorService.ts:450-484`, `backend/src/services/checkin/CheckinCreatorService.ts:509-523`
**Description:** When a check-in is created, two separate methods query the same followers list: `invalidateFeedCachesForCheckin()` at line 453 queries `SELECT follower_id FROM user_followers WHERE following_id = $1`, and `publishCheckinAndNotify()` at line 511 queries the same table again. This is 2 identical queries for the same data in the same request. For a user with 200 followers, the result set is small but the duplicate query wastes a database round trip.
**Evidence:**
```typescript
// CheckinCreatorService.ts:453 -- first follower query
const followerResult = await this.db.query(
  'SELECT follower_id FROM user_followers WHERE following_id = $1', [userId]);

// CheckinCreatorService.ts:511 -- same query again in publishCheckinAndNotify()
const [followerResult, userResult, venueResult] = await Promise.all([
  this.db.query('SELECT follower_id FROM user_followers WHERE following_id = $1', [userId]),
  ...
]);
```
**Recommended Fix:** Query followers once in `createEventCheckin()` and pass the result to both `invalidateFeedCachesForCheckin()` and `publishCheckinAndNotify()` as a parameter.

---

### [PERF-014]: StatsService.getBasicStats uses 6 scalar subqueries including a multi-table JOIN
**Severity:** Medium
**File(s):** `backend/src/services/StatsService.ts:61-69`
**Description:** The `getBasicStats()` query executes 6 scalar subqueries in a single SELECT (total shows, unique bands via join, unique venues, badges, followers, following). The `unique_bands` subquery joins `checkins` with `event_lineup`, counting distinct `band_id` -- this is correct but expensive. It scans all of the user's checkins and joins each to `event_lineup`. With 100 checkins per user and 3 lineup entries per event, this touches ~300 rows. The users table already has denormalized `total_checkins`, `unique_bands`, and `unique_venues` columns (maintained by triggers), which are not being used here. This is the same issue as DB-006 but in StatsService rather than UserService.
**Evidence:**
```sql
-- StatsService.ts:63-68 -- 6 subqueries, ignoring denormalized columns
(SELECT COUNT(DISTINCT c.id)::int FROM checkins c WHERE c.user_id = $1 ...) as total_shows,
(SELECT COUNT(DISTINCT el.band_id)::int FROM checkins c
  JOIN event_lineup el ON c.event_id = el.event_id
  WHERE c.user_id = $1 ...) as unique_bands,
(SELECT COUNT(DISTINCT c.venue_id)::int FROM checkins c WHERE c.user_id = $1 ...) as unique_venues,
...
```
**Recommended Fix:** The 10-minute Redis cache (`CONCERT_CRED_TTL = 600`) mitigates this for hot paths. For cold-cache or first-load: read `total_checkins`, `unique_bands`, `unique_venues` from the `users` table row (one indexed lookup) and only compute badges/followers/following as subqueries. This reduces 6 subqueries to 3.

---

### [PERF-015]: SearchService.searchUsers includes an unbounded COUNT subquery per user row
**Severity:** Medium
**File(s):** `backend/src/services/SearchService.ts:192-204`
**Description:** The user search query includes `(SELECT COUNT(*)::int FROM checkins WHERE user_id = u.id) AS total_checkins` as a correlated subquery in the SELECT list. This computes the check-in count for every matching user row. For a broad search term like "a" that matches many usernames, this could execute hundreds of COUNT subqueries. The CASE-based ORDER BY then sorts by `total_checkins DESC`, ensuring the subquery must execute for all matching rows before sorting can occur.
**Evidence:**
```sql
-- SearchService.ts:192
(SELECT COUNT(*)::int FROM checkins WHERE user_id = u.id) AS total_checkins
-- Used in ORDER BY at line 203:
ORDER BY CASE ... END, total_checkins DESC
```
**Recommended Fix:** Use the denormalized `u.total_checkins` column from the users table instead of recomputing via subquery. The users table already has this column maintained by triggers.

---

### [PERF-016]: BandService.searchBands uses ILIKE with leading wildcard on unnested genres array
**Severity:** Medium
**File(s):** `backend/src/services/BandService.ts:97`
**Description:** The `searchBands()` method uses `ILIKE $1` with a `%query%` pattern on `name`, `description`, `hometown`, and an `EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $1)` subquery. The `unnest()` + ILIKE on the genres array column cannot use any index and requires scanning and unnesting the array for every row that passes the other conditions. At 2,000 bands with ~3 genres each, this processes 6,000 string comparisons per search. While the SearchService has tsvector-indexed search, BandService.searchBands is a separate code path used by the band CRUD API.
**Evidence:**
```sql
-- BandService.ts:97
(name ILIKE $1 OR description ILIKE $1
 OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE $1)
 OR hometown ILIKE $1)
```
**Recommended Fix:** (1) For the genres array, use the GIN index on `genres` with `@>` operator: `genres @> ARRAY[$1]` for exact match, or use the `search_vector` tsvector column (already created by migration 034) which includes genres. (2) Redirect searches to `SearchService.searchBands()` which uses tsvector + trigram indexes for O(1) lookups instead of O(N) ILIKE scans.

---

### [PERF-017]: VenueService.getVenuesNear computes Haversine for all venues without bounding-box pre-filter
**Severity:** Medium
**File(s):** `backend/src/services/VenueService.ts:271-287`
**Description:** This is the performance implication of DB-018. `getVenuesNear()` computes the Haversine distance formula for every active venue with non-null coordinates. At beta scale with ~500 venues, this computes 500 trigonometric expressions per query. The EventService's `getNearbyUpcoming()` correctly uses a bounding-box pre-filter (`latitude BETWEEN ... AND ...`) before Haversine, reducing the working set to ~50 venues in a typical metro area. VenueService lacks this optimization.
**Evidence:**
```sql
-- VenueService.ts:276-283
FROM venues WHERE is_active = true AND latitude IS NOT NULL AND longitude IS NOT NULL
-- No bounding box -- computes Haversine for ALL venues
```
Compare with EventService.ts:620-621 which correctly uses a bounding box.
**Recommended Fix:** Add the bounding-box pre-filter: `AND latitude BETWEEN ($1 - $3 / 111.0) AND ($1 + $3 / 111.0) AND longitude BETWEEN ($2 - $3 / (111.0 * cos(radians($1)))) AND ($2 + $3 / (111.0 * cos(radians($1))))`.

---

### [PERF-018]: No Redis memory limit or eviction policy configured
**Severity:** Low
**File(s):** `backend/src/utils/redisRateLimiter.ts:31-38`, `backend/src/config/redis.ts:36-47`
**Description:** Neither the rate limiter Redis connection nor the BullMQ Redis connection configures a `maxmemory` or `maxmemory-policy`. Railway's Redis instances have a memory limit based on the plan, but the application does not set an eviction policy. If Redis memory fills up (from rate limiter sorted sets, feed cache entries, notification batch lists, BullMQ job data), Redis will start rejecting writes with OOM errors. The rate limiter has a fail-closed design (denies requests when Redis errors), so an OOM would effectively deny all API traffic.
**Evidence:**
```typescript
// redisRateLimiter.ts:31-38 -- no maxmemory-policy
redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) { ... },
  lazyConnect: false,
  // No maxmemory or eviction config
});
```
**Recommended Fix:** Configure Redis with `allkeys-lru` eviction policy via the Railway Redis dashboard or via `redis.config('SET', 'maxmemory-policy', 'allkeys-lru')` on connection. This ensures cache keys are evicted under memory pressure rather than failing writes. Rate limiter keys should use `volatile-lru` so only keys with TTL are evicted.

---

### [PERF-019]: WebSocket heartbeat interval is 30s with no connection limit
**Severity:** Low
**File(s):** `backend/src/utils/websocket.ts:353-365`, `backend/src/utils/websocket.ts:48`
**Description:** The WebSocket server has no maximum connection limit. The `clients` Map grows unboundedly with each new connection. The 30-second heartbeat interval pings every client, which at 500 connections generates 500 ping frames every 30 seconds (~17 pings/second). Each ping requires a pong response, so the server processes 34 WebSocket control frames per second under full load. This is manageable but becomes a concern at 2,000 connections (67 pings/second). The in-memory rate limiter (100 messages per 10 seconds per client) is per-connection, not per-user -- a malicious user with 10 connections gets 10x the message rate.
**Evidence:**
```typescript
// websocket.ts:48
private clients: Map<string, Client> = new Map(); // unbounded

// websocket.ts:353 -- 30s heartbeat pings all clients
this.heartbeatInterval = setInterval(() => {
  for (const [clientId, client] of this.clients.entries()) {
    // ...
    client.ws.ping();
  }
}, 30000);
```
**Recommended Fix:** (1) Add a connection limit (e.g., 1000) and reject new connections beyond it with a 503 status. (2) Limit connections per user (e.g., 3) to prevent connection multiplication. (3) Consider increasing the heartbeat interval to 60s for beta scale.

---

### [PERF-020]: DataExportService.getCheckins has unbounded SELECT (cross-ref DB-019)
**Severity:** Low
**File(s):** `backend/src/services/DataExportService.ts:175-186`
**Description:** As noted in DB-019, the GDPR export `getCheckins()` has no LIMIT clause. Additionally, the `exportUserData()` method at line 110 runs 8 parallel unbounded queries (checkins, followers, following, wishlist, badges, toasts, comments, notifications) in a single `Promise.all()`. For a power user, this could pull thousands of rows across 8 tables simultaneously, consuming 8 pool connections and significant memory for JSON serialization. At beta scale this is unlikely to be a practical problem (GDPR exports are rare), but it represents the largest single-request resource consumption in the codebase.
**Recommended Fix:** Add reasonable LIMIT clauses to each export query (e.g., 10,000 per table) and implement streaming/pagination for exports exceeding the limit. For beta, document that exports for users with >10,000 checkins may timeout.

---

### [PERF-021]: DiscoveryService.computeRecommendations has unbounded exclusion subquery
**Severity:** Low
**File(s):** `backend/src/services/DiscoveryService.ts:194`
**Description:** The recommendation query excludes already-attended events with `e.id NOT IN (SELECT event_id FROM checkins WHERE user_id = $1 AND event_id IS NOT NULL)`. This `NOT IN` subquery scans all of the user's checkins to build the exclusion list. With a power user at 200 checkins, this materializes 200 UUIDs in an exclusion set. The `NOT IN` anti-pattern with nullable columns is safe here (the query filters `event_id IS NOT NULL`), but `NOT EXISTS` would be more efficient as it short-circuits on the first match.
**Evidence:**
```sql
AND e.id NOT IN (SELECT event_id FROM checkins WHERE user_id = $1 AND event_id IS NOT NULL)
```
**Recommended Fix:** Replace with `AND NOT EXISTS (SELECT 1 FROM checkins WHERE user_id = $1 AND event_id = e.id)`. This allows PostgreSQL to use an index seek per event rather than materializing the full exclusion list.

---

### [PERF-022]: OnboardingService.saveGenrePreferences uses DELETE + INSERT instead of UPSERT
**Severity:** Low
**File(s):** `backend/src/services/OnboardingService.ts:26-43`
**Description:** `saveGenrePreferences()` deletes all existing genre preferences, then re-inserts the new set. This is not wrapped in a transaction. Under concurrent requests (e.g., user double-taps "Save"), the DELETE from one request could clear genres inserted by the other. The ON CONFLICT clause on the INSERT handles the duplicate case, but the DELETE is not conditioned on the new genre set. Performance-wise, the DELETE + INSERT generates 2 WAL entries and fires any relevant triggers twice, compared to a single UPSERT.
**Evidence:**
```typescript
// OnboardingService.ts:26-43
await this.db.query('DELETE FROM user_genre_preferences WHERE user_id = $1', [userId]);
// ...
await this.db.query(`INSERT INTO user_genre_preferences ... ON CONFLICT ... DO NOTHING`, params);
```
**Recommended Fix:** Wrap in a transaction, or use a single `INSERT ... ON CONFLICT DO NOTHING` followed by `DELETE FROM user_genre_preferences WHERE user_id = $1 AND genre NOT IN (...)` to only remove preferences not in the new set.

---

## Concurrency Risk Matrix

| Risk | Severity | Mechanism | Mitigation Status |
|------|----------|-----------|-------------------|
| Duplicate check-ins (same user, same event) | Low | Partial unique index `idx_unique_user_event_checkin` | **Protected** -- 23505 error caught at CheckinCreatorService.ts:137 |
| Duplicate toasts (same user, same checkin) | High | No UNIQUE constraint; TOCTOU at CheckinToastService.ts:29-41 | **Unprotected** -- flagged as BE-001 in Phase 1 |
| Concurrent badge evaluation for same user | Low | BullMQ jobId dedup `badge-eval-${userId}-${checkinId}` + ON CONFLICT on user_badges | **Protected** -- jobId prevents duplicate jobs, ON CONFLICT prevents duplicate awards |
| Follow/unfollow rapid toggle | Low | ON CONFLICT DO NOTHING on follow; simple DELETE on unfollow | **Partially protected** -- no counter drift risk since followers are counted via query, not denormalized |
| Rating update race (two devices submit ratings simultaneously) | Medium | No transaction wrapping (BE-002); last-write-wins on UPSERT | **Partially protected** -- UPSERT prevents duplicates but partial writes can occur |
| WebSocket Pub/Sub message ordering | Low | Single Redis Pub/Sub channel `checkin:new` | **Acceptable** -- message ordering within a single channel is guaranteed by Redis |
| Check-in creation stats trigger + application retry | High | INSERT trigger fires before potential vibe-tag failure (DB-003) | **Unprotected** -- flagged as DB-003 in Phase 1 |
| Feed cache invalidation during concurrent reads | Low | Cache-aside with TTL; `KEYS` pattern deletion (PERF-001) | **Functionally correct** but `KEYS` is a blocking performance risk |
| Rate limiter Redis pipeline atomicity | Low | Pipeline executes ZREMRANGEBYSCORE + ZCARD + ZADD atomically | **Protected** -- pipeline ensures consistent window count |
| Notification batch Redis list race | Low | RPUSH is atomic; BullMQ jobId dedup prevents duplicate batch jobs | **Protected** |

---

## Response Time Estimates at Beta Scale (2,000 users, 50K checkins, 5K events)

| Endpoint | Cold Cache | Warm Cache | Target | Status |
|----------|-----------|-----------|--------|--------|
| **GET /feed/friends** | 80-150ms | 5-10ms | < 200ms | MEETS (with cursor index from DB-007) |
| **GET /feed/global** | 100-200ms | 5-10ms | < 200ms | MEETS (marginal; EXISTS subqueries add overhead) |
| **GET /feed/event/:id** | 60-120ms | 5-10ms | < 200ms | MEETS |
| **GET /feed/happening** | 100-250ms | 5-10ms | < 200ms | MEETS (marginal cold) |
| **GET /discovery/recommendations** | 200-600ms | 5-10ms | < 500ms | AT RISK -- complex CTE query with 3 subqueries |
| **GET /trending** | 300-1200ms | N/A (no cache) | < 500ms | FAILS -- no caching, 3 LATERAL subqueries (PERF-007) |
| **GET /search?q=...** (unified) | 50-150ms | N/A (no cache) | < 300ms | MEETS -- tsvector indexes are efficient |
| **GET /users/search?q=...** | 30-80ms | N/A (no cache) | < 200ms | MEETS at beta scale (degrades without trigram index DB-004) |
| **GET /wrapped/:year** (basic) | 150-400ms | N/A (no cache) | < 500ms | AT RISK -- 4 parallel queries with EXTRACT (PERF-004) |
| **GET /wrapped/:year/detail** (premium) | 300-800ms | N/A (no cache) | < 500ms | FAILS -- friend overlap self-join + no caching (PERF-004) |
| **GET /badges/leaderboard** | 200-500ms | N/A (no cache) | < 500ms | AT RISK -- N+1 pattern (DB-008) |
| **GET /users/:id/stats** | 50-100ms | N/A (no cache) | < 200ms | MEETS (subqueries are indexed) |
| **POST /checkins** (create) | 80-200ms | N/A | < 300ms | MEETS (fire-and-forget async work) |
| **GET /notifications** | 80-250ms | N/A (no cache) | < 300ms | MEETS (8 LEFT JOINs but LIMIT 20) |
| **GET /discover/suggestions** | 200-800ms | 5-10ms | < 500ms | AT RISK -- complex CTE (PERF-006) |

**Summary:** 2 endpoints likely FAIL the 500ms target, 4 endpoints are AT RISK. The remaining 10 endpoints MEET targets. Warm-cache performance is excellent across all cached endpoints.

---

## Connection Pool and Redis Memory Analysis

### PostgreSQL Connection Pool

| Parameter | Value | Assessment |
|-----------|-------|-----------|
| `max` | 20 | Hardcoded; adequate for beta but not configurable |
| `idleTimeoutMillis` | 30,000 (30s) | Appropriate |
| `connectionTimeoutMillis` | 2,000 (2s) | Appropriate |

**Connection budget at beta:**
- HTTP request handlers: ~15 concurrent (assuming 2,000 users with 50 concurrent active)
- BullMQ badge worker: 1 connection (concurrency=1)
- BullMQ notification worker: 1 connection
- EventSyncWorker: 1 connection (concurrency=1)
- DataRetentionService scheduled job: 1 connection (infrequent)
- **Total estimated peak:** 18-19 connections -- within the 20 max but with minimal headroom

**Risk:** A burst of 25+ concurrent requests (realistic during a concert check-in surge) will exhaust the pool. Requests will queue for up to 2 seconds before receiving a connection timeout error. This manifests as intermittent 500 errors during peak activity.

### Redis Memory Projection

| Key Pattern | Count at Beta | Avg Size | Total |
|-------------|--------------|----------|-------|
| `rate_limit:*` (sorted sets) | 500-2,000 | 3 KB | 1-6 MB |
| `feed:friends:*` (cached pages) | 2,000 | 5 KB | 10 MB |
| `feed:global:*` (cached pages) | 2,000 | 5 KB | 10 MB |
| `feed:event:*` (cached pages) | 500 | 5 KB | 2.5 MB |
| `feed:happening:*` | 2,000 | 2 KB | 4 MB |
| `stats:concert-cred:*` | 2,000 | 2 KB | 4 MB |
| `band:aggregate:*` | 500 | 0.5 KB | 0.25 MB |
| `venue:aggregate:*` | 500 | 0.5 KB | 0.25 MB |
| `events:recs:*` | 2,000 | 5 KB | 10 MB |
| `events:nearby:*` | 100 | 5 KB | 0.5 MB |
| `discover:suggestions:*` | 2,000 | 3 KB | 6 MB |
| `notif:batch:*` (temporary) | 200 | 0.5 KB | 0.1 MB |
| BullMQ job data | 500 | 1 KB | 0.5 MB |
| **Total estimated peak** | | | **~49 MB** |

**Assessment:** 49 MB is well within Railway's Redis limits (even the smallest plan offers 256 MB). The primary risk is not memory but the `KEYS` command blocking issue (PERF-001).

---

## Summary Table

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| PERF-001 | `cache.delPattern()` uses blocking Redis KEYS command | Blocker | Redis Operations |
| PERF-002 | WebSocket fan-out O(followers * connections) with no back-pressure | Blocker | WebSocket |
| PERF-003 | Feed queries execute 2 EXISTS subqueries per row | High | Query Performance |
| PERF-004 | WrappedService runs 9 aggregate queries without caching | High | Query Performance |
| PERF-005 | Notification query joins 8 tables, 3 serial queries | High | Query Performance |
| PERF-006 | UserDiscoveryService recommendation query O(users * checkins) | High | Query Performance |
| PERF-007 | TrendingService 3 LATERAL subqueries per event, no caching | High | Query Performance |
| PERF-008 | Rating submission N+2 sequential queries per band | Medium | Query Performance |
| PERF-009 | EventService.getEventById fires 3 serial queries | Medium | Query Performance |
| PERF-010 | FollowService executes redundant COUNT + existence queries | Medium | Query Performance |
| PERF-011 | PostgreSQL pool hardcoded at 20, no monitoring | Medium | Connection Pool |
| PERF-012 | Rate limiter sorted set key accumulation | Medium | Redis Memory |
| PERF-013 | CheckinCreatorService queries followers table twice | Medium | Duplicate Queries |
| PERF-014 | StatsService ignores denormalized columns (cross-ref DB-006) | Medium | Query Performance |
| PERF-015 | SearchService user search has unbounded COUNT subquery per row | Medium | Query Performance |
| PERF-016 | BandService.searchBands ILIKE on unnested genres array | Medium | Query Performance |
| PERF-017 | VenueService.getVenuesNear missing bounding-box (cross-ref DB-018) | Medium | Query Performance |
| PERF-018 | No Redis eviction policy configured | Low | Redis Config |
| PERF-019 | WebSocket has no connection limit | Low | WebSocket |
| PERF-020 | DataExportService has 8 unbounded parallel queries (cross-ref DB-019) | Low | Query Performance |
| PERF-021 | Recommendation exclusion uses NOT IN instead of NOT EXISTS | Low | Query Performance |
| PERF-022 | OnboardingService DELETE+INSERT without transaction | Low | Concurrency |

---

## Recommended Priority Order for Beta

**Must fix before beta launch (Blockers):**
1. **PERF-001** -- Replace `KEYS` with `SCAN` or generation-counter invalidation
2. **PERF-002** -- Index WebSocket clients by userId; pipeline Redis fan-out operations

**Should fix before beta launch (High):**
3. **PERF-007** -- Add Redis caching to TrendingService (60-120s TTL)
4. **PERF-004** -- Add Redis caching to WrappedService; fix EXTRACT to use range filter
5. **PERF-003** -- Add composite index on user_badges(user_id, earned_at); consider denormalizing badge flag
6. **PERF-005** -- Fold notification counts into main query via window function; add composite index
7. **PERF-006** -- UserDiscoveryService is cached (5min TTL) so only cold-cache is at risk; add LIMIT to CTEs

**Fix during beta (Medium):**
8. **PERF-011** -- Make pool size configurable via env var; add pool utilization logging
9. **PERF-013** -- Deduplicate follower query in check-in creation
10. **PERF-009** -- Parallelize EventService.getEventById queries; use denormalized count
11. **PERF-014** -- Read denormalized user stat columns in StatsService
12. **PERF-015** -- Use denormalized total_checkins in user search
13. **PERF-010** -- Fold COUNT into main query for FollowService
14. **PERF-008** -- Batch rating queries
15. **PERF-016** -- Redirect band search to SearchService tsvector path
16. **PERF-017** -- Add bounding-box to VenueService.getVenuesNear
17. **PERF-012** -- Acceptable at beta; monitor Redis memory

**Track for post-beta (Low):**
18. **PERF-018** through **PERF-022**

---

*Report generated by Performance Benchmarker Agent -- 2026-03-18*
