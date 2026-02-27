# Technology Stack: SoundCheck v1.1 Additions

**Project:** SoundCheck ("Untappd for live music")
**Scope:** New capabilities for v1.1 milestone on existing stack
**Researched:** 2026-02-27
**Confidence:** HIGH (backend), MEDIUM (social sharing packages), HIGH (everything else)

---

## Existing Stack (Validated, Not Re-Researched)

| Layer | Technology | Version |
|-------|-----------|---------|
| Mobile | Flutter/Dart | 3.27.4+ / SDK >=3.2.0 |
| State Management | Riverpod | 3.1.0 |
| Backend | Node.js / Express / TypeScript | 20 / 4.21.2 / 5.9.2 |
| Database | PostgreSQL | 12+ |
| Cache/Queue | Redis / ioredis / BullMQ | 5.9.0 / 5.67.2 |
| HTTP Client | axios (backend), dio (mobile) | 1.13.2 / 5.4.3 |
| WebSocket | ws (backend), web_socket_channel (mobile) | 8.19.0 / 3.0.1 |
| Validation | zod | 3.25.76 |
| Object Storage | Cloudflare R2 via @aws-sdk/client-s3 | 3.981.0 |
| Push | Firebase Cloud Messaging (firebase-admin + firebase_messaging) | 13.6.0 / 16.1.1 |
| Error Tracking | Sentry | 10.32.1 (backend) / 9.9.2 (mobile) |
| Hosting | Railway.app (backend), App Store / Google Play (mobile) | -- |

This research covers **only** the new libraries, APIs, and patterns needed for v1.1 features:
1. Social sharing cards (share to Instagram Stories, X, TikTok)
2. Content moderation pipeline (image scanning, report queue)
3. Venue/artist verification system
4. PostgreSQL full-text search (replace ILIKE)
5. Collaborative filtering recommendations (upgrade from CTE-based scoring)
6. SoundCheck Wrapped (year-in-review)
7. Premium tier / in-app purchases

---

## 1. Social Sharing Cards

### Strategy: Server-Side OG Image Generation + Mobile Share Card Rendering

Social sharing has two distinct problems that require different solutions:

**Problem A: Link previews** -- When someone shares a SoundCheck URL on social media, the platform's crawler needs to see Open Graph meta tags and a rendered image. This is a backend concern.

**Problem B: Direct image sharing** -- When a user taps "Share to Instagram Stories," the app needs to render a visually rich card image and pass it to the target app. This is a mobile concern.

### Backend: Dynamic OG Image Generation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `satori` | ^0.19.2 | Convert JSX/HTML to SVG for share card images | Vercel's library; runs in Node.js, no browser/Puppeteer needed. JSX templating is natural for card layouts. 800ms avg generation per Vercel benchmarks. |
| `@resvg/resvg-js` | ^2.6.2 | Convert SVG to PNG | Rust-based (via WASM), fast, no native dependencies. Pairs with satori for the SVG-to-PNG pipeline. |
| `sharp` | ^0.34.5 | Image resizing, optimization, format conversion | Already the standard Node.js image library (libvips-based, 4-5x faster than ImageMagick). Use for post-processing OG images and thumbnail generation for moderation. |

**Confidence: HIGH** -- satori + resvg-js is the established pattern for server-side OG image generation outside of Next.js/Vercel. Well-documented, actively maintained.

**Architecture:**

```
Mobile app shares link: https://soundcheck.app/checkin/{id}
                |
Social platform crawler hits URL
                |
Express route serves HTML with OG meta tags:
  <meta property="og:image" content="https://soundcheck.app/og/checkin/{id}.png" />
                |
/og/checkin/{id}.png route:
  1. Fetch checkin data from DB
  2. Render JSX template with satori -> SVG
  3. Convert SVG to PNG with @resvg/resvg-js
  4. Cache in Redis (1 hour TTL) or R2
  5. Serve PNG
```

**Why satori over Puppeteer/Playwright:** Puppeteer launches a headless Chromium instance (~200MB memory, 2-5s startup). On Railway.app's container limits, that is untenable. Satori runs in-process, uses ~50MB, generates in <1s.

**Why satori over sharp-only text compositing:** Sharp can overlay text on images, but building complex card layouts (avatar + username + band name + rating stars + venue + photo) with Sharp's SVG-based text compositing is fragile and hard to maintain. Satori uses JSX (or React-like HTML) for layout, making card templates readable and maintainable.

### Mobile: Widget-to-Image Capture + Platform-Specific Sharing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `RepaintBoundary` (built-in) | Flutter SDK | Capture any widget tree as a PNG image | Built into Flutter, zero dependencies. Wrap a share card widget, call `toImage()`, get bytes. More reliable than third-party screenshot packages. |
| `share_plus` (existing) | 12.0.1 | System share sheet for general sharing | Already in pubspec.yaml. Handles the generic "share to any app" case. |
| `appinio_social_share` | ^0.3.2 | Direct sharing to Instagram Stories, TikTok, X | Provides platform-specific intents for direct app-to-app sharing. Required because `share_plus` only shows the system share sheet and cannot target Instagram Stories directly. |

**Confidence: MEDIUM for appinio_social_share** -- Last published 19 months ago (mid-2024). However, it remains the most downloaded and documented option for direct Instagram Stories / TikTok sharing in Flutter. The Instagram and TikTok sharing APIs themselves haven't changed significantly, so staleness is less concerning than for a package wrapping fast-moving APIs. **Mitigation:** Pin version, write integration tests, and be prepared to fork if it breaks on future Flutter versions.

**Why RepaintBoundary over the `screenshot` package:** The screenshot package (v3.0.0, last updated 21 months ago) wraps RepaintBoundary internally. Using RepaintBoundary directly has zero dependencies, is maintained by the Flutter team, and works identically.

**Why appinio_social_share over share_plus alone:** share_plus opens the system share sheet. For Instagram Stories sharing, you need to send a background image via the `com.instagram.sharedSticker` intent (Android) or the Instagram URL scheme (iOS). share_plus cannot do this. appinio_social_share implements these platform-specific intents.

**Why NOT share_to_social:** While more recently updated (9 months ago), it has significantly lower adoption and fewer documented use cases. appinio_social_share has more community usage and examples.

**Requirements:**
- Facebook App ID registration (required for Instagram Stories sharing)
- `LSApplicationQueriesSchemes` entries in Info.plist for `instagram-stories`, `tiktoksharesdk`
- Android intent filter declarations for target apps

### OG Meta Tag Serving

No new library needed. Express can serve dynamic HTML with OG tags using template strings. The existing Express setup handles this natively:

```typescript
// New route: /share/checkin/:id
app.get('/share/checkin/:id', async (req, res) => {
  const checkin = await checkinService.getById(req.params.id);
  const ogImageUrl = `${BASE_URL}/og/checkin/${req.params.id}.png`;
  res.send(`
    <html>
      <head>
        <meta property="og:title" content="${checkin.userName} checked in at ${checkin.venueName}" />
        <meta property="og:image" content="${ogImageUrl}" />
        <meta property="og:type" content="activity" />
      </head>
      <body><!-- Redirect to app deep link or app store --></body>
    </html>
  `);
});
```

---

## 2. Content Moderation Pipeline

### Strategy: Google Cloud Vision API for Automated Scanning + BullMQ Pipeline + Admin Queue

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@google-cloud/vision` | ^5.3.4 | SafeSearch image classification (NSFW, violence, racy) | Industry standard. First 1,000 units/month free, then ~$1.50/1K. Five-category scoring (adult, spoof, medical, violence, racy). Far more accurate than self-hosted TensorFlow models. Cloudflare R2 images accessible by URL. |
| BullMQ (existing) | ^5.67.2 | Moderation job queue | Already installed. Add a `moderation` queue alongside existing `badge` and `notification` queues. |
| PostgreSQL (existing) | 12+ | Report storage, moderation state machine | No new DB. Reports, moderation decisions, and appeal tracking are table additions. |

**Confidence: HIGH** -- Google Cloud Vision SafeSearch is the de facto choice for content moderation at this scale. AWS Rekognition is comparable but requires a full AWS account setup (SoundCheck uses GCP/Firebase already, so GCP billing is simpler to add).

**Pipeline Architecture:**

```
Photo uploaded to R2 (existing presigned URL flow)
        |
        v
BullMQ job: 'moderation:scan-image'
        |
        v
Google Cloud Vision SafeSearch API
  - Returns: { adult, spoof, medical, violence, racy }
  - Each category: VERY_UNLIKELY -> VERY_LIKELY (5 levels)
        |
        v
Decision engine:
  - auto_approved: all categories <= POSSIBLE
  - auto_rejected: adult or violence >= VERY_LIKELY
  - needs_review: anything in between -> admin queue
        |
        v
Update checkin/photo record with moderation_status enum:
  'pending' | 'approved' | 'rejected' | 'under_review'
```

**User Report System:** No new package needed. This is a PostgreSQL table (reports) with a status enum, a BullMQ job for auto-escalation (e.g., 3+ reports on same content triggers auto-review), and API endpoints for the admin review queue.

**Why Google Cloud Vision over self-hosted models:**
- Self-hosted TensorFlow/NSFW.js runs in-process, consumes CPU on Railway.app's limited containers, and has significantly worse accuracy than Google's models.
- At SoundCheck's scale (hundreds to low thousands of check-ins/day), Vision API cost is <$5/month.
- The app already uses Firebase (GCP), so billing and auth setup is minimal.

**Why NOT AWS Rekognition:** SoundCheck already has GCP/Firebase. Adding AWS credentials, IAM roles, and a second cloud billing relationship adds operational complexity for equivalent functionality.

**Why NOT Cloudinary moderation:** Cloudinary's add-on moderation is tied to using Cloudinary for storage. SoundCheck uses Cloudflare R2. Switching storage providers to get moderation is not worth it.

---

## 3. Venue/Artist Verification System

### Strategy: No New Libraries Required

Verification is a **data model and business logic** problem, not a technology problem.

**What's needed:**
- New `verification_requests` table (status enum: pending/approved/rejected/revoked)
- New `verified` boolean on `users` table (or a `user_roles` table with 'venue_owner', 'artist' roles)
- Admin API endpoints for reviewing verification requests
- Document upload via existing R2 presigned URL flow (proof of ownership)
- Email notification on status change (see below)

**Email for verification status updates:**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Existing Firebase Admin SDK | ^13.6.0 | Push notification for verification status | Already installed. Can notify users via push when their verification status changes. |
| Transactional email service (future) | -- | Email for verification confirmations | Not needed for v1.1 MVP. Push notifications suffice. If email becomes needed later, use Resend or SendGrid. |

**Confidence: HIGH** -- This requires zero new packages. It is schema design, API endpoints, and admin tooling. The R2 presigned URL flow already handles document/image uploads.

---

## 4. PostgreSQL Full-Text Search

### Strategy: Native tsvector + GIN Index (Replace ILIKE)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL tsvector + GIN | PostgreSQL 12+ (existing) | Full-text search with ranking, stemming, fuzzy matching | Zero new dependencies. Built into existing PostgreSQL. Handles typo tolerance (via `pg_trgm`), weighted search (name > description), and relevance ranking natively. |
| `pg_trgm` extension | PostgreSQL 12+ (existing) | Trigram-based fuzzy matching for typo tolerance | Complement to tsvector. Enables `SIMILARITY()` and `%` operators for "did you mean?" suggestions. |

**Confidence: HIGH** -- This is the explicitly identified tech debt item. The PROJECT.md calls out "PostgreSQL full-text search (tsvector + GIN) replacing ILIKE." No external search service (Elasticsearch, Meilisearch, Typesense) is warranted at SoundCheck's scale.

**Migration approach:** PostgreSQL 12+ generated columns keep tsvector in sync automatically without triggers:

```sql
-- Migration: Add search vector columns
ALTER TABLE bands ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(genre, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(hometown, '')), 'C')
  ) STORED;

CREATE INDEX idx_bands_search ON bands USING GIN (search_vector);

ALTER TABLE venues ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX idx_venues_search ON venues USING GIN (search_vector);

-- Enable trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_bands_name_trgm ON bands USING GIN (name gin_trgm_ops);
CREATE INDEX idx_venues_name_trgm ON venues USING GIN (name gin_trgm_ops);
```

**Query pattern (replaces all ILIKE queries):**

```sql
-- Replace: WHERE name ILIKE '%foo%' OR description ILIKE '%foo%'
-- With:
SELECT *, ts_rank(search_vector, query) AS rank
FROM bands, plainto_tsquery('english', $1) query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

**Current ILIKE locations to migrate** (6 files identified):
- `BandService.ts` -- band search (name, description, genre, hometown)
- `VenueService.ts` -- venue search (name, description, city)
- `EventService.ts` -- event search (event_name, venue name, band name, genre), genre browse
- `ReviewService.ts` -- review search (title, content)

**Why NOT Elasticsearch/Meilisearch/Typesense:** These are excellent search engines, but they require a separate service ($20-50/month), data synchronization infrastructure, and operational overhead. PostgreSQL full-text search handles SoundCheck's search requirements (name/description matching with ranking across ~100K records) with zero additional infrastructure. Revisit if search needs outgrow PostgreSQL (autocomplete across millions of records, faceted search, etc.).

**Why `pg_trgm` alongside tsvector:** tsvector is great for word-based search but does not handle typos in artist names (searching "Mettalica" won't match "Metallica"). pg_trgm provides trigram similarity matching that handles this. Use tsvector for primary search, pg_trgm as a fallback for "did you mean?" when tsvector returns no results.

---

## 5. Collaborative Filtering Recommendations

### Strategy: Pure PostgreSQL + BullMQ Batch Job (No External Library)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL (existing) | 12+ | Store similarity matrices, compute item-item scores | All data is already in PostgreSQL. The rating data (checkin_band_ratings, checkins.venue_rating) is the input matrix. Pure SQL computes cosine similarity efficiently for SoundCheck's scale. |
| BullMQ (existing) | ^5.67.2 | Nightly batch job to recompute similarity matrices | Already installed. Scheduled repeatable job computes similarity scores during off-peak hours. |
| Redis (existing) | -- | Cache hot recommendation results | Already in stack. Cache top-N recommendations per user with 1-hour TTL. |

**Confidence: MEDIUM** -- The pure-SQL approach is well-documented and works at SoundCheck's current scale (thousands of users, tens of thousands of ratings). If the app reaches 100K+ users with dense rating matrices, graduate to pgvector (already identified in v1 research) or an external service.

**Why NOT an npm recommendation library:**
- `collaborative-filter` (v1.0.0-beta.3) -- Beta, unmaintained, in-memory only
- `likely` (v0.2.0) -- Unmaintained (last update years ago), in-memory matrix factorization
- `recommendationRaccoon` -- Redis-based, unmaintained, duplicates data store
- None of these libraries work with PostgreSQL persistence. They all require loading the full rating matrix into memory, which defeats the purpose of having the data in PostgreSQL.

**Implementation approach: Item-Item Collaborative Filtering in SQL**

The existing DiscoveryService uses content-based scoring (genre affinity, friend attendance, trending). Collaborative filtering adds a new signal: "users who rated bands similarly to you also liked these bands/events."

```sql
-- Precompute: Item-item similarity matrix (nightly BullMQ job)
-- Store in a band_similarity table
INSERT INTO band_similarity (band_a_id, band_b_id, similarity_score)
SELECT
  a.band_id AS band_a_id,
  b.band_id AS band_b_id,
  -- Cosine similarity between rating vectors
  SUM(a.rating * b.rating) /
    (SQRT(SUM(a.rating * a.rating)) * SQRT(SUM(b.rating * b.rating))) AS similarity
FROM checkin_band_ratings a
JOIN checkin_band_ratings b ON a.checkin_id IN (
  SELECT id FROM checkins WHERE user_id IN (
    SELECT DISTINCT user_id FROM checkins WHERE id = b.checkin_id
  )
)
WHERE a.band_id < b.band_id  -- avoid duplicates
GROUP BY a.band_id, b.band_id
HAVING COUNT(*) >= 3  -- minimum co-rating threshold
ON CONFLICT (band_a_id, band_b_id) DO UPDATE SET similarity_score = EXCLUDED.similarity_score;

-- Query: recommend events with bands similar to ones the user rated highly
SELECT e.*, SUM(bs.similarity_score * ubr.rating) AS cf_score
FROM events e
JOIN event_lineup el ON e.id = el.event_id
JOIN band_similarity bs ON el.band_id = bs.band_b_id
JOIN checkin_band_ratings ubr ON bs.band_a_id = ubr.band_id
JOIN checkins c ON ubr.checkin_id = c.id AND c.user_id = $1
WHERE e.event_date >= CURRENT_DATE AND e.is_cancelled = FALSE
GROUP BY e.id
ORDER BY cf_score DESC
LIMIT 20;
```

**Integration with existing DiscoveryService:**
Add collaborative filtering as a fourth scoring signal in the existing CTE-based recommendation query:
- Genre affinity: 3x weight (existing)
- Friend attendance: 5x weight (existing)
- Trending: 1x weight (existing)
- **Collaborative filtering: 4x weight (new)** -- similar-user taste signal

**New tables:**
- `band_similarity (band_a_id, band_b_id, similarity_score, computed_at)` -- precomputed nightly
- Consider: `venue_similarity` if venue preference patterns emerge

**Phase 2 (when data justifies):** pgvector for embedding-based similarity. Store user taste vectors (genre distribution, rating patterns) as vector embeddings. Find similar users with `<=>` cosine distance operator. Already planned in v1 research.

---

## 6. SoundCheck Wrapped (Year-in-Review)

### Strategy: BullMQ Batch Job + PostgreSQL Materialized View + Sharp for Card Images

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL (existing) | 12+ | Aggregate annual stats per user | All check-in data is already in PostgreSQL. Complex aggregation queries are PostgreSQL's strength. Use materialized views for the heavy computation. |
| BullMQ (existing) | ^5.67.2 | Batch job to precompute Wrapped data for all users | Run in November, precompute every user's year-in-review stats. Process users in batches (100-500 per job) to avoid memory pressure. |
| `satori` + `@resvg/resvg-js` | (same as sharing) | Generate shareable Wrapped card images | Same pipeline as OG share cards. Design Wrapped card templates as JSX, render to PNG. One template per Wrapped stat (top artist, top genre, total shows, etc.). |
| Redis (existing) | -- | Cache computed Wrapped data | Cache each user's Wrapped payload with a long TTL (30 days). Wrapped data is static once computed. |

**Confidence: HIGH** -- This is a batch data pipeline problem, not a technology problem. Spotify runs Wrapped on Dataflow/BigQuery for 600M+ users. SoundCheck's scale (thousands of users) makes this a single PostgreSQL query job.

**Data pipeline:**

```
November 15 (cron trigger via BullMQ)
        |
        v
BullMQ job: 'wrapped:compute-all'
  - Enumerate all users with >= 3 check-ins in current year
  - Queue individual 'wrapped:compute-user' jobs in batches
        |
        v
Per-user computation (PostgreSQL queries):
  - Total shows attended
  - Total unique bands seen
  - Total unique venues visited
  - Top 5 bands (by times seen)
  - Top 5 venues (by visits)
  - Top 3 genres
  - Most active month
  - Longest streak (consecutive weeks with a check-in)
  - "Your concert personality" (genre-based archetype)
  - Total hours at shows (estimated from check-in times)
  - City with most shows
  - Rarest badge earned
        |
        v
Store in wrapped_data table:
  user_id, year, stats_json (JSONB), computed_at
        |
        v
Generate shareable card images (on-demand, cached):
  satori + @resvg/resvg-js -> PNG -> R2 -> cache URL
```

**No Spotify-scale infrastructure needed.** SoundCheck's Wrapped is a single materialized view refresh + batch INSERT, not a distributed data pipeline.

**Why precompute in November (not real-time):** Following Spotify's pattern -- stop data collection mid-November, process/QA, launch in early December. This avoids real-time computation load and gives time to verify data quality.

---

## 7. Premium Tier / In-App Purchases

### Strategy: RevenueCat for IAP Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `purchases_flutter` | ^9.12.3 | Flutter SDK for RevenueCat (wraps StoreKit + Google Play Billing) | Free until $2,500 MTR (monthly tracked revenue), then 1% of revenue. Handles receipt validation, entitlement management, subscription lifecycle, and cross-platform sync. The alternative -- implementing StoreKit 2 and Google Play Billing Library 8 natively -- requires 2-3x the code and ongoing maintenance for each platform's breaking changes. |
| `purchases_ui_flutter` | ^8.11.0 | Pre-built RevenueCat paywall UI components | Optional but recommended. Provides tested, App Store-compliant paywall screens. Reduces UI development time for the premium upgrade flow. |

**Confidence: HIGH** -- RevenueCat is the standard for Flutter IAP. Free tier is generous for a new product. The purchases_flutter SDK is actively maintained (published 2 days ago as of research date).

**Backend entitlement checking:**
RevenueCat provides webhooks for subscription events. The backend receives webhooks and updates a `user_subscriptions` table:

```
RevenueCat webhook -> POST /webhooks/revenuecat
  |
  v
Verify webhook signature
  |
  v
Update user_subscriptions table:
  user_id, plan, status, expires_at, platform, revenuecat_id
  |
  v
Cache entitlement in Redis (check on every premium feature access)
```

**No server-side RevenueCat SDK needed** for basic entitlement checking. The mobile SDK handles purchases, and webhooks handle server-side state sync. If server-side receipt validation is needed later, RevenueCat provides a REST API (no SDK required -- use existing axios).

**Premium feature gating pattern:**

```typescript
// Middleware: requirePremium
async function requirePremium(req: AuthRequest, res: Response, next: NextFunction) {
  const isPremium = await cache.getOrSet(
    `premium:${req.userId}`,
    () => subscriptionService.isActive(req.userId),
    300 // 5-min TTL
  );
  if (!isPremium) return res.status(403).json({ error: 'Premium required', upgrade_url: '...' });
  next();
}
```

**Why RevenueCat over `in_app_purchase` (Flutter plugin):**
- `in_app_purchase` handles only the purchase flow -- no receipt validation, no subscription lifecycle management, no analytics, no webhook infrastructure.
- RevenueCat adds receipt validation, entitlement syncing, subscription status tracking, churn analytics, and a dashboard -- all for free at SoundCheck's expected scale.
- Google Play now requires Billing Library 8 (purchases_flutter 9.x handles this).

**Why NOT Adapty, Qonversion, or Superwall:** RevenueCat has the largest Flutter community, best documentation, and most generous free tier. The others are smaller or focused on paywalls/experiments rather than core IAP infrastructure.

---

## Complete New Dependencies Summary

### Backend (npm install)

```bash
# Social Sharing / OG Images
npm install satori @resvg/resvg-js sharp

# Content Moderation
npm install @google-cloud/vision
```

| Package | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `satori` | ^0.19.2 | HTML/CSS to SVG for share cards and Wrapped images | Social Sharing |
| `@resvg/resvg-js` | ^2.6.2 | SVG to PNG conversion (pairs with satori) | Social Sharing |
| `sharp` | ^0.34.5 | Image resizing, optimization, thumbnails | Social Sharing + Moderation |
| `@google-cloud/vision` | ^5.3.4 | SafeSearch image content scanning | Content Moderation |

### Mobile (pubspec.yaml additions)

```yaml
# Social Sharing (direct app-to-app)
appinio_social_share: ^0.3.2    # Instagram Stories, TikTok, X direct sharing

# In-App Purchases
purchases_flutter: ^9.12.3      # RevenueCat IAP SDK
purchases_ui_flutter: ^8.11.0   # RevenueCat paywall UI components
```

| Package | Version | Purpose | Phase |
|---------|---------|---------|-------|
| `appinio_social_share` | ^0.3.2 | Direct sharing to Instagram Stories, TikTok, X | Social Sharing |
| `purchases_flutter` | ^9.12.3 | RevenueCat IAP (StoreKit + Google Play Billing) | Premium Tier |
| `purchases_ui_flutter` | ^8.11.0 | Pre-built paywall UI | Premium Tier |

### PostgreSQL Extensions (no npm/pub packages)

| Extension | Purpose | Phase |
|-----------|---------|-------|
| `pg_trgm` | Trigram fuzzy matching for typo-tolerant search | Full-Text Search |
| (tsvector + GIN are built-in, not an extension) | | |

### Features Requiring ZERO New Dependencies

| Feature | Uses Existing | Details |
|---------|---------------|---------|
| Venue/Artist Verification | PostgreSQL + R2 + Firebase push | Schema + API endpoints + admin tooling |
| Report/Flag System | PostgreSQL + BullMQ | Reports table + escalation jobs |
| Full-Text Search | PostgreSQL tsvector/GIN | Migration + query refactor |
| Collaborative Filtering | PostgreSQL + BullMQ + Redis | Similarity tables + nightly batch job |
| SoundCheck Wrapped (computation) | PostgreSQL + BullMQ + Redis | Batch computation + JSONB storage |
| SoundCheck Wrapped (images) | satori + resvg-js (shared with OG) | Same pipeline as social sharing cards |
| Premium entitlement checking | Redis + PostgreSQL | Webhook receiver + cache |
| OG meta tag serving | Express (existing) | Route handler with template strings |
| Admin review queue | Express + PostgreSQL | API endpoints + status state machine |

### Infrastructure / External Services (new)

| Service | Purpose | Cost | Phase |
|---------|---------|------|-------|
| Google Cloud Vision API | Image content moderation | Free (1K/mo), then ~$1.50/1K images | Content Moderation |
| RevenueCat account | IAP management, receipt validation | Free until $2,500 MTR, then 1% | Premium Tier |
| Facebook Developer App | Required for Instagram Stories sharing | Free | Social Sharing |

### Environment Variables (new)

```bash
# Content Moderation
GOOGLE_APPLICATION_CREDENTIALS=   # Path to GCP service account JSON
# OR
GOOGLE_CLOUD_PROJECT=             # GCP project ID (if using default credentials)

# In-App Purchases
REVENUECAT_WEBHOOK_SECRET=        # Webhook signature verification
REVENUECAT_API_KEY=               # Optional, for server-side API calls

# Social Sharing
FACEBOOK_APP_ID=                  # Required for Instagram Stories sharing
OG_BASE_URL=                      # Base URL for OG image generation (e.g., https://soundcheck.app)
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `satori` + `@resvg/resvg-js` | Puppeteer/Playwright | Headless browser is 200MB+ memory, 2-5s per image. Railway container limits make this impractical. |
| `satori` + `@resvg/resvg-js` | `sharp` SVG text compositing only | Fragile for complex card layouts. JSX templating in satori is maintainable. |
| `@google-cloud/vision` | AWS Rekognition | GCP already in use (Firebase). Adding AWS adds billing and credential complexity. |
| `@google-cloud/vision` | Self-hosted TensorFlow/NSFW.js | Much worse accuracy, consumes Railway CPU, requires model management. |
| `@google-cloud/vision` | Cloudinary moderation | Requires switching to Cloudinary for storage. R2 is already working. |
| PostgreSQL tsvector | Elasticsearch / Meilisearch / Typesense | Separate service ($20-50/mo), sync infrastructure, operational overhead. Overkill for ~100K records. |
| Pure SQL collaborative filtering | npm recommendation libraries | All npm options are unmaintained, in-memory only, and don't integrate with PostgreSQL. |
| RevenueCat (`purchases_flutter`) | `in_app_purchase` (Flutter plugin) | No receipt validation, no subscription lifecycle, no analytics, no webhooks. 2-3x more code to maintain. |
| RevenueCat | Adapty / Qonversion | Smaller Flutter community, less documentation, less generous free tier. |
| `appinio_social_share` | Custom method channels | Reinventing Instagram/TikTok intent handling is error-prone and platform-specific. Package handles it. |
| `appinio_social_share` | `share_plus` alone | share_plus only shows system share sheet. Cannot target Instagram Stories or TikTok directly. |
| Precomputed Wrapped (BullMQ batch) | Real-time Wrapped computation | Spotify pattern: stop data Nov 15, precompute, launch Dec 1. Avoids real-time load and enables QA. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Elasticsearch / Meilisearch | Additional service, sync complexity, cost -- overkill at SoundCheck's data scale | PostgreSQL tsvector + GIN + pg_trgm |
| Self-hosted NSFW detection | Poor accuracy vs. Cloud Vision, CPU burden on Railway | @google-cloud/vision SafeSearch |
| Puppeteer/Playwright for OG images | Memory-heavy, slow, fragile on Railway containers | satori + @resvg/resvg-js |
| `in_app_purchase` Flutter plugin alone | No backend integration, no receipt validation, no subscription management | RevenueCat purchases_flutter |
| `collaborative-filter` npm | Beta (v1.0.0-beta.3), in-memory only, unmaintained | Pure SQL on existing PostgreSQL |
| `likely` npm | v0.2.0, unmaintained, in-memory matrix factorization only | Pure SQL on existing PostgreSQL |
| `recommendationRaccoon` npm | Redis-only, unmaintained, duplicates data store | Pure SQL on existing PostgreSQL |
| RecDB PostgreSQL extension | Requires PostgreSQL 9.2, abandoned project | Native SQL + potentially pgvector later |
| Separate email service for v1.1 | Push notifications suffice for verification status updates | Firebase push (already installed) |
| `screenshot` Flutter package | Last updated 21 months ago, wraps RepaintBoundary (use that directly) | Flutter built-in RepaintBoundary |
| pgvector (for v1.1) | Premature -- not enough users/ratings to justify vector embeddings yet | SQL-based collaborative filtering |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `satori` ^0.19.2 | Node.js >= 16, Express 4.x | Requires font files (TTF/OTF/WOFF, not WOFF2) |
| `@resvg/resvg-js` ^2.6.2 | Node.js >= 16, satori SVG output | WASM-based, no native compilation needed |
| `sharp` ^0.34.5 | Node.js >= 18.17.0 | Has native bindings (prebuilt for Railway Linux). Node 20 is compatible. |
| `@google-cloud/vision` ^5.3.4 | Node.js >= 16 | Uses gRPC under the hood; may add ~50MB to node_modules |
| `purchases_flutter` ^9.12.3 | Flutter SDK >= 3.2.0, iOS 13.0+, Android SDK 21+ | Wraps Google Play Billing Library 8 |
| `purchases_ui_flutter` ^8.11.0 | purchases_flutter ^9.x | Must be from same RevenueCat SDK generation |
| `appinio_social_share` ^0.3.2 | Flutter SDK >= 3.0, iOS 13+, Android SDK 21+ | Requires Facebook App ID for Instagram Stories |
| `pg_trgm` extension | PostgreSQL 12+ | Built-in contrib module, just needs CREATE EXTENSION |

---

## Sources

### Social Sharing / OG Images
- [satori GitHub](https://github.com/vercel/satori) -- Vercel's HTML-to-SVG library, JSX support, Node.js runtime
- [satori npm](https://www.npmjs.com/package/satori) -- v0.19.2
- [@resvg/resvg-js npm](https://www.npmjs.com/package/@resvg/resvg-js) -- v2.6.2, Rust WASM SVG-to-PNG
- [sharp npm](https://www.npmjs.com/package/sharp) -- v0.34.5, image processing
- [appinio_social_share pub.dev](https://pub.dev/packages/appinio_social_share) -- v0.3.2, direct social sharing
- [Vercel OG Image Generation Blog](https://vercel.com/blog/introducing-vercel-og-image-generation-fast-dynamic-social-card-images) -- Architecture reference
- [Flutter RepaintBoundary docs](https://api.flutter.dev/flutter/rendering/RepaintBoundary-class.html) -- Built-in widget capture

### Content Moderation
- [Google Cloud Vision SafeSearch](https://docs.cloud.google.com/vision/docs/detecting-safe-search) -- Official documentation
- [Google Cloud Vision Pricing](https://cloud.google.com/vision/pricing) -- Free tier (1K/mo), then ~$1.50/1K
- [@google-cloud/vision npm](https://www.npmjs.com/package/@google-cloud/vision) -- v5.3.4
- [Content Moderation Pipeline Architecture (DEV)](https://dev.to/silentwatcher_95/content-moderation-in-nodejs-building-a-scalable-image-moderation-pipeline-with-minio-bullmq-f53) -- BullMQ + scanning pipeline reference

### Full-Text Search
- [PostgreSQL Full-Text Search Docs](https://www.postgresql.org/docs/current/textsearch-tables.html) -- tsvector, GIN indexes
- [PostgreSQL GIN Index Analysis](https://pganalyze.com/blog/gin-index) -- Performance characteristics
- [Full-Text Search in Postgres with TypeScript](https://betterstack.com/community/guides/scaling-nodejs/full-text-search-in-postgres-with-typescript/) -- Node.js integration guide
- [PostgreSQL FTS as Elasticsearch Alternative](https://iniakunhuda.medium.com/postgresql-full-text-search-a-powerful-alternative-to-elasticsearch-for-small-to-medium-d9524e001fe0) -- Scale comparison
- [GIN Indexes in PostgreSQL (Jan 2026)](https://oneuptime.com/blog/post/2026-01-25-full-text-search-gin-postgresql/view) -- Recent best practices

### Collaborative Filtering
- [Node.js Recommendation Engine 2025](https://www.webtrophy.dev/posts/recommendation-engine-nodejs/) -- Matrix factorization in Node.js
- [Building Recommendations with PostgreSQL](https://reintech.io/blog/building-recommendation-engine-postgresql) -- SQL-based approach

### SoundCheck Wrapped
- [Spotify Wrapped Engineering](https://datapecharcha.substack.com/p/spotify-wrapped-the-engineering-marvel) -- Architecture reference
- [Spotify Data Platform](https://engineering.atspotify.com/2024/5/data-platform-explained-part-ii) -- Data pipeline patterns (for future scale reference)

### In-App Purchases
- [RevenueCat Flutter Docs](https://www.revenuecat.com/docs/getting-started/installation/flutter) -- Installation, setup guide
- [purchases_flutter pub.dev](https://pub.dev/packages/purchases_flutter) -- v9.12.3
- [purchases_ui_flutter pub.dev](https://pub.dev/packages/purchases_ui_flutter) -- v8.11.0
- [RevenueCat Pricing](https://www.revenuecat.com/pricing/) -- Free until $2,500 MTR, then 1%
- [RevenueCat Flutter 2025 Guide](https://medium.com/blocship/in-app-purchases-with-revenue-cat-flutter-2025-36adbef2c2d5) -- Implementation walkthrough

---

*Stack research for: SoundCheck v1.1 milestone additions*
*Researched: 2026-02-27*
