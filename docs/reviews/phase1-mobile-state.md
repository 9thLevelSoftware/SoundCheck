# Phase 1: Mobile State Management & Navigation Audit

**Auditor:** Frontend Developer Agent
**Date:** 2026-03-18
**Scope:** Riverpod providers, GoRouter configuration, Dio interceptors, logout flow
**Target:** SoundCheck Flutter mobile app (pre-beta readiness)
**Codebase snapshot:** `master` branch, commit `148788e`

---

## Executive Summary

Audited 20 provider files (96 `@riverpod`/`@Riverpod` annotations), the GoRouter configuration (22 routes), the Dio client and interceptor stack, and the logout/auth flow. Found **17 findings**: 2 Blocker, 4 High, 7 Medium, 4 Low.

The two blockers -- a stale feed after check-in (users post and see nothing happen) and a crash on the celebration deep link -- will both hit every active user during normal usage. The high-severity items around logout state leakage and missing token refresh will degrade trust and security under real-world concurrent usage patterns.

---

## Findings

### [MOB-001]: Feed does not refresh after check-in (stale socialFeedProvider invalidation)
**Severity:** Blocker
**File(s):** `mobile/lib/src/features/checkins/presentation/providers/checkin_providers.dart:147,179,207,311`
**Description:** After creating a check-in, toasting, or commenting, the provider code invalidates `socialFeedProvider` -- a legacy provider that is defined in this same file (line 58) but is **never consumed by any screen**. The actual feed screen uses `globalFeedNotifierProvider` and `friendsFeedNotifierProvider` (from `feed_providers.dart`). This means users complete a check-in, return to the feed, and see stale data with no indication their action succeeded. At beta scale (500-2000 users), this will be the number one support complaint.
**Evidence:**
```dart
// checkin_providers.dart:147 -- after createCheckIn
ref.invalidate(socialFeedProvider);  // <-- nobody watches this

// feed_screen.dart:268 -- what the feed actually watches
final feedAsync = ref.watch(globalFeedProvider);
// feed_screen.dart:346
final feedAsync = ref.watch(friendsFeedProvider);
```
`socialFeedProvider` has zero consumers (confirmed via grep -- only file is `checkin_providers.dart` itself).
**Recommended Fix:** Replace all `ref.invalidate(socialFeedProvider)` calls with `ref.invalidate(globalFeedNotifierProvider)` and `ref.invalidate(friendsFeedNotifierProvider)`. Remove the dead `socialFeedProvider` definition entirely.

---

### [MOB-002]: Celebration route crashes on direct/deep link navigation (untyped `state.extra` cast)
**Severity:** Blocker
**File(s):** `mobile/lib/src/core/router/app_router.dart:396`
**Description:** The `/celebration` route casts `state.extra` to `CelebrationParams` with a hard `as` cast and no null check. If a user navigates to `/celebration` via deep link, browser redirect, or process restoration where `extra` is null, the app throws a `TypeError` and crashes. This route is hit after every single check-in.
**Evidence:**
```dart
// app_router.dart:396
final params = state.extra as CelebrationParams;
```
`state.extra` is `Object?` -- if null or wrong type, this is an unrecoverable crash. GoRouter `extra` is explicitly documented as non-restorable across process death.
**Recommended Fix:** Either (a) guard with `if (state.extra is! CelebrationParams) return redirect to /feed`, or (b) encode celebration data as query parameters/path parameters so the route is restorable. Option (b) is preferred for deep link support.

---

### [MOB-003]: Logout does not invalidate session-dependent providers
**Severity:** High
**File(s):** `mobile/lib/src/core/providers/providers.dart:171-186`
**Description:** The `AuthState.logout()` method clears the JWT, disconnects WebSocket, resets RevenueCat, and sets auth state to null. However, it does **not** invalidate any of the data providers that hold the previous user's data. The following providers retain stale data from User A after User B logs in on the same device:
- `globalFeedNotifierProvider` / `friendsFeedNotifierProvider` (feed items with User A's social graph)
- `notificationFeedProvider` / `unreadNotificationCountProvider` (User A's notifications)
- `badgeProgressProvider` / `badgeCollectionProvider` (User A's badges)
- `concertCredProvider` (User A's stats)
- `userRecentCheckinsProvider` (User A's check-in history)
- `happeningNowProvider` / `unseenCountsProvider` (User A's friend activity)

Since the router redirects to `/login` after logout, and the shell route's `StatefulShellRoute.indexedStack` preserves branch state, User B could see User A's cached feed, notifications, and profile data until each provider naturally refetches.
**Evidence:** The logout method at `providers.dart:171-186` calls only:
```dart
wsService.disconnect();
SubscriptionService.logout();
ref.read(isPremiumProvider.notifier).set(false);
authRepository.logout();
state = const AsyncValue.data(null);
```
No `ref.invalidate(...)` calls for any data provider.
**Recommended Fix:** Add a `_clearUserData()` method to `AuthState.logout()` that invalidates all user-scoped providers. Consider a `ProviderContainer` restart pattern or a centralized list of providers to invalidate on session change.

---

### [MOB-004]: No token refresh mechanism -- concurrent 401s silently clear credentials
**Severity:** High
**File(s):** `mobile/lib/src/core/api/dio_client.dart:40-49`
**Description:** The Dio 401 interceptor silently deletes the JWT and user data from secure storage, then passes the error through. There is no token refresh flow, no retry of the failed request, and no notification to the auth state. When a JWT expires:
1. Multiple concurrent requests can each independently delete the token (race condition).
2. The user sees individual API errors on whichever screen triggered them, but `authStateProvider` is never updated -- the router still thinks the user is authenticated.
3. The user must manually navigate to settings and logout/login, or restart the app.

At beta scale with 30-second timeouts and users on spotty connections, JWT expiry will be a regular occurrence.
**Evidence:**
```dart
// dio_client.dart:40-49
onError: (error, handler) async {
  if (error.response?.statusCode == 401) {
    await _secureStorage.delete(key: ApiConfig.tokenKey);
    await _secureStorage.delete(key: ApiConfig.userKey);
  }
  return handler.next(error);  // no retry, no auth state update
},
```
**Recommended Fix:** Implement a `QueuedInterceptorsWrapper` that (a) on first 401, locks a mutex, attempts token refresh, retries the request; (b) queues concurrent requests while refresh is in flight; (c) if refresh fails, updates `authStateProvider` to force a logout redirect. At minimum for beta, on 401 the interceptor should call a callback that triggers `authStateProvider` to set state to null, causing the router redirect to `/login`.

---

### [MOB-005]: Missing route `/venues/:id/shows` causes crash on "See All" tap
**Severity:** High
**File(s):** `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:592`, `mobile/lib/src/core/router/app_router.dart`
**Description:** The venue detail screen navigates to `/venues/$venueId/shows` when the user taps "See All" on the upcoming events section. This route is not defined in the GoRouter configuration. GoRouter will throw an assertion error in debug mode and show a blank screen or error page in release mode.
**Evidence:**
```dart
// venue_detail_screen.dart:592
context.push('/venues/$venueId/shows');
```
Searched all routes in `app_router.dart` -- only `/venues/:id` exists, no `/venues/:id/shows` sub-route.
**Recommended Fix:** Either add the route to `app_router.dart` with the corresponding screen, or change the navigation to open a modal/bottom sheet that shows all events for the venue using existing providers.

---

### [MOB-006]: Wrapped route `int.parse` crashes on malformed deep link year parameter
**Severity:** High
**File(s):** `mobile/lib/src/core/router/app_router.dart:601`
**Description:** The `/wrapped/:year` and `/wrapped/:year/detail` routes parse the year parameter with `int.parse()` and no error handling. A deep link like `soundcheck://wrapped/abc` or `soundcheck://wrapped/` will throw a `FormatException` and crash the app.
**Evidence:**
```dart
// app_router.dart:601
final year = int.parse(state.pathParameters['year']!);
```
The `!` operator on `pathParameters['year']` combined with unguarded `int.parse` is a double crash risk.
**Recommended Fix:** Use `int.tryParse` with a fallback: `final year = int.tryParse(state.pathParameters['year'] ?? '') ?? DateTime.now().year;`. Consider redirecting to the feed if the year is outside a reasonable range.

---

### [MOB-007]: Dio LogInterceptor logs Authorization headers containing JWT tokens
**Severity:** Medium
**File(s):** `mobile/lib/src/core/api/dio_client.dart:56-62`
**Description:** The `LogInterceptor` is configured with `requestBody: true` and `responseBody: true`, but `requestHeader` defaults to `true` in Dio's `LogInterceptor`. This means every request in dev mode logs the full `Authorization: Bearer <jwt_token>` header to the debug console. While `ApiConfig.isDev` guards this to development builds only, developers sharing debug logs, CI logs, or screen recordings will inadvertently expose valid JWTs.
**Evidence:**
```dart
// dio_client.dart:56-62
LogInterceptor(
  requestBody: true,
  responseBody: true,
  error: true,
  logPrint: (object) => LogService.d(object.toString()),
  // requestHeader defaults to true -- logs Authorization: Bearer <token>
),
```
**Recommended Fix:** Explicitly set `requestHeader: false` or write a custom log interceptor that redacts the `Authorization` header value.

---

### [MOB-008]: WebSocket `newReview` event type defined but review system removed
**Severity:** Medium
**File(s):** `mobile/lib/src/core/services/websocket_service.dart:18`
**Description:** Recent commits (`84caefa`, `d6738c4`) removed the entire review stack from the codebase. However, `WebSocketEvents.newReview` is still defined as a constant. While this is not a crash risk, it indicates incomplete cleanup and could confuse developers about whether the review feature still exists.
**Evidence:**
```dart
// websocket_service.dart:18
static const String newReview = 'new_review';
```
No handlers, no listeners, no UI references to review events remain in the codebase.
**Recommended Fix:** Remove the dead `newReview` constant from `WebSocketEvents`.

---

### [MOB-009]: Wrapped stats and detail providers are not auto-disposed (memory leak)
**Severity:** Medium
**File(s):** `mobile/lib/src/features/wrapped/presentation/wrapped_providers.dart:13-21`
**Description:** `wrappedStatsProvider` and `wrappedDetailProvider` are defined as `FutureProvider.family` without `.autoDispose`. Once a user views their wrapped stats for any year, the fetched data stays in memory for the entire app session. The `wrappedSummaryCardProvider` (line 23) also lacks auto-dispose and caches generated image URLs indefinitely.

This is unlike the correctly auto-disposed detail providers in bands, venues, and events (`FutureProvider.autoDispose.family`).
**Evidence:**
```dart
// wrapped_providers.dart:13-14
final wrappedStatsProvider =
    FutureProvider.family<WrappedStats, int>((ref, year) { ... });
// vs band_detail_screen.dart:13
final bandDetailProvider = FutureProvider.autoDispose.family<Band, String>(...);
```
**Recommended Fix:** Change to `FutureProvider.autoDispose.family` for all three wrapped providers. The wrapped screen already handles retry via `ref.invalidate`, so auto-dispose is safe.

---

### [MOB-010]: No retry/backoff logic for API requests
**Severity:** Medium
**File(s):** `mobile/lib/src/core/api/dio_client.dart`
**Description:** The Dio client has no retry interceptor. All HTTP methods (`get`, `post`, `put`, `delete`, `patch`) make a single attempt and throw on failure. For transient network errors (DNS resolution failures, connection resets, 502/503 from Railway), users see an error state with a manual "Retry" button. At beta scale on mobile networks, transient failures are common and should be retried automatically for idempotent GET requests.
**Evidence:** The entire `DioClient` class has no retry logic, no `dio_smart_retry` or `RetryInterceptor` usage. All methods follow the same pattern:
```dart
try { return await _dio.get(...); }
on DioException catch (e) { throw _handleDioError(e); }
```
**Recommended Fix:** Add a retry interceptor (e.g., `dio_smart_retry`) for GET requests with exponential backoff (3 attempts, 1s/2s/4s). Non-idempotent requests (POST/PUT/DELETE) should not be retried automatically but could offer the user a retry affordance.

---

### [MOB-011]: Discover search providers lack debounce at the provider level
**Severity:** Medium
**File(s):** `mobile/lib/src/features/discover/presentation/providers/discover_providers.dart:65-170`
**Description:** The four discover search providers (`discoverBandSearch`, `discoverVenueSearch`, `discoverUserSearch`, `discoverEventSearch`) fire immediately whenever `discoverSearchQueryProvider` changes. Debouncing only happens at the UI level in `discover_screen.dart` via a Timer. If any code path sets the query provider directly (bypassing the UI debounce), all four providers fire simultaneously for every keystroke, creating 4 parallel API calls per character.

Compare with `searchBandsForCheckin` in `checkin_providers.dart:43-53` which correctly implements provider-level debounce with `Future.delayed` + query-change guard.
**Evidence:**
```dart
// discover_providers.dart:65 -- no debounce
@riverpod
Future<List<Band>> discoverBandSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];
  final repository = ref.watch(bandRepositoryProvider);
  return repository.getBands(search: query, limit: 10);  // fires immediately
}
```
**Recommended Fix:** Add the same `Future.delayed(300ms)` + query-change guard pattern used in `checkin_providers.dart` to all four discover search providers.

---

### [MOB-012]: `context.push('/discover')` from feed screen pushes on top of shell instead of switching tab
**Severity:** Medium
**File(s):** `mobile/lib/src/features/feed/presentation/feed_screen.dart:122`
**Description:** The feed screen's search icon navigates with `context.push('/discover')`. Since `/discover` is a branch of the `StatefulShellRoute`, pushing to it creates a new route on the navigation stack _on top of_ the shell, rather than switching to the Discover tab. The user sees the discover screen but the bottom nav still shows "Feed" as selected, and the back button pops back to feed instead of maintaining proper tab state.
**Evidence:**
```dart
// feed_screen.dart:122
onPressed: () => context.push('/discover'),
```
The `/discover` route is defined inside `StatefulShellBranch` at `app_router.dart:236-245`.
**Recommended Fix:** Use `StatefulNavigationShell.goBranch(1)` to switch to the Discover tab, or use `context.go('/discover')` which GoRouter resolves to the correct shell branch.

---

### [MOB-013]: Notification settings not cleared on logout (SharedPreferences persistence)
**Severity:** Medium
**File(s):** `mobile/lib/src/features/profile/presentation/settings_provider.dart`, `mobile/lib/src/features/onboarding/presentation/onboarding_provider.dart`
**Description:** Notification settings (`settings_push_notifications`, `settings_email_notifications`), theme preferences (`theme_mode`), and onboarding state (`hasSeenOnboarding`) are stored in SharedPreferences, which persists across logout/login cycles. If User A configures push notifications off, logs out, and User B logs in, User B inherits User A's notification settings. The onboarding state is particularly problematic: User B will never see onboarding because User A already completed it.
**Evidence:** SharedPreferences keys used across:
- `settings_provider.dart`: `settings_push_notifications`, `settings_email_notifications`
- `theme_provider.dart`: `theme_mode`
- `onboarding_provider.dart`: `hasSeenOnboarding`
- `onboarding_provider.dart`: `pending_genre_preferences`

None of these are cleared in the logout flow (`providers.dart:171-186` or `auth_repository.dart:74-81`).
**Recommended Fix:** Clear all user-scoped SharedPreferences keys during logout. Keep device-scoped preferences (theme) but reset user-scoped ones (notification settings, onboarding state, pending genres).

---

### [MOB-014]: `_AuthStateNotifier` created on every router rebuild (unnecessary allocations)
**Severity:** Low
**File(s):** `mobile/lib/src/core/router/app_router.dart:50-55`
**Description:** The `goRouter` provider creates a new `_AuthStateNotifier` instance and a new `GoRouter` instance every time `authStateProvider` changes (since it `ref.watch`es it). The `_AuthStateNotifier` also internally sets up a `ref.listen` on `authStateProvider`, creating a second subscription. This means every auth state change (login, logout, refresh) recreates the entire router, which can cause navigation stack loss.
**Evidence:**
```dart
@riverpod
GoRouter goRouter(Ref ref) {
  final authState = ref.watch(authStateProvider);  // triggers rebuild
  // ...
  final notifier = _AuthStateNotifier(ref);  // new instance each rebuild
  return GoRouter( ... refreshListenable: notifier, ... );  // new router
}
```
The `ref.watch` causes a full rebuild, but the `refreshListenable` pattern is designed to work with `ref.listen` instead, notifying the existing router.
**Recommended Fix:** Remove `ref.watch(authStateProvider)` from the router provider. The `_AuthStateNotifier` with `ref.listen` + `refreshListenable` already handles reactive auth changes. Read `authStateProvider` inside the `redirect` callback using `ref.read()` instead.

---

### [MOB-015]: `serverSubscriptionStatusProvider` uses `ref.read` instead of `ref.watch`
**Severity:** Low
**File(s):** `mobile/lib/src/features/subscription/presentation/subscription_providers.dart:29-31`
**Description:** The `serverSubscriptionStatusProvider` reads the repository with `ref.read` instead of `ref.watch`. This means it captures the repository instance at creation time and will not react if the DioClient or repository is recreated (unlikely but possible during testing or hot reload).
**Evidence:**
```dart
final serverSubscriptionStatusProvider = FutureProvider((ref) {
  return ref.read(subscriptionRepositoryProvider).getStatus();
});
```
All other providers in the codebase consistently use `ref.watch` for repository access. This is a consistency issue more than a functional bug.
**Recommended Fix:** Change `ref.read` to `ref.watch` for consistency with the rest of the codebase.

---

### [MOB-016]: `trendingFeedProvider` uses `ref.read` for repository but `ref.watch` for location
**Severity:** Low
**File(s):** `mobile/lib/src/features/trending/presentation/providers/trending_providers.dart:16`
**Description:** Same pattern as MOB-015. The `trendingFeedProvider` uses `ref.read(trendingRepositoryProvider)` while `ref.watch(currentLocationProvider.future)`. The inconsistency does not cause bugs currently but violates the codebase convention.
**Evidence:**
```dart
final trendingFeedProvider = FutureProvider.autoDispose<List<TrendingEvent>>((ref) async {
  final repo = ref.read(trendingRepositoryProvider);  // ref.read
  final position = await ref.watch(currentLocationProvider.future);  // ref.watch
```
**Recommended Fix:** Change `ref.read` to `ref.watch` for consistency.

---

### [MOB-017]: `userBadges` provider ignores `userId` parameter -- always fetches current user's badges
**Severity:** Low
**File(s):** `mobile/lib/src/features/profile/presentation/providers/profile_providers.dart:50-54`
**Description:** The `userBadges` family provider accepts a `userId` parameter but calls `repository.getMyBadges()` (which fetches the current authenticated user's badges) instead of fetching badges for the specified user. This means viewing another user's profile shows your own badges instead of theirs.
**Evidence:**
```dart
@riverpod
Future<List<UserBadge>> userBadges(Ref ref, String userId) async {
  final repository = ref.watch(badgeRepositoryProvider);
  return repository.getMyBadges();  // ignores userId param
}
```
**Recommended Fix:** Either (a) add a `getUserBadges(userId)` method to the badge repository and use it here, or (b) if the API only supports fetching own badges, rename this provider to `myBadges` and remove the family parameter to prevent misuse.

---

## Summary Table

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| MOB-001 | Feed not refreshing after check-in | Blocker | State |
| MOB-002 | Celebration route crash on deep link | Blocker | Navigation |
| MOB-003 | Logout does not clear user data providers | High | State/Security |
| MOB-004 | No token refresh, silent 401 credential wipe | High | Network/Auth |
| MOB-005 | Missing `/venues/:id/shows` route | High | Navigation |
| MOB-006 | Wrapped route `int.parse` crash | High | Navigation |
| MOB-007 | JWT tokens logged in dev mode | Medium | Security |
| MOB-008 | Dead `newReview` WebSocket event | Medium | Cleanup |
| MOB-009 | Wrapped providers not auto-disposed | Medium | Memory |
| MOB-010 | No retry/backoff for API requests | Medium | Network |
| MOB-011 | Discover search missing provider debounce | Medium | Performance |
| MOB-012 | Push to shell route bypasses tab switch | Medium | Navigation |
| MOB-013 | SharedPreferences not cleared on logout | Medium | State/Security |
| MOB-014 | Router rebuilt on every auth change | Low | Performance |
| MOB-015 | Inconsistent `ref.read` in subscription | Low | Consistency |
| MOB-016 | Inconsistent `ref.read` in trending | Low | Consistency |
| MOB-017 | `userBadges` ignores userId param | Low | Correctness |

## Risk Assessment for Beta

**Block beta launch:** MOB-001 and MOB-002 must be fixed. Every user will hit the stale feed (MOB-001) on their first check-in, and process death on Android will crash the celebration screen (MOB-002).

**Fix before public beta:** MOB-003 (data leakage between accounts), MOB-004 (broken auth on token expiry), MOB-005 (crash on "See All"), MOB-006 (deep link crash).

**Fix during beta:** MOB-007 through MOB-013 are quality-of-life and edge case issues that will affect some users but are not session-breaking.

**Backlog:** MOB-014 through MOB-017 are low-risk improvements.

---

## Positive Observations

1. **Provider architecture is mostly clean.** Codegen-based `@riverpod` annotations are used consistently, `keepAlive: true` is correctly applied to repositories and infrastructure providers, and auto-dispose is the default for data-fetching providers.

2. **GoRouter auth redirect is thorough.** The redirect logic handles loading, error, auth, and onboarding states with clear priority ordering. The `_AuthStateNotifier` + `refreshListenable` pattern is correct (modulo MOB-014).

3. **WebSocket service is well-structured.** Exponential backoff reconnection, room management, ping/pong heartbeat, and proper resource cleanup via `dispose()` are all implemented.

4. **Error handling is classified.** The `Failure` hierarchy with `NetworkFailure`, `AuthFailure`, `ValidationFailure`, `ServerFailure` provides clear error categorization, and the `ErrorStateWidget` provides consistent error UI.

5. **Accessibility basics are in place.** The `ScaffoldWithNavBar` uses `Semantics` labels, tooltips, and proper widget structure for screen readers.
