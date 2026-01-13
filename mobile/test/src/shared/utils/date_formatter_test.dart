import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/utils/date_formatter.dart';

void main() {
  group('DateFormatter', () {
    group('formatDate', () {
      test('formats ISO date string correctly', () {
        final result = DateFormatter.formatDate('2024-01-15T14:30:00Z');
        expect(result, 'Jan 15, 2024');
      });

      test('returns original string for invalid date', () {
        final result = DateFormatter.formatDate('invalid-date');
        expect(result, 'invalid-date');
      });
    });

    group('formatDateTime', () {
      test('formats ISO datetime string correctly', () {
        final result = DateFormatter.formatDateTime('2024-01-15T14:30:00Z');
        // Note: This test may vary based on timezone
        expect(result, contains('Jan 15, 2024'));
      });

      test('returns original string for invalid datetime', () {
        final result = DateFormatter.formatDateTime('invalid-date');
        expect(result, 'invalid-date');
      });
    });

    group('formatRelativeTime', () {
      test('returns "just now" for very recent times', () {
        final now = DateTime.now();
        final recentTime = now.subtract(const Duration(seconds: 30));
        final result = DateFormatter.formatRelativeTime(recentTime.toIso8601String());
        expect(result, 'just now');
      });

      test('returns minutes for times within an hour', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(minutes: 45));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '45 minutes ago');
      });

      test('returns "1 minute ago" for singular minute', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(minutes: 1, seconds: 30));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '1 minute ago');
      });

      test('returns hours for times within a day', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(hours: 5));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '5 hours ago');
      });

      test('returns "1 hour ago" for singular hour', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(hours: 1, minutes: 30));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '1 hour ago');
      });

      test('returns days for times within a week', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(days: 3));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '3 days ago');
      });

      test('returns "1 day ago" for singular day', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(days: 1));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '1 day ago');
      });

      test('returns weeks for times within a month', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(days: 14));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '2 weeks ago');
      });

      test('returns months for times within a year', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(days: 90));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '3 months ago');
      });

      test('returns years for times over a year', () {
        final now = DateTime.now();
        final timeAgo = now.subtract(const Duration(days: 400));
        final result = DateFormatter.formatRelativeTime(timeAgo.toIso8601String());
        expect(result, '1 year ago');
      });

      test('returns original string for invalid date', () {
        final result = DateFormatter.formatRelativeTime('invalid-date');
        expect(result, 'invalid-date');
      });
    });
  });
}
