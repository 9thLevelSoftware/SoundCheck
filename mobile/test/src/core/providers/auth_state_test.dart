import 'dart:async';

import 'package:dartz/dartz.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/core/api/auth_session_store.dart';
import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/core/session/authenticated_session.dart';
import 'package:soundcheck_flutter/src/features/auth/data/auth_repository.dart';
import 'package:soundcheck_flutter/src/features/auth/data/social_auth_service.dart';
import 'package:soundcheck_flutter/src/features/auth/domain/user.dart';
import 'package:soundcheck_flutter/src/features/subscription/presentation/subscription_providers.dart';

void main() {
  group('AuthState authenticated-session bootstrap', () {
    test('password login runs every bootstrap step exactly once', () async {
      final harness = await _AuthHarness.create();
      addTearDown(harness.dispose);
      harness.repository.loginResponses.add(_authResponse(_userA));

      await harness.notifier.login('a@example.com', 'Password1!');

      expect(harness.container.read(authStateProvider).value, _userA);
      harness.expectSingleBootstrapFor(_userA);
    });

    test(
      'registration stays signed out and returns the acknowledgement',
      () async {
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.registerResponses.add(
          'Check your email to finish creating your account.',
        );

        final message = await harness.notifier.register(
          email: 'a@example.com',
          password: 'Password1!',
          username: 'user-a',
        );

        expect(message, 'Check your email to finish creating your account.');
        expect(harness.container.read(authStateProvider).value, isNull);
        expect(harness.integrations.bootstrapCalls, isEmpty);
      },
    );

    for (final provider in SocialAuthenticationProvider.values) {
      test(
        '${provider.name} login runs every bootstrap step exactly once',
        () async {
          final harness = await _AuthHarness.create();
          addTearDown(harness.dispose);
          final service = _FakeSocialAuthService(provider);

          if (provider == SocialAuthenticationProvider.google) {
            await harness.notifier.signInWithGoogle(service);
          } else {
            await harness.notifier.signInWithApple(service);
          }

          expect(harness.container.read(authStateProvider).value, _userA);
          harness.expectSingleBootstrapFor(_userA);
        },
      );
    }

    test(
      'stored-user restoration runs every bootstrap step exactly once',
      () async {
        final harness = await _AuthHarness.create(restoredUser: _userA);
        addTearDown(harness.dispose);

        expect(harness.container.read(authStateProvider).value, _userA);
        harness.expectSingleBootstrapFor(_userA);
      },
    );

    test(
      'back-to-back users replace the prior session and bootstrap B once',
      () async {
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.addAll([
          _authResponse(_userA),
          _authResponse(_userB),
        ]);

        await harness.notifier.login('a@example.com', 'Password1!');
        await harness.notifier.login('b@example.com', 'Password1!');

        expect(harness.container.read(authStateProvider).value, _userB);
        expect(harness.integrations.accountTransitionResetUsers, [_userA.id]);
        expect(harness.integrations.bootstrapCalls, [
          ..._expectedBootstrapCalls(_userA),
          ..._expectedBootstrapCalls(_userB),
        ]);
        expect(
          harness.container.read(authenticatedSessionBootstrapStatusProvider),
          isA<AuthenticatedSessionBootstrapState>()
              .having((status) => status.userId, 'userId', _userB.id)
              .having((status) => status.attempt, 'attempt', 1)
              .having((status) => status.isDegraded, 'isDegraded', isFalse),
        );
      },
    );

    test(
      'in-flight account B supersedes A and receives its own bootstrap',
      () async {
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.addAll([
          _authResponse(_userA),
          _authResponse(_userB),
        ]);
        final delayedWebSocket = harness.integrations.delay(
          AuthenticatedSessionBootstrapStep.webSocket,
          _userA,
        );

        final loginA = harness.notifier.login('a@example.com', 'Password1!');
        await delayedWebSocket.entered.future;
        final loginB = harness.notifier.login('b@example.com', 'Password1!');
        await Future<void>.delayed(Duration.zero);
        delayedWebSocket.release.complete();
        await Future.wait([loginA, loginB]);

        expect(harness.container.read(authStateProvider).value, _userB);
        expect(
          harness.integrations.bootstrapCalls,
          containsAllInOrder(_expectedBootstrapCalls(_userB)),
        );
        expect(
          harness.container
              .read(authenticatedSessionBootstrapStatusProvider)
              .userId,
          _userB.id,
        );
      },
    );

    test(
      'account B is not published before cache invalidation completes',
      () async {
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.addAll([
          _authResponse(_userA),
          _authResponse(_userB),
        ]);
        await harness.notifier.login('a@example.com', 'Password1!');
        final delayedInvalidation = harness.integrations.delay(
          AuthenticatedSessionBootstrapStep.sessionProviders,
          _userB,
        );

        final loginB = harness.notifier.login('b@example.com', 'Password1!');
        await delayedInvalidation.entered.future;

        expect(harness.container.read(authStateProvider).value, _userA);

        delayedInvalidation.release.complete();
        await loginB;
        expect(harness.container.read(authStateProvider).value, _userB);
      },
    );

    for (final delayedStep in [
      AuthenticatedSessionBootstrapStep.webSocket,
      AuthenticatedSessionBootstrapStep.revenueCat,
      AuthenticatedSessionBootstrapStep.pushRegistration,
    ]) {
      test(
        'logout fences delayed ${delayedStep.name} and does not resurrect A',
        () async {
          final harness = await _AuthHarness.create();
          addTearDown(harness.dispose);
          harness.repository.loginResponses.addAll([
            _authResponse(_userA),
            _authResponse(_userB),
          ]);
          final delayed = harness.integrations.delay(delayedStep, _userA);

          final loginA = harness.notifier.login('a@example.com', 'Password1!');
          await delayed.entered.future;
          final logout = harness.notifier.logout();
          await Future<void>.delayed(Duration.zero);
          delayed.release.complete();
          await Future.wait([loginA, logout]);

          final cleanupIndex = harness.integrations.lifecycleEvents.indexOf(
            'logoutCleanup',
          );
          expect(cleanupIndex, greaterThanOrEqualTo(0));
          expect(
            harness.integrations.lifecycleEvents
                .skip(cleanupIndex + 1)
                .where((event) => event.endsWith(':${_userA.id}')),
            isEmpty,
          );
          expect(harness.container.read(authStateProvider).value, isNull);

          await harness.notifier.login('b@example.com', 'Password1!');

          expect(harness.container.read(authStateProvider).value, _userB);
          expect(harness.integrations.accountTransitionResetUsers, isEmpty);
          expect(
            harness.integrations.bootstrapCalls,
            containsAllInOrder(_expectedBootstrapCalls(_userB)),
          );
        },
      );
    }

    test('logout cleans up without bootstrapping another session', () async {
      final harness = await _AuthHarness.create();
      addTearDown(harness.dispose);
      harness.repository.loginResponses.add(_authResponse(_userA));
      await harness.notifier.login('a@example.com', 'Password1!');
      final callsBeforeLogout = [...harness.integrations.bootstrapCalls];

      await harness.notifier.logout();

      expect(harness.container.read(authStateProvider).value, isNull);
      expect(harness.integrations.logoutCleanupCalls, 1);
      expect(harness.integrations.bootstrapCalls, callsBeforeLogout);
      expect(harness.repository.logoutCalls, 1);
      expect(
        harness.container.read(authenticatedSessionBootstrapStatusProvider),
        isA<AuthenticatedSessionBootstrapState>()
            .having((status) => status.userId, 'userId', isNull)
            .having(
              (status) => status.failedCleanupSteps,
              'failedCleanupSteps',
              isEmpty,
            )
            .having((status) => status.cleanupAttempts, 'cleanupAttempts', 1),
      );
    });

    test(
      'failed transition cleanup remains attached to A and retries before B',
      () async {
        final previousDebugPrint = debugPrint;
        debugPrint = (message, {wrapWidth}) {};
        addTearDown(() => debugPrint = previousDebugPrint);
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.addAll([
          _authResponse(_userA),
          _authResponse(_userB),
        ]);
        await harness.notifier.login('a@example.com', 'Password1!');
        harness.integrations.transitionCleanupResults.addAll([
          const AuthenticatedSessionCleanupResult(
            failedSteps: {AuthenticatedSessionCleanupStep.pushReset},
            pushToken: 'token-a',
          ),
          const AuthenticatedSessionCleanupResult(),
        ]);

        await harness.notifier.login('b@example.com', 'Password1!');

        expect(
          harness.container
              .read(authenticatedSessionBootstrapStatusProvider)
              .failedCleanupSteps,
          {AuthenticatedSessionCleanupStep.pushReset},
        );
        expect(harness.integrations.accountTransitionResetUsers, [_userA.id]);

        await harness.notifier.retryAuthenticatedSessionBootstrap();

        expect(harness.integrations.accountTransitionResetUsers, [
          _userA.id,
          _userA.id,
        ]);
        expect(harness.integrations.transitionRetrySteps, [
          null,
          {AuthenticatedSessionCleanupStep.pushReset},
        ]);
        expect(harness.integrations.transitionRetryTokens, [null, 'token-a']);
        expect(
          harness.container
              .read(authenticatedSessionBootstrapStatusProvider)
              .failedCleanupSteps,
          isEmpty,
        );
      },
    );

    test('C cleans pending A and active B before publishing C', () async {
      final previousDebugPrint = debugPrint;
      debugPrint = (message, {wrapWidth}) {};
      addTearDown(() => debugPrint = previousDebugPrint);
      final harness = await _AuthHarness.create();
      addTearDown(harness.dispose);
      harness.repository.loginResponses.addAll([
        _authResponse(_userA),
        _authResponse(_userB),
        _authResponse(_userC),
      ]);
      harness.integrations.transitionCleanupResults.addAll([
        const AuthenticatedSessionCleanupResult(
          failedSteps: {AuthenticatedSessionCleanupStep.pushReset},
          pushToken: 'token-a',
        ),
        const AuthenticatedSessionCleanupResult(),
        const AuthenticatedSessionCleanupResult(),
      ]);

      await harness.notifier.login('a@example.com', 'Password1!');
      await harness.notifier.login('b@example.com', 'Password1!');
      await harness.notifier.login('c@example.com', 'Password1!');

      expect(harness.integrations.accountTransitionResetUsers, [
        _userA.id,
        _userA.id,
        _userB.id,
      ]);
      expect(harness.integrations.transitionRetrySteps, [
        null,
        {AuthenticatedSessionCleanupStep.pushReset},
        null,
      ]);
      expect(harness.integrations.transitionRetryTokens, [
        null,
        'token-a',
        null,
      ]);
      expect(harness.container.read(authStateProvider).value, _userC);
    });

    test(
      'logout retries only failed cleanup steps before clearing auth storage',
      () async {
        final previousDebugPrint = debugPrint;
        debugPrint = (message, {wrapWidth}) {};
        addTearDown(() => debugPrint = previousDebugPrint);
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.add(_authResponse(_userA));
        await harness.notifier.login('a@example.com', 'Password1!');
        harness.integrations.logoutCleanupResults.addAll([
          const AuthenticatedSessionCleanupResult(
            failedSteps: {
              AuthenticatedSessionCleanupStep.pushReset,
              AuthenticatedSessionCleanupStep.revenueCatLogout,
            },
            pushToken: 'token-a',
          ),
          const AuthenticatedSessionCleanupResult(),
        ]);

        await harness.notifier.logout();

        expect(harness.repository.logoutCalls, 1);
        expect(harness.integrations.logoutCleanupCalls, 2);
        expect(harness.integrations.logoutRetrySteps, [
          null,
          {
            AuthenticatedSessionCleanupStep.pushReset,
            AuthenticatedSessionCleanupStep.revenueCatLogout,
          },
        ]);
        expect(harness.integrations.logoutRetryTokens, [null, 'token-a']);
        expect(
          harness.container
              .read(authenticatedSessionBootstrapStatusProvider)
              .cleanupAttempts,
          2,
        );
      },
    );

    test(
      'logout records permanent cleanup degradation and still clears auth',
      () async {
        final previousDebugPrint = debugPrint;
        debugPrint = (message, {wrapWidth}) {};
        addTearDown(() => debugPrint = previousDebugPrint);
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.add(_authResponse(_userA));
        await harness.notifier.login('a@example.com', 'Password1!');
        harness.integrations.logoutCleanupResults.addAll([
          const AuthenticatedSessionCleanupResult(
            failedSteps: {AuthenticatedSessionCleanupStep.pushTokenUnregister},
            pushToken: 'token-a',
          ),
          const AuthenticatedSessionCleanupResult(
            failedSteps: {AuthenticatedSessionCleanupStep.pushTokenUnregister},
            pushToken: 'token-a',
          ),
        ]);

        await harness.notifier.logout();

        expect(harness.container.read(authStateProvider).value, isNull);
        expect(harness.repository.logoutCalls, 1);
        expect(
          harness.container.read(authenticatedSessionBootstrapStatusProvider),
          isA<AuthenticatedSessionBootstrapState>()
              .having((status) => status.userId, 'userId', isNull)
              .having(
                (status) => status.failedCleanupSteps,
                'failedCleanupSteps',
                {AuthenticatedSessionCleanupStep.pushTokenUnregister},
              )
              .having((status) => status.cleanupAttempts, 'cleanupAttempts', 2)
              .having((status) => status.canRetry, 'canRetry', isFalse),
        );
      },
    );

    test(
      'logout retries pending account cleanup and still clears local auth',
      () async {
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.addAll([
          _authResponse(_userA),
          _authResponse(_userB),
        ]);
        harness.integrations.transitionCleanupResults.addAll([
          const AuthenticatedSessionCleanupResult(
            failedSteps: {AuthenticatedSessionCleanupStep.pushTokenUnregister},
            pushToken: 'token-a',
          ),
          const AuthenticatedSessionCleanupResult(
            failedSteps: {AuthenticatedSessionCleanupStep.pushTokenUnregister},
            pushToken: 'token-a',
          ),
        ]);

        await harness.notifier.login('a@example.com', 'Password1!');
        await harness.notifier.login('b@example.com', 'Password1!');
        await harness.notifier.logout();

        expect(harness.integrations.accountTransitionResetUsers, [
          _userA.id,
          _userA.id,
        ]);
        expect(harness.integrations.transitionRetrySteps, [
          null,
          {AuthenticatedSessionCleanupStep.pushTokenUnregister},
        ]);
        expect(harness.repository.logoutCalls, 1);
        expect(harness.container.read(authStateProvider).value, isNull);
        expect(
          harness.container.read(authenticatedSessionBootstrapStatusProvider),
          isA<AuthenticatedSessionBootstrapState>()
              .having(
                (status) => status.failedCleanupSteps,
                'failedCleanupSteps',
                {AuthenticatedSessionCleanupStep.pushTokenUnregister},
              )
              .having((status) => status.cleanupAttempts, 'cleanupAttempts', 2),
        );
      },
    );

    test('ordinary profile refresh does not bootstrap again', () async {
      final harness = await _AuthHarness.create();
      addTearDown(harness.dispose);
      harness.repository.loginResponses.add(_authResponse(_userA));
      harness.repository.meResponses.add(_userA.copyWith(firstName: 'Updated'));
      await harness.notifier.login('a@example.com', 'Password1!');
      final callsBeforeRefresh = [...harness.integrations.bootstrapCalls];

      await harness.notifier.refreshUser();

      expect(harness.integrations.bootstrapCalls, callsBeforeRefresh);
      expect(
        harness.container.read(authStateProvider).value?.firstName,
        'Updated',
      );
    });

    test(
      'profile refresh during bootstrap does not cancel remaining steps',
      () async {
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.add(_authResponse(_userA));
        harness.repository.meResponses.add(
          _userA.copyWith(firstName: 'Updated'),
        );
        final delayedWebSocket = harness.integrations.delay(
          AuthenticatedSessionBootstrapStep.webSocket,
          _userA,
        );

        final login = harness.notifier.login('a@example.com', 'Password1!');
        await delayedWebSocket.entered.future;
        expect(harness.container.read(authStateProvider).value, _userA);

        await harness.notifier.refreshUser();
        delayedWebSocket.release.complete();
        await login;

        expect(
          harness.integrations.bootstrapCalls,
          _expectedBootstrapCalls(_userA),
        );
        expect(
          harness.container.read(authStateProvider).value?.firstName,
          'Updated',
        );
      },
    );

    test(
      'integration failures preserve auth and known premium until retry',
      () async {
        final previousDebugPrint = debugPrint;
        debugPrint = (message, {wrapWidth}) {};
        addTearDown(() => debugPrint = previousDebugPrint);
        final harness = await _AuthHarness.create();
        addTearDown(harness.dispose);
        harness.repository.loginResponses.add(_authResponse(_userA));
        harness.container
            .read(isPremiumProvider.notifier)
            .mergeEvidence(server: true);
        harness.integrations
          ..revenueCatPremium = null
          ..failedSteps.addAll({
            AuthenticatedSessionBootstrapStep.sessionProviders,
            AuthenticatedSessionBootstrapStep.webSocket,
            AuthenticatedSessionBootstrapStep.serverEntitlement,
            AuthenticatedSessionBootstrapStep.savedGenres,
            AuthenticatedSessionBootstrapStep.pushRegistration,
          });

        await harness.notifier.login('a@example.com', 'Password1!');

        expect(harness.container.read(authStateProvider).value, _userA);
        expect(harness.premiumSubscription.read(), isTrue);
        expect(
          harness.container.read(authenticatedSessionBootstrapStatusProvider),
          isA<AuthenticatedSessionBootstrapState>()
              .having((status) => status.userId, 'userId', _userA.id)
              .having((status) => status.attempt, 'attempt', 1)
              .having((status) => status.canRetry, 'canRetry', isTrue)
              .having(
                (status) => status.failedSteps,
                'failedSteps',
                unorderedEquals(AuthenticatedSessionBootstrapStep.values),
              ),
        );

        harness.integrations
          ..failedSteps.clear()
          ..revenueCatPremium = true
          ..serverPremium = true;
        await harness.notifier.retryAuthenticatedSessionBootstrap();

        expect(harness.container.read(authStateProvider).value, _userA);
        expect(harness.premiumSubscription.read(), isTrue);
        expect(harness.integrations.bootstrapCalls, [
          ..._expectedBootstrapCalls(_userA),
          ..._expectedBootstrapCalls(_userA),
        ]);
        expect(
          harness.container.read(authenticatedSessionBootstrapStatusProvider),
          isA<AuthenticatedSessionBootstrapState>()
              .having((status) => status.attempt, 'attempt', 2)
              .having((status) => status.failedSteps, 'failedSteps', isEmpty)
              .having((status) => status.canRetry, 'canRetry', isFalse),
        );
      },
    );
  });
}

class _FakeSocialAuthService extends SocialAuthService {
  _FakeSocialAuthService(this.provider)
    : super(dioClient: DioClient(secureStorage: const FlutterSecureStorage()));

  final SocialAuthenticationProvider provider;

  SocialAuthResult get _result {
    return SocialAuthResult(
      user: _userA,
      token: 'social-token',
      refreshToken: 'social-refresh-token',
      isNewUser: false,
    );
  }

  @override
  Future<SocialAuthResult?> signInWithGoogle() async {
    if (provider != SocialAuthenticationProvider.google) {
      throw StateError('Unexpected Google sign-in');
    }
    return _result;
  }

  @override
  Future<SocialAuthResult?> signInWithApple() async {
    if (provider != SocialAuthenticationProvider.apple) {
      throw StateError('Unexpected Apple sign-in');
    }
    return _result;
  }
}

class _AuthHarness {
  _AuthHarness._({
    required this.container,
    required this.repository,
    required this.integrations,
    required this.premiumSubscription,
  });

  final ProviderContainer container;
  final _FakeAuthRepository repository;
  final _RecordingSessionIntegrations integrations;
  final ProviderSubscription<bool> premiumSubscription;

  AuthState get notifier => container.read(authStateProvider.notifier);

  static Future<_AuthHarness> create({User? restoredUser}) async {
    final repository = _FakeAuthRepository()..restoredUser = restoredUser;
    final integrations = _RecordingSessionIntegrations();
    final container = ProviderContainer(
      overrides: [
        authRepositoryProvider.overrideWithValue(repository),
        authenticatedSessionIntegrationsProvider.overrideWithValue(
          integrations,
        ),
      ],
    );
    final premiumSubscription = container.listen(
      isPremiumProvider,
      (_, _) {},
      fireImmediately: true,
    );

    await container.read(authStateProvider.future);
    return _AuthHarness._(
      container: container,
      repository: repository,
      integrations: integrations,
      premiumSubscription: premiumSubscription,
    );
  }

  void expectSingleBootstrapFor(User user) {
    expect(integrations.bootstrapCalls, _expectedBootstrapCalls(user));
    expect(
      container.read(authenticatedSessionBootstrapStatusProvider),
      isA<AuthenticatedSessionBootstrapState>()
          .having((status) => status.userId, 'userId', user.id)
          .having((status) => status.attempt, 'attempt', 1)
          .having((status) => status.isRunning, 'isRunning', isFalse)
          .having((status) => status.failedSteps, 'failedSteps', isEmpty),
    );
  }

  void dispose() {
    premiumSubscription.close();
    container.dispose();
  }
}

class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository()
    : super(
        dioClient: DioClient(secureStorage: const FlutterSecureStorage()),
        secureStorage: const FlutterSecureStorage(),
      );

  User? restoredUser;
  final loginResponses = <AuthResponse>[];
  final registerResponses = <String>[];
  final meResponses = <User>[];
  int logoutCalls = 0;

  @override
  Future<User?> getCurrentUser() async => restoredUser;

  @override
  Future<Either<Failure, AuthResponse>> login(LoginRequest request) async {
    return Right(loginResponses.removeAt(0));
  }

  @override
  Future<Either<Failure, String>> register(RegisterRequest request) async {
    return Right(registerResponses.removeAt(0));
  }

  @override
  Future<AuthPersistenceResult> persistAuthenticationWithRevision(
    AuthResponse response, {
    required bool Function() isCurrent,
  }) async {
    return AuthPersistenceResult(committed: isCurrent(), revision: null);
  }

  @override
  Future<Either<Failure, User>> getMe() async {
    return Right(meResponses.removeAt(0));
  }

  @override
  Future<Either<Failure, AuthSessionInvalidationResult>> logout() async {
    logoutCalls++;
    return const Right(AuthSessionInvalidationResult({}));
  }
}

class _RecordingSessionIntegrations
    implements AuthenticatedSessionIntegrations {
  final bootstrapCalls = <String>[];
  final lifecycleEvents = <String>[];
  final accountTransitionResetUsers = <String>[];
  final failedSteps = <AuthenticatedSessionBootstrapStep>{};
  final _delays = <String, _StepDelay>{};
  final transitionCleanupResults = <AuthenticatedSessionCleanupResult>[];
  final logoutCleanupResults = <AuthenticatedSessionCleanupResult>[];
  final transitionRetrySteps = <Set<AuthenticatedSessionCleanupStep>?>[];
  final transitionRetryTokens = <String?>[];
  final logoutRetrySteps = <Set<AuthenticatedSessionCleanupStep>?>[];
  final logoutRetryTokens = <String?>[];
  bool? revenueCatPremium = false;
  bool serverPremium = false;
  int logoutCleanupCalls = 0;

  _StepDelay delay(AuthenticatedSessionBootstrapStep step, User user) {
    final delay = _StepDelay();
    _delays['${step.name}:${user.id}'] = delay;
    return delay;
  }

  Future<void> _record(
    AuthenticatedSessionBootstrapStep step,
    User user,
  ) async {
    final call = '${step.name}:${user.id}';
    bootstrapCalls.add(call);
    lifecycleEvents.add(call);
    final delay = _delays[call];
    if (delay != null) {
      delay.entered.complete();
      await delay.release.future;
    }
    if (failedSteps.contains(step)) {
      throw StateError('${step.name} unavailable');
    }
  }

  @override
  Future<void> invalidateSessionProviders(User user) {
    return _record(AuthenticatedSessionBootstrapStep.sessionProviders, user);
  }

  @override
  Future<void> connectWebSocket(User user) {
    return _record(AuthenticatedSessionBootstrapStep.webSocket, user);
  }

  @override
  Future<bool?> synchronizeRevenueCat(User user) async {
    await _record(AuthenticatedSessionBootstrapStep.revenueCat, user);
    return revenueCatPremium;
  }

  @override
  Future<bool> refreshServerEntitlement(User user) async {
    await _record(AuthenticatedSessionBootstrapStep.serverEntitlement, user);
    return serverPremium;
  }

  @override
  Future<void> synchronizeSavedGenres(User user) {
    return _record(AuthenticatedSessionBootstrapStep.savedGenres, user);
  }

  @override
  Future<void> registerPushNotifications(User user) {
    return _record(AuthenticatedSessionBootstrapStep.pushRegistration, user);
  }

  @override
  Future<AuthenticatedSessionCleanupResult> resetForAccountTransition(
    User previousUser, {
    Set<AuthenticatedSessionCleanupStep>? retrySteps,
    String? pushToken,
  }) async {
    accountTransitionResetUsers.add(previousUser.id);
    transitionRetrySteps.add(retrySteps);
    transitionRetryTokens.add(pushToken);
    lifecycleEvents.add('transitionCleanup:${previousUser.id}');
    if (transitionCleanupResults.isNotEmpty) {
      return transitionCleanupResults.removeAt(0);
    }
    return const AuthenticatedSessionCleanupResult();
  }

  @override
  Future<AuthenticatedSessionCleanupResult> cleanupForLogout({
    Set<AuthenticatedSessionCleanupStep>? retrySteps,
    String? pushToken,
  }) async {
    logoutCleanupCalls++;
    logoutRetrySteps.add(retrySteps);
    logoutRetryTokens.add(pushToken);
    lifecycleEvents.add('logoutCleanup');
    if (logoutCleanupResults.isNotEmpty) {
      return logoutCleanupResults.removeAt(0);
    }
    return const AuthenticatedSessionCleanupResult();
  }
}

class _StepDelay {
  final entered = Completer<void>();
  final release = Completer<void>();
}

List<String> _expectedBootstrapCalls(User user) {
  return AuthenticatedSessionBootstrapStep.values
      .map((step) => '${step.name}:${user.id}')
      .toList();
}

AuthResponse _authResponse(User user) {
  return AuthResponse(
    user: user,
    token: 'token-${user.id}',
    refreshToken: 'refresh-${user.id}',
  );
}

const _userA = User(
  id: 'user-a',
  email: 'a@example.com',
  username: 'user-a',
  isVerified: true,
  isActive: true,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
);

const _userB = User(
  id: 'user-b',
  email: 'b@example.com',
  username: 'user-b',
  isVerified: true,
  isActive: true,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
);

const _userC = User(
  id: 'user-c',
  email: 'c@example.com',
  username: 'user-c',
  isVerified: true,
  isActive: true,
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
);
