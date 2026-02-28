# Phase 12 Execution — Resume Point

## Status: Waves 1-3 COMPLETE, Wave 4 PENDING

**Committed backend**: `24e95b8` — All backend work done (Plans 01-04)
**Uncommitted mobile**: Plans 05+06 files written, build_runner done, dart analyze 0 errors
**Next**: Commit Wave 3, then execute Wave 4 (Plan 07)

## Completed

### Wave 1 (Plans 01 + 02) ✅ committed
### Wave 2 (Plans 03 + 04) ✅ committed
### Wave 3 (Plans 05 + 06) ✅ written + verified, needs commit

- **Plan 05**: Wrapped feature — Freezed models, repository, providers, StoryProgressBar, WrappedSlide, WrappedStoryScreen (6 slides, auto-advance, progress bar, share), WrappedDetailScreen (premium analytics)
- **Plan 06**: Subscription feature — purchases_flutter added, SubscriptionService (RevenueCat wrapper), NotifierProvider for isPremium, ProFeatureScreen, PremiumPaywallSheet, ProBadge

**Key API detail**: isPremiumProvider uses `NotifierProvider<IsPremiumNotifier, bool>` (Riverpod v3 — no StateProvider). Call `.set(true/false)` on notifier.

## Remaining

### Wave 4 (Plan 07) — Integration wiring
Files to modify (5 files):

1. **mobile/lib/main.dart** — Add `import 'src/features/subscription/presentation/subscription_service.dart';` and `await SubscriptionService.initialize();` after `await AnalyticsService.initialize();` (line 22)

2. **mobile/lib/src/core/providers/providers.dart** — In AuthState class:
   - Add imports: `import '../../features/subscription/presentation/subscription_service.dart';` and `import '../../features/subscription/presentation/subscription_providers.dart';`
   - In `build()` (line 101): after `if (user != null) { _connectWebSocket(user.id); }` add:
     ```dart
     try {
       await SubscriptionService.login(user.id);
       final premium = await SubscriptionService.isPremium();
       ref.read(isPremiumProvider.notifier).set(premium);
       AnalyticsService.setUserProperty(name: 'plan', value: premium ? 'premium' : 'free');
     } catch (_) {}
     ```
   - In `login()` (line 113): after `_connectWebSocket(authResponse.user.id);` add same try/catch block with `authResponse.user.id`
   - In `logout()` (line 161): after `wsService.disconnect();` add:
     ```dart
     try { await SubscriptionService.logout(); } catch (_) {}
     ref.read(isPremiumProvider.notifier).set(false);
     ```
   - Also need to import AnalyticsService

3. **mobile/lib/src/core/router/app_router.dart** (path is `core/router/` NOT `core/routing/`):
   - Add imports for WrappedStoryScreen, WrappedDetailScreen, ProFeatureScreen
   - Add 3 GoRoute entries after the checkin-detail route (before line 583's `]`):
     - `/wrapped/:year` → WrappedStoryScreen(year:) with FadeTransition
     - `/wrapped/:year/detail` → WrappedDetailScreen(year:) with SlideTransition
     - `/pro` → ProFeatureScreen() with SlideTransition
   - Use existing slide transition pattern: `Tween(begin: Offset(1.0, 0.0), end: Offset.zero).chain(CurveTween(curve: Curves.easeInOut))`

4. **mobile/lib/src/features/profile/presentation/profile_screen.dart**:
   - Add imports: `../../subscription/presentation/subscription_providers.dart` and `../../subscription/presentation/widgets/pro_badge.dart`
   - At line 269 (username Text widget): wrap in a Row with ProBadge conditional on `ref.watch(isPremiumProvider)`
   - After `_MainStatsRow` usage: add "Your Wrapped" entry card with `context.push('/wrapped/${DateTime.now().year}')`
   - Profile header section `_ProfileHeader` is a private widget — check if it's ConsumerWidget or needs conversion

5. **mobile/lib/src/core/services/analytics_service.dart**:
   - Add to AnalyticsEvents class: wrappedViewed, wrappedSlideViewed, wrappedShared, wrappedDetailViewed, subscriptionViewed, subscriptionStarted, subscriptionRestored, paywallViewed, paywallDismissed
   - Add to AnalyticsProperties class: wrappedYear, slideIndex, statType, sharePlatform, subscriptionProduct

### Post Wave 4:
- `dart analyze` to verify 0 errors
- Commit all Wave 3+4: `git add mobile/ && git commit -m "feat(12): implement Phase 12 mobile — Wrapped UI, subscription, integration"`
- Update RESUME.md to completed

## Resume Command
```
/gsd:execute-phase 12
```
Wave 3 files done (0 errors). Commit Wave 3, execute Plan 07, verify, commit final.
