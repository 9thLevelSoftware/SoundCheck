import 'package:flutter/services.dart';
import 'package:vibration/vibration.dart';

/// Haptic feedback utility for providing tactile feedback to users
class HapticFeedbackUtil {
  HapticFeedbackUtil._();

  /// Light impact feedback for subtle interactions like selections
  static Future<void> lightImpact() async {
    try {
      await HapticFeedback.lightImpact();
    } catch (e) {
      // Silently fail if haptics not supported
    }
  }

  /// Medium impact feedback for standard interactions like button presses
  static Future<void> mediumImpact() async {
    try {
      await HapticFeedback.mediumImpact();
    } catch (e) {
      // Silently fail if haptics not supported
    }
  }

  /// Heavy impact feedback for significant interactions
  static Future<void> heavyImpact() async {
    try {
      await HapticFeedback.heavyImpact();
    } catch (e) {
      // Silently fail if haptics not supported
    }
  }

  /// Selection feedback for picker or slider changes
  static Future<void> selectionClick() async {
    try {
      await HapticFeedback.selectionClick();
    } catch (e) {
      // Silently fail if haptics not supported
    }
  }

  /// Vibration feedback for errors or important notifications
  static Future<void> errorVibration() async {
    try {
      if (await Vibration.hasVibrator()) {
        await Vibration.vibrate(duration: 200, pattern: [0, 100, 50, 100]);
      }
    } catch (e) {
      // Silently fail if vibration not supported
    }
  }

  /// Success feedback for successful operations
  static Future<void> successVibration() async {
    try {
      if (await Vibration.hasVibrator()) {
        await Vibration.vibrate(duration: 50);
      }
    } catch (e) {
      // Silently fail if vibration not supported
    }
  }
}
