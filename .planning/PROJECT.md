# SoundCheck

## What This Is

SoundCheck is the "Untappd of live music" — a social concert check-in app for concertgoers. Users check in at shows, rate both the band's performance and the venue experience, earn badges for their concert habits, and see what shows their friends are attending in real-time. It turns going to concerts into a social, gamified experience with a persistent concert resume that showcases your live music identity.

## Core Value

The live check-in moment: a user at a show can check in fast, rate what they're experiencing, and share it with friends — and that single action feeds discovery, social proof, gamification, and their concert identity.

## Requirements

### Validated

- ✓ User registration with email/password — existing
- ✓ Social authentication (Google, Apple Sign-In) — existing
- ✓ JWT-based session management with secure token storage — existing
- ✓ User profiles with bio, avatar, location — existing
- ✓ Venue search with filtering (location, rating, type) — existing
- ✓ Band discovery and metadata — existing
- ✓ User follow/unfollow — existing
- ✓ Toast reactions and comments on check-ins — existing
- ✓ Wishlist functionality — existing
- ✓ Foursquare venue data integration — existing
- ✓ MusicBrainz artist data integration — existing
- ✓ SetlistFM performance history integration — existing
- ✓ Rate limiting and security middleware — existing
- ✓ Structured logging and error tracking (Sentry) — existing
- ✓ Events as first-class entities with multi-band lineups — v1.0
- ✓ Event check-in model with per-set band ratings — v1.0
- ✓ Dual rating system (band performance + venue experience) — v1.0
- ✓ Ticketmaster event pipeline with dedup and fuzzy band matching — v1.0
- ✓ User-created events with auto-merge on API match — v1.0
- ✓ Quick check-in flow (<10 sec from app open) with GPS auto-suggest — v1.0
- ✓ Location verification (non-blocking, configurable radius) — v1.0
- ✓ Check-in photo uploads via Cloudflare R2 presigned URLs — v1.0
- ✓ 37 badges across 7 categories with JSONB criteria and anti-farming — v1.0
- ✓ Badge progress tracking, rarity indicators, push notifications — v1.0
- ✓ FOMO feed with friends/events/happening-now tabs — v1.0
- ✓ WebSocket real-time updates with Redis Pub/Sub fan-out — v1.0
- ✓ Firebase push notifications with BullMQ batching — v1.0
- ✓ Concert cred profile with stats, genre breakdown, badge showcase — v1.0
- ✓ Aggregate band/venue ratings from check-in data — v1.0
- ✓ Event discovery (nearby, trending, genre browse, search) — v1.0
- ✓ Personalized recommendations (genre affinity + friend attendance + trending) — v1.0
- ✓ Account deletion flow (Apple requirement) — v1.0
- ✓ Privacy manifests for all third-party SDKs — v1.0
- ✓ Demo account for App Store review — v1.0
- ✓ Cursor-based pagination on all feed endpoints — v1.0
- ✓ Audit logging with fire-and-forget pattern — v1.0

### Active

**Growth & Retention** (identified by Board of Directors gap analysis, 2026-02-27)
- [ ] Event RSVP / "I'm going" feature for pre-show social loop
- [ ] External social sharing (Instagram Stories, X, TikTok share cards)
- [ ] "Trending shows near you this week" between-concert retention feed
- [ ] Onboarding flow (3-screen carousel for first-time users)
- [ ] Post-check-in celebration screen with share CTA

**Platform Trust & Safety**
- [ ] Report/flag mechanism for UGC (App Store Guideline 1.2 requirement)
- [ ] Content moderation pipeline (image scanning, admin review queue)
- [ ] Venue/artist verification system
- [ ] Forgot Password flow (currently stubbed)

**Monetization & B2B**
- [ ] Artist/venue accounts with claimed profiles
- [ ] Premium tier ("SoundCheck Pro") design
- [ ] Venue owner dashboard

**Technical Scale**
- [ ] PostgreSQL full-text search (tsvector + GIN) replacing ILIKE
- [ ] Denormalized feed counts (toast_count, comment_count)
- [ ] Band.genre expanded to array or many-to-many
- [ ] Collaborative filtering for recommendations
- [ ] WebSocket horizontal scaling (complete Redis Pub/Sub wiring)
- [ ] Public API with OAuth2 scopes

**Year in Review**
- [ ] "Year in Shows" / SoundCheck Wrapped annual recap
- [ ] Shareable recap cards for social media

### Out of Scope

- Web frontend — mobile-only; no web profiles or web app for v1
- Past concert logging/diary — "I'm here now" creates urgency and authenticity
- Ticket sales or purchasing — link out to Ticketmaster/Bandsintown
- Live streaming or audio features — about being there, not watching remotely
- Chat/messaging between users — social via check-ins, toasts, comments
- Concert buddy matching — safety concerns, moderation complexity
- Competitive leaderboards/rankings — badges reward milestones, not competition

## Context

**Current State (v1.0 shipped 2026-02-27):**
- Monorepo: `/backend` (Node.js/Express/TypeScript, 25k LOC) and `/mobile` (Flutter/Dart, 60k LOC)
- PostgreSQL with 25 migrations, Redis caching, BullMQ job processing
- 363 tests passing across 166 test files
- Clean architecture on mobile (data/domain/presentation), MVC + service layer on backend
- Deployed on Railway.app (single instance)
- External integrations: Ticketmaster Discovery API, Foursquare, MusicBrainz, SetlistFM, Firebase, Cloudflare R2, Sentry

**Known Technical Debt:**
- CheckinService still 1,400 LOC (facade pattern started, ~70% extraction deferred)
- Legacy `reviews` table coexists with new `checkin_band_ratings` — needs cleanup
- `checkins.band_rating` INTEGER column from old migration still exists
- Feed queries use COUNT(DISTINCT) with LEFT JOINs — will degrade at scale
- Search uses ILIKE — needs full-text search for scale
- In-memory rate limiter fallback on Redis failure (per-instance, not distributed)
- 8 `as any` type casts remaining in production code
- No staging environment
- No load testing performed

**Board of Directors Gap Analysis (2026-02-27):**
Unanimous CONCERNS (5/5 directors) identified 5 structural gaps vs. Untappd:
1. No between-show retention mechanism
2. No viral loops outside the app (no social sharing)
3. No artist/venue stakeholders on the platform
4. No trust infrastructure (moderation, verification)
5. No monetization design

## Current Milestone: v1.1 Launch Readiness & Growth Platform

**Goal:** Close the 5 structural gaps identified by the Board of Directors gap analysis — launch blockers, viral growth, platform trust, between-show retention, and monetization foundation — transforming SoundCheck from "a good concert check-in app" into "a platform with network effects."

**Target features:**
- Launch blockers: report/flag, forgot password, remove fake auth stubs, onboarding
- Viral growth engine: social sharing cards, RSVP, trending feed, badge expansion
- Platform trust: verification, content moderation, full-text search, tech debt fixes
- Retention & monetization: artist/venue accounts, SoundCheck Wrapped, premium tier design, collaborative filtering

## Constraints

- **Tech Stack**: Flutter 3.27.4+ (mobile), Node.js 20 / Express / TypeScript (backend), PostgreSQL 12+ — continue existing stack
- **Platform**: Mobile only (iOS + Android via Flutter)
- **External APIs**: Ticketmaster (primary), Foursquare, MusicBrainz, SetlistFM, Firebase, Cloudflare R2
- **Deployment**: Railway.app (backend), App Store / Google Play (mobile)
- **Quality Bar**: App Store approved, production-grade

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebuild on existing stack (not rewrite) | Flutter + Node/Express/PostgreSQL stack is solid; problem was features, not technology | ✓ Good — 22 plans in 2.3 hours |
| Events as first-class entities with lineups | A show is the atomic unit — one event, multiple bands, per-set ratings | ✓ Good — clean data model |
| Dual ratings (band + venue) | Independent signals; conflating them loses useful data | ✓ Good — works well |
| Ticketmaster as primary event source | Songkick dead, Bandsintown needs approval | ✓ Good — reliable pipeline |
| BullMQ for async processing | Badge eval, event sync, notification batching need background jobs | ✓ Good — survives deploys |
| Expand-contract migration | Backward compat during schema transition | ✓ Good — zero downtime |
| Mobile only for v1 | Check-in-at-a-show is inherently mobile | ⚠️ Revisit — web needed for SEO/sharing |
| No B2B venue tools for v1 | Consumer first | ⚠️ Revisit — venue accounts needed for growth |
| Live check-in only (no retroactive) | "I'm here now" creates urgency | ✓ Good — core differentiator |
| Presigned URL photo upload | Client PUTs directly to R2, no Railway proxy | ✓ Good — fast, scalable |
| Redis Pub/Sub for WebSocket fan-out | Foundation for horizontal scaling | ✓ Good — architecture ready |
| JSONB badge criteria | New badges without code changes | ✓ Good — 37 badges, zero custom code per type |

---
*Last updated: 2026-02-27 after v1.1 milestone started*
