/// Analytics Service for tracking user events and behavior
///
/// Uses Firebase Analytics for mobile app analytics.
///
/// USAGE:
/// import 'package:soundcheck_flutter/src/core/services/analytics_service.dart';
///
/// // In main.dart
/// await AnalyticsService.initialize();
///
/// // Track events
/// AnalyticsService.logEvent(name: 'venue_viewed', parameters: {'venue_id': '123'});
/// AnalyticsService.logScreenView('VenueDetailScreen');
/// AnalyticsService.setUserProperty(name: 'plan', value: 'premium');
library;

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class AnalyticsService {
  static FirebaseAnalytics? _analytics;
  static FirebaseAnalyticsObserver? _observer;
  static bool _initialized = false;

  /// Initialize Firebase Analytics
  static Future<void> initialize() async {
    if (_initialized) return;

    try {
      await Firebase.initializeApp();
      _analytics = FirebaseAnalytics.instance;
      _observer = FirebaseAnalyticsObserver(analytics: _analytics!);
      _initialized = true;
      debugPrint('Analytics initialized');
    } catch (e) {
      debugPrint('Analytics initialization failed: $e');
      _initialized = true; // Mark as initialized to prevent retry loops
    }
  }

  /// Get the analytics observer for automatic screen tracking in GoRouter
  static FirebaseAnalyticsObserver? get observer => _observer;

  /// Check if analytics is properly initialized
  static bool get isInitialized => _initialized && _analytics != null;

  /// Log a custom event
  static Future<void> logEvent({
    required String name,
    Map<String, Object>? parameters,
  }) async {
    if (!_initialized || _analytics == null) {
      debugPrint('Analytics (not initialized): $name - $parameters');
      return;
    }
    await _analytics!.logEvent(name: name, parameters: parameters);
  }

  /// Set the user ID for analytics
  static Future<void> setUserId(String userId) async {
    if (!_initialized || _analytics == null) return;
    await _analytics!.setUserId(id: userId);
  }

  /// Clear the user ID (on logout)
  static Future<void> clearUserId() async {
    if (!_initialized || _analytics == null) return;
    await _analytics!.setUserId(id: null);
  }

  /// Set a user property
  static Future<void> setUserProperty({
    required String name,
    required String value,
  }) async {
    if (!_initialized || _analytics == null) return;
    await _analytics!.setUserProperty(name: name, value: value);
  }

  /// Log a screen view
  static Future<void> logScreenView(String screenName) async {
    if (!_initialized || _analytics == null) {
      debugPrint('Analytics (not initialized): screen_view - $screenName');
      return;
    }
    await _analytics!.logScreenView(screenName: screenName);
  }

  // ============ Standard Events ============

  /// Log user login
  static Future<void> logLogin(String method) async {
    await logEvent(name: 'login', parameters: {'method': method});
  }

  /// Log user sign up
  static Future<void> logSignUp(String method) async {
    await logEvent(name: 'sign_up', parameters: {'method': method});
  }

  /// Log user logout
  static Future<void> logLogout() async {
    await logEvent(name: 'logout');
    await clearUserId();
  }

  /// Log a check-in event
  static Future<void> logCheckin({
    required String venueId,
    String? bandId,
    int? rating,
  }) async {
    await logEvent(name: 'checkin', parameters: {
      'venue_id': venueId,
      if (bandId != null) 'band_id': bandId,
      if (rating != null) 'rating': rating,
    },);
  }

  /// Log a search event
  static Future<void> logSearch(String query) async {
    await logEvent(name: 'search', parameters: {'search_term': query});
  }

  /// Log venue view
  static Future<void> logVenueView(String venueId, {String? venueName}) async {
    await logEvent(name: 'venue_viewed', parameters: {
      'venue_id': venueId,
      if (venueName != null) 'venue_name': venueName,
    },);
  }

  /// Log band view
  static Future<void> logBandView(String bandId, {String? bandName}) async {
    await logEvent(name: 'band_viewed', parameters: {
      'band_id': bandId,
      if (bandName != null) 'band_name': bandName,
    },);
  }

  /// Log follow action
  static Future<void> logFollow({
    required String targetType,
    required String targetId,
  }) async {
    await logEvent(name: 'follow', parameters: {
      'target_type': targetType,
      'target_id': targetId,
    },);
  }

  /// Log unfollow action
  static Future<void> logUnfollow({
    required String targetType,
    required String targetId,
  }) async {
    await logEvent(name: 'unfollow', parameters: {
      'target_type': targetType,
      'target_id': targetId,
    },);
  }

  /// Log content share
  static Future<void> logShare({
    required String contentType,
    required String itemId,
  }) async {
    await logEvent(name: 'share', parameters: {
      'content_type': contentType,
      'item_id': itemId,
    },);
  }

  /// Log error occurrence
  static Future<void> logError({
    required String errorType,
    String? errorMessage,
    String? errorCode,
  }) async {
    await logEvent(name: 'app_error', parameters: {
      'error_type': errorType,
      if (errorMessage != null) 'error_message': errorMessage,
      if (errorCode != null) 'error_code': errorCode,
    },);
  }
}

/// Common event names for consistency
class AnalyticsEvents {
  // Authentication
  static const String login = 'login';
  static const String register = 'sign_up';
  static const String logout = 'logout';

  // Venues
  static const String venueViewed = 'venue_viewed';
  static const String venueSearched = 'venue_searched';
  static const String venueFavorited = 'venue_favorited';
  static const String venueUnfavorited = 'venue_unfavorited';

  // Bands
  static const String bandViewed = 'band_viewed';
  static const String bandSearched = 'band_searched';
  static const String bandFollowed = 'band_followed';
  static const String bandUnfollowed = 'band_unfollowed';

  // Reviews
  static const String reviewCreated = 'review_created';
  static const String reviewUpdated = 'review_updated';
  static const String reviewDeleted = 'review_deleted';
  static const String reviewLiked = 'review_liked';
  static const String reviewUnliked = 'review_unliked';

  // Check-ins
  static const String checkinCreated = 'checkin';
  static const String checkinDeleted = 'checkin_deleted';

  // Social
  static const String userFollowed = 'follow';
  static const String userUnfollowed = 'unfollow';
  static const String profileViewed = 'profile_viewed';

  // Engagement
  static const String shareContent = 'share';
  static const String searchPerformed = 'search';
  static const String filterApplied = 'filter_applied';
  static const String sortApplied = 'sort_applied';

  // Errors
  static const String errorOccurred = 'app_error';
  static const String apiError = 'api_error';
}

/// Common property names for consistency
class AnalyticsProperties {
  static const String venueId = 'venue_id';
  static const String venueName = 'venue_name';
  static const String bandId = 'band_id';
  static const String bandName = 'band_name';
  static const String reviewId = 'review_id';
  static const String rating = 'rating';
  static const String searchQuery = 'search_term';
  static const String filterType = 'filter_type';
  static const String sortBy = 'sort_by';
  static const String errorMessage = 'error_message';
  static const String errorCode = 'error_code';
  static const String userId = 'user_id';
  static const String screenName = 'screen_name';
  static const String source = 'source';
  static const String contentType = 'content_type';
  static const String itemId = 'item_id';
  static const String method = 'method';
}
