# Feature Research: v1.1 Growth Platform

**Domain:** Social concert check-in app -- v1.1 growth, trust, retention, and monetization features
**Researched:** 2026-02-27
**Confidence:** HIGH (multi-source research, verified against App Store guidelines, competitor analysis, and existing codebase)

**Scope:** This document covers ONLY the new features for v1.1. For v1.0 feature landscape (check-in, badges, feed, discovery, profiles), see git history of this file.

---

## Existing v1.0 Foundation (Context for Dependencies)

These are already shipped and working. v1.1 features build on top of them.

| Capability | Status | Relevant to v1.1 |
|------------|--------|-------------------|
| Event check-in with dual ratings, GPS auto-suggest | Shipped | Social sharing cards, RSVP, celebration screen |
| 37 badges across 7 categories, JSONB criteria | Shipped | Badge expansion, Wrapped stats |
| FOMO feed (friends/events/happening-now), WebSocket | Shipped | Trending feed, RSVP "friends going" |
| Concert cred profile, stats, genre breakdown | Shipped | Wrapped data source, premium analytics |
| Event discovery (nearby, trending, genre, search) | Shipped | Trending feed enhancement |
| User follow/unfollow, toasts, comments | Shipped | Social sharing attribution, moderation targets |
| Photo uploads via Cloudflare R2 presigned URLs | Shipped | Content moderation scanning pipeline |
| Firebase push notifications, BullMQ batching | Shipped | RSVP reminders, moderation alerts |
| Ticketmaster event pipeline with dedup | Shipped | RSVP links to real events |

---

## Feature Landscape

### Table Stakes (Users and App Store Expect These)

Features that are either App Store compliance requirements, user expectations for a social app at this stage, or critical gap-closers identified by the Board of Directors.

| # | Feature | Why Expected | Complexity | Dependencies | Notes |
|---|---------|--------------|------------|--------------|-------|
| T1 | **Report/flag mechanism for UGC** | **App Store Guideline 1.2 hard requirement.** Apps with UGC must have: (1) report mechanism, (2) block abusive users, (3) timely response process, (4) published contact info. Apple will reject updates without this. | LOW | Existing check-ins, comments, photos | Flag button on check-ins, comments, photos, and profiles. Reason picker (spam, harassment, inappropriate content, other). Persisted to `reports` table. Admin review queue. This is a launch blocker -- without it, Apple may reject v1.1 submissions. |
| T2 | **Content moderation pipeline (image scanning)** | Required complement to T1. Photo uploads exist but have zero moderation. One NSFW photo in the feed and the app loses trust. Google requires "adequate safeguards" for UGC apps. | MEDIUM | T1 (report system), existing R2 photo uploads | Two-tier approach: (1) Automated pre-publish scan via Google Cloud Vision SafeSearch API (first 1,000 units/month free, then ~$1.50/1,000) -- flags adult, violence, racy content. (2) Flagged items go to admin review queue alongside user reports. BullMQ job processes images async after upload. Do NOT block the check-in flow on scan results -- scan async, auto-hide if flagged, notify user. |
| T3 | **Block abusive users** | App Store Guideline 1.2 explicit requirement. Users must be able to block others from interacting with them. | LOW | Existing follow system, social graph | `user_blocks` table. Blocked users: hidden from feed, cannot comment/toast, cannot follow. Bilateral -- if A blocks B, neither sees the other. Simple but critical for compliance. |
| T4 | **Forgot password flow** | Currently stubbed in the codebase. Every user expects this. Broken password recovery = locked-out users = churn. Basic hygiene. | LOW | Existing auth system, email service | Email-based reset token with expiry. Standard flow: request reset, email link/code, set new password. Use existing Firebase or add SendGrid/Resend for transactional email. |
| T5 | **Onboarding flow (first-time users)** | 77% of users abandon apps within 3 days. Onboarding is the single biggest lever for day-1 retention. SoundCheck currently drops users into an empty feed with no guidance. | MEDIUM | None (standalone) | 3-screen carousel: (1) "Check in at shows" value prop, (2) "Earn badges and build your concert resume" gamification hook, (3) "See what friends are at" social proof. Then: genre preference picker (seeds recommendations, solves cold-start), optional friend-finding (contacts import or social graph). Skip button always visible. Track completion rate. |
| T6 | **Social sharing cards (external)** | Board gap #2: "No viral loops outside the app." Without shareable content, growth is purely organic word-of-mouth. Every social app needs share-to-external-platform capability. Instagram Stories, X, and TikTok are the three that matter for the concert demographic. | MEDIUM | Existing check-ins, existing badge system | Two components: (1) **Server-side card image generation** via Satori (JSX to SVG) + Sharp (SVG to PNG). Template: check-in card with band name, venue, rating stars, user avatar, SoundCheck branding. Standard OG dimensions: 1200x630 for link previews, 1080x1920 for Instagram Stories. (2) **Mobile share sheet** via `appinio_social_share` Flutter package -- supports Instagram Stories, TikTok, X, generic share. Share triggers: post-check-in celebration screen, profile stats, badge earned, Wrapped cards. |
| T7 | **Post-check-in celebration screen with share CTA** | The check-in moment is the highest-engagement point. Currently, checking in just... ends. No dopamine hit, no share prompt, no viral loop. Untappd shows badge progress and a share prompt after every check-in. | LOW | T6 (sharing cards), existing check-in flow | Full-screen celebration: confetti/animation, badges earned (if any), rating summary, prominent "Share to Stories" button. This is where the viral loop starts -- user checks in, gets excited, shares to Instagram, friend sees it, downloads app. Without this screen, sharing is buried and never happens. |

**Total table stakes for v1.1:** 7 features. All are either compliance requirements (T1-T4), retention fundamentals (T5), or growth infrastructure (T6-T7).

---

### Differentiators (Competitive Advantage)

Features that no concert app does well (or at all) and that create network effects, retention loops, or monetization potential.

| # | Feature | Value Proposition | Complexity | Dependencies | Notes |
|---|---------|-------------------|------------|--------------|-------|
| D1 | **Event RSVP / "I'm Going"** | Pre-show social loop. Currently, SoundCheck only engages users AT the show. RSVP creates engagement BEFORE the show: "3 friends are going to Radiohead Friday." Facebook Events proved this pattern -- the "going/interested" signal is one of the strongest social proof mechanisms for event attendance. Creates a funnel: RSVP -> reminder notification -> check-in. | MEDIUM | Existing events, existing follow system | Three states: Going / Interested / Not tracked (default). Show "N friends going" on event cards. Push notification day-of: "The show is tonight! Your friends Alex and Jordan are going." RSVP count feeds into trending algorithm. Unlike Facebook Events, keep it lightweight -- no event pages with walls/discussions. Just an intent signal. Database: `event_rsvps(user_id, event_id, status, created_at)` with unique constraint. |
| D2 | **Trending shows feed (between-show retention)** | Board gap #1: "No between-show retention mechanism." Users currently have no reason to open the app when they're not at a show. A "trending this week near you" feed gives users content between concerts. Bandsintown does this for discovery; SoundCheck can add social proof ("12 people RSVPd, including 3 friends"). | MEDIUM | D1 (RSVP data), existing discovery engine | Algorithm: weighted score combining RSVP count, check-in velocity (for active shows), friend attendance signals, recency, and proximity. Use Wilson lower bound for statistical confidence when sample sizes are small. Surface as a new tab or section in the existing discovery flow. Time-windowed: "This week" and "This weekend" are the useful frames for concert decisions. Push digest: weekly "Shows trending near you" notification. |
| D3 | **Venue/artist verification system** | Board gap #4: "No trust infrastructure." Verified badges build platform credibility. Spotify requires zero barrier for artist verification (claim profile, link socials). SoundCheck should follow a similar lightweight model -- verification establishes identity, not exclusivity. Verified venues/artists get a badge, can respond to ratings, and eventually access analytics. | MEDIUM | Existing band/venue entities | **Claim flow:** Artist or venue representative submits claim request with: official website URL, social media links, and proof of association (email from official domain, or link to official social profile that links back). **Verification:** Admin reviews claim. Lightweight -- no ID scanning needed at this scale. Store as `verified_claims(entity_type, entity_id, claimant_user_id, status, evidence_urls, reviewed_at)`. Verified entities get a checkmark badge on their profile. This is table stakes for the B2B pipeline -- you cannot build venue/artist accounts (D4) without verification first. |
| D4 | **Artist/venue claimed profiles** | Board gap #3: "No artist/venue stakeholders on the platform." Claimed profiles turn artists and venues from passive data into active participants. Spotify for Artists, Yelp for Business, Untappd for Business all follow this pattern. At SoundCheck's stage, keep it read-heavy: verified owners can see aggregate ratings, respond to reviews, and update their profile (bio, photos, links). Full dashboards come later. | HIGH | D3 (verification system) | Role-based access: `claimed_profiles(user_id, entity_type, entity_id, role, granted_at)`. Claimed profile owners get: view aggregate ratings, respond to check-in comments (as the venue/artist), update bio/description/photos, see basic analytics (check-in count over time, average rating trend). Do NOT build a full dashboard yet -- that is a separate product. This phase is "claim and see your data." Revenue potential: premium analytics tier for venues/artists later. |
| D5 | **SoundCheck Wrapped (Year in Shows)** | Board gap #5 (partial): monetization foundation + massive viral growth potential. Spotify Wrapped generates millions of organic shares annually. Strava moved Year in Sport behind their paywall in 2025 -- proving it has premium-tier value. No concert app does this. Concerts Wrapped (concertswrapped.com) exists but requires manual Last.fm data entry -- SoundCheck has the check-in data natively. | HIGH | Existing check-in data, T6 (sharing cards) | **Data pipeline:** Aggregate per-user stats for the calendar year: total shows, unique bands, unique venues, top genre, top venue, top-rated show, most-seen artist, cities visited, longest streak, total friends met at shows. Run as a scheduled BullMQ job in late November to pre-compute. Store results in `wrapped_data(user_id, year, stats_json, generated_at)`. **Presentation:** Instagram Stories-style swipeable card sequence (5-8 cards). Each card is a stat with bold typography and concert imagery. Generate shareable card images server-side (Satori + Sharp, same pipeline as T6). **Timing:** Available December 1 through January 31. Marketing push in early December. **Premium angle:** Basic Wrapped free (total shows, top genre, top venue). Detailed Wrapped premium (full card deck, concert map, deep stats, comparison to last year). Strava charges for this -- validates the model. |
| D6 | **Premium tier ("SoundCheck Pro") design** | Board gap #5: "No monetization design." RevenueCat State of Subscription Apps 2025: 82% of non-gaming apps now use subscription models. Untappd Insiders is $5.99/month. Strava is $11.99/month. The key is gating enhancement, not core functionality. | HIGH | RevenueCat Flutter SDK integration | **Price:** $4.99/month or $39.99/year (33% annual discount). **Gate these features (enhancement, not core):** (1) Detailed Wrapped experience (basic free, premium gets full deck), (2) Advanced profile analytics (rating trends over time, genre evolution, attendance heatmap), (3) Retroactive check-in (currently out of scope -- unlock for Pro like Untappd Insiders), (4) Custom badge showcase layout, (5) Ad-free experience (if ads are ever added), (6) Early access to new features. **Never gate:** Check-in, ratings, basic feed, basic badges, basic profile, following, sharing. The free tier must be a complete app. Use RevenueCat for subscription management -- handles receipt validation, cross-platform entitlements, analytics, and Apple/Google billing integration in one SDK. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem obvious for v1.1 but create more problems than they solve.

| # | Feature | Why Requested | Why Problematic | Alternative |
|---|---------|---------------|-----------------|-------------|
| A1 | **AI-powered content moderation (custom ML model)** | "We should use AI to auto-moderate everything." | At SoundCheck's scale (pre-launch, hundreds of users), training custom ML models is massive overkill. Google Cloud Vision SafeSearch is a pre-trained API that handles image moderation for pennies. Custom NLP for text moderation adds complexity without proportional value when your text content is star ratings and short comments. | Use Google Cloud Vision SafeSearch for images. Simple keyword blocklist + regex for text. Human admin review queue for flagged items. Revisit custom ML only if you hit 100K+ daily uploads. |
| A2 | **Full venue/artist dashboard (B2B product)** | "Venues should see heatmaps, download CSV exports, manage their events." | A B2B dashboard is a separate product with separate users, separate UX needs, and separate sales motion. Building it alongside the consumer app fragments focus. Untappd for Business launched years after Untappd consumer. | Claimed profiles with basic read-only analytics (D4). Full B2B dashboard is v2.0+ and likely a separate web app. |
| A3 | **Real-time moderation (block before publish)** | "No inappropriate content should ever appear in the feed." | Synchronous moderation on the check-in flow adds latency to the core action (target: <10 sec). Cloud Vision API calls take 500ms-2s. Blocking the UX for moderation harms the check-in experience. False positives would block legitimate concert photos. | Async moderation: publish immediately, scan in background, auto-hide if flagged within seconds. Users see content briefly before removal in worst case. Acceptable tradeoff for a concert photo app (low NSFW risk compared to dating apps). |
| A4 | **Instagram/TikTok deep link sharing (in-app content viewing)** | "When someone clicks a shared card on Instagram, it should open the check-in in SoundCheck." | Deep linking from Instagram Stories to apps requires Universal Links (iOS) and App Links (Android) infrastructure, a web landing page for fallback, and App Store association files. Significant implementation cost for an app with no web presence. Instagram also strips most deep links from Stories. | Phase 1: Share card is a static image with QR code or "SoundCheck" branding. The viral loop is brand awareness, not click-through. Phase 2: Add a minimal web landing page at soundcheck.app/checkin/[id] that shows the card and a "Download SoundCheck" CTA. Deep linking comes after web presence exists. |
| A5 | **Tiered verification (blue check vs. gold check)** | "We need different verification levels like Twitter/Meta." | Multiple verification tiers add confusion, create a class system among users, and require different review processes. At SoundCheck's scale, there are two types of entities: regular users and verified venue/artist accounts. That binary distinction is sufficient. | Single verification badge for claimed venue/artist profiles. All verified accounts get the same visual treatment. Revisit tiered verification only if you have thousands of verified accounts with genuinely different needs. |
| A6 | **Social login for onboarding friend-finding** | "Import your Instagram/Facebook friends to find who's on SoundCheck." | Facebook deprecated the Friends API years ago. Instagram Graph API does not expose follower lists to third-party apps. The only reliable friend-finding mechanisms are: contacts import (phone numbers/emails) or manual search/invite. Building "social graph import" is a dead end. | Contacts-based friend suggestions (with permission prompt). "Invite friends" via share link. Manual username search. Show "people who attended the same shows as you" as organic friend suggestions. |
| A7 | **Complex RSVP states (Going / Interested / Maybe / Waitlist)** | "Facebook Events has multiple response options." | More states = more UI complexity, more ambiguous data, and harder-to-interpret social proof. "3 friends going" is clear. "2 going, 1 interested, 1 maybe" is noise. Untappd doesn't have RSVP at all. Keep it simpler than Facebook, not more complex. | Two states only: Going (strong intent signal) and default (no response). Drop "Interested" -- it's a weak signal that adds noise. If a user wants to track without committing, that's what the existing Wishlist feature is for. |
| A8 | **Wrapped for all time periods (monthly, quarterly)** | "Why wait for December? Give users monthly recaps." | Dilutes the specialness of the annual Wrapped. Spotify only does annual. Strava added monthly summaries and gated them behind premium -- users complained they were annoying. The annual event creates anticipation and social sharing momentum. Monthly recaps feel like spam. | Annual Wrapped only. For ongoing stats, the profile page already shows lifetime stats and genre breakdowns. Premium could add "this month in concerts" as a lightweight summary (not a full Wrapped experience). |

---

## Feature Dependencies

```
TRUST & SAFETY (App Store compliance -- must ship first)
  |
  +---> Report/flag mechanism (T1)
  |       |
  |       +---> Content moderation pipeline (T2) -- processes reports + auto-scans
  |       +---> Admin review queue (shared by T1 + T2)
  |
  +---> Block users (T3) -- independent of T1, both required for compliance
  |
  +---> Forgot password (T4) -- independent, basic hygiene

VIRAL GROWTH ENGINE (depends on trust being in place)
  |
  +---> Social sharing cards -- server-side generation (T6)
  |       |
  |       +---> Post-check-in celebration screen (T7) -- primary share trigger
  |       +---> Badge earned share (uses same card pipeline)
  |       +---> Wrapped shareable cards (D5) -- uses same generation pipeline
  |
  +---> Event RSVP (D1)
  |       |
  |       +---> Trending shows feed (D2) -- RSVP count is a ranking signal
  |       +---> "Friends going" social proof on event cards
  |       +---> Day-of reminder push notifications

ONBOARDING (standalone, no hard dependencies)
  |
  +---> Onboarding carousel (T5)
  |       |
  |       +---> Genre preference picker -- seeds recommendations + Wrapped
  |       +---> Friend finding -- seeds social graph

PLATFORM TRUST (depends on trust & safety)
  |
  +---> Venue/artist verification (D3)
  |       |
  |       +---> Claimed profiles (D4) -- requires verification first
  |               |
  |               +---> Premium analytics for venues (future, D6 adjacent)

RETENTION & MONETIZATION (depends on sharing cards + data history)
  |
  +---> SoundCheck Wrapped (D5) -- depends on T6 for shareable cards
  |       |
  |       +---> Premium detailed Wrapped (D6 gates this)
  |
  +---> Premium tier design (D6) -- depends on RevenueCat integration
          |
          +---> Requires clear free/premium feature boundary
          +---> Requires enough premium-worthy features to justify price
```

### Dependency Notes

- **T1/T2/T3 (trust & safety) must ship before anything else:** Apple will reject app updates if UGC apps lack report/block mechanisms. This is a hard gate on all other v1.1 features reaching the App Store.
- **T6 (sharing cards) unlocks the entire viral growth engine:** Every share-related feature (T7, D5 sharing) depends on the ability to generate card images. Build the image generation pipeline once, reuse across all share surfaces.
- **D1 (RSVP) feeds D2 (trending):** RSVP count is the primary signal for trending between shows. Without RSVP data, the trending algorithm falls back to check-in count only (which only works during/after shows, not before).
- **D3 (verification) gates D4 (claimed profiles):** Cannot give venue/artist access to analytics and review responses without first verifying identity. Verification is the trust boundary.
- **D5 (Wrapped) has a data requirement:** Users need enough check-in data to make Wrapped interesting. The feature should launch December 2026 at earliest, meaning users need most of 2026 to accumulate data. But the data model and aggregation pipeline should be designed now.
- **D6 (premium tier) needs D5 (Wrapped):** Strava validated that year-in-review is premium-worthy. Without Wrapped or advanced analytics, the premium tier has weak value props. Design the premium tier now, but launch gating after Wrapped exists.

---

## MVP Definition (v1.1 Phases)

### Phase 1: Launch Blockers + Trust (Ship First)

These must ship before any new App Store submission. Without them, Apple may reject.

- [x] **Report/flag mechanism (T1)** -- App Store Guideline 1.2 compliance
- [x] **Content moderation pipeline (T2)** -- Auto-scan photos, admin review queue
- [x] **Block users (T3)** -- Guideline 1.2 compliance
- [x] **Forgot password (T4)** -- Basic auth hygiene, currently stubbed

### Phase 2: Viral Growth + Onboarding (Ship Next)

The features that create growth loops and first-time user conversion.

- [ ] **Onboarding flow (T5)** -- First-time user conversion
- [ ] **Social sharing cards (T6)** -- Image generation pipeline, share sheet
- [ ] **Celebration screen (T7)** -- Post-check-in share CTA
- [ ] **Event RSVP (D1)** -- Pre-show engagement loop

### Phase 3: Retention + Platform Trust

Between-show engagement and platform credibility.

- [ ] **Trending shows feed (D2)** -- Between-show retention
- [ ] **Venue/artist verification (D3)** -- Trust infrastructure
- [ ] **Claimed profiles (D4)** -- Venue/artist stakeholders on platform

### Phase 4: Monetization + Wrapped

Revenue infrastructure and the signature retention feature.

- [ ] **SoundCheck Wrapped (D5)** -- Annual recap, massive share driver
- [ ] **Premium tier (D6)** -- RevenueCat integration, subscription gating

---

## Feature Prioritization Matrix

| Feature | User Value | Business Value | Implementation Cost | Priority | Phase |
|---------|------------|----------------|---------------------|----------|-------|
| Report/flag (T1) | MEDIUM | CRITICAL (compliance) | LOW | P0 | 1 |
| Content moderation (T2) | MEDIUM | CRITICAL (compliance) | MEDIUM | P0 | 1 |
| Block users (T3) | MEDIUM | CRITICAL (compliance) | LOW | P0 | 1 |
| Forgot password (T4) | HIGH | HIGH (churn prevention) | LOW | P0 | 1 |
| Onboarding flow (T5) | HIGH | HIGH (retention) | MEDIUM | P1 | 2 |
| Social sharing cards (T6) | HIGH | CRITICAL (growth) | MEDIUM | P1 | 2 |
| Celebration screen (T7) | HIGH | HIGH (share trigger) | LOW | P1 | 2 |
| Event RSVP (D1) | HIGH | HIGH (engagement) | MEDIUM | P1 | 2 |
| Trending feed (D2) | MEDIUM | HIGH (retention) | MEDIUM | P2 | 3 |
| Verification (D3) | LOW (users) | HIGH (platform trust) | MEDIUM | P2 | 3 |
| Claimed profiles (D4) | LOW (users) | HIGH (B2B foundation) | HIGH | P2 | 3 |
| Wrapped (D5) | CRITICAL | CRITICAL (viral + premium) | HIGH | P2 | 4 |
| Premium tier (D6) | MEDIUM | CRITICAL (revenue) | HIGH | P2 | 4 |

**Priority key:**
- P0: Must ship before any App Store submission (compliance + blockers)
- P1: Ship immediately after P0 (growth engine)
- P2: Ship within v1.1 timeframe (retention + monetization)

---

## Competitor Feature Analysis (v1.1 Features Only)

| Feature | Untappd | Bandsintown | Strava | Spotify | Our Approach |
|---------|---------|-------------|--------|---------|--------------|
| **Social sharing** | Basic share button, no card images | Artist update shares | Activity sharing with custom card images | Wrapped cards (Stories-optimized) | Server-side card generation (Satori + Sharp). Stories-optimized (1080x1920). Post-check-in celebration screen as primary trigger. |
| **Content moderation** | User reports + admin review | Platform-managed (artist content only) | User reports + automated detection | Automated + human review | Two-tier: Google Cloud Vision SafeSearch auto-scan + user reports to admin queue. Async -- never block the check-in. |
| **Verification** | Verified venues via Untappd for Business | Verified artists (automated from label data) | Verified athletes (for pros) | Spotify for Artists (zero-barrier claim) | Lightweight claim flow: submit proof, admin review. Follow Spotify's low-barrier model -- verify identity, not prestige. |
| **RSVP / "Going"** | None | "Track" artist (not event-level) | None (not event-based) | None | Two states: Going / default. Show "N friends going" for social proof. Day-of reminder push. Feeds trending algorithm. |
| **Trending feed** | "Popular" beers (high check-in count) | "Trending" artists (social signals) | "Local Legends" segments | "Popular" playlists | Wilson lower bound scoring: RSVP count + check-in velocity + friend signals + proximity. "This weekend near you" as primary frame. |
| **Onboarding** | Genre preference picker (beer styles) | Artist import from Spotify | Activity type selection | Genre/artist seed selection | 3-screen carousel + genre picker + friend finding. Track completion rate. A/B test later. |
| **Year-in-review** | Recappd (annual, free) | None | Year in Sport (annual, **premium since 2025**) | Wrapped (annual, free, massive viral event) | Hybrid: Basic Wrapped free (3-4 cards), detailed Wrapped premium (8+ cards, concert map, deep stats). Launch Dec 2026. |
| **Premium tier** | Insiders ($5.99/mo): 0.25 ratings, retroactive, tag 25 friends, stats | Free (ad-supported) | Premium ($11.99/mo): routes, training, Year in Sport | Premium ($10.99/mo): ad-free, offline, quality | SoundCheck Pro ($4.99/mo): detailed Wrapped, advanced analytics, retroactive check-in, custom badge showcase. Lower price -- concert frequency is lower than daily-use apps. |

---

## Implementation Complexity Estimates

| Feature | Backend Work | Mobile Work | New Infrastructure | Total Estimate |
|---------|-------------|-------------|-------------------|----------------|
| Report/flag (T1) | `reports` table, CRUD routes, admin query | Report button UI, reason picker | None | 2-3 days |
| Content moderation (T2) | BullMQ job for Cloud Vision API, auto-hide logic | None (backend only) | Google Cloud Vision API key | 3-4 days |
| Block users (T3) | `user_blocks` table, filter queries | Block button, confirmation | None | 2-3 days |
| Forgot password (T4) | Reset token generation, email sending | Reset flow screens | Transactional email service (Resend/SendGrid) | 2-3 days |
| Onboarding (T5) | Genre preference endpoint (may exist) | Carousel screens, genre picker, friend finder | None | 3-4 days |
| Sharing cards (T6) | Satori + Sharp image generation endpoint | `appinio_social_share` integration, share sheet | Satori/Sharp npm packages | 5-7 days |
| Celebration screen (T7) | Badge/stats response after check-in (may exist) | Full-screen celebration UI, animation | None | 2-3 days |
| RSVP (D1) | `event_rsvps` table, CRUD, friend-going queries | RSVP button, "friends going" badge on cards | None | 3-5 days |
| Trending feed (D2) | Scoring algorithm, trending query endpoint | New feed tab or section | None (uses existing PostgreSQL) | 4-6 days |
| Verification (D3) | `verified_claims` table, claim flow, admin review | Claim request form, verification badge display | None | 4-5 days |
| Claimed profiles (D4) | Role-based access, analytics queries, response API | Claimed profile UI, analytics views, response UI | None | 7-10 days |
| Wrapped (D5) | Aggregation pipeline (BullMQ), stats computation, card generation | Swipeable card sequence UI (Stories-style) | Pre-computation job scheduling | 10-14 days |
| Premium (D6) | Entitlement checking middleware, feature gates | RevenueCat SDK, paywall UI, gated feature checks | RevenueCat account + configuration | 7-10 days |

**Total estimated engineering effort:** ~55-75 days of work across all features.

---

## Sources

### App Store Compliance
- [Apple App Store Review Guidelines -- Guideline 1.2 Safety](https://developer.apple.com/app-store/review/guidelines/) -- HIGH confidence
- [How to Resolve App Store Guideline 1.2](https://www.buddyboss.com/docs/app-store-guideline-1-2-safety-user-generated-content/) -- MEDIUM confidence
- [TermsFeed: Apple UGC Requirements](https://www.termsfeed.com/videos/apple-app-store-comply-ugc-requirements/) -- MEDIUM confidence

### Content Moderation
- [Google Cloud Vision SafeSearch Detection](https://docs.cloud.google.com/vision/docs/detecting-safe-search) -- HIGH confidence
- [Google Cloud Vision Pricing](https://cloud.google.com/vision/pricing) -- HIGH confidence
- [ACM: Scaling Content Moderation for Massive Datasets](https://cacm.acm.org/blogcacm/the-ugc-overload-scaling-content-moderation-for-massive-datasets/) -- MEDIUM confidence
- [Best Automated Content Moderation Tools 2026](https://www.cometchat.com/blog/automated-content-moderation-tools) -- MEDIUM confidence

### Social Sharing
- [Vercel OG Image Generation](https://vercel.com/blog/introducing-vercel-og-image-generation-fast-dynamic-social-card-images) -- HIGH confidence
- [Satori Dynamic OG Images](https://dev.to/woovi/how-to-generate-dynamic-og-opengraph-images-with-satori-and-react-1bhb) -- MEDIUM confidence
- [6 Pitfalls of Satori + resvg-wasm on Cloudflare Workers](https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle) -- MEDIUM confidence
- [appinio_social_share Flutter Package](https://pub.dev/packages/appinio_social_share) -- HIGH confidence
- [Social Media Image Sizes 2026](https://www.eclincher.com/articles/ultimate-social-media-image-size-guide-2026) -- MEDIUM confidence

### Onboarding
- [VWO Mobile App Onboarding Guide 2026](https://vwo.com/blog/mobile-app-onboarding-guide/) -- MEDIUM confidence
- [UXCam Onboarding Flow Examples 2026](https://uxcam.com/blog/10-apps-with-great-user-onboarding/) -- MEDIUM confidence
- [Adapty: How to Build Onboarding Flows That Convert](https://adapty.io/blog/how-to-build-app-onboarding-flows-that-convert/) -- MEDIUM confidence

### Wrapped / Year-in-Review
- [Spotify Engineering: Spotify Unwrapped](https://engineering.atspotify.com/2020/02/spotify-unwrapped-how-we-brought-you-a-decade-of-data/) -- HIGH confidence
- [Spotify Engineering: Load Testing for Wrapped](https://engineering.atspotify.com/2023/03/load-testing-for-2022-wrapped/) -- HIGH confidence
- [How Spotify Wrapped Works (Hightouch)](https://hightouch.com/blog/how-spotify-wrapped-works) -- MEDIUM confidence
- [Strava Year in Sport](https://support.strava.com/hc/en-us/articles/22067973274509-Your-Year-in-Sport) -- HIGH confidence
- [Strava Year in Sport Now Premium Only](https://road.cc/content/news/strava-year-sport-now-only-subscribers-317425) -- HIGH confidence

### Premium Tier / Subscriptions
- [RevenueCat Flutter SDK](https://www.revenuecat.com/docs/getting-started/installation/flutter) -- HIGH confidence
- [RevenueCat State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/) -- HIGH confidence
- [Adapty Freemium Monetization Strategies](https://adapty.io/blog/freemium-app-monetization-strategies/) -- MEDIUM confidence
- [Untappd Insiders](https://insiders.untappd.com/) -- HIGH confidence

### Trending / Feed Algorithms
- [Evan Miller: How Not to Sort by Average Rating](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html) -- HIGH confidence
- [Wilson Score Interval](https://insightful-data-lab.com/2025/08/20/wilson-score-interval/) -- MEDIUM confidence

### Verification
- [Spotify Artist Verification](https://playlistpush.com/blog/how-to-get-verified-on-spotify/) -- MEDIUM confidence
- [Untappd Verified Venues](https://help.untappd.com/hc/en-us/articles/360033786032-How-Do-I-Subscribe-to-a-Verified-Venue-on-Untappd) -- MEDIUM confidence

### Competitor Analysis
- [Untappd for Business Guide](https://www.beermenus.com/blog/260-untappd-for-business) -- MEDIUM confidence
- [Meta Testing Premium Subscriptions (TechCrunch, Jan 2026)](https://techcrunch.com/2026/01/26/meta-to-test-premium-subscriptions-on-instagram-facebook-and-whatsapp/) -- HIGH confidence

---

*Feature research for: SoundCheck v1.1 Growth Platform*
*Researched: 2026-02-27*
