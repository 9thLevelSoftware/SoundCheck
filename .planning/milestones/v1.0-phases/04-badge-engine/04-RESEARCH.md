# Phase 4: Badge Engine - Research

**Researched:** 2026-02-02
**Domain:** Data-driven badge evaluation engine (JSONB criteria, BullMQ async processing, Flutter badge UI)
**Confidence:** HIGH

## Summary

Phase 4 rewrites the existing badge system from a hardcoded review-based evaluator to a data-driven, event-check-in-based badge engine. The current `BadgeService` queries the `reviews` table with five fixed badge types (`review_count`, `venue_explorer`, `music_lover`, `event_attendance`, `helpful_count`). This must be completely rewritten to:

1. Query `checkins` (not `reviews`) with event/venue/band join data
2. Use JSONB `criteria` column (already added in migration 008) for data-driven badge definitions
3. Process badge evaluation asynchronously via BullMQ (already installed, already has Redis config and event-sync queue as patterns)
4. Support 7 concert-specific badge categories with tiered thresholds
5. Add anti-farming measures (location verification, rate limiting, delayed evaluation)

The codebase is well-positioned for this work: BullMQ v5.67.2 and ioredis v5.9.0 are already installed, the Redis connection factory (`createBullMQConnection`) exists, and the event-sync worker provides a clean pattern to follow. The JSONB `criteria` column with GIN index already exists on the `badges` table. The mobile app has a `badges` feature folder with `Badge`, `UserBadge`, and `BadgeProgress` Freezed models and a `BadgeRepository` -- all need updating to match new badge categories.

**Primary recommendation:** Build an evaluator registry pattern where each badge category has a registered evaluator function. Badge definitions in the DB specify which evaluator to use via `criteria.type`. On check-in, enqueue a delayed BullMQ job that runs all evaluators for that user. This is fully data-driven: new badge tiers are added by INSERTing rows, and new categories require only a new evaluator function registration.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | 5.67.2 | Async job queue for badge evaluation | Already used for event sync; Redis-backed, retry-capable |
| ioredis | 5.9.0 | Redis client for BullMQ | Already configured with BullMQ-compatible settings |
| pg | 8.16.3 | PostgreSQL client | Already used throughout; raw SQL for badge queries |
| node-pg-migrate | 8.0.4 | Database migrations | Already used for all schema changes |
| zod | 3.25.76 | Schema validation | Already used; validate JSONB criteria shapes |

### Mobile (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| flutter_riverpod | 3.1.0 | State management | Badge state, progress tracking providers |
| freezed_annotation | 3.1.0 | Immutable models | Badge, UserBadge, BadgeProgress models |
| go_router | 17.0.1 | Navigation | Badge collection screen route |
| percent_indicator | (add) | Circular progress | Badge progress display rings |

### New Dependencies Needed
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| percent_indicator | latest | Circular progress indicators | Badge progress rings on mobile |

No new backend dependencies are needed. Everything required is already installed.

**Installation:**
```bash
# Backend: nothing new needed
# Mobile:
cd mobile && flutter pub add percent_indicator
```

## Architecture Patterns

### Backend: Badge Evaluation Pipeline

```
Check-in Created (CheckinService)
        |
        v
  Enqueue BullMQ Job (badge-eval queue)
    - delay: 30 seconds (anti-farming)
    - jobId: `badge-eval-${userId}-${checkinId}` (deduplication)
        |
        v
  Badge Evaluation Worker
    1. Load badge definitions from DB (criteria JSONB)
    2. Load user's existing earned badges
    3. For each unearned badge definition:
       a. Look up evaluator by criteria.type
       b. Run evaluator(userId, criteria) -> { current, target, earned }
       c. If earned: INSERT user_badge, create notification
    4. Return newly earned badges
        |
        v
  Notification + WebSocket Push
    - Create notification row (type: 'badge_earned')
    - Send WebSocket event to user (sendToUser)
```

### Recommended Backend Structure
```
backend/src/
├── jobs/
│   ├── queue.ts                    # EXISTING - event-sync queue
│   ├── badgeQueue.ts               # NEW - badge-eval queue
│   ├── badgeWorker.ts              # NEW - badge evaluation worker
│   └── eventSyncWorker.ts          # EXISTING
├── services/
│   ├── BadgeService.ts             # REWRITE - data-driven evaluation
│   ├── BadgeEvaluators.ts          # NEW - evaluator registry + functions
│   ├── CheckinService.ts           # MODIFY - add job enqueue after check-in
│   └── NotificationService.ts      # EXISTING - used for badge notifications
├── controllers/
│   └── BadgeController.ts          # MODIFY - add rarity endpoint
└── routes/
    └── badgeRoutes.ts              # MODIFY - add rarity route
```

### Pattern 1: Evaluator Registry
**What:** A map of badge type strings to evaluator functions. Each evaluator takes a userId and criteria object, queries the DB, and returns progress.
**When to use:** For all badge evaluation logic.
**Example:**
```typescript
// Source: Custom pattern matching existing codebase conventions

interface EvalResult {
  current: number;
  target: number;
  earned: boolean;
}

type BadgeEvaluator = (userId: string, criteria: Record<string, any>) => Promise<EvalResult>;

const evaluatorRegistry: Map<string, BadgeEvaluator> = new Map();

// Registration
evaluatorRegistry.set('checkin_count', async (userId, criteria) => {
  const result = await db.query(
    'SELECT COUNT(*) as cnt FROM checkins WHERE user_id = $1',
    [userId]
  );
  const current = parseInt(result.rows[0].cnt);
  const target = criteria.threshold;
  return { current, target, earned: current >= target };
});

evaluatorRegistry.set('genre_explorer', async (userId, criteria) => {
  const result = await db.query(
    `SELECT COUNT(DISTINCT e.id) as cnt
     FROM checkins c
     JOIN events e ON c.event_id = e.id
     JOIN event_lineup el ON e.id = el.event_id
     JOIN bands b ON el.band_id = b.id
     WHERE c.user_id = $1 AND LOWER(b.genre) = LOWER($2)`,
    [userId, criteria.genre]
  );
  const current = parseInt(result.rows[0].cnt);
  const target = criteria.threshold;
  return { current, target, earned: current >= target };
});

evaluatorRegistry.set('unique_venues', async (userId, criteria) => {
  const result = await db.query(
    'SELECT COUNT(DISTINCT venue_id) as cnt FROM checkins WHERE user_id = $1',
    [userId]
  );
  const current = parseInt(result.rows[0].cnt);
  const target = criteria.threshold;
  return { current, target, earned: current >= target };
});

evaluatorRegistry.set('superfan', async (userId, criteria) => {
  const result = await db.query(
    `SELECT COUNT(DISTINCT c.event_id) as cnt
     FROM checkins c
     JOIN event_lineup el ON c.event_id = el.event_id
     WHERE c.user_id = $1 AND el.band_id = $2`,
    [userId, criteria.band_id]
  );
  // Note: superfan badges are dynamic -- they fire for ANY band, not just one.
  // The evaluator must check all bands or be called per-band.
  // See Design Decision below.
  const current = parseInt(result.rows[0].cnt);
  const target = criteria.threshold;
  return { current, target, earned: current >= target };
});

evaluatorRegistry.set('festival_warrior', async (userId, criteria) => {
  // Count max check-ins on a single day
  const result = await db.query(
    `SELECT DATE(c.created_at) as check_date, COUNT(*) as cnt
     FROM checkins c
     WHERE c.user_id = $1
     GROUP BY DATE(c.created_at)
     ORDER BY cnt DESC
     LIMIT 1`,
    [userId]
  );
  const current = result.rows.length > 0 ? parseInt(result.rows[0].cnt) : 0;
  const target = criteria.threshold;
  return { current, target, earned: current >= target };
});

evaluatorRegistry.set('road_warrior', async (userId, criteria) => {
  const field = criteria.field || 'city'; // 'city' or 'state'
  const column = field === 'state' ? 'v.state' : 'v.city';
  const result = await db.query(
    `SELECT COUNT(DISTINCT ${column}) as cnt
     FROM checkins c
     JOIN venues v ON c.venue_id = v.id
     WHERE c.user_id = $1 AND ${column} IS NOT NULL`,
    [userId]
  );
  const current = parseInt(result.rows[0].cnt);
  const target = criteria.threshold;
  return { current, target, earned: current >= target };
});
```

### Pattern 2: JSONB Criteria Schema
**What:** Each badge definition row uses the `criteria` JSONB column to define evaluation parameters.
**When to use:** All badge definitions.
**Example criteria shapes:**
```json
// Milestone (BDGE-06): checkin_count
{"type": "checkin_count", "threshold": 10}

// Genre Explorer (BDGE-02): genre
{"type": "genre_explorer", "genre": "rock", "threshold": 5}

// Venue Collector (BDGE-03): unique_venues
{"type": "unique_venues", "threshold": 10}

// Superfan (BDGE-04): superfan
{"type": "superfan", "threshold": 3}

// Festival Warrior (BDGE-05): festival_warrior
{"type": "festival_warrior", "threshold": 3}

// Road Warrior (BDGE-07): road_warrior
{"type": "road_warrior", "field": "city", "threshold": 5}
{"type": "road_warrior", "field": "state", "threshold": 10}
```

### Pattern 3: BullMQ Badge Queue (Separate from Event Sync)
**What:** A dedicated queue for badge evaluation, following the existing event-sync queue pattern.
**When to use:** After every check-in creation.
**Example:**
```typescript
// badgeQueue.ts - mirrors queue.ts pattern
import { Queue } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';

let badgeEvalQueue: Queue | null = null;

try {
  getRedisUrl();
  badgeEvalQueue = new Queue('badge-eval', {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
} catch {
  badgeEvalQueue = null;
}

export { badgeEvalQueue };
```

### Pattern 4: Delayed Job Enqueue After Check-in
**What:** After a successful check-in, enqueue a delayed badge evaluation job.
**When to use:** In `CheckinService.createEventCheckin()` after the INSERT succeeds.
**Example:**
```typescript
// In CheckinService.createEventCheckin(), after successful insert:
if (badgeEvalQueue) {
  await badgeEvalQueue.add(
    'evaluate',
    { userId, checkinId },
    {
      delay: 30000, // 30-second anti-farming delay
      jobId: `badge-eval-${userId}-${checkinId}`, // prevent duplicate evals
    }
  );
}
```

### Pattern 5: Rarity Computation
**What:** Badge rarity = percentage of total users who have earned a specific badge.
**When to use:** Rarity endpoint and badge detail display.
**Example:**
```sql
SELECT
  b.id as badge_id,
  b.name,
  COUNT(ub.id) as earned_count,
  (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
  ROUND(
    COUNT(ub.id)::numeric / NULLIF((SELECT COUNT(*) FROM users WHERE is_active = true), 0) * 100,
    1
  ) as rarity_pct
FROM badges b
LEFT JOIN user_badges ub ON b.id = ub.badge_id
GROUP BY b.id
ORDER BY rarity_pct ASC;
```

### Anti-Patterns to Avoid
- **Synchronous badge evaluation in the check-in request:** The check-in endpoint must return fast (~200ms). Badge evaluation involves multiple queries per badge type. Always use BullMQ async.
- **One evaluator per badge row:** Don't create a unique function for each of the ~30+ badge definitions. Use parameterized evaluators keyed by `criteria.type` (~7 evaluator functions total).
- **Polling for new badges on mobile:** Don't have the mobile app poll `/my-badges` periodically. Use the existing WebSocket `sendToUser` to push badge-earned events, and poll only on app open / profile view.
- **Computing rarity in real-time on every request:** Cache rarity percentages. Recompute on a schedule (e.g., hourly) or after badge awarding.

### Design Decision: Superfan Badge Handling

The Superfan badge ("see the same band N times") is unique because it is not tied to a single predefined band. The criteria cannot encode `band_id` at badge definition time since ANY band could qualify.

**Recommended approach:** The `superfan` evaluator checks ALL bands the user has seen and returns the maximum. The criteria only specifies the threshold. This means:
```json
{"type": "superfan", "threshold": 3}
```
The evaluator query:
```sql
SELECT el.band_id, b.name, COUNT(DISTINCT c.event_id) as times_seen
FROM checkins c
JOIN event_lineup el ON c.event_id = el.event_id
JOIN bands b ON el.band_id = b.id
WHERE c.user_id = $1
GROUP BY el.band_id, b.name
HAVING COUNT(DISTINCT c.event_id) >= $2
ORDER BY times_seen DESC
LIMIT 1;
```
If any band meets the threshold, the badge is earned. For progress display, show the user's most-seen band's count.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue with retries | Custom setTimeout chains | BullMQ (already installed) | Persistence, retry logic, monitoring, deduplication |
| Job deduplication | Manual "already processing" flags | BullMQ `jobId` option | Built-in, atomic, handles edge cases |
| Delayed execution | setTimeout in memory | BullMQ `delay` option | Survives server restart, backed by Redis |
| Circular progress UI | Custom Canvas painting | `percent_indicator` package | Battle-tested, customizable, animated |
| JSONB querying | Parsing JSON in app code | PostgreSQL `->`, `->>`, `@>` operators | GIN-indexed, much faster, handled at DB level |
| In-app notification toast | Custom overlay from scratch | `SnackBar` or `OverlayEntry` with Riverpod state | Flutter built-in, Material Design compliant |
| Badge type validation | Manual string checks | Zod schema for criteria shapes | Already in stack, type-safe, composable |

**Key insight:** The existing codebase already has 90% of the infrastructure needed (BullMQ, Redis, WebSocket, NotificationService). The work is primarily rewriting the BadgeService evaluation logic and adding seed data.

## Common Pitfalls

### Pitfall 1: Evaluating Badges Synchronously in Check-in Request
**What goes wrong:** Check-in endpoint takes 2-5 seconds because it evaluates 30+ badge definitions with complex JOINs.
**Why it happens:** Feels simpler to just call `badgeService.checkAndAwardBadges(userId)` inline.
**How to avoid:** Always enqueue via BullMQ. The check-in response never includes badge results.
**Warning signs:** Check-in latency > 500ms.

### Pitfall 2: N+1 Queries in Badge Evaluation
**What goes wrong:** Evaluator makes one query per badge definition (30+ queries per evaluation).
**Why it happens:** Naive loop: for each badge, run its evaluator query.
**How to avoid:** Batch evaluators by type. One `genre_explorer` evaluator computes counts for ALL genres in a single query, then matches against all genre badges. Similarly, one `unique_venues` query serves all venue collector tiers.
**Warning signs:** More than ~10 queries per badge evaluation run.

### Pitfall 3: Race Condition on Duplicate Badge Award
**What goes wrong:** Two concurrent evaluations (from rapid check-ins) both see badge as unearned and both INSERT into user_badges.
**Why it happens:** No unique constraint or the INSERT doesn't use ON CONFLICT.
**How to avoid:** The `user_badges` table already has a UNIQUE constraint on `(user_id, badge_id)`. Always use `INSERT ... ON CONFLICT (user_id, badge_id) DO NOTHING`. The existing `awardBadge` method already does this correctly.
**Warning signs:** Duplicate badge notifications.

### Pitfall 4: Stale Badge Types on Mobile
**What goes wrong:** Mobile `BadgeType` enum has old values (`review_count`, `venue_explorer`, `music_lover`, `event_attendance`, `helpful_count`) that don't match new badge categories.
**Why it happens:** Forgetting to update the Freezed model on mobile when backend badge types change.
**How to avoid:** Replace the mobile `BadgeType` enum with a String field (or update the enum to match new categories). Re-run `build_runner` to regenerate Freezed code.
**Warning signs:** JSON deserialization failures on badge API responses.

### Pitfall 5: Superfan Badge Progress Display
**What goes wrong:** User sees "0/3" progress for superfan badge because the progress endpoint doesn't know which band to count.
**Why it happens:** Superfan is a "max over all bands" metric, not a single counter.
**How to avoid:** The progress endpoint for superfan badges must compute `MAX(times_seen_per_band)` and return that as the current value. Include the band name in the progress response so the user sees "Seen The Midnight Riders 2/3 times".
**Warning signs:** Superfan progress always showing 0 or incorrect values.

### Pitfall 6: Genre Explorer Requires Genre Data on Bands
**What goes wrong:** Genre Explorer badges never fire because many bands have NULL genre.
**Why it happens:** Bands imported from Ticketmaster may not have genre data, or genre strings don't match badge criteria.
**How to avoid:** Normalize genre strings to lowercase in both badge criteria and evaluator queries. Accept partial matches or genre categories (e.g., "rock" matches "Indie Rock", "Punk Rock"). Consider a genre mapping table or ILIKE queries.
**Warning signs:** Genre Explorer badges with 0 progress for users who have attended many shows.

### Pitfall 7: Missing Badge Category Column
**What goes wrong:** Cannot filter/group badges by category (genre_explorer, venue_collector, etc.) in the UI.
**Why it happens:** The existing `badge_type` column has old values. Need to add a new `category` column or repurpose `badge_type`.
**How to avoid:** Migration must either ALTER `badge_type` to accept new values or add a `category` column. Since `badge_type` is a free-text column (not a PostgreSQL ENUM), it can accept any string value -- just update the badge definitions.
**Warning signs:** Badge collection UI cannot group badges by category.

## Code Examples

Verified patterns from the existing codebase:

### BullMQ Queue Creation (from existing queue.ts)
```typescript
// Source: backend/src/jobs/queue.ts
import { Queue } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';

let badgeEvalQueue: Queue | null = null;
try {
  getRedisUrl();
  badgeEvalQueue = new Queue('badge-eval', {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
} catch {
  badgeEvalQueue = null;
}
export { badgeEvalQueue };
```

### BullMQ Worker Creation (from existing eventSyncWorker.ts)
```typescript
// Source: backend/src/jobs/eventSyncWorker.ts pattern
import { Worker, Job } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';

export function startBadgeEvalWorker(): Worker | null {
  try { getRedisUrl(); } catch { return null; }

  const worker = new Worker(
    'badge-eval',
    async (job: Job) => {
      const { userId, checkinId } = job.data;
      const badgeService = new BadgeService();
      const newBadges = await badgeService.evaluateAndAward(userId);
      return { newBadges: newBadges.length };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 3, // Multiple badge evals can run concurrently
    }
  );

  worker.on('error', (err) => console.error('[BadgeWorker]', err));
  worker.on('completed', (job) => console.log('[BadgeWorker] Completed', job.id));
  worker.on('failed', (job, err) => console.error('[BadgeWorker] Failed', job?.id, err.message));

  return worker;
}
```

### Notification Creation (from existing NotificationService)
```typescript
// Source: backend/src/services/NotificationService.ts
await notificationService.createNotification({
  userId: userId,
  type: 'badge_earned',
  title: `Badge Earned: ${badge.name}`,
  message: badge.description || `You earned the ${badge.name} badge!`,
  badgeId: badge.id,
});
```

### WebSocket Push to User (from existing websocket.ts)
```typescript
// Source: backend/src/utils/websocket.ts
import { sendToUser } from '../utils/websocket';

sendToUser(userId, 'badge_earned', {
  badgeId: badge.id,
  badgeName: badge.name,
  badgeColor: badge.color,
  badgeIconUrl: badge.iconUrl,
});
```

### Mobile Badge Model (needs update from existing badge.dart)
```dart
// Source: Needs update from mobile/lib/src/features/badges/domain/badge.dart
// Current BadgeType enum must be replaced with new categories:
enum BadgeCategory {
  @JsonValue('genre_explorer')
  genreExplorer,
  @JsonValue('venue_collector')
  venueCollector,
  @JsonValue('superfan')
  superfan,
  @JsonValue('festival_warrior')
  festivalWarrior,
  @JsonValue('checkin_count')
  milestone,
  @JsonValue('road_warrior')
  roadWarrior,
}
```

### Rarity SQL Query
```sql
-- Compute rarity for all badges in a single query
SELECT
  b.id,
  b.name,
  b.badge_type as category,
  b.requirement_value as threshold,
  COALESCE(ub_counts.earned_count, 0) as earned_count,
  u_total.total_users,
  CASE WHEN u_total.total_users > 0
    THEN ROUND(COALESCE(ub_counts.earned_count, 0)::numeric / u_total.total_users * 100, 1)
    ELSE 0
  END as rarity_pct
FROM badges b
CROSS JOIN (SELECT COUNT(*) as total_users FROM users WHERE is_active = true) u_total
LEFT JOIN (
  SELECT badge_id, COUNT(*) as earned_count
  FROM user_badges
  GROUP BY badge_id
) ub_counts ON b.id = ub_counts.badge_id
ORDER BY b.badge_type, b.requirement_value;
```

## State of the Art

| Old Approach (Current) | New Approach (Phase 4) | Impact |
|------------------------|------------------------|--------|
| Badge types: review_count, venue_explorer, music_lover, event_attendance, helpful_count | Badge types: genre_explorer, venue_collector, superfan, festival_warrior, checkin_count, road_warrior | Concert-specific gamification |
| Queries `reviews` table | Queries `checkins` + `events` + `event_lineup` + `bands` + `venues` | Correct data source |
| Synchronous evaluation via POST /badges/check-awards | Async BullMQ job triggered automatically on check-in | No user action needed, responsive |
| Hardcoded badge type switch statement | Evaluator registry with JSONB criteria dispatch | Data-driven, extensible |
| No anti-farming | Location verify (already done) + rate limit (daily cap) + delayed eval (30s) | Prevents badge exploitation |
| No rarity display | Rarity percentage computed per badge | Social/gamification motivation |
| No in-app notification | WebSocket push + notification row on badge earn | Instant feedback loop |
| 5 badge types, all review-based | 30+ badge definitions across 7 categories with tiered thresholds | Full concert gamification |

**Deprecated/outdated:**
- The entire existing `BadgeService.getUserStats()` method: queries `reviews` table which is the wrong data source
- The `BadgeType` type on backend (`review_count` | `venue_explorer` | etc.): must be replaced with new categories
- The mobile `BadgeType` enum: same issue, needs update
- The `POST /badges/check-awards` endpoint: evaluation is now automatic; this endpoint becomes unnecessary (or can remain as a manual trigger for debugging)

## Migration Requirements

### New Migration: Badge Schema Updates
The existing `badges` table has these columns: `id`, `name`, `description`, `icon_url`, `badge_type`, `requirement_value`, `color`, `created_at`, `criteria` (JSONB, added in migration 008).

What needs to change:
1. **No schema changes needed** for the `badges` table itself -- `badge_type` is a text column (not ENUM) and `criteria` JSONB already exists with GIN index
2. **Seed data migration**: INSERT all badge definitions (~30 rows) with proper `criteria` JSONB
3. **DELETE old badge definitions**: Remove the 5 old review-based badge definitions
4. **Add `badge_progress` cache table** (optional): For caching progress to avoid recomputation on every profile view

### Badge Seed Data (All Categories with Tiers)

**Genre Explorer (BDGE-02):** 5/10/25 thresholds, per genre
- Rock, Metal, Jazz, Electronic, Hip Hop, Folk, Punk, Indie, Blues, Country (10 genres x 3 tiers = 30 badges)
- Consider starting with 5-6 popular genres to keep manageable

**Venue Collector (BDGE-03):** 10/25/50 unique venues
- 3 badge definitions

**Superfan (BDGE-04):** 3/5/10 times seeing same band
- 3 badge definitions (not per-band)

**Festival Warrior (BDGE-05):** 3/5 check-ins in one day
- 2 badge definitions

**Milestone (BDGE-06):** 1/10/25/50/100/250/500 total check-ins
- 7 badge definitions

**Road Warrior (BDGE-07):** 5/10 unique cities, 5/10 unique states
- 4 badge definitions (2 city + 2 state)

**Total:** ~50 badge definitions (depending on genre count)

## Anti-Farming Strategy (BDGE-12)

Three layers of protection, all feasible with existing infrastructure:

### Layer 1: Location Verification (Already Implemented)
- `is_verified` boolean on checkins already tracks GPS proximity
- Badge evaluator can optionally weight verified check-ins more heavily
- **Recommendation:** For v1, do NOT require `is_verified = true` for badges. Many users won't share location. Instead, use it as a trust signal for anti-abuse investigation.

### Layer 2: Daily Check-in Rate Limit
- Implemented at the API level (already have rate limiting middleware)
- Add a per-user daily check-in cap (e.g., 10 check-ins per day)
- This is a backend middleware concern, not a badge evaluator concern
- **Implementation:** COUNT checkins for user WHERE created_at > start_of_day. Reject if >= limit.

### Layer 3: Delayed Evaluation (30-second delay)
- BullMQ `delay: 30000` on the badge-eval job
- Prevents "check-in, delete, check-in, delete" farming
- Also prevents rapid-fire check-in attempts from triggering multiple evaluations
- **Deduplication:** Use `jobId: badge-eval-${userId}-${checkinId}` to prevent duplicate jobs for the same check-in

## Push Notification Strategy (BDGE-11)

The existing infrastructure supports two notification channels:

1. **In-app notification** (already works): `NotificationService.createNotification()` creates a row in `notifications` table. The mobile app's notifications screen reads this.

2. **Real-time WebSocket push** (already works): `sendToUser(userId, type, payload)` pushes a message to all connected WebSocket clients for that user.

3. **Native push notifications** (NOT yet implemented): No Firebase Cloud Messaging (FCM) or APNs integration exists. The mobile `pubspec.yaml` has `firebase_core` and `firebase_analytics` but NOT `firebase_messaging`.

**Recommendation for BDGE-11:** Use the existing in-app notification + WebSocket for now. Native push notifications are a separate infrastructure concern that should be its own phase/plan, not bundled into badge engine. The requirement says "push notification" but the existing "push" mechanism is WebSocket -- maintain consistency.

## Open Questions

Things that couldn't be fully resolved:

1. **Genre normalization strategy**
   - What we know: Bands have a `genre` text field with values like "Rock", "Indie Rock", "Punk Rock", "Electronic"
   - What's unclear: Should "Indie Rock" count for both an "Indie" badge and a "Rock" badge? Or is it exact match only?
   - Recommendation: Use case-insensitive exact match for v1 (LOWER(genre) = LOWER(criteria.genre)). Add a genre taxonomy/mapping table in a future phase if needed. Keep genre badge seeds focused on broad categories ("Rock", "Metal", "Electronic", "Jazz", "Hip Hop", "Folk") rather than sub-genres.

2. **Rarity computation frequency**
   - What we know: Rarity = % of users who earned a badge. This changes every time a badge is awarded.
   - What's unclear: Should it be computed live (slow but accurate) or cached (fast but stale)?
   - Recommendation: Compute live for v1 (user count is small). Add a `badge_rarity_cache` materialized view or scheduled job later if performance becomes an issue.

3. **Old badge data cleanup**
   - What we know: Old badge definitions (review-based) exist in the badges table. Old user_badges rows reference them.
   - What's unclear: Should we delete old badge definitions and earned badges, or keep them as "legacy"?
   - Recommendation: Delete old badge definitions in the seed migration. Old user_badges rows referencing deleted badge IDs will have orphaned foreign keys -- the migration should CASCADE delete user_badges for removed badge IDs, or use a soft approach (mark old badges as inactive rather than deleting).

4. **Superfan badge for which band to display**
   - What we know: Superfan badges are "see any band N times" not "see a specific band N times"
   - What's unclear: When a user earns the superfan badge, which band is it associated with?
   - Recommendation: Store the qualifying band_id in the `user_badges` row (add a `metadata` JSONB column to user_badges, or include band info in the notification). For progress display, always show the user's most-seen band.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/services/BadgeService.ts` -- current implementation querying reviews
- Codebase analysis: `backend/src/jobs/queue.ts` -- existing BullMQ queue pattern
- Codebase analysis: `backend/src/jobs/eventSyncWorker.ts` -- existing BullMQ worker pattern
- Codebase analysis: `backend/src/config/redis.ts` -- existing Redis connection factory
- Codebase analysis: `backend/src/services/CheckinService.ts` -- check-in creation flow
- Codebase analysis: `backend/src/services/NotificationService.ts` -- notification creation pattern
- Codebase analysis: `backend/src/utils/websocket.ts` -- WebSocket push pattern
- Codebase analysis: `backend/migrations/008_expand-create-badge-criteria.ts` -- JSONB criteria column
- Codebase analysis: `backend/package.json` -- BullMQ v5.67.2, ioredis v5.9.0 already installed
- Codebase analysis: `mobile/lib/src/features/badges/domain/badge.dart` -- current mobile models

### Secondary (MEDIUM confidence)
- [BullMQ Workers Documentation](https://docs.bullmq.io/guide/workers) -- Worker creation, events, concurrency
- [BullMQ Delayed Jobs](https://docs.bullmq.io/guide/jobs/delayed) -- Delay option for anti-farming
- [BullMQ Deduplication](https://docs.bullmq.io/guide/jobs/deduplication) -- jobId dedup pattern
- [BullMQ Rate Limiting](https://docs.bullmq.io/guide/rate-limiting) -- Worker rate limiter
- [PostgreSQL JSONB documentation](https://www.postgresql.org/docs/current/datatype-json.html) -- JSONB operators and indexing

### Tertiary (LOW confidence)
- Web search for badge/achievement anti-farming patterns -- general gamification best practices
- Web search for Flutter badge UI patterns -- percent_indicator package for progress rings

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and used in codebase
- Architecture: HIGH - Follows exact patterns already established in Phase 2 (BullMQ queue/worker)
- Badge evaluation logic: HIGH - SQL queries verified against existing schema
- Anti-farming: MEDIUM - Strategies are standard but specific thresholds (30s delay, 10/day cap) may need tuning
- Mobile UI: MEDIUM - percent_indicator package is well-established but specific UI layout is design-dependent
- Push notifications: MEDIUM - WebSocket push works but native push (FCM/APNs) is out of scope

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - stable stack, no fast-moving dependencies)
