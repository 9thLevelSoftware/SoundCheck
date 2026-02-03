# Phase 2: Event Data Pipeline - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reliable event ingestion pipeline from Ticketmaster Discovery API with deduplication, band name matching, and user-created events to fill gaps. Events are the content that makes check-ins useful. Does NOT include event display UI, check-in flow, or social features.

</domain>

<decisions>
## Implementation Decisions

### Metro area coverage
- User-driven coverage: sync events near where active users are located, coverage grows organically with the user base
- 50-mile radius around user locations defines the coverage area
- 30-day lookahead window for future events
- On-demand Ticketmaster lookup when a user tries to interact with an event outside synced coverage (no manual creation fallback needed for out-of-range)

### Band name matching
- Conservative matching: exact or very close matches only. Create new band records for anything uncertain rather than risk wrong matches
- Unmatched bands auto-created with minimal info (name only). Enrichment (genre, image, etc.) deferred to later
- Venues auto-created from Ticketmaster API data (name, address, coordinates) when not already in DB
- Store Ticketmaster external ID on events and venues for deduplication, updates, and potential deep links

### User-created events
- Any authenticated user can create events
- Minimum required: venue + date + at least one band
- Auto-merge user-created events with Ticketmaster events when same venue + date match detected. Ticketmaster data enriches the user-created record into one canonical event
- Subtle source indicator in the app (e.g., "Community event" vs official). Users should see the distinction but it shouldn't be prominent

### Sync behavior
- Cancellations and reschedules: mark status in DB (cancelled/rescheduled). Keep the record, existing check-ins remain but event shows updated status
- Past events kept forever — concert history powers profiles, stats, and the social experience
- On sync failure (API down or rate-limited): retry with exponential backoff, then skip. Catch up on next scheduled sync

### Claude's Discretion
- Exact sync frequency (balance API rate limits vs data freshness)
- Retry count and backoff intervals for failed syncs
- How user locations are aggregated into sync regions (clustering approach)
- pg_trgm similarity threshold for "very close" band name matching
- Ticketmaster API pagination strategy

</decisions>

<specifics>
## Specific Ideas

- Coverage should feel organic — users in a city get events for that city without any setup or city selection
- The on-demand lookup for out-of-range events means no user should ever be stuck without event data if Ticketmaster has it
- Band matching should err on the side of creating new records rather than merging incorrectly — duplicate bands are easier to fix than wrongly merged ones

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-event-data-pipeline*
*Context gathered: 2026-02-02*
