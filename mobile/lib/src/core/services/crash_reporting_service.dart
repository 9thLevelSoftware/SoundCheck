/// Crash Reporting Service using Sentry
///
/// SETUP INSTRUCTIONS:
/// 1. Create account at sentry.io
/// 2. Create new Flutter project
/// 3. Copy DSN from project settings
/// 4. Add to pubspec.yaml: sentry_flutter: ^7.18.0
/// 5. Set DSN in .env or use --dart-define=SENTRY_DSN=your_dsn
/// 6. Uncomment implementation code below
///
/// USAGE:
/// import 'package:pitpulse_flutter/src/core/services/crash_reporting_service.dart';
///
/// // In main.dart
/// await CrashReportingService.init();
/// CrashReportingService.runApp(() => runApp(MyApp()));
///
/// // To report errors
/// CrashReportingService.captureException(error, stackTrace);
/// CrashReportingService.captureMessage('Something went wrong');
library;

import 'package:flutter/foundation.dart';
// NOTE: Uncomment when sentry_flutter is added to pubspec.yaml
// import 'package:sentry_flutter/sentry_flutter.dart';

class CrashReportingService {
  static const String _sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );

  /// Initialize Sentry crash reporting
  static Future<void> init() async {
    if (_sentryDsn.isEmpty) {
      if (kReleaseMode) {
        debugPrint('WARNING: SENTRY_DSN not configured. Crash reporting disabled.');
      }
      return;
    }

    // NOTE: Uncomment when sentry_flutter is installed
    /*
    await SentryFlutter.init(
      (options) {
        options.dsn = _sentryDsn;

        // Environment
        options.environment = kReleaseMode ? 'production' : 'development';

        // Performance monitoring
        options.tracesSampleRate = kReleaseMode ? 0.1 : 1.0;

        // Debug mode
        options.debug = kDebugMode;

        // Release tracking
        options.release = 'pitpulse@1.0.0'; // Update with actual version

        // Ignore common Flutter errors
        options.beforeSend = (event, {hint}) {
          // Filter out non-critical errors
          if (event.message?.formatted?.contains('setState') ?? false) {
            return null; // Don't report setState errors
          }
          return event;
        };

        // Attach screenshots on errors (mobile only)
        options.attachScreenshot = true;

        // Attach view hierarchy
        options.attachViewHierarchy = true;
      },
    );

    debugPrint('✅ Sentry crash reporting initialized');
    */
  }

  /// Run app with Sentry error handling
  static Future<void> runApp(Function() appRunner) async {
    if (_sentryDsn.isEmpty) {
      appRunner();
      return;
    }

    // NOTE: Uncomment when sentry_flutter is installed
    /*
    await SentryFlutter.init(
      (options) => options.dsn = _sentryDsn,
      appRunner: appRunner,
    );
    */

    appRunner();
  }

  /// Capture an exception with stack trace
  static Future<void> captureException(
    dynamic exception,
    StackTrace? stackTrace, {
    String? userId,
    String? userEmail,
    Map<String, dynamic>? extra,
  }) async {
    if (_sentryDsn.isEmpty) {
      debugPrint('Exception (Sentry not configured): $exception');
      debugPrint('Stack trace: $stackTrace');
      return;
    }

    // NOTE: Uncomment when sentry_flutter is installed
    /*
    await Sentry.captureException(
      exception,
      stackTrace: stackTrace,
      withScope: (scope) {
        if (userId != null || userEmail != null) {
          scope.setUser(SentryUser(
            id: userId,
            email: userEmail,
          ));
        }
        if (extra != null) {
          extra.forEach((key, value) {
            scope.setExtra(key, value);
          });
        }
      },
    );
    */
  }

  /// Capture a message
  static Future<void> captureMessage(
    String message, {
    SentryLevel level = SentryLevel.info,
    Map<String, dynamic>? extra,
  }) async {
    if (_sentryDsn.isEmpty) {
      debugPrint('Message (Sentry not configured): $message');
      return;
    }

    // NOTE: Uncomment when sentry_flutter is installed
    /*
    await Sentry.captureMessage(
      message,
      level: level,
      withScope: (scope) {
        if (extra != null) {
          extra.forEach((key, value) {
            scope.setExtra(key, value);
          });
        }
      },
    );
    */
  }

  /// Set user context
  static void setUser({
    required String id,
    String? email,
    String? username,
  }) {
    if (_sentryDsn.isEmpty) return;

    // NOTE: Uncomment when sentry_flutter is installed
    /*
    Sentry.configureScope((scope) {
      scope.setUser(SentryUser(
        id: id,
        email: email,
        username: username,
      ));
    });
    */
  }

  /// Clear user context (e.g., on logout)
  static void clearUser() {
    if (_sentryDsn.isEmpty) return;

    // NOTE: Uncomment when sentry_flutter is installed
    // Sentry.configureScope((scope) => scope.setUser(null));
  }

  /// Add breadcrumb for debugging
  static void addBreadcrumb({
    required String message,
    String? category,
    Map<String, dynamic>? data,
  }) {
    if (_sentryDsn.isEmpty) return;

    // NOTE: Uncomment when sentry_flutter is installed
    /*
    Sentry.addBreadcrumb(Breadcrumb(
      message: message,
      category: category,
      data: data,
      timestamp: DateTime.now(),
    ));
    */
  }

  /// Close Sentry and flush pending events
  static Future<void> close() async {
    if (_sentryDsn.isEmpty) return;

    // NOTE: Uncomment when sentry_flutter is installed
    // await Sentry.close();
  }
}

/// Sentry severity levels
enum SentryLevel {
  debug,
  info,
  warning,
  error,
  fatal,
}
