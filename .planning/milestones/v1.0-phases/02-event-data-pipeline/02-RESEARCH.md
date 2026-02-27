# Phase 2: Event Data Pipeline - Research

**Researched:** 2026-02-02
**Domain:** Ticketmaster Discovery API integration, BullMQ job queues, PostgreSQL pg_trgm fuzzy matching, event ingestion pipeline
**Confidence:** HIGH

## Summary

Phase 2 builds an event ingestion pipeline that fetches music events from the Ticketmaster Discovery API, deduplicates them against existing records, matches band names to the `bands` table (exact + fuzzy via pg_trgm), and stores them in the `events` and `event_lineup` tables created in Phase 1. The pipeline runs on a BullMQ repeatable job schedule backed by the existing Redis (ioredis) connection. Users can also create events manually when API data has gaps.

The existing codebase already has: (1) the `events` table with `source` and `external_id` columns plus a `UNIQUE(source, external_id)` deduplication constraint, (2) the `event_lineup` junction table for multi-band support, (3) `pg_trgm` extension enabled, (4) Redis via `ioredis`, (5) `axios` for HTTP requests, and (6) an `EventService` with `findOrCreateEvent()`. The primary new infrastructure needed is BullMQ for job scheduling and a Ticketmaster API adapter.

The Ticketmaster Discovery API v2 has a hard 1000-item deep paging limit (`size * page < 1000`) and rate limits of 5 requests/second + 5000 calls/day. The user-driven coverage model (50-mile radius around active user locations, 30-day lookahead) naturally partitions queries geographically, keeping each query well under the 1000-item limit. Pagination uses `size=200` (max) with date-range subdivision as a fallback for dense metro areas.

**Primary recommendation:** Install BullMQ, create a TicketmasterAdapter service for API communication, a SyncService orchestrator for the ingestion pipeline, and a BandMatcher service for name resolution. Wire these into BullMQ repeatable jobs with rate limiting. Add `external_id` columns to `venues` and `bands` tables for cross-entity Ticketmaster deduplication.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | ^5.66.5 | Job queue with repeatable jobs, rate limiting | De facto Node.js job queue, TypeScript native, Redis-backed, built-in rate limiting, repeatable jobs survive deploys |
| ioredis | ^5.9.0 | Redis client (BullMQ dependency) | Already installed, used for rate limiting. BullMQ requires ioredis |
| axios | ^1.13.2 | HTTP client for Ticketmaster API | Already installed, used by MusicBrainzService, SetlistFmService, FoursquareService |
| pg | ^8.16.3 | PostgreSQL client | Already installed, all services use it |
| pg_trgm | (extension) | Fuzzy text matching for band names | Already enabled in migration 001 |
| zod | ^3.25.76 | Input validation for API responses and user event creation | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-pg-migrate | ^8.0.4 | Database migrations for new columns | Already installed, add external_id to venues/bands tables |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ | node-cron | node-cron has no persistence, no rate limiting, no retry logic, jobs lost on restart |
| BullMQ | Agenda (MongoDB) | Would introduce MongoDB dependency, project uses PostgreSQL + Redis |
| axios | node-fetch | axios already in project, has interceptors for rate limiting |
| pg_trgm | Levenshtein (fuzzystrmatch) | Levenshtein is character-by-character; pg_trgm is better for partial matches and has GIN index support |

**Installation:**
```bash
cd backend && npm install bullmq
```

Note: `ioredis`, `axios`, `pg`, and `zod` are already installed. BullMQ is the only new dependency.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
  services/
    TicketmasterAdapter.ts    # API communication layer (fetch, parse, rate limit)
    BandMatcher.ts            # Band name matching (exact + fuzzy via pg_trgm)
    EventSyncService.ts       # Orchestrates sync pipeline (fetch -> dedup -> match -> store)
    EventService.ts           # (existing) CRUD for events + lineup
    VenueService.ts           # (existing, extend) venue upsert by external_id
    BandService.ts            # (existing, extend) band upsert by external_id
  jobs/
    queue.ts                  # BullMQ queue + worker setup, Redis connection
    eventSyncWorker.ts        # Worker handler for event sync jobs
    syncScheduler.ts          # Repeatable job registration, coverage region calculation
  config/
    database.ts               # (existing)
    redis.ts                  # (new) Shared Redis connection for BullMQ + rate limiter
  types/
    ticketmaster.ts           # Ticketmaster API response types
    index.ts                  # (existing, extend)
  migrations/
    012_add-venue-external-id.ts      # Add external_id + source to venues
    013_add-band-external-id.ts       # Add external_id + source to bands
    014_add-event-status-column.ts    # Add status enum (active/cancelled/postponed/rescheduled)
    015_add-band-trgm-index.ts        # GIN index on bands.name for fuzzy matching
    016_add-sync-regions-table.ts     # Track sync coverage regions
    017_add-event-sync-log-table.ts   # Track sync run history
```

### Pattern 1: Adapter Pattern for External APIs
**What:** Isolate all Ticketmaster API communication in a single adapter class that handles authentication, rate limiting, pagination, response parsing, and error handling.
**When to use:** Any external API integration where the response format is complex and rate limits must be respected.
**Why:** The codebase already uses this pattern (MusicBrainzService, FoursquareService). Ticketmaster responses are deeply nested HAL+JSON; the adapter normalizes them into simple TypeScript interfaces.

```typescript
// Source: Ticketmaster Discovery API v2 docs + existing MusicBrainzService pattern
interface TicketmasterEvent {
  id: string;                    // TM event ID (external_id)
  name: string;                  // Event title
  url: string;                   // Purchase URL
  dates: {
    start: { localDate: string; localTime?: string };
    status: { code: 'onsale' | 'offsale' | 'canceled' | 'postponed' | 'rescheduled' };
    timezone?: string;
  };
  priceRanges?: Array<{ min: number; max: number; currency: string }>;
  _embedded?: {
    venues: Array<{
      id: string;
      name: string;
      address?: { line1: string };
      city?: { name: string };
      state?: { name: string; stateCode: string };
      country?: { countryCode: string };
      postalCode?: string;
      location?: { latitude: string; longitude: string };
      timezone?: string;
    }>;
    attractions: Array<{
      id: string;
      name: string;
      classifications?: Array<{
        genre?: { name: string };
        subGenre?: { name: string };
      }>;
      images?: Array<{ url: string; ratio: string; width: number }>;
    }>;
  };
}

class TicketmasterAdapter {
  private client: AxiosInstance;
  private apiKey: string;
  private requestCount = 0;
  private dailyResetTime: number;

  constructor() {
    this.apiKey = process.env.TICKETMASTER_API_KEY!;
    this.client = axios.create({
      baseURL: 'https://app.ticketmaster.com/discovery/v2',
      params: { apikey: this.apiKey },
    });
  }

  async searchEvents(params: {
    latlong: string;       // "lat,lon"
    radius: number;        // miles
    startDateTime: string; // ISO 8601
    endDateTime: string;   // ISO 8601
    classificationName?: string; // "music"
    size?: number;         // max 200
    page?: number;         // zero-indexed
    sort?: string;         // "date,asc"
  }): Promise<{ events: TicketmasterEvent[]; totalPages: number; totalElements: number }> {
    // Implementation with pagination + rate limit handling
  }
}
```

### Pattern 2: BullMQ Repeatable Job with Rate Limiting
**What:** A BullMQ queue with repeatable jobs that run on a cron schedule, with built-in rate limiting to respect Ticketmaster's 5/sec limit.
**When to use:** Any recurring background task that calls rate-limited external APIs.

```typescript
// Source: BullMQ docs (docs.bullmq.io)
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

// Shared Redis connection -- MUST set maxRetriesPerRequest to null for BullMQ
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,  // Required by BullMQ
});

const syncQueue = new Queue('event-sync', { connection });

// Register repeatable job (idempotent -- BullMQ won't duplicate)
await syncQueue.add('sync-events', {}, {
  repeat: {
    pattern: '0 */4 * * *',  // Every 4 hours
    tz: 'America/New_York',
  },
});

// Worker with Ticketmaster rate limit: 5 req/sec
const worker = new Worker('event-sync', async (job) => {
  const syncService = new EventSyncService();
  await syncService.runSync();
}, {
  connection,
  limiter: {
    max: 4,          // Stay under 5/sec with headroom
    duration: 1000,  // Per second
  },
  concurrency: 1,    // Single worker to simplify rate limiting
});
```

### Pattern 3: Upsert-on-External-ID for Deduplication
**What:** Use `INSERT ... ON CONFLICT (source, external_id) DO UPDATE` for idempotent event ingestion.
**When to use:** Every sync run processes the same events and must update rather than duplicate.

```typescript
// Upsert event by source + external_id (existing constraint from migration 002)
const upsertEventSQL = `
  INSERT INTO events (
    venue_id, event_date, event_name, description,
    doors_time, start_time, ticket_url, ticket_price_min, ticket_price_max,
    is_sold_out, is_cancelled, event_type, source, external_id, is_verified
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  ON CONFLICT (source, external_id) DO UPDATE SET
    event_name = EXCLUDED.event_name,
    description = EXCLUDED.description,
    ticket_url = EXCLUDED.ticket_url,
    ticket_price_min = EXCLUDED.ticket_price_min,
    ticket_price_max = EXCLUDED.ticket_price_max,
    is_sold_out = EXCLUDED.is_sold_out,
    is_cancelled = EXCLUDED.is_cancelled,
    updated_at = CURRENT_TIMESTAMP
  RETURNING id, (xmax = 0) AS is_new;
`;
// xmax = 0 means INSERT (new row); xmax != 0 means UPDATE (existing row)
```

### Pattern 4: Conservative Band Matching (Exact + Tight Fuzzy)
**What:** Match Ticketmaster attraction names to existing bands using exact match first, then pg_trgm similarity with a high threshold (0.8+). Create new band records for anything below threshold.
**When to use:** Every time a Ticketmaster event has attractions that need to be linked to the `bands` table.

```sql
-- Step 1: Exact match (case-insensitive)
SELECT id FROM bands WHERE LOWER(name) = LOWER($1) LIMIT 1;

-- Step 2: Fuzzy match with high threshold (only if exact fails)
SELECT id, name, similarity(LOWER(name), LOWER($1)) AS score
FROM bands
WHERE LOWER(name) % LOWER($1)
  AND similarity(LOWER(name), LOWER($1)) >= 0.8
ORDER BY score DESC
LIMIT 1;

-- Step 3: If no match, create new band record
INSERT INTO bands (name, source, external_id) VALUES ($1, 'ticketmaster', $2)
RETURNING id;
```

### Pattern 5: User-Driven Coverage Regions
**What:** Aggregate active user locations into sync regions. Each region is a lat/lon centroid with a 50-mile radius. The sync job queries Ticketmaster for each region.
**When to use:** Determining which geographic areas to fetch events for.

```sql
-- Get distinct user locations for sync coverage
-- Cluster users by rounding to ~0.5 degree grid (approx 35 miles)
SELECT
  ROUND(CAST(u.latitude AS numeric), 1) AS lat_cluster,
  ROUND(CAST(u.longitude AS numeric), 1) AS lon_cluster,
  COUNT(DISTINCT u.id) AS user_count,
  AVG(u.latitude) AS centroid_lat,
  AVG(u.longitude) AS centroid_lon
FROM users u
WHERE u.is_active = true
  AND u.latitude IS NOT NULL
  AND u.longitude IS NOT NULL
  AND u.updated_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
GROUP BY lat_cluster, lon_cluster
HAVING COUNT(DISTINCT u.id) >= 1
ORDER BY user_count DESC;
```

**Note:** Users table has a `location` VARCHAR field but no separate `latitude`/`longitude` columns. Phase 2 will need to either: (a) add lat/lon columns to users, or (b) use a separate `user_locations` table, or (c) use a `sync_regions` table that is manually or automatically populated. Recommendation: Add a `sync_regions` table to decouple user location tracking from the sync pipeline.

### Pattern 6: Auto-Merge User Events with Ticketmaster Events
**What:** When a Ticketmaster sync finds an event at the same venue + date as an existing user-created event, the Ticketmaster data enriches the existing record rather than creating a duplicate.
**When to use:** After ingesting Ticketmaster events, check for user-created events that match.

```sql
-- Find user-created events that match a Ticketmaster event by venue + date
SELECT id FROM events
WHERE venue_id = $1
  AND event_date = $2
  AND source = 'user_created'
  AND external_id IS NULL
LIMIT 1;

-- If found, upgrade it with Ticketmaster data
UPDATE events SET
  external_id = $3,
  source = 'ticketmaster',
  event_name = COALESCE(event_name, $4),
  ticket_url = $5,
  ticket_price_min = $6,
  ticket_price_max = $7,
  is_verified = true,
  updated_at = CURRENT_TIMESTAMP
WHERE id = $8;
```

### Anti-Patterns to Avoid
- **Fetching all events in one API call:** Ticketmaster caps at 1000 items. Always paginate with `size=200` and partition by geography.
- **Storing raw API responses:** Parse and normalize into the `events`/`event_lineup`/`bands`/`venues` tables immediately. Raw storage adds complexity with no benefit for this use case.
- **Running sync inline with API requests:** The sync must be a background job (BullMQ), never triggered synchronously from a user request (except the on-demand lookup, which is a single targeted API call).
- **Using a low pg_trgm threshold:** A threshold below 0.7 for band names will produce false positive matches (e.g., "The War" matching "The Warning"). Use 0.8+ and create new records when uncertain.
- **Sharing the ioredis connection between BullMQ and rate limiter:** BullMQ requires `maxRetriesPerRequest: null`. The existing rate limiter connection sets `maxRetriesPerRequest: 3`. Create a separate connection for BullMQ.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job scheduling + persistence | Custom cron + database job table | BullMQ repeatable jobs | Survives deploys, Redis-backed, built-in retry, rate limiting |
| API rate limiting (per-second) | Custom token bucket with timestamps | BullMQ Worker `limiter` option | Distributed (works across multiple workers), handles backpressure |
| Daily API quota tracking | Custom counter in Redis | Simple Redis INCR with EXPIRY at midnight | Atomic, auto-resets, readable by health check |
| Fuzzy text matching | Custom string distance algorithm | PostgreSQL pg_trgm with GIN index | Database-level, indexed, handles trigram decomposition automatically |
| Event deduplication | Custom lookup-then-insert | PostgreSQL UPSERT (ON CONFLICT DO UPDATE) | Atomic, race-condition free, handles concurrent syncs |
| Retry with backoff | Custom setTimeout loops | BullMQ job retry options `{ attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` | Built into BullMQ, tracks attempt count, configurable |

**Key insight:** BullMQ provides job scheduling, rate limiting, retry with backoff, and persistence in a single library. Combining these features ad-hoc would require hundreds of lines of brittle custom code.

## Common Pitfalls

### Pitfall 1: BullMQ Requires Separate Redis Connection
**What goes wrong:** Using the existing `ioredis` instance from `redisRateLimiter.ts` for BullMQ causes errors because BullMQ requires `maxRetriesPerRequest: null`, while the existing connection uses `maxRetriesPerRequest: 3`.
**Why it happens:** BullMQ uses blocking Redis commands (BRPOPLPUSH) that don't work with finite retry limits.
**How to avoid:** Create a dedicated Redis connection factory in `src/config/redis.ts` that returns separate connections for BullMQ and rate limiting. Both use the same `REDIS_URL` env var but with different options.
**Warning signs:** `ReplyError: ERR max number of clients reached` or BullMQ silently failing to process jobs.

### Pitfall 2: Ticketmaster Deep Paging Limit (1000 items)
**What goes wrong:** Trying to page beyond the 1000th result returns empty results or errors. A dense metro area (NYC, LA) with a 30-day window could have >1000 music events.
**Why it happens:** Ticketmaster hard-caps `size * page` at 1000.
**How to avoid:** Use `size=200` (5 pages max). If `totalElements > 1000`, subdivide the date range (e.g., split 30 days into 4x weekly queries) and re-query. The geographic partitioning from user-driven coverage naturally reduces result sets, but dense metros need date subdivision.
**Warning signs:** `page.totalElements` > 1000 in API response.

### Pitfall 3: Ticketmaster Events Without Venues or Attractions
**What goes wrong:** Some Ticketmaster events have no `_embedded.venues` or `_embedded.attractions` array. Accessing `event._embedded.venues[0]` crashes with undefined.
**Why it happens:** Virtual events, TBA venues, or data quality issues in the API.
**How to avoid:** Always check for existence of `_embedded`, `_embedded.venues`, and `_embedded.attractions` before accessing. Skip events without a venue (they can't map to our model). Log skipped events for monitoring.
**Warning signs:** `TypeError: Cannot read property '0' of undefined`.

### Pitfall 4: Repeatable Jobs Don't Accumulate
**What goes wrong:** If no BullMQ worker is running (e.g., during a deploy), repeatable jobs do NOT queue up. The next job is only scheduled after the previous one completes.
**Why it happens:** BullMQ repeatable jobs work by scheduling the NEXT job after the CURRENT one finishes. No worker = no scheduling.
**How to avoid:** This is actually desired behavior for sync jobs (you don't want 10 hours of sync jobs to pile up during downtime). After a deploy, the repeatable job resumes on its next scheduled time. Document this: missed syncs are caught up by the next sync's 30-day lookahead window.
**Warning signs:** Gap in sync history after deploys. Not a bug.

### Pitfall 5: Duplicate Bands from Inconsistent Ticketmaster Names
**What goes wrong:** Ticketmaster may list the same band as "The Black Keys" in one event and "Black Keys" in another, or "AC/DC" vs "ACDC". The fuzzy matcher might not catch all variations, leading to duplicate band records.
**Why it happens:** Ticketmaster's data quality varies. Special characters, "The" prefix, and abbreviations cause mismatches.
**How to avoid:** (1) Use `external_id` (Ticketmaster attraction ID) as the PRIMARY dedup key for bands. If the attraction ID matches, it's the same band regardless of name variation. (2) Fall back to name matching only for bands that aren't in the DB yet. (3) Normalize names before matching: lowercase, strip "The " prefix, remove special characters.
**Warning signs:** Multiple band records with similar names but different external_ids (legitimate) vs same external_id (bug).

### Pitfall 6: Venues Table Missing External ID Column
**What goes wrong:** The current `venues` table has no `external_id` or `source` column. Without these, Ticketmaster venue deduplication must rely solely on name+address matching, which is fragile.
**Why it happens:** Phase 1 added `external_id` and `source` to `events` only, not to `venues` or `bands`.
**How to avoid:** Phase 2 must add `external_id` and `source` columns to both `venues` and `bands` tables via migrations. These columns enable reliable deduplication: `UNIQUE(source, external_id)` on each table.
**Warning signs:** Duplicate venue records with slightly different names (e.g., "Madison Square Garden" vs "MSG" vs "Madison Sq Garden").

### Pitfall 7: Rate Limit Exhaustion from Dense Metro Queries
**What goes wrong:** A single sync run for 20+ metro areas could exhaust the 5000 daily API call quota, especially with pagination and date range subdivision.
**Why it happens:** 20 regions * 5 pages * 2 date-range subdivisions = 200 calls per sync. 6 syncs/day = 1200 calls. Seems fine, but dense metros with >1000 events per week require more subdivision.
**How to avoid:** (1) Track daily API call count in Redis (`INCR ticketmaster:daily_calls` with TTL at midnight). (2) Skip remaining regions if quota is near exhaustion (e.g., stop at 4500). (3) Prioritize regions by user count. (4) Log quota usage in sync history.
**Warning signs:** Ticketmaster returns HTTP 429 or empty responses.

### Pitfall 8: User Location Data Not Available
**What goes wrong:** The `users` table has a `location` field (VARCHAR) but no `latitude`/`longitude` columns. User-driven coverage requires geocoded locations.
**Why it happens:** The original schema stored location as a free-text string, not coordinates.
**How to avoid:** Two options: (1) Add a `sync_regions` table that maps to geo coordinates and is manually managed or populated from user check-in venue locations (venues DO have lat/lon), or (2) Derive coverage from venue check-in locations (where users actually go). Recommendation: Use venue locations from recent check-ins to derive coverage regions. This is more accurate than user profile locations and requires no schema changes to the users table.
**Warning signs:** Empty sync region list because no user locations are available.

## Code Examples

### BullMQ Queue and Worker Setup
```typescript
// Source: BullMQ docs (docs.bullmq.io)
// src/jobs/queue.ts
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// BullMQ REQUIRES maxRetriesPerRequest: null
export function createBullMQConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL required for job queue');
  }
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,  // Required by BullMQ
    enableReadyCheck: false,
  });
}

export const eventSyncQueue = new Queue('event-sync', {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,  // 5s, 10s, 20s
    },
    removeOnComplete: { count: 100 },  // Keep last 100 completed
    removeOnFail: { count: 200 },      // Keep last 200 failed
  },
});
```

### Registering Repeatable Sync Job
```typescript
// Source: BullMQ repeatable docs
// src/jobs/syncScheduler.ts

export async function registerSyncJobs(): Promise<void> {
  // Main sync: every 4 hours
  await eventSyncQueue.add('scheduled-sync', {}, {
    repeat: {
      pattern: '0 */4 * * *',  // At minute 0, every 4 hours
    },
    jobId: 'scheduled-event-sync',  // Prevents duplicate registrations
  });

  // Cancellation check: once daily at 6 AM
  await eventSyncQueue.add('check-cancellations', {}, {
    repeat: {
      pattern: '0 6 * * *',
    },
    jobId: 'daily-cancellation-check',
  });
}
```

### Ticketmaster API Call with Error Handling
```typescript
// src/services/TicketmasterAdapter.ts
import axios, { AxiosInstance, AxiosError } from 'axios';

interface SearchParams {
  latlong: string;
  radius: number;
  unit?: 'miles' | 'km';
  startDateTime: string;
  endDateTime: string;
  classificationName?: string;
  size?: number;
  page?: number;
  sort?: string;
}

export class TicketmasterAdapter {
  private client: AxiosInstance;

  constructor() {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) throw new Error('TICKETMASTER_API_KEY is required');

    this.client = axios.create({
      baseURL: 'https://app.ticketmaster.com/discovery/v2',
      params: { apikey: apiKey },
      timeout: 10000,
    });
  }

  async searchMusicEvents(params: SearchParams): Promise<{
    events: TicketmasterEvent[];
    page: { totalElements: number; totalPages: number; number: number; size: number };
  }> {
    const response = await this.client.get('/events.json', {
      params: {
        latlong: params.latlong,
        radius: params.radius,
        unit: params.unit || 'miles',
        startDateTime: params.startDateTime,
        endDateTime: params.endDateTime,
        classificationName: params.classificationName || 'music',
        size: params.size || 200,
        page: params.page || 0,
        sort: params.sort || 'date,asc',
      },
    });

    const data = response.data;
    const events = data._embedded?.events || [];
    const page = data.page || { totalElements: 0, totalPages: 0, number: 0, size: 0 };

    return { events, page };
  }

  async getEventById(eventId: string): Promise<TicketmasterEvent | null> {
    try {
      const response = await this.client.get(`/events/${eventId}.json`);
      return response.data;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) return null;
      throw error;
    }
  }
}
```

### Band Name Matching with pg_trgm
```typescript
// src/services/BandMatcher.ts
import Database from '../config/database';

interface MatchResult {
  bandId: string;
  matchType: 'exact' | 'fuzzy' | 'external_id' | 'created';
  score?: number;
}

export class BandMatcher {
  private db = Database.getInstance();

  async matchOrCreateBand(
    name: string,
    externalId?: string,
    genre?: string,
    imageUrl?: string,
  ): Promise<MatchResult> {
    // Step 1: Match by external_id (most reliable)
    if (externalId) {
      const extMatch = await this.db.query(
        `SELECT id FROM bands WHERE source = 'ticketmaster' AND external_id = $1`,
        [externalId]
      );
      if (extMatch.rows.length > 0) {
        return { bandId: extMatch.rows[0].id, matchType: 'external_id' };
      }
    }

    // Step 2: Exact case-insensitive match
    const exactMatch = await this.db.query(
      `SELECT id FROM bands WHERE LOWER(name) = LOWER($1) AND is_active = true LIMIT 1`,
      [name]
    );
    if (exactMatch.rows.length > 0) {
      // Update external_id if we have one
      if (externalId) {
        await this.db.query(
          `UPDATE bands SET external_id = $1, source = 'ticketmaster' WHERE id = $2 AND external_id IS NULL`,
          [externalId, exactMatch.rows[0].id]
        );
      }
      return { bandId: exactMatch.rows[0].id, matchType: 'exact' };
    }

    // Step 3: Fuzzy match with high threshold (conservative)
    const fuzzyMatch = await this.db.query(
      `SELECT id, name, similarity(LOWER(name), LOWER($1)) AS score
       FROM bands
       WHERE LOWER(name) % LOWER($1)
         AND similarity(LOWER(name), LOWER($1)) >= 0.8
         AND is_active = true
       ORDER BY score DESC
       LIMIT 1`,
      [name]
    );
    if (fuzzyMatch.rows.length > 0) {
      if (externalId) {
        await this.db.query(
          `UPDATE bands SET external_id = $1, source = 'ticketmaster' WHERE id = $2 AND external_id IS NULL`,
          [externalId, fuzzyMatch.rows[0].id]
        );
      }
      return {
        bandId: fuzzyMatch.rows[0].id,
        matchType: 'fuzzy',
        score: parseFloat(fuzzyMatch.rows[0].score),
      };
    }

    // Step 4: No match -- create new band
    const newBand = await this.db.query(
      `INSERT INTO bands (name, genre, image_url, source, external_id)
       VALUES ($1, $2, $3, 'ticketmaster', $4)
       RETURNING id`,
      [name, genre || null, imageUrl || null, externalId || null]
    );
    return { bandId: newBand.rows[0].id, matchType: 'created' };
  }
}
```

### On-Demand Ticketmaster Lookup
```typescript
// For events outside synced coverage -- called when user tries to interact
// with an event that isn't in the DB
async function onDemandLookup(ticketmasterEventId: string): Promise<Event | null> {
  const adapter = new TicketmasterAdapter();
  const tmEvent = await adapter.getEventById(ticketmasterEventId);
  if (!tmEvent) return null;

  const syncService = new EventSyncService();
  return await syncService.ingestSingleEvent(tmEvent);
}
```

### Venue Upsert by External ID
```typescript
// Upsert venue from Ticketmaster data
async function upsertVenue(tmVenue: TicketmasterVenue): Promise<string> {
  const result = await db.query(
    `INSERT INTO venues (
      name, address, city, state, country, postal_code,
      latitude, longitude, timezone, source, external_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ticketmaster', $10)
    ON CONFLICT (source, external_id) DO UPDATE SET
      name = EXCLUDED.name,
      address = COALESCE(EXCLUDED.address, venues.address),
      latitude = COALESCE(EXCLUDED.latitude, venues.latitude),
      longitude = COALESCE(EXCLUDED.longitude, venues.longitude),
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`,
    [
      tmVenue.name,
      tmVenue.address?.line1 || null,
      tmVenue.city?.name || null,
      tmVenue.state?.stateCode || null,
      tmVenue.country?.countryCode || null,
      tmVenue.postalCode || null,
      tmVenue.location?.latitude ? parseFloat(tmVenue.location.latitude) : null,
      tmVenue.location?.longitude ? parseFloat(tmVenue.location.longitude) : null,
      tmVenue.timezone || null,
      tmVenue.id,
    ]
  );
  return result.rows[0].id;
}
```

### Event Status Detection (Cancellation/Rescheduling)
```typescript
// During re-sync, detect status changes
function mapTicketmasterStatus(statusCode: string): string {
  switch (statusCode) {
    case 'onsale':
    case 'offsale':
      return 'active';
    case 'canceled':
      return 'cancelled';
    case 'postponed':
      return 'postponed';
    case 'rescheduled':
      return 'rescheduled';
    default:
      return 'active';
  }
}

// Update event status and notify affected users
async function handleStatusChange(
  eventId: string,
  newStatus: string,
  oldStatus: string
): Promise<void> {
  if (newStatus === oldStatus) return;

  await db.query(
    `UPDATE events SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [newStatus, eventId]
  );

  // Notify users who have checked in to this event
  if (newStatus === 'cancelled' || newStatus === 'rescheduled') {
    const checkinUsers = await db.query(
      `SELECT DISTINCT user_id FROM checkins WHERE event_id = $1`,
      [eventId]
    );
    // Create notifications for each affected user
    for (const row of checkinUsers.rows) {
      await notificationService.createNotification({
        userId: row.user_id,
        type: `event_${newStatus}`,
        title: `Event ${newStatus}`,
        message: `An event you checked in to has been ${newStatus}`,
        eventId,
      });
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron for scheduling | BullMQ repeatable jobs | BullMQ v3+ (2022) | Persistent, distributed, rate-limited, retry-capable |
| Custom rate limiting in-memory | BullMQ Worker `limiter` option | BullMQ v2+ | Distributed across workers, handles backpressure |
| ILIKE for fuzzy matching | pg_trgm with GIN index | pg_trgm has existed for years, GIN support mature | O(1) index lookup vs O(n) table scan for similarity |
| Bull (v3) | BullMQ (v5) | BullMQ is the successor | TypeScript native, no QueueScheduler needed, better API |
| Single-use API fetch scripts | Adapter pattern + job queue | Standard practice | Testable, rate-limit aware, error-isolated |

**Deprecated/outdated:**
- `Bull` (the original library): BullMQ is the official successor. Do not use `bull` npm package.
- `QueueScheduler`: Removed in BullMQ v2+. No longer needed for delayed/repeatable jobs.
- `node-cron` / `cron`: Fine for simple schedules but lacks persistence, retry, and rate limiting.

## Database Schema Changes Needed

### Migration: Add External ID to Venues
```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('venues', {
    external_id: { type: 'varchar(255)' },
    source: { type: 'varchar(50)' },
  });
  pgm.addConstraint('venues', 'unique_venue_external', {
    unique: ['source', 'external_id'],
  });
  pgm.createIndex('venues', ['source', 'external_id']);
}
```

### Migration: Add External ID to Bands
```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('bands', {
    external_id: { type: 'varchar(255)' },
    source: { type: 'varchar(50)' },
  });
  pgm.addConstraint('bands', 'unique_band_external', {
    unique: ['source', 'external_id'],
  });
  pgm.createIndex('bands', ['source', 'external_id']);
  // GIN trigram index for fuzzy matching
  pgm.createIndex('bands', 'name', {
    method: 'gin',
    name: 'idx_bands_name_trgm',
    opclass: 'gin_trgm_ops',
  });
}
```

### Migration: Add Event Status Column
```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add status column (richer than is_cancelled boolean)
  pgm.addColumn('events', {
    status: {
      type: 'varchar(20)',
      default: "'active'",
      notNull: true,
      check: "status IN ('active', 'cancelled', 'postponed', 'rescheduled')",
    },
  });
  // Backfill: set cancelled events
  pgm.sql(`UPDATE events SET status = 'cancelled' WHERE is_cancelled = true`);
  pgm.createIndex('events', 'status');
}
```

### Migration: Sync Regions Table
```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('sync_regions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    label: { type: 'varchar(255)' },        // "Nashville, TN" or "NYC Metro"
    latitude: { type: 'decimal(10,8)', notNull: true },
    longitude: { type: 'decimal(11,8)', notNull: true },
    radius_miles: { type: 'integer', default: 50 },
    is_active: { type: 'boolean', default: true },
    user_count: { type: 'integer', default: 0 },
    last_synced_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });
}
```

### Migration: Sync Log Table
```typescript
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('event_sync_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    region_id: { type: 'uuid', references: 'sync_regions' },
    job_id: { type: 'varchar(255)' },
    status: { type: 'varchar(20)', notNull: true },  // 'running', 'completed', 'failed'
    events_fetched: { type: 'integer', default: 0 },
    events_created: { type: 'integer', default: 0 },
    events_updated: { type: 'integer', default: 0 },
    events_skipped: { type: 'integer', default: 0 },
    bands_created: { type: 'integer', default: 0 },
    bands_matched: { type: 'integer', default: 0 },
    venues_created: { type: 'integer', default: 0 },
    api_calls_made: { type: 'integer', default: 0 },
    error_message: { type: 'text' },
    started_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('event_sync_log', 'started_at');
  pgm.createIndex('event_sync_log', 'status');
}
```

## Ticketmaster API Details (Reference)

### Key Parameters for Music Event Sync
| Parameter | Value | Purpose |
|-----------|-------|---------|
| `classificationName` | `music` | Only music events |
| `latlong` | `{lat},{lon}` | Center of sync region |
| `radius` | `50` | 50-mile coverage |
| `unit` | `miles` | Default unit |
| `startDateTime` | ISO 8601 | Today's date |
| `endDateTime` | ISO 8601 | 30 days from now |
| `size` | `200` | Max per page |
| `sort` | `date,asc` | Chronological order |
| `page` | `0..4` | Max 5 pages (1000 items) |

### Key Response Fields to Extract
| TM Field | Maps To | Table |
|----------|---------|-------|
| `event.id` | `external_id` | events |
| `event.name` | `event_name` | events |
| `event.dates.start.localDate` | `event_date` | events |
| `event.dates.start.localTime` | `start_time` | events |
| `event.dates.status.code` | `status` | events |
| `event.url` | `ticket_url` | events |
| `event.priceRanges[0].min/max` | `ticket_price_min/max` | events |
| `venue.id` | `external_id` | venues |
| `venue.name` | `name` | venues |
| `venue.location.latitude/longitude` | `latitude/longitude` | venues |
| `venue.city.name` | `city` | venues |
| `venue.state.stateCode` | `state` | venues |
| `venue.timezone` | `timezone` | venues |
| `attraction.id` | `external_id` | bands |
| `attraction.name` | `name` | bands |
| `attraction.classifications[0].genre.name` | `genre` | bands |
| `attraction.images[0].url` (16_9 ratio) | `image_url` | bands |

### Rate Limit Budget
- **Daily quota:** 5,000 calls
- **Per-second:** 5 requests
- **Per sync run estimate:** ~50-200 calls (depends on region count and density)
- **Safe sync frequency:** Every 4 hours (6 times/day = 300-1200 calls)
- **Headroom for on-demand lookups:** ~2000-3000 calls/day reserved

## Open Questions

1. **User location for coverage regions**
   - What we know: Users table has `location` VARCHAR but no lat/lon. Venues have lat/lon. Check-ins link users to venues.
   - What's unclear: Whether to derive coverage from user profile locations or check-in venue locations.
   - Recommendation: Derive from check-in venue locations (venues.latitude/longitude). This is more accurate (where users actually attend shows), requires no user schema changes, and works immediately with existing data. Add `sync_regions` table for explicit control.

2. **Ticketmaster API key provisioning**
   - What we know: Free tier provides 5000 calls/day. Registration required on developer portal.
   - What's unclear: Whether the app already has an API key or needs to register.
   - Recommendation: Add `TICKETMASTER_API_KEY` to Railway env vars. Make the sync pipeline gracefully skip if the key is not configured (allows deployment without TM integration).

3. **How to handle events.unique_external_event constraint with NULL external_id**
   - What we know: The existing constraint is `UNIQUE(source, external_id)`. User-created events have `source='user_created'` and `external_id=NULL`. Multiple NULL values in a unique index are considered distinct in PostgreSQL.
   - What's unclear: Nothing -- PostgreSQL handles this correctly. Multiple `(user_created, NULL)` rows are allowed.
   - Recommendation: No action needed. The constraint works as intended.

4. **Ticketmaster event classification for "music" may miss some events**
   - What we know: `classificationName=music` filters by segment. Some events might be classified as "Arts & Theatre" or use genre-specific segments.
   - What's unclear: How comprehensive the "music" classification is for concert events.
   - Recommendation: Start with `classificationName=music`. Monitor and expand if needed. The on-demand lookup covers any gaps.

## Sources

### Primary (HIGH confidence)
- [Ticketmaster Discovery API v2 Official Docs](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) - Full endpoint documentation, response structure, rate limits
- [BullMQ Official Docs - Repeatable Jobs](https://docs.bullmq.io/guide/jobs/repeatable) - Repeatable job configuration, survival across restarts
- [BullMQ Official Docs - Rate Limiting](https://docs.bullmq.io/guide/rate-limiting) - Worker limiter options, max/duration configuration
- [BullMQ Official Docs - Quick Start](https://docs.bullmq.io/readme-1) - Installation, Queue/Worker setup, connection requirements
- [PostgreSQL pg_trgm Documentation](https://www.postgresql.org/docs/current/pgtrgm.html) - Similarity functions, operators, thresholds, GIN/GiST indexes
- Existing codebase: `EventService.ts` (515 lines) - findOrCreateEvent pattern, event CRUD
- Existing codebase: `MusicBrainzService.ts` - Adapter pattern for external API with rate limiting
- Existing codebase: `redisRateLimiter.ts` - Existing Redis/ioredis setup
- Existing codebase: `migrations/002_expand-create-events-table.ts` - Events table schema with source/external_id

### Secondary (MEDIUM confidence)
- [BullMQ Global Rate Limit](https://docs.bullmq.io/guide/queues/global-rate-limit) - Queue-level rate limiting
- [BullMQ npm page](https://www.npmjs.com/package/bullmq) - Version 5.66.5, last published 2026-01-12
- [Ticketmaster API Getting Started Tutorial](https://developer.ticketmaster.com/products-and-docs/tutorials/events-search/search_events_with_discovery_api.html) - lat/long search examples

### Tertiary (LOW confidence)
- [OneUptime BullMQ Guide (Jan 2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-job-queue-bullmq-redis/view) - Community tutorial
- [BullMQ for Beginners (Medium)](https://hadoan.medium.com/bullmq-for-beginners-a-friendly-practical-guide-with-typescript-examples-eb8064bef1c4) - Community tutorial

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - BullMQ is de facto for Node.js queues, axios/pg/ioredis already in project
- Architecture: HIGH - Adapter pattern matches existing codebase, upsert-on-external-id is standard
- Ticketmaster API: HIGH - Official documentation verified via WebFetch, response structure confirmed
- BullMQ setup: HIGH - Official docs verified, connection requirements confirmed
- pg_trgm matching: HIGH - PostgreSQL official docs, extension already enabled
- Pitfalls: HIGH - Derived from API documentation limits and codebase inspection
- Coverage region strategy: MEDIUM - User-driven approach is novel; derived from check-in venue locations is a recommendation, not a proven pattern
- Sync frequency recommendation (4 hours): MEDIUM - Balances freshness vs quota; may need adjustment based on real usage

**Research date:** 2026-02-02
**Valid until:** 2026-03-04 (30 days -- Ticketmaster API and BullMQ are stable)
