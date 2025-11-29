/// Analytics Service for tracking user events and behavior
///
/// Supports multiple analytics providers:
/// - Mixpanel (recommended for user analytics)
/// - Amplitude (good for product analytics)
/// - Google Analytics (good for web conversion tracking)
/// - Firebase Analytics (good for mobile app analytics)
///
/// SETUP INSTRUCTIONS:
/// 1. Choose analytics provider (Mixpanel recommended)
/// 2. Create project and get API key
/// 3. Add to pubspec.yaml: mixpanel_flutter: ^2.2.0 (or your choice)
/// 4. Set API_KEY via --dart-define=MIXPANEL_TOKEN=your_token
/// 5. Uncomment implementation code below
///
/// USAGE:
/// import 'package:pitpulse_flutter/src/core/services/analytics_service.dart';
///
/// // In main.dart
/// await AnalyticsService.init();
///
/// // Track events
/// AnalyticsService.trackEvent('venue_viewed', {'venue_id': '123'});
/// AnalyticsService.trackScreen('VenueDetailScreen');
/// AnalyticsService.setUserProperties({'plan': 'premium'});
library;

import 'package:flutter/foundation.dart';
// NOTE: Uncomment when mixpanel_flutter is added to pubspec.yaml
// import 'package:mixpanel_flutter/mixpanel_flutter.dart';

class AnalyticsService {
  // static Mixpanel? _mixpanel;

  static const String _mixpanelToken = String.fromEnvironment(
    'MIXPANEL_TOKEN',
    defaultValue: '',
  );

  static bool _initialized = false;

  /// Initialize analytics
  static Future<void> init() async {
    if (_initialized) return;

    if (_mixpanelToken.isEmpty) {
      if (kReleaseMode) {
        debugPrint('WARNING: MIXPANEL_TOKEN not configured. Analytics disabled.');
      }
      _initialized = true;
      return;
    }

    // NOTE: Uncomment when mixpanel_flutter is installed
    /*
    _mixpanel = await Mixpanel.init(
      _mixpanelToken,
      trackAutomaticEvents: true,
    );

    debugPrint('✅ Analytics initialized (Mixpanel)');
    */

    _initialized = true;
  }

  /// Track a custom event
  static void trackEvent(String eventName, [Map<String, dynamic>? properties]) {
    if (!_initialized || _mixpanelToken.isEmpty) {
      debugPrint('Analytics (not configured): $eventName - $properties');
      return;
    }

    // NOTE: Uncomment when mixpanel_flutter is installed
    // _mixpanel?.track(eventName, properties: properties);
  }

  /// Track screen view
  static void trackScreen(String screenName, [Map<String, dynamic>? properties]) {
    trackEvent('screen_viewed', {
      'screen_name': screenName,
      ...?properties,
    });
  }

  /// Identify user
  static void identifyUser(String userId, {
    String? email,
    String? username,
  }) {
    if (!_initialized || _mixpanelToken.isEmpty) return;

    // NOTE: Uncomment when mixpanel_flutter is installed
    /*
    _mixpanel?.identify(userId);

    if (email != null) {
      _mixpanel?.getPeople().set('\$email', email);
    }
    if (username != null) {
      _mixpanel?.getPeople().set('\$name', username);
    }
    */
  }

  /// Set user properties
  static void setUserProperties(Map<String, dynamic> properties) {
    if (!_initialized || _mixpanelToken.isEmpty) return;

    // NOTE: Uncomment when mixpanel_flutter is installed
    /*
    properties.forEach((key, value) {
      _mixpanel?.getPeople().set(key, value);
    });
    */
  }

  /// Increment user property
  static void incrementProperty(String property, [double by = 1]) {
    if (!_initialized || _mixpanelToken.isEmpty) return;

    // NOTE: Uncomment when mixpanel_flutter is installed
    // _mixpanel?.getPeople().increment(property, by);
  }

  /// Track revenue
  static void trackRevenue(double amount, {Map<String, dynamic>? properties}) {
    if (!_initialized || _mixpanelToken.isEmpty) return;

    // NOTE: Uncomment when mixpanel_flutter is installed
    // _mixpanel?.getPeople().trackCharge(amount, properties: properties);
  }

  /// Reset user (logout)
  static void reset() {
    if (!_initialized || _mixpanelToken.isEmpty) return;

    // NOTE: Uncomment when mixpanel_flutter is installed
    // _mixpanel?.reset();
  }

  /// Flush pending events
  static void flush() {
    if (!_initialized || _mixpanelToken.isEmpty) return;

    // NOTE: Uncomment when mixpanel_flutter is installed
    // _mixpanel?.flush();
  }
}

/// Common event names for consistency
class AnalyticsEvents {
  // Authentication
  static const String login = 'user_logged_in';
  static const String register = 'user_registered';
  static const String logout = 'user_logged_out';

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
  static const String checkinCreated = 'checkin_created';
  static const String checkinDeleted = 'checkin_deleted';

  // Social
  static const String userFollowed = 'user_followed';
  static const String userUnfollowed = 'user_unfollowed';
  static const String profileViewed = 'profile_viewed';

  // Engagement
  static const String shareContent = 'content_shared';
  static const String searchPerformed = 'search_performed';
  static const String filterApplied = 'filter_applied';
  static const String sortApplied = 'sort_applied';

  // Errors
  static const String errorOccurred = 'error_occurred';
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
  static const String searchQuery = 'search_query';
  static const String filterType = 'filter_type';
  static const String sortBy = 'sort_by';
  static const String errorMessage = 'error_message';
  static const String errorCode = 'error_code';
  static const String userId = 'user_id';
  static const String screenName = 'screen_name';
  static const String source = 'source';
}
