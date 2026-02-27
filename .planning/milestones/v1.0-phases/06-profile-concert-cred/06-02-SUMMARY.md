# Phase 6 Plan 2: Concert Cred Mobile UI Summary

**One-liner:** ConcertCred Freezed model with GenreStat/TopRatedBand/TopRatedVenue nested types, ProfileRepository.getConcertCred endpoint integration, concertCredProvider, and full ProfileScreen redesign with server-sourced stats, genre breakdown bars, favorite bands/venues horizontal scrolls, badge showcase with View All, and recent check-ins.

## Metadata

- **Phase:** 06-profile-concert-cred
- **Plan:** 02
- **Started:** 2026-02-03T15:20:20Z
- **Completed:** 2026-02-03
- **Duration:** ~6 min
- **Tasks:** 2/2

## What Was Built

### Task 1: ConcertCred Freezed model, repository method, and provider
**Commit:** `27c71dd`

Created the full data pipeline from API endpoint to UI consumption:

- **ConcertCred domain model** (`concert_cred.dart`): Four sealed Freezed classes -- `GenreStat` (genre, count, percentage), `TopRatedBand` (id, name, genre, imageUrl, avgRating, timesSeen), `TopRatedVenue` (id, name, city, state, imageUrl, avgRating, timesVisited), and `ConcertCred` (totalShows, uniqueBands, uniqueVenues, badgesEarned, followersCount, followingCount, genres[], topBands[], topVenues[])
- **ApiConfig endpoint** (`api_config.dart`): Added `concertCred(userId)` method returning `/users/$userId/concert-cred`
- **ProfileRepository** (`profile_repository.dart`): Added `getConcertCred(String userId)` calling GET to concert-cred endpoint, parsing `response.data['data']`
- **profileRepositoryProvider** (`providers.dart`): New keepAlive provider for ProfileRepository
- **concertCredProvider** (`profile_providers.dart`): Riverpod provider watching profileRepositoryProvider, calls getConcertCred

### Task 2: Redesign ProfileScreen with concert cred sections
**Commit:** `c6cdf1a`

Redesigned the ProfileScreen as a concert resume:

- **Main Stats Row**: Now a ConsumerWidget sourcing totalShows, uniqueBands, uniqueVenues, badgesEarned from `concertCredProvider` with loading/error/data states
- **Genre Breakdown** (`_GenreBreakdown`): Server-side genre stats with percentage bars using `LinearProgressIndicator`, max 5 genres, electricPurple accent
- **Top Rated Bands** (`_TopRatedBands` + `_TopBandCard`): Horizontal scrollable cards with band image, name, genre tag, avg rating (neonPink accent), times seen count, tappable navigation to `/bands/:id`
- **Top Rated Venues** (`_TopRatedVenues` + `_TopVenueCard`): Horizontal scrollable cards with venue image, name, city/state, avg rating (toastGold accent), times visited count, tappable navigation to `/venues/:id`
- **Badge Showcase**: Preserved from existing code, Badges section header now has "View All" TextButton navigating to `/badges` (BadgeCollectionScreen)
- **Recent Check-ins**: Preserved from existing code, unchanged
- **Pull-to-refresh**: Invalidates concertCredProvider, userRecentCheckinsProvider, userBadgesProvider
- **Removed**: Wishlist mock section, client-side `_GenreStats` using `userGenreStatsProvider`, old `_MainStatsRow` reading from User model

## Key Files

### Created
- `mobile/lib/src/features/profile/domain/concert_cred.dart` - ConcertCred + nested Freezed models

### Modified
- `mobile/lib/src/core/api/api_config.dart` - concertCred endpoint helper
- `mobile/lib/src/core/providers/providers.dart` - profileRepositoryProvider
- `mobile/lib/src/features/profile/data/profile_repository.dart` - getConcertCred method
- `mobile/lib/src/features/profile/presentation/providers/profile_providers.dart` - concertCredProvider, deprecated userGenreStats
- `mobile/lib/src/features/profile/presentation/profile_screen.dart` - Full redesign with concert cred sections

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Deprecated userGenreStatsProvider instead of removing it | Other screens may still reference it; deprecation annotation guides future cleanup |
| Removed Wishlist mock section from profile | Was hardcoded mock data with no backend; reduces clutter in concert cred redesign |
| Badge "View All" navigates to /badges route | Matches existing BadgeCollectionScreen route registered in app router |
| Concert cred sections share single provider watch | All stats come from one API call; multiple widget watches share same cached result via Riverpod |
| profileRepositoryProvider added as keepAlive | Repository is stateless DioClient wrapper; keepAlive avoids recreation on each watch |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] profileRepositoryProvider missing from core providers**
- **Found during:** Task 1
- **Issue:** Plan referenced `profileRepositoryProvider` for concertCredProvider but no such provider existed in `providers.dart`
- **Fix:** Added `profileRepositoryProvider` as a `@Riverpod(keepAlive: true)` provider in `providers.dart`
- **Files modified:** `mobile/lib/src/core/providers/providers.dart`
- **Commit:** `27c71dd`

## Verification Results

- `flutter analyze`: 59 issues (all pre-existing warnings/infos, zero errors)
- `concertCredProvider` used in profile_screen.dart (8 references) and defined in profile_providers.dart
- `userGenreStatsProvider` returns 0 matches in profile_screen.dart (removed from UI)
- `concert-cred` endpoint referenced in ApiConfig
- `getConcertCred` method in profile_repository.dart
- Profile screen has `_GenreBreakdown`, `_TopRatedBands`, `_TopRatedVenues` sections
- Generated files: concert_cred.freezed.dart, concert_cred.g.dart exist (gitignored)

## Next Phase Readiness

Phase 6 is now complete (2/2 plans). Ready for Phase 7 (Discovery & Recommendations).
- Backend concert cred endpoint (06-01) and mobile UI (06-02) are fully wired
- Profile screen consumes server-side aggregates, no client-side computation
- Badge showcase navigates to full badge collection screen
