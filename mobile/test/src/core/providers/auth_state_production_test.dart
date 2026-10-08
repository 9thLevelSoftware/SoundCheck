import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:soundcheck_flutter/src/core/api/api_config.dart';
import 'package:soundcheck_flutter/src/core/api/auth_session_store.dart';
import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/core/services/push_notification_service.dart';
import 'package:soundcheck_flutter/src/core/services/websocket_service.dart';
import 'package:soundcheck_flutter/src/core/session/authenticated_session.dart';
import 'package:soundcheck_flutter/src/features/auth/data/auth_repository.dart';
import 'package:soundcheck_flutter/src/features/auth/data/social_auth_service.dart';
import 'package:soundcheck_flutter/src/features/auth/domain/user.dart';
import 'package:soundcheck_flutter/src/features/feed/data/feed_repository.dart';
import 'package:soundcheck_flutter/src/features/subscription/presentation/subscription_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('production AuthState credential fencing', () {
    late _SecureStoragePlatformFake storagePlatform;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      storagePlatform = _SecureStoragePlatformFake();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            _SecureStoragePlatformFake.channel,
            storagePlatform.handle,
          );
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_SecureStoragePlatformFake.channel, null);
    });

    for (final scenario in [
      (
        name: 'password login',
        path: '${ApiConfig.auth}/login',
        start: (AuthState notifier) =>
            notifier.login('a@example.com', 'Password1!'),
      ),
      (
        name: 'registration',
        path: '${ApiConfig.auth}/register',
        start: (AuthState notifier) => notifier.register(
          email: 'a@example.com',
          password: 'Password1!',
          username: 'user-a',
        ),
      ),
    ]) {
      test(
        'logout prevents delayed ${scenario.name} from persisting credentials',
        () async {
          final response = Completer<ResponseBody>();
          final adapter = _RouteAdapter((options) {
            if (options.path == scenario.path) return response.future;
            throw StateError('Unexpected request: ${options.path}');
          });
          final harness = await _ProductionAuthHarness.create(adapter: adapter);
          addTearDown(harness.dispose);

          final authentication = scenario.start(harness.notifier);
          await adapter.requested.first;

          await harness.notifier.logout();
          response.complete(_authResponseBody(_userA, token: 'token-a'));
          await authentication;

          _expectDurablyLoggedOut(storagePlatform);
          expect(harness.container.read(authStateProvider).value, isNull);
        },
      );
    }

    test('logout supersedes a stored-user read that completes later', () async {
      storagePlatform.values[ApiConfig.userKey] = jsonEncode(_userA.toJson());
      storagePlatform.values[ApiConfig.tokenKey] = 'token-a';
      final delayedRead = storagePlatform.delayNextRead(ApiConfig.userKey);
      final harness = _ProductionAuthHarness.createUninitialized(
        adapter: _RouteAdapter((options) {
          throw StateError('Unexpected request: ${options.path}');
        }),
      );
      addTearDown(harness.dispose);

      final restoration = harness.container.read(authStateProvider.future);
      await delayedRead.entered.future;
      final logout = harness.notifier.logout();

      delayedRead.release.complete();
      await Future.wait([restoration, logout]);

      _expectDurablyLoggedOut(storagePlatform);
      expect(harness.container.read(authStateProvider).value, isNull);
    });

    for (final provider in ['google', 'apple']) {
      test(
        'logout prevents delayed real $provider social auth from persisting',
        () async {
          final backendEntered = Completer<void>();
          final response = Completer<ResponseBody>();
          final adapter = _RouteAdapter((options) {
            if (options.path == '/auth/social/state') {
              return _jsonResponseBody({
                'success': true,
                'data': {'state': 's' * 64},
              });
            }
            if (options.path == '/auth/social/$provider') {
              backendEntered.complete();
              return response.future;
            }
            throw StateError('Unexpected request: ${options.path}');
          });
          final harness = await _ProductionAuthHarness.create(adapter: adapter);
          addTearDown(harness.dispose);
          final platform = _SocialAuthPlatformFake();
          final service = SocialAuthService(
            dioClient: harness.dioClient,
            platform: platform,
          );

          final authentication = provider == 'google'
              ? harness.notifier.signInWithGoogle(service)
              : harness.notifier.signInWithApple(service);
          await backendEntered.future;

          await harness.notifier.logout();
          response.complete(_authResponseBody(_userA, token: 'token-a'));
          await authentication;

          _expectDurablyLoggedOut(storagePlatform);
          expect(harness.container.read(authStateProvider).value, isNull);
        },
      );
    }

    for (final failedKey in ['refresh_token', ApiConfig.userKey]) {
      test(
        'current B $failedKey write failure exposes no mixed A/B session',
        () async {
          storagePlatform.values.addAll({
            ApiConfig.tokenKey: 'token-a',
            'refresh_token': 'refresh-token-a',
            ApiConfig.userKey: jsonEncode(_userA.toJson()),
          });
          String? probeAuthorization;
          final adapter = _RouteAdapter((options) {
            if (options.path == '${ApiConfig.auth}/login') {
              return _authResponseBody(_userB, token: 'token-b');
            }
            if (options.path == '/probe') {
              probeAuthorization = options.headers['Authorization'] as String?;
              return _jsonResponseBody({'success': true, 'data': null});
            }
            return _defaultIntegrationResponse(options);
          });
          final harness = await _ProductionAuthHarness.create(adapter: adapter);
          addTearDown(harness.dispose);
          storagePlatform.failNextWrite(failedKey);

          await harness.notifier.login(_userB.email, 'Password1!');

          expect(
            await harness.container
                .read(authRepositoryProvider)
                .getCurrentUser(),
            isNull,
          );
          await harness.dioClient.get('/probe');
          expect(probeAuthorization, isNull);
        },
      );
    }

    test('complete legacy credentials migrate to an active revision', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final harness = await _ProductionAuthHarness.create(
        adapter: _RouteAdapter(_defaultIntegrationResponse),
      );
      addTearDown(harness.dispose);

      expect(harness.container.read(authStateProvider).value, _userA);
      expect(
        storagePlatform.values[AuthSessionStore.visibilityKey],
        startsWith('active:'),
      );
    });

    for (final legacyValues in [
      {ApiConfig.tokenKey: 'token-a'},
      {ApiConfig.userKey: jsonEncode(_userA.toJson())},
    ]) {
      test(
        'incomplete legacy credentials fail closed: $legacyValues',
        () async {
          storagePlatform.values.addAll(legacyValues);
          final harness = await _ProductionAuthHarness.create(
            adapter: _RouteAdapter((options) {
              throw StateError('Unexpected request: ${options.path}');
            }),
          );
          addTearDown(harness.dispose);

          expect(harness.container.read(authStateProvider).value, isNull);
          expect(
            storagePlatform.values[AuthSessionStore.visibilityKey],
            isNull,
          );
        },
      );
    }

    test('reader rejects a revision changed during tuple reads', () async {
      storagePlatform.values.addAll({
        AuthSessionStore.visibilityKey: 'active:revision-a',
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final delayedRead = storagePlatform.delayNextRead(ApiConfig.userKey);
      final store = AuthSessionStore(const FlutterSecureStorage());

      final sessionRead = store.readSession();
      await delayedRead.entered.future;
      storagePlatform.values[AuthSessionStore.visibilityKey] =
          'active:revision-b';
      delayedRead.release.complete();

      expect(await sessionRead, isNull);
    });

    test(
      'secure-storage read failures fail closed for restoration and Dio',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        String? probeAuthorization;
        final adapter = _RouteAdapter((options) {
          if (options.path == '/probe') {
            probeAuthorization = options.headers['Authorization'] as String?;
            return _jsonResponseBody({'success': true, 'data': null});
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(adapter: adapter);
        addTearDown(harness.dispose);

        storagePlatform.failNextRead(ApiConfig.tokenKey);
        expect(
          await harness.container.read(authRepositoryProvider).getCurrentUser(),
          isNull,
        );
        storagePlatform.failNextRead(AuthSessionStore.visibilityKey);
        await harness.dioClient.get('/probe');
        expect(probeAuthorization, isNull);
      },
    );

    test('delayed Dio refresh for A cannot overwrite committed B', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final refreshEntered = Completer<void>();
      final refreshResponse = Completer<ResponseBody>();
      final adapter = _RouteAdapter((options) {
        if (options.path == '/protected') {
          final authorization = options.headers['Authorization'];
          return _jsonResponseBody(
            authorization == 'Bearer token-a'
                ? {'success': false, 'message': 'expired'}
                : {'success': true, 'data': null},
            statusCode: authorization == 'Bearer token-a' ? 401 : 200,
          );
        }
        if (options.path == '/tokens/refresh') {
          refreshEntered.complete();
          return refreshResponse.future;
        }
        throw StateError('Unexpected request: ${options.path}');
      });
      final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final client = DioClient(
        secureStorage: const FlutterSecureStorage(),
        dio: dio,
        refreshDio: refreshDio,
      );
      expect(
        (await client.authSessionStore.readSession())!.accessToken,
        'token-a',
      );

      final request = client.get('/protected');
      await refreshEntered.future;
      await client.authSessionStore.commit(
        accessToken: 'token-b',
        refreshToken: 'refresh-token-b',
        userJson: jsonEncode(_userB.toJson()),
        isCurrent: () => true,
      );
      refreshResponse.complete(
        _jsonResponseBody({
          'success': true,
          'data': {
            'accessToken': 'refreshed-token-a',
            'refreshToken': 'refreshed-refresh-token-a',
          },
        }),
      );

      await expectLater(request, throwsA(isA<AuthFailure>()));
      final session = await client.authSessionStore.readSession();
      expect(session!.accessToken, 'token-b');
      expect(jsonDecode(session.userJson)['id'], _userB.id);
    });

    test(
      'successful refresh replays once and keeps replacement active',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        var protectedCalls = 0;
        var refreshCalls = 0;
        var authFailureCalls = 0;
        final authorizations = <String?>[];
        final adapter = _RouteAdapter((options) {
          if (options.path == '/protected') {
            protectedCalls++;
            final authorization = options.headers['Authorization'] as String?;
            authorizations.add(authorization);
            return _jsonResponseBody(
              authorization == 'Bearer token-a'
                  ? {'success': false, 'message': 'expired'}
                  : {'success': true, 'data': 'ok'},
              statusCode: authorization == 'Bearer token-a' ? 401 : 200,
            );
          }
          if (options.path == '/tokens/refresh') {
            refreshCalls++;
            return _tokenRefreshResponseBody(
              accessToken: 'token-a2',
              refreshToken: 'refresh-token-a2',
            );
          }
          throw StateError('Unexpected request: ${options.path}');
        });
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
          refreshDio: refreshDio,
          onAuthFailure: () => authFailureCalls++,
        );

        final response = await client.get('/protected');

        expect(response.data['data'], 'ok');
        expect(protectedCalls, 2);
        expect(refreshCalls, 1);
        expect(authorizations, ['Bearer token-a', 'Bearer token-a2']);
        expect(authFailureCalls, 0);
        final session = await client.authSessionStore.readSession();
        expect(session!.accessToken, 'token-a2');
        expect(session.refreshToken, 'refresh-token-a2');
      },
    );

    for (final replayFailure in [
      (name: 'server failure', kind: 'server'),
      (name: 'connection failure', kind: 'connection'),
    ]) {
      test('successful refresh preserves replacement after replay '
          '${replayFailure.name}', () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        var protectedCalls = 0;
        var refreshCalls = 0;
        var authFailureCalls = 0;
        final adapter = _RouteAdapter((options) {
          if (options.path == '/protected') {
            protectedCalls++;
            final authorization = options.headers['Authorization'] as String?;
            if (authorization == 'Bearer token-a') {
              return _jsonResponseBody({
                'success': false,
                'message': 'expired',
              }, statusCode: 401);
            }
            if (replayFailure.kind == 'connection') {
              throw DioException(
                requestOptions: options,
                type: DioExceptionType.connectionError,
                message: 'offline',
              );
            }
            return _jsonResponseBody({
              'success': false,
              'message': 'server unavailable',
            }, statusCode: 500);
          }
          if (options.path == '/tokens/refresh') {
            refreshCalls++;
            return _tokenRefreshResponseBody(
              accessToken: 'token-a2',
              refreshToken: 'refresh-token-a2',
            );
          }
          throw StateError('Unexpected request: ${options.path}');
        });
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
          refreshDio: refreshDio,
          onAuthFailure: () => authFailureCalls++,
        );

        await expectLater(
          client.post('/protected'),
          throwsA(
            replayFailure.kind == 'connection'
                ? isA<NetworkFailure>()
                : isA<ServerFailure>(),
          ),
        );

        expect(protectedCalls, 2);
        expect(refreshCalls, 1);
        expect(authFailureCalls, 0);
        final session = await client.authSessionStore.readSession();
        expect(session!.accessToken, 'token-a2');
        expect(session.refreshToken, 'refresh-token-a2');
      });
    }

    test(
      'two concurrent A1 401s share A2 and each replay exactly once',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        final bothInitialRequestsEntered = Completer<void>();
        var initialRequests = 0;
        var replayRequests = 0;
        var refreshCalls = 0;
        var authFailureCalls = 0;
        final adapter = _RouteAdapter((options) async {
          if (options.path.startsWith('/protected/')) {
            final authorization = options.headers['Authorization'] as String?;
            if (authorization == 'Bearer token-a') {
              initialRequests++;
              if (initialRequests == 2) {
                bothInitialRequestsEntered.complete();
              }
              await bothInitialRequestsEntered.future;
              return _jsonResponseBody({
                'success': false,
                'message': 'expired',
              }, statusCode: 401);
            }
            expect(authorization, 'Bearer token-a2');
            replayRequests++;
            return _jsonResponseBody({'success': true, 'data': options.path});
          }
          if (options.path == '/tokens/refresh') {
            refreshCalls++;
            return _tokenRefreshResponseBody(
              accessToken: 'token-a2',
              refreshToken: 'refresh-token-a2',
            );
          }
          throw StateError('Unexpected request: ${options.path}');
        });
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
          refreshDio: refreshDio,
          onAuthFailure: () => authFailureCalls++,
        );

        final responses = await Future.wait([
          client.get('/protected/one'),
          client.get('/protected/two'),
        ]);

        expect(responses.map((response) => response.data['data']).toSet(), {
          '/protected/one',
          '/protected/two',
        });
        expect(initialRequests, 2);
        expect(replayRequests, 2);
        expect(refreshCalls, 1);
        expect(authFailureCalls, 0);
        final session = await client.authSessionStore.readSession();
        expect(session!.accessToken, 'token-a2');
      },
    );

    test(
      'superseded final active write cannot restore A when B login fails',
      () async {
        String? probeAuthorization;
        final bRequested = Completer<void>();
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            final email = (options.data as Map<String, dynamic>)['email'];
            if (email == _userA.email) {
              return _authResponseBody(_userA, token: 'token-a');
            }
            bRequested.complete();
            return _jsonResponseBody({
              'success': false,
              'message': 'login failed',
            }, statusCode: 500);
          }
          if (options.path == '/probe') {
            probeAuthorization = options.headers['Authorization'] as String?;
            return _jsonResponseBody({'success': true, 'data': null});
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(adapter: adapter);
        addTearDown(harness.dispose);
        final delayedActive = storagePlatform.delayNextWriteValue(
          AuthSessionStore.visibilityKey,
          'active:',
        );

        final loginA = harness.notifier.login(_userA.email, 'Password1!');
        await delayedActive.entered.future;
        final loginB = harness.notifier.login(_userB.email, 'Password1!');
        await bRequested.future;
        await loginB;
        delayedActive.release.complete();
        await loginA;

        expect(await harness.dioClient.authSessionStore.readSession(), isNull);
        expect(
          await AuthSessionStore(const FlutterSecureStorage()).readSession(),
          isNull,
        );
        await harness.dioClient.get('/probe');
        expect(probeAuthorization, isNull);
      },
    );

    test('delayed A profile response cannot rewrite committed B', () async {
      final requestGate = _StorageDelay();
      String? profileAuthorization;
      final profileResponse = Completer<ResponseBody>();
      final adapter = _RouteAdapter((options) {
        if (options.path == '${ApiConfig.auth}/me' && options.method == 'PUT') {
          profileAuthorization = options.headers['Authorization'] as String?;
          return profileResponse.future;
        }
        throw StateError('Unexpected request: ${options.path}');
      });
      final harness = await _ProductionAuthHarness.create(
        adapter: adapter,
        preInterceptors: [
          InterceptorsWrapper(
            onRequest: (options, handler) async {
              if (options.path == '${ApiConfig.auth}/me' &&
                  options.method == 'PUT') {
                requestGate.entered.complete();
                await requestGate.release.future;
              }
              handler.next(options);
            },
          ),
        ],
      );
      addTearDown(harness.dispose);
      await harness.dioClient.authSessionStore.commit(
        accessToken: 'token-a',
        refreshToken: 'refresh-token-a',
        userJson: jsonEncode(_userA.toJson()),
        isCurrent: () => true,
      );

      final update = harness.container
          .read(authRepositoryProvider)
          .updateProfile({'firstName': 'Changed'});
      await requestGate.entered.future;
      await harness.dioClient.authSessionStore.commit(
        accessToken: 'token-b',
        refreshToken: 'refresh-token-b',
        userJson: jsonEncode(_userB.toJson()),
        isCurrent: () => true,
      );
      requestGate.release.complete();
      profileResponse.complete(
        _jsonResponseBody({
          'success': true,
          'data': {..._userA.toJson(), 'firstName': 'Changed'},
        }),
      );

      expect((await update).isLeft(), isTrue);
      expect(profileAuthorization, 'Bearer token-a');
      final session = await harness.dioClient.authSessionStore.readSession();
      expect(session!.accessToken, 'token-b');
      expect(jsonDecode(session.userJson)['id'], _userB.id);
    });

    test('profile response refreshed from A1 persists against A2', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      var profileCalls = 0;
      var refreshCalls = 0;
      final adapter = _RouteAdapter((options) {
        if (options.path == '${ApiConfig.auth}/me' && options.method == 'PUT') {
          profileCalls++;
          final authorization = options.headers['Authorization'] as String?;
          return _jsonResponseBody(
            authorization == 'Bearer token-a'
                ? {'success': false, 'message': 'expired'}
                : {
                    'success': true,
                    'data': {..._userA.toJson(), 'firstName': 'Changed'},
                  },
            statusCode: authorization == 'Bearer token-a' ? 401 : 200,
          );
        }
        if (options.path == '/tokens/refresh') {
          refreshCalls++;
          return _tokenRefreshResponseBody(
            accessToken: 'token-a2',
            refreshToken: 'refresh-token-a2',
          );
        }
        throw StateError('Unexpected request: ${options.path}');
      });
      final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      const storage = FlutterSecureStorage();
      final client = DioClient(
        secureStorage: storage,
        dio: dio,
        refreshDio: refreshDio,
      );
      final repository = AuthRepository(
        dioClient: client,
        secureStorage: storage,
      );

      final result = await repository.updateProfile({'firstName': 'Changed'});

      expect(result.isRight(), isTrue);
      expect(profileCalls, 2);
      expect(refreshCalls, 1);
      final session = await client.authSessionStore.readSession();
      expect(session!.accessToken, 'token-a2');
      expect(jsonDecode(session.userJson)['firstName'], 'Changed');
    });

    test(
      'profile response cannot cross from refreshed A2 into committed B',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        final replayEntered = Completer<void>();
        final replayResponse = Completer<ResponseBody>();
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/me' &&
              options.method == 'PUT') {
            final authorization = options.headers['Authorization'] as String?;
            if (authorization == 'Bearer token-a') {
              return _jsonResponseBody({
                'success': false,
                'message': 'expired',
              }, statusCode: 401);
            }
            replayEntered.complete();
            return replayResponse.future;
          }
          if (options.path == '/tokens/refresh') {
            return _tokenRefreshResponseBody(
              accessToken: 'token-a2',
              refreshToken: 'refresh-token-a2',
            );
          }
          throw StateError('Unexpected request: ${options.path}');
        });
        final store = _PausingRevisionStore(const FlutterSecureStorage());
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        const storage = FlutterSecureStorage();
        final client = DioClient(
          secureStorage: storage,
          dio: dio,
          refreshDio: refreshDio,
          authSessionStore: store,
        );
        final repository = AuthRepository(
          dioClient: client,
          secureStorage: storage,
          authSessionStore: store,
        );

        final update = repository.updateProfile({'firstName': 'Changed'});
        await replayEntered.future;
        final successorCheck = store.pauseNextSuccessorResolution();
        replayResponse.complete(
          _jsonResponseBody({
            'success': true,
            'data': {..._userA.toJson(), 'firstName': 'Changed'},
          }),
        );
        await successorCheck.entered.future;
        await store.commit(
          accessToken: 'token-b',
          refreshToken: 'refresh-token-b',
          userJson: jsonEncode(_userB.toJson()),
          isCurrent: () => true,
        );
        successorCheck.release.complete();

        expect((await update).isLeft(), isTrue);
        final session = await store.readSession();
        expect(session!.accessToken, 'token-b');
        expect(jsonDecode(session.userJson)['id'], _userB.id);
      },
    );

    test(
      'authenticated GET does not retry as B after backoff begins',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        final firstRequest = _StorageDelay();
        final authorizations = <String?>[];
        final adapter = _RouteAdapter((options) async {
          if (options.path != '/retry') {
            throw StateError('Unexpected request: ${options.path}');
          }
          authorizations.add(options.headers['Authorization'] as String?);
          firstRequest.entered.complete();
          await firstRequest.release.future;
          throw DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
            message: 'offline',
          );
        });
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
        );

        final request = client.get('/retry');
        await firstRequest.entered.future;
        await client.authSessionStore.commit(
          accessToken: 'token-b',
          refreshToken: 'refresh-token-b',
          userJson: jsonEncode(_userB.toJson()),
          isCurrent: () => true,
        );
        firstRequest.release.complete();

        await expectLater(request, throwsA(isA<NetworkFailure>()));
        expect(authorizations, ['Bearer token-a']);
        final session = await client.authSessionStore.readSession();
        expect(session!.accessToken, 'token-b');
      },
    );

    test(
      'unauthenticated GET retry stays unauthenticated after A login',
      () async {
        final firstRequest = _StorageDelay();
        final authorizations = <String?>[];
        var calls = 0;
        final adapter = _RouteAdapter((options) async {
          if (options.path != '/retry') {
            throw StateError('Unexpected request: ${options.path}');
          }
          calls++;
          authorizations.add(options.headers['Authorization'] as String?);
          if (calls == 1) {
            firstRequest.entered.complete();
            await firstRequest.release.future;
            throw DioException(
              requestOptions: options,
              type: DioExceptionType.connectionError,
              message: 'offline',
            );
          }
          return _jsonResponseBody({'success': true, 'data': 'ok'});
        });
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
        );

        final request = client.get('/retry');
        await firstRequest.entered.future;
        await client.authSessionStore.commit(
          accessToken: 'token-a',
          refreshToken: 'refresh-token-a',
          userJson: jsonEncode(_userA.toJson()),
          isCurrent: () => true,
        );
        firstRequest.release.complete();

        expect((await request).data['data'], 'ok');
        expect(authorizations, [null, null]);
        final session = await client.authSessionStore.readSession();
        expect(session!.accessToken, 'token-a');
      },
    );

    test(
      'caller-side supersession invalidates the exact committed A revision',
      () async {
        final bRequested = Completer<void>();
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            final email = (options.data as Map<String, dynamic>)['email'];
            if (email == _userA.email) {
              return _authResponseBody(_userA, token: 'token-a');
            }
            bRequested.complete();
            return _jsonResponseBody({
              'success': false,
              'message': 'login failed',
            }, statusCode: 500);
          }
          return _defaultIntegrationResponse(options);
        });
        late _PausingPersistenceRepository repository;
        final harness = await _ProductionAuthHarness.create(
          adapter: adapter,
          repositoryBuilder: (dioClient, storage) {
            repository = _PausingPersistenceRepository(
              dioClient: dioClient,
              secureStorage: storage,
            );
            return repository;
          },
        );
        addTearDown(harness.dispose);

        final loginA = harness.notifier.login(_userA.email, 'Password1!');
        await repository.persistenceCompleted.future;
        final loginB = harness.notifier.login(_userB.email, 'Password1!');
        await bRequested.future;
        await loginB;
        repository.releasePersistence.complete();
        await loginA;

        expect(await harness.dioClient.authSessionStore.readSession(), isNull);
        expect(harness.container.read(authStateProvider).value, isNull);
      },
    );

    test('failed A refresh cannot tombstone committed B', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final refreshEntered = Completer<void>();
      final refreshResponse = Completer<ResponseBody>();
      var authFailureCalled = false;
      final adapter = _RouteAdapter((options) {
        if (options.path == '/protected') {
          return _jsonResponseBody({
            'success': false,
            'message': 'expired',
          }, statusCode: 401);
        }
        if (options.path == '/tokens/refresh') {
          refreshEntered.complete();
          return refreshResponse.future;
        }
        throw StateError('Unexpected request: ${options.path}');
      });
      final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final client = DioClient(
        secureStorage: const FlutterSecureStorage(),
        dio: dio,
        refreshDio: refreshDio,
        onAuthFailure: () => authFailureCalled = true,
      );

      final request = client.get('/protected');
      await refreshEntered.future;
      await client.authSessionStore.commit(
        accessToken: 'token-b',
        refreshToken: 'refresh-token-b',
        userJson: jsonEncode(_userB.toJson()),
        isCurrent: () => true,
      );
      refreshResponse.complete(
        _jsonResponseBody({
          'success': false,
          'message': 'refresh failed',
        }, statusCode: 500),
      );

      await expectLater(request, throwsA(isA<AuthFailure>()));
      final session = await client.authSessionStore.readSession();
      expect(session!.accessToken, 'token-b');
      expect(jsonDecode(session.userJson)['id'], _userB.id);
      expect(authFailureCalled, isFalse);
    });

    test(
      'successful A refresh is not retried with B after revision changes',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        final refreshEntered = Completer<void>();
        final refreshResponse = Completer<ResponseBody>();
        var mutationRequests = 0;
        final adapter = _RouteAdapter((options) {
          if (options.path == '/mutate') {
            mutationRequests++;
            return _jsonResponseBody({
              'success': false,
              'message': 'expired',
            }, statusCode: 401);
          }
          if (options.path == '/tokens/refresh') {
            refreshEntered.complete();
            return refreshResponse.future;
          }
          throw StateError('Unexpected request: ${options.path}');
        });
        final store = _PausingRevisionStore(const FlutterSecureStorage());
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
          refreshDio: refreshDio,
          authSessionStore: store,
        );

        final request = client.post('/mutate', data: {'sideEffect': true});
        await refreshEntered.future;
        final revisionCheck = store.pauseNextRevisionCheck();
        refreshResponse.complete(
          _jsonResponseBody({
            'success': true,
            'data': {
              'accessToken': 'refreshed-token-a',
              'refreshToken': 'refreshed-refresh-token-a',
            },
          }),
        );
        await revisionCheck.entered.future;
        await store.commit(
          accessToken: 'token-b',
          refreshToken: 'refresh-token-b',
          userJson: jsonEncode(_userB.toJson()),
          isCurrent: () => true,
        );
        revisionCheck.release.complete();

        await expectLater(request, throwsA(isA<AuthFailure>()));
        expect(mutationRequests, 1);
        final session = await store.readSession();
        expect(session!.accessToken, 'token-b');
        expect(jsonDecode(session.userJson)['id'], _userB.id);
      },
    );

    for (final corruptSession in [
      (name: 'malformed legacy JSON', marker: null, userJson: '{not-json'),
      (
        name: 'active JSON without user id',
        marker: 'active:corrupt-revision',
        userJson: jsonEncode({'email': 'a@example.com'}),
      ),
    ]) {
      test(
        '${corruptSession.name} is rejected by restoration and Dio',
        () async {
          storagePlatform.values.addAll({
            if (corruptSession.marker != null)
              AuthSessionStore.visibilityKey: corruptSession.marker!,
            ApiConfig.tokenKey: 'token-a',
            'refresh_token': 'refresh-token-a',
            ApiConfig.userKey: corruptSession.userJson,
          });
          String? probeAuthorization;
          final adapter = _RouteAdapter((options) {
            if (options.path == '/probe') {
              probeAuthorization = options.headers['Authorization'] as String?;
              return _jsonResponseBody({'success': true, 'data': null});
            }
            throw StateError('Unexpected request: ${options.path}');
          });
          final harness = await _ProductionAuthHarness.create(adapter: adapter);
          addTearDown(harness.dispose);

          expect(harness.container.read(authStateProvider).value, isNull);
          await harness.dioClient.get('/probe');
          expect(probeAuthorization, isNull);
          expect(
            storagePlatform.values[AuthSessionStore.visibilityKey],
            isNot(startsWith('active:')),
          );
        },
      );
    }

    test('legacy activation cannot race past a logout tombstone', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final delayedActivation = storagePlatform.delayNextWrite(
        AuthSessionStore.visibilityKey,
      );
      final store = AuthSessionStore(const FlutterSecureStorage());

      final migration = store.readSession();
      await delayedActivation.entered.future;
      final logout = store.invalidate();
      delayedActivation.release.complete();
      await Future.wait([migration, logout]);

      expect(
        storagePlatform.values[AuthSessionStore.visibilityKey],
        startsWith('loggedOut:'),
      );
      expect(await store.readSession(), isNull);
    });

    test(
      'logout tombstone hides undeleted residue from restoration and Dio',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        final harness = await _ProductionAuthHarness.create(
          adapter: _RouteAdapter(_defaultIntegrationResponse),
        );
        addTearDown(harness.dispose);
        storagePlatform.failDeletes(ApiConfig.tokenKey, 2);

        await harness.notifier.logout();

        expect(storagePlatform.values[ApiConfig.tokenKey], 'token-a');
        expect(
          storagePlatform.values[AuthSessionStore.visibilityKey],
          startsWith('loggedOut:'),
        );
        expect(harness.container.read(authStateProvider).value, isNull);
        expect(
          harness.container
              .read(authenticatedSessionBootstrapStatusProvider)
              .failedCleanupSteps,
          contains(AuthenticatedSessionCleanupStep.localCredentials),
        );

        String? probeAuthorization;
        final freshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = _RouteAdapter((options) {
            probeAuthorization = options.headers['Authorization'] as String?;
            return _jsonResponseBody({'success': true, 'data': null});
          });
        final freshClient = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: freshDio,
        );
        final freshRepository = AuthRepository(
          dioClient: freshClient,
          secureStorage: const FlutterSecureStorage(),
        );

        expect(await freshRepository.getCurrentUser(), isNull);
        await freshClient.get('/probe');
        expect(probeAuthorization, isNull);
      },
    );

    test('logout marker failure retains the published session', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final harness = await _ProductionAuthHarness.create(
        adapter: _RouteAdapter(_defaultIntegrationResponse),
      );
      addTearDown(harness.dispose);
      storagePlatform.failNextWrite(AuthSessionStore.visibilityKey);

      await harness.notifier.logout();

      expect(harness.container.read(authStateProvider).value, _userA);
      expect(
        await harness.dioClient.authSessionStore.readAccessToken(),
        'token-a',
      );
      expect(
        harness.container
            .read(authenticatedSessionBootstrapStatusProvider)
            .failedCleanupSteps,
        contains(AuthenticatedSessionCleanupStep.localCredentials),
      );
    });

    test('Dio 401 tombstone hides residue when raw deletion fails', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      var authFailureCalls = 0;
      final adapter = _RouteAdapter((options) {
        if (options.path == '/protected') {
          return _jsonResponseBody({
            'success': false,
            'message': 'expired',
          }, statusCode: 401);
        }
        if (options.path == '/tokens/refresh') {
          return _jsonResponseBody({
            'success': false,
            'message': 'expired',
          }, statusCode: 401);
        }
        throw StateError('Unexpected request: ${options.path}');
      });
      final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
        ..httpClientAdapter = adapter;
      final client = DioClient(
        secureStorage: const FlutterSecureStorage(),
        dio: dio,
        refreshDio: refreshDio,
        onAuthFailure: () => authFailureCalls++,
      );
      expect(await client.authSessionStore.readSession(), isNotNull);
      storagePlatform.failDeletes(ApiConfig.tokenKey, 1);

      await expectLater(client.get('/protected'), throwsA(isA<AuthFailure>()));

      expect(authFailureCalls, 1);
      expect(storagePlatform.values[ApiConfig.tokenKey], 'token-a');
      expect(await client.authSessionStore.readSession(), isNull);
    });

    test(
      'Dio 401 marker failure preserves A and does not signal logout',
      () async {
        storagePlatform.values.addAll({
          ApiConfig.tokenKey: 'token-a',
          'refresh_token': 'refresh-token-a',
          ApiConfig.userKey: jsonEncode(_userA.toJson()),
        });
        var authFailureCalls = 0;
        final adapter = _RouteAdapter((options) {
          if (options.path == '/protected' ||
              options.path == '/tokens/refresh') {
            return _jsonResponseBody({
              'success': false,
              'message': 'expired',
            }, statusCode: 401);
          }
          throw StateError('Unexpected request: ${options.path}');
        });
        final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
          ..httpClientAdapter = adapter;
        final client = DioClient(
          secureStorage: const FlutterSecureStorage(),
          dio: dio,
          refreshDio: refreshDio,
          onAuthFailure: () => authFailureCalls++,
        );
        expect(await client.authSessionStore.readSession(), isNotNull);
        storagePlatform.failNextWrite(AuthSessionStore.visibilityKey);

        await expectLater(
          client.get('/protected'),
          throwsA(isA<AuthFailure>()),
        );

        expect(authFailureCalls, 0);
        expect(
          (await client.authSessionStore.readSession())!.accessToken,
          'token-a',
        );
      },
    );

    test('logout fences an older in-flight refreshUser response', () async {
      final refreshEntered = Completer<void>();
      final refreshResponse = Completer<ResponseBody>();
      final adapter = _RouteAdapter((options) {
        if (options.path == '${ApiConfig.auth}/login') {
          return _authResponseBody(_userA, token: 'token-a');
        }
        if (options.path == '${ApiConfig.auth}/me') {
          refreshEntered.complete();
          return refreshResponse.future;
        }
        return _defaultIntegrationResponse(options);
      });
      final harness = await _ProductionAuthHarness.create(adapter: adapter);
      addTearDown(harness.dispose);
      await harness.notifier.login(_userA.email, 'Password1!');

      final refresh = harness.notifier.refreshUser();
      await refreshEntered.future;
      await harness.notifier.logout();
      refreshResponse.complete(
        _jsonResponseBody({'success': true, 'data': _userC.toJson()}),
      );
      await refresh;

      expect(harness.container.read(authStateProvider).value, isNull);
      expect(await harness.dioClient.authSessionStore.readSession(), isNull);
    });

    test(
      'new login B fences an older in-flight refreshUser response',
      () async {
        final refreshEntered = Completer<void>();
        final refreshResponse = Completer<ResponseBody>();
        var loginCount = 0;
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            loginCount++;
            return _authResponseBody(
              loginCount == 1 ? _userA : _userB,
              token: loginCount == 1 ? 'token-a' : 'token-b',
            );
          }
          if (options.path == '${ApiConfig.auth}/me') {
            refreshEntered.complete();
            return refreshResponse.future;
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(adapter: adapter);
        addTearDown(harness.dispose);
        await harness.notifier.login(_userA.email, 'Password1!');

        final refresh = harness.notifier.refreshUser();
        await refreshEntered.future;
        await harness.notifier.login(_userB.email, 'Password1!');
        refreshResponse.complete(
          _jsonResponseBody({'success': true, 'data': _userC.toJson()}),
        );
        await refresh;

        expect(harness.container.read(authStateProvider).value, _userB);
        expect(
          jsonDecode(
            (await harness.dioClient.authSessionStore.readSession())!.userJson,
          )['id'],
          _userB.id,
        );
      },
    );

    test(
      'default logout retries a transient RevenueCat PlatformException',
      () async {
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            return _authResponseBody(_userA, token: 'token-a');
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(adapter: adapter);
        addTearDown(harness.dispose);
        await harness.notifier.login(_userA.email, 'Password1!');
        harness.revenueCat.logoutFailures.add(
          PlatformException(code: 'network_error'),
        );

        await harness.notifier.logout();

        expect(harness.revenueCat.logoutCalls, 2);
        final status = harness.container.read(
          authenticatedSessionBootstrapStatusProvider,
        );
        expect(status.cleanupAttempts, 2);
        expect(status.failedCleanupSteps, isEmpty);
        expect(harness.container.read(authStateProvider).value, isNull);
      },
    );

    test(
      'default logout reports permanent RevenueCat cleanup degradation',
      () async {
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            return _authResponseBody(_userA, token: 'token-a');
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(adapter: adapter);
        addTearDown(harness.dispose);
        await harness.notifier.login(_userA.email, 'Password1!');
        harness.revenueCat.logoutFailures.addAll([
          PlatformException(code: 'network_error'),
          PlatformException(code: 'network_error'),
        ]);

        await harness.notifier.logout();

        expect(harness.revenueCat.logoutCalls, 2);
        final status = harness.container.read(
          authenticatedSessionBootstrapStatusProvider,
        );
        expect(status.cleanupAttempts, 2);
        expect(
          status.failedCleanupSteps,
          contains(AuthenticatedSessionCleanupStep.revenueCatLogout),
        );
        expect(harness.container.read(authStateProvider).value, isNull);
        expect(await harness.dioClient.authSessionStore.readSession(), isNull);
      },
    );

    test('successful registration stays signed out', () async {
      final adapter = _RouteAdapter((options) {
        if (options.path == '${ApiConfig.auth}/register') {
          return _jsonResponseBody({
            'success': true,
            'message': 'Check your email to finish creating your account.',
          }, statusCode: 201);
        }
        return _defaultIntegrationResponse(options);
      });
      final harness = await _ProductionAuthHarness.create(adapter: adapter);
      addTearDown(harness.dispose);

      final message = await harness.notifier.register(
        email: _userA.email,
        password: 'Password1!',
        username: _userA.username,
      );

      expect(message, 'Check your email to finish creating your account.');
      expect(harness.container.read(authStateProvider).value, isNull);
      expect(await harness.dioClient.authSessionStore.readSession(), isNull);
    });

    for (final provider in ['google', 'apple']) {
      test(
        'successful $provider auth uses the full default bootstrap',
        () async {
          final adapter = _RouteAdapter((options) {
            if (options.path == '/auth/social/state') {
              return _jsonResponseBody({
                'success': true,
                'data': {'state': 's' * 64},
              });
            }
            if (options.path == '/auth/social/$provider') {
              return _authResponseBody(_userA, token: 'token-a');
            }
            return _defaultIntegrationResponse(options);
          });
          final harness = await _ProductionAuthHarness.create(adapter: adapter);
          addTearDown(harness.dispose);
          final service = SocialAuthService(
            dioClient: harness.dioClient,
            platform: _SocialAuthPlatformFake(),
          );

          final user = provider == 'google'
              ? await harness.notifier.signInWithGoogle(service)
              : await harness.notifier.signInWithApple(service);

          expect(user, _userA);
          await _expectSuccessfulDefaultBootstrap(harness, _userA);
        },
      );
    }

    test('stored restoration uses the full default bootstrap', () async {
      storagePlatform.values.addAll({
        ApiConfig.tokenKey: 'token-a',
        'refresh_token': 'refresh-token-a',
        ApiConfig.userKey: jsonEncode(_userA.toJson()),
      });
      final harness = await _ProductionAuthHarness.create(
        adapter: _RouteAdapter(_defaultIntegrationResponse),
      );
      addTearDown(harness.dispose);

      await _expectSuccessfulDefaultBootstrap(harness, _userA);
    });

    test(
      'stale mid-write rollback finishes before newer credentials commit',
      () async {
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            final email = (options.data as Map<String, dynamic>)['email'];
            return _authResponseBody(
              email == _userA.email ? _userA : _userB,
              token: email == _userA.email ? 'token-a' : 'token-b',
            );
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(adapter: adapter);
        addTearDown(harness.dispose);
        final delayedWrite = storagePlatform.delayNextWrite(ApiConfig.tokenKey);

        final authenticationA = harness.notifier.login(
          _userA.email,
          'Password1!',
        );
        await delayedWrite.entered.future;
        final authenticationB = harness.notifier.login(
          _userB.email,
          'Password1!',
        );

        delayedWrite.release.complete();
        await Future.wait([authenticationA, authenticationB]);

        expect(storagePlatform.values[ApiConfig.tokenKey], 'token-b');
        expect(storagePlatform.values['refresh_token'], 'refresh-token-b');
        expect(
          jsonDecode(storagePlatform.values[ApiConfig.userKey]!)['id'],
          _userB.id,
        );
        expect(
          storagePlatform.operations,
          containsAllInOrder([
            'write:${ApiConfig.tokenKey}:token-a',
            'delete:${ApiConfig.tokenKey}',
            'delete:${ApiConfig.userKey}',
            'delete:refresh_token',
            'write:${ApiConfig.tokenKey}:token-b',
          ]),
        );
      },
    );

    test(
      'default integrations retry pending A and clean active B before C',
      () async {
        const pushA = 'push-token-a-1234567890';
        const pushB = 'push-token-b-1234567890';
        const pushC = 'push-token-c-1234567890';
        final lifecycleEvents = <String>[];
        var unregisterARequests = 0;
        final adapter = _RouteAdapter((options) {
          if (options.path == '${ApiConfig.auth}/login') {
            final email = (options.data as Map<String, dynamic>)['email'];
            final user = switch (email) {
              'a@example.com' => _userA,
              'b@example.com' => _userB,
              _ => _userC,
            };
            return _authResponseBody(user, token: 'token-${user.id}');
          }
          if (options.path == '/users/device-token') {
            final token = (options.data as Map<String, dynamic>)['token'];
            if (options.method == 'POST') {
              lifecycleEvents.add('register:$token');
              return _jsonResponseBody({'success': true, 'data': null});
            }
            lifecycleEvents.add('unregister:$token');
            if (token == pushA && unregisterARequests++ == 0) {
              return _jsonResponseBody({
                'success': false,
                'message': 'offline',
              }, statusCode: 503);
            }
            return _jsonResponseBody({'success': true, 'data': null});
          }
          return _defaultIntegrationResponse(options);
        });
        final harness = await _ProductionAuthHarness.create(
          adapter: adapter,
          pushTokens: [pushA, pushB, pushC],
        );
        addTearDown(harness.dispose);

        await harness.notifier.login(_userA.email, 'Password1!');
        await harness.notifier.login(_userB.email, 'Password1!');
        await harness.notifier.login(_userC.email, 'Password1!');

        expect(harness.container.read(authStateProvider).value, _userC);
        expect(
          lifecycleEvents,
          containsAllInOrder([
            'register:$pushA',
            'unregister:$pushA',
            'register:$pushB',
            'unregister:$pushA',
            'unregister:$pushB',
            'register:$pushC',
          ]),
        );
      },
    );
  });
}

class _ProductionAuthHarness {
  _ProductionAuthHarness._({
    required this.container,
    required this.dioClient,
    required this.webSocket,
    required this.pushNotifications,
    required this.revenueCat,
  });

  final ProviderContainer container;
  final DioClient dioClient;
  final WebSocketService webSocket;
  final PushNotificationService pushNotifications;
  final _RevenueCatSdkAdapterFake revenueCat;

  AuthState get notifier => container.read(authStateProvider.notifier);

  static Future<_ProductionAuthHarness> create({
    required HttpClientAdapter adapter,
    List<String?> pushTokens = const [],
    List<Interceptor> preInterceptors = const [],
    AuthRepository Function(DioClient, FlutterSecureStorage)? repositoryBuilder,
  }) async {
    final harness = createUninitialized(
      adapter: adapter,
      pushTokens: pushTokens,
      preInterceptors: preInterceptors,
      repositoryBuilder: repositoryBuilder,
    );
    await harness.container.read(authStateProvider.future);
    return harness;
  }

  static _ProductionAuthHarness createUninitialized({
    required HttpClientAdapter adapter,
    List<String?> pushTokens = const [],
    List<Interceptor> preInterceptors = const [],
    AuthRepository Function(DioClient, FlutterSecureStorage)? repositoryBuilder,
  }) {
    const storage = FlutterSecureStorage();
    final dio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl))
      ..httpClientAdapter = adapter;
    dio.interceptors.addAll(preInterceptors);
    final dioClient = DioClient(secureStorage: storage, dio: dio);
    final repository =
        repositoryBuilder?.call(dioClient, storage) ??
        AuthRepository(dioClient: dioClient, secureStorage: storage);
    final webSocket = WebSocketService(
      channelFactory: (_, {authToken}) => _FakeWebSocketChannel(),
    );
    final feedRepository = FeedRepository(dioClient: dioClient);
    final pushNotifications = PushNotificationService(
      feedRepository: feedRepository,
      messagingClient: _PushMessagingClient(pushTokens),
      localNotificationsInitializer: () async {},
    );
    final revenueCat = _RevenueCatSdkAdapterFake();
    final container = ProviderContainer(
      overrides: [
        dioClientProvider.overrideWithValue(dioClient),
        authRepositoryProvider.overrideWithValue(repository),
        webSocketServiceProvider.overrideWithValue(webSocket),
        pushNotificationServiceProvider.overrideWithValue(pushNotifications),
        revenueCatSdkAdapterProvider.overrideWithValue(revenueCat),
      ],
    );
    return _ProductionAuthHarness._(
      container: container,
      dioClient: dioClient,
      webSocket: webSocket,
      pushNotifications: pushNotifications,
      revenueCat: revenueCat,
    );
  }

  Future<void> dispose() async {
    container.dispose();
    webSocket.dispose();
    await pushNotifications.dispose();
  }
}

class _RevenueCatSdkAdapterFake extends RevenueCatSdkAdapter {
  CustomerInfoUpdateListener? listener;
  final logoutFailures = <Object>[];
  final loginUsers = <String>[];
  int logoutCalls = 0;
  int customerInfoCalls = 0;

  @override
  Future<bool> login(String userId) async {
    loginUsers.add(userId);
    return true;
  }

  @override
  Future<CustomerInfo?> getCustomerInfo() async {
    customerInfoCalls++;
    return _inactiveCustomerInfo();
  }

  @override
  Future<void> logout() async {
    logoutCalls++;
    if (logoutFailures.isNotEmpty) throw logoutFailures.removeAt(0);
  }

  @override
  void setCustomerInfoUpdateListener(CustomerInfoUpdateListener? value) {
    listener = value;
  }
}

class _PushMessagingClient implements PushMessagingClient {
  _PushMessagingClient(List<String?> tokens) : _tokens = [...tokens];

  final List<String?> _tokens;

  @override
  Future<bool> ensureInitialized() async => true;

  @override
  Future<RemoteMessage?> getInitialMessage() async => null;

  @override
  Future<String?> getToken() async {
    return _tokens.isEmpty ? null : _tokens.removeAt(0);
  }

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

class _FakeWebSocketChannel implements WebSocketChannel {
  final _incoming = StreamController<dynamic>();
  final _sink = _FakeWebSocketSink();

  @override
  int? get closeCode => null;

  @override
  String? get closeReason => null;

  @override
  String? get protocol => null;

  @override
  Future<void> get ready async {}

  @override
  WebSocketSink get sink => _sink;

  @override
  Stream get stream => _incoming.stream;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeWebSocketSink implements WebSocketSink {
  final _done = Completer<void>();

  @override
  Future get done => _done.future;

  @override
  void add(Object? data) {}

  @override
  void addError(Object error, [StackTrace? stackTrace]) {}

  @override
  Future<void> addStream(Stream stream) async {}

  @override
  Future<void> close([int? closeCode, String? closeReason]) async {
    if (!_done.isCompleted) _done.complete();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _SocialAuthPlatformFake implements SocialAuthPlatform {
  @override
  Future<String?> signInWithGoogle() async => 'google-id-token';

  @override
  Future<AppleSocialCredential> signInWithApple() async {
    return const AppleSocialCredential(
      identityToken: 'apple-identity-token',
      givenName: 'User',
      familyName: 'A',
    );
  }

  @override
  Future<void> signOutGoogle() async {}
}

class _RouteAdapter implements HttpClientAdapter {
  _RouteAdapter(this._handler);

  final FutureOr<ResponseBody> Function(RequestOptions options) _handler;
  final _requested = StreamController<RequestOptions>.broadcast();

  Stream<RequestOptions> get requested => _requested.stream;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    _requested.add(options);
    return _handler(options);
  }

  @override
  void close({bool force = false}) {
    _requested.close();
  }
}

class _PausingRevisionStore extends AuthSessionStore {
  // The superclass positional parameter is private to its library.
  // ignore: use_super_parameters
  _PausingRevisionStore(FlutterSecureStorage storage) : super(storage);

  _StorageDelay? _nextRevisionCheck;
  _StorageDelay? _nextSuccessorResolution;

  _StorageDelay pauseNextRevisionCheck() {
    final delay = _StorageDelay();
    _nextRevisionCheck = delay;
    return delay;
  }

  _StorageDelay pauseNextSuccessorResolution() {
    final delay = _StorageDelay();
    _nextSuccessorResolution = delay;
    return delay;
  }

  @override
  Future<bool> isActiveRevision(String expectedRevision) async {
    final delay = _nextRevisionCheck;
    if (delay != null) {
      _nextRevisionCheck = null;
      delay.entered.complete();
      await delay.release.future;
    }
    return super.isActiveRevision(expectedRevision);
  }

  @override
  Future<StoredAuthSession?> resolveActiveRefreshSuccessor(
    String expectedRevision,
  ) async {
    final delay = _nextSuccessorResolution;
    if (delay != null) {
      _nextSuccessorResolution = null;
      delay.entered.complete();
      await delay.release.future;
    }
    return super.resolveActiveRefreshSuccessor(expectedRevision);
  }
}

class _PausingPersistenceRepository extends AuthRepository {
  _PausingPersistenceRepository({
    required super.dioClient,
    required super.secureStorage,
  });

  final persistenceCompleted = Completer<void>();
  final releasePersistence = Completer<void>();

  @override
  Future<AuthPersistenceResult> persistAuthenticationWithRevision(
    AuthResponse response, {
    required bool Function() isCurrent,
  }) async {
    final result = await super.persistAuthenticationWithRevision(
      response,
      isCurrent: isCurrent,
    );
    persistenceCompleted.complete();
    await releasePersistence.future;
    return result;
  }
}

class _SecureStoragePlatformFake {
  static const channel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );

  final values = <String, String>{};
  final operations = <String>[];
  final _delayedReads = <String, _StorageDelay>{};
  final _delayedWrites = <String, _StorageDelay>{};
  final _failedReads = <String, int>{};
  final _failedWrites = <String, int>{};
  final _failedDeletes = <String, int>{};
  String? _delayedWriteValueKey;
  String? _delayedWriteValuePrefix;
  _StorageDelay? _delayedWriteValue;

  _StorageDelay delayNextRead(String key) {
    final delay = _StorageDelay();
    _delayedReads[key] = delay;
    return delay;
  }

  _StorageDelay delayNextWrite(String key) {
    final delay = _StorageDelay();
    _delayedWrites[key] = delay;
    return delay;
  }

  _StorageDelay delayNextWriteValue(String key, String valuePrefix) {
    final delay = _StorageDelay();
    _delayedWriteValueKey = key;
    _delayedWriteValuePrefix = valuePrefix;
    _delayedWriteValue = delay;
    return delay;
  }

  void failNextWrite(String key) {
    _failedWrites[key] = (_failedWrites[key] ?? 0) + 1;
  }

  void failNextRead(String key) {
    _failedReads[key] = (_failedReads[key] ?? 0) + 1;
  }

  void failDeletes(String key, int count) {
    _failedDeletes[key] = (_failedDeletes[key] ?? 0) + count;
  }

  Future<Object?> handle(MethodCall call) async {
    final arguments = (call.arguments as Map).cast<String, Object?>();
    final key = arguments['key'] as String?;
    switch (call.method) {
      case 'read':
        final remainingFailures = _failedReads[key] ?? 0;
        if (remainingFailures > 0) {
          _failedReads[key!] = remainingFailures - 1;
          throw PlatformException(code: 'read_failed', message: key);
        }
        final value = values[key];
        final delay = _delayedReads.remove(key);
        if (delay != null) {
          delay.entered.complete();
          await delay.release.future;
        }
        return value;
      case 'write':
        final value = arguments['value']! as String;
        final remainingFailures = _failedWrites[key] ?? 0;
        if (remainingFailures > 0) {
          _failedWrites[key!] = remainingFailures - 1;
          throw PlatformException(code: 'write_failed', message: key);
        }
        _StorageDelay? delay;
        if (key == _delayedWriteValueKey &&
            value.startsWith(_delayedWriteValuePrefix!)) {
          delay = _delayedWriteValue;
          _delayedWriteValueKey = null;
          _delayedWriteValuePrefix = null;
          _delayedWriteValue = null;
        }
        delay ??= _delayedWrites.remove(key);
        if (delay != null) {
          delay.entered.complete();
          await delay.release.future;
        }
        values[key!] = value;
        operations.add('write:$key:$value');
        return null;
      case 'delete':
        final remainingFailures = _failedDeletes[key] ?? 0;
        if (remainingFailures > 0) {
          _failedDeletes[key!] = remainingFailures - 1;
          throw PlatformException(code: 'delete_failed', message: key);
        }
        values.remove(key);
        operations.add('delete:$key');
        return null;
      case 'deleteAll':
        values.clear();
        operations.add('deleteAll');
        return null;
      case 'readAll':
        return Map<String, String>.from(values);
      case 'containsKey':
        return values.containsKey(key);
      default:
        throw MissingPluginException('Unsupported secure-storage call');
    }
  }
}

class _StorageDelay {
  final entered = Completer<void>();
  final release = Completer<void>();
}

void _expectDurablyLoggedOut(_SecureStoragePlatformFake storage) {
  expect(storage.values[ApiConfig.tokenKey], isNull);
  expect(storage.values['refresh_token'], isNull);
  expect(storage.values[ApiConfig.userKey], isNull);
  expect(
    storage.values[AuthSessionStore.visibilityKey],
    startsWith('loggedOut:'),
  );
}

Future<void> _expectSuccessfulDefaultBootstrap(
  _ProductionAuthHarness harness,
  User user,
) async {
  expect(harness.container.read(authStateProvider).value, user);
  final status = harness.container.read(
    authenticatedSessionBootstrapStatusProvider,
  );
  expect(status.userId, user.id);
  expect(status.attempt, 1);
  expect(status.isRunning, isFalse);
  expect(status.failedSteps, isEmpty);
  expect(status.failedCleanupSteps, isEmpty);
  expect(harness.webSocket.isConnected, isTrue);
  expect(harness.revenueCat.loginUsers, [user.id]);
  expect(harness.revenueCat.customerInfoCalls, 1);
  expect(harness.revenueCat.listener, isNotNull);
  final session = await harness.dioClient.authSessionStore.readSession();
  expect(session, isNotNull);
  expect(jsonDecode(session!.userJson)['id'], user.id);
}

ResponseBody _authResponseBody(User user, {required String token}) {
  return _jsonResponseBody({
    'success': true,
    'data': {
      'user': user.toJson(),
      'token': token,
      'refreshToken': 'refresh-$token',
    },
  });
}

ResponseBody _tokenRefreshResponseBody({
  required String accessToken,
  required String refreshToken,
}) {
  return _jsonResponseBody({
    'success': true,
    'data': {'accessToken': accessToken, 'refreshToken': refreshToken},
  });
}

ResponseBody _jsonResponseBody(
  Map<String, Object?> body, {
  int statusCode = 200,
}) {
  return ResponseBody.fromString(
    jsonEncode(body),
    statusCode,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );
}

ResponseBody _defaultIntegrationResponse(RequestOptions options) {
  if (options.path == '/subscription/status') {
    return _jsonResponseBody({
      'success': true,
      'data': {'isPremium': false},
    });
  }
  throw StateError('Unexpected request: ${options.method} ${options.path}');
}

CustomerInfo _inactiveCustomerInfo() {
  const identifier = SubscriptionService.entitlementIdentifier;
  const entitlement = EntitlementInfo(
    identifier,
    false,
    true,
    '2026-07-26T00:00:00Z',
    '2026-07-26T00:00:00Z',
    SubscriptionService.productMonthly,
    true,
  );
  return const CustomerInfo(
    EntitlementInfos({identifier: entitlement}, {}),
    {},
    [],
    [],
    [],
    '2026-07-26T00:00:00Z',
    'test-user',
    {},
    '2026-07-26T00:00:00Z',
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
