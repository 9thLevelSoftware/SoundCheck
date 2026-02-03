import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../features/feed/data/feed_repository.dart';
import 'log_service.dart';

/// Top-level background handler (must be top-level function, not a method)
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  LogService.i('Background message received: ${message.messageId}');
}

/// Service for managing push notifications via Firebase Cloud Messaging
/// and displaying foreground notifications via flutter_local_notifications
class PushNotificationService {
  final FeedRepository? _feedRepository;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  String? _currentToken;

  /// Whether push notifications have been initialized
  bool get isInitialized => _currentToken != null;

  /// Current FCM device token
  String? get currentToken => _currentToken;

  PushNotificationService({FeedRepository? feedRepository})
      : _feedRepository = feedRepository;

  /// Initialize push notification service
  /// Requests permission, gets FCM token, sets up handlers
  Future<void> initialize() async {
    try {
      // Set background message handler
      FirebaseMessaging.onBackgroundMessage(
          firebaseMessagingBackgroundHandler);

      // Request notification permission
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        LogService.w('Push notification permission denied');
        return;
      }

      LogService.i(
          'Push notification permission: ${settings.authorizationStatus}');

      // Initialize local notifications for foreground display
      await _initializeLocalNotifications();

      // Get FCM token
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        _currentToken = token;
        await _sendTokenToBackend(token);
        LogService.i('FCM token obtained: ${token.substring(0, 20)}...');
      }

      // Listen for token refresh
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
        _currentToken = newToken;
        await _sendTokenToBackend(newToken);
        LogService.i('FCM token refreshed');
      });

      // Handle foreground messages -- show local notification
      FirebaseMessaging.onMessage.listen(_showLocalNotification);

      // Handle notification tap when app is in background
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

      // Handle notification tap when app was terminated
      final initialMessage =
          await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }
    } catch (e, stack) {
      LogService.e('Failed to initialize push notifications', e, stack);
    }
  }

  /// Initialize flutter_local_notifications plugin
  Future<void> _initializeLocalNotifications() async {
    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (response) {
        // Handle notification tap from local notifications
        LogService.d('Local notification tapped: ${response.payload}');
      },
    );

    // Create Android notification channel
    const androidChannel = AndroidNotificationChannel(
      'soundcheck_feed',
      'Feed Updates',
      description: 'Notifications for friend check-ins and activity',
      importance: Importance.high,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(androidChannel);
  }

  /// Show local notification when a message arrives in foreground
  Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    const androidDetails = AndroidNotificationDetails(
      'soundcheck_feed',
      'Feed Updates',
      channelDescription: 'Notifications for friend check-ins and activity',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: details,
      payload: message.data['checkinId'],
    );
  }

  /// Handle notification tap to navigate to relevant screen
  void _handleNotificationTap(RemoteMessage message) {
    LogService.d('Notification tapped: ${message.data}');
    // Navigation will be handled by the app's router based on message data
    // The app scaffold can listen to a stream of tapped notifications
  }

  /// Send FCM token to backend for push notification targeting
  Future<void> _sendTokenToBackend(String token) async {
    try {
      final platform = Platform.isIOS ? 'ios' : 'android';
      await _feedRepository?.registerDeviceToken(token, platform);
    } catch (e) {
      LogService.e('Failed to send FCM token to backend', e);
      // Non-fatal: token registration failure shouldn't block app usage
    }
  }
}
