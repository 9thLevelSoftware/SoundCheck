# Roadmap: SoundCheck

## Overview

SoundCheck's v1 transforms a barebones concert app into the "Untappd of live music" -- a social check-in platform with events as first-class entities, dual ratings, a gamification badge system, a FOMO-driven social feed, and concert cred profiles. The journey starts with the data model foundation (events + lineups), builds the event data pipeline and core check-in flow, layers on gamification and social features, then polishes for App Store submission. The critical path is: schema -> events -> check-ins -> everything else.

## Phases

- [x] **Phase 1: Data Model Foundation** - Redesign schema around events with multi-band lineups, migrate existing data
- [x] **Phase 2: Event Data Pipeline** - Ticketmaster integration, event sync, deduplication, user-created events
- [x] **Phase 3: Core Check-in Flow** - Event-based quick check-in with dual ratings, location verification, photos
- [x] **Phase 4: Badge Engine** - Data-driven gamification with concert-specific badges, progress tracking, anti-farming
- [x] **Phase 5: Social Feed & Real-time** - FOMO feed, happening now, WebSocket push, Firebase notifications
- [x] **Phase 6: Profile & Concert Cred** - Stats aggregation, concert resume, badge showcase
- [ ] **Phase 7: Discovery & Recommendations** - Band/venue pages, upcoming shows, trending, genre-based recommendations
- [ ] **Phase 8: Polish & App Store Readiness** - UX refinement, cloud storage migration, App Store compliance

## Phase Details

### Phase 1: Data Model Foundation
**Goal**: Replace the shows/checkins schema with an event-centric data model that supports multi-band lineups, dual ratings, per-set band ratings, and timezone-aware timestamps. Migrate all existing data without loss.
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10
**Success Criteria** (what must be TRUE):
  1. Events table supports multi-band lineups via event_lineup junction table with set order
  2. Check-ins reference event_id (not band_id + venue_id directly)
  3. Dual rating columns (venue_rating) and checkin_band_ratings table exist
  4. Old shows and checkins data successfully migrated to new event-based schema
  5. All existing API endpoints continue to function during and after migration
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Install node-pg-migrate, write and run 8 expand-phase DDL migrations (events, event_lineup, checkin_band_ratings, venue timezone, badge criteria, notifications event_id)
- [x] 01-02-PLAN.md -- Update triggers for dual-path schema, migrate shows to events, backfill checkins with event_id and split ratings
- [x] 01-03-PLAN.md -- Rewrite EventService for events+lineup tables, dual-write CheckinService, update NotificationService

### Phase 2: Event Data Pipeline
**Goal**: Build a reliable event ingestion pipeline from Ticketmaster Discovery API with deduplication, band name matching, and user-created events to fill gaps. Events are the content that makes check-ins useful.
**Depends on**: Phase 1 (needs events table)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-08
**Success Criteria** (what must be TRUE):
  1. Events from Ticketmaster Discovery API appear in the database for configured metro areas
  2. Duplicate events across sync runs are detected and merged (not duplicated)
  3. Users can create events with venue selection and band lineup
  4. Event sync runs reliably on schedule via BullMQ repeatable jobs
  5. Band names from API are matched to existing bands or create new records
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- DB migrations (venue/band external_id, event status, trgm index, sync tables), BullMQ install, Redis config, TicketmasterAdapter, BandMatcher
- [x] 02-02-PLAN.md -- EventSyncService orchestrator (fetch->dedup->match->upsert->log), BullMQ queue/worker/scheduler, app startup integration
- [x] 02-03-PLAN.md -- User-created events (source tracking, verification), auto-merge with Ticketmaster data, on-demand lookup endpoint

### Phase 3: Core Check-in Flow
**Goal**: Redesign the check-in experience around events with a quick-tap flow, optional dual ratings (band + venue), per-set ratings for multi-band shows, location verification, and photo upload.
**Depends on**: Phase 1 (new schema), Phase 2 (events to check into)
**Requirements**: CHKN-01, CHKN-02, CHKN-03, CHKN-04, CHKN-05, CHKN-06, CHKN-07, CHKN-08, CHKN-09, CHKN-10
**Success Criteria** (what must be TRUE):
  1. User can check in to an event in under 10 seconds from app open
  2. Per-set band ratings and venue experience rating added independently after check-in
  3. Check-in location verified against venue coordinates (non-blocking, marks verified/unverified)
  4. Check-in photos upload to cloud storage and display correctly
  5. One check-in per user per event enforced; ratings use half-star increments
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- Backend CheckinService redesign (event-first creation, location verification, time window validation, per-set ratings endpoint, nearby events)
- [x] 03-02-PLAN.md -- Mobile check-in flow (GPS event auto-suggest, single-tap check-in, rating bottom sheets with half-star increments)
- [x] 03-03-PLAN.md -- Photo upload pipeline (Cloudflare R2 presigned URLs, mobile camera/gallery picker, direct upload, max 4 photos)

### Phase 4: Badge Engine
**Goal**: Build a data-driven badge evaluation engine with JSONB criteria, async BullMQ processing, all 7 concert-specific badge categories, progress tracking, rarity indicators, and anti-farming measures.
**Depends on**: Phase 3 (needs check-in data flowing)
**Requirements**: BDGE-01, BDGE-02, BDGE-03, BDGE-04, BDGE-05, BDGE-06, BDGE-07, BDGE-08, BDGE-09, BDGE-10, BDGE-11, BDGE-12
**Success Criteria** (what must be TRUE):
  1. Check-in triggers asynchronous badge evaluation via BullMQ
  2. All badge categories award correctly (genre explorer, venue collector, superfan, festival warrior, milestone, road warrior)
  3. Badge progress displayed as current count / target count
  4. Badge rarity percentages computed and displayed
  5. Anti-farming measures prevent badge exploitation (location verify + rate limit + delayed eval)
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md -- Badge engine core (evaluator registry with 6 evaluators, BadgeService rewrite, BullMQ badge-eval queue/worker, check-in trigger)
- [x] 04-02-PLAN.md -- Badge seed data (~37 definitions across 6 categories), rarity API endpoint, daily check-in rate limit, user_badges metadata column
- [x] 04-03-PLAN.md -- Mobile badge UI (updated Freezed models, badge collection screen with progress rings, rarity display, earned notification)

### Phase 5: Social Feed & Real-time
**Goal**: Transform the activity feed into a FOMO-driven social experience with real-time friend check-ins, "Happening Now" live indicator, shared experience discovery, push notifications, and performant Redis-cached feed queries.
**Depends on**: Phase 3 (needs check-ins to display)
**Requirements**: FEED-01, FEED-02, FEED-03, FEED-04, FEED-05, FEED-06, FEED-07, FEED-08, FEED-09, FEED-10
**Success Criteria** (what must be TRUE):
  1. Friends feed shows check-ins from followed users with real-time WebSocket updates
  2. "Happening Now" section shows friends currently at shows (auto-expires after event)
  3. Event feed shows all check-ins for a specific event (shared experience)
  4. Push notifications delivered when friend checks in at a show near user
  5. Feed loads within 200ms with Redis caching and cursor-based pagination
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md -- Backend FeedService with three feed queries (friends, event, happening now), Redis cache, cursor pagination, unseen counts, cache invalidation
- [x] 05-02-PLAN.md -- Real-time layer: Redis Pub/Sub for WebSocket fan-out, same-event detection, FCM push notifications with BullMQ batching, device token management
- [x] 05-03-PLAN.md -- Mobile feed UI: tabbed screen (Friends/Events/Happening Now), Untappd-style feed cards, real-time WebSocket banner, push notification service

### Phase 6: Profile & Concert Cred
**Goal**: Build the concert resume profile with aggregate stats (shows, bands, venues, genres), badge showcase, recent check-ins, and top-rated favorites -- turning concert-going into an identity.
**Depends on**: Phase 3 (check-in data), Phase 4 (badges)
**Requirements**: PRFL-01, PRFL-02, PRFL-03, PRFL-04, PRFL-05, PRFL-06, PRFL-07, PRFL-08
**Success Criteria** (what must be TRUE):
  1. Profile displays total shows, unique bands, unique venues, and genre breakdown
  2. Badge collection visible with progress indicators for unearned badges
  3. Recent check-in history displayed on profile
  4. Top-rated bands and venues (personal favorites) visible
  5. Stats cached in Redis and update within 10 minutes of new check-in
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md -- StatsService with aggregate queries (genre breakdown, top-rated bands/venues), Redis cache-aside (10-min TTL), concert-cred endpoint, fire-and-forget cache invalidation in CheckinService
- [x] 06-02-PLAN.md -- ConcertCred Freezed model, profile repository + provider, redesigned ProfileScreen with concert resume (stats, genre bars, top bands, top venues, badge showcase, recent check-ins)

### Phase 7: Discovery & Recommendations
**Goal**: Enrich band and venue pages with aggregate ratings and event calendars. Build event discovery with nearby shows, genre browsing, trending, and SQL-based personalized recommendations.
**Depends on**: Phase 2 (events), Phase 3 (check-ins for ratings)
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, DISC-08, DISC-09
**Success Criteria** (what must be TRUE):
  1. Upcoming shows near user displayed based on GPS location
  2. Band pages show aggregate live performance rating and upcoming shows
  3. Venue pages show aggregate experience rating and upcoming events
  4. Event search returns relevant results by name, band, venue, or genre
  5. Personalized recommendations surface events matching user's genre history
**Plans**: 3 plans

Plans:
- [ ] 07-01: Band and venue page enrichment (aggregate dual ratings, upcoming events, fan counts)
- [ ] 07-02: Event discovery (nearby shows, genre browse, trending algorithm, event search)
- [ ] 07-03: SQL-based recommendation engine (genre affinity, friend attendance, trending signals)

### Phase 8: Polish & App Store Readiness
**Goal**: Final UX refinement, cloud storage migration for production reliability, and full App Store compliance (account deletion, privacy manifests, demo account, Flutter version safety).
**Depends on**: All previous phases
**Requirements**: PLSH-01, PLSH-02, PLSH-03, PLSH-04, PLSH-05, PLSH-06, PLSH-07, PLSH-08, PLSH-09, PLSH-10
**Success Criteria** (what must be TRUE):
  1. Check-in flow feels fast and intuitive on real iOS and Android devices
  2. Feed displays rich check-in cards with photos and badge-earned indicators
  3. Account deletion works end-to-end (Apple App Store requirement)
  4. App builds successfully with privacy manifests for all third-party SDKs
  5. Demo account with realistic test data available for App Store review
**Plans**: 2 plans

Plans:
- [ ] 08-01: UX polish (check-in flow speed optimization, feed card design, profile layout tuning)
- [ ] 08-02: App Store compliance (account deletion, privacy manifests, Flutter version pin, demo account)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Model Foundation | 3/3 | Complete | 2026-02-02 |
| 2. Event Data Pipeline | 3/3 | Complete | 2026-02-03 |
| 3. Core Check-in Flow | 3/3 | Complete | 2026-02-03 |
| 4. Badge Engine | 3/3 | Complete | 2026-02-03 |
| 5. Social Feed & Real-time | 3/3 | Complete | 2026-02-03 |
| 6. Profile & Concert Cred | 2/2 | Complete | 2026-02-03 |
| 7. Discovery & Recommendations | 0/3 | Not started | - |
| 8. Polish & App Store Readiness | 0/2 | Not started | - |

**Total: 17/22 plans complete**

---
*Roadmap created: 2026-02-02*
*Last updated: 2026-02-03 after Phase 6 execution complete*
