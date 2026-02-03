---
phase: 05-social-feed-realtime
plan: 03
subsystem: mobile-feed-ui
tags: [flutter, freezed, riverpod, websocket, fcm, firebase-messaging, cursor-pagination, feed-cards]
requires:
  - phase: 05-01
    provides: "Feed backend endpoints (friends, event, happening now, unseen, mark-read)"
  - phase: 05-02
    provides: "WebSocket new_checkin/same_event_checkin events, device token endpoint"
  - phase: 04-03
    provides: "Badge collection UI patterns (ConsumerStatefulWidget, Freezed codegen, WebSocket listeners)"
provides:
  - Three-tab feed screen (Friends, Events, Happening Now)
  - Untappd-style FeedCard with balanced photo + event info
  - HappeningNowCard with grouped friends and live indicator
  - NewCheckinsBanner with slide-in animation
  - Feed providers with cursor pagination and WebSocket integration
  - PushNotificationService with FCM and flutter_local_notifications
  - FeedRepository consuming all feed backend endpoints
affects:
  - phase-06 (profile: may link to feed items or reuse FeedCard)
  - phase-07 (discovery: event feed tab could link to event detail pages)
tech-stack:
  added: [firebase_messaging, flutter_local_notifications]
  patterns: [three-tab-feed, cursor-pagination-provider, websocket-stream-mixin, fcm-foreground-local-notification]
key-files:
  created:
    - mobile/lib/src/features/feed/domain/feed_item.dart
    - mobile/lib/src/features/feed/domain/happening_now_group.dart
    - mobile/lib/src/features/feed/data/feed_repository.dart
    - mobile/lib/src/features/feed/presentation/widgets/feed_card.dart
    - mobile/lib/src/features/feed/presentation/widgets/happening_now_card.dart
    - mobile/lib/src/features/feed/presentation/widgets/new_checkins_banner.dart
    - mobile/lib/src/features/feed/presentation/providers/feed_providers.dart
    - mobile/lib/src/core/services/push_notification_service.dart
  modified:
    - mobile/lib/src/features/feed/presentation/feed_screen.dart
    - mobile/lib/src/core/services/websocket_service.dart
    - mobile/lib/src/core/providers/providers.dart
    - mobile/android/app/build.gradle.kts
    - mobile/pubspec.yaml
key-decisions:
  - "flutter_local_notifications v20 requires core library desugaring enabled in build.gradle.kts"
  - "FeedWebSocketListenerMixin pattern for reusable WebSocket subscription in ConsumerStatefulWidgets"
  - "Same-event detection uses local ActiveEventIds provider for O(1) client-side check"
  - "Provider names follow riverpod_generator convention: friendsFeedProvider not friendsFeedNotifierProvider"
  - "Riverpod 3.1.0 AsyncValue uses .value not .valueOrNull"
duration: 12 min
completed: 2026-02-03
---

# Phase 5 Plan 3: Mobile Feed UI Summary

**Three-tab FOMO feed with Untappd-style cards, WebSocket real-time banner, cursor pagination, FCM push notifications, and same-event "X is here too!" alerts**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3/3 complete + checkpoint verified
- **Files modified:** 15+ (including generated Freezed/Riverpod files)

## Accomplishments

1. **Freezed models**: FeedItem, FeedPage, UnseenCounts, HappeningNowGroup, HappeningNowFriend -- all with fromJson factories matching backend response shapes.

2. **FeedRepository**: 6 API methods consuming backend feed endpoints (friends feed, event feed, happening now, unseen counts, mark-read, device token registration).

3. **PushNotificationService**: FCM initialization, permission request, token management with backend registration, foreground notification display via flutter_local_notifications, background handler.

4. **WebSocketService extensions**: Added newCheckinStream and sameEventCheckinStream broadcast controllers, sameEventCheckin event constant.

5. **FeedCard widget**: Untappd-style balanced layout with user avatar + check-in text header, CachedNetworkImage photo area with gradient overlay, badge earned ribbon, toast/comment action buttons with counts, relative timestamp.

6. **HappeningNowCard widget**: Event header with venue, overlapping friend avatar row (max 3 + overflow), friend name text, live pulsing indicator, relative timestamp.

7. **NewCheckinsBanner**: SlideTransition animated banner with electricPurple background, tap-to-load.

8. **Feed screen**: Three-tab layout with NestedScrollView, TabBar with animated unseen count badges, WebSocket listener mixin for real-time updates.

9. **Feed providers**: FriendsFeedNotifier (cursor pagination with loadMore), EventFeedNotifier (family by eventId), HappeningNow, UnseenCounts, NewCheckinCount (WebSocket-driven), ActiveEventIds (for same-event detection), mark-read on tab switch.

10. **Core library desugaring**: Enabled in build.gradle.kts for flutter_local_notifications v20 compatibility.

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Freezed models, feed repository, push notification service | `28aba1a` | domain models, FeedRepository, PushNotificationService, WebSocketService streams |
| 2 | Tabbed feed screen with cards and banner | `bade616` | FeedScreen rewrite, FeedCard, HappeningNowCard, NewCheckinsBanner, feedRepositoryProvider |
| 3 | Feed providers with WebSocket integration | `34115b5` | feed_providers.dart with all providers, WebSocket mixin in feed_screen.dart |
| fix | Core library desugaring | `3d9d0b1` | build.gradle.kts desugaring + desugar_jdk_libs dependency |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| flutter_local_notifications v20 + core library desugaring | v20 requires Java 8+ APIs via desugaring; enabled in build.gradle.kts |
| FeedWebSocketListenerMixin pattern | Reusable mixin for ConsumerStatefulWidgets that need WebSocket subscription lifecycle |
| ActiveEventIds provider for client-side same-event detection | O(1) local check instead of server round-trip when WebSocket event arrives |
| Riverpod 3.1.0 .value not .valueOrNull | API change in newer Riverpod; updated all AsyncValue access patterns |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] flutter_local_notifications v20 API changes**
- **Found during:** Task 1 (PushNotificationService)
- **Issue:** v20 uses named parameters for initialize() and show() instead of positional
- **Fix:** Updated to named parameter syntax
- **Committed in:** 28aba1a

**2. [Rule 3 - Blocking] Export before part directive**
- **Found during:** Task 3 (feed_providers.dart)
- **Issue:** Dart requires export directives before part directives
- **Fix:** Reordered directives
- **Committed in:** 34115b5

**3. [Rule 3 - Blocking] Riverpod generator provider naming**
- **Found during:** Task 3 (feed_screen.dart)
- **Issue:** riverpod_generator produces friendsFeedProvider not friendsFeedNotifierProvider
- **Fix:** Updated all provider references
- **Committed in:** 34115b5

**4. [Rule 3 - Blocking] Core library desugaring required**
- **Found during:** Build verification
- **Issue:** flutter_local_notifications v20 requires desugaring for Java 8+ APIs
- **Fix:** Enabled isCoreLibraryDesugaringEnabled + added desugar_jdk_libs dependency
- **Committed in:** 3d9d0b1

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All fixes necessary for compilation. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

**External services require manual configuration.** See [05-USER-SETUP.md](./05-USER-SETUP.md) for:
- FIREBASE_SERVICE_ACCOUNT_JSON env var for push notifications
- Firebase Cloud Messaging must be enabled in Firebase project

## Next Phase Readiness

- Complete feed experience is functional on mobile
- Backend + real-time + mobile UI all integrated
- Push notifications ready (pending Firebase configuration)
- No blockers for Phase 6 (Profile & Concert Cred)

---
*Phase: 05-social-feed-realtime*
*Completed: 2026-02-03*
