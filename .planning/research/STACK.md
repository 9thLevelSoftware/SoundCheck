# Technology Stack: SoundCheck Milestone 2 Additions

**Project:** SoundCheck ("Untappd for live music")
**Scope:** New capabilities on existing Flutter + Node/Express/TypeScript + PostgreSQL stack
**Researched:** 2026-02-02

---

## Existing Stack (Not Re-Researched)

The existing stack is solid and does not need replacing. For reference:

| Layer | Technology | Version |
|-------|-----------|---------|
| Mobile | Flutter/Dart | 3.2+ |
| State Management | Riverpod | 3.1.0 |
| Backend | Node.js / Express / TypeScript | 20 / 4.21 / 5.9 |
| Database | PostgreSQL | 12+ |
| Cache | Redis / ioredis | 5.9.0 |
| HTTP Client | axios (backend), dio (mobile) | 1.13.2 / 5.4.3 |
| WebSocket | ws (backend), web_socket_channel (mobile) | 8.19.0 / 3.0.1 |
| Validation | zod | 3.25.76 |
| Hosting | Railway.app | -- |

This research covers **only the new libraries, APIs, and patterns** needed for the Untappd-style features.

---

## 1. Concert Event APIs

### Recommended: Ticketmaster Discovery API (PRIMARY) + Bandsintown API (SECONDARY)

**Confidence: HIGH (Ticketmaster), MEDIUM (Bandsintown)**

#### Ticketmaster Discovery API -- PRIMARY

| Attribute | Detail |
|-----------|--------|
| **Cost** | Free |
| **Rate Limit** | 5,000 calls/day, 2-5 req/sec |
| **Coverage** | 230K+ events, US/CA/UK/EU/AU/NZ |
| **Data Model** | Events, Attractions (performers), Venues, Classifications (genre/subgenre) |
| **Lineup Data** | Yes -- events link to multiple "attractions" (performers) |
| **Genre Taxonomy** | 3-level: Segment > Genre > Sub-genre |
| **Auth** | API key in query parameter |
| **Format** | REST / JSON |
| **Deep Paging** | Limited to 1,000th item |
| **Discovery Feed** | Bulk data export available (no rate limits, hourly refresh) |
| **Node.js SDK** | `ticketmaster` npm v2.0.4 -- low adoption (~20 downloads/week), use axios directly instead |

**Why Ticketmaster is the primary source:**
1. **Largest dataset** -- 230K+ live events across major markets.
2. **Free, no approval process** -- instant API key on registration.
3. **Multi-performer events** -- the "attractions" model maps directly to SoundCheck's multi-band lineup requirement.
4. **Genre classification** -- 3-level taxonomy (Segment/Genre/Sub-genre) maps to badge system genre tracking.
5. **Discovery Feed** -- bulk export removes rate limit concerns for initial data seeding.
6. **Stable and well-documented** -- active developer portal, no signs of deprecation.

**Important limitation:** Ticketmaster does NOT provide setlist data (songs performed). SetlistFM (already integrated) covers this.

**Integration approach:** Use `axios` directly against the REST API rather than the `ticketmaster` npm SDK. The SDK has very low adoption (~20 weekly downloads), questionable maintenance, and the REST API is simple enough that a thin wrapper service is cleaner and more maintainable.

```typescript
// Recommended: thin service wrapper with axios (already in deps)
class TicketmasterService {
  private readonly baseUrl = 'https://app.ticketmaster.com/discovery/v2';
  private readonly apiKey: string;

  async searchEvents(params: {
    keyword?: string;
    latlong?: string;
    radius?: number;
    classificationName?: string;
    startDateTime?: string;
    endDateTime?: string;
    page?: number;
    size?: number;
  }): Promise<TicketmasterResponse> {
    return this.client.get(`${this.baseUrl}/events.json`, {
      params: { ...params, apikey: this.apiKey }
    });
  }
}
```

#### Bandsintown API -- SECONDARY

| Attribute | Detail |
|-----------|--------|
| **Cost** | Free (with approval) |
| **Rate Limit** | Not publicly documented |
| **Coverage** | Strong for indie/DIY/smaller acts |
| **Data Model** | Artists, Events, Venues, Offers |
| **Lineup Data** | Per-artist events (not multi-band lineup oriented) |
| **Auth** | app_id parameter (requires application + approval) |
| **Format** | REST / JSON |
| **Access** | Requires written consent from Bandsintown Inc. |

**Why Bandsintown is the secondary source:**
1. **Complements Ticketmaster's gaps** -- better coverage of indie, DIY, and smaller-venue shows that Ticketmaster doesn't list.
2. **Artist-centric model** -- useful for "follow this artist" features and upcoming show notifications.
3. **Caveat: access requires approval** -- you must contact Bandsintown and describe your use case to get an API key. This may introduce delays.
4. **Caveat: artist-level API keys** -- each key is linked to a single artist unless authorized otherwise. For a consumer app aggregating many artists, you need to negotiate broader access.

**Integration approach:** Same axios-based service wrapper pattern as Ticketmaster. Plan for delayed access -- build Ticketmaster integration first, add Bandsintown when approved.

#### NOT Recommended

| API | Why Not |
|-----|---------|
| **Songkick** | **New API key registrations frozen.** Official page says "unable to process new applications." Existing keys reportedly being disabled. Do not build on this -- it is unreliable. (Confidence: HIGH) |
| **SeatGeek** | US-only, pay-per-use pricing model, anti-compete clause in API terms prohibits building competing services. SoundCheck's concert discovery features could trigger this. (Confidence: MEDIUM) |
| **JamBase** | Enterprise-oriented, no public pricing, 14-day trial only. Contact-based sales process not suitable for indie app development. (Confidence: MEDIUM) |
| **PredictHQ** | Enterprise demand intelligence product, not a consumer event API. Optimized for hospitality/retail forecasting, not concert discovery UX. Overkill and likely expensive. (Confidence: MEDIUM) |
| **Google Events (SerpApi)** | Scraping wrapper, not a proper API. Terms-of-service risk, inconsistent data structure, ongoing cost per query. (Confidence: HIGH) |

---

## 2. Background Job Processing

### Recommended: BullMQ

**Confidence: HIGH**

| Attribute | Detail |
|-----------|--------|
| **Package** | `bullmq` |
| **Version** | 5.66.5 (published 2026-01-12) |
| **License** | MIT (open source, no restrictions) |
| **Backend** | Redis (already in stack via ioredis) |
| **Weekly Downloads** | ~850K+ |

**Why BullMQ:**
1. **Redis is already in the stack** -- ioredis 5.9.0 is a dependency. Zero new infrastructure.
2. **Exactly what event API syncing needs** -- delayed jobs, retries, rate limiting, scheduled recurring jobs.
3. **Badge evaluation pipeline** -- after every check-in, queue a job to evaluate badge criteria asynchronously. This keeps the check-in endpoint fast (<200ms) while badge logic runs in the background.
4. **Event data pipeline** -- schedule recurring jobs to sync Ticketmaster events (hourly/daily), with built-in retry on API failures.
5. **Recommendation recomputation** -- schedule periodic re-computation of user similarity vectors without blocking request handling.
6. **MIT licensed** -- no licensing concerns for the open-source version.

**Use cases in SoundCheck:**

| Queue | Purpose | Schedule |
|-------|---------|----------|
| `event-sync` | Pull events from Ticketmaster/Bandsintown | Every 1-4 hours (cron repeatable job) |
| `badge-evaluation` | Evaluate badge criteria after check-in | On-demand (triggered by check-in) |
| `feed-fanout` | Fan out activity to follower feeds | On-demand (triggered by check-in) |
| `recommendation-update` | Recompute user/event similarity vectors | Nightly (cron repeatable job) |
| `notification-dispatch` | Send push notifications for friend activity | On-demand (triggered by events) |

**Why NOT node-cron or node-schedule:**
These are in-memory schedulers -- jobs disappear on restart. BullMQ persists jobs in Redis, survives restarts, supports retries, and provides proper observability. For a production app on Railway.app where deployments restart the process, persistence is mandatory.

```bash
npm install bullmq
# No additional deps -- ioredis already installed
```

---

## 3. Real-Time Social Feed

### Recommended: Keep existing WebSocket (ws) + add Redis Pub/Sub via ioredis

**Confidence: HIGH**

The app already has `ws` 8.19.0 on the backend and `web_socket_channel` 3.0.1 on mobile. No new libraries needed. The architecture change is in *how* WebSocket messages are generated and distributed.

**Architecture pattern: Fan-out on write with WebSocket delivery**

```
Check-in created
  |
  v
[BullMQ: feed-fanout job]
  |
  v
Query user's followers
  |
  v
For each follower:
  1. Write to follower's feed table (PostgreSQL)
  2. Publish to Redis channel: `user:{followerId}:feed`
  |
  v
[WebSocket server subscribes to Redis Pub/Sub]
  |
  v
If follower is connected, push feed item via WebSocket
If not connected, they'll see it on next app open (from DB)
```

**Why this pattern (not SSE, not Socket.IO):**

| Option | Verdict | Reason |
|--------|---------|--------|
| **Keep ws + Redis Pub/Sub** | RECOMMENDED | Already in stack, bidirectional needed for toasts/reactions, Redis Pub/Sub handles multi-instance fan-out |
| **Switch to SSE** | NOT RECOMMENDED | Feed is unidirectional (good for SSE), but toasts, reactions, and typing indicators need bidirectional. Running both SSE and WS adds complexity for no benefit. |
| **Switch to Socket.IO** | NOT RECOMMENDED | Adds ~100KB to bundle, abstractions on top of ws you don't need. The app already has working ws infrastructure. Socket.IO's auto-reconnection is nice but can be built with ~50 lines on top of ws. |

**Key addition for multi-instance scaling on Railway:**

The current WebSocket setup likely broadcasts only to connections on a single server instance. When Railway scales to multiple instances, users on different instances won't see each other's updates. Redis Pub/Sub solves this:

```typescript
// On check-in: publish to Redis
await redis.publish(`feed:${followerId}`, JSON.stringify(feedItem));

// WebSocket server: subscribe to channels for connected users
const sub = new Redis(process.env.REDIS_URL);
sub.subscribe(`feed:${userId}`);
sub.on('message', (channel, message) => {
  const ws = connectedUsers.get(userId);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
});
```

**No new npm packages required** -- ioredis already supports Pub/Sub.

**Flutter-side pattern:**
Use Riverpod `StreamProvider` wrapping the existing `web_socket_channel` connection. The Riverpod 3.x `@riverpod` macro with `StreamProvider` gives automatic UI updates when feed items arrive, connection state tracking, and automatic cleanup on disposal.

```dart
@riverpod
Stream<FeedItem> liveFeed(Ref ref) {
  final channel = ref.watch(webSocketChannelProvider);
  return channel.stream
    .map((data) => FeedItem.fromJson(jsonDecode(data)))
    .handleError((e) => ref.invalidateSelf());
}
```

---

## 4. Gamification / Badge Engine

### Recommended: Custom event-driven badge engine using BullMQ + PostgreSQL

**Confidence: HIGH**

There is no good off-the-shelf badge library for Node.js/PostgreSQL. The existing frameworks (RWTH Gamification Framework, etc.) are Java-based or overly generic. Build a custom engine -- it is the right call for a domain-specific badge system.

**Database schema pattern:**

```sql
-- Badge definitions (seeded, not user-generated)
CREATE TABLE badge_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,  -- 'genre_explorer_metal_5'
  name VARCHAR(200) NOT NULL,         -- 'Metal Explorer'
  description TEXT,
  icon_url VARCHAR(500),
  category VARCHAR(50) NOT NULL,      -- 'genre_explorer', 'venue_collector', 'superfan', 'festival_warrior'
  tier INTEGER NOT NULL DEFAULT 1,    -- bronze=1, silver=2, gold=3
  criteria JSONB NOT NULL,            -- {"type":"genre_count","genre":"metal","threshold":5}
  rarity_percent DECIMAL(5,2),        -- computed periodically
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User badge awards
CREATE TABLE user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  badge_id UUID NOT NULL REFERENCES badge_definitions(id),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  check_in_id UUID REFERENCES check_ins(id), -- the check-in that triggered it
  UNIQUE(user_id, badge_id)
);

-- Badge progress tracking (for multi-step badges)
CREATE TABLE badge_progress (
  user_id UUID NOT NULL REFERENCES users(id),
  badge_id UUID NOT NULL REFERENCES badge_definitions(id),
  current_count INTEGER NOT NULL DEFAULT 0,
  target_count INTEGER NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);
```

**Badge evaluation flow:**

```
Check-in created
  |
  v
[API response returns immediately to user]
  |
  v
[BullMQ job: badge-evaluation]
  |
  v
Badge evaluator loads user stats:
  - Genre counts (from check-ins + event genres)
  - Unique venue count
  - Per-band check-in counts
  - Same-day check-in count (festival warrior)
  |
  v
Compare against badge_definitions.criteria (JSONB)
  |
  v
If threshold met AND badge not already earned:
  1. INSERT into user_badges
  2. UPDATE badge_progress
  3. Push WebSocket notification to user
  4. UPDATE rarity_percent (async, batch)
```

**Why JSONB criteria:**
Storing badge criteria as JSONB (`{"type":"genre_count","genre":"metal","threshold":5}`) means new badge types can be added without code changes or migrations. The badge evaluator reads the criteria type and dispatches to the appropriate checker function. This is the pattern used by successful gamification systems (Foursquare/Swarm badges work similarly).

**Badge categories for SoundCheck:**

| Category | Criteria Type | Example |
|----------|--------------|---------|
| Genre Explorer | `genre_count` | See 5/10/25 shows in "metal" |
| Venue Collector | `unique_venue_count` | Check in at 10/25/50 unique venues |
| Superfan | `same_band_count` | See the same band 3/5/10 times |
| Festival Warrior | `same_day_count` | Check in to 3/5 shows in one day |
| First Timer | `first_action` | First check-in, first review, first photo |
| City Explorer | `unique_city_count` | Check in at venues in 5/10 different cities |

**No new npm packages required** -- this is pure application logic using PostgreSQL, BullMQ, and existing WebSocket infrastructure.

---

## 5. Recommendation Engine

### Recommended: PostgreSQL-native approach with pgvector for future scaling

**Confidence: MEDIUM**

Recommendation is a "build simple first, add ML later" domain. Start with PostgreSQL queries, graduate to pgvector when you have enough data.

#### Phase 1: SQL-based recommendations (MVP)

No new dependencies. Pure PostgreSQL queries.

**Approach: Popularity + content-based filtering using existing data**

```sql
-- "Upcoming shows you might like" based on genres the user checks into
SELECT DISTINCT e.id, e.name, e.date,
  COUNT(DISTINCT uc.genre) AS genre_overlap
FROM events e
JOIN event_genres eg ON e.id = eg.event_id
JOIN (
  -- Genres this user has checked into
  SELECT DISTINCT g.name AS genre
  FROM check_ins ci
  JOIN events ev ON ci.event_id = ev.id
  JOIN event_genres evg ON ev.id = evg.event_id
  JOIN genres g ON evg.genre_id = g.id
  WHERE ci.user_id = $1
) uc ON eg.genre_name = uc.genre
WHERE e.date > NOW()
  AND e.venue_city = $2  -- user's location
GROUP BY e.id
ORDER BY genre_overlap DESC, e.date ASC
LIMIT 20;
```

**Additional signals to incorporate:**
- Artists the user has seen before (prioritize new shows from those artists)
- Venues the user has checked into (familiar venues)
- Friends' upcoming RSVPs (social signal)
- Trending events in user's area (popularity signal)

This SQL approach works well for the first 10K-50K users and requires zero additional infrastructure.

#### Phase 2: pgvector for similarity search (when data justifies it)

| Attribute | Detail |
|-----------|--------|
| **PostgreSQL Extension** | pgvector 0.8.x |
| **Node.js Package** | `pgvector` npm (99K+ weekly downloads) |
| **Railway Support** | Full support -- one-click pgvector template available |
| **Compatible with** | Existing `pg` 8.16.3 client |

**When to graduate to pgvector:**
- 10K+ users with meaningful check-in history
- SQL-based recommendations feel stale or irrelevant
- Need to compute "users like you also went to..." (collaborative filtering)

**How pgvector fits:**
1. Generate user taste vectors (embeddings) from check-in history: genre distribution, venue types, frequency patterns.
2. Store as vectors in PostgreSQL using pgvector.
3. Find similar users via cosine similarity: `ORDER BY user_vector <=> target_vector`.
4. Recommend events that similar users are attending but target user hasn't seen.

```bash
# When ready for Phase 2:
npm install pgvector
# Plus: enable extension on Railway pgvector template
# CREATE EXTENSION vector;
```

#### NOT Recommended for recommendations

| Library | Why Not |
|---------|---------|
| **disco-node** (ankane) | v0.2.0, tiny user base, in-memory only (no PostgreSQL persistence). Good for prototyping, not production. |
| **recommendationRaccoon** | Redis-based, last updated years ago. Adding a separate Redis recommendation store adds complexity for marginal benefit over pgvector. |
| **RecDB** | PostgreSQL extension for recommendations, but requires PostgreSQL 9.2, abandoned project. Not compatible with modern PostgreSQL. |
| **External ML service** | Premature. You need 50K+ check-ins before ML provides meaningfully better recommendations than SQL heuristics. Don't add infrastructure until the data justifies it. |

---

## 6. Push Notifications (Mobile)

### Recommended: Firebase Cloud Messaging (already partially in stack)

**Confidence: HIGH**

The app already uses `firebase_core` 4.3.0 and `firebase_analytics` 12.1.0 on mobile. Adding FCM is incremental.

| Package | Platform | Purpose |
|---------|----------|---------|
| `firebase_messaging` | Flutter (add) | Receive push notifications on mobile |
| `firebase-admin` | Node.js (add) | Send push notifications from backend |

**Why FCM:**
1. **Firebase already initialized** -- `firebase_core` is in pubspec.yaml.
2. **Free for unlimited messages** -- no per-message cost.
3. **Cross-platform** -- single API for iOS and Android.
4. **Reliable delivery** -- Google's infrastructure handles retry/queueing.

**Use cases:**
- Friend checked in at a show near you
- Badge earned notification
- Show you're interested in is starting soon
- Artist you follow has a new show listed

```bash
# Backend
npm install firebase-admin

# Mobile (pubspec.yaml)
# firebase_messaging: ^15.0.0  (verify latest version)
```

**Why NOT custom push via WebSocket only:**
WebSocket notifications only work when the app is open and connected. Push notifications reach users when the app is backgrounded or closed -- which is the primary use case for "your friend just checked in at a show."

---

## 7. Location Verification

### Recommended: Use existing geolocator + server-side distance calculation

**Confidence: HIGH**

The app already has `geolocator` 14.0.2 on mobile. No new packages needed.

**Pattern:**
1. Mobile sends check-in request with current lat/long from geolocator.
2. Backend computes Haversine distance between user coordinates and venue coordinates.
3. If distance < threshold (e.g., 500m), check-in is verified.
4. If distance > threshold, allow check-in but flag as "unverified" (don't block the user experience).

```typescript
// Server-side Haversine -- no library needed, ~20 lines of math
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi/2)**2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

---

## 8. Image Storage (Check-in Photos)

### Recommended: Cloudflare R2 or AWS S3

**Confidence: MEDIUM**

The current stack stores uploads to local filesystem (`backend/uploads/`). This will not work on Railway.app in production -- Railway containers have ephemeral filesystems that reset on deploy.

| Service | Cost | Reason |
|---------|------|--------|
| **Cloudflare R2** | Free egress, $0.015/GB storage | No egress fees makes it ideal for image-heavy apps. S3-compatible API. |
| **AWS S3** | $0.023/GB storage + egress fees | Industry standard, but egress costs add up for image-heavy feeds. |

**Recommended: Cloudflare R2** because SoundCheck is an image-heavy social feed where every check-in may have a photo. Zero egress fees means feed loading doesn't incur per-request cost.

```bash
# S3-compatible client works for both R2 and S3
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

The `@aws-sdk/client-s3` package works with Cloudflare R2 since R2 is S3-compatible. Use presigned URLs for direct mobile-to-R2 uploads to avoid routing image bytes through the Node.js backend.

---

## Complete New Dependencies Summary

### Backend (npm install)

```bash
# Required -- new capabilities
npm install bullmq                    # Job queue (badge eval, event sync, feed fanout)
npm install firebase-admin            # Push notifications from server
npm install @aws-sdk/client-s3        # Image storage (Cloudflare R2)
npm install @aws-sdk/s3-request-presigner  # Presigned upload URLs

# Later (Phase 2 recommendations) -- NOT needed at launch
npm install pgvector                  # Vector similarity for recommendations
```

| Package | Version | Purpose | When |
|---------|---------|---------|------|
| `bullmq` | ^5.66.5 | Background job processing | Phase 1 |
| `firebase-admin` | ^13.0.0 | Server-side push notifications | Phase 1 |
| `@aws-sdk/client-s3` | ^3.700+ | Object storage for check-in photos | Phase 1 |
| `@aws-sdk/s3-request-presigner` | ^3.700+ | Presigned upload URLs | Phase 1 |
| `pgvector` | ^0.2.0 | Vector similarity search | Phase 2 (when data justifies) |

### Mobile (pubspec.yaml additions)

```yaml
# Required -- new capabilities
firebase_messaging: ^15.0.0      # Push notification receiving
```

| Package | Version | Purpose | When |
|---------|---------|---------|------|
| `firebase_messaging` | ^15.0.0 | Receive push notifications | Phase 1 |

**Note:** Verify `firebase_messaging` latest version against pub.dev before adding. The version above is an estimate based on the firebase_core 4.3.0 already in the project -- they should be from compatible FlutterFire generations.

### Infrastructure

| Service | Purpose | Cost | When |
|---------|---------|------|------|
| Ticketmaster API key | Event data | Free | Phase 1 |
| Bandsintown API approval | Supplemental event data | Free (requires approval) | Phase 1-2 |
| Cloudflare R2 bucket | Check-in photo storage | ~$0-5/mo at launch | Phase 1 |
| Railway pgvector template | Vector similarity search | Same as existing DB cost | Phase 2 |

### Environment Variables (new)

```bash
# Event APIs
TICKETMASTER_API_KEY=         # From developer.ticketmaster.com
BANDSINTOWN_APP_ID=           # From Bandsintown approval process

# Push Notifications
FIREBASE_SERVICE_ACCOUNT_KEY= # JSON key for firebase-admin

# Image Storage
R2_ACCOUNT_ID=                # Cloudflare account
R2_ACCESS_KEY_ID=             # R2 API token
R2_SECRET_ACCESS_KEY=         # R2 API secret
R2_BUCKET_NAME=               # e.g., 'soundcheck-images'
R2_PUBLIC_URL=                # e.g., 'https://images.soundcheck.app'
```

---

## Architecture Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary event API | Ticketmaster Discovery | Largest free dataset, instant access, multi-performer support |
| Secondary event API | Bandsintown | Indie/DIY coverage gap-fill, requires approval |
| Job queue | BullMQ on Redis | Already have Redis, persistent jobs survive deploys |
| Real-time feed | Existing ws + Redis Pub/Sub | No new deps, scales across Railway instances |
| Badge engine | Custom PostgreSQL + BullMQ | Domain-specific, no good off-the-shelf option |
| Recommendations (MVP) | SQL queries on PostgreSQL | No new deps, works until 50K+ check-ins |
| Recommendations (v2) | pgvector on Railway | Same database, no new infrastructure |
| Push notifications | Firebase Cloud Messaging | Firebase already initialized, free, cross-platform |
| Image storage | Cloudflare R2 | Zero egress, S3-compatible, fixes ephemeral filesystem problem |
| Event API client | axios (existing) | Ticketmaster npm SDK has 20 downloads/week, axios is cleaner |
| Scheduled jobs | BullMQ repeatable jobs | NOT node-cron -- jobs must survive restarts |

---

## Sources

### Concert Event APIs
- [Ticketmaster Developer Portal](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/) -- Discovery API v2 documentation
- [Ticketmaster Getting Started](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/) -- Rate limits, API key registration
- [Ticketmaster Discovery Feed](https://developer.ticketmaster.com/products-and-docs/apis/discovery-feed/) -- Bulk data feed
- [Bandsintown API Documentation](https://help.artists.bandsintown.com/en/articles/9186477-api-documentation)
- [Bandsintown API Overview](https://help.artists.bandsintown.com/en/articles/7053475-what-is-the-bandsintown-api)
- [Songkick API Key Application (frozen)](https://www.songkick.com/api_key_requests/new) -- Registration not accepting new applications
- [Songkick Support](https://support.songkick.com/hc/en-us/articles/360012423194-Access-the-Songkick-API) -- Confirms API key freeze
- [SeatGeek API Terms](https://seatgeek.com/api-terms) -- Anti-compete clause
- [JamBase Data API](https://data.jambase.com/data-api/) -- Enterprise pricing, contact-only

### Background Processing
- [BullMQ Documentation](https://docs.bullmq.io) -- Official docs
- [BullMQ npm](https://www.npmjs.com/package/bullmq) -- v5.66.5, MIT license
- [BullMQ GitHub](https://github.com/taskforcesh/bullmq) -- Source, releases

### Real-Time Architecture
- [SSE vs WebSockets 2025](https://medium.com/codetodeploy/why-server-sent-events-beat-websockets-for-95-of-real-time-cloud-applications-830eff5a1d7c)
- [Real-Time Web Apps 2025](https://www.debutinfotech.com/blog/real-time-web-apps) -- WebSocket scaling patterns
- [Flutter WebSocket + Riverpod](https://blog.stackademic.com/demystifying-socket-io-real-time-communication-with-flutter-riverpod-ad942fec44c2)
- [Riverpod 3.0](https://riverpod.dev/) -- StreamProvider patterns

### Gamification
- [Badge System Evolution (Nov 2025)](https://www.namitjain.com/blog/backend-driven-badge-system-part-1) -- Database schema patterns
- [Scalable Gamification Engine Data Schema](https://jasonzissman.medium.com/designing-a-scalable-gamification-engine-part-2-data-schema-fb2abfc4feb9) -- JSONB criteria pattern
- [Badge Design in Gamification](https://www.gamedeveloper.com/design/the-application-of-gamification-in-community-badge-design)
- [Why Badges Fail](https://www.gamedeveloper.com/design/why-badges-fail-in-gamification-4-strategies-to-make-them-work-properly)

### Recommendations
- [pgvector GitHub](https://github.com/pgvector/pgvector) -- PostgreSQL vector extension
- [pgvector-node GitHub](https://github.com/pgvector/pgvector-node) -- Node.js integration
- [pgvector npm](https://www.npmjs.com/package/pgvector) -- 99K+ weekly downloads
- [Railway pgvector Deployment](https://railway.com/deploy/pgvector-latest) -- One-click template
- [Railway pgvector Blog](https://blog.railway.com/p/hosting-postgres-with-pgvector) -- Hosting guide
- [Building Recommendations with PostgreSQL](https://reintech.io/blog/building-recommendation-engine-postgresql)
- [disco-node](https://github.com/ankane/disco-node) -- Evaluated but not recommended (v0.2.0, in-memory only)

### Push Notifications
- Firebase Cloud Messaging -- standard Flutter integration via `firebase_messaging`

---

*Stack research completed: 2026-02-02*
