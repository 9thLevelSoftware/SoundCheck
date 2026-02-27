# Architecture Research: v1.1 Feature Integration

**Domain:** Social concert check-in app -- integrating social sharing, moderation, verification, full-text search, collaborative filtering, Wrapped, and premium tier into existing v1.0 architecture
**Researched:** 2026-02-27
**Confidence:** HIGH (existing codebase analyzed, patterns verified with official documentation)

---

## Executive Summary

SoundCheck v1.0 has a clean, well-structured architecture: Express/TypeScript backend with service layer + facade pattern, Flutter mobile with clean architecture (data/domain/presentation per feature), PostgreSQL with 25 migrations, Redis caching with cache-aside, BullMQ for async jobs, WebSocket with Redis Pub/Sub, and Cloudflare R2 for object storage. The v1.1 features integrate into this architecture without requiring fundamental restructuring -- the existing patterns (service extraction, BullMQ workers, Redis caching, presigned URL uploads) are extensible to all seven new feature domains.

The key architectural insight is that most v1.1 features are **new services and new tables** rather than modifications to existing code. The exceptions are full-text search (modifies existing query paths in BandService, VenueService, EventService) and feed denormalization (modifies FeedService queries). Everything else -- moderation pipeline, verification system, sharing cards, collaborative filtering, Wrapped, premium/IAP -- introduces new components that plug into existing integration points (BullMQ queues, notification service, R2 storage, WebSocket events).

---

## 1. System Overview: v1.1 Architecture Delta

### 1.1 New Components (v1.1 additions shown in brackets)

```
                           FLUTTER MOBILE APP
  ┌───────────────────────────────────────────────────────────┐
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
  │  │ [Share]  │ │ [Report] │ │[Premium] │ │  [Wrapped]   │ │
  │  │  Cards   │ │   Flow   │ │ Paywall  │ │   Screens    │ │
  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
  │       │            │            │               │         │
  │  [RevenueCat SDK]  │    [appinio_social_share]  │         │
  └───────┼────────────┼────────────┼───────────────┼─────────┘
          │            │            │               │
          ▼            ▼            ▼               ▼
  ┌───────────────────────────────────────────────────────────┐
  │                   EXPRESS API LAYER                        │
  │                                                           │
  │  Existing Routes          [New Routes]                    │
  │  ├── checkinRoutes        ├── [reportRoutes]              │
  │  ├── feedRoutes           ├── [moderationRoutes]          │
  │  ├── searchRoutes ←mod    ├── [verificationRoutes]        │
  │  ├── userRoutes           ├── [shareRoutes]               │
  │  ├── eventRoutes          ├── [wrappedRoutes]             │
  │  └── ...                  ├── [premiumRoutes]             │
  │                           └── [webhookRoutes]             │
  ├───────────────────────────────────────────────────────────┤
  │                   SERVICE LAYER                           │
  │                                                           │
  │  Existing Services        [New Services]                  │
  │  ├── FeedService ←mod     ├── [ModerationService]         │
  │  ├── DiscoveryService     ├── [ReportService]             │
  │  │   ←mod (collab.filt.)  ├── [VerificationService]       │
  │  ├── BandService ←mod     ├── [ShareCardService]          │
  │  ├── VenueService ←mod    ├── [WrappedService]            │
  │  ├── EventService ←mod    ├── [CollabFilterService]       │
  │  ├── R2Service ←mod       ├── [EntitlementService]        │
  │  └── ...                  └── [ImageModerationService]    │
  ├───────────────────────────────────────────────────────────┤
  │                   ASYNC JOB LAYER (BullMQ)                │
  │                                                           │
  │  Existing Workers         [New Workers]                   │
  │  ├── badgeWorker          ├── [moderationWorker]          │
  │  ├── notificationWorker   ├── [shareCardWorker]           │
  │  └── eventSyncWorker      ├── [wrappedWorker]             │
  │                           └── [collabFilterWorker]        │
  ├───────────────────────────────────────────────────────────┤
  │                   DATA LAYER                              │
  │                                                           │
  │  PostgreSQL               Redis              Cloudflare R2│
  │  ├── [tsvector columns]   ├── cache          ├── photos   │
  │  ├── [reports table]      ├── pub/sub        ├── [cards]  │
  │  ├── [mod_queue table]    ├── BullMQ queues  └────────────│
  │  ├── [verifications]      ├── [user_vectors]              │
  │  ├── [entitlements]       └── rate limiting               │
  │  ├── [wrapped_snapshots]                                  │
  │  └── [user_item_matrix]   [External APIs]                 │
  │                           ├── [Google Vision SafeSearch]  │
  │                           ├── [RevenueCat webhooks]       │
  │                           └── Ticketmaster, etc.          │
  └───────────────────────────────────────────────────────────┘
```

### 1.2 Integration Point Summary

| Feature | New Tables | New Services | Modified Services | New BullMQ Queues | New Routes | New Mobile Features |
|---------|-----------|-------------|-------------------|-------------------|-----------|-------------------|
| Social Sharing | `share_cards` | ShareCardService | R2Service | share-card-gen | shareRoutes | sharing/ |
| Content Moderation | `reports`, `moderation_queue`, `moderation_actions` | ModerationService, ReportService, ImageModerationService | CheckinCreatorService (hook) | moderation | reportRoutes, moderationRoutes | reporting/ |
| Verification | `verification_requests`, `verified_profiles` | VerificationService | UserService, BandService, VenueService | -- | verificationRoutes | verification/ |
| Full-Text Search | `search_index` (materialized view, optional) + tsvector columns | -- | BandService, VenueService, EventService, UserService | -- | searchRoutes (modify) | search/ (modify) |
| Collaborative Filtering | `user_item_ratings` (materialized view) | CollabFilterService | DiscoveryService | collab-filter-rebuild | -- | -- |
| Wrapped | `wrapped_snapshots` | WrappedService | StatsService (reuse queries) | wrapped-gen | wrappedRoutes | wrapped/ |
| Premium/IAP | `entitlements`, `subscription_events` | EntitlementService | auth middleware (add tier check) | -- | premiumRoutes, webhookRoutes | premium/ |

---

## 2. Feature-by-Feature Architecture

### 2.1 Social Sharing Cards

**What:** Generate shareable image cards (check-in card, badge card, Wrapped card) that users can post to Instagram Stories, X, TikTok. Deep link back into the app.

**Architecture Decision:** Server-side card generation with Satori + Sharp, stored in R2. Client requests a card URL, backend generates on-demand (cached), client uses native share sheet.

**Why server-side:** Consistent rendering across devices, cache once and serve many times, can update card template without app update. Satori generates SVG from JSX without a headless browser (50KB vs. 50MB for Puppeteer), then Sharp converts to PNG. Both are Node.js native, no new infrastructure.

**Data Flow:**
```
Mobile: User taps "Share" on check-in
  ↓
GET /api/share/checkin/:id/card
  ↓
ShareCardService:
  1. Check R2 cache (cards/checkin/{id}.png) → return if exists
  2. Fetch check-in data (band, venue, rating, photo)
  3. Render JSX template with Satori → SVG
  4. Convert SVG → PNG with Sharp (1200x630 for OG, 1080x1920 for Stories)
  5. Upload to R2 via presigned URL (reuse R2Service pattern)
  6. Return public URL
  ↓
Mobile: Open share sheet with image URL + deep link
  (appinio_social_share for Instagram Stories, share_plus for generic)
```

**New Components:**
- `ShareCardService` -- orchestrates card generation, caching, R2 upload
- `shareRoutes.ts` -- `GET /api/share/:type/:id/card` (type = checkin|badge|wrapped)
- `shareCardWorker.ts` -- optional async generation for batch Wrapped cards
- Card JSX templates (stored as TypeScript modules, rendered by Satori)
- R2 bucket path: `cards/{type}/{id}_{variant}.png`

**Modified Components:**
- `R2Service` -- add `generateCardUploadUrl()` method alongside existing `generateUploadUrl()`
- Mobile: new `sharing/` feature module with ShareService, share_plus/appinio_social_share integration

**Deep Linking:** Use Firebase Dynamic Links (already using Firebase for push) or custom Universal Links / App Links with a lightweight landing page hosted on a CDN. The landing page shows the share card as OG image and redirects to App Store / Play Store if app not installed.

**Dependencies:** npm: `satori`, `@resvg/resvg-js` (or `sharp`), plus JSX template design. Flutter: `share_plus`, `appinio_social_share`.

---

### 2.2 Content Moderation Pipeline

**What:** Automated image scanning + text filtering on check-in photos and review text, user report/flag mechanism, admin review queue. Required by App Store Guideline 1.2.

**Architecture Decision:** Three-tier pipeline using existing BullMQ infrastructure:
1. **Automated pre-screening** -- Google Cloud Vision SafeSearch on photo upload (async, non-blocking)
2. **User reporting** -- flag mechanism on any UGC (check-ins, comments, photos)
3. **Admin review queue** -- internal API for moderator actions (approve/reject/ban)

**Why Google Vision SafeSearch:** 1,000 free units/month covers early scale. Returns adult/violence/racy/spoof/medical likelihood scores. Simple REST API, no model hosting. Pricing is linear beyond free tier. Alternative (DeepStack, self-hosted) adds operational burden inappropriate for Railway.app single-instance deployment.

**Data Flow:**

```
A) Photo Upload Moderation (async, non-blocking):

CheckinCreatorService.create()
  ↓ (fire-and-forget, like badge evaluation)
moderationQueue.add('scan-image', { checkinId, photoUrl })
  ↓
moderationWorker:
  1. Download image from R2 URL
  2. Call Google Vision SafeSearch API
  3. If LIKELY/VERY_LIKELY on adult/violence → auto-flag
  4. Insert into moderation_queue table (status: 'auto_flagged' or 'approved')
  5. If auto-flagged → hide check-in (set checkins.is_moderated = true)
  6. Notify user via notification system
  ↓
Admin reviews flagged items via internal moderationRoutes

B) User Reporting:

Mobile: User taps "Report" on check-in/comment
  ↓
POST /api/reports { targetType, targetId, reason, details }
  ↓
ReportService:
  1. Insert into reports table
  2. If report count on target exceeds threshold → auto-flag for review
  3. Create moderation_queue entry
  4. Deduplicate (one user can report same target only once)

C) Admin Review:

GET  /api/moderation/queue?status=pending
POST /api/moderation/:id/action { action: 'approve'|'reject'|'ban_user' }
  ↓
ModerationService:
  1. Update moderation_queue status
  2. If reject → soft-delete content, notify user
  3. If ban → deactivate user, invalidate sessions
  4. Insert into moderation_actions (audit trail)
```

**New Tables:**
```sql
-- User reports on any UGC
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  target_type VARCHAR(20) NOT NULL,  -- 'checkin', 'comment', 'photo', 'user'
  target_id UUID NOT NULL,
  reason VARCHAR(50) NOT NULL,       -- 'inappropriate', 'spam', 'harassment', 'other'
  details TEXT,
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'reviewed', 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reporter_id, target_type, target_id)  -- one report per user per target
);

-- Moderation review queue
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  source VARCHAR(20) NOT NULL,  -- 'auto_scan', 'user_report', 'threshold'
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  auto_scores JSONB,  -- SafeSearch scores: { adult: 'LIKELY', violence: 'UNLIKELY', ... }
  reviewer_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail of moderation actions
CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id UUID REFERENCES moderation_queue(id),
  action VARCHAR(30) NOT NULL,  -- 'approve', 'reject', 'ban_user', 'warn_user'
  moderator_id UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Modified Components:**
- `CheckinCreatorService` -- add fire-and-forget `moderationQueue.add()` call after photo upload (same pattern as badge evaluation)
- `checkins` table -- add `is_moderated BOOLEAN DEFAULT FALSE` column
- `FeedService` -- add `WHERE c.is_moderated = FALSE` filter to all feed queries
- Auth middleware -- add `isAdmin` / `isModerator` role check for moderation routes

**New BullMQ Queue:** `moderation` queue with `moderationWorker`, concurrency 2 (I/O bound to Vision API, 1800 req/min quota).

**Dependencies:** npm: `@google-cloud/vision` (SafeSearch API). Alternatively, a simpler approach for early stage: just user reporting + admin queue, defer automated scanning until photo volume warrants it.

---

### 2.3 Verification System

**What:** Venue owners and artists can claim their profiles with a verified badge. Establishes trust and enables future B2B features (venue dashboard, artist analytics).

**Architecture Decision:** Claim-then-verify workflow. User submits a verification request with evidence, admin reviews manually. No automated verification at this scale -- Spotify-style automated verification requires distributor partnerships that SoundCheck lacks.

**Data Flow:**
```
Mobile: Artist/venue owner taps "Claim this profile"
  ↓
POST /api/verification/request
  { targetType: 'band'|'venue', targetId, evidence: { ... } }
  ↓
VerificationService:
  1. Check no existing pending/approved request for this target
  2. Insert into verification_requests table
  3. Notify admin (internal notification)
  ↓
Admin reviews:
  GET  /api/verification/requests?status=pending
  POST /api/verification/:id/decide { decision: 'approve'|'reject', notes }
  ↓
If approved:
  1. Create verified_profiles entry linking user to band/venue
  2. Set band.is_verified = true or venue.is_verified = true
  3. User gets 'verified' role scope in JWT claims (for future B2B features)
  4. Notify user of approval
```

**New Tables:**
```sql
-- Verification requests
CREATE TABLE verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  target_type VARCHAR(20) NOT NULL,  -- 'band', 'venue'
  target_id UUID NOT NULL,
  evidence JSONB NOT NULL,  -- { website_url, social_links, proof_description }
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  reviewer_id UUID REFERENCES users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(target_type, target_id, status)  -- one pending request per target
);

-- Verified profile ownership
CREATE TABLE verified_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(target_type, target_id)  -- one owner per band/venue
);
```

**Modified Components:**
- `bands` table -- add `is_verified BOOLEAN DEFAULT FALSE`
- `venues` table -- add `is_verified BOOLEAN DEFAULT FALSE`
- `BandService`, `VenueService` -- return `is_verified` flag in API responses
- `UserService` -- support `verified_profiles` lookup for user's claimed entities
- Mobile: `Band` and `Venue` domain models gain `isVerified` field, display verified badge icon

**No BullMQ needed:** This is a low-volume human-reviewed process. Direct REST API is sufficient.

---

### 2.4 PostgreSQL Full-Text Search

**What:** Replace ILIKE queries in BandService, VenueService, EventService with PostgreSQL tsvector + GIN index for proper full-text search with ranking.

**Architecture Decision:** Use PostgreSQL generated columns (PG12+) to maintain tsvector automatically, with weighted search vectors (name = A weight, description/genre = B weight). GIN indexes for fast lookup. No external search engine needed at this scale.

**Why not Elasticsearch/Typesense:** PostgreSQL FTS is ACID-compliant with primary data, requires zero additional infrastructure, handles 10K+ users easily. External search engines introduce sync complexity. Switch only when PG FTS becomes a query bottleneck (unlikely before 100K+ users).

**Migration Plan:**

```sql
-- 1. Add generated tsvector columns (zero-downtime, no table lock)
ALTER TABLE bands ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(genre, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(hometown, '')), 'C')
  ) STORED;

ALTER TABLE venues ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

ALTER TABLE events ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(event_name, '')), 'A')
  ) STORED;

ALTER TABLE users ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(username, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'C')
  ) STORED;

-- 2. Create GIN indexes (CONCURRENTLY = no table lock)
CREATE INDEX CONCURRENTLY idx_bands_search ON bands USING gin(search_vector);
CREATE INDEX CONCURRENTLY idx_venues_search ON venues USING gin(search_vector);
CREATE INDEX CONCURRENTLY idx_events_search ON events USING gin(search_vector);
CREATE INDEX CONCURRENTLY idx_users_search ON users USING gin(search_vector);
```

**Modified Queries (BandService.ts example):**
```typescript
// BEFORE (ILIKE -- sequential scan, no ranking)
conditions.push(`(name ILIKE $${p} OR description ILIKE $${p} OR genre ILIKE $${p})`);
params.push(`%${query}%`);

// AFTER (tsvector -- GIN index, ranked results)
const tsQuery = query.split(/\s+/).filter(Boolean).join(' & ');
conditions.push(`search_vector @@ to_tsquery('english', $${p})`);
params.push(tsQuery);
// Add ranking to ORDER BY:
orderBy = `ts_rank(search_vector, to_tsquery('english', $${p})) DESC`;
```

**Modified Services:**
- `BandService.searchBands()` -- replace ILIKE with tsvector query
- `VenueService.searchVenues()` -- replace ILIKE with tsvector query
- `EventService.searchEvents()` -- replace ILIKE with tsvector query (4 ILIKE conditions currently)
- `UserController.searchUsers()` -- replace ILIKE with tsvector query
- `EventService.getEventsByGenre()` -- replace genre ILIKE with tsvector

**Cross-entity search endpoint:** Consider a unified `GET /api/search?q=term&types=bands,venues,events` that queries all tables in parallel and merges results. This is a new route but reuses modified service methods.

**Prefix search support:** For typeahead, use `to_tsquery('english', $1 || ':*')` which handles prefix matching. Combine with `pg_trgm` extension (already have migration 015 for band trgm index) for fuzzy matching on short queries.

---

### 2.5 Collaborative Filtering

**What:** Upgrade recommendations from the current heuristic scoring (genre affinity 3x + friend attendance 5x + trending 1x) to user-based collaborative filtering. "Users who checked into similar shows also checked into these shows."

**Architecture Decision:** Item-based collaborative filtering computed offline in BullMQ, stored in Redis as precomputed recommendation vectors. Not a real-time model -- batch recompute nightly.

**Why item-based over user-based:** With concerts, the item space (events) grows faster than the user space, but each user has few interactions (maybe 20-50 check-ins/year). Item-based CF works better with sparse user interactions and is more stable (item similarity changes slowly).

**Why not a library like disco-node or Raccoon:** The interaction matrix is small enough (users x events) to compute with SQL + in-memory cosine similarity in Node.js. Adding a recommendation library adds dependency risk for marginal benefit at this scale. At 100K+ users, consider migrating to a proper ML pipeline.

**Architecture:**

```
Nightly BullMQ cron job (collabFilterWorker):
  ↓
1. Build user-event interaction matrix from checkins table
   SELECT user_id, event_id,
     COALESCE(AVG(cbr.performance_rating), 3.0) as implicit_rating
   FROM checkins c
   LEFT JOIN checkin_band_ratings cbr ON c.id = cbr.checkin_id
   GROUP BY user_id, event_id
  ↓
2. Compute item-item similarity matrix (cosine similarity)
   For each pair of events with >= 3 shared users:
     similarity = cosine(rating_vector_A, rating_vector_B)
  ↓
3. For each user, compute top-N recommendations:
   For each event user hasn't attended:
     score = SUM(similarity(event, attended_event) * user_rating)
   Exclude past events (event_date < now())
   Store top 50 as Redis sorted set: cf:recs:{userId}
  ↓
4. DiscoveryService.getRecommendedEvents() uses cf:recs:{userId}
   as primary signal, falling back to heuristic scoring for cold-start users
```

**New Components:**
- `CollabFilterService` -- computes similarity matrix and recommendations
- `collabFilterWorker.ts` -- BullMQ worker, scheduled nightly via `syncScheduler.ts`
- Redis key pattern: `cf:recs:{userId}` (sorted set, event IDs scored by predicted rating)
- Redis key pattern: `cf:item_sim:{eventId}` (hash, similar event IDs with scores)

**Modified Components:**
- `DiscoveryService.getRecommendedEvents()` -- check Redis for CF recommendations first, fall back to existing heuristic scoring for cold-start users (< 5 check-ins)
- `syncScheduler.ts` -- add nightly CF rebuild cron job

**Cold Start Strategy:**
- New users (< 5 check-ins): existing heuristic scoring (genre affinity + friends + trending)
- Active users (5+ check-ins): collaborative filtering primary, heuristic as tiebreaker
- Hybrid scoring: `final_score = 0.7 * cf_score + 0.2 * genre_affinity + 0.1 * friend_signal`

**No new tables needed:** The interaction matrix is computed from existing `checkins` + `checkin_band_ratings` tables. Precomputed results live in Redis (ephemeral, rebuilt nightly).

---

### 2.6 SoundCheck Wrapped (Year-in-Review)

**What:** Annual recap showing user's concert stats: total shows, top genres, top venues, top bands, most-traveled-to city, badges earned, unique stats. Shareable as image cards.

**Architecture Decision:** Pre-compute Wrapped data as a snapshot in December (BullMQ batch job), store as JSONB in a `wrapped_snapshots` table. Cards generated on-demand via ShareCardService. This avoids expensive aggregation queries at read time when all users hit Wrapped simultaneously.

**Why snapshot, not live query:** Spotify Wrapped taught the industry that simultaneous access from all users creates read storms. Pre-computing avoids this. Also, the data should be frozen -- if a user deletes a check-in in January, their December Wrapped should not change.

**Data Flow:**

```
A) Wrapped Generation (scheduled, early December):

wrappedWorker processes each active user:
  1. Query StatsService-style aggregations for calendar year
     - Total shows, unique bands, unique venues, total hours
     - Top 5 genres (by check-in count)
     - Top 5 bands (by times seen)
     - Top 3 venues (by visit count)
     - Most-traveled-to city
     - Badges earned this year
     - Listening persona classification (e.g., "Genre Explorer", "Venue Regular")
     - Fun stats (e.g., "You spent 47 hours at shows this year")
  2. Store as JSONB in wrapped_snapshots table
  3. Mark user as "wrapped_ready" (push notification)

B) Wrapped Viewing:

GET /api/wrapped/:year
  ↓
WrappedService:
  1. Fetch wrapped_snapshots for user + year
  2. Return JSON (mobile renders native screens)
  ↓
Mobile renders animated card sequence (like Instagram Stories format)

C) Wrapped Sharing:

GET /api/share/wrapped/:year/card?slide=top_genres
  ↓
ShareCardService renders slide-specific card → R2 → public URL
  ↓
Mobile shares via native share sheet
```

**New Tables:**
```sql
CREATE TABLE wrapped_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  data JSONB NOT NULL,  -- all computed stats
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year)
);
```

**New Components:**
- `WrappedService` -- computes stats (reuses query patterns from StatsService), stores snapshots
- `wrappedWorker.ts` -- BullMQ worker for batch computation
- `wrappedRoutes.ts` -- `GET /api/wrapped/:year`, `GET /api/wrapped/available`
- Mobile: `wrapped/` feature module with carousel UI, animation, share CTAs

**Modified Components:**
- `syncScheduler.ts` -- add annual Wrapped generation cron (December 1, process over several days)
- `ShareCardService` -- add Wrapped card templates (one per "slide": top genres, top bands, etc.)

**Reuse:** StatsService already computes many of the same aggregations (total shows, unique bands, unique venues, genre breakdown, top-rated bands/venues). WrappedService can reuse those query patterns with a date range filter (`WHERE c.created_at >= '{year}-01-01' AND c.created_at < '{year+1}-01-01'`).

---

### 2.7 Premium Tier / In-App Purchase

**What:** "SoundCheck Pro" subscription unlocking premium features. Revenue via IAP (App Store + Google Play).

**Architecture Decision:** Use RevenueCat as the IAP abstraction layer. RevenueCat handles receipt validation, subscription lifecycle, cross-platform entitlements, and analytics. Backend verifies entitlements via RevenueCat webhook (server-side source of truth), not by trusting client claims.

**Why RevenueCat over raw StoreKit/Google Play Billing:** Handles receipt validation, subscription status tracking, grace periods, refunds, cross-platform sync, and A/B testing paywalls. The Flutter SDK (`purchases_flutter`) is well-maintained. Eliminates 2-3 weeks of IAP plumbing. Free for <$2.5M annual revenue.

**Architecture:**

```
Flutter App                    RevenueCat                  SoundCheck Backend
┌──────────┐                  ┌──────────┐                ┌──────────────────┐
│ Paywall  │──purchase()────→│ RC SDK   │──webhook──────→│ webhookRoutes    │
│ Screen   │                  │          │                │   ↓               │
│          │←─entitlements───│ RC API   │                │ EntitlementService│
│          │                  └──────────┘                │   ↓               │
│ Feature  │                                             │ entitlements table│
│ Gates    │←─GET /api/me/entitlements──────────────────→│   ↓               │
└──────────┘                                             │ Auth middleware   │
                                                         │ (tier check)     │
                                                         └──────────────────┘
```

**Entitlement-Based Gating (not feature flags):**
```typescript
// Backend middleware
export function requirePremium(req: Request, res: Response, next: NextFunction) {
  const entitlements = req.user?.entitlements || [];
  if (!entitlements.includes('pro')) {
    return res.status(403).json({ error: 'Premium feature', upgrade_url: '...' });
  }
  next();
}

// Flutter (check locally via RevenueCat SDK)
final customerInfo = await Purchases.getCustomerInfo();
final isPro = customerInfo.entitlements.all['pro']?.isActive ?? false;
```

**Premium Features to Gate (suggested):**
- Extended stats (Wrapped deep-dive, lifetime stats beyond basic concert cred)
- Ad-free experience (if ads are added to free tier)
- Priority share card generation (higher resolution, custom templates)
- Advanced search filters (date range, radius, genre combinations)
- Export concert history (CSV/PDF)

**New Tables:**
```sql
-- Server-side entitlement cache (source of truth = RevenueCat)
CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  rc_customer_id VARCHAR(255) NOT NULL,  -- RevenueCat customer ID
  product_id VARCHAR(100) NOT NULL,
  entitlement_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,  -- 'active', 'expired', 'grace_period', 'refunded'
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entitlement_id)
);

-- Webhook event log (idempotency + audit)
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_event_id VARCHAR(255) UNIQUE NOT NULL,  -- RevenueCat event ID for idempotency
  event_type VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Components:**
- `EntitlementService` -- manages entitlements table, syncs from RevenueCat webhooks
- `premiumRoutes.ts` -- `GET /api/me/entitlements`, `GET /api/premium/offerings`
- `webhookRoutes.ts` -- `POST /api/webhooks/revenuecat` (verify webhook signature)
- Auth middleware extension -- add `requirePremium` middleware
- Mobile: `premium/` feature module with paywall screen, RevenueCat SDK integration

**Modified Components:**
- `auth.ts` middleware -- fetch entitlements and attach to `req.user` on authentication
- `UserService` -- include `tier` field in user profile responses
- Mobile: feature-gated UI sections check `isPro` from RevenueCat CustomerInfo

---

## 3. Feed Denormalization (Tech Debt Fix)

The `COUNT(DISTINCT t.id)` and `COUNT(DISTINCT cm.id)` in FeedService are a known bottleneck. v1.1 should fix this alongside other feed changes.

**Solution:** Denormalized `toast_count` and `comment_count` columns on the `checkins` table (migration 024 already added these columns). Update them atomically via triggers or application-level increment/decrement in CheckinToastService and comment creation.

```sql
-- Trigger approach (database-level, cannot drift)
CREATE OR REPLACE FUNCTION update_checkin_toast_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE checkins SET toast_count = toast_count + 1 WHERE id = NEW.checkin_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE checkins SET toast_count = toast_count - 1 WHERE id = OLD.checkin_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_toast_count
AFTER INSERT OR DELETE ON toasts
FOR EACH ROW EXECUTE FUNCTION update_checkin_toast_count();
```

**Modified FeedService query:**
```sql
-- BEFORE: expensive LEFT JOIN + COUNT(DISTINCT)
LEFT JOIN toasts t ON c.id = t.checkin_id
LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
...
COUNT(DISTINCT t.id)::int AS toast_count,
COUNT(DISTINCT cm.id)::int AS comment_count,

-- AFTER: direct column read (zero join cost)
c.toast_count,
c.comment_count,
-- Remove LEFT JOIN toasts and LEFT JOIN checkin_comments from feed query
```

This eliminates the two most expensive joins from the hottest query in the system.

---

## 4. Architectural Patterns

### 4.1 Pattern: Fire-and-Forget Async Pipeline

**Existing usage:** Badge evaluation after check-in, notification batching
**v1.1 usage:** Image moderation after photo upload, share card generation, Wrapped computation

```typescript
// Established pattern in CheckinCreatorService -- extend for moderation
const checkin = await this.createCheckinRow(data);

// Fire-and-forget: badge evaluation (existing)
badgeQueue?.add('evaluate', { userId, checkinId: checkin.id });

// Fire-and-forget: image moderation (new, same pattern)
if (checkin.photoUrl) {
  moderationQueue?.add('scan-image', { checkinId: checkin.id, photoUrl: checkin.photoUrl });
}
```

**Why this pattern works here:** User-facing latency stays low (check-in creation returns immediately). Background workers handle expensive operations (Vision API calls, image processing). BullMQ provides retry with exponential backoff. Graceful degradation if Redis is unavailable (queue is null, moderation skipped).

### 4.2 Pattern: Cache-Aside with Redis + PostgreSQL Source of Truth

**Existing usage:** Concert cred stats, discovery aggregates, feed pages
**v1.1 usage:** Collaborative filtering vectors, entitlement status, share card URLs

```typescript
// Existing pattern from StatsService
async getConcertCred(userId: string): Promise<ConcertCred> {
  return cache.getOrSet(
    CacheKeys.concertCred(userId),
    () => this.computeConcertCred(userId),
    CONCERT_CRED_TTL
  );
}

// v1.1 extension for CF recommendations
async getRecommendations(userId: string): Promise<string[]> {
  // Try precomputed CF results from Redis first
  const cached = await redis.zrevrange(`cf:recs:${userId}`, 0, 19);
  if (cached.length > 0) return cached;

  // Cold start: fall back to heuristic scoring
  return this.getHeuristicRecommendations(userId);
}
```

### 4.3 Pattern: Entitlement-Based Feature Gating

**New for v1.1.** Prefer server-side entitlement checks over client-only checks. Client checks RevenueCat SDK for UI gating (hide/show premium features), server checks entitlements table for API gating (prevent unauthorized access to premium endpoints).

```typescript
// Middleware chain: authenticate → check entitlement → handler
router.get('/api/wrapped/:year/deep-dive',
  authenticateToken,
  requirePremium,
  wrappedController.getDeepDive
);
```

### 4.4 Anti-Pattern: Synchronous External API Calls in Request Path

**Avoid:** Calling Google Vision API, RevenueCat API, or card generation in the HTTP request/response cycle.

**Why bad:** External APIs have unpredictable latency (100ms-2s). User-facing endpoints should respond in < 200ms.

**Do this instead:** Queue to BullMQ, return 202 Accepted with a polling endpoint, or use pre-computed results.

### 4.5 Anti-Pattern: Client-Trusted Entitlements

**Avoid:** Trusting the Flutter client's RevenueCat SDK result as the sole entitlement check.

**Why bad:** Client-side checks can be bypassed on jailbroken/rooted devices. Receipt validation must happen server-side.

**Do this instead:** RevenueCat webhook updates `entitlements` table on the backend. API middleware checks the database. Client check is UI-only (show/hide premium features for better UX).

---

## 5. Mobile Architecture Impact

The Flutter app uses clean architecture per feature. Each v1.1 feature becomes a new feature module:

```
mobile/lib/src/features/
├── sharing/                # NEW
│   ├── data/
│   │   └── share_repository.dart
│   ├── domain/
│   │   ├── share_card.dart
│   │   └── share_card.freezed.dart
│   └── presentation/
│       ├── share_card_preview.dart
│       └── share_bottom_sheet.dart
├── reporting/              # NEW
│   ├── data/
│   │   └── report_repository.dart
│   ├── domain/
│   │   └── report.dart
│   └── presentation/
│       └── report_bottom_sheet.dart
├── verification/           # NEW (simple)
│   ├── data/
│   │   └── verification_repository.dart
│   └── presentation/
│       └── claim_profile_screen.dart
├── wrapped/                # NEW
│   ├── data/
│   │   └── wrapped_repository.dart
│   ├── domain/
│   │   ├── wrapped_data.dart
│   │   └── wrapped_data.freezed.dart
│   └── presentation/
│       ├── wrapped_carousel_screen.dart
│       ├── wrapped_slide_widget.dart
│       └── wrapped_share_button.dart
├── premium/                # NEW
│   ├── data/
│   │   └── entitlement_repository.dart
│   ├── domain/
│   │   └── entitlement.dart
│   └── presentation/
│       ├── paywall_screen.dart
│       └── premium_gate_widget.dart
├── search/                 # MODIFIED (FTS upgrade)
│   └── ... (update query handling for ranked results)
├── checkins/               # MODIFIED (add share + report buttons)
│   └── presentation/
│       └── checkin_detail_screen.dart  ← add ShareButton, ReportButton
├── bands/                  # MODIFIED (verified badge display)
│   └── presentation/
│       └── band_detail_screen.dart  ← show verified icon
└── venues/                 # MODIFIED (verified badge display)
    └── presentation/
        └── venue_detail_screen.dart  ← show verified icon
```

**New Flutter dependencies:**
- `purchases_flutter` -- RevenueCat SDK for IAP
- `appinio_social_share` -- Instagram Stories, Facebook Stories sharing
- `share_plus` -- generic system share sheet (already may be present)

---

## 6. Suggested Build Order

Ordered by dependency chain and risk, not by feature importance.

```
Phase 1: Foundation (no feature dependencies)
  ├── Full-text search migration (tsvector + GIN)
  ├── Feed denormalization (toast_count/comment_count triggers)
  └── Report/flag mechanism (App Store requirement, simplest trust feature)

Phase 2: Trust & Safety (report depends on Phase 1 flag mechanism)
  ├── Content moderation pipeline (BullMQ + Vision API)
  ├── Verification system (independent, manual process)
  └── Admin review queue (shared by moderation + verification)

Phase 3: Growth Engine (sharing cards, viral loop)
  ├── Share card service (Satori + Sharp + R2)
  ├── Social sharing integration (Flutter share_plus + appinio)
  └── Deep links (Firebase Dynamic Links or custom)

Phase 4: Intelligence (depends on stable check-in data)
  ├── Collaborative filtering (BullMQ nightly job)
  └── Enhanced recommendations (CF + heuristic hybrid)

Phase 5: Engagement & Monetization
  ├── SoundCheck Wrapped (BullMQ batch + share cards from Phase 3)
  ├── Premium tier (RevenueCat + entitlement middleware)
  └── Feature gating (connect premium to specific endpoints)
```

**Phase ordering rationale:**
1. **Full-text search + denormalization first** because they fix tech debt that affects every user on every session. Low risk, high impact on existing experience quality.
2. **Report/flag in Phase 1** because App Store Guideline 1.2 requires UGC moderation. This is a launch blocker for v1.1.
3. **Moderation before sharing** because you should not amplify content distribution (sharing) before you can moderate it.
4. **Sharing before CF/Wrapped** because viral growth features compound over time -- the sooner they ship, the more users for CF to learn from.
5. **CF after check-in data stabilizes** because collaborative filtering quality depends on interaction volume. Building it last means more training data.
6. **Wrapped + Premium last** because they depend on multiple prior features (share cards, stats, entitlement infra) and are not launch blockers.

---

## 7. Scaling Considerations

| Concern | At 1K Users | At 10K Users | At 100K Users |
|---------|-------------|-------------|---------------|
| FTS queries | PG tsvector handles trivially | GIN indexes keep <10ms | Still fine, consider caching top queries |
| Feed query | Denormalized counts eliminate joins | Redis-cached pages handle read volume | Consider materialized feed table |
| Moderation | ~50 photos/day, manual review OK | ~500/day, auto-scan essential | Add ML model confidence thresholds |
| CF computation | Trivial matrix (1K x 200 events) | ~10 min nightly job | Need matrix factorization, possibly move to separate service |
| Share card gen | On-demand, <500ms per card | Cache hit rate >90% | Pre-generate popular cards in batch |
| Wrapped | Minutes for all users | Hours, stagger over days | Must batch over week, use job priorities |
| IAP webhooks | ~10/day | ~100/day | ~1000/day, ensure idempotency |

**First bottleneck:** Feed queries at 10K+ users. Denormalization (Phase 1) addresses this.
**Second bottleneck:** CF computation at 50K+ users. Move from in-memory cosine to matrix factorization (ALS) or offload to a Python microservice with scipy.

---

## 8. Database Migration Numbering

Current migrations go up to 025. v1.1 migrations:

| Migration | Feature | Type |
|-----------|---------|------|
| 026 | Add tsvector columns + GIN indexes | Schema (non-blocking) |
| 027 | Add denormalization triggers for toast/comment counts | Schema + data backfill |
| 028 | Create reports table | Schema |
| 029 | Create moderation_queue + moderation_actions tables | Schema |
| 030 | Add is_moderated to checkins, is_verified to bands/venues | Schema |
| 031 | Create verification_requests + verified_profiles tables | Schema |
| 032 | Create share_cards table (optional, for tracking) | Schema |
| 033 | Create wrapped_snapshots table | Schema |
| 034 | Create entitlements + subscription_events tables | Schema |

---

## 9. External Service Dependencies

| Service | Purpose | Integration | Cost | Risk |
|---------|---------|-------------|------|------|
| Google Cloud Vision | SafeSearch image moderation | REST API, async via BullMQ | Free 1K/mo, then $1.50/1K | LOW -- graceful degradation if down |
| RevenueCat | IAP management, entitlements | Flutter SDK + server webhook | Free <$2.5M revenue | LOW -- mature platform |
| Satori + Sharp | OG image generation | npm libraries, runs in-process | Free (OSS) | LOW -- no external dependency |
| Firebase Dynamic Links | Deep links for shared cards | Already integrated (push notifs) | Free tier sufficient | MEDIUM -- Google deprecated Dynamic Links, consider alternatives like Branch.io or custom Universal Links |

**Firebase Dynamic Links deprecation note:** Google deprecated Firebase Dynamic Links in August 2025. Existing links continue to work, but no new projects can enable it. For SoundCheck v1.1, use **custom Universal Links (iOS) and App Links (Android)** with a lightweight landing page hosted on Cloudflare Pages (pairs with existing R2 setup). The landing page serves OG meta tags for social previews and redirects to the app or app store.

---

## Sources

- [PostgreSQL Full-Text Search Documentation](https://www.postgresql.org/docs/current/textsearch-tables.html) -- HIGH confidence
- [PostgreSQL GIN Index Types](https://www.postgresql.org/docs/current/textsearch-indexes.html) -- HIGH confidence
- [Full-Text Search in Postgres with TypeScript](https://betterstack.com/community/guides/scaling-nodejs/full-text-search-in-postgres-with-typescript/) -- MEDIUM confidence
- [Understanding Postgres GIN Indexes](https://pganalyze.com/blog/gin-index) -- HIGH confidence
- [Content Moderation Pipeline with BullMQ](https://dev.to/silentwatcher_95/content-moderation-in-nodejs-building-a-scalable-image-moderation-pipeline-with-minio-bullmq-f53) -- MEDIUM confidence
- [Google Cloud Vision SafeSearch Detection](https://docs.cloud.google.com/vision/docs/detecting-safe-search) -- HIGH confidence
- [Cloud Vision API Pricing](https://cloud.google.com/vision/pricing) -- HIGH confidence
- [Satori: JSX to SVG library](https://github.com/vercel/satori) -- HIGH confidence
- [Dynamic OG Images with Satori](https://blog.webdevsimplified.com/2025-09/dynamic-og-images/) -- MEDIUM confidence
- [RevenueCat Flutter SDK](https://www.revenuecat.com/docs/getting-started/installation/flutter) -- HIGH confidence
- [RevenueCat Flutter In-App Purchases 2025](https://medium.com/blocship/in-app-purchases-with-revenue-cat-flutter-2025-36adbef2c2d5) -- MEDIUM confidence
- [Spotify Wrapped Methodology](https://newsroom.spotify.com/2025-12-05/wrapped-methodology-explained/) -- MEDIUM confidence
- [Spotify Engineering: Unwrapped Architecture](https://engineering.atspotify.com/2020/02/spotify-unwrapped-how-we-brought-you-a-decade-of-data) -- MEDIUM confidence
- [disco-node: Collaborative Filtering for Node.js](https://github.com/ankane/disco-node) -- LOW confidence (alternative considered)
- [appinio_social_share Flutter package](https://pub.dev/packages/appinio_social_share) -- MEDIUM confidence

---

*Architecture research for: SoundCheck v1.1 feature integration*
*Researched: 2026-02-27*
