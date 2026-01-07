/// Crash Reporting Service using Sentry
///
/// Provides crash reporting and error tracking via Sentry.
/// Requires SENTRY_DSN to be set via --dart-define=SENTRY_DSN=your_dsn
///
/// USAGE:
/// import 'package:pitpulse_flutter/src/core/services/crash_reporting_service.dart';
///
/// // In main.dart
/// await CrashReportingService.init();
///
/// // To report errors
/// CrashReportingService.captureException(error, stackTrace);
/// CrashReportingService.captureMessage('Something went wrong');
library;

import 'package:flutter/foundation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

class CrashReportingService {
  static bool _initialized = false;

  static const String _sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );

  static const String _environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'development',
  );

  /// Initialize Sentry crash reporting
  static Future<void> init() async {
    if (_sentryDsn.isEmpty) {
      debugPrint('Sentry DSN not configured, crash reporting disabled');
      return;
    }

    await SentryFlutter.init(
      (options) {
        options.dsn = _sentryDsn;

        // Environment
        options.environment = _environment;

        // Performance monitoring - 10% in production, 100% in development
        options.tracesSampleRate = _environment == 'production' ? 0.1 : 1.0;

        // Debug mode
        options.debug = kDebugMode;

        // Auto session tracking
        options.enableAutoSessionTracking = true;

        // Attach screenshots on errors (mobile only)
        options.attachScreenshot = true;

        // Attach view hierarchy
        options.attachViewHierarchy = true;

        // Filter out non-critical errors
        options.beforeSend = (event, hint) {
          // Filter setState errors which are usually Flutter internals
          if (event.message?.formatted.contains('setState') ?? false) {
            return null;
          }
          return event;
        };
      },
    );

    _initialized = true;
    debugPrint('Sentry crash reporting initialized');
  }

  /// Capture an exception with stack trace
  static Future<void> captureException(
    dynamic exception,
    StackTrace? stackTrace, {
    Map<String, dynamic>? extra,
  }) async {
    if (!_initialized) {
      debugPrint('Exception (Sentry not configured): $exception');
      if (stackTrace != null) {
        debugPrint('Stack trace: $stackTrace');
      }
      return;
    }

    await Sentry.captureException(
      exception,
      stackTrace: stackTrace,
      withScope: (scope) {
        if (extra != null) {
          scope.setContexts('extra', extra);
        }
      },
    );
  }

  /// Capture a message
  static Future<void> captureMessage(
    String message, {
    SentryLevel level = SentryLevel.info,
    Map<String, dynamic>? extra,
  }) async {
    if (!_initialized) {
      debugPrint('Message (Sentry not configured): $message');
      return;
    }

    await Sentry.captureMessage(
      message,
      level: level,
      withScope: (scope) {
        if (extra != null) {
          scope.setContexts('extra', extra);
        }
      },
    );
  }

  /// Set user context for error tracking
  static void setUser(String userId, String? email) {
    if (!_initialized) return;

    Sentry.configureScope((scope) {
      scope.setUser(SentryUser(
        id: userId,
        email: email,
      ),);
    });
  }

  /// Clear user context (e.g., on logout)
  static void clearUser() {
    if (!_initialized) return;

    Sentry.configureScope((scope) {
      scope.setUser(null);
    });
  }

  /// Add breadcrumb for debugging
  static void addBreadcrumb({
    required String message,
    String? category,
    Map<String, dynamic>? data,
  }) {
    if (!_initialized) return;

    Sentry.addBreadcrumb(Breadcrumb(
      message: message,
      category: category,
      data: data,
      timestamp: DateTime.now(),
    ),);
  }

  /// Check if Sentry is initialized
  static bool get isInitialized => _initialized;

  /// Close Sentry and flush pending events
  static Future<void> close() async {
    if (!_initialized) return;

    await Sentry.close();
    _initialized = false;
  }
}
