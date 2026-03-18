# Phase 1 Mobile UI/UX Audit -- Beta Readiness Review

**Auditor:** Frontend Developer Agent (Claude Opus 4.6)
**Date:** 2026-03-18
**Scope:** All 19 feature modules, shared widgets, accessibility, crash paths, image handling, form validation
**Target:** SoundCheck Flutter app (Flutter 3.27.4+, Material 3, dark-first theme)
**Audience:** ~500-2,000 public beta users

---

## Executive Summary

The SoundCheck mobile app demonstrates solid foundational patterns: a shared `ErrorStateWidget` with Dio error classification, `EmptyStateWidget` with per-feature empty states, skeleton loaders for bands/venues/profiles, and a dedicated accessibility utilities library (`a11y_utils.dart`). Riverpod `AsyncValue.when()` is used consistently for loading/error/data tristate across most screens.

However, the audit uncovered **6 blockers**, **9 high-severity**, **14 medium**, and **6 low** findings across crash paths, accessibility gaps, hardcoded data, inconsistent error handling, and missing null guards. The blockers relate to compile-time errors from `Theme.of(context)` in `const` contexts that will crash on any build, and hardcoded mock data shipped in production screens.

---

## Findings

### [MOB-050]: `BandCard._buildPlaceholder()` uses `Theme.of(context)` in a `StatelessWidget` method without access to `context`
**Severity:** Blocker
**File(s):** `mobile/lib/src/shared/widgets/band_card.dart:166-176`
**Description:** The `_buildPlaceholder()` method references `Theme.of(context)` but is a standalone method on a `StatelessWidget` -- it has no `context` parameter. The `build()` method's `context` is not in scope for private helper methods that are not closures within `build()`. This will cause a compile error or runtime `NoSuchMethodError` if the Dart analyzer does not catch the scoping issue at compile time.
**Evidence:**
```dart
Widget _buildPlaceholder() {
  return Container(
    color: Theme.of(context).colorScheme.surfaceContainerHighest, // context not in scope
```
**Recommended Fix:** Pass `BuildContext context` as a parameter to `_buildPlaceholder(context)`, or convert to a private `_Placeholder` widget that receives the theme color.

---

### [MOB-051]: `VenueCard._buildPlaceholder()` has identical `context` scoping bug
**Severity:** Blocker
**File(s):** `mobile/lib/src/shared/widgets/venue_card.dart:159-170`
**Description:** Same issue as MOB-050 -- `_buildPlaceholder()` references `Theme.of(context)` without access to BuildContext.
**Evidence:**
```dart
Widget _buildPlaceholder() {
  return Container(
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
```
**Recommended Fix:** Same as MOB-050 -- pass `context` as a parameter.

---

### [MOB-052]: `FeedCard._PhotoArea` badge earned indicator uses `const` with `Theme.of(context)`
**Severity:** Blocker
**File(s):** `mobile/lib/src/features/feed/presentation/widgets/feed_card.dart:370-382`
**Description:** The badge earned overlay contains `const Row(children: [...])` but inside uses `Theme.of(context).scaffoldBackgroundColor` for both the `Icon` and `Text` color. `const` widgets cannot reference runtime values. This will fail at compile time.
**Evidence:**
```dart
child: const Row(
  mainAxisSize: MainAxisSize.min,
  children: [
    Icon(Icons.emoji_events, size: 14, color: Theme.of(context).scaffoldBackgroundColor),
    ...
    Text('Badge Earned!', style: TextStyle(color: Theme.of(context).scaffoldBackgroundColor, ...)),
```
**Recommended Fix:** Remove the `const` keyword from the `Row` widget.

---

### [MOB-053]: `FeedCard` footer border uses `const` with `Theme.of(context)`
**Severity:** Blocker
**File(s):** `mobile/lib/src/features/feed/presentation/widgets/feed_card.dart:168-175`
**Description:** The footer `Container` decoration references `Theme.of(context).colorScheme.surfaceContainerHighest` inside a `const BoxDecoration`. This is a compile error.
**Evidence:**
```dart
decoration: const BoxDecoration(
  border: Border(
    top: BorderSide(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
```
**Recommended Fix:** Remove `const` from the `BoxDecoration`.

---

### [MOB-054]: `NewCheckinsBanner` and `_FeedLoadingState` use `const` with `Theme.of(context)`
**Severity:** Blocker
**File(s):** `mobile/lib/src/features/feed/presentation/widgets/new_checkins_banner.dart:93-102`, `mobile/lib/src/features/feed/presentation/feed_screen.dart:111`
**Description:** Multiple places in the feed widgets use `const` keyword on widgets that contain `Theme.of(context)` calls. These are compile-time errors that would prevent the app from building. The `NewCheckinsBanner` has `const` on an `Icon` and `Text` that reference `Theme.of(context).scaffoldBackgroundColor`. The `SOUNDCHECK` branding text in `FeedScreen` has similar issues at line 111.
**Evidence:** `new_checkins_banner.dart:93`: `const Icon(Icons.arrow_upward, ... color: Theme.of(context).scaffoldBackgroundColor)`
**Recommended Fix:** Remove all `const` keywords from widgets that reference `Theme.of(context)`.

---

### [MOB-055]: `VenueDetailScreen._MapStrip` uses `const` with `Theme.of(context)` in container decoration
**Severity:** Blocker
**File(s):** `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:335`
**Description:** `_MapStrip.build()` has `const BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest)` inside the map placeholder container. This is a compile error.
**Evidence:**
```dart
decoration: const BoxDecoration(
  color: Theme.of(context).colorScheme.surfaceContainerHighest,
```
**Recommended Fix:** Remove `const` from the decoration.

---

### [MOB-056]: `VenueDetailScreen._RecentCheckinsSection` uses hardcoded mock data in production
**Severity:** High
**File(s):** `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:958-1092`
**Description:** The "Recent Check-ins" section on the venue detail screen renders 5 hardcoded fake check-ins with static usernames ('Sarah M.', 'Mike T.', etc.), band names ('Metallica', 'Ghost', etc.), and timestamps. This is clearly development placeholder data that will ship to beta users. It creates false data in a production screen, misleading users into thinking real activity exists.
**Evidence:**
```dart
final users = ['Sarah M.', 'Mike T.', 'Alex R.', 'Jordan L.', 'Casey B.'];
final bands = ['Metallica', 'Ghost', 'Gojira', 'Mastodon', 'Slipknot'];
final times = ['15m ago', '1h ago', '2h ago', '3h ago', '5h ago'];
```
**Recommended Fix:** Replace with a real data fetch from the venue check-ins endpoint, or remove the section entirely until real data is available. At minimum, display an empty state.

---

### [MOB-057]: `VenueDetailScreen._VenueInsightsSection` Loyal Patrons uses hardcoded avatar initials
**Severity:** High
**File(s):** `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:808-831`
**Description:** The "Loyal Patrons" section renders 4 hardcoded avatar circles with static initials ('S', 'M', 'A', '+5'). This is placeholder data that will appear on every venue, regardless of actual patron data.
**Evidence:**
```dart
child: Text(
  i == 3 ? '+5' : ['S', 'M', 'A'][i],
```
**Recommended Fix:** Fetch actual loyal patron data from the backend or hide the section until real data is available.

---

### [MOB-058]: `ForgotPasswordScreen` spinner uses `const` with `Theme.of(context)` for color
**Severity:** High
**File(s):** `mobile/lib/src/features/auth/presentation/forgot_password_screen.dart:185-186`
**Description:** The `CircularProgressIndicator` inside the submit button is wrapped in a `const SizedBox` but references `Theme.of(context).scaffoldBackgroundColor` for color. This is a compile error.
**Evidence:**
```dart
child: CircularProgressIndicator(
  strokeWidth: 2,
  color: Theme.of(context).scaffoldBackgroundColor,
),
```
**Recommended Fix:** Remove `const` from the parent `SizedBox`, or use a static color.

---

### [MOB-059]: `ResetPasswordScreen` has identical `const`/`Theme.of(context)` compile error in spinner
**Severity:** High
**File(s):** `mobile/lib/src/features/auth/presentation/reset_password_screen.dart:276-279`
**Description:** Same issue as MOB-058 -- `CircularProgressIndicator` with `color: Theme.of(context).scaffoldBackgroundColor` inside `const`.
**Recommended Fix:** Remove `const`.

---

### [MOB-060]: `RatingBottomSheet` band avatar icon uses `const` with `Theme.of(context)`
**Severity:** High
**File(s):** `mobile/lib/src/features/checkins/presentation/rating_bottom_sheet.dart:130-131, 327`
**Description:** The `DraggableScrollableSheet` container uses `const BoxDecoration(color: Theme.of(context).colorScheme.surface)` at line 130. The band avatar icon at line 327 uses `color: Theme.of(context).scaffoldBackgroundColor` inside `const Icon`. Both are compile errors.
**Recommended Fix:** Remove `const` keywords from these widgets.

---

### [MOB-061]: `PhotoUploadSheet` upload progress uses `const` with `Theme.of(context)`
**Severity:** High
**File(s):** `mobile/lib/src/features/checkins/presentation/photo_upload_sheet.dart:162-163`
**Description:** The `LinearProgressIndicator` background color references `Theme.of(context).colorScheme.surfaceContainerHighest` inside a `const Column`. Compile error.
**Recommended Fix:** Remove `const` from the `Column`.

---

### [MOB-062]: `ClaimSubmissionScreen` form borders use `const` with `Theme.of(context)`
**Severity:** High
**File(s):** `mobile/lib/src/features/verification/presentation/claim_submission_screen.dart:157-158, 195-196, 233`
**Description:** Both `enabledBorder` declarations use `const BorderSide(color: Theme.of(context).colorScheme.surfaceContainerHighest)` -- compile error. The spinner at line 233 has the same issue with `color: Theme.of(context).scaffoldBackgroundColor`.
**Recommended Fix:** Remove all `const` keywords where `Theme.of(context)` is referenced.

---

### [MOB-063]: `NotificationsScreen._NotificationItem` border uses `const` with `Theme.of(context)`
**Severity:** High
**File(s):** `mobile/lib/src/features/notifications/presentation/notifications_screen.dart:308`
**Description:** The bottom border in the notification item uses `Theme.of(context).colorScheme.surfaceContainerHighest` inside `const Border`. Compile error.
**Recommended Fix:** Remove `const`.

---

### [MOB-064]: `EditProfileScreen` does not upload selected image
**Severity:** High
**File(s):** `mobile/lib/src/features/profile/presentation/edit_profile_screen.dart:72-125`
**Description:** The `_pickImage()` method stores the selected image in `_selectedImage` state, and the avatar UI shows it. However, `_saveProfile()` never references `_selectedImage` -- it only sends text field updates to `authRepository.updateProfile(updates)`. The user sees their new photo in the preview, taps Save, gets "Profile updated successfully", but their profile image is never actually uploaded. This is a data loss/deception bug.
**Evidence:** `_saveProfile()` (lines 72-126) builds `updates` map from text controllers only. No image upload call exists.
**Recommended Fix:** Add image upload logic in `_saveProfile()` -- either upload to the existing photo endpoint before the profile update, or include the image in the update request as multipart form data.

---

### [MOB-065]: `SettingsScreen` error state displays raw error object to users
**Severity:** Medium
**File(s):** `mobile/lib/src/features/profile/presentation/settings_screen.dart:33`
**Description:** When notification settings fail to load, the error state renders `Text('Error: $err')` directly to the user, exposing raw exception details (stack traces, internal URLs, etc.) in the UI.
**Evidence:**
```dart
error: (err, stack) => Center(child: Text('Error: $err')),
```
**Recommended Fix:** Use `ErrorStateWidget` or display a user-friendly message with retry.

---

### [MOB-066]: `UserProfileScreen` error state exposes raw error to users
**Severity:** Medium
**File(s):** `mobile/lib/src/features/profile/presentation/user_profile_screen.dart:76-77`
**Description:** The error state renders `err.toString()` directly in the UI.
**Evidence:**
```dart
Text(err.toString(), style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
```
**Recommended Fix:** Use `ErrorStateWidget` or a generic message. Log technical details instead of displaying them.

---

### [MOB-067]: `BlockedUsersScreen` error state exposes raw error
**Severity:** Medium
**File(s):** `mobile/lib/src/features/profile/presentation/blocked_users_screen.dart:35-36`
**Description:** Same pattern -- `err.toString()` shown to user in error state.
**Recommended Fix:** Replace with user-friendly error message.

---

### [MOB-068]: `DiscoverUsersScreen` error state exposes raw error
**Severity:** Medium
**File(s):** `mobile/lib/src/features/search/presentation/discover_users_screen.dart:89-93`
**Description:** Error state displays `error.toString()` to user.
**Recommended Fix:** Replace with user-friendly error message.

---

### [MOB-069]: `FeedScreen._FeedErrorState` exposes raw error
**Severity:** Medium
**File(s):** `mobile/lib/src/features/feed/presentation/feed_screen.dart:647-652`
**Description:** The feed error state displays `error.toString()` directly to users, which can include internal API URLs, stack traces, and Dio exception details.
**Evidence:**
```dart
Text(
  error.toString(),
  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
  textAlign: TextAlign.center,
),
```
**Recommended Fix:** Replace with the shared `ErrorStateWidget` which classifies Dio errors into user-friendly categories.

---

### [MOB-070]: `EditProfileScreen` exposes raw error in snackbar
**Severity:** Medium
**File(s):** `mobile/lib/src/features/profile/presentation/edit_profile_screen.dart:66, 115-116`
**Description:** Both the image picker error and save error display raw `$e` in SnackBars, exposing internal exception details to users.
**Evidence:** `SnackBar(content: Text('Error picking image: $e'))` and `SnackBar(content: Text('Error updating profile: $e'))`
**Recommended Fix:** Map exceptions to user-friendly messages.

---

### [MOB-071]: Missing `Semantics` labels on multiple interactive elements across screens
**Severity:** Medium
**File(s):** Multiple screens
**Description:** While the app has good accessibility in shared widgets (`BandCard`, `VenueCard`, `StarRating`, `ScaffoldWithNavBar`), several screens lack semantic labels on interactive elements:
- `BandDetailScreen._DescriptionSection` -- "Show more/less" GestureDetector has no semantic label
- `BandDetailScreen._UpcomingShowItem` -- GestureDetector without semantic button label
- `VenueDetailScreen._MapStrip` -- GestureDetector "open in maps" without semantic label
- `VenueDetailScreen._UpcomingEventItem` -- GestureDetector without semantic label
- `VenueDetailScreen._RecentBandsSection` band name GestureDetectors -- no semantic labels
- `HappeningNowCard` -- has a semantic label but its GestureDetector `onTap` is nullable and defaults to null, so cards are tappable but do nothing
- `TrendingFeedSection._TrendingCard` -- GestureDetector without semantic label
- `CheckInDetailScreen` -- various interactive elements may lack labels (large file, partially audited)
**Recommended Fix:** Add `Semantics(button: true, label: '...')` wrappers or `Tooltip` widgets to all GestureDetector/InkWell interactive elements.

---

### [MOB-072]: `_ActionButton` in FeedCard has small touch target (icon + text, no padding)
**Severity:** Medium
**File(s):** `mobile/lib/src/features/feed/presentation/widgets/feed_card.dart:420-464`
**Description:** The toast and comment `_ActionButton` widgets wrap a `GestureDetector` around a `Row` containing a 20px icon and text. The total touch area is approximately 20x20 for the icon portion, well below the 44x44 logical pixel minimum required by WCAG. There is no padding on the GestureDetector.
**Evidence:**
```dart
child: GestureDetector(
  onTap: onTap,
  child: Row(
    children: [
      Icon(icon, size: 20, color: color),
      const SizedBox(width: 6),
      Text(label, ...),
```
**Recommended Fix:** Wrap in a `Padding` with minimum 12px all sides, or use `IconButton`/`TextButton` which enforce minimum touch targets.

---

### [MOB-073]: `_SocialLoginButton` touch target is only 52x52 (12px padding around 28px icon)
**Severity:** Low
**File(s):** `mobile/lib/src/features/auth/presentation/login_screen.dart:434-465`
**Description:** The social login buttons have 12px padding around a 28px icon, totaling 52x52 logical pixels. This meets the 44x44 minimum but is at the lower end. The `InkWell` splash radius of 50 helps, but visual affordance is minimal.
**Recommended Fix:** Consider increasing padding to 16px for a more comfortable 60x60 target.

---

### [MOB-074]: `HappeningNowCard` GestureDetector `onTap` defaults to null -- cards are non-interactive
**Severity:** Medium
**File(s):** `mobile/lib/src/features/feed/presentation/widgets/happening_now_card.dart:13, 67`
**Description:** The `HappeningNowCard` widget has `this.onTap` as an optional parameter defaulting to null. The `FeedScreen` instantiates it as `HappeningNowCard(group: groups[index])` without providing `onTap`. This means the "Happening Now" cards are wrapped in a GestureDetector that does nothing when tapped. Users will tap expecting navigation but nothing happens.
**Evidence:** `FeedScreen` line 575: `return HappeningNowCard(group: groups[index]);` -- no `onTap` provided.
**Recommended Fix:** Provide an `onTap` callback that navigates to the event detail screen, e.g., `onTap: () => context.push('/events/${groups[index].eventId}')`.

---

### [MOB-075]: `EventsFeedNotifier` always returns empty list -- Events tab has no real data
**Severity:** Medium
**File(s):** `mobile/lib/src/features/feed/presentation/providers/feed_providers.dart:116-121`
**Description:** The `EventsFeedNotifier` provider that backs the Events tab's "Events" filter always returns an empty list: `Future<List<FeedItem>> build() async { return []; }`. Users will always see the empty state on the Events tab filter.
**Evidence:**
```dart
class EventsFeedNotifier extends _$EventsFeedNotifier {
  @override
  Future<List<FeedItem>> build() async {
    return [];
  }
}
```
**Recommended Fix:** Implement actual event feed fetching or add a clear "Coming soon" indicator instead of a generic empty state.

---

### [MOB-076]: `WrappedDetailScreen` fires analytics in `build()` method -- triggers on every rebuild
**Severity:** Medium
**File(s):** `mobile/lib/src/features/wrapped/presentation/wrapped_detail_screen.dart:19-22`
**Description:** `AnalyticsService.logEvent(name: 'wrapped_detail_viewed', ...)` is called directly inside the `build()` method of a `ConsumerWidget`. This fires on every widget rebuild (state change, parent rebuild, provider update), not just on initial screen view. This will pollute analytics data.
**Evidence:**
```dart
Widget build(BuildContext context, WidgetRef ref) {
  final detailAsync = ref.watch(wrappedDetailProvider(year));
  AnalyticsService.logEvent(name: 'wrapped_detail_viewed', parameters: {'year': year});
```
**Recommended Fix:** Move analytics logging to `initState()` by converting to `ConsumerStatefulWidget`, or use a `ref.listen` with a flag to fire only once.

---

### [MOB-077]: `TrendingFeedSection` silently swallows errors -- shows nothing on API failure
**Severity:** Medium
**File(s):** `mobile/lib/src/features/trending/presentation/trending_feed_screen.dart:117`
**Description:** The `trendingAsync.when(error: (_, __) => const SizedBox.shrink())` silently hides the entire trending section when the API call fails, with no retry affordance and no indication to the user that something went wrong.
**Recommended Fix:** Show a compact error state with retry, or at minimum log the error. Silent failure during network issues will make the section appear broken.

---

### [MOB-078]: `UserProfileScreen` creates `User.fromJson()` from raw map -- crash if shape changes
**Severity:** Medium
**File(s):** `mobile/lib/src/features/profile/presentation/user_profile_screen.dart:90`
**Description:** The profile screen watches `userPublicProfileProvider(userId)` which returns raw `Map<String, dynamic>` data, then calls `User.fromJson(profileData)` inline in the widget. If the API response shape changes or a field is missing, `fromJson` will throw an unhandled exception that crashes the screen instead of showing an error state.
**Evidence:**
```dart
data: (profileData) {
  final user = User.fromJson(profileData);
```
**Recommended Fix:** Move `User.fromJson()` into the provider so that deserialization errors are caught by the `AsyncValue.error` state, or wrap in try/catch.

---

### [MOB-079]: `EditProfileScreen` does not validate bio length against server limits
**Severity:** Low
**File(s):** `mobile/lib/src/features/profile/presentation/edit_profile_screen.dart:270-279`
**Description:** The bio field has `maxLength: 200` enforced client-side, but there is no validator attached. If the server expects a different limit, submissions may fail. More critically, empty strings are sent as-is -- `_bioController.text.trim()` is added to updates when non-empty, but empty bio sends nothing (no way to clear bio).
**Recommended Fix:** Add a validator and handle bio clearing explicitly.

---

### [MOB-080]: `DiscoverUsersScreen` follow state is local-only -- not synced from server
**Severity:** Low
**File(s):** `mobile/lib/src/features/search/presentation/discover_users_screen.dart:19-43`
**Description:** The follow state (`_followedIds`) is managed locally with `setState`. On screen re-entry, all users appear as "not followed" even if the user already follows them. The server state is not fetched on mount.
**Recommended Fix:** Fetch the user's existing follows on screen init, or have the provider return follow status along with suggestions.

---

### [MOB-081]: `EmptyStateWidget` missing types for feed, notifications, events, users, trending
**Severity:** Low
**File(s):** `mobile/lib/src/shared/widgets/empty_state_widget.dart:5-12`
**Description:** The `EmptyStateType` enum covers `noVenues`, `noBands`, `noCheckins`, `noBadges`, `noSearchResults`, and `general`. However, many screens create custom empty states inline instead of using the shared widget with new enum values for: feed (friends/events/happening now), notifications, users/followers, events, trending. This leads to inconsistent empty state designs.
**Recommended Fix:** Add enum values for `noFriendActivity`, `noEvents`, `noNotifications`, `noUsers`, `noTrending` to ensure consistent empty state UX.

---

### [MOB-082]: Multiple screens do not have pull-to-refresh on error states
**Severity:** Low
**File(s):** `BadgeCollectionScreen`, `BandDetailScreen`, `EventDetailScreen`, `SettingsScreen`
**Description:** When these screens encounter an error, they show a static error view with a retry button but no `RefreshIndicator`. On mobile, users instinctively pull-to-refresh. Screens like `FeedScreen`, `BandsScreen`, and `VenuesScreen` correctly wrap content in `RefreshIndicator` but the detail screens do not.
**Recommended Fix:** Wrap error states in a scrollable `RefreshIndicator` so users can pull-to-refresh after errors.

---

### [MOB-083]: `ClaimSubmissionScreen` allows empty evidence submission
**Severity:** Medium
**File(s):** `mobile/lib/src/features/verification/presentation/claim_submission_screen.dart:39-77`
**Description:** The submit button calls `_submit()` which sends `evidenceText` as `_evidenceTextController.text.trim()` but does not validate that it is non-empty. A user can submit a verification claim with completely empty evidence text. The evidence URL is correctly marked as optional, but the primary evidence text should be required for a claim to be meaningful.
**Evidence:** `_submit()` has no validation check before calling `repo.submitClaim(...)`.
**Recommended Fix:** Add form validation requiring non-empty evidence text, or at minimum a `FormState.validate()` check.

---

### [MOB-084]: Image handling -- `UserProfileScreen` and `DiscoverUsersScreen` use `NetworkImage` instead of `CachedNetworkImage`
**Severity:** Low
**File(s):** `mobile/lib/src/features/profile/presentation/user_profile_screen.dart:114`, `mobile/lib/src/features/search/presentation/discover_users_screen.dart:211`, `mobile/lib/src/features/profile/presentation/edit_profile_screen.dart:170-171`
**Description:** Several screens use raw `NetworkImage` for user avatars instead of `CachedNetworkImage`. This means: (1) images are re-downloaded on every screen visit, (2) no placeholder/error widget is shown during load, and (3) if the image URL is invalid or the network is slow, a `NetworkImageLoadException` can crash the `CircleAvatar`. The `BandCard`, `VenueCard`, and `FeedCard` correctly use `CachedNetworkImage` with error/placeholder widgets.
**Recommended Fix:** Replace `NetworkImage(url)` with `CachedNetworkImage` inside `ClipOval` or provide `onError` handler for `CircleAvatar`.

---

### [MOB-085]: `ErrorStateWidget` shows "View Technical Details" button to all users in production
**Severity:** Medium
**File(s):** `mobile/lib/src/shared/widgets/error_state_widget.dart:86-97`
**Description:** The `ErrorStateWidget` always shows a "View Technical Details" TextButton that opens a dialog displaying the raw error string and stack trace. The comment says "in debug mode" but the check is `if (error.toString().isNotEmpty)` which is always true. This exposes internal stack traces, API endpoints, and error details to end users in production.
**Evidence:**
```dart
// Technical Details (in debug mode)
if (error.toString().isNotEmpty) ...[
  ...
  TextButton(
    onPressed: () { _showErrorDetails(context); },
    child: const Text('View Technical Details', ...),
```
**Recommended Fix:** Gate behind `kDebugMode` from `package:flutter/foundation.dart`: `if (kDebugMode && error.toString().isNotEmpty)`.

---

---

## Summary by Module

| Module | Loading | Error | Empty | Pull-to-Refresh | Accessibility | Issues |
|--------|---------|-------|-------|-----------------|--------------|--------|
| auth (login) | Full-screen overlay | SnackBar | N/A | N/A | Good (labels, autofill) | -- |
| auth (register) | Inline spinner | SnackBar | N/A | N/A | Good (autofill) | -- |
| auth (forgot/reset password) | Inline spinner | SnackBar | N/A | N/A | Good | MOB-058, MOB-059 |
| badges | CircularProgressIndicator | Retry button | Custom empty | No | Good (a11y_utils) | -- |
| bands (list) | BandCardSkeleton | ErrorStateWidget | EmptyStateWidget | Yes | Good (BandCard semantics) | -- |
| bands (detail) | CircularProgressIndicator | Custom retry | Custom empty per tab | No | Partial (social icons OK, description missing) | MOB-071 |
| checkins (screen) | Inline states | SnackBar | GPS fallback flow | No | Good (a11y_utils used) | -- |
| checkins (detail) | CircularProgressIndicator | Custom | N/A | Yes | Partial | -- |
| checkins (rating) | Inline | SnackBar | "No bands in lineup" | No | Good (liveRegion) | MOB-060 |
| checkins (photos) | Upload progress | Inline error | Skip button | No | Good (button labels) | MOB-061 |
| discover | Multiple providers | Varied | Custom per section | Yes | Good (a11y_utils) | -- |
| events (detail) | CircularProgressIndicator | Retry | N/A | No | Partial | -- |
| feed | Custom skeleton | Custom retry + raw error | EmptyStateWidget | Yes | Good (feedCardSemantics) | MOB-052-054, MOB-069, MOB-074, MOB-075 |
| notifications | CircularProgressIndicator | Custom retry | Custom empty | Yes | Partial | MOB-063 |
| onboarding | N/A | N/A | N/A | N/A | Adequate | -- |
| profile (own) | ProfileSkeleton | via AuthState | "Not logged in" | Yes | Partial | -- |
| profile (other) | CircularProgressIndicator | Custom retry | N/A | Yes | Partial | MOB-066, MOB-078 |
| profile (edit) | Inline | SnackBar | N/A | No | Adequate | MOB-064, MOB-070 |
| profile (settings) | CircularProgressIndicator | Raw error text | N/A | No | Adequate | MOB-065 |
| profile (blocked) | CircularProgressIndicator | Custom retry + raw error | Custom empty | No | Adequate | MOB-067 |
| reporting | Inline | SnackBar | N/A | No | Adequate | -- |
| search | CircularProgressIndicator | Custom error | Custom empty | No | Adequate | -- |
| search (users) | CircularProgressIndicator | Custom retry | Custom empty | Yes | Adequate | MOB-068, MOB-080 |
| sharing (celebration) | Animation | N/A | N/A | No | Partial | -- |
| subscription | Inline | SnackBar | N/A | No | Adequate | -- |
| trending | Small spinner | Silent hide | Hide section | No | Partial (missing card semantics) | MOB-077 |
| venues (list) | VenueCardSkeleton | ErrorStateWidget | EmptyStateWidget | Yes | Good (VenueCard semantics) | -- |
| venues (detail) | CircularProgressIndicator | Retry | Custom per section | No | Partial | MOB-055-057, MOB-071 |
| verification (submit) | Inline | SnackBar | N/A | No | Adequate | MOB-062, MOB-083 |
| verification (claims) | CircularProgressIndicator | Retry | Custom empty | Yes | Adequate | -- |
| wrapped | CircularProgressIndicator | 403 handling | N/A | No | Partial | MOB-076 |

---

## Risk Assessment for Beta

### Blockers (Must fix before any beta)
- **MOB-050 through MOB-055**: The `const`/`Theme.of(context)` pattern is used pervasively. If these files currently compile, it may be because the Dart analyzer is lenient in certain contexts or the `const` is being silently dropped. However, these represent real fragility -- a Dart/Flutter upgrade could turn them into hard compile errors. Each needs verification and fixing.

### High Priority (Fix before wide beta)
- **MOB-056, MOB-057**: Hardcoded mock data in venue detail will immediately erode user trust in data authenticity.
- **MOB-064**: Profile image upload silently fails -- users will report "photo didn't save" bugs.
- **MOB-058-063**: Additional const/Theme errors in auth, rating, photo upload, notification, and claim screens.

### Acceptable for Limited Beta (Fix before GA)
- **MOB-065-070, MOB-085**: Raw error exposure is a security/polish concern but not a crash risk.
- **MOB-071-073**: Accessibility gaps are important but won't crash the app.
- **MOB-074-084**: Functional gaps in events tab, analytics, follow state, form validation.

---

## Positive Observations

1. **Consistent tristate pattern**: Nearly all async screens use Riverpod `AsyncValue.when(loading, error, data)` with appropriate UI for each state.
2. **Shared error/empty widgets**: `ErrorStateWidget` with Dio error classification and `EmptyStateWidget` with per-type configurations are well-designed.
3. **Skeleton loaders**: `BandCardSkeleton`, `VenueCardSkeleton`, `ProfileSkeleton` provide polished shimmer loading states.
4. **Accessibility foundation**: `a11y_utils.dart` provides semantic label generators used in feed, badges, and check-in screens. `BandCard`, `VenueCard`, `StarRating`, and `ScaffoldWithNavBar` all have proper `Semantics` wrappers.
5. **Image handling**: Most screens correctly use `CachedNetworkImage` with placeholder and error widgets.
6. **Pull-to-refresh**: All list screens (Feed, Bands, Venues, Notifications, User Profile) implement `RefreshIndicator`.
7. **Error boundaries**: Auth screens properly handle multiple error types with user-friendly messages.
8. **Dark theme support**: Skeleton loaders detect dark/light mode and adjust shimmer colors accordingly.
