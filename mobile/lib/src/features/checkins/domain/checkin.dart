import 'package:freezed_annotation/freezed_annotation.dart';
import '../../auth/domain/user.dart';
import 'vibe_tag.dart';

part 'checkin.freezed.dart';
part 'checkin.g.dart';

/// CheckIn - The core entity of SoundCheck
/// A user checking in to a specific Band at a specific Venue at a specific Time
@freezed
sealed class CheckIn with _$CheckIn {
  const CheckIn._();

  const factory CheckIn({
    required String id,
    required String userId,
    required String createdAt,
    required String updatedAt,
    @Default(0) int toastCount,
    @Default(0) int commentCount,
    // Rating fields - backend sends separate venue and band ratings
    double? venueRating,
    double? bandRating,
    // Check-in note text
    String? noteText,
    // Image URLs (backend sends array)
    List<String>? imageUrls,
    // Event ID for the check-in
    String? eventId,
    // Nested event data from backend
    CheckInEvent? event,
    // Populated user
    User? user,
    // Vibe tags (backend field name)
    List<VibeTag>? vibeTags,
    // Indicates if current user has toasted this check-in (backend field name)
    @Default(false) bool hasUserToasted,
    // Per-band ratings from event check-in
    List<CheckInBandRating>? bandRatings,
    // Badges earned from this check-in
    List<EarnedBadge>? earnedBadges,
    // Whether location was verified during check-in
    @Default(false) bool isVerified,
  }) = _CheckIn;

  factory CheckIn.fromJson(Map<String, dynamic> json) =>
      _$CheckInFromJson(json);

  /// Computed rating - average of venue and band ratings
  double get rating {
    final v = venueRating ?? 0;
    final b = bandRating ?? 0;
    if (v > 0 && b > 0) return (v + b) / 2;
    if (v > 0) return v;
    if (b > 0) return b;
    return 0;
  }

  /// Get bandId from nested event structure
  String? get bandId => event?.band?.id;

  /// Get venueId from nested event structure
  String? get venueId => event?.venue?.id;

  /// Get band info from nested event (simplified, not full Band object)
  CheckInBand? get band => event?.band;

  /// Get venue info from nested event (simplified, not full Venue object)
  CheckInVenue? get venue => event?.venue;

  /// Get event date from nested event
  String? get eventDate => event?.eventDate;

  /// Alias for backward compatibility
  bool get hasToasted => hasUserToasted;

  /// Alias for backward compatibility
  List<VibeTag>? get vibes => vibeTags;
}

/// Nested event data from backend check-in response
@freezed
sealed class CheckInEvent with _$CheckInEvent {
  const factory CheckInEvent({
    required String id,
    String? eventDate,
    String? eventName,
    CheckInVenue? venue,
    CheckInBand? band,
  }) = _CheckInEvent;

  factory CheckInEvent.fromJson(Map<String, dynamic> json) =>
      _$CheckInEventFromJson(json);
}

/// Simplified venue data nested in check-in event
@freezed
sealed class CheckInVenue with _$CheckInVenue {
  const factory CheckInVenue({
    required String id,
    required String name,
    String? city,
    String? state,
    String? imageUrl,
  }) = _CheckInVenue;

  factory CheckInVenue.fromJson(Map<String, dynamic> json) =>
      _$CheckInVenueFromJson(json);
}

/// Simplified band data nested in check-in event
@freezed
sealed class CheckInBand with _$CheckInBand {
  const factory CheckInBand({
    required String id,
    required String name,
    String? genre,
    String? imageUrl,
  }) = _CheckInBand;

  factory CheckInBand.fromJson(Map<String, dynamic> json) =>
      _$CheckInBandFromJson(json);
}

/// Badge earned from a check-in
@freezed
sealed class EarnedBadge with _$EarnedBadge {
  const factory EarnedBadge({
    required String id,
    required String name,
    String? description,
    String? iconUrl,
    String? color,
  }) = _EarnedBadge;

  factory EarnedBadge.fromJson(Map<String, dynamic> json) =>
      _$EarnedBadgeFromJson(json);
}

/// Per-band rating stored on a check-in
@freezed
sealed class CheckInBandRating with _$CheckInBandRating {
  const factory CheckInBandRating({
    required String bandId,
    required double rating,
    String? bandName,
  }) = _CheckInBandRating;

  factory CheckInBandRating.fromJson(Map<String, dynamic> json) =>
      _$CheckInBandRatingFromJson(json);
}

/// Check-in feed response with pagination
@freezed
sealed class CheckInFeed with _$CheckInFeed {
  const factory CheckInFeed({
    required List<CheckIn> checkins,
    required int total,
    required int page,
    required int limit,
    required bool hasMore,
  }) = _CheckInFeed;

  factory CheckInFeed.fromJson(Map<String, dynamic> json) =>
      _$CheckInFeedFromJson(json);
}
