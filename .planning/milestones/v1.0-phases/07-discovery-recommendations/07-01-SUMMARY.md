---
phase: 07-discovery-recommendations
plan: 01
subsystem: discovery
tags: [aggregate-ratings, discovery-service, redis-cache, band-detail, venue-detail]
dependency-graph:
  requires: [01-data-model-foundation, 03-core-check-in-flow, 06-profile-concert-cred]
  provides: [band-aggregate-ratings, venue-aggregate-ratings, upcoming-shows-on-band-page, upcoming-events-on-venue-page, discovery-service]
  affects: [07-02, 07-03]
tech-stack:
  added: []
  patterns: [cache-aside-aggregate, fire-and-forget-invalidation, aggregate-from-checkins-not-reviews]
key-files:
  created:
    - backend/migrations/022_add_event_search_indexes.ts
    - backend/src/services/DiscoveryService.ts
  modified:
    - backend/src/utils/cache.ts
    - backend/src/controllers/BandController.ts
    - backend/src/controllers/VenueController.ts
    - backend/src/services/CheckinService.ts
    - backend/src/types/index.ts
    - mobile/lib/src/features/bands/domain/band.dart
    - mobile/lib/src/features/bands/presentation/band_detail_screen.dart
    - mobile/lib/src/features/venues/domain/venue.dart
    - mobile/lib/src/features/venues/presentation/venue_detail_screen.dart
decisions:
  - id: 07-01-01
    description: "Aggregate ratings always computed from checkin_band_ratings (bands) and checkins.venue_rating (venues), never from bands.average_rating or venues.average_rating"
  - id: 07-01-02
    description: "Mobile screens fall back to legacy averageRating when aggregate is null (graceful degradation for bands/venues with no check-in ratings yet)"
  - id: 07-01-03
    description: "Star ratings use AppTheme.toastGold color and rating label changes to 'Live Performance' (bands) or 'Experience' (venues) when aggregate data is present"
metrics:
  duration: 10 min
  completed: 2026-02-03
---

# Phase 7 Plan 1: Band & Venue Aggregate Ratings Summary

DiscoveryService computes aggregate live performance (band) and experience (venue) ratings from check-in data with 600s Redis cache-aside. Mobile band and venue detail screens display aggregate ratings, fan/visitor counts, and real upcoming events from backend.

## What Was Built

### Backend
1. **Migration 022**: GIN trigram index on `events.event_name` for fuzzy search + composite partial index on `events(event_date, is_cancelled)` for fast upcoming queries
2. **DiscoveryService**: New service with `getBandAggregateRating()` and `getVenueAggregateRating()`, both using `cache.getOrSet()` with 600s TTL
3. **BandController.getBandById**: Enriched with `aggregate` (avgPerformanceRating, totalRatings, uniqueFans) + `upcomingShows[]` via Promise.all
4. **VenueController.getVenueById**: Enriched with `aggregate` (avgExperienceRating, totalRatings, uniqueVisitors) + `upcomingEvents[]` via Promise.all
5. **Cache invalidation in CheckinService**: Fire-and-forget invalidation of `bandAggregate` and `venueAggregate` cache keys on: rating submission (PATCH /ratings), check-in deletion
6. **Types**: `BandAggregate` and `VenueAggregate` interfaces in `types/index.ts`
7. **Cache keys**: `CacheKeys.bandAggregate(bandId)` and `CacheKeys.venueAggregate(venueId)` in `cache.ts`

### Mobile
1. **Band model**: Added `BandAggregate`, `BandUpcomingShow`, `BandShowVenue` Freezed classes
2. **Venue model**: Added `VenueAggregate`, `VenueUpcomingEvent`, `VenueEventBand` Freezed classes
3. **BandDetailScreen**: Stats row shows aggregate Live Performance rating (toastGold stars), fan count, ratings count. New Upcoming Shows section with date badges, venue info, and navigation
4. **VenueDetailScreen**: Stats row shows aggregate Experience rating, visitor count from aggregate. Upcoming Events section now uses real backend data with date parsing, doors/start time, and ticket links

## Decisions Made

1. **[07-01-01] Aggregate source is check-in data only**: Band aggregate uses `checkin_band_ratings.rating`, venue aggregate uses `checkins.venue_rating`. Never reads from `bands.average_rating` or `venues.average_rating` (those are from the old reviews table).
2. **[07-01-02] Graceful null-aggregate fallback**: When `aggregate` is null (no ratings yet), screens display `averageRating` from the Band/Venue model as fallback. Rating label shows "Rating" instead of "Live Performance"/"Experience".
3. **[07-01-03] Star color standardization**: Switched rating stars from `electricPurple` to `toastGold` across both band and venue detail screens for visual consistency with rating semantics.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- Backend `npx tsc --noEmit`: PASS (zero errors)
- Mobile `dart run build_runner build --delete-conflicting-outputs`: PASS (37 outputs generated)
- Mobile `dart analyze lib/`: PASS (0 new errors; 9 pre-existing errors in unrelated discover/ feature)
- BandController enriches response with `aggregate` + `upcomingShows`: Confirmed
- VenueController enriches response with `aggregate` + `upcomingEvents`: Confirmed
- Aggregates use `checkin_band_ratings` / `checkins.venue_rating` (NOT old reviews): Confirmed
- Cache invalidation fires on rating changes: Confirmed in `addRatings()` and `deleteCheckin()`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b67eaa2 | Backend: migration, DiscoveryService, enhanced controllers, cache invalidation |
| 2 | b0c8c82 | Mobile: enhanced band/venue models and detail screens with aggregates + upcoming |

## Next Phase Readiness

Plan 07-02 (Event Discovery & Search) can proceed. The DiscoveryService and cache infrastructure are in place. The GIN trigram index on events.event_name is ready for fuzzy search implementation.
