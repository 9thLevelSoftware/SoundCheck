/// Accessibility utilities for generating semantic labels.
///
/// Provides consistent, screen-reader-friendly descriptions for UI elements
/// throughout the app. All functions return strings suitable for use with
/// [Semantics.label] or [Semantics.hint].
library;

/// Generates semantic label for check-in action.
///
/// Example: "Check in at Rock Festival at Madison Square Garden"
String checkInSemantics({
  required String? eventName,
  required String? venueName,
}) {
  if (eventName != null && venueName != null) {
    return 'Check in at $eventName at $venueName';
  } else if (eventName != null) {
    return 'Check in at $eventName';
  } else if (venueName != null) {
    return 'Check in at $venueName';
  }
  return 'Check in';
}

/// Generates semantic label for feed card.
///
/// Example: "Check-in by John at Rock Festival"
String feedCardSemantics({
  required String username,
  required String? eventName,
  required String? venueName,
}) {
  if (eventName != null) {
    return 'Check-in by $username at $eventName';
  } else if (venueName != null) {
    return 'Check-in by $username at $venueName';
  }
  return 'Check-in by $username';
}

/// Generates semantic label for badge.
///
/// Example: "First Timer badge, earned" or "Roadie badge, 3 of 10 shows"
String badgeSemantics({
  required String badgeName,
  required bool isEarned,
  int? progress,
  int? total,
}) {
  if (isEarned) {
    return '$badgeName badge, earned';
  } else if (progress != null && total != null) {
    return '$badgeName badge, $progress of $total shows';
  }
  return '$badgeName badge, not yet earned';
}

/// Generates semantic label for event card.
///
/// Example: "Rock Festival at Madison Square Garden on January 15"
String eventCardSemantics({
  required String eventName,
  required String? venueName,
  required String? dateString,
}) {
  final parts = <String>[eventName];
  if (venueName != null) {
    parts.add('at $venueName');
  }
  if (dateString != null) {
    parts.add('on $dateString');
  }
  return parts.join(' ');
}

/// Generates semantic label for user stats.
///
/// Example: "25 shows attended, 18 unique bands"
String userStatsSemantics({
  required int showsAttended,
  required int uniqueBands,
}) {
  return '$showsAttended shows attended, $uniqueBands unique bands';
}

/// Generates semantic label for toast/reaction button.
///
/// Example: "Send toast reaction" or "Remove toast reaction"
String toastButtonSemantics({required bool hasToasted}) {
  return hasToasted ? 'Remove toast reaction' : 'Send toast reaction';
}

/// Generates semantic label for comments button.
///
/// Example: "View 5 comments" or "No comments yet"
String commentsButtonSemantics({required int commentCount}) {
  if (commentCount == 0) {
    return 'No comments yet, tap to add comment';
  } else if (commentCount == 1) {
    return 'View 1 comment';
  }
  return 'View $commentCount comments';
}

/// Generates semantic label for happening now section.
///
/// Example: "Live: John at Rock Festival"
String happeningNowSemantics({
  required String username,
  required String? eventName,
}) {
  if (eventName != null) {
    return 'Live: $username at $eventName';
  }
  return 'Live: $username checked in now';
}

/// Generates semantic label for genre filter chip.
///
/// Example: "Rock genre filter, selected" or "Jazz genre filter"
String genreFilterSemantics({
  required String genreName,
  required bool isSelected,
}) {
  if (isSelected) {
    return '$genreName genre filter, selected';
  }
  return '$genreName genre filter';
}

/// Generates semantic label for settings toggle.
///
/// Example: "Push notifications, enabled" or "Dark mode, disabled"
String settingsToggleSemantics({
  required String settingName,
  required bool isEnabled,
}) {
  return '$settingName, ${isEnabled ? 'enabled' : 'disabled'}';
}

/// Generates semantic label for photo upload action.
String photoUploadSemantics() => 'Add photo to check-in';

/// Generates semantic label for submit check-in button.
String submitCheckinSemantics() => 'Submit check-in';

/// Generates semantic label for search field.
String searchFieldSemantics() => 'Search events, bands, venues';

/// Generates semantic label for nearby section.
String nearbySectionSemantics() => 'Shows near you';
