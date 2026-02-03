# Requirements: SoundCheck

**Defined:** 2026-02-02
**Core Value:** The live check-in moment: a user at a show can check in fast, rate what they're experiencing, and share it with friends -- and that single action feeds discovery, social proof, gamification, and their concert identity.

## v1 Requirements

Requirements for initial release (App Store ready). Each maps to roadmap phases.

### Data Model Redesign

- [x] **DATA-01**: Events exist as first-class entities with name, venue, date, times, type, and ticket info
- [x] **DATA-02**: Events support multi-band lineups via junction table with set order and headliner flag
- [x] **DATA-03**: Check-ins reference events (not bands/venues directly)
- [x] **DATA-04**: Check-ins support dual ratings (band performance + venue experience) as independent optional fields
- [x] **DATA-05**: Per-set band ratings stored in separate table for multi-band events
- [x] **DATA-06**: Event timestamps use TIMESTAMPTZ; venues store IANA timezone identifier
- [x] **DATA-07**: Events track source API and external ID for cross-source deduplication
- [x] **DATA-08**: Badge criteria stored as JSONB for data-driven evaluation without code changes
- [x] **DATA-09**: Schema migration uses expand-contract pattern with backward compatibility
- [x] **DATA-10**: Existing shows/checkins data migrated to new event-based model without data loss

### Event Data Pipeline

- [x] **PIPE-01**: Ticketmaster Discovery API adapter fetches events by configurable metro areas
- [x] **PIPE-02**: Events ingested on recurring schedule via BullMQ repeatable jobs (surviving deploys)
- [x] **PIPE-03**: Ingested events deduplicated by source+external_id and venue+date composite key
- [x] **PIPE-04**: Band names from APIs matched to existing bands table (exact + fuzzy via pg_trgm)
- [x] **PIPE-05**: Users can create events for shows not in API data
- [x] **PIPE-06**: User-created events start as unverified; promoted when multiple users check in
- [x] **PIPE-07**: Cancelled/rescheduled events detected on re-sync and flagged with user notification
- [x] **PIPE-08**: Ingestion respects Ticketmaster rate limits (5,000/day, 5/sec) with backoff

### Check-in Experience

- [x] **CHKN-01**: User can check in to an event in under 10 seconds from app open
- [x] **CHKN-02**: Check-in auto-suggests nearby events based on GPS + current date/time
- [x] **CHKN-03**: Check-in is a single tap; all enrichment (ratings, photo) is optional afterward
- [x] **CHKN-04**: User can rate each band independently after checking in (per-set ratings)
- [x] **CHKN-05**: User can rate venue experience independently after checking in
- [x] **CHKN-06**: User can attach photo(s) to check-in (stored in cloud storage, not ephemeral filesystem)
- [x] **CHKN-07**: Location verified on check-in (configurable radius per venue type, non-blocking)
- [x] **CHKN-08**: Check-in limited to one per user per event
- [x] **CHKN-09**: Check-in validated within time window around event (doors to end + buffer)
- [x] **CHKN-10**: Ratings use half-star increments (0.5 to 5.0)

### Gamification / Badges

- [x] **BDGE-01**: Badge engine evaluates check-ins asynchronously via BullMQ after each check-in
- [x] **BDGE-02**: Genre Explorer badges awarded for attending N shows in a genre (5/10/25 thresholds)
- [x] **BDGE-03**: Venue Collector badges awarded for checking in at N unique venues (10/25/50)
- [x] **BDGE-04**: Superfan badges awarded for seeing the same band N times (3/5/10)
- [x] **BDGE-05**: Festival Warrior badges awarded for N check-ins in one day (3/5)
- [x] **BDGE-06**: Milestone badges awarded at check-in counts (1/10/25/50/100/250/500)
- [x] **BDGE-07**: Road Warrior badges awarded for check-ins across N cities/states (5/10)
- [x] **BDGE-08**: Badge definitions use JSONB criteria; new badges addable without code changes
- [x] **BDGE-09**: Badge progress tracked and displayed (current count / target)
- [x] **BDGE-10**: Badge rarity shown as percentage of users who earned each badge
- [x] **BDGE-11**: User receives push notification when they earn a badge
- [x] **BDGE-12**: Anti-farming: location verification + daily check-in rate limit + delayed evaluation

### Social & Feed

- [x] **FEED-01**: Friends feed shows real-time friend check-ins ordered by recency
- [x] **FEED-02**: "Happening Now" section shows friends currently at shows (auto-expires after event)
- [x] **FEED-03**: Event feed shows all check-ins for a specific event (shared experience discovery)
- [x] **FEED-04**: Toast reactions on check-ins (existing, preserved)
- [x] **FEED-05**: Comments on check-ins (existing, preserved)
- [x] **FEED-06**: WebSocket push for real-time friend check-in updates in feed
- [x] **FEED-07**: Redis Pub/Sub for multi-instance WebSocket fan-out
- [x] **FEED-08**: Push notification when friend checks in at a show near user
- [x] **FEED-09**: Feed cached in Redis with short TTL for performance
- [x] **FEED-10**: Cursor-based pagination on all feed endpoints

### Discovery & Pages

- [x] **DISC-01**: Upcoming shows near user based on GPS location and event data
- [x] **DISC-02**: Band pages show aggregate live performance rating from all check-in ratings
- [x] **DISC-03**: Band pages show upcoming shows for that band
- [x] **DISC-04**: Venue pages show aggregate experience rating from all check-in ratings
- [x] **DISC-05**: Venue pages show upcoming events at that venue
- [x] **DISC-06**: Trending shows near user (most check-ins in recent window)
- [x] **DISC-07**: Search includes events in addition to existing bands, venues, and users
- [x] **DISC-08**: Genre-based event browsing (filter upcoming shows by genre)
- [x] **DISC-09**: SQL-based personalized recommendations using user's genre history and friend attendance

### Profile & Stats

- [x] **PRFL-01**: Profile displays total shows attended
- [x] **PRFL-02**: Profile displays unique bands seen
- [x] **PRFL-03**: Profile displays unique venues visited
- [x] **PRFL-04**: Profile displays genre breakdown (top genres by check-in count)
- [x] **PRFL-05**: Profile displays badge collection with progress indicators
- [x] **PRFL-06**: Profile displays recent check-in history
- [x] **PRFL-07**: Profile displays top-rated bands and venues (personal favorites)
- [x] **PRFL-08**: Stats computed on demand and cached in Redis (10-min TTL)

### Polish & App Store

- [x] **PLSH-01**: Check-in flow optimized for speed and one-handed mobile use
- [x] **PLSH-02**: Feed designed around live moments with visual check-in cards
- [x] **PLSH-03**: Badge showcase UI with collection grid and detail view
- [x] **PLSH-04**: Profile page styled as concert resume
- [x] **PLSH-05**: Check-in photos stored in Cloudflare R2 (not ephemeral Railway filesystem)
- [x] **PLSH-06**: Push notifications via Firebase Cloud Messaging for background delivery
- [x] **PLSH-07**: Account deletion flow works end-to-end (Apple requirement)
- [x] **PLSH-08**: Flutter version pinned to known-good release (avoid 3.24.3/3.24.4 App Store issues)
- [x] **PLSH-09**: Privacy manifests included for all third-party SDKs (Apple requirement)
- [x] **PLSH-10**: Demo account with test data prepared for App Store review

## v2 Requirements

Deferred to post-launch. Tracked but not in current roadmap.

### Year in Review

- **WRAP-01**: "Year in Shows" / SoundCheck Wrapped annual recap with stats and highlights
- **WRAP-02**: Shareable recap cards optimized for Instagram/TikTok social media posting

### Advanced Recommendations

- **RECC-01**: Collaborative filtering via pgvector for "users like you also attended" recommendations
- **RECC-02**: Cold-start genre preference onboarding for new users with no check-in history

### Extended Gamification

- **EXTG-01**: Concert streak tracking (weekly/monthly attendance streaks with Duolingo-style mechanics)
- **EXTG-02**: Concert cred composite score (single number capturing concert-going depth)
- **EXTG-03**: Seasonal/holiday badges (summer festival season, NYE show, etc.)

### Additional Data Sources

- **DSRC-01**: Bandsintown API integration for indie/DIY event coverage (pending approval)
- **DSRC-02**: SetlistFM post-event enrichment (display setlist data on event pages)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Ticket sales/purchasing | Bandsintown (95M users) and Ticketmaster own this space. Link out instead. |
| Setlist tracking/wiki | Setlist.fm has 9.6M setlists with active community. Integrate their API, don't rebuild. |
| Retroactive/backdated concert logging | "I'm here now" creates urgency and authenticity. Diary logging dilutes the social signal. |
| Direct messaging/chat | Chat is a product in itself (moderation, abuse, spam). Social interaction via toasts + comments. |
| Web frontend/profiles | Mobile is the platform for live concert check-ins. No web app for v1. |
| Artist/venue management dashboard (B2B) | Consumer app only. B2B tools are a separate product with different users. |
| Live streaming or audio features | SoundCheck is about being there, not watching remotely. Licensing/bandwidth complexity. |
| Complex social graphs (groups, circles) | Follow/unfollow is sufficient. Groups add administration complexity without proportional value. |
| Critic/professional reviews | All ratings from verified check-in users. Mixing critic reviews creates confusion. |
| Concert buddy matching | Safety concerns, moderation nightmares, different user psychology. Show "who was there," not "who to meet." |
| Overly granular rating dimensions | Two ratings (band + venue) per check-in max. 5+ dimensions kills completion rate at shows. |
| Competitive leaderboards/rankings | Badges reward personal milestones, not competitive ranking. Prevents gaming incentives. |
| OAuth beyond Google/Apple | Email + two social providers is sufficient for v1. |

## Traceability

Populated during roadmap creation. Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| DATA-07 | Phase 1 | Complete |
| DATA-08 | Phase 1 | Complete |
| DATA-09 | Phase 1 | Complete |
| DATA-10 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Complete |
| PIPE-02 | Phase 2 | Complete |
| PIPE-03 | Phase 2 | Complete |
| PIPE-04 | Phase 2 | Complete |
| PIPE-05 | Phase 2 | Complete |
| PIPE-06 | Phase 2 | Complete |
| PIPE-07 | Phase 2 | Complete |
| PIPE-08 | Phase 2 | Complete |
| CHKN-01 | Phase 3 | Complete |
| CHKN-02 | Phase 3 | Complete |
| CHKN-03 | Phase 3 | Complete |
| CHKN-04 | Phase 3 | Complete |
| CHKN-05 | Phase 3 | Complete |
| CHKN-06 | Phase 3 | Complete |
| CHKN-07 | Phase 3 | Complete |
| CHKN-08 | Phase 3 | Complete |
| CHKN-09 | Phase 3 | Complete |
| CHKN-10 | Phase 3 | Complete |
| BDGE-01 | Phase 4 | Complete |
| BDGE-02 | Phase 4 | Complete |
| BDGE-03 | Phase 4 | Complete |
| BDGE-04 | Phase 4 | Complete |
| BDGE-05 | Phase 4 | Complete |
| BDGE-06 | Phase 4 | Complete |
| BDGE-07 | Phase 4 | Complete |
| BDGE-08 | Phase 4 | Complete |
| BDGE-09 | Phase 4 | Complete |
| BDGE-10 | Phase 4 | Complete |
| BDGE-11 | Phase 4 | Complete |
| BDGE-12 | Phase 4 | Complete |
| FEED-01 | Phase 5 | Complete |
| FEED-02 | Phase 5 | Complete |
| FEED-03 | Phase 5 | Complete |
| FEED-04 | Phase 5 | Complete |
| FEED-05 | Phase 5 | Complete |
| FEED-06 | Phase 5 | Complete |
| FEED-07 | Phase 5 | Complete |
| FEED-08 | Phase 5 | Complete |
| FEED-09 | Phase 5 | Complete |
| FEED-10 | Phase 5 | Complete |
| DISC-01 | Phase 7 | Complete |
| DISC-02 | Phase 7 | Complete |
| DISC-03 | Phase 7 | Complete |
| DISC-04 | Phase 7 | Complete |
| DISC-05 | Phase 7 | Complete |
| DISC-06 | Phase 7 | Complete |
| DISC-07 | Phase 7 | Complete |
| DISC-08 | Phase 7 | Complete |
| DISC-09 | Phase 7 | Complete |
| PRFL-01 | Phase 6 | Complete |
| PRFL-02 | Phase 6 | Complete |
| PRFL-03 | Phase 6 | Complete |
| PRFL-04 | Phase 6 | Complete |
| PRFL-05 | Phase 6 | Complete |
| PRFL-06 | Phase 6 | Complete |
| PRFL-07 | Phase 6 | Complete |
| PRFL-08 | Phase 6 | Complete |
| PLSH-01 | Phase 8 | Complete |
| PLSH-02 | Phase 8 | Complete |
| PLSH-03 | Phase 8 | Complete |
| PLSH-04 | Phase 8 | Complete |
| PLSH-05 | Phase 8 | Complete |
| PLSH-06 | Phase 8 | Complete |
| PLSH-07 | Phase 8 | Complete |
| PLSH-08 | Phase 8 | Complete |
| PLSH-09 | Phase 8 | Complete |
| PLSH-10 | Phase 8 | Complete |

**Coverage:**
- v1 requirements: 77 total
- Mapped to phases: 77
- Unmapped: 0

---
*Requirements defined: 2026-02-02*
*Last updated: 2026-02-03 after Phase 8 complete (all 77 v1 requirements verified)*
