import 'dart:async';

import 'package:dartz/dartz.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/core/services/push_notification_service.dart';
import 'package:soundcheck_flutter/src/features/feed/data/feed_repository.dart';
import 'package:soundcheck_flutter/src/features/profile/presentation/settings_provider.dart';

void main() {
  group('PushNotificationService deep-link parsing', () {
    late PushNotificationService service;

    setUp(() {
      service = PushNotificationService();
    });

    tearDown(() async {
      await service.dispose();
    });

    test('accepts internal deepLink routes', () {
      expect(service.parseDeepLink({'deepLink': '/feed'}), '/feed');
      expect(
        service.parseDeepLink({'deepLink': '/checkins/checkin-123'}),
        '/checkins/checkin-123',
      );
      expect(
        service.parseDeepLink({'deepLink': '/notifications?tab=activity'}),
        '/notifications?tab=activity',
      );
    });

    test('rejects external and unknown deepLink routes', () {
      expect(
        service.parseDeepLink({'deepLink': 'https://example.com/feed'}),
        isNull,
      );
      expect(service.parseDeepLink({'deepLink': '//example.com/feed'}), isNull);
      expect(service.parseDeepLink({'deepLink': '/admin/users'}), isNull);
      expect(service.parseDeepLink({'deepLink': 'feed'}), isNull);
    });

    test('builds internal routes from compatibility entity ids', () {
      expect(
        service.parseDeepLink({'notificationId': 'notification-123'}),
        '/notifications/notification-123',
      );
      expect(
        service.parseDeepLink({'checkinId': 'checkin-123'}),
        '/checkins/checkin-123',
      );
      expect(service.parseDeepLink({'bandId': 'band-123'}), '/bands/band-123');
      expect(
        service.parseDeepLink({'venueId': 'venue-123'}),
        '/venues/venue-123',
      );
      expect(service.parseDeepLink({'userId': 'user-123'}), '/users/user-123');
      expect(
        service.parseDeepLink({'eventId': 'event-123'}),
        '/events/event-123',
      );
      expect(service.parseDeepLink({'showId': 'show-123'}), '/events/show-123');
    });
  });

  group('PushNotificationService session fencing', () {
    test(
      'reset during initial backend registration cannot restore the token',
      () async {
        final messaging = _FakePushMessagingClient(initialToken: 'token-a');
        final repository = _FakeFeedRepository();
        final registration = repository.delayNextRegistration();
        final service = PushNotificationService(
          feedRepository: repository,
          messagingClient: messaging,
          localNotificationsInitializer: () async {},
        );
        addTearDown(service.dispose);

        final initialize = service.initialize();
        await registration.entered.future;
        final reset = service.resetForLogout();
        registration.release.complete(const Right(null));
        await Future.wait([initialize, reset]);

        expect(service.currentToken, isNull);
        expect(service.isInitialized, isFalse);
      },
    );

    test(
      'reset during refreshed backend registration cannot restore the token',
      () async {
        final messaging = _FakePushMessagingClient();
        final repository = _FakeFeedRepository();
        final service = PushNotificationService(
          feedRepository: repository,
          messagingClient: messaging,
          localNotificationsInitializer: () async {},
        );
        addTearDown(service.dispose);
        await service.initialize();
        expect(service.isInitialized, isTrue);
        final registration = repository.delayNextRegistration();

        messaging.tokenRefreshController.add('token-refreshed');
        await registration.entered.future;
        final reset = service.resetForLogout();
        registration.release.complete(const Right(null));
        await reset;
        await Future<void>.delayed(Duration.zero);

        expect(service.currentToken, isNull);
        expect(service.isInitialized, isFalse);
      },
    );

    test(
      'backend registration failure leaves initialization retryable',
      () async {
        final messaging = _FakePushMessagingClient(initialToken: 'token-a');
        final repository = _FakeFeedRepository()
          ..registrationResults.add(const Left(ServerFailure('unavailable')));
        final service = PushNotificationService(
          feedRepository: repository,
          messagingClient: messaging,
          localNotificationsInitializer: () async {},
        );
        addTearDown(service.dispose);

        await service.initialize();

        expect(service.currentToken, isNull);
        expect(service.isInitialized, isFalse);
        expect(repository.registeredTokens, ['token-a']);
      },
    );

    test('does not register the device token when push is disabled', () async {
      final messaging = _FakePushMessagingClient(initialToken: 'token-a');
      final repository = _FakeFeedRepository();
      final service = PushNotificationService(
        feedRepository: repository,
        messagingClient: messaging,
        localNotificationsInitializer: () async {},
        isPushEnabled: () async => false,
      );
      addTearDown(service.dispose);

      await service.initialize();

      expect(repository.registeredTokens, isEmpty);
      expect(service.currentToken, 'token-a');
    });

    test('settings push toggle unregisters the current device token', () async {
      SharedPreferences.setMockInitialValues({
        'settings_push_notifications': true,
      });
      final messaging = _FakePushMessagingClient(initialToken: 'token-a');
      final repository = _FakeFeedRepository();
      final service = PushNotificationService(
        feedRepository: repository,
        messagingClient: messaging,
        localNotificationsInitializer: () async {},
      );
      addTearDown(service.dispose);
      await service.initialize();

      final container = ProviderContainer(
        overrides: [pushNotificationServiceProvider.overrideWithValue(service)],
      );
      addTearDown(container.dispose);

      await container.read(notificationSettingsProvider.future);
      await container
          .read(notificationSettingsProvider.notifier)
          .setPushNotifications(false);

      expect(repository.unregisteredTokens, ['token-a']);
      expect(
        (await SharedPreferences.getInstance()).getBool(
          'settings_push_notifications',
        ),
        isFalse,
      );
    });

    test('push toggle restores the previous value when sync fails', () async {
      SharedPreferences.setMockInitialValues({
        'settings_push_notifications': true,
      });
      final messaging = _FakePushMessagingClient(initialToken: 'token-a');
      final repository = _FakeFeedRepository()
        ..unregisterFailure = const ServerFailure('unregister failed');
      final service = PushNotificationService(
        feedRepository: repository,
        messagingClient: messaging,
        localNotificationsInitializer: () async {},
      );
      addTearDown(service.dispose);
      await service.initialize();

      final container = ProviderContainer(
        overrides: [pushNotificationServiceProvider.overrideWithValue(service)],
      );
      addTearDown(container.dispose);

      await container.read(notificationSettingsProvider.future);
      await expectLater(
        container
            .read(notificationSettingsProvider.notifier)
            .setPushNotifications(false),
        throwsA(isA<Exception>()),
      );

      expect(container.read(notificationSettingsProvider).value, isTrue);
      expect(
        (await SharedPreferences.getInstance()).getBool(
          'settings_push_notifications',
        ),
        isTrue,
      );
    });
  });
}

class _FakePushMessagingClient implements PushMessagingClient {
  _FakePushMessagingClient({this.initialToken});

  final String? initialToken;
  final tokenRefreshController = StreamController<String>.broadcast();
  final foregroundController = StreamController<RemoteMessage>.broadcast();
  final openedController = StreamController<RemoteMessage>.broadcast();

  @override
  Future<bool> ensureInitialized() async => true;

  @override
  void registerBackgroundHandler() {}

  @override
  Future<AuthorizationStatus> requestPermission() async {
    return AuthorizationStatus.authorized;
  }

  @override
  Future<String?> getToken() async => initialToken;

  @override
  Stream<String> get onTokenRefresh => tokenRefreshController.stream;

  @override
  Stream<RemoteMessage> get onMessage => foregroundController.stream;

  @override
  Stream<RemoteMessage> get onMessageOpenedApp => openedController.stream;

  @override
  Future<RemoteMessage?> getInitialMessage() async => null;
}

class _FakeFeedRepository extends FeedRepository {
  _FakeFeedRepository()
    : super(dioClient: DioClient(secureStorage: const FlutterSecureStorage()));

  final registeredTokens = <String>[];
  final unregisteredTokens = <String>[];
  final registrationResults = <Either<Failure, void>>[];
  Failure? unregisterFailure;
  _DelayedRegistration? _delayedRegistration;

  _DelayedRegistration delayNextRegistration() {
    final delayed = _DelayedRegistration();
    _delayedRegistration = delayed;
    return delayed;
  }

  @override
  Future<Either<Failure, void>> registerDeviceToken(
    String token,
    String platform,
  ) async {
    registeredTokens.add(token);
    final delayed = _delayedRegistration;
    if (delayed != null) {
      _delayedRegistration = null;
      delayed.entered.complete();
      return delayed.release.future;
    }
    if (registrationResults.isNotEmpty) {
      return registrationResults.removeAt(0);
    }
    return const Right(null);
  }

  @override
  Future<Either<Failure, void>> unregisterDeviceToken(String token) async {
    unregisteredTokens.add(token);
    final failure = unregisterFailure;
    if (failure != null) return Left(failure);
    return const Right(null);
  }
}

class _DelayedRegistration {
  final entered = Completer<void>();
  final release = Completer<Either<Failure, void>>();
}
