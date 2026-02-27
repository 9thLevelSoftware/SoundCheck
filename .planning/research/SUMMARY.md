# Project Research Summary

**Project:** SoundCheck v1.1 — "Untappd for live music" growth platform
**Domain:** Social concert check-in app — viral growth, trust/safety, platform credibility, and monetization
**Researched:** 2026-02-27
**Confidence:** HIGH overall (existing codebase analyzed, multi-source verification, official documentation cross-referenced)

## Executive Summary

SoundCheck v1.0 shipped a solid foundation: event check-in with dual ratings, 37 badges, a FOMO feed, concert-cred profiles, GPS-assisted discovery, and a Ticketmaster event pipeline. The v1.1 milestone transforms this from a working product into a growth platform. Research across stack, features, architecture, and pitfalls converges on a clear conclusion: the v1.1 work divides into four ordered phases driven by hard dependencies — App Store compliance gates everything, the viral growth engine gates engagement, platform trust gates B2B, and monetization gates revenue.

The recommended approach is conservative on new technology and aggressive on product value. Seven of the thirteen v1.1 features require zero new dependencies — they are schema additions and new services on the existing PostgreSQL + BullMQ + Redis stack. Only four new backend packages are needed (satori, @resvg/resvg-js, sharp, @google-cloud/vision) and three new Flutter packages (appinio_social_share, purchases_flutter, purchases_ui_flutter). The architecture extends cleanly without restructuring: most v1.1 features are new services and new tables that plug into existing BullMQ queues, the notification system, and R2 storage. The two genuine modification zones are the FeedService (COUNT(DISTINCT) denormalization) and the search layer (ILIKE to tsvector migration), both of which carry real regression risk.

The dominant risk is ordering. Without report/block/moderation in place first, Apple will reject the v1.1 app update — social sharing and any new UGC surfaces trigger Guideline 1.2 enforcement. The second risk is architectural shortcuts: storing premium entitlements as a client-side boolean, computing Wrapped for all users without consent, and using ILIKE as "temporary" search that becomes permanent. A third risk worth naming explicitly: collaborative filtering is premature at SoundCheck's current data volume. The existing content-based recommendation engine should be improved rather than replaced; build the data collection infrastructure now, implement collaborative filtering when the dataset justifies it (>5K active users, >50K check-ins).

## Key Findings

### Recommended Stack

SoundCheck v1.1 requires only four new backend npm packages and three new Flutter packages on top of the existing production stack. The backend additions are satori + @resvg/resvg-js (server-side image generation via JSX-to-SVG-to-PNG pipeline, replacing Puppeteer which would be memory-prohibitive on Railway), sharp (image post-processing), and @google-cloud/vision (SafeSearch content moderation — the app already uses Firebase/GCP, so billing is additive, not a new vendor relationship). The Flutter additions are appinio_social_share (direct platform sharing to Instagram Stories, TikTok, X — share_plus alone cannot target these), purchases_flutter + purchases_ui_flutter (RevenueCat for IAP, which provides server-side receipt validation, subscription lifecycle management, and webhooks that raw in_app_purchase does not). No new external search service, no recommendation library, no additional infrastructure beyond a Google Cloud Vision API key and a RevenueCat account.

**Core technologies:**
- `satori` ^0.19.2 + `@resvg/resvg-js` ^2.6.2: Server-side share card image generation — JSX templates to PNG via SVG, runs in-process at ~50ms per image, no Puppeteer needed
- `sharp` ^0.34.5: Image optimization and post-processing — pairs with satori for OG card output and pre-processes uploads for moderation
- `@google-cloud/vision` ^5.3.4: SafeSearch image scanning for automated content moderation — free first 1K/month, GCP is already in use
- `appinio_social_share` ^0.3.2: Direct sharing to Instagram Stories/TikTok/X — share_plus only opens the system sheet, cannot target Stories directly
- `purchases_flutter` ^9.12.3 + `purchases_ui_flutter` ^8.11.0: RevenueCat IAP — handles receipt validation, subscription lifecycle, webhooks; raw in_app_purchase lacks all of this
- PostgreSQL tsvector + GIN + pg_trgm: Full-text search upgrade from ILIKE — zero new infrastructure, already on PostgreSQL 12+, pg_trgm trigram indexes already exist in migrations 015 and 022

See `.planning/research/STACK.md` for full version table, alternatives considered, and environment variables.

### Expected Features

Research identifies thirteen features across three categories. Trust and safety features (T1-T4) are App Store compliance requirements that must ship before any new UGC surface. Growth features (T5-T7, D1) create the viral loop and first-time conversion. Platform and monetization features (D2-D6) build the retention and revenue engine.

**Must have — table stakes (App Store compliance or critical retention):**
- Report/flag mechanism on all UGC (T1) — App Store Guideline 1.2 hard requirement; Apple rejects updates without this
- Content moderation pipeline (T2) — automated SafeSearch scan + admin review queue; required complement to reporting
- Block users (T3) — Guideline 1.2 explicit requirement; bilateral blocks from any profile
- Forgot password (T4) — currently stubbed; locked-out users churn immediately
- Onboarding flow (T5) — 77% of users abandon within 3 days; genre picker seeds recommendations and solves cold-start
- Social sharing cards (T6) — server-side card generation + mobile share sheet; the entire viral growth loop depends on this
- Post-check-in celebration screen with share CTA (T7) — the highest-engagement moment currently ends with nothing; this is where sharing actually happens

**Should have — differentiators:**
- Event RSVP "I'm Going" (D1) — pre-show engagement loop; "N friends going" social proof; feeds trending algorithm
- Trending shows feed (D2) — between-show retention; Wilson-scored mix of RSVP count, check-in velocity, friend signals, proximity
- Venue/artist verification (D3) — lightweight claim-then-admin-review model; prerequisite for claimed profiles
- Claimed profiles (D4) — venue/artist owners see aggregate ratings, respond to reviews, update profile; read-heavy first version
- SoundCheck Wrapped (D5) — December 2026 launch; massive viral share driver; Strava's move to premium-only validates the revenue model
- Premium tier SoundCheck Pro (D6) — $4.99/month; gates enhanced Wrapped, advanced analytics, retroactive check-in, custom badge showcase

**Defer to v2+:**
- Full B2B venue dashboard with data exports and heatmaps (A2) — separate product, separate sales motion; Untappd for Business launched years after Untappd consumer
- Custom ML content moderation (A1) — Cloud Vision SafeSearch is accurate and cheap; custom ML is overkill at SoundCheck's scale
- Real-time moderation blocking the check-in flow (A3) — adds latency to the core action; async post-publish moderation is the correct tradeoff
- Collaborative filtering recommendations (Pitfall 4) — wrong tool for current data volume; build data collection now, implement algorithm at >5K users

See `.planning/research/FEATURES.md` for full prioritization matrix, complexity estimates (~55-75 days total), and competitor analysis.

### Architecture Approach

The v1.0 architecture — Express/TypeScript service layer, Flutter clean architecture per feature, PostgreSQL with 25 migrations, BullMQ for async jobs, Redis cache-aside, WebSocket with Redis Pub/Sub — is well-structured and extensible. V1.1 features are predominantly new services and new tables that plug into existing integration points rather than modifications of existing code. The two genuine modification zones are the FeedService (COUNT(DISTINCT) denormalization to prevent feed degradation as traffic increases from sharing) and the search layer (ILIKE to tsvector migration across BandService, VenueService, EventService). All other features — moderation pipeline, verification, sharing cards, Wrapped, premium — introduce new services alongside existing ones.

**Major new components:**
1. `ModerationService` + `ReportService` + `ImageModerationService` — three-tier moderation pipeline: auto-scan, user reports, admin review queue; all backed by BullMQ `moderation` worker calling Google Vision SafeSearch
2. `ShareCardService` + `shareCardWorker` — satori JSX templates to PNG, cached in R2 at `cards/{type}/{id}_{variant}.png`; generates 1200x630 (OG) and 1080x1920 (Stories) variants
3. `VerificationService` — claim-then-admin-review flow; creates `verified_profiles` rows; scoped role authorization via `user_roles` table (not inline conditionals on entity tables)
4. `WrappedService` + `wrappedWorker` — on-demand computation from existing check-in data, Redis-cached with 24h TTL, explicit opt-in consent required; generates shareable card images via same satori pipeline
5. `EntitlementService` — RevenueCat webhook receiver updates `entitlements` table; `requirePremium` middleware checks Redis-cached entitlement on every premium endpoint

**Key pattern decisions:**
- Authorization for claimed profiles must use a `user_roles(user_id, role, scope_type, scope_id)` table, not scattered inline checks — scattered checks become unmaintainable at the second claimed entity type
- Wrapped data must be on-demand (user-triggered) rather than batch pre-computed for all users — GDPR Article 22 profiling concern; cache in Redis, do not persist in database
- Share card generation must be async via BullMQ — synchronous generation in the Express request handler will OOM the Railway instance at peak share bursts
- Premium entitlements must be server-side — all premium feature gates via `requirePremium` middleware, never client-side booleans

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, table schemas, and modified component lists.

### Critical Pitfalls

1. **App Store rejection for missing moderation (Pitfall 1)** — Apple enforces Guideline 1.2 on every update. Adding social sharing or any new UGC surface without report/block/filter in place triggers rejection. Prevention: ship the entire Trust & Safety foundation (T1-T4) before any feature that creates new UGC surfaces. This is the only hard gate across all four phases.

2. **Share card image generation killing the Railway instance (Pitfall 2)** — Synchronous server-side image generation during the check-in flow will exhaust memory on a single Railway container when multiple users share after a popular show. Prevention: satori (not Puppeteer), async BullMQ generation, pre-generated and cached in R2 before the user taps Share.

3. **Full-text search migration breaking existing search behavior (Pitfall 3)** — tsvector does not match partial words (ILIKE `%jazz%` matches "jazz-fusion"; tsvector does not). Stop words silently drop results ("The The" returns nothing). COALESCE is required on nullable columns. Prevention: hybrid approach — tsvector for ranked search, keep pg_trgm trigram for fuzzy fallback; regression test 100 real queries before removing any ILIKE code.

4. **Collaborative filtering cold start (Pitfall 4)** — With a small user base, the item-item similarity matrix is too sparse to produce useful results. The existing content-based recommendations are actually the right architecture for this stage. Prevention: do NOT build collaborative filtering in v1.1; improve content-based signals instead; log recommendation impressions and click-throughs as training data; implement CF only after >5K active users + >50K check-ins.

5. **Premium IAP without server-side entitlement validation (Pitfall 5)** — Raw `in_app_purchase` Flutter plugin has no receipt validation; client-side premium booleans are trivially bypassable on jailbroken devices. Prevention: RevenueCat handles server-side validation; `requirePremium` backend middleware checks Redis-cached entitlement on every premium endpoint; never trust the client.

6. **Wrapped pre-computation creating GDPR liability (Pitfall 6)** — Batch pre-computing behavioral profiles for all users triggers GDPR Article 22. Prevention: on-demand computation triggered by explicit user opt-in; cache in Redis (24h TTL); do not persist in database permanently; include in DataExportService.

7. **Verification creating permissions explosion (Pitfall 7)** — Adding venue owner and artist roles as scattered inline `if` checks becomes unmaintainable within 2-3 features. Prevention: design the `user_roles(user_id, role, scope_type, scope_id)` authorization model before the first claimed profile; all scoped checks through `requirePermission()` middleware.

8. **Deep links failing for non-users clicking share cards (Pitfall 8)** — Instagram Stories, X, and TikTok shares generate clicks from people without the app. These clicks need a web landing page. Prevention: build a minimal Cloudflare Pages site at `soundcheck.app/s/{id}` showing the share card and App Store/Play Store CTAs; this is a prerequisite for sharing, not a follow-up. Note: Firebase Dynamic Links was deprecated August 2025 — do not use it.

## Implications for Roadmap

Based on the combined research, four phases emerge from hard dependency chains. The ordering is dictated by App Store compliance gates, architectural prerequisites, and data requirements — not arbitrary sprint sizing.

### Phase 1: Trust and Safety Foundation

**Rationale:** App Store Guideline 1.2 is a hard gate. Apple will reject the v1.1 update if any new UGC surface (social sharing, RSVP, claimed profiles) exists without report/block/filter mechanisms. This must ship and be verifiable before any Phase 2 submission. Additionally, several existing technical debts will be actively aggravated by v1.1 features — address them here before they compound.

**Delivers:** Compliance infrastructure, auth hygiene, platform stability baseline

**Addresses features:** T1 (report/flag), T2 (content moderation pipeline), T3 (block users), T4 (forgot password)

**Technical debt to address here:**
- CheckinService facade completion (currently ~30% extracted; share logic must not be added to a 1,400-LOC service)
- FeedService COUNT(DISTINCT) denormalization (will degrade faster once sharing drives more feed traffic)
- Reliable audit logging for moderation actions (fire-and-forget is legally insufficient for moderation decisions)
- Staging environment on Railway (needed for moderation, IAP, and verification testing)
- Fix 8 existing `as any` type casts before adding verification/moderation/premium type surface area

**Avoids pitfalls:** Pitfall 1 (App Store rejection), Pitfall 2 architecture decision (async card generation must be decided in Phase 1 to avoid rework in Phase 2)

### Phase 2: Viral Growth Engine

**Rationale:** Once compliance is satisfied, the priority is closing Board gap #2 ("no viral loops outside the app"). The sharing card generation pipeline, once built, is reused by Phase 4 Wrapped — build it once correctly here. The celebration screen and RSVP create the post-show and pre-show engagement loops that drive organic growth. Onboarding solves the cold-start problem that makes the product feel empty for new users.

**Delivers:** Shareable check-in cards, post-check-in dopamine loop, pre-show social engagement, first-time user conversion

**Addresses features:** T5 (onboarding + genre picker), T6 (social sharing cards), T7 (celebration screen with share CTA), D1 (event RSVP)

**Stack used:** satori, @resvg/resvg-js, sharp (backend); appinio_social_share (Flutter); Cloudflare Pages minimal landing page (required prerequisite)

**Avoids pitfalls:** Pitfall 2 (async BullMQ card generation, not synchronous), Pitfall 8 (web landing page is a prerequisite for sharing, built before share feature ships)

### Phase 3: Platform Trust and Between-Show Retention

**Rationale:** Once the growth engine is running, the focus shifts to closing Board gaps #1, #3, and #4 (between-show retention, artist/venue stakeholders, trust infrastructure). The trending feed uses RSVP data from Phase 2 as its primary signal — it cannot be meaningfully built without it. Verification is the prerequisite for claimed profiles. The authorization model for claimed profiles must be designed as a proper `user_roles` table before any implementation. The FTS migration is isolated here with a dedicated rollback plan — do not rush it alongside feature work.

**Delivers:** Between-show retention loop, venue/artist stakeholders on platform, trust credibility signal, production-quality search

**Addresses features:** D2 (trending feed), D3 (venue/artist verification), D4 (claimed profiles), full-text search migration (replaces ILIKE across 5 services)

**Architecture:** `user_roles` authorization model designed first, VerificationService, PostgreSQL tsvector + GIN migration with pg_trgm hybrid fallback retained

**Avoids pitfalls:** Pitfall 3 (FTS hybrid approach with regression testing, side-by-side query comparison before removing ILIKE), Pitfall 7 (authorization model before implementation — not a `claimed_by` column scattered on multiple tables)

### Phase 4: Monetization and Wrapped

**Rationale:** Revenue infrastructure and the signature retention/viral feature. Wrapped requires accumulated check-in data — December 2026 is the natural first launch window. The premium tier needs Wrapped as a compelling gated feature (Strava validated this model by moving Year in Sport behind premium in 2025). Build Wrapped with explicit consent architecture. RevenueCat handles IAP complexity. The feature gate decisions for premium (what's free vs. gated) should be finalized before implementation.

**Delivers:** Revenue infrastructure, annual viral growth event (Wrapped shares drive installs), subscription infrastructure

**Addresses features:** D5 (SoundCheck Wrapped), D6 (SoundCheck Pro premium tier)

**Stack used:** purchases_flutter, purchases_ui_flutter (Flutter); satori pipeline reused from Phase 2 for Wrapped card images; RevenueCat webhooks

**Avoids pitfalls:** Pitfall 4 (collaborative filtering deferred — recommendation impression logging only), Pitfall 5 (server-side entitlement via RevenueCat + requirePremium middleware), Pitfall 6 (on-demand Wrapped with explicit opt-in, not batch pre-computation)

### Phase Ordering Rationale

- Phase 1 before Phase 2: App Store compliance is a hard gate on submissions. Social sharing creates new UGC surfaces; without moderation those surfaces trigger Guideline 1.2 rejection.
- Phase 2 before Phase 3: RSVP data (D1) is the primary input signal for the trending algorithm (D2). Without RSVP count data, trending falls back to check-in count only — useful during shows but not between them.
- Phase 2 before Phase 4: The satori card generation pipeline built for sharing (Phase 2) is reused for Wrapped cards (Phase 4). Building it twice is waste; building it once correctly in Phase 2 means Phase 4 gets it for free.
- Phase 3 before Phase 4: Verification (D3) must precede claimed profiles (D4). The `user_roles` authorization model must be in place before premium adds entitlement checking as a fourth permission dimension.
- Phase 4 timing: Wrapped requires accumulated check-in data. If v1.1 ships mid-2026, Phase 4 targeting December 2026 gives approximately six months of data collection — sufficient for a first Wrapped, better with more.

### Research Flags

Phases needing deeper research during planning:

- **Phase 2:** The web landing page for share links has multiple implementation options (Cloudflare Pages + Worker, Branch.io, Appsflyer OneLink, custom solution). Firebase Dynamic Links was deprecated August 2025 and must not be used. A concrete decision is required before Phase 2 begins — the URL structure affects Universal Links/App Links configuration, which takes time to propagate through CDN and app review.
- **Phase 4:** RevenueCat pricing model (free until $2,500 MTR, then 1%) needs validation against revenue projections. App Store pricing tiers, promotional pricing for annual subscriptions, and Google Play Billing Library 8 requirements (already handled by purchases_flutter 9.x) should be reviewed before implementation.
- **Phase 3:** FTS migration requires a formal test plan with side-by-side query comparison against 100 representative search queries before any ILIKE code is removed. Existing pg_trgm indexes in migrations 015 and 022 should be audited to confirm they cover the hybrid fallback queries.

Phases with standard patterns (can proceed without research-phase):

- **Phase 1:** Report/block/moderation patterns are well-documented for App Store compliance. BullMQ + Google Cloud Vision pipeline has clear documentation. Schema design is fully specified in ARCHITECTURE.md with table definitions. Technical debt items are localized and identified.
- **Phase 2:** Satori + Sharp OG image generation is a documented pattern with clear architecture. The appinio_social_share integration is straightforward; the main risk is package staleness (address with early device testing).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (backend), MEDIUM (appinio_social_share) | All backend packages actively maintained with official documentation. appinio_social_share last published 19 months ago — pin version, test on real device early, prepare fork plan |
| Features | HIGH | Multi-source verification; App Store guidelines confirmed; competitor analysis cross-referenced (Untappd, Strava, Spotify, Bandsintown); existing codebase analyzed for dependencies |
| Architecture | HIGH | Based on direct codebase analysis of v1.0 (specific file and line references) plus official documentation for all new integrations |
| Pitfalls | HIGH | All 8 critical pitfalls verified against official sources (Apple guidelines, PostgreSQL docs, RevenueCat docs) and codebase analysis with specific file/line references |

**Overall confidence:** HIGH

### Gaps to Address

- **appinio_social_share staleness:** The package is 19 months old. Verify it builds against the current Flutter SDK before committing to it in Phase 2. Test Instagram Stories sharing on a real device (not emulator). The package's Instagram Stories implementation uses the `com.instagram.sharedSticker` intent (Android) and URL scheme (iOS) — these APIs haven't changed significantly, so staleness is lower risk than for fast-moving APIs, but early testing is mandatory.

- **Firebase Dynamic Links deprecation:** ARCHITECTURE.md mentions Firebase Dynamic Links for deep linking — this service was deprecated in August 2025. A replacement must be chosen before Phase 2 architecture is finalized. Cloudflare Workers + Cloudflare Pages is the cleanest fit given existing R2 usage. Branch.io is the commercial alternative. Custom Universal Links / App Links with a Cloudflare Pages fallback is the zero-dependency option.

- **GDPR jurisdiction:** The Wrapped consent architecture assumes GDPR applicability. If SoundCheck is US-only, CCPA requirements may differ in detail but the principle (consent before behavioral profiling) applies regardless. Confirm jurisdiction before Phase 4 Wrapped implementation.

- **Collaborative filtering data gate:** Research recommends deferring CF until >5K active users + >50K check-ins. The recommendation impression logging infrastructure (Phase 2/3) must be built so the data exists when the threshold is reached. Define the specific metrics that will trigger a CF implementation decision.

- **Railway horizontal scaling:** The WebSocket client map in memory (current `Map<string, Client>`) becomes a bottleneck at >5,000 concurrent connections. Not a v1.1 concern, but social sharing potentially drives a spike in concurrent users at popular events. Flag for v1.2 planning.

## Sources

### Primary (HIGH confidence)
- Apple App Store Review Guidelines — Guideline 1.2 Safety (direct documentation)
- Google Cloud Vision SafeSearch API documentation and pricing (official docs)
- PostgreSQL 12+ documentation — tsvector, GIN indexes, pg_trgm (official docs)
- RevenueCat Flutter documentation — purchases_flutter v9.12.3, purchases_ui_flutter v8.11.0 (official docs)
- Spotify Engineering blog — Wrapped architecture and load testing (2020, 2023)
- Strava Year in Sport pricing change — confirmed premium-only in 2025 (road.cc)
- SoundCheck v1.0 codebase analysis — FeedService (lines 98-99, 180-181), CheckinService (facade pattern), AdminController (moderation stub), DiscoveryService (recommendation engine), websocket.ts (Redis Pub/Sub), R2Service (presigned URLs), database migrations 015 and 022 (trigram indexes)

### Secondary (MEDIUM confidence)
- Vercel OG Image Generation blog — satori architecture and performance benchmarks
- RevenueCat State of Subscription Apps 2025 — 82% of non-gaming apps use subscription models
- appinio_social_share pub.dev page — v0.3.2, functionality confirmed but package age flagged
- VWO/UXCam onboarding conversion research — 77% 3-day abandonment rate (2026 guides)
- Evan Miller — Wilson score interval for unbiased ranking algorithms
- DEV.to — BullMQ + content moderation pipeline architecture reference
- Evan Miller — How Not to Sort by Average Rating (canonical Wilson bound reference)

### Tertiary (LOW confidence — needs validation during implementation)
- GDPR Article 22 applicability to Wrapped behavioral profiling — legal review recommended before Phase 4
- Cloudflare Pages as deep link landing page replacement for deprecated Firebase Dynamic Links — pattern is sound but untested in this specific stack configuration

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
