import 'package:flutter/foundation.dart';

/// Service for handling application logging
/// Replaces direct print/debugPrint calls
class LogService {
  static const String _tag = '[SoundCheck]';

  static void i(String message) {
    if (kDebugMode) {
      debugPrint('$_tag ℹ️ $message');
    }
  }

  static void d(String message) {
    if (kDebugMode) {
      debugPrint('$_tag 🐛 $message');
    }
  }

  static void w(String message) {
    if (kDebugMode) {
      debugPrint('$_tag ⚠️ $message');
    }
  }

  static void e(String message, [dynamic error, StackTrace? stackTrace]) {
    if (kDebugMode) {
      debugPrint('$_tag ❌ $message');
      if (error != null) debugPrint('Error: $error');
      if (stackTrace != null) debugPrint('Stack: $stackTrace');
    }
    // TODO: Integrate with Crashlytics/Sentry here
  }
}
