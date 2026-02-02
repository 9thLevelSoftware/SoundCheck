# SoundCheck

## What This Is

SoundCheck is the "Untappd of live music" — a social concert check-in app for concertgoers. Users check in at shows, rate both the band's performance and the venue experience, earn badges for their concert habits, and see what shows their friends are attending. It turns going to concerts into a social, gamified experience with a persistent concert profile that showcases your live music history.

## Core Value

The live check-in moment: a user at a show can check in fast, rate what they're experiencing, and share it with friends — and that single action feeds discovery, social proof, gamification, and their concert identity.

## Requirements

### Validated

<!-- Existing capabilities inferred from codebase analysis (2026-02-02) -->

- ✓ User registration with email/password — existing
- ✓ Social authentication (Google, Apple Sign-In) — existing
- ✓ JWT-based session management with secure token storage — existing
- ✓ User profiles with bio, avatar, location — existing
- ✓ Venue search with filtering (location, rating, type) — existing
- ✓ Venue details with ratings and review counts — existing
- ✓ Band discovery and metadata — existing
- ✓ Basic check-in creation at venues — existing
- ✓ Review system with star ratings — existing
- ✓ Badge/achievement system (basic) — existing
- ✓ User follow/unfollow — existing
- ✓ Activity feed with geographic filtering — existing
- ✓ Toast reactions and comments on check-ins — existing
- ✓ Wishlist functionality — existing
- ✓ Push notifications via WebSocket — existing
- ✓ Foursquare venue data integration — existing
- ✓ MusicBrainz artist data integration — existing
- ✓ SetlistFM performance history integration — existing
- ✓ Rate limiting and security middleware — existing
- ✓ Structured logging and error tracking (Sentry) — existing

### Active

<!-- Redesign scope: full Untappd parity for live music -->

**Data Model Redesign**
- [ ] Events as first-class entities with multi-band lineups
- [ ] Event check-in model (check in to event, optionally rate individual sets)
- [ ] Dual rating system: band performance rating + venue experience rating (independent)
- [ ] Genre tagging on bands, venues, and events
- [ ] Event data seeded from APIs (Songkick, Bandsintown, Ticketmaster) + user-created events

**Check-in Experience**
- [ ] Quick check-in flow (find show, tap, done in ~10 seconds)
- [ ] Optional enrichment after check-in (rate bands, rate venue, add photo, tag friends)
- [ ] Per-set ratings within a multi-band event
- [ ] Location verification (confirm user is near venue)
- [ ] Check-in photo attachment

**Gamification / Badges**
- [ ] Genre Explorer badges (see N shows in a genre — metal, jazz, indie, etc.)
- [ ] Venue Collector badges (check in at N unique venues)
- [ ] Superfan badges (see the same band N times)
- [ ] Festival Warrior badges (check in to N shows in one day/weekend)
- [ ] Badge progress tracking and display
- [ ] Badge rarity indicators (% of users who earned it)

**Social & Feed**
- [ ] FOMO feed: see friends at shows in real-time
- [ ] Shared experience discovery: see who else was at the same show
- [ ] Concert cred profile: total shows, unique bands, unique venues, top genres
- [ ] Profile stats aggregation and display
- [ ] Friend activity notifications (friend checked in at a show near you)

**Discovery**
- [ ] Upcoming shows near you (from event API data)
- [ ] Personalized recommendations based on check-in history and genre preferences
- [ ] Trending shows/venues in your area
- [ ] Band pages with aggregate performance ratings and upcoming shows
- [ ] Venue pages with aggregate experience ratings and upcoming events

**UX Redesign**
- [ ] Untappd-style navigation and interaction patterns
- [ ] Polished check-in flow optimized for speed
- [ ] Profile page as a concert resume
- [ ] Badge showcase and collection UI
- [ ] Feed designed around live moments (real-time, not stale)

### Out of Scope

- Venue/promoter dashboard (B2B) — consumer app only for v1, venue tools are a separate product
- Web frontend — mobile-only; no web profiles or web app
- Past concert logging/diary — the core action is "I'm here now," not retroactive logging
- Ticket sales or purchasing — SoundCheck is about the experience, not commerce
- Live streaming or audio features — the app is about being there, not watching remotely
- Chat/messaging between users — social interaction happens through check-ins, toasts, and comments
- OAuth providers beyond Google/Apple — email + two social providers is sufficient for v1

## Context

**Existing Codebase:**
- Monorepo: `/backend` (Node.js/Express/TypeScript) and `/mobile` (Flutter/Dart)
- PostgreSQL database with Redis caching
- Clean architecture on mobile (data/domain/presentation layers)
- MVC + service layer on backend
- Deployed on Railway.app
- External integrations: Foursquare Places API, MusicBrainz API, SetlistFM API

**What Needs Rework:**
- The data model doesn't treat events as first-class entities with lineups — this is the biggest structural gap
- Check-in flow exists but isn't optimized for the "quick tap at a show" experience
- Badge system exists but lacks the concert-specific badge types (genre explorer, venue collector, etc.)
- Ratings are single-dimensional — need dual ratings (band performance + venue experience)
- Feed exists but doesn't create the FOMO/shared-experience dynamics
- Profile doesn't aggregate concert stats into an identity
- Event data pipeline from external APIs (Songkick, Bandsintown) doesn't exist yet

**Target Quality:** App Store ready. This is not a prototype — it needs to feel polished enough for real users at real concerts.

## Constraints

- **Tech Stack**: Flutter 3.2+ (mobile), Node.js 20 / Express / TypeScript (backend), PostgreSQL 12+ (database) — rebuild on existing stack, don't switch
- **Platform**: Mobile only (iOS + Android via Flutter) — no web frontend
- **External APIs**: Need event data from concert listing APIs (Songkick, Bandsintown, or Ticketmaster) in addition to existing Foursquare/MusicBrainz/SetlistFM integrations
- **Deployment**: Railway.app for backend hosting — existing deployment pipeline
- **Quality Bar**: App Store submission ready — production-grade UX, performance, and reliability

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebuild on existing stack (not rewrite) | Existing Flutter + Node/Express/PostgreSQL stack is solid; the problem is features and UX, not technology | -- Pending |
| Events as first-class entities with lineups | A show is the atomic unit of the concert world — one event, multiple bands, per-set ratings | -- Pending |
| Dual ratings (band + venue) | Band performance and venue experience are independent signals — conflating them loses useful data | -- Pending |
| Mobile only for v1 | Focus on the check-in-at-a-show use case which is inherently mobile | -- Pending |
| No B2B venue tools for v1 | Consumer product first — venue management is a different product with different users | -- Pending |
| API-seeded + user-created events | APIs provide baseline event data; users fill gaps for smaller shows/DIY venues | -- Pending |
| Live check-in only (no retroactive logging) | "I'm here now" creates urgency and authenticity — diary logging dilutes the social signal | -- Pending |

---
*Last updated: 2026-02-02 after initialization*
