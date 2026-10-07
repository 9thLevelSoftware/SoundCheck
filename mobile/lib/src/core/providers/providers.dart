import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/dio_client.dart';
import '../security/secure_storage_options.dart';
import '../session/authenticated_session.dart';
import '../services/analytics_service.dart';
import '../services/log_service.dart';
import '../services/push_notification_service.dart';
import '../services/websocket_service.dart';
import '../../shared/services/location_service.dart';
import '../../features/auth/data/auth_repository.dart';
import '../../features/auth/data/social_auth_service.dart';
import '../../features/auth/domain/user.dart';
import '../../features/badges/presentation/badge_providers.dart';
import '../../features/bands/presentation/providers/band_providers.dart';
import '../../features/checkins/presentation/providers/checkin_providers.dart';
import '../../features/discover/presentation/providers/discover_providers.dart';
import '../../features/events/presentation/providers/event_providers.dart';
import '../../features/feed/presentation/providers/feed_providers.dart';
import '../../features/notifications/presentation/providers/notification_providers.dart';
import '../../features/profile/presentation/providers/profile_providers.dart';
import '../../features/search/data/discovery_providers.dart';
import '../../features/search/data/search_providers.dart';
import '../../features/sharing/presentation/share_providers.dart';
import '../../features/subscription/presentation/subscription_service.dart';
import '../../features/subscription/presentation/subscription_providers.dart';
import '../../features/trending/presentation/providers/trending_providers.dart';
import '../../features/verification/presentation/providers/claim_providers.dart';
import '../../features/wrapped/presentation/wrapped_providers.dart';
import '../../features/venues/data/venue_repository.dart';
import '../../features/bands/data/band_repository.dart';
import '../../features/bands/data/wishlist_repository.dart';
import '../../features/badges/data/badge_repository.dart';
import '../../features/checkins/data/checkin_repository.dart';
import '../../features/feed/data/feed_repository.dart';
import '../../features/notifications/data/notification_repository.dart';
import '../../features/onboarding/presentation/onboarding_provider.dart';
import '../../features/profile/data/profile_repository.dart';
import '../../features/discover/data/discovery_repository.dart';

part 'providers.g.dart';

const _authenticatedSessionIntegrationTimeout = Duration(seconds: 15);

@Riverpod(keepAlive: true)
WebSocketService webSocketService(Ref ref) {
  final service = WebSocketService();
  ref.onDispose(service.dispose);
  return service;
}

@Riverpod(keepAlive: true)
FlutterSecureStorage secureStorage(Ref ref) {
  return SecureStorageOptions.createStorage();
}

@Riverpod(keepAlive: true)
DioClient dioClient(Ref ref) {
  final secureStorage = ref.watch(secureStorageProvider);
  return DioClient(
    secureStorage: secureStorage,
    onAuthFailure: () {
      // Force auth state to re-evaluate; getCurrentUser() will return null
      // because the interceptor already wiped the stored credentials.
      ref.invalidate(authStateProvider);
    },
  );
}

@Riverpod(keepAlive: true)
AuthRepository authRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  final secureStorage = ref.watch(secureStorageProvider);
  return AuthRepository(dioClient: dioClient, secureStorage: secureStorage);
}

@Riverpod(keepAlive: true)
VenueRepository venueRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return VenueRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
BandRepository bandRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return BandRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
WishlistRepository wishlistRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return WishlistRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
BadgeRepository badgeRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return BadgeRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
CheckInRepository checkInRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return CheckInRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
NotificationRepository notificationRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return NotificationRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
FeedRepository feedRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return FeedRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
PushNotificationService pushNotificationService(Ref ref) {
  final feed = ref.watch(feedRepositoryProvider);
  final service = PushNotificationService(
    feedRepository: feed,
    isPushEnabled: () async {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool('settings_push_notifications') ?? true;
    },
  );
  ref.onDispose(() => unawaited(service.dispose()));
  return service;
}

@Riverpod(keepAlive: true)
ProfileRepository profileRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return ProfileRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
DiscoveryRepository discoveryRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return DiscoveryRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
AuthenticatedSessionIntegrations authenticatedSessionIntegrations(Ref ref) {
  return _DefaultAuthenticatedSessionIntegrations(ref);
}

@Riverpod(keepAlive: true)
RevenueCatSdkAdapter revenueCatSdkAdapter(Ref ref) {
  return const DefaultRevenueCatSdkAdapter();
}

@Riverpod(keepAlive: true)
SubscriptionSessionClient subscriptionSessionClient(Ref ref) {
  return DefaultSubscriptionSessionClient(
    sdk: ref.watch(revenueCatSdkAdapterProvider),
  );
}

@Riverpod(keepAlive: true)
class AuthenticatedSessionBootstrapStatus
    extends _$AuthenticatedSessionBootstrapStatus {
  @override
  AuthenticatedSessionBootstrapState build() {
    return const AuthenticatedSessionBootstrapState.idle();
  }

  void start(String userId) {
    final attempt = state.userId == userId ? state.attempt + 1 : 1;
    state = AuthenticatedSessionBootstrapState.running(
      userId: userId,
      attempt: attempt,
    );
  }

  void complete(
    String userId,
    Set<AuthenticatedSessionBootstrapStep> failedSteps, {
    Set<AuthenticatedSessionCleanupStep> failedCleanupSteps = const {},
    int cleanupAttempts = 0,
  }) {
    state = AuthenticatedSessionBootstrapState.completed(
      userId: userId,
      attempt: state.attempt,
      failedSteps: failedSteps,
      failedCleanupSteps: failedCleanupSteps,
      cleanupAttempts: cleanupAttempts,
    );
  }

  void completeLogout(
    Set<AuthenticatedSessionCleanupStep> failedCleanupSteps, {
    required int cleanupAttempts,
  }) {
    state = AuthenticatedSessionBootstrapState.logoutCompleted(
      failedCleanupSteps: failedCleanupSteps,
      cleanupAttempts: cleanupAttempts,
    );
  }

  void reset() {
    state = const AuthenticatedSessionBootstrapState.idle();
  }
}

class _DefaultAuthenticatedSessionIntegrations
    implements AuthenticatedSessionIntegrations {
  _DefaultAuthenticatedSessionIntegrations(this._ref);

  final Ref _ref;

  @override
  Future<void> invalidateSessionProviders(User user) async {
    _invalidateSessionProviders();
  }

  void _invalidateSessionProviders() {
    AuthenticatedSessionCacheInvalidator(
      (provider) => _ref.invalidate(provider as dynamic),
    ).invalidateAll();
  }

  @override
  Future<void> connectWebSocket(User user) async {
    final token = await _ref
        .read(dioClientProvider)
        .authSessionStore
        .readAccessToken();
    if (token == null || token.isEmpty) {
      throw StateError('Authenticated WebSocket token is unavailable');
    }

    final service = _ref.read(webSocketServiceProvider);
    service.disconnect(clearCredentials: true);
    try {
      await service
          .connect(authToken: token, userId: user.id)
          .timeout(_authenticatedSessionIntegrationTimeout);
    } catch (_) {
      service.disconnect(clearCredentials: true);
      rethrow;
    }
    if (!service.isConnected) {
      throw StateError('Authenticated WebSocket connection is unavailable');
    }
  }

  @override
  Future<bool?> synchronizeRevenueCat(User user) async {
    final client = _ref.read(subscriptionSessionClientProvider);
    final identified = await client
        .login(user.id)
        .timeout(_authenticatedSessionIntegrationTimeout);
    if (!identified) return null;

    final premiumNotifier = _ref.read(isPremiumProvider.notifier);
    final entitlementGeneration = premiumNotifier.sessionGeneration;
    client.setCustomerInfoUpdateListener((customerInfo) {
      unawaited(
        premiumNotifier.reconcileCustomerInfo(
          customerInfo,
          generation: entitlementGeneration,
        ),
      );
    });

    final customerInfo = await client.getCustomerInfo().timeout(
      _authenticatedSessionIntegrationTimeout,
    );
    if (customerInfo == null) return null;
    return SubscriptionService.hasUnlimitedEntitlement(customerInfo);
  }

  @override
  Future<bool> refreshServerEntitlement(User user) async {
    _ref.invalidate(serverSubscriptionStatusProvider);
    final status = await _ref
        .read(serverSubscriptionStatusProvider.future)
        .timeout(_authenticatedSessionIntegrationTimeout);
    return status.isPremium;
  }

  @override
  Future<void> synchronizeSavedGenres(User user) async {
    await _ref
        .read(genrePersistenceProvider.notifier)
        .syncGenresToBackendIfNeeded()
        .timeout(_authenticatedSessionIntegrationTimeout);
  }

  @override
  Future<void> registerPushNotifications(User user) async {
    final service = _ref.read(pushNotificationServiceProvider);
    try {
      await service.initialize().timeout(
        _authenticatedSessionIntegrationTimeout,
      );
    } catch (_) {
      await service.resetForLogout().timeout(
        _authenticatedSessionIntegrationTimeout,
      );
      rethrow;
    }
    if (!service.isInitialized) {
      throw StateError('Push notification registration is unavailable');
    }
  }

  @override
  Future<AuthenticatedSessionCleanupResult> resetForAccountTransition(
    User previousUser, {
    Set<AuthenticatedSessionCleanupStep>? retrySteps,
    String? pushToken,
  }) async {
    final pushService = _ref.read(pushNotificationServiceProvider);
    final tokenToUnregister = pushToken ?? pushService.currentToken;
    final failures = <AuthenticatedSessionCleanupStep>{};

    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.pushTokenUnregister,
      retrySteps,
      failures,
      () => _unregisterPushToken(tokenToUnregister),
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.pushReset,
      retrySteps,
      failures,
      pushService.resetForLogout,
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.webSocketDisconnect,
      retrySteps,
      failures,
      () async {
        _ref.read(webSocketServiceProvider).disconnect(clearCredentials: true);
      },
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.revenueCatLogout,
      retrySteps,
      failures,
      _ref.read(subscriptionSessionClientProvider).logout,
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.revenueCatListener,
      retrySteps,
      failures,
      () async {
        _ref
            .read(subscriptionSessionClientProvider)
            .setCustomerInfoUpdateListener(null);
      },
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.entitlementReset,
      retrySteps,
      failures,
      () async {
        _ref.read(isPremiumProvider.notifier).beginSession();
        _ref.invalidate(revenueCatCustomerInfoProvider);
        _ref.invalidate(serverSubscriptionStatusProvider);
      },
    );

    return AuthenticatedSessionCleanupResult(
      failedSteps: Set.unmodifiable(failures),
      pushToken: tokenToUnregister,
    );
  }

  @override
  Future<AuthenticatedSessionCleanupResult> cleanupForLogout({
    Set<AuthenticatedSessionCleanupStep>? retrySteps,
    String? pushToken,
  }) async {
    final pushService = _ref.read(pushNotificationServiceProvider);
    final tokenToUnregister = pushToken ?? pushService.currentToken;
    final failures = <AuthenticatedSessionCleanupStep>{};

    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.pushTokenUnregister,
      retrySteps,
      failures,
      () => _unregisterPushToken(tokenToUnregister),
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.pushReset,
      retrySteps,
      failures,
      pushService.resetForLogout,
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.webSocketDisconnect,
      retrySteps,
      failures,
      () async {
        _ref.read(webSocketServiceProvider).disconnect(clearCredentials: true);
      },
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.revenueCatLogout,
      retrySteps,
      failures,
      _ref.read(subscriptionSessionClientProvider).logout,
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.revenueCatListener,
      retrySteps,
      failures,
      () async {
        _ref
            .read(subscriptionSessionClientProvider)
            .setCustomerInfoUpdateListener(null);
      },
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.entitlementReset,
      retrySteps,
      failures,
      () async {
        _ref.read(isPremiumProvider.notifier).beginSession();
        _ref.invalidate(revenueCatCustomerInfoProvider);
        _ref.invalidate(serverSubscriptionStatusProvider);
      },
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.sessionProviders,
      retrySteps,
      failures,
      () async => _invalidateSessionProviders(),
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.preferences,
      retrySteps,
      failures,
      () async {
        final preferences = await SharedPreferences.getInstance();
        final keys = preferences.getKeys();
        const userScopedPrefixes = [
          'user_',
          'feed_',
          'onboarding_',
          'notification_',
        ];
        for (final key in keys) {
          if (userScopedPrefixes.any(key.startsWith)) {
            await preferences.remove(key);
          }
        }
      },
    );
    await _runCleanupStep(
      AuthenticatedSessionCleanupStep.telemetry,
      retrySteps,
      failures,
      () async {
        Sentry.configureScope((scope) => scope.setUser(null));
        await AnalyticsService.clearUserId();
      },
    );

    return AuthenticatedSessionCleanupResult(
      failedSteps: Set.unmodifiable(failures),
      pushToken: tokenToUnregister,
    );
  }

  Future<void> _unregisterPushToken(String? pushToken) async {
    if (pushToken == null) return;
    final result = await _ref
        .read(feedRepositoryProvider)
        .unregisterDeviceToken(pushToken);
    result.fold<void>((failure) => throw Exception(failure.message), (_) {});
  }

  Future<void> _runCleanupStep(
    AuthenticatedSessionCleanupStep step,
    Set<AuthenticatedSessionCleanupStep>? requestedSteps,
    Set<AuthenticatedSessionCleanupStep> failures,
    Future<void> Function() operation,
  ) async {
    if (requestedSteps != null && !requestedSteps.contains(step)) return;
    try {
      await operation().timeout(_authenticatedSessionIntegrationTimeout);
    } catch (error, stackTrace) {
      failures.add(step);
      LogService.e(
        'Authenticated session ${step.name} cleanup failed',
        error,
        stackTrace,
      );
    }
  }
}

/// Invalidates every provider whose state can contain data for the current user.
///
/// Keeping the inventory in one testable catalog prevents account transitions
/// from accidentally retaining a previous user's cached queries or mutations.
class AuthenticatedSessionCacheInvalidator {
  const AuthenticatedSessionCacheInvalidator(this._invalidate);

  final void Function(Object provider) _invalidate;

  void invalidateAll() {
    for (final provider in _currentUserProviders) {
      _invalidate(provider);
    }
  }

  static final List<Object> _currentUserProviders = [
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
  ];
}

class _PendingTransitionCleanup {
  const _PendingTransitionCleanup({
    required this.previousUser,
    required this.result,
  });

  final User previousUser;
  final AuthenticatedSessionCleanupResult result;
}

@Riverpod(keepAlive: true)
class AuthState extends _$AuthState {
  User? _activeSessionUser;
  final Map<String, _PendingTransitionCleanup> _pendingTransitionCleanups = {};
  int _sessionGeneration = 0;
  Future<void>? _sessionOperationTail;

  @override
  Future<User?> build() async {
    final generation = ++_sessionGeneration;
    final authRepository = ref.watch(authRepositoryProvider);
    final user = await authRepository.getCurrentUser();
    if (!_isCurrentSession(generation)) return null;

    if (user != null) {
      await _scheduleAuthenticatedSessionBootstrap(
        user,
        generation: generation,
        publishUser: false,
      );
      if (!_isCurrentSession(generation)) return null;
    }

    return user;
  }

  Future<void> login(String email, String password) async {
    final generation = ++_sessionGeneration;
    state = const AsyncValue.loading();
    try {
      final authRepository = ref.read(authRepositoryProvider);
      final result = await authRepository.login(
        LoginRequest(email: email, password: password),
      );

      final authResponse = result.fold<AuthResponse>(
        (failure) => throw Exception(failure.message),
        (response) => response,
      );
      if (!_isCurrentSession(generation)) return;
      await _scheduleAuthenticatedSessionCommit(
        authResponse,
        generation: generation,
      );
    } catch (error, stackTrace) {
      if (_isCurrentSession(generation)) {
        state = AsyncValue.error(error, stackTrace);
      }
    }
  }

  Future<void> register({
    required String email,
    required String password,
    required String username,
    String? firstName,
    String? lastName,
  }) async {
    final generation = ++_sessionGeneration;
    state = const AsyncValue.loading();
    try {
      final authRepository = ref.read(authRepositoryProvider);
      final result = await authRepository.register(
        RegisterRequest(
          email: email,
          password: password,
          username: username,
          firstName: firstName,
          lastName: lastName,
        ),
      );

      final authResponse = result.fold<AuthResponse>(
        (failure) => throw Exception(failure.message),
        (response) => response,
      );
      if (!_isCurrentSession(generation)) return;
      await _scheduleAuthenticatedSessionCommit(
        authResponse,
        generation: generation,
      );
    } catch (error, stackTrace) {
      if (_isCurrentSession(generation)) {
        state = AsyncValue.error(error, stackTrace);
      }
    }
  }

  Future<User?> signInWithGoogle(SocialAuthService service) {
    return _signInWithSocial(service.signInWithGoogle);
  }

  Future<User?> signInWithApple(SocialAuthService service) {
    return _signInWithSocial(service.signInWithApple);
  }

  Future<User?> _signInWithSocial(
    Future<SocialAuthResult?> Function() authenticate,
  ) async {
    final generation = ++_sessionGeneration;
    final previousUser = state.value;
    state = const AsyncValue.loading();
    try {
      final result = await authenticate();
      if (!_isCurrentSession(generation)) return null;
      if (result == null) {
        state = AsyncValue.data(previousUser);
        return null;
      }

      await _scheduleAuthenticatedSessionCommit(
        AuthResponse(
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
        ),
        generation: generation,
      );
      return _isCurrentSession(generation) ? result.user : null;
    } catch (error, stackTrace) {
      if (_isCurrentSession(generation)) {
        state = AsyncValue.error(error, stackTrace);
        rethrow;
      }
      return null;
    }
  }

  Future<void> logout() async {
    final generation = ++_sessionGeneration;
    final previousUser = state.value ?? _activeSessionUser;
    state = const AsyncValue.loading();
    final authRepository = ref.read(authRepositoryProvider);
    await _scheduleSessionOperation(generation, () async {
      final integrations = ref.read(authenticatedSessionIntegrationsProvider);
      var cleanupAttempts = 0;
      final cleanupFailures = <AuthenticatedSessionCleanupStep>{};
      for (final pending in [..._pendingTransitionCleanups.values]) {
        cleanupAttempts++;
        try {
          final result = await integrations
              .resetForAccountTransition(
                pending.previousUser,
                retrySteps: pending.result.failedSteps,
                pushToken: pending.result.pushToken,
              )
              .timeout(_authenticatedSessionIntegrationTimeout);
          if (result.succeeded) {
            _pendingTransitionCleanups.remove(pending.previousUser.id);
          } else {
            cleanupFailures.addAll(result.failedSteps);
            _pendingTransitionCleanups[pending.previousUser.id] =
                _PendingTransitionCleanup(
                  previousUser: pending.previousUser,
                  result: result,
                );
          }
        } catch (error, stackTrace) {
          cleanupFailures.addAll(pending.result.failedSteps);
          LogService.e(
            'Pending account cleanup failed during logout',
            error,
            stackTrace,
          );
        }
        if (!_isCurrentSession(generation)) return;
      }

      cleanupAttempts++;
      var cleanupResult = await _runLogoutCleanup(integrations);
      if (cleanupResult.failedSteps.isNotEmpty) {
        cleanupAttempts++;
        cleanupResult = await _runLogoutCleanup(
          integrations,
          retrySteps: cleanupResult.failedSteps,
          pushToken: cleanupResult.pushToken,
        );
      }
      cleanupFailures.addAll(cleanupResult.failedSteps);
      if (!_isCurrentSession(generation)) return;

      final result = await authRepository.logout();
      if (!_isCurrentSession(generation)) return;
      Object? invalidationFailure;
      final invalidationResult = result.fold((failure) {
        invalidationFailure = failure;
        LogService.e(
          'Failed to clear stored authentication during logout',
          failure,
        );
        return null;
      }, (value) => value);
      if (invalidationFailure != null) {
        cleanupFailures.add(AuthenticatedSessionCleanupStep.localCredentials);
        final statusNotifier = ref.read(
          authenticatedSessionBootstrapStatusProvider.notifier,
        );
        if (previousUser != null) {
          statusNotifier.complete(
            previousUser.id,
            const {},
            failedCleanupSteps: cleanupFailures,
            cleanupAttempts: cleanupAttempts,
          );
        }
        state = AsyncValue.data(previousUser);
        return;
      }

      var credentialCleanup = invalidationResult!;
      if (credentialCleanup.hasResidualCredentials) {
        cleanupAttempts++;
        final retry = await authRepository.retryLogoutCredentialCleanup();
        if (!_isCurrentSession(generation)) return;
        credentialCleanup = retry.fold((failure) {
          LogService.e(
            'Failed to retry stored authentication cleanup during logout',
            failure,
          );
          return credentialCleanup;
        }, (value) => value);
        if (credentialCleanup.hasResidualCredentials) {
          cleanupFailures.add(AuthenticatedSessionCleanupStep.localCredentials);
        }
      }
      _activeSessionUser = null;
      _pendingTransitionCleanups.clear();
      ref
          .read(authenticatedSessionBootstrapStatusProvider.notifier)
          .completeLogout(cleanupFailures, cleanupAttempts: cleanupAttempts);
      state = const AsyncValue.data(null);
    });
  }

  Future<AuthenticatedSessionCleanupResult> _runLogoutCleanup(
    AuthenticatedSessionIntegrations integrations, {
    Set<AuthenticatedSessionCleanupStep>? retrySteps,
    String? pushToken,
  }) async {
    try {
      return await integrations
          .cleanupForLogout(retrySteps: retrySteps, pushToken: pushToken)
          .timeout(_authenticatedSessionIntegrationTimeout);
    } catch (error, stackTrace) {
      LogService.e(
        'Authenticated session cleanup failed during logout',
        error,
        stackTrace,
      );
      return AuthenticatedSessionCleanupResult(
        failedSteps:
            retrySteps ?? Set.of(AuthenticatedSessionCleanupStep.values),
        pushToken: pushToken,
      );
    }
  }

  Future<void> refreshUser() async {
    final generation = _sessionGeneration;
    final initiatingUser = _activeSessionUser ?? state.value;
    if (initiatingUser == null) return;
    state = const AsyncValue.loading();
    try {
      final authRepository = ref.read(authRepositoryProvider);
      final result = await authRepository.getMe();
      final user = result.fold<User>(
        (failure) => throw Exception(failure.message),
        (user) => user,
      );
      if (!_isCurrentSession(generation) ||
          _activeSessionUser?.id != initiatingUser.id) {
        return;
      }
      _activeSessionUser = user;
      state = AsyncValue.data(user);
    } catch (error, stackTrace) {
      if (_isCurrentSession(generation) &&
          _activeSessionUser?.id == initiatingUser.id) {
        state = AsyncValue.error(error, stackTrace);
      }
    }
  }

  Future<void> retryAuthenticatedSessionBootstrap() async {
    final user = state.value;
    if (user == null) return;
    final generation = ++_sessionGeneration;
    await _scheduleAuthenticatedSessionBootstrap(
      user,
      generation: generation,
      publishUser: false,
    );
  }

  bool _isCurrentSession(int generation) {
    return generation == _sessionGeneration;
  }

  Future<void> _scheduleAuthenticatedSessionBootstrap(
    User user, {
    required int generation,
    required bool publishUser,
  }) {
    return _scheduleSessionOperation(
      generation,
      () => _performAuthenticatedSessionBootstrap(
        user,
        generation: generation,
        publishUser: publishUser,
      ),
    );
  }

  Future<void> _scheduleAuthenticatedSessionCommit(
    AuthResponse response, {
    required int generation,
  }) {
    return _scheduleSessionOperation(generation, () async {
      final repository = ref.read(authRepositoryProvider);
      final persistence = await repository.persistAuthenticationWithRevision(
        response,
        isCurrent: () => _isCurrentSession(generation),
      );
      if (!persistence.committed) return;
      if (!_isCurrentSession(generation)) {
        final revision = persistence.revision;
        if (revision != null) {
          await repository.invalidateAuthenticationRevision(revision);
        }
        return;
      }
      await _performAuthenticatedSessionBootstrap(
        response.user,
        generation: generation,
        publishUser: true,
      );
    });
  }

  Future<void> _scheduleSessionOperation(
    int generation,
    Future<void> Function() operation,
  ) {
    final previous = _sessionOperationTail;
    final scheduled = () async {
      if (previous != null) {
        try {
          await previous;
        } catch (error, stackTrace) {
          LogService.e(
            'Previous authenticated-session operation failed',
            error,
            stackTrace,
          );
        }
      }
      if (!_isCurrentSession(generation)) return;
      await operation();
    }();

    late final Future<void> tracked;
    tracked = scheduled.whenComplete(() {
      if (identical(_sessionOperationTail, tracked)) {
        _sessionOperationTail = null;
      }
    });
    _sessionOperationTail = tracked;
    return tracked;
  }

  Future<void> _performAuthenticatedSessionBootstrap(
    User user, {
    required int generation,
    required bool publishUser,
  }) async {
    final integrations = ref.read(authenticatedSessionIntegrationsProvider);
    final failures = <AuthenticatedSessionBootstrapStep>{};
    final previousUser = _activeSessionUser;
    var cleanupAttempts = 0;
    final cleanupFailures = <AuthenticatedSessionCleanupStep>{};
    final cleanups = <_PendingTransitionCleanup>[
      ..._pendingTransitionCleanups.values,
    ];
    if (previousUser != null &&
        previousUser.id != user.id &&
        !cleanups.any(
          (cleanup) => cleanup.previousUser.id == previousUser.id,
        )) {
      cleanups.add(
        _PendingTransitionCleanup(
          previousUser: previousUser,
          result: const AuthenticatedSessionCleanupResult(),
        ),
      );
    }

    for (final cleanup in cleanups) {
      cleanupAttempts++;
      final isRetry = cleanup.result.failedSteps.isNotEmpty;
      try {
        final result = await integrations.resetForAccountTransition(
          cleanup.previousUser,
          retrySteps: isRetry ? cleanup.result.failedSteps : null,
          pushToken: isRetry ? cleanup.result.pushToken : null,
        );
        if (result.succeeded) {
          _pendingTransitionCleanups.remove(cleanup.previousUser.id);
        } else {
          cleanupFailures.addAll(result.failedSteps);
          _pendingTransitionCleanups[cleanup.previousUser.id] =
              _PendingTransitionCleanup(
                previousUser: cleanup.previousUser,
                result: result,
              );
        }
      } catch (error, stackTrace) {
        final failedSteps = isRetry
            ? cleanup.result.failedSteps
            : Set.of(AuthenticatedSessionCleanupStep.values);
        final result = AuthenticatedSessionCleanupResult(
          failedSteps: failedSteps,
          pushToken: cleanup.result.pushToken,
        );
        cleanupFailures.addAll(failedSteps);
        _pendingTransitionCleanups[cleanup.previousUser.id] =
            _PendingTransitionCleanup(
              previousUser: cleanup.previousUser,
              result: result,
            );
        LogService.e('Account transition cleanup failed', error, stackTrace);
      }
      if (!_isCurrentSession(generation)) return;
    }

    final statusNotifier = ref.read(
      authenticatedSessionBootstrapStatusProvider.notifier,
    );
    statusNotifier.start(user.id);

    await _runBootstrapStep(
      AuthenticatedSessionBootstrapStep.sessionProviders,
      failures,
      () => integrations.invalidateSessionProviders(user),
    );
    if (!_isCurrentSession(generation)) return;

    _activeSessionUser = user;
    if (publishUser) {
      state = AsyncValue.data(user);
    }

    await _runBootstrapStep(
      AuthenticatedSessionBootstrapStep.webSocket,
      failures,
      () => integrations.connectWebSocket(user),
    );
    if (!_isCurrentSession(generation)) return;

    final premiumNotifier = ref.read(isPremiumProvider.notifier);
    final entitlementGeneration = premiumNotifier.sessionGeneration;
    final revenueCatPremium = await _runEntitlementStep(
      AuthenticatedSessionBootstrapStep.revenueCat,
      failures,
      () => integrations.synchronizeRevenueCat(user),
      unknownIsFailure: true,
    );
    if (!_isCurrentSession(generation)) return;
    final serverPremium = await _runEntitlementStep(
      AuthenticatedSessionBootstrapStep.serverEntitlement,
      failures,
      () async => integrations.refreshServerEntitlement(user),
    );
    if (!_isCurrentSession(generation)) return;

    await _runBootstrapStep(
      AuthenticatedSessionBootstrapStep.savedGenres,
      failures,
      () => integrations.synchronizeSavedGenres(user),
    );
    if (!_isCurrentSession(generation)) return;
    await _runBootstrapStep(
      AuthenticatedSessionBootstrapStep.pushRegistration,
      failures,
      () => integrations.registerPushNotifications(user),
    );
    if (!_isCurrentSession(generation)) return;

    premiumNotifier.mergeEvidence(
      revenueCat: revenueCatPremium,
      server: serverPremium,
      generation: entitlementGeneration,
    );

    final premium = ref.read(isPremiumProvider);
    try {
      await AnalyticsService.setUserProperty(
        name: 'plan',
        value: premium ? 'premium' : 'free',
      ).timeout(_authenticatedSessionIntegrationTimeout);
    } catch (error, stackTrace) {
      LogService.e(
        'Failed to update subscription analytics after session bootstrap',
        error,
        stackTrace,
      );
    }
    if (!_isCurrentSession(generation)) return;

    statusNotifier.complete(
      user.id,
      failures,
      failedCleanupSteps: cleanupFailures,
      cleanupAttempts: cleanupAttempts,
    );
  }

  Future<void> _runBootstrapStep(
    AuthenticatedSessionBootstrapStep step,
    Set<AuthenticatedSessionBootstrapStep> failures,
    Future<void> Function() operation,
  ) async {
    try {
      await operation();
    } catch (error, stackTrace) {
      failures.add(step);
      LogService.e(
        'Authenticated session ${step.name} bootstrap failed',
        error,
        stackTrace,
      );
    }
  }

  Future<bool?> _runEntitlementStep(
    AuthenticatedSessionBootstrapStep step,
    Set<AuthenticatedSessionBootstrapStep> failures,
    Future<bool?> Function() operation, {
    bool unknownIsFailure = false,
  }) async {
    try {
      final result = await operation();
      if (result == null && unknownIsFailure) {
        failures.add(step);
      }
      return result;
    } catch (error, stackTrace) {
      failures.add(step);
      LogService.e(
        'Authenticated session ${step.name} bootstrap failed',
        error,
        stackTrace,
      );
      return null;
    }
  }
}

/// Location permission state
enum LocationStatus { unknown, denied, deniedForever, granted, serviceDisabled }

/// Provider for current user location
@riverpod
Future<Position?> currentLocation(Ref ref) async {
  return LocationService.getCurrentPosition();
}

/// Provider for location permission status
@riverpod
Future<LocationStatus> locationStatus(Ref ref) async {
  final serviceEnabled = await LocationService.isLocationServiceEnabled();
  if (!serviceEnabled) {
    return LocationStatus.serviceDisabled;
  }

  final permission = await LocationService.checkPermission();
  switch (permission) {
    case LocationPermission.denied:
      return LocationStatus.denied;
    case LocationPermission.deniedForever:
      return LocationStatus.deniedForever;
    case LocationPermission.whileInUse:
    case LocationPermission.always:
      return LocationStatus.granted;
    default:
      return LocationStatus.unknown;
  }
}
