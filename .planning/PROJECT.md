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
- ✓ Report/flag mechanism, content moderation, venue/artist verification — v1.1
- ✓ Password reset via email deep link — v1.1
- ✓ Onboarding carousel + genre picker — v1.1
- ✓ Social sharing (Instagram Stories, X, TikTok share cards) — v1.1
- ✓ Event RSVP with friends going — v1.1
- ✓ Trending shows with Wilson score — v1.1
- ✓ tsvector + GIN full-text search with fuzzy fallback — v1.1
- ✓ Denormalized counts with PostgreSQL triggers — v1.1
- ✓ Genre array migration — v1.1
- ✓ Venue/artist claim and verification system — v1.1
- ✓ SoundCheck Wrapped annual recap — v1.1
- ✓ SoundCheck Pro subscription via RevenueCat — v1.1
- ✓ WCAG AA contrast compliance, semantic accessibility labels — v3.0
- ✓ 44px touch targets on all interactive elements — v3.0
- ✓ Feed tab consolidation (4→3), profile section collapsing, vibes reduction — v3.0
- ✓ Registration form UX (password strength, username availability, inline validation) — v3.0
- ✓ Theme cleanup (legacy color aliases removed, notification badge, light mode audited) — v3.0

### Active

**Future**
- [ ] Collaborative filtering for recommendations
- [ ] WebSocket horizontal scaling (multi-instance)
- [ ] Public API with OAuth2 scopes
- [ ] Venue owner dashboard / B2B tools
- [ ] Web presence for SEO/sharing

### Out of Scope

- Web frontend — mobile-only; no web profiles or web app for v1
- Past concert logging/diary — "I'm here now" creates urgency and authenticity
- Ticket sales or purchasing — link out to Ticketmaster/Bandsintown
- Live streaming or audio features — about being there, not watching remotely
- Chat/messaging between users — social via check-ins, toasts, comments
- Concert buddy matching — safety concerns, moderation complexity
- Competitive leaderboards/rankings — badges reward milestones, not competition

## Context

**Current State (v3.0 shipped 2026-03-01):**
- Monorepo: `/backend` (Node.js/Express/TypeScript) and `/mobile` (Flutter/Dart)
- PostgreSQL with 39 migrations, Redis caching, BullMQ job processing
- Clean architecture on mobile (data/domain/presentation), MVC + service layer on backend
- Deployed on Railway.app (single instance)
- External integrations: Ticketmaster, Foursquare, MusicBrainz, SetlistFM, Firebase, Cloudflare R2, Sentry, RevenueCat, Resend (email), Cloud Vision SafeSearch
- Full trust & safety pipeline (report/block/moderation/verification)
- SoundCheck Wrapped + Pro subscription tier
- User discovery (search + suggestions) and global feed
- Structured winston logging with Sentry error tracking
- Smoke tests, deployment runbook, CI with gitleaks

**Remaining Technical Debt:**
- CheckinService still 1,400 LOC (facade pattern started, ~70% extraction deferred)
- Legacy `reviews` table coexists with `checkin_band_ratings`
- 686 hardcoded AppTheme.*Dark color references break light mode (shipping dark-only for beta)
- No mobile screen for claimed owner stats or band profile edit
- No load testing or horizontal scaling
- 10 pre-existing test failures (CheckinService + UserService UUID validation)

**Shipped Milestones:**
- v1.0 MVP (2026-02-27): 8 phases, 22 plans, 77 requirements
- v1.1 Launch Readiness (2026-02-28): 9 phases, 30 plans, 32 requirements
- v2.0 Beta Launch (2026-03-01): 5 phases, 10 plans, 28 requirements
- v3.0 UI/UX Design Audit (2026-03-01): 4 phases, 9 plans, 33 requirements

**Active Milestone:** None — use `/gsd:new-milestone` to start next milestone

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
*Last updated: 2026-03-01 — v3.0 UI/UX Design Audit shipped (33/33 requirements)*
