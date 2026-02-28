---
phase: 11-platform-trust-between-show-retention
verified: 2026-02-28T16:30:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Open Discover screen — verify Trending Shows Near You section renders at top with event cards"
    expected: "Horizontal scrollable card list showing event name, venue, date, RSVP count, friend signals, and distance; ordered by Wilson-scored composite"
    why_human: "Visual layout and actual ranking order (Wilson score) cannot be verified without running the app with real or seeded data"
  - test: "Search for a band with a deliberate typo (e.g., 'radioheed')"
    expected: "Radiohead appears in results via fuzzy similarity fallback"
    why_human: "Fuzzy fallback path requires database with pg_trgm extension and real data"
  - test: "On a venue detail screen, tap 'Claim this venue', fill in evidence, and submit"
    expected: "SnackBar appears with 'Claim submitted! We'll review it shortly.' and screen pops back"
    why_human: "Form submission flow and SnackBar feedback require a running app against the backend"
  - test: "Admin: navigate to /api/admin/claims and approve a pending claim"
    expected: "Claim status becomes 'approved'; venue/band record has claimed_by_user_id set; badge appears on profile"
    why_human: "Admin approval flow requires database state verification; visual badge requires running app"
---

# Phase 11: Platform Trust & Between-Show Retention — Verification Report

**Phase Goal:** Users stay engaged between concerts via trending shows, the platform gains credibility through verified venue/artist profiles, and search/feed performance scales
**Verified:** 2026-02-28T16:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | verification_claims table exists with pending/approved/denied workflow | VERIFIED | `backend/migrations/033_verification-claims-and-claimed-profiles.ts` — full table DDL with CHECK constraints and partial unique index `idx_claims_one_pending` |
| 2 | venues and bands tables have claimed_by_user_id column | VERIFIED | Migration 033 — `ALTER TABLE venues ADD COLUMN claimed_by_user_id UUID REFERENCES users(id)` and same for bands |
| 3 | bands, venues, and events tables have tsvector GENERATED STORED columns with GIN indexes | VERIFIED | `backend/migrations/034_search-tsvector-columns.ts` — all three tables use `GENERATED ALWAYS AS ... STORED` with GIN indexes `idx_bands_search_vector`, `idx_venues_search_vector`, `idx_events_search_vector` |
| 4 | bands table has genres TEXT[] column backfilled from genre column | VERIFIED | `backend/migrations/035_genre-array-migration.ts` — adds `genres TEXT[]`, backfills via `string_to_array(genre, ', ')`, old `genre` column retained |
| 5 | reviews table has owner_response and owner_response_at columns | VERIFIED | `backend/migrations/036_review-owner-response.ts` — both columns added |
| 6 | wilson_lower_bound SQL function exists | VERIFIED | Migration 033 — IMMUTABLE plpgsql function with z=1.96, RETURN 0 guard for n=0 |
| 7 | TypeScript types for VerificationClaim, SearchResult, TrendingEvent exist | VERIFIED | `backend/src/types/index.ts` lines 430-490 — ClaimStatus, VerificationClaim, TrendingEvent, SearchResults, OwnerReviewResponse exported; Venue/Band/Review interfaces updated with claimedByUserId/ownerResponse fields |
| 8 | GET /api/trending returns events ranked by Wilson-scored composite | VERIFIED | `TrendingService.getTrendingNearUser` calls `wilson_lower_bound()` with weighted positive=(rsvp*3+velocity*2+friend*5) and applies proximity decay; route mounted at `app.use('/api/trending', trendingRoutes)` in index.ts |
| 9 | Feed queries use c.toast_count and c.comment_count instead of COUNT(DISTINCT) JOINs | VERIFIED | FeedService lines 100-101, 180-181; CheckinQueryService lines 42-43, 147-148, 209-210 — all read `c.toast_count, c.comment_count` directly; no `COUNT(DISTINCT t.id)` patterns remain |
| 10 | GET /api/search returns categorized results using tsvector + pg_trgm fuzzy fallback | VERIFIED | SearchService uses CTE pattern: `fts_results` with `websearch_to_tsquery` UNION ALL `fuzzy_results` with `similarity(name, $1) > 0.3`; route mounted at `app.use('/api/search', searchRoutes)` |
| 11 | Complete claim lifecycle: user submit, admin approve/deny with transaction | VERIFIED | ClaimService.submitClaim enforces one-pending-per-entity; ClaimService.reviewClaim uses BEGIN/COMMIT transaction updating both claim status AND entity `claimed_by_user_id`; admin routes use `requireAdmin()` middleware |
| 12 | Trending Shows visible in Discover screen; search shows categorized results in mobile | VERIFIED | `discover_screen.dart` line 847 includes `const TrendingFeedSection()`; search_screen.dart renders Bands/Venues/Events sections from unified provider calling `GET /search` (base URL includes `/api`) |
| 13 | Claim submission, status tracking, and verification badges in mobile | VERIFIED | ClaimRepository calls `POST /claims` and `GET /claims/me`; ClaimSubmissionScreen and MyClaimsScreen exist with 250+ lines each; venue_detail_screen.dart and band_detail_screen.dart show `Icons.verified` badge when `claimedByUserId != null` and claim button otherwise |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/033_verification-claims-and-claimed-profiles.ts` | Claims table, claimed_by columns, Wilson function | VERIFIED | 107 lines; table DDL, partial unique index, 3 standard indexes, claimed_by on venues+bands, wilson_lower_bound function, updated_at trigger |
| `backend/migrations/034_search-tsvector-columns.ts` | tsvector columns and GIN indexes | VERIFIED | 59 lines; GENERATED ALWAYS AS ... STORED on bands/venues/events with GIN indexes |
| `backend/migrations/035_genre-array-migration.ts` | genres TEXT[] column with backfill | VERIFIED | 47 lines; adds genres TEXT[], backfills from genre, sets default, GIN index; old genre column kept |
| `backend/migrations/036_review-owner-response.ts` | Review response columns | VERIFIED | 27 lines; adds owner_response TEXT and owner_response_at TIMESTAMPTZ |
| `backend/src/types/index.ts` | TypeScript interfaces for new features | VERIFIED | ClaimStatus, VerificationClaim, CreateClaimRequest, ReviewClaimRequest, TrendingEvent, SearchResults, OwnerReviewResponse exported; Venue/Band/Review updated |
| `backend/src/services/TrendingService.ts` | Wilson-scored trending with multi-signal composite | VERIFIED | 141 lines (meets 80 min); uses wilson_lower_bound, LATERAL joins for signals, proximity decay |
| `backend/src/controllers/TrendingController.ts` | HTTP handler for trending endpoint | VERIFIED | Exists; validates lat/lon, calls TrendingService |
| `backend/src/routes/trendingRoutes.ts` | GET /api/trending route | VERIFIED | authenticateToken + rateLimit(60/15min) + trendingController.getTrending |
| `backend/src/services/FeedService.ts` | Denormalized count queries | VERIFIED | c.toast_count and c.comment_count in getFriendsFeed and getEventFeed; has_user_toasted EXISTS subquery preserved |
| `backend/src/services/checkin/CheckinQueryService.ts` | Denormalized count queries | VERIFIED | c.toast_count and c.comment_count in getCheckinById, getActivityFeed, getCheckins |
| `backend/src/services/SearchService.ts` | Unified full-text search with fuzzy fallback | VERIFIED | 228 lines (meets 100 min); CTE pattern with websearch_to_tsquery primary and similarity > 0.3 fuzzy fallback across bands/venues/events |
| `backend/src/controllers/SearchController.ts` | HTTP handler for unified search | VERIFIED | Exists; validates q param, type filtering, limit capping at 50 |
| `backend/src/routes/searchRoutes.ts` | Updated search routes with unified endpoint | VERIFIED | GET / (unified) + GET /users and GET /events (legacy preserved) |
| `backend/src/services/ClaimService.ts` | Claim CRUD + admin approval with transaction | VERIFIED | 234 lines (meets 120 min); full claim lifecycle with BEGIN/COMMIT transaction |
| `backend/src/controllers/ClaimController.ts` | HTTP handlers for claim submission, listing, admin review | VERIFIED | Exists; submitClaim, getMyClaims, getPendingClaims, reviewClaim, respondToReview, getEntityStats |
| `backend/src/routes/claimRoutes.ts` | Public claim routes + admin claim routes | VERIFIED | Dual-router export: publicRouter at /api/claims, adminRouter at /api/admin/claims |
| `backend/src/services/ReviewService.ts` | Owner response to reviews | VERIFIED | respondToReview verifies claimed_by_user_id ownership; UPDATE sets owner_response and owner_response_at |
| `mobile/lib/src/features/trending/data/trending_repository.dart` | API client for GET /api/trending | VERIFIED | 96 lines (meets 30 min); TrendingEvent model + TrendingRepository calling GET /trending |
| `mobile/lib/src/features/trending/presentation/trending_feed_screen.dart` | Trending shows feed UI | VERIFIED | 271 lines (meets 60 min); TrendingFeedSection widget with horizontal card list |
| `mobile/lib/src/features/trending/presentation/providers/trending_providers.dart` | Riverpod providers for trending data | VERIFIED | 23 lines (meets 20 min); manual providers |
| `mobile/lib/src/features/search/presentation/search_screen.dart` | Updated search with categorized results | VERIFIED | 433 lines; Bands/Venues/Events filter chips and sectioned result lists |
| `mobile/lib/src/features/verification/data/claim_repository.dart` | API client for claim endpoints | VERIFIED | 90 lines (meets 40 min); submitClaim (POST /claims) and getMyClaims (GET /claims/me) |
| `mobile/lib/src/features/verification/presentation/claim_submission_screen.dart` | Claim form UI with evidence fields | VERIFIED | 250 lines (meets 80 min); evidence text + URL fields, loading state, SnackBar |
| `mobile/lib/src/features/verification/presentation/my_claims_screen.dart` | User's claims list with status badges | VERIFIED | 252 lines (meets 60 min); pending/approved/denied badges, pull-to-refresh, empty state |
| `mobile/lib/src/features/verification/presentation/providers/claim_providers.dart` | Riverpod providers for claim data | VERIFIED | 28 lines (meets 20 min); manual Riverpod providers |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `migrations/033` | venues and bands tables | `ALTER TABLE ADD COLUMN claimed_by_user_id` | WIRED | Pattern found in migration: `ALTER TABLE venues ADD COLUMN claimed_by_user_id UUID REFERENCES users(id)` and same for bands |
| `migrations/034` | bands, venues, events tables | `GENERATED ALWAYS AS ... STORED` | WIRED | All three tables use GENERATED ALWAYS AS ... STORED tsvector with GIN indexes |
| `TrendingService.ts` | wilson_lower_bound SQL function | SQL query calling `wilson_lower_bound()` | WIRED | Line 56 calls `wilson_lower_bound((...) ::BIGINT, (...)::BIGINT)` |
| `trendingRoutes.ts` | `backend/src/index.ts` | `app.use('/api/trending', trendingRoutes)` | WIRED | index.ts line 212: `app.use('/api/trending', trendingRoutes)` |
| `FeedService.ts` | checkins.toast_count column | `SELECT c.toast_count` | WIRED | Lines 100-101 and 180-181 read `c.toast_count, c.comment_count` directly |
| `SearchService.ts` | search_vector tsvector columns | `WHERE search_vector @@ websearch_to_tsquery()` | WIRED | Lines 53-55, 91-93, 130 use `search_vector @@ websearch_to_tsquery('english', $1)` |
| `SearchService.ts` | pg_trgm similarity() | `WHERE similarity(name, $1) > 0.3` | WIRED | Lines 66 and 104 use `similarity(name, $1) > 0.3` as fuzzy fallback |
| `BandService.ts` | bands.genres TEXT[] | `genres @> ARRAY[$1]` or `ANY(genres)` | WIRED | Lines 97, 104, 243 use `$N = ANY(genres)` and `unnest(genres)` array operators |
| `ClaimService.ts` | verification_claims + venues/bands tables | Transaction: UPDATE claim + UPDATE entity | WIRED | Lines 170-205 use `getClient()`, BEGIN/COMMIT transaction updating both tables |
| `claimRoutes.ts` | `backend/src/index.ts` | `app.use('/api/claims', ...)` | WIRED | index.ts lines 215-216: public at /api/claims, admin at /api/admin/claims |
| `ReviewService.ts` | reviews.owner_response column | `UPDATE reviews SET owner_response, owner_response_at` | WIRED | Lines 530-534 update owner_response and owner_response_at with NOW() |
| `trending_repository.dart` | GET /api/trending | DioClient GET request to `/trending` | WIRED | Repository calls `_client.get('/trending', queryParameters: {...})`; DioClient baseUrl includes `/api` prefix |
| `discover_screen.dart` | `trending_feed_screen.dart` | Widget inclusion `const TrendingFeedSection()` | WIRED | Line 847: `const TrendingFeedSection()` imported from trending_feed_screen.dart |
| `search_providers.dart` | GET /api/search | DioClient GET request to `/search` | WIRED | Line 57-63: `dioClient.get('/search', queryParameters: {'q': query, 'types': types, 'limit': 10})`; DioClient baseUrl includes `/api` |
| `claim_repository.dart` | POST /api/claims and GET /api/claims/me | DioClient requests to `/claims` | WIRED | submitClaim calls `_client.post('/claims', ...)`, getMyClaims calls `_client.get('/claims/me')`; baseUrl includes `/api` |
| `venue_detail_screen.dart` | `claim_submission_screen.dart` | Navigation with entityType=venue | WIRED | Line 240: `context.push('/claim/venue/${venue.id}?name=...')` — route registered in app_router.dart line 530 |
| `band_detail_screen.dart` | verification badge display | `claimedByUserId` check + `Icons.verified` | WIRED | Lines 309-313: `if (band.claimedByUserId != null)` shows `Icon(Icons.verified)` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EVENT-03 | 11-02, 11-05 | User sees "Trending Shows Near You" feed for between-concert retention | SATISFIED | TrendingFeedSection in discover_screen.dart backed by TrendingService returning Wilson-scored events |
| EVENT-04 | 11-02, 11-05 | Trending algorithm uses Wilson-scored mix of RSVP, check-in velocity, friend signals, proximity | SATISFIED | TrendingService uses weighted composite (rsvp*3 + velocity*2 + friend*5) with proximity decay 1/(1+d/50) calling wilson_lower_bound() |
| VERIFY-01 | 11-04, 11-06 | Venue owner can submit claim request for venue profile | SATISFIED | POST /api/claims with entityType='venue'; ClaimSubmissionScreen accessible from venue_detail_screen.dart |
| VERIFY-02 | 11-04, 11-06 | Artist can submit claim request for band profile | SATISFIED | POST /api/claims with entityType='band'; ClaimSubmissionScreen accessible from band_detail_screen.dart |
| VERIFY-03 | 11-04 | Admin reviews and approves/denies verification claims | SATISFIED | PUT /api/admin/claims/:id/review with requireAdmin() middleware; ClaimService.reviewClaim uses transaction to atomically update claim status and entity claimed_by_user_id |
| VERIFY-04 | 11-04, 11-06 | Verified profiles display verification badge | SATISFIED | venue_detail_screen.dart and band_detail_screen.dart show Icons.verified badge when claimedByUserId != null |
| VERIFY-05 | 11-04, 11-06 | Claimed venue owner can view aggregate ratings and respond to reviews | SATISFIED | ReviewService.respondToReview verifies ownership; VenueService.getVenueStats returns aggregates; GET /api/claims/stats/:entityType/:entityId endpoint |
| VERIFY-06 | 11-04, 11-06 | Claimed artist can update profile and view performance stats | SATISFIED | BandController.updateBand authorizes claimed owners via isClaimedOwner; BandService.getBandStats returns performance data |
| SCALE-01 | 11-03, 11-05 | Search uses PostgreSQL tsvector + GIN indexes with pg_trgm fuzzy fallback | SATISFIED | SearchService uses CTE pattern: websearch_to_tsquery primary + similarity > 0.3 fuzzy fallback; GIN indexes on search_vector columns (migration 034) |
| SCALE-02 | 11-02 | Feed queries use denormalized toast_count and comment_count columns | SATISFIED | FeedService and CheckinQueryService all read c.toast_count and c.comment_count directly; COUNT(DISTINCT) JOIN patterns completely removed |
| SCALE-03 | 11-01, 11-03 | Band.genre migrated from single string to array for faceted filtering | SATISFIED | genres TEXT[] column backfilled (migration 035); BandService/EventService/DiscoveryService all use ANY(genres) and unnest(genres) array operators |

All 11 requirement IDs from plan frontmatter are satisfied. REQUIREMENTS.md marks all 11 as `[x]` complete and maps them to Phase 11.

---

### Anti-Patterns Found

None found. Scan of all new backend services (TrendingService, SearchService, ClaimService, ReviewService), controllers, routes, and mobile files (trending_repository, claim_repository, claim_submission_screen, my_claims_screen) showed:

- No TODO/FIXME/PLACEHOLDER/XXX comments
- No `return null` / `return {}` / `return []` stub returns in controllers
- No "Not implemented" strings
- No empty arrow function handlers

---

### Human Verification Required

#### 1. Trending Shows Feed Visual and Sort Order

**Test:** Open the app, navigate to the Discover screen, ensure location permission is granted
**Expected:** A "Trending Shows Near You" horizontal scrollable card section appears at the very top of the Discover content; cards show event name, venue city, date, RSVP count, friend signal count, and distance; events with higher social signals and closer proximity appear first
**Why human:** Visual layout, card styling, and actual Wilson-scored ranking order require a running app with real or seeded database data

#### 2. Fuzzy Search Typo Tolerance

**Test:** In the Search screen, type a deliberate typo for a known band or venue (e.g., "radioheed" for Radiohead)
**Expected:** The correct result appears via the pg_trgm similarity fallback path
**Why human:** Requires the pg_trgm extension installed in the database and real data; the query path is correct in code but database state cannot be verified statically

#### 3. Claim Submission Flow

**Test:** Find an unclaimed venue or band detail screen; tap "Claim this venue/band"; fill in evidence text; tap Submit
**Expected:** Loading indicator appears on button; SnackBar shows "Claim submitted! We'll review it shortly."; screen pops back; second submission attempt returns "A pending claim already exists"
**Why human:** Form interaction, SnackBar timing, and partial unique index enforcement require a running app against the backend

#### 4. Admin Claim Approval and Badge Propagation

**Test:** As an admin user, call PUT /api/admin/claims/:id/review with `{"status": "approved"}`; then open the corresponding venue/band detail screen
**Expected:** Claim record status = 'approved'; entity record claimed_by_user_id is set; Icons.verified badge appears on the detail screen
**Why human:** Requires admin credentials, a pending claim in the database, and visual confirmation of the badge appearance

---

## Gaps Summary

No gaps found. All 13 observable truths are verified, all artifacts pass at all three levels (exists, substantive, wired), all 11 requirements are satisfied, and all 11 plan-documented commits exist in git history.

---

_Verified: 2026-02-28T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
