# Pitfalls Research: SoundCheck v1.1 Feature Additions

**Domain:** Adding social sharing, content moderation, verification, full-text search, collaborative filtering, year-in-review, and premium tier to existing Flutter + Node.js concert check-in app
**Researched:** 2026-02-27
**Confidence:** HIGH (codebase analysis + web research + official documentation cross-referenced)

---

## Critical Pitfalls

### Pitfall 1: App Store Rejection for Missing Moderation Before New UGC Surfaces

**What goes wrong:**
SoundCheck v1.0 has no content moderation at all -- no report button, no block user, no content filtering. The existing `AdminController.moderateContent` is a bare-bones admin-only endpoint (delete review, ban user, delete venue) with no user-facing reporting mechanism. Adding social sharing, share cards, or any new UGC surface (comments on shared content, RSVP messages) without first implementing Guideline 1.2 compliance will result in App Store rejection. Apple has been aggressively enforcing this since 2024, and apps that previously passed review can be rejected on update if new UGC surfaces are added without moderation.

**Why it happens:**
Teams prioritize the "fun" features (sharing, Wrapped) and treat moderation as a checkbox to add later. But Apple reviews the app holistically on each update submission -- they will notice the new UGC surfaces lack report/block/filter capabilities even if those surfaces were not the focus of the update.

**How to avoid:**
Build the moderation foundation BEFORE any feature that creates new UGC surfaces or makes existing UGC more visible. Minimum viable moderation for Apple Guideline 1.2:
1. Report button on every piece of user content (check-ins, comments, photos, share cards)
2. Block user functionality accessible from any user profile
3. Published content guidelines (in-app, not just buried in ToS)
4. Admin review queue for reported content
5. Contact information for support
6. Mechanism to filter objectionable material (at minimum: profanity filter on text, image scanning on uploads)

**Warning signs:**
- Features being built that create or display UGC without report/block affordances
- Image uploads going directly to R2 with no scanning pipeline
- No `reports` or `content_flags` table in the database schema
- Admin tools that only handle post-hoc moderation (current state)

**Phase to address:**
Phase 1 (Trust & Safety Foundation) -- this MUST ship before or alongside any social sharing features.

---

### Pitfall 2: Share Card Image Generation Killing the Single Railway Instance

**What goes wrong:**
Social share cards (Instagram Stories, X cards, TikTok) require server-side image generation -- turning a check-in into a visually appealing image with event name, venue, rating, badges, and user info. The naive approach uses Puppeteer/Chromium headless to render HTML to image, which consumes 200-500MB RAM per instance and takes 3-5 seconds per image. On a single Railway.app instance with no horizontal scaling, a burst of 20 users sharing after a popular show would exhaust memory and block the main Express event loop, taking down the entire API.

**Why it happens:**
Puppeteer is the most-documented approach for HTML-to-image. Developers reach for it because it is conceptually simple (render HTML, screenshot). They do not realize it is a memory hog until production load hits.

**How to avoid:**
Use Satori (from Vercel) for image generation. It converts JSX/HTML+CSS to SVG/PNG using WebAssembly, runs in ~50ms per image, and uses minimal memory. Alternatively, use a dedicated Cloudflare Worker for image generation (keeps it off the main Railway instance entirely). Pre-generate and cache share card images on check-in creation via BullMQ background job, not on-demand when the user taps "share."

Architecture:
1. Check-in created -> BullMQ job queued for share card generation
2. Worker generates image using Satori or Cloudflare Worker
3. Image stored in R2 with `share-cards/{checkinId}.png` key
4. Share endpoint returns the pre-generated R2 URL

**Warning signs:**
- Puppeteer or `node-html-to-image` in `package.json`
- Image generation happening in Express request handlers (synchronous)
- Memory usage climbing on Railway dashboard after share feature deployed
- 502 errors during concert peak hours

**Phase to address:**
Phase 2 (Viral Growth Engine) -- but architecture decision must be made in Phase 1 planning to avoid rework.

---

### Pitfall 3: Full-Text Search Migration Breaking Existing Search Behavior

**What goes wrong:**
The current codebase uses ILIKE extensively across 5 services: `BandService` (4 ILIKE queries), `VenueService` (2 ILIKE), `EventService` (4 ILIKE), `ReviewService` (1 ILIKE), plus demo seeding. Migrating to `tsvector` + GIN indexes changes search semantics in ways that silently break user expectations:
- ILIKE `%jazz%` matches "jazz-fusion" and "jazzercise." `tsvector` with `to_tsquery('jazz')` will NOT match partial words by default.
- ILIKE is case-insensitive by nature. `tsvector` depends on the text search configuration and dictionary -- if misconfigured, searches can become case-sensitive or miss word forms.
- Stop words get stripped: searching for "The Black Keys" via tsvector drops "The" which is usually fine, but searching for "The The" (an actual band) returns nothing.
- `COALESCE` is needed for nullable fields -- the current ILIKE queries on `description` fields do not use COALESCE, and `to_tsvector(NULL)` returns NULL, which would silently exclude records from search results.

**Why it happens:**
Developers treat the migration as a simple find-and-replace of ILIKE with tsvector. They test with common cases ("Taylor Swift") and miss edge cases. The app already has pg_trgm enabled and trigram indexes on `bands.name` and `events.event_name` from migrations 015 and 022 -- these provide fuzzy matching that tsvector does NOT. Removing ILIKE without keeping trigram support loses the fuzzy matching users already depend on.

**How to avoid:**
Use a hybrid approach:
1. Add `tsvector` generated columns and GIN indexes for ranked full-text search (new capability)
2. KEEP `pg_trgm` trigram indexes for fuzzy/typo-tolerant matching (existing capability)
3. Search flow: `tsvector` for ranked results UNION `pg_trgm` similarity for fuzzy fallback
4. Always specify the text search configuration explicitly: `to_tsvector('english', ...)` not `to_tsvector(...)`
5. Use `COALESCE` on all nullable fields: `to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, ''))`
6. Create a stored generated column per table for the combined tsvector
7. Write regression tests for edge cases: partial words, band names with stop words, non-English characters, empty descriptions

**Warning signs:**
- Search tests only cover exact word matches
- No explicit text search configuration in `to_tsvector` calls
- Trigram indexes being dropped as "no longer needed"
- Band search for "The National" returning zero results
- No COALESCE wrapping nullable columns

**Phase to address:**
Phase 3 (Technical Scale) -- must NOT be done hastily alongside feature work. Needs dedicated migration with rollback plan.

---

### Pitfall 4: Collaborative Filtering With Insufficient Data (Cold Start Catastrophe)

**What goes wrong:**
SoundCheck is a new app with a small user base. Collaborative filtering ("users who checked in to X also checked in to Y") requires a critical mass of interaction data to produce useful recommendations. With fewer than ~1,000 active users and ~10,000 check-ins, the collaborative filtering matrix is too sparse to generate meaningful signals. The system either returns nothing, returns obviously bad recommendations (the same 3 popular events for everyone), or worse -- appears to work in testing with seed data but fails spectacularly with real users who have 2-5 check-ins each.

**Why it happens:**
The team already has a simple recommendation engine in `DiscoveryService` using genre affinity + friend attendance + trending signals. This works because it uses content-based and social signals that do not require dense interaction matrices. The temptation is to "upgrade" to collaborative filtering because it sounds more sophisticated. But collaborative filtering is the wrong tool for an early-stage app.

**How to avoid:**
1. Do NOT build collaborative filtering in v1.1. The current genre-affinity + friend-attendance + trending approach in `DiscoveryService` is the right architecture for this stage.
2. Instead, invest in improving the existing content-based recommendations: expand `Band.genre` from single VARCHAR to array/many-to-many (already identified as tech debt), add artist similarity via MusicBrainz relationships, use venue proximity for discovery.
3. Build the DATA COLLECTION infrastructure now: log all recommendation impressions and click-throughs in an analytics table. This creates the training data for future collaborative filtering.
4. Set a threshold: implement collaborative filtering when you have >5,000 active users with >50,000 check-ins AND the content-based approach is measurably underperforming.

**Warning signs:**
- Recommendation engine being built without analyzing available data volume
- All users receiving identical "recommended" events
- Test suite using seed data with 50+ check-ins per user (unrealistic for real users)
- No A/B testing infrastructure to measure recommendation quality

**Phase to address:**
Phase 4 (Retention & Monetization) -- build the data collection, defer the algorithm. This is explicitly a "do less, do it right" recommendation.

---

### Pitfall 5: Premium Tier / IAP Without Server-Side Entitlement Validation

**What goes wrong:**
Flutter's `in_app_purchase` plugin handles client-side purchase flow but does NOT validate receipts server-side. Without server-side validation, users can: (a) modify the app's local storage to fake a purchase, (b) request a refund from Apple/Google after gaining premium access and keep using it, (c) share purchase tokens across accounts. Additionally, if a user logs out and another user logs in on the same device, the second user sees the first user's purchase as "already purchased" because Google stores the purchase token against the device/app, not the user account.

**Why it happens:**
The `in_app_purchase` Flutter plugin is designed as a thin wrapper. Developers build the purchase flow, see it working in sandbox testing, and ship. Server-side receipt validation is not included in most tutorials and requires integrating with Apple's App Store Server API and Google Play Developer API -- both have complex, poorly-documented flows for subscription state changes (renewals, cancellations, grace periods, billing retries).

**How to avoid:**
Use RevenueCat instead of raw `in_app_purchase`. RevenueCat provides:
1. Server-side receipt validation out of the box
2. Cross-platform subscription state management
3. Webhook integration for real-time subscription events (renewal, cancellation, refund)
4. User entitlement tracking that maps App Store/Play Store purchases to your user IDs
5. Analytics dashboard for subscription metrics

Backend integration:
1. RevenueCat webhook -> Express endpoint -> update `user_entitlements` table
2. Middleware that checks entitlement on premium endpoints: `requirePremium` similar to existing `requireAuth`
3. Never trust the client for entitlement status -- always verify server-side
4. Store entitlement state in PostgreSQL with Redis cache (same pattern as existing `cache.getOrSet`)

**Warning signs:**
- Purchase validation logic only on the client side
- No `user_entitlements` or `subscriptions` table in the database
- Premium features gated by a client-side boolean
- No webhook endpoint for subscription lifecycle events
- Multi-account purchase conflicts in QA testing

**Phase to address:**
Phase 4 (Monetization) -- but the design decision (RevenueCat vs DIY) should be made in Phase 1 planning.

---

### Pitfall 6: SoundCheck Wrapped Pre-Computing Personal Data Without Consent Architecture

**What goes wrong:**
"Year in Shows" requires aggregating a user's entire check-in history into a shareable recap: top genres, most-visited venues, total shows attended, "listening personality" classifications. This means pre-computing and storing user behavior summaries. If you pre-compute Wrapped data for ALL users (the obvious batch job approach), you are creating detailed behavioral profiles that: (a) fall under GDPR Article 22 (automated decision-making/profiling), (b) may require separate consent under GDPR Article 6, (c) create a data breach liability (a dump of Wrapped data reveals detailed user behavior patterns), and (d) must be included in GDPR data export (existing `DataExportService` would need updating).

**Why it happens:**
The Spotify Wrapped approach of batch pre-computation is the engineering gold standard. But Spotify has a dedicated privacy/legal team and handles this at massive scale with dedicated infrastructure. A small app team copies the architecture without the compliance infrastructure.

**How to avoid:**
1. Compute Wrapped data on-demand per user, not batch pre-computed for all users. With SoundCheck's current scale (hundreds, not millions of users), on-demand computation from the existing `checkins` + `checkin_band_ratings` tables is fast enough (sub-second with proper indexes).
2. Add a consent toggle: "Generate my Year in Shows" -- explicit opt-in, not automatic.
3. Cache the computed result (Redis, 24h TTL) after the user requests it -- do not persist it in the database permanently.
4. Update `DataExportService` to include any cached Wrapped data.
5. Share cards generated from Wrapped data should strip any PII before upload to R2 (use aggregates only: "47 shows," not "attended Event X on Date Y").

**Warning signs:**
- A BullMQ job computing Wrapped for all users on January 1st
- A `user_wrapped_data` table storing detailed behavioral profiles
- No consent mechanism before Wrapped generation
- Wrapped data not included in data export/deletion flows
- Share cards containing venue-specific check-in history

**Phase to address:**
Phase 4 (Year in Review) -- consent architecture should be part of the Trust & Safety foundation in Phase 1.

---

### Pitfall 7: Verification System Creating Permissions Complexity Explosion

**What goes wrong:**
Adding venue/artist "claimed profile" verification means introducing a new user role system into an app that currently has only two roles: `user` and `admin` (the `is_verified` boolean on `users` table is just a profile badge, not a permission level). Venue owners who "claim" a venue need to: edit venue details, see venue analytics, respond to reviews, but NOT edit other venues or see other venues' data. Artists who claim a band profile need similar scoped access. This requires row-level authorization -- "user X can edit venue Y because they claimed it" -- which is fundamentally different from the current role-based auth (`isAdmin` check in middleware).

If implemented as a series of `if` statements scattered across controllers, this becomes an unmaintainable mess within 2-3 features. The `AdminController.moderateContent` already shows the pattern: a switch statement that will grow linearly with each new moderated entity type.

**Why it happens:**
The first verified venue is simple: add a `claimed_by` column to `venues`, check it in the update endpoint. The second verified entity (bands) copies the pattern. By the third (event organizers?), you have duplicated authorization logic across 5+ controllers with subtle inconsistencies.

**How to avoid:**
Design a proper authorization model BEFORE implementing the first claimed profile:
1. Create a `user_roles` table: `{user_id, role, scope_type, scope_id}` -- e.g., `{user123, 'venue_owner', 'venues', 'venue456'}`
2. Build authorization middleware: `requirePermission('venues', 'edit', req.params.venueId)` that checks the roles table
3. Keep it simple -- three roles total: `user` (default), `venue_owner` (scoped to specific venues), `artist` (scoped to specific bands). Do NOT add `admin` to this table; keep admin as the existing `is_admin` flag.
4. Verification flow: venue owner submits claim -> admin approves -> role row created
5. All scoped-permission checks go through the authorization middleware, never inline

**Warning signs:**
- `claimed_by` columns appearing on multiple tables without a unified auth model
- Authorization checks like `if (venue.claimed_by === userId || user.isAdmin)` inline in controllers
- Different authorization patterns for venue owners vs artist accounts
- No audit trail for who approved verification claims

**Phase to address:**
Phase 3 (Platform Trust) -- the authorization model must be designed before Phase 4 (Artist/Venue Accounts) implements it.

---

### Pitfall 8: Social Sharing Deep Links Into a Mobile-Only App With No Web Presence

**What goes wrong:**
Social share cards on Instagram/X/TikTok generate clicks. Those clicks go to a URL. SoundCheck is mobile-only with no web frontend (explicitly out of scope for v1). When a non-user clicks a share card link, they land on... nothing. Or a generic app store page. The entire viral growth loop breaks because there is no web landing page to: (a) show the shared content (check-in, Wrapped card), (b) deep-link to the app if installed, (c) redirect to the app store if not installed.

**Why it happens:**
The team builds sharing and deep linking as separate concerns. They implement the share button, the card image generation, and the deep link scheme -- but forget that the MAJORITY of people clicking shared links do not have the app installed, and mobile deep links fail silently for non-users.

**How to avoid:**
Build a minimal web landing page (not a full web app -- this stays out of scope). Options:
1. **Cloudflare Pages** (free): A single-page site at `soundcheck.app/s/{checkinId}` that renders the share card image, shows basic event info, and has "Get SoundCheck" buttons for iOS/Android. Deploy as a static site with a Cloudflare Worker for dynamic OG meta tags.
2. **Smart links**: Use Firebase Dynamic Links (deprecated but still functional) or Branch.io to handle the web->app routing. These services provide the web fallback page automatically.
3. At minimum: configure Universal Links (iOS) and App Links (Android) for the domain, and ensure the fallback URL goes to a branded landing page, not a 404.

The landing page does NOT need to be a full web app. It is a glorified marketing page with dynamic OG tags and app store links.

**Warning signs:**
- Share cards generating URLs with custom scheme (`soundcheck://`) instead of HTTPS
- No web domain configured for Universal Links / App Links
- Click-through rate from social shares near 0% (people clicking but bouncing)
- No analytics on share link clicks vs app installs

**Phase to address:**
Phase 2 (Viral Growth) -- the landing page is a prerequisite for the share feature, not a follow-up.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline moderation checks (`if flagged`) instead of moderation middleware | Ships faster | Every new UGC endpoint needs manual flagging checks; inconsistent enforcement | Never -- build the middleware |
| Storing premium status as a boolean on the users table | Simple to query | No subscription history, no grace period handling, no refund tracking, no audit trail | Never -- use a separate entitlements table |
| Computing Wrapped stats with raw SQL in a controller | Quick to prototype | Unmaintainable SQL, no caching, no incremental computation, hits DB hard | Only in a prototype; must move to service + cache |
| Using ILIKE as "temporary" search while building tsvector | Users keep searching | Two search code paths to maintain; ILIKE performance degrades; "temporary" becomes permanent | Only if tsvector migration has a firm deadline within 2 sprints |
| Single admin user for moderation review | Works at low volume | Admin burnout, no escalation path, no moderation audit trail, single point of failure | Only for first 100 reported items; build queue immediately after |
| Adding `role` column to `users` table instead of separate `user_roles` table | Simpler schema | Cannot have multiple roles (venue owner + artist), cannot scope roles to specific entities | Never -- use a junction table from the start |
| Client-side only feature flags for premium | No backend changes needed | Users can toggle premium features by modifying app state; no server-side enforcement | Never for paid features |

## Integration Gotchas

Common mistakes when connecting to external services for v1.1 features.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| RevenueCat webhooks | Not validating webhook signatures, allowing forged subscription events | Validate the `X-RevenueCat-Signature` header using your webhook secret; reject unsigned requests |
| Instagram Stories sharing | Using custom URL schemes (`soundcheck://`) that Instagram's in-app browser cannot handle | Use Universal Links (HTTPS URLs) with proper `apple-app-site-association` and `assetlinks.json` |
| Cloudflare Workers (for image gen) | Hitting the 128MB memory limit or 50ms CPU time on free plan when generating images | Use the Workers Paid plan ($5/mo) with 30s CPU time; or generate on Railway and cache to R2 |
| Apple App Store Server API (receipts) | Calling the production endpoint during sandbox testing (or vice versa); getting `21007` errors | Use the correct environment URL; better yet, let RevenueCat abstract this entirely |
| Google Play Developer API (subscriptions) | Not handling Google's `linkedPurchaseToken` for subscription upgrades/downgrades | RevenueCat handles this; if DIY, always check and acknowledge linked purchase tokens |
| Firebase Dynamic Links | Using Firebase Dynamic Links for smart app links -- the service was deprecated in August 2025 | Use Branch.io, Appsflyer OneLink, or build a custom solution with Cloudflare Workers |
| MusicBrainz API (for artist similarity) | Rate limiting (1 req/sec for unauthenticated) causing collaborative filtering data collection to take days | Authenticate with MusicBrainz API for higher limits; cache aggressively; batch during off-peak hours |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Feed queries with `COUNT(DISTINCT)` on toasts/comments (current: lines 98-99, 180-181 in FeedService) | Feed load time >2s; database CPU spikes during popular events | Denormalize `toast_count` and `comment_count` on the `checkins` table; increment via trigger or application code | ~5,000 check-ins with active toast/comment activity |
| On-demand Wrapped computation hitting raw aggregate queries | Year-end traffic spike causes database CPU to max out as all users request Wrapped simultaneously | Pre-compute Wrapped data in a BullMQ batch job during low-traffic hours (3-4 AM); cache results in Redis | When >500 users request Wrapped within the same hour |
| Share card image generation in the Express request handler | Request timeouts; Railway instance OOM; blocking the event loop | Generate asynchronously via BullMQ; store in R2; return the pre-cached URL | First popular event with >50 concurrent shares |
| Full-text search without proper GIN indexes | Search queries take >500ms; sequential scan warnings in `EXPLAIN ANALYZE` | Add GIN indexes on generated `tsvector` columns; verify index usage with `EXPLAIN` | ~10,000 bands + events with ILIKE fallback still active |
| WebSocket client map in memory (current: `Map<string, Client>` in websocket.ts) | Memory grows linearly with connected users; single-instance bottleneck | This is fine for v1.1 scale (single Railway instance). Flag for v1.2+ when horizontal scaling is needed | >5,000 concurrent WebSocket connections |
| Audit log table growing unbounded (fire-and-forget INSERT on every action) | Table bloat; slow admin queries on audit_logs; backup size growing | Add a retention policy: archive logs >90 days to R2 or delete; add date-range partitioning | ~1M audit log rows (approximately 6 months with moderation + sharing actions) |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Share card URLs exposing check-in UUIDs without access control | Enumeration attack: brute-force UUIDs to find all check-ins, including private users | Use a separate short-code for share URLs (not the checkin UUID); rate-limit share endpoint; respect user privacy settings |
| Content moderation bypass via photo metadata | EXIF data in uploaded photos can contain GPS coordinates, device identifiers, and other PII even after the user set their profile to private | Strip EXIF data from all uploaded photos before storing in R2; use a Cloudflare Worker or `sharp` library |
| Presigned R2 URLs with long expiration used for share cards | URLs shared on social media remain valid indefinitely; no way to "unshare" content | Use short-lived presigned URLs (1 hour) for upload; use public R2 URLs for read (revocable by deleting the object) |
| Verification claim allowing impersonation | Malicious user claims to be a venue owner or artist to gain edit access to profiles | Require manual admin approval for all verification claims; do NOT auto-approve based on email domain; add an appeal process |
| Premium feature access checked only on client | Jailbroken/rooted devices can bypass client-side paywalls | All premium features must be gated server-side with entitlement checks on every API call |
| Report/flag system used for harassment (mass-reporting a user) | Legitimate users get auto-suspended by coordinated false reports | Never auto-action on reports; all reports go to admin review queue; track reporter reputation (frequent false reporters get deprioritized) |
| Wrapped share cards leaking behavioral data | A share card showing "You attended 47 shows at 12 venues in 2026" reveals location patterns | Allow users to customize what appears on their share card; default to aggregate stats only (no specific venues/dates) |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Report button buried in a submenu | Users cannot find how to report objectionable content; gives up and leaves app | Visible report icon on every content card (check-in, comment, photo); 2-tap maximum to submit a report |
| Mandatory moderation queue delay on all content | Check-in posts delayed by minutes while awaiting moderation; kills the "live at a show" feeling | Post-then-moderate: show content immediately but with an async moderation pipeline that removes violations retroactively |
| Verification badge confusion (Spotify learned this the hard way) | Users interpret a blue checkmark as "this venue/artist is endorsed by SoundCheck" | Use "Claimed" label (like Yelp) instead of a generic checkmark; make the tooltip clear: "This profile is managed by the venue/artist" |
| Premium paywall on core check-in flow | Users who paid nothing for the core experience feel betrayed when basic features get gated | NEVER gate check-ins, ratings, or feed access. Premium = cosmetic (custom share cards, profile themes), analytics (detailed stats), or convenience (ad-free, priority support) |
| Wrapped only available for a limited time | Users who miss the window feel excluded; time-limited availability creates support burden | Make Wrapped available year-round (compute on demand); add a notification when their Wrapped is ready, but do not expire it |
| Share flow requiring too many taps | Users abandon sharing if it requires >3 taps from the check-in | One-tap share: check-in confirmation screen has share buttons directly; auto-generated card with option to customize |
| Search results changing behavior after tsvector migration | Users accustomed to ILIKE partial matching ("jazz" finding "jazz-funk") confused when tsvector returns different results | Keep trigram fuzzy search as a fallback; show "Did you mean..." suggestions; log zero-result queries for analysis |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Content Moderation:** Often missing image scanning -- verify that photo uploads (check-in photos, share cards, profile images) pass through a moderation pipeline, not just text content
- [ ] **Content Moderation:** Often missing moderation for EXISTING content -- verify that the ~37 badges, existing check-in photos, and comments from v1.0 are retroactively scannable
- [ ] **Social Sharing:** Often missing web landing page -- verify that shared URLs resolve to a web page (not a deep link failure) for users without the app installed
- [ ] **Social Sharing:** Often missing OG meta tags -- verify that shared URLs render proper preview cards on Instagram, X, TikTok, and iMessage (each platform renders differently)
- [ ] **Full-Text Search:** Often missing search ranking -- verify that results are ordered by relevance (tsvector `ts_rank`), not just filtered. ILIKE returns unranked results; tsvector should improve this
- [ ] **Full-Text Search:** Often missing accent/diacritic handling -- verify searching "Beyonce" matches "Beyonce" (with or without accent on the e)
- [ ] **Premium/IAP:** Often missing subscription restoration -- verify that reinstalling the app or switching devices restores premium access via server-side entitlement check
- [ ] **Premium/IAP:** Often missing grace period handling -- verify that users in Apple/Google billing grace period (failed payment) retain premium access temporarily
- [ ] **Verification:** Often missing the "unclaim" flow -- verify that if a venue changes ownership, the old owner's access can be revoked and reassigned
- [ ] **Wrapped:** Often missing the "insufficient data" state -- verify that users with 1-2 check-ins get a graceful message, not a sad-looking empty Wrapped card
- [ ] **Collaborative Filtering:** Often missing offline/degraded behavior -- verify that if the recommendation engine fails, the app falls back to the existing content-based recommendations instead of showing nothing

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| App Store rejection for missing moderation | MEDIUM (1-2 weeks) | Implement minimum viable report/block; submit expedited review; use existing `AdminController` as starting point |
| Share card image gen crashing Railway | LOW (hours) | Immediately disable share card generation; serve a static fallback image; migrate to async BullMQ generation |
| Full-text search returning wrong results | MEDIUM (days) | Revert to ILIKE as fallback while fixing tsvector config; both search paths should exist during migration |
| Collaborative filtering serving bad recommendations | LOW (minutes) | Feature flag off; existing `DiscoveryService` recommendations are already the fallback |
| IAP purchases not validating server-side | HIGH (1-2 weeks + audit) | Retroactively validate all existing purchases; migrate to RevenueCat; audit for fraudulent premium access |
| Wrapped data breaching privacy | HIGH (weeks + legal) | Immediately purge pre-computed Wrapped data; switch to on-demand computation; notify affected users; engage legal for GDPR assessment |
| Verification impersonation | MEDIUM (days) | Revoke the fraudulent claim; notify the real venue/artist; add manual verification step; audit all existing claims |
| Deep links failing on social platforms | LOW (hours) | Verify `apple-app-site-association` and `assetlinks.json` are served correctly; test with each platform's link validator |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| App Store rejection (Guideline 1.2) | Phase 1: Trust & Safety Foundation | Submit test build to Apple; verify report/block/filter present on ALL UGC surfaces |
| Share card killing Railway | Phase 2: Viral Growth | Load test share card generation with 50 concurrent requests; verify memory stays under 256MB |
| Full-text search breaking results | Phase 3: Technical Scale | Side-by-side comparison test: ILIKE results vs tsvector results for 100 real search queries; zero regression |
| Collaborative filtering cold start | Phase 4: Retention | Measure data volume before implementing; decision gate: >5K users + >50K check-ins required |
| IAP without server validation | Phase 4: Monetization | Penetration test: attempt to access premium features with a forged receipt; must fail |
| Wrapped privacy issues | Phase 4: Year in Review | Privacy review: verify Wrapped data is computed on-demand, not stored; included in data export |
| Verification permissions explosion | Phase 3: Platform Trust | Code review: all authorization checks go through middleware, not inline conditionals |
| Deep links failing for non-users | Phase 2: Viral Growth | Test shared URLs on 3 platforms (Instagram, X, iMessage) from a device without SoundCheck installed |

## Existing Technical Debt That v1.1 Features Will Aggravate

These are pre-existing issues (documented in PROJECT.md) that become WORSE when v1.1 features are added.

| Existing Debt | v1.1 Feature That Makes It Worse | Impact | Recommended Fix Timing |
|---------------|----------------------------------|--------|------------------------|
| CheckinService 1,400 LOC (facade at ~30% extraction) | Social sharing adds share card generation to check-in flow | More responsibilities piled onto an already-large service | Phase 1: Complete facade extraction BEFORE adding share logic |
| Legacy `reviews` table coexisting with `checkin_band_ratings` | Full-text search must decide which table to index; Wrapped must decide which to aggregate | Confusion about source of truth for ratings; duplicate search results | Phase 1: Migrate or deprecate reviews table |
| Feed queries using `COUNT(DISTINCT)` with `LEFT JOIN` | Social sharing increases feed traffic (shared check-ins drive users back to feed) | Feed performance degrades faster with more traffic | Phase 1: Denormalize toast_count/comment_count |
| No staging environment | Content moderation pipeline, IAP integration, verification flow all need testing | Testing these features against production data risks data corruption or embarrassing moderation false positives | Phase 1: Create Railway staging environment |
| No load testing performed | Share card generation, Wrapped computation, full-text search all have scale-sensitive performance | Performance issues discovered in production instead of testing | Phase 1: Set up basic load testing with k6 or Artillery |
| In-memory rate limiter fallback | Content moderation report endpoint could be rate-limited inconsistently across instances (future) | Coordinated abuse could bypass per-instance rate limits | Phase 3: When horizontal scaling is implemented, switch to Redis-only rate limiting |
| 8 `as any` type casts in production code | Adding verification, moderation, premium types increases type surface area | More type safety issues as the codebase grows | Phase 1: Fix existing type casts; enforce `no-explicit-any` ESLint rule |
| Fire-and-forget audit logging | Moderation actions MUST be reliably logged for compliance; fire-and-forget can silently drop logs | Missing audit trail for moderation decisions could be a legal liability | Phase 1: Make moderation audit logs reliable (not fire-and-forget); keep fire-and-forget for non-critical logs |

## Sources

- [Apple App Store Review Guidelines - Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/)
- [How to Resolve App Store Guideline 1.2 - BuddyBoss](https://www.buddyboss.com/docs/app-store-guideline-1-2-safety-user-generated-content/)
- [App Store Review Guidelines 2025 Checklist](https://nextnative.dev/blog/app-store-review-guidelines)
- [PostgreSQL Full-Text Search Documentation](https://www.postgresql.org/docs/current/textsearch-intro.html)
- [PostgreSQL tsvector and tsquery](https://medium.com/geekculture/comprehend-tsvector-and-tsquery-in-postgres-for-full-text-search-1fd4323409fc)
- [Scaling Pub/Sub with WebSockets and Redis - Ably](https://ably.com/blog/scaling-pub-sub-with-websockets-and-redis)
- [Scaling WebSocket Services with Redis Pub/Sub - Leapcell](https://leapcell.io/blog/scaling-websocket-services-with-redis-pub-sub-in-node-js)
- [Spotify Unwrapped Engineering](https://engineering.atspotify.com/2020/02/spotify-unwrapped-how-we-brought-you-a-decade-of-data)
- [Spotify Wrapped 2024 Mistakes - TechRadar](https://www.techradar.com/audio/spotify/spotify-admits-it-made-mistakes-with-your-wrapped-2024-heres-what-could-change-this-year)
- [RevenueCat Flutter Plugin](https://github.com/RevenueCat/purchases-flutter)
- [Flutter In-App Purchases with RevenueCat 2025](https://medium.com/blocship/in-app-purchases-with-revenue-cat-flutter-2025-36adbef2c2d5)
- [Cloudflare Serverless Image Content Management](https://developers.cloudflare.com/reference-architecture/diagrams/serverless/serverless-image-content-management/)
- [Vercel OG Image Generation](https://vercel.com/blog/introducing-vercel-og-image-generation-fast-dynamic-social-card-images)
- [Cold Start Problem in Recommender Systems](https://www.freecodecamp.org/news/cold-start-problem-in-recommender-systems/)
- [Scaling a SaaS Application on Railway](https://blog.railway.com/p/scaling-a-saas-application)
- [Spotify Registered Artist Label Change](https://routenote.com/blog/spotify-replaces-verified-artist-badge-with-registered-artist-label/)
- [UGC Content Moderation Guide - WebPurify](https://www.webpurify.com/blog/content-moderation-definitive-guide/)
- [Content Moderation for UGC - Cleanspeak](https://cleanspeak.com/help-center-article/things-you-should-know-about-ugc-moderation)
- Codebase analysis: `FeedService.ts` (lines 98-99, 180-181), `CheckinService.ts` (facade pattern), `AdminController.ts` (moderation stub), `websocket.ts` (Redis Pub/Sub), `R2Service.ts` (presigned URLs), `DiscoveryService.ts` (recommendation engine), `StatsService.ts` (aggregation pattern), database migrations 015 and 022 (trigram indexes)

---
*Pitfalls research for: SoundCheck v1.1 feature additions*
*Researched: 2026-02-27*
