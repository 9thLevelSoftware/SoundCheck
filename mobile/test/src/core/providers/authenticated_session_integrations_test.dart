import 'dart:async';

import 'package:dartz/dartz.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/core/services/push_notification_service.dart';
import 'package:soundcheck_flutter/src/core/services/websocket_service.dart';
import 'package:soundcheck_flutter/src/core/session/authenticated_session.dart';
import 'package:soundcheck_flutter/src/features/auth/domain/user.dart';
import 'package:soundcheck_flutter/src/features/badges/presentation/badge_providers.dart';
import 'package:soundcheck_flutter/src/features/bands/presentation/providers/band_providers.dart';
import 'package:soundcheck_flutter/src/features/checkins/presentation/providers/checkin_providers.dart';
import 'package:soundcheck_flutter/src/features/discover/presentation/providers/discover_providers.dart';
import 'package:soundcheck_flutter/src/features/events/presentation/providers/event_providers.dart';
import 'package:soundcheck_flutter/src/features/feed/data/feed_repository.dart';
import 'package:soundcheck_flutter/src/features/feed/presentation/providers/feed_providers.dart';
import 'package:soundcheck_flutter/src/features/notifications/presentation/providers/notification_providers.dart';
import 'package:soundcheck_flutter/src/features/profile/presentation/providers/profile_providers.dart';
import 'package:soundcheck_flutter/src/features/search/data/discovery_providers.dart';
import 'package:soundcheck_flutter/src/features/search/data/search_providers.dart';
import 'package:soundcheck_flutter/src/features/sharing/presentation/share_providers.dart';
import 'package:soundcheck_flutter/src/features/subscription/presentation/subscription_providers.dart';
import 'package:soundcheck_flutter/src/features/subscription/presentation/subscription_service.dart';
import 'package:soundcheck_flutter/src/features/trending/presentation/providers/trending_providers.dart';
import 'package:soundcheck_flutter/src/features/verification/presentation/providers/claim_providers.dart';
import 'package:soundcheck_flutter/src/features/wrapped/presentation/wrapped_providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('production authenticated-session cleanup', () {
    test('cache invalidator covers the complete current-user inventory', () {
      final invalidated = <Object>[];

      AuthenticatedSessionCacheInvalidator(invalidated.add).invalidateAll();

      final expected = <Object>{
        globalFeedProvider,
        friendsFeedProvider,
        eventFeedProvider,
        happeningNowProvider,
        unseenCountsProvider,
        newCheckinCountProvider,
        activeEventIdsProvider,
        notificationFeedProvider,
        unreadNotificationCountProvider,
        markNotificationAsReadProvider,
        markAllNotificationsAsReadProvider,
        deleteNotificationProvider,
        badgeProgressProvider,
        badgeRarityProvider,
        myBadgesProvider,
        badgeCollectionProvider,
        myClaimsProvider,
        entityStatsProvider,
        wrappedStatsProvider,
        wrappedDetailProvider,
        wrappedSummaryCardProvider,
        revenueCatCustomerInfoProvider,
        serverSubscriptionStatusProvider,
        userRsvpsProvider,
        friendsGoingProvider,
        userSuggestionsProvider,
        discoverBandSearchProvider,
        discoverVenueSearchProvider,
        discoverUserSearchProvider,
        discoverEventSearchProvider,
        discoverSearchResultsProvider,
        recommendedEventsProvider,
        nearbyUpcomingEventsProvider,
        trendingNearbyEventsProvider,
        genreEventsProvider,
        trendingFeedProvider,
        bandGlobalCheckinsProvider,
        bandUserCheckinsProvider,
        searchBandsForCheckinProvider,
        vibeTagsProvider,
        bandCheckInsProvider,
        venueCheckInsProvider,
        userCheckInsProvider,
        checkInDetailProvider,
        checkInToastsProvider,
        checkInCommentsProvider,
        toastCheckInProvider,
        addCommentProvider,
        deleteCommentProvider,
        userCheckInStatsProvider,
        venueRecentBandsProvider,
        nearbyEventsProvider,
        createEventCheckInProvider,
        createManualCheckInProvider,
        submitRatingsProvider,
        userRecentCheckinsProvider,
        userGenreStatsProvider,
        userBadgesProvider,
        concertCredProvider,
        unifiedSearchProvider,
        combinedSearchResultsProvider,
        checkinCardProvider,
        badgeCardProvider,
      };
      expect(invalidated.toSet(), expected);
      expect(invalidated, hasLength(expected.length));
    });

    test(
      'transition unregisters A before reset and isolates a push reset failure',
      () async {
        final events = <String>[];
        final feed = _CleanupFeedRepository(events);
        final push = _CleanupPushService(events, token: 'token-a')
          ..failReset = true;
        final webSocket = _CleanupWebSocketService(events);
        final subscriptions = _CleanupSubscriptionClient(events);
        final container = ProviderContainer(
          overrides: [
            feedRepositoryProvider.overrideWithValue(feed),
            pushNotificationServiceProvider.overrideWithValue(push),
            webSocketServiceProvider.overrideWithValue(webSocket),
            subscriptionSessionClientProvider.overrideWithValue(subscriptions),
          ],
        );
        addTearDown(container.dispose);
        final premiumSubscription = container.listen(
          isPremiumProvider,
          (_, _) {},
          fireImmediately: true,
        );
        addTearDown(premiumSubscription.close);
        container.read(isPremiumProvider.notifier).mergeEvidence(server: true);

        final result = await container
            .read(authenticatedSessionIntegrationsProvider)
            .resetForAccountTransition(_userA);

        expect(result.failedSteps, {AuthenticatedSessionCleanupStep.pushReset});
        expect(result.pushToken, 'token-a');
        expect(
          events,
          containsAllInOrder([
            'unregister:token-a',
            'pushReset',
            'webSocketDisconnect',
            'revenueCatLogout',
            'revenueCatListener:clear',
          ]),
        );
        expect(container.read(isPremiumProvider), isFalse);
      },
    );

    test('logout attempts later cleanup after push reset fails', () async {
      SharedPreferences.setMockInitialValues({'user_cache': 'account-a'});
      final events = <String>[];
      final feed = _CleanupFeedRepository(events);
      final push = _CleanupPushService(events, token: 'token-a')
        ..failReset = true;
      final subscriptions = _CleanupSubscriptionClient(events);
      final container = ProviderContainer(
        overrides: [
          feedRepositoryProvider.overrideWithValue(feed),
          pushNotificationServiceProvider.overrideWithValue(push),
          webSocketServiceProvider.overrideWithValue(
            _CleanupWebSocketService(events),
          ),
          subscriptionSessionClientProvider.overrideWithValue(subscriptions),
        ],
      );
      addTearDown(container.dispose);

      final result = await container
          .read(authenticatedSessionIntegrationsProvider)
          .cleanupForLogout();

      expect(
        result.failedSteps,
        contains(AuthenticatedSessionCleanupStep.pushReset),
      );
      expect(subscriptions.logoutCalls, 1);
      expect(subscriptions.listenerClears, 1);
      expect(
        (await SharedPreferences.getInstance()).containsKey('user_cache'),
        isFalse,
      );
    });

    test('retry executes only the failed token-unregister step', () async {
      final events = <String>[];
      final feed = _CleanupFeedRepository(events)
        ..unregisterResults.addAll([
          const Left(ServerFailure('offline')),
          const Right(null),
        ]);
      final push = _CleanupPushService(events, token: 'token-a');
      final subscriptions = _CleanupSubscriptionClient(events);
      final container = ProviderContainer(
        overrides: [
          feedRepositoryProvider.overrideWithValue(feed),
          pushNotificationServiceProvider.overrideWithValue(push),
          webSocketServiceProvider.overrideWithValue(
            _CleanupWebSocketService(events),
          ),
          subscriptionSessionClientProvider.overrideWithValue(subscriptions),
        ],
      );
      addTearDown(container.dispose);
      final integrations = container.read(
        authenticatedSessionIntegrationsProvider,
      );

      final first = await integrations.resetForAccountTransition(_userA);
      final retry = await integrations.resetForAccountTransition(
        _userA,
        retrySteps: first.failedSteps,
        pushToken: first.pushToken,
      );

      expect(first.failedSteps, {
        AuthenticatedSessionCleanupStep.pushTokenUnregister,
      });
      expect(retry.failedSteps, isEmpty);
      expect(feed.unregisteredTokens, ['token-a', 'token-a']);
      expect(push.resetCalls, 1);
      expect(subscriptions.logoutCalls, 1);
    });

    test(
      'RevenueCat listener remains installed after identity and info refresh',
      () async {
        final events = <String>[];
        final subscriptions = _CleanupSubscriptionClient(events);
        final container = ProviderContainer(
          overrides: [
            subscriptionSessionClientProvider.overrideWithValue(subscriptions),
          ],
        );
        addTearDown(container.dispose);
        final premiumSubscription = container.listen(
          isPremiumProvider,
          (_, _) {},
          fireImmediately: true,
        );
        addTearDown(premiumSubscription.close);
        final integrations = container.read(
          authenticatedSessionIntegrationsProvider,
        );

        await integrations.synchronizeRevenueCat(_userA);

        expect(
          events,
          containsAllInOrder([
            'revenueCatLogin:user-a',
            'revenueCatListener:install',
            'revenueCatCustomerInfo',
          ]),
        );
        expect(subscriptions.listener, isNotNull);

        await integrations.resetForAccountTransition(
          _userA,
          retrySteps: {AuthenticatedSessionCleanupStep.revenueCatListener},
        );

        expect(subscriptions.listener, isNull);
        expect(subscriptions.listenerClears, 1);
      },
    );
  });
}

class _CleanupFeedRepository extends FeedRepository {
  _CleanupFeedRepository(this.events)
    : super(dioClient: DioClient(secureStorage: const FlutterSecureStorage()));

  final List<String> events;
  final unregisterResults = <Either<Failure, void>>[];
  final unregisteredTokens = <String>[];

  @override
  Future<Either<Failure, void>> unregisterDeviceToken(String token) async {
    events.add('unregister:$token');
    unregisteredTokens.add(token);
    if (unregisterResults.isNotEmpty) {
      return unregisterResults.removeAt(0);
    }
    return const Right(null);
  }
}

class _CleanupPushService extends PushNotificationService {
  _CleanupPushService(this.events, {required this.token})
    : super(
        messagingClient: _NoopMessagingClient(),
        localNotificationsInitializer: _noop,
      );

  final List<String> events;
  final String? token;
  bool failReset = false;
  int resetCalls = 0;

  @override
  String? get currentToken => token;

  @override
  Future<void> resetForLogout() async {
    events.add('pushReset');
    resetCalls++;
    if (failReset) throw StateError('push reset failed');
  }
}

class _CleanupWebSocketService extends WebSocketService {
  _CleanupWebSocketService(this.events);

  final List<String> events;

  @override
  void disconnect({bool clearCredentials = true}) {
    events.add('webSocketDisconnect');
  }
}

class _CleanupSubscriptionClient implements SubscriptionSessionClient {
  _CleanupSubscriptionClient(this.events);

  final List<String> events;
  int logoutCalls = 0;
  int listenerClears = 0;
  CustomerInfoUpdateListener? listener;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  @override
  Future<CustomerInfo?> getCustomerInfo() async {
    events.add('revenueCatCustomerInfo');
    return null;
  }

  @override
  Future<bool> login(String userId) async {
    events.add('revenueCatLogin:$userId');
    return true;
  }

  @override
  Future<void> logout() async {
    events.add('revenueCatLogout');
    logoutCalls++;
  }

  @override
  void setCustomerInfoUpdateListener(CustomerInfoUpdateListener? listener) {
    this.listener = listener;
    events.add('revenueCatListener:${listener == null ? 'clear' : 'install'}');
    if (listener == null) listenerClears++;
  }
}

class _NoopMessagingClient implements PushMessagingClient {
  @override
  Future<bool> ensureInitialized() async => true;

  @override
  Future<RemoteMessage?> getInitialMessage() async => null;

  @override
  Future<String?> getToken() async => null;

  @override
  Stream<RemoteMessage> get onMessage => const Stream.empty();

  @override
  Stream<RemoteMessage> get onMessageOpenedApp => const Stream.empty();

  @override
  Stream<String> get onTokenRefresh => const Stream.empty();

  @override
  void registerBackgroundHandler() {}

  @override
  Future<AuthorizationStatus> requestPermission() async {
    return AuthorizationStatus.authorized;
  }
}

Future<void> _noop() async {}

const _userA = User(
  id: 'user-a',
  email: 'a@example.com',
  username: 'user-a',
  isVerified: true,
  isActive: true,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
);
