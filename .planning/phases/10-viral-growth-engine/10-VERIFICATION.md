---
phase: 10-viral-growth-engine
verified: 2026-02-27T00:00:00Z
status: gaps_found
score: 4/5 success criteria verified
re_verification: false
gaps:
  - truth: "User can tap 'I'm Going' on an upcoming event and see which friends are also going"
    status: partial
    reason: "RsvpRepository uses '/api/rsvp/...' paths but the DioClient base URL already includes '/api', producing double-prefix '/api/api/rsvp/...' that will 404 in all environments. EventDetailScreen has the same issue with '/api/events/:id'. OnboardingRepository and ShareRepository are correct (no /api/ prefix)."
    artifacts:
      - path: "mobile/lib/src/features/events/data/rsvp_repository.dart"
        issue: "Paths use '/api/rsvp/' prefix but base URL is 'http://.../api' — resolves to '/api/api/rsvp/...'"
      - path: "mobile/lib/src/features/events/presentation/event_detail_screen.dart"
        issue: "eventDetailProvider uses '/api/events/$eventId' — same double-prefix bug"
    missing:
      - "Change '/api/rsvp/$eventId' to '/rsvp/$eventId' in rsvp_repository.dart (3 occurrences)"
      - "Change '/api/events/$eventId' to '/events/$eventId' in event_detail_screen.dart eventDetailProvider"
human_verification:
  - test: "Onboarding genre picker — verify 3-screen carousel navigates to genre picker correctly"
    expected: "Tapping 'Get Started' on last carousel page opens GenrePickerScreen with 20 genres displayed as chips; selecting 3+ enables 'Continue'; genres saved locally; user proceeds to /login"
    why_human: "Navigation flow and UI rendering require device/simulator execution"
  - test: "Post-check-in celebration — verify badge progress shows and share card loads"
    expected: "After successful check-in, success state shows earned badges section, badge progress bars, and ShareCardPreview widget with card image and share buttons"
    why_human: "Requires live check-in against backend with actual card generation from R2-configured environment"
  - test: "Social share flow — verify share_plus OS sheet appears with card image"
    expected: "Tapping Instagram, TikTok, or generic share button downloads image to temp file and opens OS share sheet with it attached"
    why_human: "Platform share sheet behavior requires physical device or simulator"
  - test: "Share landing page OG preview — verify social platform crawlers see the card image"
    expected: "Visiting /share/c/:checkinId shows dark-themed HTML page with og:image meta tag pointing to generated R2 PNG; Twitter and Instagram previews show card image"
    why_human: "Requires R2 configured environment and social preview tool (e.g., opengraph.xyz)"
  - test: "RSVP button visual state — verify filled/outlined toggle and friends avatar display"
    expected: "After tapping 'I'm Going', button fills with voltLime color showing check_circle icon; FriendsGoingWidget appears below showing overlapping avatar circles and '1 friend going' text"
    why_human: "Requires live backend with test data for friend RSVPs; visual rendering requires simulator"
---

# Phase 10: Viral Growth Engine — Verification Report

**Phase Goal:** New users convert through onboarding, existing users share check-ins and badges to social platforms, and pre-show engagement drives friend attendance
**Verified:** 2026-02-27
**Status:** gaps_found (1 functional gap — URL path bug in RSVP mobile layer)
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | First-time user sees onboarding carousel, picks genres, gets personalized recommendations | VERIFIED | OnboardingScreen (3 value-prop pages), GenrePickerScreen (20 chip genres, 3-8 constraint), OnboardingRepository (saves to backend), DiscoveryService UNION ALL for cold-start |
| 2 | After checking in, user sees celebration screen with badge progress and can share card | VERIFIED | checkin_screen.dart _buildSuccessState() includes earned badges, badge progress, ShareCardPreview widget with checkinCardProvider; ShareCardService generates PNG via satori+resvg |
| 3 | User can share badge unlock card from badge detail screen | VERIFIED | badge_collection_screen.dart has tap-to-share on earned badges via ShareCardPreview bottom sheet (adapted: no badge_detail_screen existed; collection screen used instead) |
| 4 | Non-user clicking shared link sees web page with card + App Store/Play Store CTAs | VERIFIED | landing-page.html has complete OG/Twitter meta tags, card preview, App Store and Google Play buttons; ShareController.renderCheckinLanding/renderBadgeLanding serve HTML; public routes at /share/c/:id and /share/b/:id |
| 5 | User can tap "I'm Going" and see which friends are going (count + avatars) | PARTIAL | Backend API fully wired. RsvpButton and FriendsGoingWidget exist and are wired to EventDetailScreen. Critical gap: RsvpRepository uses '/api/rsvp/...' paths but base URL already includes '/api', causing double-prefix 404 in all environments |

**Score:** 4/5 success criteria verified

---

## Required Artifacts Verification

### Plan 10-01: Backend RSVP & Onboarding (Requirements: ONBD-02, EVENT-01, EVENT-02)

| Artifact | Status | Evidence |
|----------|--------|---------|
| `backend/migrations/032_event-rsvps-and-genre-prefs.ts` | VERIFIED | Creates event_rsvps (UUID PK, user_id FK, event_id FK, unique constraint), user_genre_preferences (UUID PK, user_id FK, genre), onboarding_completed_at on users; correct indexes; down migration |
| `backend/src/services/RsvpService.ts` | VERIFIED | toggleRsvp (check-then-delete-or-insert), isGoing, getFriendsGoing (JOIN user_followers + users), getRsvpCount, getUserRsvps — all substantive SQL queries |
| `backend/src/services/OnboardingService.ts` | VERIFIED | saveGenrePreferences (3-8 validation, DELETE+batch INSERT), getGenrePreferences, completeOnboarding, isOnboardingComplete |
| `backend/src/services/DiscoveryService.ts` | VERIFIED | user_genres CTE uses UNION ALL with user_genre_preferences for cold-start |
| `backend/src/controllers/RsvpController.ts` | VERIFIED | toggle, getFriendsGoing, getUserRsvps handlers with auth guard and error handling |
| `backend/src/controllers/OnboardingController.ts` | EXISTS | Not verified in full detail — plan 10-01 summary confirms |
| `backend/src/routes/rsvpRoutes.ts` | VERIFIED | GET /me before /:eventId, POST /:eventId with validation, GET /:eventId/friends; all behind authenticateToken |
| `backend/src/routes/onboardingRoutes.ts` | EXISTS | Mounted at /api/onboarding per index.ts |

### Plan 10-02: Share Card Pipeline (Requirements: SHARE-01, SHARE-04)

| Artifact | Status | Evidence |
|----------|--------|---------|
| `backend/src/services/ShareCardService.ts` | VERIFIED | satori + Resvg pipeline, generateCheckinCard (1200x630 + 1080x1920), generateBadgeCard, renderAndUpload helper, graceful R2 degradation |
| `backend/src/templates/share-cards/checkin-card.ts` | VERIFIED | 274 lines, CheckinCardData interface, checkinCardOG + checkinCardStories functions with flexbox-only Satori elements |
| `backend/src/templates/share-cards/badge-card.ts` | VERIFIED | 328 lines, BadgeCardData interface, badgeCardOG + badgeCardStories functions |
| `backend/src/templates/share-cards/landing-page.html` | VERIFIED | OG meta tags (og:title, og:description, og:image with 1200x630 dims, og:url, og:type), Twitter card tags, card image, SoundCheck branding, App Store + Play Store CTAs, inline CSS, XSS-safe token injection |
| `backend/src/controllers/ShareController.ts` | VERIFIED | generateCheckinCard, generateBadgeCard, renderCheckinLanding, renderBadgeLanding; escapeHtml applied to all UGC |
| `backend/src/routes/shareRoutes.ts` | VERIFIED | Dual router export: api (authenticated) at /api/share, public (no auth) at /share; correct boundaries |
| `backend/src/fonts/Inter-Bold.ttf` | VERIFIED | File exists in backend/src/fonts/ |
| `backend/src/services/R2Service.ts` | VERIFIED | uploadBuffer(buffer, key, contentType) method added |

### Plan 10-03: Mobile Onboarding (Requirements: ONBD-01, ONBD-02)

| Artifact | Status | Evidence |
|----------|--------|---------|
| `mobile/lib/src/features/onboarding/presentation/onboarding_screen.dart` | VERIFIED | 3 concert-value pages ("Check In to Live Shows", "Earn Badges & Concert Cred", "Share & Discover"), Skip button top-right, navigates to /onboarding/genres on Get Started |
| `mobile/lib/src/features/onboarding/presentation/genre_picker_screen.dart` | VERIFIED | ConsumerStatefulWidget, Wrap+ChoiceChip for 20 genres, min 3/max 8 constraint, Skip button, continueWithGenres saves locally via genrePersistenceProvider |
| `mobile/lib/src/features/onboarding/data/onboarding_repository.dart` | VERIFIED | saveGenrePreferences, getGenrePreferences, completeOnboarding, isOnboardingComplete — correct DioClient paths without /api/ prefix |
| `mobile/lib/src/features/onboarding/domain/genre.dart` | VERIFIED | 20 genres with emoji indicators |
| `mobile/lib/src/features/onboarding/presentation/onboarding_provider.dart` | VERIFIED | OnboardingState, selectedGenresProvider, GenrePersistence notifier for local save + backend sync |

### Plan 10-04: Mobile Celebration & Sharing (Requirements: ONBD-03, SHARE-02, SHARE-03)

| Artifact | Status | Evidence |
|----------|--------|---------|
| `mobile/lib/src/features/sharing/presentation/celebration_screen.dart` | VERIFIED | AnimationController with scale+fade, badge earned section, badge progress, ShareCardPreview widget, Done button |
| `mobile/lib/src/features/sharing/services/social_share_service.dart` | VERIFIED | shareToInstagramStories, shareToTikTok, shareGeneric — all download to temp file via Dio + invoke SharePlus.instance.share |
| `mobile/lib/src/features/sharing/data/share_repository.dart` | VERIFIED | generateCheckinCard POSTs to /share/checkin/:id, generateBadgeCard POSTs to /share/badge/:id (correct paths without /api/ prefix) |
| `mobile/lib/src/features/sharing/presentation/share_card_preview.dart` | VERIFIED | Shimmer loading, image display, share button row |
| `mobile/lib/src/features/sharing/presentation/share_providers.dart` | VERIFIED | shareRepositoryProvider, checkinCardProvider.family, badgeCardProvider.family |

### Plan 10-05: Mobile RSVP UI (Requirements: EVENT-01, EVENT-02)

| Artifact | Status | Evidence |
|----------|--------|---------|
| `mobile/lib/src/features/events/data/rsvp_repository.dart` | STUB/WIRED | File exists and is wired, but '/api/rsvp/...' paths cause double-prefix with base URL — will 404 at runtime |
| `mobile/lib/src/features/events/presentation/rsvp_button.dart` | VERIFIED | ConsumerStatefulWidget, _isToggling guard, filled/outlined ElevatedButton.icon, invalidates userRsvpsProvider and friendsGoingProvider |
| `mobile/lib/src/features/events/presentation/friends_going_widget.dart` | VERIFIED | ConsumerWidget, overlapping avatar Stack (max 5), "N friends going" text, graceful empty/loading/error states |
| `mobile/lib/src/features/events/presentation/event_detail_screen.dart` | PARTIAL | Wired correctly with RsvpButton and FriendsGoingWidget, but eventDetailProvider uses '/api/events/$eventId' — double-prefix bug |
| `mobile/lib/src/features/events/presentation/providers/event_providers.dart` | VERIFIED | rsvpRepositoryProvider, userRsvpsProvider.autoDispose, friendsGoingProvider.autoDispose.family |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/src/routes/rsvpRoutes.ts` | `backend/src/controllers/RsvpController.ts` | rsvpController instance | WIRED | rsvpController.toggle, getFriendsGoing, getUserRsvps all wired |
| `backend/src/controllers/RsvpController.ts` | `backend/src/services/RsvpService.ts` | this.rsvpService | WIRED | Constructed in controller, all 3 methods delegated |
| `backend/src/services/DiscoveryService.ts` | `user_genre_preferences` | UNION ALL in user_genres CTE | WIRED | Lines 139-142 confirmed |
| `backend/src/services/ShareCardService.ts` | `backend/src/services/R2Service.ts` | r2Service.uploadBuffer | WIRED | r2Service imported and uploadBuffer called in renderAndUpload |
| `backend/src/controllers/ShareController.ts` | `backend/src/services/ShareCardService.ts` | this.shareCardService | WIRED | Constructed in constructor, generateCheckinCard/generateBadgeCard delegated |
| `backend/src/routes/shareRoutes.ts` | `landing-page.html` | ShareController.renderCheckinLanding reads HTML template | WIRED | Template loaded at module level via fs.readFileSync |
| `mobile/lib/src/features/onboarding/presentation/onboarding_screen.dart` | `mobile/lib/src/features/onboarding/presentation/genre_picker_screen.dart` | context.go('/onboarding/genres') | WIRED | Line 132 of onboarding_screen.dart |
| `mobile/lib/src/features/onboarding/data/onboarding_repository.dart` | `/api/onboarding/genres` | DioClient.post('/onboarding/genres') | WIRED | Resolves correctly: base URL /api + /onboarding/genres = /api/onboarding/genres |
| `mobile/lib/src/features/sharing/data/share_repository.dart` | `/api/share/checkin/:id` | DioClient.post('/share/checkin/$checkinId') | WIRED | Resolves correctly: base URL /api + /share/checkin/... = /api/share/checkin/... |
| `mobile/lib/src/features/events/presentation/rsvp_button.dart` | `mobile/lib/src/features/events/data/rsvp_repository.dart` | rsvpRepositoryProvider | WIRED | ref.read(rsvpRepositoryProvider).toggleRsvp |
| `mobile/lib/src/features/events/data/rsvp_repository.dart` | `/api/rsvp/:eventId` | DioClient.post('/api/rsvp/$eventId') | NOT_WIRED | Bug: path '/api/rsvp/...' + base URL already '/api' = '/api/api/rsvp/...' — 404 |
| `mobile/lib/src/features/events/presentation/event_detail_screen.dart` | `mobile/lib/src/features/events/presentation/friends_going_widget.dart` | Widget composition | WIRED | FriendsGoingWidget(eventId: eventId) at line 177 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| ONBD-01 | 10-03 | New user sees 3-screen onboarding carousel | SATISFIED | OnboardingScreen: 3 concert-value pages with PageView, page indicators, Skip button |
| ONBD-02 | 10-01, 10-03 | Onboarding includes genre picker seeding recommendations | SATISFIED | GenrePickerScreen (mobile) + OnboardingService + DiscoveryService UNION ALL (backend) |
| ONBD-03 | 10-04 | After check-in, user sees celebration with badge progress and share CTA | SATISFIED | checkin_screen.dart _buildSuccessState() includes badge progress and ShareCardPreview |
| SHARE-01 | 10-02 | Server generates shareable card images (1200x630 OG + 1080x1920 Stories) | SATISFIED | ShareCardService generates both variants via satori+resvg-js pipeline |
| SHARE-02 | 10-04 | User can share check-in card to Instagram Stories, X, TikTok | SATISFIED | SocialShareService with download-to-temp-file + SharePlus (OS share sheet) |
| SHARE-03 | 10-04 | User can share badge unlock card | SATISFIED | badge_collection_screen.dart tappable earned badges open ShareCardPreview bottom sheet |
| SHARE-04 | 10-02 | Non-users see web landing page with card preview + store CTAs | SATISFIED | /share/c/:id and /share/b/:id serve landing-page.html with OG meta tags and store links |
| EVENT-01 | 10-01, 10-05 | User can RSVP "I'm Going" to upcoming events | PARTIAL | Backend API complete. Mobile UI wired but RsvpRepository has URL double-prefix bug causing runtime 404 |
| EVENT-02 | 10-01, 10-05 | Event detail shows count and avatars of friends going | PARTIAL | Backend API complete. FriendsGoingWidget wired to EventDetailScreen but blocked by same URL bug in rsvp_repository.dart and additional bug in eventDetailProvider |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `mobile/lib/src/features/events/data/rsvp_repository.dart` | 32, 39, 58 | `/api/rsvp/...` paths with base URL already containing `/api` | BLOCKER | RSVP toggle, friends-going, and batch status will 404 at runtime in all environments |
| `mobile/lib/src/features/events/presentation/event_detail_screen.dart` | 17 | `/api/events/$eventId` in eventDetailProvider with same double-prefix | BLOCKER | Event detail screen cannot load event data — EventDetailScreen will always show error state |

**Note:** This double-prefix pattern also exists in pre-existing Phase 9 code (`forgot_password_screen.dart` line 42, `discover_providers.dart` line 137). Those paths may also be broken. The pattern was established before Phase 10 and reproduced by the new code following the wrong files as references.

---

## Human Verification Required

### 1. RSVP URL Path Bug Regression Scope

**Test:** Verify whether the double `/api/api/` prefix actually causes failures by checking if backend has URL normalization or if the codebase sets up any proxying that strips the first `/api`.
**Expected:** All three environments (dev, staging, prod) should show 404 for double-prefix paths.
**Why human:** Requires running the app against a live backend to confirm the 404 behavior, or inspecting network logs.

### 2. Onboarding Genre Picker UI Flow

**Test:** Run the app fresh (clear SharedPreferences), observe onboarding carousel 3 screens, tap Get Started on last page, verify genre picker opens with 20 chips, select 3+ genres, tap Continue, verify navigation to login.
**Expected:** Carousel shows concert-themed value props; genre picker renders as Wrap of ChoiceChips; 3 selections enables Continue; genres saved locally; /login reached.
**Why human:** UI rendering and navigation flow require device or simulator execution.

### 3. Post-Check-in Celebration Screen

**Test:** Perform a check-in in the app, observe success state for badge progress section and ShareCardPreview loading.
**Expected:** Success state shows earned badges (if any), badge progress bars, and ShareCardPreview with the generated card image loading from backend. Share buttons (Instagram, TikTok, More) visible.
**Why human:** Requires live backend + R2-configured environment for share card generation to produce real URLs.

### 4. Share Landing Page Social Preview

**Test:** After generating a check-in card, visit the landing page URL in a browser and verify OG image renders. Use a social preview tool (e.g., opengraph.xyz or Twitter Card Validator) on /share/c/:checkinId.
**Expected:** og:image points to a valid R2 URL; social preview shows the branded card image; App Store and Google Play buttons present.
**Why human:** Requires R2-configured deployment environment and external preview tool.

### 5. Badge Sharing from Collection Screen

**Test:** Navigate to badge collection screen, tap an earned badge, verify a bottom sheet opens with ShareCardPreview showing the badge card and share buttons.
**Expected:** Tapping an earned badge opens a modal bottom sheet with the badge card image (loading shimmer while generating), then Instagram/TikTok/More share options.
**Why human:** Requires earned badges in test account and live backend.

---

## Gaps Summary

One functional gap blocks full goal achievement for the RSVP/friends-going features (EVENT-01, EVENT-02):

**URL Path Bug in `rsvp_repository.dart`** — The `RsvpRepository` mobile class uses paths prefixed with `/api/` (e.g., `'/api/rsvp/$eventId'`) but the `DioClient` base URL already includes `/api` (all environments: `http://localhost:3000/api`, `https://soundcheck-app.up.railway.app/api`). This produces double-prefix URLs (`/api/api/rsvp/...`) that will receive 404 responses from the backend. The same bug exists in `event_detail_screen.dart`'s `eventDetailProvider` which uses `'/api/events/$eventId'`.

This is a 3-line fix in `rsvp_repository.dart` (change `'/api/rsvp/'` to `'/rsvp/'` three times) and a 1-line fix in `event_detail_screen.dart`. The backend API, services, controllers, routes, and validation are all correct and fully functional.

The OnboardingRepository and ShareRepository correctly avoid this bug by using paths without the `/api/` prefix.

All other 8 requirements (ONBD-01, ONBD-02, ONBD-03, SHARE-01, SHARE-02, SHARE-03, SHARE-04, plus the backend portion of EVENT-01/02) are fully implemented and substantively verified.

---

_Verified: 2026-02-27_
_Verifier: Claude (gsd-verifier)_
