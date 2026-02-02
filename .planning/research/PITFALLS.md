# Domain Pitfalls

**Domain:** Social concert check-in app (Untappd for live music)
**Project:** SoundCheck
**Researched:** 2026-02-02
**Overall confidence:** HIGH (cross-referenced codebase analysis, web research, API documentation)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or product failure. Each of these has been seen in the existing SoundCheck codebase or is a documented pattern in the concert app / social check-in domain.

---

### CRITICAL-1: Schema Migration Without Backward Compatibility (Data Model Rework)

**What goes wrong:** The existing SoundCheck database has two parallel systems for the same concept -- `shows` table (venue + band + date) and a migration script that creates an `events` table with the same shape. The `checkins` table references `band_id` and `venue_id` directly, but the new model needs `event_id` as a foreign key. Running a single "big bang" migration that drops old columns and adds new ones will break the running application during deployment.

**Why it happens:** Developers treat schema migration as a single step: "swap the old schema for the new one." On a live database with active users, this creates a window where the old code expects old columns and the new code expects new columns, and neither works.

**Consequences:**
- Downtime during deployment (minutes to hours depending on table size)
- Risk of data loss if migration fails mid-way without proper rollback
- CHECK constraint violations if old application code writes to new schema
- Broken API responses for mobile clients still running the old app version

**Prevention:**
1. Use the **expand-contract migration pattern**: First ADD new columns/tables alongside old ones (expand), deploy code that writes to both, backfill old data, then remove old columns (contract) in a later release
2. Never DROP columns or rename columns in the same deployment as the code change that stops using them
3. Set `lock_timeout` on all DDL statements (e.g., `SET lock_timeout = '3s'`) with retry logic to prevent blocking production queries
4. Test migrations on a production-sized dataset clone, not just an empty dev database
5. Wrap migration in a transaction so failure rolls back cleanly
6. The existing `migrate-events-model.ts` script has no transaction wrapping and no rollback -- this must be rewritten

**Detection (warning signs):**
- Migration script that runs ALTER TABLE and DROP COLUMN in the same file
- No transaction wrapping in migration scripts
- API endpoints that hard-code column names without abstraction
- Mobile app that expects specific JSON field names with no fallback

**Specific to SoundCheck codebase:** The existing `checkins` table stores `band_id` and `venue_id` directly. The new model puts these under `events`. The mobile `CheckIn` model already has an `eventId` field and a nested `CheckInEvent` object, suggesting the frontend is partially prepared. But the backend `CheckinService.ts` still writes directly to `band_id`/`venue_id` columns. These two systems must coexist during migration.

**Phase relevance:** Data Model Redesign phase -- this should be the FIRST phase because everything else depends on a stable event model.

**Confidence:** HIGH -- verified from existing codebase analysis and PostgreSQL migration best practices.

---

### CRITICAL-2: The Shows/Events Dual Table Confusion

**What goes wrong:** The SoundCheck codebase already has BOTH a `shows` table (from `database-schema.sql`) and an `events` table (from `migrate-events-model.ts`). The `EventService.ts` wraps `shows` queries but the migration creates a separate `events` table. The `checkins` table references `band_id`/`venue_id` directly, NOT `event_id`. This creates a split-brain data model where the same concert might exist in `shows` and `events` with different IDs.

**Why it happens:** Incremental development without cleaning up the previous model. The `shows` table was the original design; the `events` table was added as part of the redesign. But the migration was never completed -- the old table was never retired, and the checkins were never migrated to use event_id.

**Consequences:**
- Queries return different results depending on which table is queried
- Check-ins cannot be reliably linked to events (the `event_id` column may not exist on the active `checkins` table)
- Badge calculations based on event attendance will miss check-ins that predate the migration
- Feed queries will show inconsistent data

**Prevention:**
1. Before writing any new feature code, audit and resolve the shows/events dual table situation
2. Decide definitively: `events` is the canonical table, `shows` becomes a view or is dropped
3. Create a data migration script that:
   - Creates `events` records from existing `shows` records
   - Adds `event_id` to `checkins` and backfills from `shows` data
   - Validates referential integrity before dropping old foreign keys
4. Do NOT add features on top of the dual-table model -- it will compound the problem

**Detection:**
- Two tables with overlapping data (`shows` and `events`)
- Service layer that wraps one table's queries as another's (EventService wrapping shows queries)
- Mobile model with fields that don't map to any active database column

**Phase relevance:** Must be resolved in the Data Model Redesign phase BEFORE any feature work.

**Confidence:** HIGH -- directly observed in the codebase.

---

### CRITICAL-3: Songkick API Is Effectively Dead for New Integrations

**What goes wrong:** Teams plan their event data pipeline around Songkick, Bandsintown, and Ticketmaster as three equal sources. Then they discover Songkick requires a paid partnership agreement, is not accepting new free API key requests, and has a history of disabling existing keys without warning. Development stalls while the team scrambles for alternatives.

**Why it happens:** Songkick's API documentation is still publicly visible on their developer page, giving the impression it's available. But the API key request form leads to a dead end -- they are "currently making changes and improvements" and "unable to process new applications."

**Consequences:**
- Weeks of wasted development time building a Songkick integration adapter that can never be used
- Event data pipeline has one fewer source than planned, reducing coverage
- Architecture becomes overly dependent on Ticketmaster (which has its own rate limits: 5000 calls/day, 5 requests/second)

**Prevention:**
1. Drop Songkick from the planning entirely. Use Ticketmaster Discovery API and Bandsintown as primary sources
2. Consider SeatGeek API or PredictHQ as alternatives for broader coverage
3. Design the event ingestion pipeline with a pluggable adapter pattern so new sources can be added without refactoring
4. Never build a critical feature that depends on a single external API -- always have at least two sources for event data

**Detection:**
- PROJECT.md lists Songkick as a planned integration (it does)
- No API key has been obtained for Songkick
- No fallback plan if a planned API source becomes unavailable

**Phase relevance:** Event API Integration phase. This decision must be made before architecture is finalized.

**Confidence:** HIGH -- verified via Songkick developer page, support forums, and Google Groups reports.

**Sources:**
- [Songkick Developer Page](https://www.songkick.com/developer)
- [Songkick API Google Group: Key Disabled](https://groups.google.com/g/songkick-api)
- [Best Music Data APIs 2025](https://soundcharts.com/en/blog/music-data-api)

---

### CRITICAL-4: Duplicate Events Across API Sources (The Deduplication Problem)

**What goes wrong:** The same concert (e.g., "Foo Fighters at Madison Square Garden, March 15") appears in Ticketmaster, Bandsintown, and user-created events -- each with different IDs, slightly different names ("Foo Fighters" vs "The Foo Fighters"), different venue names ("Madison Square Garden" vs "MSG"), and different date formats. Without deduplication, users see 2-3 copies of the same event and can check in to any of them, fragmenting the social data (half the attendees checked in to event A, half to event B).

**Why it happens:** There is no universal concert event identifier across APIs. Each platform has its own ID namespace. Artist names, venue names, and event titles vary across platforms due to different editorial standards, localization, and data entry practices.

**Consequences:**
- Users see duplicate events in search and discovery
- Check-in counts are split across duplicate events, making popular shows look less popular
- Badge calculations count the same concert multiple times (attending "the same show" twice)
- Feed shows redundant check-ins for what is clearly one event
- Data integrity erodes user trust in the platform

**Prevention:**
1. Create a **canonical event identity** using a composite key: normalized artist name + normalized venue name + event date (not time)
2. Normalize artist names by: lowercasing, stripping "The" prefix, removing special characters, using a fuzzy match threshold (Levenshtein distance <= 2)
3. Normalize venue names by: maintaining a venue alias table ("MSG" = "Madison Square Garden" = "The Garden"), geocoding-based matching (venues within 100m of each other with similar names are likely the same)
4. When ingesting from external APIs, always check for existing canonical events before creating new ones
5. Store external API IDs as metadata on the canonical event (e.g., `ticketmaster_id`, `bandsintown_id`) for cross-referencing
6. The existing schema already has `foursquare_place_id` and `setlistfm_venue_id` on venues -- extend this pattern to events

**Detection:**
- Search results show visually identical events with different IDs
- Check-in counts on events are suspiciously low despite being popular shows
- User reports of "I can't find my friend's check-in even though we were at the same show"

**Phase relevance:** Event API Integration phase. Must be solved before the event pipeline goes live.

**Confidence:** HIGH -- this is a well-documented problem in event aggregation. Soundcharts, PredictHQ, and others have invested heavily in NLP-based deduplication.

**Sources:**
- [Soundcharts Music Data API Guide](https://soundcharts.com/en/blog/music-data-api)
- [PredictHQ Concerts API](https://www.predicthq.com/events/concerts)

---

### CRITICAL-5: Event Timezone Handling Causes Wrong "Is Happening Now" Logic

**What goes wrong:** A concert is stored as `event_date DATE` (just the date, no time, no timezone). The "live now" / "happening tonight" feed logic compares this against `CURRENT_DATE` on the PostgreSQL server, which uses the server's timezone (likely UTC on Railway.app). A concert at 8 PM in Los Angeles on January 15 appears as "tomorrow" to a user in LA at 7 PM because the server is already on January 16 UTC.

**Why it happens:** The existing schema stores `show_date DATE` and `event_date DATE` -- neither has time or timezone information. The "is this show today?" comparison uses `CURRENT_DATE` in PostgreSQL, which respects the server's `timezone` setting, not the venue's timezone.

**Consequences:**
- "Happening Now" and "Tonight's Shows" features show wrong events
- Check-in windows open/close at the wrong time (user can't check in to a show that's currently happening because the server thinks it's tomorrow)
- Badge calculations for "Night Owl" (check-in after midnight) use server midnight, not venue midnight
- Notifications for "your friend just checked in at a show near you" fire at wrong times

**Prevention:**
1. Store event timestamps as `TIMESTAMP WITH TIME ZONE`, not `DATE`
2. Store the venue's IANA timezone identifier (e.g., `America/Los_Angeles`) on the venues table -- the existing schema does NOT have this column
3. Add `timezone VARCHAR(50)` to the venues table (IANA format, not UTC offset)
4. For "happening now" queries, convert to venue local time: `event_start_time AT TIME ZONE venue.timezone`
5. For check-in window validation, use the venue's timezone, not the user's or server's
6. The existing `shows` table stores `doors_time TIME`, `start_time TIME`, `end_time TIME` -- these are local times without timezone context. They must be interpreted relative to the venue's timezone
7. API responses should include both UTC timestamp and venue timezone so the mobile app can display correctly

**Detection:**
- Events appearing on the wrong date in the feed for users in timezones far from UTC
- Check-in validation rejecting valid check-ins because "the show isn't today"
- "Tonight" showing tomorrow's events for US West Coast users in the evening

**Specific to SoundCheck codebase:** The schema uses `DATE` for event dates and `TIME` (without timezone) for start/end times. The `EventService.ts` compares against `CURRENT_DATE` in SQL. The migration script creates `event_date DATE`. All of these need timezone awareness.

**Phase relevance:** Data Model Redesign phase. Must be addressed when redesigning the events schema.

**Confidence:** HIGH -- verified from existing schema analysis and timezone handling best practices.

**Sources:**
- [Moesif: Handling Timezone in APIs](https://www.moesif.com/blog/technical/timestamp/manage-datetime-timestamp-timezones-in-api/)
- [DEV: Handle Date and Time Correctly](https://dev.to/kcsujeet/how-to-handle-date-and-time-correctly-to-avoid-timezone-bugs-4o03)

---

## High-Severity Pitfalls

Mistakes that cause significant rework or undermine the product's core value. Not as catastrophic as Critical, but still cause weeks of wasted effort.

---

### HIGH-1: Badge Farming Through Rapid-Fire Fake Check-ins

**What goes wrong:** Without location verification and rate limiting, users create dozens of check-ins in minutes to farm badges. A single user checks in to "50 unique venues" by submitting check-ins to every venue in the database from their couch. The leaderboard becomes meaningless, legitimate users lose motivation, and the badge system's social signal erodes.

**Why it happens:** The existing SoundCheck `CheckinService.createCheckin()` accepts `checkinLatitude` and `checkinLongitude` as optional parameters but does not validate them against the venue's location. There is no rate limiting on check-in creation beyond the general API rate limiter. The badge system (`BadgeService.checkAndAwardBadges()`) counts rows without verifying temporal or geographic plausibility.

**Consequences:**
- Leaderboards dominated by cheaters, legitimate users disengage
- Badge rarity indicators become meaningless (everyone has every badge)
- Social proof signals ("100 people checked in here tonight") are inflated
- App Store reviewers may flag the app if the social features appear artificial

**Prevention:**
1. **Location verification on check-in**: Require location within a configurable radius of the venue (e.g., 500m for outdoor festivals, 200m for clubs). The `LocationService` already calculates distance -- wire it to validation
2. **Time-window enforcement**: Check-ins only valid within a window around the event time (e.g., 2 hours before doors to 4 hours after start time)
3. **Per-user rate limits on check-ins**: Maximum 3 check-ins per day (reasonable for a music festival with multiple stages, unreasonable for farming)
4. **Server-side mock location detection**: Flag check-ins where the GPS accuracy is suspiciously perfect (exactly 0.0 accuracy) or where the user "teleports" between distant venues
5. **Delay badge evaluation**: Don't award badges synchronously on check-in. Run badge evaluation as a background job with a 15-minute delay -- this allows time for fraud detection and prevents the instant gratification that motivates farming
6. **Badge categories that resist farming**: Event-presence badges (you were at an event that actually happened on that date) are harder to farm than pure count badges. Require the event to exist in the events table with a verified date
7. **Social validation signals**: Show "verified" badge on check-ins that have location verification. This creates a soft social pressure to check in legitimately

**Detection:**
- Users with implausibly high check-in counts relative to their account age
- Check-ins with null or missing location data
- Multiple check-ins from the same user at venues hundreds of miles apart within hours
- Badge earning velocity that exceeds what's physically possible

**Phase relevance:** Gamification/Badges phase. But the location verification foundation must be laid in the Check-in Experience phase.

**Confidence:** HIGH -- this is the most common failure mode in check-in apps, documented extensively from Foursquare's early days through Untappd.

**Sources:**
- [Guardsquare: Prevent Geo-Spoofing](https://www.guardsquare.com/blog/securing-location-trust-to-prevent-geo-spoofing)
- [LinkedIn: Beat the Cheat in Gamification](https://www.linkedin.com/pulse/beat-cheat-stop-gaming-gamification-michael-wu-phd)
- [arXiv: Longitudinal Analysis of Gamification in Untappd](https://arxiv.org/html/2601.04841v1)

---

### HIGH-2: The Dual Rating Friction Trap

**What goes wrong:** The app asks users to rate both the band performance AND the venue experience on every check-in. This doubles the friction of the core action (checking in). Completion rates drop, users give identical ratings to both, or they skip ratings entirely. The dual rating system produces either no data or meaningless data.

**Why it happens:** The product vision correctly identifies that band performance and venue experience are independent signals. But the UX implementation asks for both ratings at the wrong moment -- during the quick check-in flow when the user wants to tell their friends "I'm here."

**Consequences:**
- Check-in completion rate drops (users abandon mid-flow)
- Rating data quality suffers (users give 5/5 to both or skip both)
- The core value proposition ("quick check-in, share with friends") is undermined by a 30-second rating task
- Users rate the band 1 star because the venue's sound system was bad, or rate the venue low because the opener was boring -- cross-contamination of signals

**Prevention:**
1. **Separate the check-in from the rating**: The check-in should be ONE TAP: "I'm at [event]." Done. That's the social signal
2. **Offer ratings as optional enrichment AFTER the check-in**: "Want to rate this show?" appears as a card in the feed or a notification 30 minutes after check-in
3. **Make ratings dead simple**: Thumbs up/down for quick signal, with an OPTIONAL 5-star drill-down for users who want to be detailed
4. **Prompt at the right moment**: Push a notification after the show ends (based on event end time) asking "How was [band] at [venue]?" -- this is when the user has the full experience to rate
5. **Default to single combined rating**: Show one rating input by default. Offer "Rate band and venue separately" as an expandable option for power users
6. **The existing mobile `CheckIn` model already handles this well**: `venueRating` and `bandRating` are both nullable, and there's a computed `rating` getter that averages them. Keep this flexibility on the backend, but don't force both on the frontend

**Detection:**
- Check-in abandonment rate > 20% (users start but don't finish)
- > 60% of check-ins have identical band and venue ratings
- Significant portion of check-ins have no ratings at all
- User interviews reveal "it asks too many questions"

**Phase relevance:** Check-in Experience phase. The UX for ratings must be designed before the gamification layer is built on top of it.

**Confidence:** HIGH -- established UX research on rating system friction.

**Sources:**
- [Appcues: 5 Stars vs Thumbs](https://www.appcues.com/blog/rating-system-ux-star-thumbs)
- [UX Collective: Rating System Design](https://uxdesign.cc/designing-the-user-experience-of-a-rating-system-2c6a4d33bb11)
- [Smart Interface Design Patterns: Reviews and Ratings](https://smart-interface-design-patterns.com/articles/reviews-and-ratings-ux/)

---

### HIGH-3: Feed N+1 Query Problem at Scale

**What goes wrong:** The social feed query in `CheckinService.getActivityFeed()` already joins 5 tables (checkins, users, venues, bands, toasts, comments) with COUNT aggregations. As the user base grows, this query gets progressively slower. Adding event data, badge data, and vibe tags to the feed response means either more JOINs (making the query exponentially slower) or N+1 queries (one per check-in to fetch its related data).

**Why it happens:** The current implementation does all feed enrichment in a single SQL query with LEFT JOINs and GROUP BY. This works for small datasets but degrades as the cross-join product grows. The Haversine formula in the "nearby" feed filter makes the query impossible to index efficiently.

**Consequences:**
- Feed load times exceed 2 seconds as the database grows past 100K check-ins
- Database CPU spikes during peak hours (Friday/Saturday nights when concerts happen)
- Users experience "empty feed" because the query times out
- Adding new feed features (badges earned, event details) makes it worse

**Prevention:**
1. **Denormalize the feed**: Create a `feed_items` materialized table that pre-computes the feed. Update it asynchronously when check-ins, toasts, or comments are created
2. **Use cursor-based pagination** instead of OFFSET (the existing implementation uses OFFSET, which gets slower as pages increase)
3. **Cache the "friends" feed** in Redis with a TTL of 30-60 seconds. Most users refresh within that window, and the feed doesn't need to be real-time to the second
4. **Separate the counts**: Don't COUNT toasts and comments in the feed query. Store denormalized counts on the checkins table (already partially done -- `toast_count` and `comment_count` columns exist)
5. **Move location filtering to PostGIS**: The Haversine formula in raw SQL cannot use indexes. PostGIS's spatial indexes make "nearby" queries orders of magnitude faster
6. **Fetch enrichment data separately**: Load the feed skeleton (check-in IDs, timestamps) first, then batch-load related data (badges, vibes, events) in parallel

**Detection:**
- Feed endpoint P95 latency > 500ms
- Database slow query log shows the feed query regularly
- `EXPLAIN ANALYZE` on the feed query shows sequential scans on large tables
- Users report slow or empty feeds on Friday/Saturday nights

**Specific to SoundCheck codebase:** The `getActivityFeed()` method already has the Haversine formula for nearby filtering with a 64.4km radius. This cannot use any standard B-tree index. The method also counts toasts and comments via LEFT JOIN + COUNT(DISTINCT), which creates a massive cross-join even when there are few results.

**Phase relevance:** Social Feed phase. But the denormalization strategy should be planned during the Data Model Redesign phase.

**Confidence:** HIGH -- directly observed in the codebase, and this is the most common scaling bottleneck for social feed apps.

---

### HIGH-4: App Store Rejection for Flutter-Specific Issues

**What goes wrong:** The app is submitted to Apple's App Store and rejected for Flutter-specific issues that are invisible during development: debug banners in screenshots, non-public API usage from specific Flutter versions, missing account deletion functionality, or privacy manifest issues from third-party SDKs.

**Why it happens:** Flutter apps face additional scrutiny from Apple's review process. Specific Flutter versions (3.24.3, 3.24.4) have been flagged for using non-public APIs (Guideline 2.5.1). The review process catches things that work perfectly in development but violate Apple's policies.

**Consequences:**
- 1-2 week delay per rejection cycle (24-72 hours per re-review, often multiple rounds)
- Launch timeline slips by weeks or months
- Demoralization of the team, especially if rejections seem arbitrary

**Prevention:**
1. **Pin Flutter to a known-good version**: Avoid 3.24.3 and 3.24.4. Check Flutter GitHub issues for App Store rejection reports before upgrading
2. **Account deletion is mandatory**: Apple requires account deletion if the app supports account creation. The existing `deletion_requests` table and `DataRetentionService` suggest this is partially implemented -- verify the full flow works end-to-end including the UI
3. **Remove debug banner**: Ensure `debugShowCheckedModeBanner: false` in release builds (seems basic, but it's a top rejection reason for Flutter apps)
4. **Privacy manifest for all SDKs**: Starting 2025/2026, Apple requires SDK privacy manifests. Audit every dependency (Geolocator, Sentry, analytics) for manifest compliance
5. **Provide demo credentials in App Review Notes**: If the app requires login, Apple needs a test account to review the app
6. **Test on real devices, not just simulators**: Simulators miss issues that only show up on hardware
7. **As of April 2026**: All submissions must use the iOS 26 SDK or later
8. **New age ratings**: Complete the updated age rating questionnaire by January 31, 2026

**Detection:**
- No pre-submission checklist exists
- Flutter version has known App Store issues
- Account deletion flow is incomplete or untested
- No demo account prepared for Apple review

**Phase relevance:** Every phase that produces a deployable build. But a dedicated "App Store Readiness" checklist should be created in the UX Redesign phase.

**Confidence:** HIGH -- Flutter + App Store rejection is extensively documented.

**Sources:**
- [NextNative: App Store Review Guidelines Checklist](https://nextnative.dev/blog/app-store-review-guidelines)
- [Flutter GitHub Issue #158423: Guideline 2.5.1 Rejection](https://github.com/flutter/flutter/issues/158423)
- [Adapty: App Store Review Guidelines 2026](https://adapty.io/blog/how-to-pass-app-store-review/)
- [CrustLab: iOS App Store Review Guidelines 2026](https://crustlab.com/blog/ios-app-store-review-guidelines/)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or user experience degradation. Important but recoverable.

---

### MOD-1: Events Without Lineup Support (Single-Band-Per-Event Model)

**What goes wrong:** The existing data model (`shows` table and `events` migration) assumes one band per event. But concerts frequently have multi-band lineups: headliner + opener(s), festival stages with 5+ acts, DJ lineups with rotating sets. The single-band model forces users to check in to multiple "events" for one night at a venue, fragmenting the social experience.

**Why it happens:** The `shows` table has a `UNIQUE(venue_id, band_id, event_date)` constraint, and the `events` migration has the same. Each row is one band at one venue on one date. A three-band show requires three rows, and there's no way to group them as "one event."

**Consequences:**
- User has to find and check in to each band separately (friction)
- "Who was at this show?" is impossible to answer because check-ins are split across band-specific events
- Festival check-ins are unusable (checking in to each of 30 bands on a festival day?)
- Badge "Festival Warrior" (check in to N shows in one day) rewards festival-goers disproportionately for what is really one event

**Prevention:**
1. Redesign the event model to support lineups:
   - `events` table: `id, venue_id, event_date, event_name, ...` (NO band_id)
   - `event_lineup` junction table: `event_id, band_id, set_order, set_time, is_headliner`
   - Check-in references `event_id`, with optional `band_id` for per-set ratings
2. The unique constraint becomes `UNIQUE(venue_id, event_date, event_name)` or a more sophisticated dedup key
3. Check-in flow: "Check in to [event]" with optional "Rate individual sets" expansion
4. Badge logic counts unique events, not unique event-band combinations

**Detection:**
- Schema has band_id directly on the events table
- No junction table for lineups
- Festival events create dozens of records for one actual event

**Phase relevance:** Data Model Redesign phase. This is the most important structural change.

**Confidence:** HIGH -- directly observed in the existing schema.

---

### MOD-2: Ticketmaster API Rate Limits and Deep Paging Limitation

**What goes wrong:** The Ticketmaster Discovery API has a default quota of 5000 API calls per day and a rate limit of 5 requests per second. For an event data pipeline that needs to ingest concerts across multiple cities, this budget is exhausted quickly. Additionally, the Discovery API only supports retrieving up to the 1000th result (deep paging limitation), meaning you cannot paginate beyond 1000 events for a given search.

**Why it happens:** Teams assume the API can be queried like a database -- fetching all concerts in a region, paginating through thousands of results. The rate limits and paging limits are hard constraints that cannot be negotiated without a partnership tier.

**Consequences:**
- Event ingestion job fails or takes days to complete
- Missing events for less popular artists or smaller venues (outside the first 1000 results)
- API key gets throttled or banned, blocking all event data updates
- Users see stale event data because the pipeline can't keep up

**Prevention:**
1. **Batch and cache aggressively**: Ingest events by narrow geographic regions and date ranges to stay under the 1000-result paging limit
2. **Use incremental sync**: Query for events changed since last sync (if API supports it), not full re-ingestion
3. **Respect rate limits with exponential backoff**: 429 responses should trigger backoff, not retries
4. **Supplement with Bandsintown**: Bandsintown's API focuses on artist-specific events, which complements Ticketmaster's venue/region-based approach
5. **Store API response metadata**: Track last-synced timestamp per region to enable efficient delta syncs
6. **Consider PredictHQ or JamBase for production**: PredictHQ aggregates 200+ sources and handles deduplication -- this may be more cost-effective than building your own multi-API pipeline

**Phase relevance:** Event API Integration phase.

**Confidence:** MEDIUM -- based on API documentation and developer reports, not direct testing.

**Sources:**
- [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
- [PredictHQ vs Ticketmaster](https://www.predicthq.com/compare/ticketmaster-vs-predicthq)

---

### MOD-3: Real-Time Feed Creates Notification Overload

**What goes wrong:** The "FOMO feed" concept -- showing friends checking in at shows in real-time -- quickly becomes annoying if users follow many people. On a busy concert night (Friday or Saturday), a user with 50 friends might receive 20+ notifications and see a feed flooded with check-ins, all within a 2-hour window. Instead of FOMO, users feel overwhelmed and mute notifications entirely.

**Why it happens:** The product is designed to create urgency ("your friend is at a show RIGHT NOW!"). But the notification system (already implemented via WebSocket) doesn't aggregate or prioritize. Every toast, comment, and friend check-in generates a separate notification.

**Consequences:**
- Users disable notifications, removing a key engagement mechanism
- Feed becomes unreadable during peak hours
- The app feels spammy rather than social
- Notification fatigue leads to app uninstalls

**Prevention:**
1. **Aggregate notifications**: "3 friends checked in tonight" instead of 3 separate notifications
2. **Smart notification batching**: During high-activity periods (Friday 7-11 PM), batch notifications every 15-30 minutes instead of real-time
3. **Priority system**: Differentiate between high-priority (close friend at a nearby show) and low-priority (acquaintance at a show 100 miles away)
4. **Notification caps**: Maximum 5 notifications per hour per user, with aggregation for any beyond that
5. **FOMO without the noise**: Show "3 friends are at shows tonight" as a persistent banner in the app, not a push notification for each one
6. **Mute controls**: Let users mute specific friends, event types, or time windows

**Detection:**
- Notification opt-out rate > 30%
- Users report "too many notifications" in reviews
- WebSocket message volume spikes on weekends, causing performance issues
- Feed engagement (toasts, comments) drops despite high check-in volume

**Phase relevance:** Social Feed phase.

**Confidence:** MEDIUM -- based on social app notification design patterns, not concert-app-specific data.

---

### MOD-4: Denormalized Stats Drift Out of Sync

**What goes wrong:** The existing schema has denormalized counters on multiple tables: `users.total_checkins`, `users.unique_bands`, `users.unique_venues`, `bands.total_checkins`, `bands.average_rating`, `venues.total_checkins`, `venues.average_rating`, `checkins.toast_count`, `checkins.comment_count`. These are maintained by PostgreSQL triggers. When data is modified outside the trigger path (bulk updates, manual fixes, migration scripts, or deleted records), the counters drift.

**Why it happens:** Triggers only fire on the specific operations they're bound to. The `update_user_stats_on_checkin` trigger only fires on INSERT to checkins. A DELETE of a check-in does NOT decrement the user's `total_checkins` counter. A bulk migration that moves check-ins between events will leave all counters stale.

**Consequences:**
- User profiles show wrong stats (saw 50 bands but profile says 47)
- Venue/band ratings are incorrect after bulk operations
- Leaderboards are unfair -- users who had check-ins migrated lose credit
- Debugging requires manual SQL to find and fix discrepancies

**Prevention:**
1. **Add DELETE triggers**: The existing `update_user_stats_on_checkin` only handles INSERT. Add corresponding DELETE triggers that decrement counters
2. **Create a reconciliation job**: A scheduled job (weekly or after migrations) that recalculates all denormalized counters from source data
3. **Use the reconciliation job after every migration**: Include `CALL reconcile_all_stats()` as the final step of any migration script
4. **Consider replacing triggers with application-level updates**: Triggers are invisible to developers and create hidden coupling. A service-level `updateStats()` method is easier to maintain and test
5. **Log counter discrepancies**: Alert when a recalculation changes a counter by more than 5% -- this indicates a systematic bug

**Detection:**
- User profile stats don't match actual check-in count
- Venue total_checkins decreases after running migrations
- Badge progress shows 49/50 but the user clearly has 50 check-ins

**Specific to SoundCheck codebase:** The `update_user_stats_on_checkin` trigger runs subqueries for unique_bands and unique_venues on every INSERT, which is also a performance concern at scale. These COUNT(DISTINCT) subqueries will get slower as the checkins table grows.

**Phase relevance:** Data Model Redesign phase (add DELETE triggers), then ongoing monitoring.

**Confidence:** HIGH -- directly observed in the trigger code.

---

### MOD-5: Badge System Doesn't Support the Check-in Model Shift

**What goes wrong:** The existing `BadgeService` checks badges against `reviews` table (review_count, unique_venues_reviewed, unique_bands_reviewed). But the new model replaces reviews with check-ins as the core action. The badge types in the seed data (checkin_count, unique_bands, unique_venues, vibe-specific) don't match the badge types the service checks (review_count, venue_explorer, music_lover). This mismatch means no badges will ever be awarded after the model shift.

**Why it happens:** The badge service was built for the review model and never updated when the check-in model was introduced. The seed data defines badge_types like `checkin_count` but the service queries for `review_count`.

**Consequences:**
- Zero badges awarded after the data model migration
- Badge progress always shows 0%
- Users lose all earned badges if the reviews table is dropped
- The gamification system is silently broken with no error -- it just returns empty arrays

**Prevention:**
1. Rewrite `BadgeService.getUserStats()` to query the `checkins` table instead of `reviews`
2. Update badge_type identifiers to match the new model (or add a mapping layer)
3. Create a migration that preserves existing user_badges records
4. Add integration tests that verify badge award flow end-to-end (create check-in -> check badges -> verify badge awarded)
5. Add concert-specific badge types that the new model enables:
   - Genre-based: Query `checkins JOIN events JOIN bands WHERE genre = X`
   - Time-based: "Night Owl" via `checkins.created_at` timezone-aware
   - Social: "Social Butterfly" via toast count on user's check-ins
   - Loyalty: "Loyal Fan" via COUNT of check-ins for same band_id

**Detection:**
- Badge progress always shows 0% for all users
- `BadgeService.checkAndAwardBadges()` always returns empty array
- Integration tests for badge flow don't exist or are skipped

**Phase relevance:** Must be resolved when Gamification phase begins. Foundation must be laid in Data Model Redesign phase (ensure badge queries can target the new schema).

**Confidence:** HIGH -- directly observed in the codebase (BadgeService queries reviews table, not checkins).

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable without significant rework.

---

### MINOR-1: Overly Generous Check-in Location Radius

**What goes wrong:** The location verification radius is set too large (e.g., 500m+) to "be generous." Users check in from the parking lot, from a bar across the street, or from their home if they live near a venue. The check-in loses its "I'm here right now" authenticity.

**Prevention:** Start with 200m radius for standard venues, 500m for outdoor festivals/stadiums. Make it configurable per venue type. Log the actual distance for analytics so you can tune later.

**Phase relevance:** Check-in Experience phase.

---

### MINOR-2: Missing Venue Type on Location Verification

**What goes wrong:** A 200m radius works for a small club but not for a 50-acre outdoor festival venue. A single radius setting for all venue types leads to either false rejections at large venues or overly permissive validation at small ones.

**Prevention:** Use the existing `venue_type` column (concert_hall, club, arena, outdoor, bar, theater, stadium) to set different verification radii. Stadiums and outdoor venues get 1km, clubs get 200m.

**Phase relevance:** Check-in Experience phase.

---

### MINOR-3: User-Created Events Without Moderation

**What goes wrong:** The app allows users to create events (to fill gaps where APIs don't have coverage). Without moderation, users create fake events, duplicate events, or test events that pollute the database. Spam events appear in search and discovery.

**Prevention:** User-created events start as "unverified" and don't appear in public discovery feeds until either (a) multiple users check in (social proof), (b) a moderator approves, or (c) the event matches an API source. Show user-created events only to the creator and their followers until verified.

**Phase relevance:** Event API Integration phase.

---

### MINOR-4: Photo Uploads Without Size/Content Limits

**What goes wrong:** Users upload 10MB concert photos from their phone camera. The backend stores them (or runs out of storage). No content moderation means inappropriate photos appear in the public feed.

**Prevention:** Client-side compression before upload (the existing `image_compression.dart` suggests this is partially addressed). Server-side size limit (2MB). Store in cloud storage (S3/Cloudflare R2), not in PostgreSQL. Content moderation via API (AWS Rekognition, Google Vision) for public-facing photos.

**Phase relevance:** Check-in Experience phase.

---

### MINOR-5: Ignoring Cancelled/Rescheduled Events

**What goes wrong:** An event is ingested from Ticketmaster, users plan to attend and add it to their wishlist, then the event is cancelled or rescheduled. The app still shows the old date, users show up to nothing, and any check-ins for the cancelled event are orphaned.

**Prevention:** Periodic re-sync of event data from APIs (at least daily for events within 7 days). Add `is_cancelled` and `is_rescheduled` status fields (partially exists on `shows` table). Send notifications to users who wishlisted or planned to attend. Archive cancelled event check-ins with a flag rather than deleting them.

**Phase relevance:** Event API Integration phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Data Model Redesign | Dual table confusion (shows vs events) | CRITICAL | Resolve before any feature work. Single source of truth. |
| Data Model Redesign | Migration breaks running app | CRITICAL | Expand-contract pattern. lock_timeout on DDL. |
| Data Model Redesign | Timezone in DATE columns | CRITICAL | Add IANA timezone to venues. Use TIMESTAMP WITH TIME ZONE. |
| Data Model Redesign | Denormalized stats drift | MODERATE | Add DELETE triggers. Create reconciliation job. |
| Event API Integration | Songkick API unavailable | CRITICAL | Drop from plan. Use Ticketmaster + Bandsintown. |
| Event API Integration | Duplicate events across sources | CRITICAL | Composite dedup key. Fuzzy matching. Venue alias table. |
| Event API Integration | Ticketmaster rate limits | MODERATE | Batch by region. Incremental sync. Cache aggressively. |
| Event API Integration | Cancelled event handling | MINOR | Daily re-sync. Notification to wishlisted users. |
| Check-in Experience | Dual rating friction | HIGH | Separate check-in from rating. Optional enrichment after. |
| Check-in Experience | Location spoofing | HIGH | Multi-source validation. Mock location detection. Rate limits. |
| Check-in Experience | Venue type affects radius | MINOR | Per-type configurable radius. |
| Gamification/Badges | Badge farming | HIGH | Time windows. Location verification. Delayed evaluation. |
| Gamification/Badges | Badge service queries wrong table | HIGH | Rewrite to query checkins, not reviews. |
| Gamification/Badges | Single-band events break festival badges | MODERATE | Lineup junction table. Event-level check-ins. |
| Social Feed | N+1 query performance | HIGH | Denormalize feed. Cursor pagination. Redis cache. |
| Social Feed | Notification overload | MODERATE | Aggregate. Batch. Cap. Priority system. |
| UX / App Store | Flutter-specific rejection | HIGH | Version pinning. Privacy manifest. Account deletion. Demo account. |
| UX / App Store | Photo moderation | MINOR | Size limits. Cloud storage. Content moderation API. |

---

## Codebase-Specific Risk Summary

Issues identified directly in the existing SoundCheck code that must be addressed:

| File | Issue | Severity |
|------|-------|----------|
| `database-schema.sql` | `shows` table and `events` migration create parallel models | CRITICAL |
| `database-schema.sql` | `event_date DATE` has no timezone info | CRITICAL |
| `database-schema.sql` | Events have single band_id, no lineup support | MODERATE |
| `migrate-events-model.ts` | No transaction wrapping, no rollback capability | CRITICAL |
| `migrate-events-model.ts` | Creates duplicate of `checkins` table structure | CRITICAL |
| `CheckinService.ts` | Writes to band_id/venue_id directly, no event_id | CRITICAL |
| `CheckinService.ts` | Activity feed uses Haversine in raw SQL (unindexable) | HIGH |
| `CheckinService.ts` | No location verification against venue coordinates | HIGH |
| `BadgeService.ts` | Queries `reviews` table, not `checkins` table | HIGH |
| `BadgeService.ts` | Badge types don't match seed data types | HIGH |
| `EventService.ts` | Wraps `shows` table but exports as "events" API | MODERATE |
| `database-schema.sql` | Trigger only handles INSERT, not DELETE | MODERATE |
| `database-schema.sql` | COUNT(DISTINCT) subqueries in trigger (slow at scale) | MODERATE |

---

## Sources

### Concert API Ecosystem
- [Songkick Developer Page](https://www.songkick.com/developer)
- [Bandsintown API Documentation](https://help.artists.bandsintown.com/en/articles/9186477-api-documentation)
- [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
- [PredictHQ Concerts API](https://www.predicthq.com/events/concerts)
- [JamBase Data API](https://data.jambase.com/data-api/)
- [Soundcharts Music Data API Guide](https://soundcharts.com/en/blog/music-data-api)

### PostgreSQL Migration
- [DEV: Zero-Downtime Database Migration Guide](https://dev.to/ari-ghosh/zero-downtime-database-migration-the-definitive-guide-5672)
- [Xata: Zero Downtime Schema Migrations PostgreSQL](https://xata.io/blog/zero-downtime-schema-migrations-postgresql)
- [Uptrace: Zero-Downtime PostgreSQL Migrations](https://bun.uptrace.dev/postgres/zero-downtime-migrations.html)
- [PostgresAI: lock_timeout and retries](https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries)

### Timezone Handling
- [Moesif: Manage Datetime Timestamps Timezones in APIs](https://www.moesif.com/blog/technical/timestamp/manage-datetime-timestamp-timezones-in-api/)
- [DEV: Handle Date and Time Correctly](https://dev.to/kcsujeet/how-to-handle-date-and-time-correctly-to-avoid-timezone-bugs-4o03)

### Gamification and Anti-Farming
- [arXiv: Longitudinal Ethical Analysis of Gamification in Untappd](https://arxiv.org/html/2601.04841v1)
- [Guardsquare: Prevent Geo-Spoofing in Mobile Apps](https://www.guardsquare.com/blog/securing-location-trust-to-prevent-geo-spoofing)
- [Approov: Stop Geo-Spoofing with API Integration](https://approov.io/blog/stop-geo-spoofing-with-secure-api-integration-for-mobile-application)
- [LinkedIn: Beat the Cheat in Gamification](https://www.linkedin.com/pulse/beat-cheat-stop-gaming-gamification-michael-wu-phd)
- [Game Developer: Why Badges Fail in Gamification](https://www.gamedeveloper.com/design/why-badges-fail-in-gamification-4-strategies-to-make-them-work-properly)

### Rating System UX
- [Appcues: 5 Stars vs Thumbs Up/Down](https://www.appcues.com/blog/rating-system-ux-star-thumbs)
- [UX Collective: Rating System Design](https://uxdesign.cc/designing-the-user-experience-of-a-rating-system-2c6a4d33bb11)
- [Smart Interface Design Patterns: Reviews and Ratings UX](https://smart-interface-design-patterns.com/articles/reviews-and-ratings-ux/)

### App Store & Flutter
- [NextNative: App Store Review Guidelines Checklist](https://nextnative.dev/blog/app-store-review-guidelines)
- [Flutter GitHub Issue #158423: Guideline 2.5.1](https://github.com/flutter/flutter/issues/158423)
- [Adapty: App Store Review Guidelines 2026](https://adapty.io/blog/how-to-pass-app-store-review/)
- [Medium: Flutter + Swift Passing iOS App Review](https://medium.com/@sharma-deepak/flutter-swift-in-2025-the-developers-guide-to-passing-ios-app-review-every-time-cb9bb4836046)

### Social Feed Architecture
- [AlgoMaster: Designing a Scalable News Feed System](https://blog.algomaster.io/p/designing-a-scalable-news-feed-system)
- [Medium: How Instagram Scales PostgreSQL](https://medium.com/@mamidipaka2003/inside-high-traffic-databases-how-instagram-scales-postgresql-beyond-limits-0a4af13696ff)
- [OneSignal: Lessons from 5 Years of Scaling PostgreSQL](https://onesignal.com/blog/lessons-learned-from-5-years-of-scaling-postgresql/)

### Competitor Analysis
- [Concert Archives](https://www.concertarchives.org/)
- [Setlist.fm](https://www.setlist.fm/)
- [Untappd](https://untappd.com/)
