import 'package:freezed_annotation/freezed_annotation.dart';
import '../../auth/domain/user.dart';
import '../../bands/domain/band.dart';
import '../../venues/domain/venue.dart';
import 'vibe_tag.dart';

part 'checkin.freezed.dart';
part 'checkin.g.dart';

/// CheckIn - The core entity of PitPulse
/// A user checking in to a specific Band at a specific Venue at a specific Time
@freezed
class CheckIn with _$CheckIn {
  const factory CheckIn({
    required String id,
    required String userId,
    required String bandId,
    required String venueId,
    required double rating,
    required String createdAt,
    required String updatedAt,
    required int toastCount,
    required int commentCount,
    String? comment,
    String? photoUrl,
    double? checkinLatitude,
    double? checkinLongitude,
    String? eventDate,
    // Populated fields
    User? user,
    Band? band,
    Venue? venue,
    List<VibeTag>? vibes,
    // Indicates if current user has toasted this check-in
    @Default(false) bool hasToasted,
    // Badges earned from this check-in
    List<EarnedBadge>? earnedBadges,
  }) = _CheckIn;

  factory CheckIn.fromJson(Map<String, dynamic> json) =>
      _$CheckInFromJson(json);
}

/// Request to create a new check-in
@freezed
class CreateCheckInRequest with _$CreateCheckInRequest {
  const factory CreateCheckInRequest({
    required String bandId,
    required String venueId,
    required double rating,
    String? comment,
    String? photoUrl,
    double? checkinLatitude,
    double? checkinLongitude,
    String? eventDate,
    List<String>? vibeTagIds,
  }) = _CreateCheckInRequest;

  factory CreateCheckInRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateCheckInRequestFromJson(json);
}

/// Badge earned from a check-in
@freezed
class EarnedBadge with _$EarnedBadge {
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

/// Check-in feed response with pagination
@freezed
class CheckInFeed with _$CheckInFeed {
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
