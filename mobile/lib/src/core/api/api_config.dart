import 'dart:io' show Platform;

/// API Configuration with environment-based URL switching
///
/// To set environment:
/// - Development: flutter run --dart-define=ENVIRONMENT=dev
/// - Staging: flutter run --dart-define=ENVIRONMENT=staging
/// - Production: flutter run (default) or --dart-define=ENVIRONMENT=prod
class ApiConfig {
  ApiConfig._();

  // Environment detection
  static const String _environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'prod',
  );

  // Base URLs per environment
  static const String _stagingBaseUrl = 'https://soundcheck-staging.railway.app/api';
  static const String _prodBaseUrl = 'https://soundcheck-app.up.railway.app/api';

  // Development base URL - platform-aware
  static String get _devBaseUrl {
    if (Platform.isAndroid) {
      // Android emulator uses 10.0.2.2 to reach host machine
      return 'http://10.0.2.2:3000/api';
    } else if (Platform.isIOS) {
      // iOS simulator can use localhost
      return 'http://localhost:3000/api';
    }
    // Fallback for other platforms (web, desktop)
    return 'http://localhost:3000/api';
  }

  // Get base URL based on environment
  static String get baseUrl {
    switch (_environment) {
      case 'dev':
        return _devBaseUrl;
      case 'staging':
        return _stagingBaseUrl;
      case 'prod':
      default:
        return _prodBaseUrl;
    }
  }

  // WebSocket base URL for real-time features
  static String get wsBaseUrl {
    if (_environment == 'prod') {
      return 'wss://soundcheck-app.up.railway.app';
    } else if (_environment == 'staging') {
      return 'wss://soundcheck-staging.railway.app';
    }

    // Development WebSocket URL - platform-aware
    if (Platform.isAndroid) {
      return 'ws://10.0.2.2:3000';
    }
    return 'ws://localhost:3000';
  }

  // Environment helpers
  static bool get isDev => _environment == 'dev';
  static bool get isStaging => _environment == 'staging';
  static bool get isProd => _environment == 'prod' || _environment.isEmpty;

  // Timeouts
  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);
  static const Duration sendTimeout = Duration(seconds: 30);

  // Endpoints
  static const String auth = '/users';
  static const String venues = '/venues';
  static const String bands = '/bands';
  static const String badges = '/badges';
  static const String checkins = '/checkins';
  static const String toasts = '/toasts';
  static const String events = '/events';
  static const String nearbyEvents = '/events/nearby';
  static const String shows = '/shows';
  static const String notifications = '/notifications';
  static const String feed = '/checkins/feed';

  // Dynamic endpoints
  static String concertCred(String userId) => '/users/$userId/concert-cred';

  // Storage Keys
  static const String tokenKey = 'auth_token';
  static const String userKey = 'user_data';
}
