import 'package:freezed_annotation/freezed_annotation.dart';

part 'venue.freezed.dart';
part 'venue.g.dart';

enum VenueType {
  @JsonValue('concert_hall')
  concertHall,
  @JsonValue('club')
  club,
  @JsonValue('arena')
  arena,
  @JsonValue('outdoor')
  outdoor,
  @JsonValue('bar')
  bar,
  @JsonValue('theater')
  theater,
  @JsonValue('stadium')
  stadium,
  @JsonValue('other')
  other,
}

/// Venue - The "Brewery/Bar" equivalent in the Untappd model
/// Shows have "Beer Menus" (upcoming shows), users check in here
@freezed
sealed class Venue with _$Venue {
  const factory Venue({
    required String id,
    required String name,
    required double averageRating,
    required bool isActive,
    required String createdAt,
    required String updatedAt,
    String? description,
    String? address,
    String? city,
    String? state,
    String? country,
    String? postalCode,
    double? latitude,
    double? longitude,
    String? websiteUrl,
    String? phone,
    String? email,
    int? capacity,
    VenueType? venueType,
    String? imageUrl,
    String? coverImageUrl,
    // Stats for the "Brewery page" model
    @Default(0) int totalReviews,
    @Default(0) int uniqueVisitors,
    @Default(false) bool isVerified,
    // Claimed owner user ID (Phase 11 - verification claims)
    String? claimedByUserId,
    // Discovery aggregate (Phase 7) -- from check-in venue_rating, not old reviews
    VenueAggregate? aggregate,
    // Upcoming events at this venue (Phase 7)
    List<VenueUpcomingEvent>? upcomingEvents,
  }) = _Venue;

  factory Venue.fromJson(Map<String, dynamic> json) => _$VenueFromJson(json);
}

/// Aggregate experience rating for a venue, computed from checkins.venue_rating
@freezed
sealed class VenueAggregate with _$VenueAggregate {
  const factory VenueAggregate({
    @Default(0) double avgExperienceRating,
    @Default(0) int totalRatings,
    @Default(0) int uniqueVisitors,
  }) = _VenueAggregate;

  factory VenueAggregate.fromJson(Map<String, dynamic> json) =>
      _$VenueAggregateFromJson(json);
}

/// Lightweight upcoming event for venue detail page
@freezed
sealed class VenueUpcomingEvent with _$VenueUpcomingEvent {
  const factory VenueUpcomingEvent({
    required String id,
    String? eventName,
    String? eventDate,
    String? startTime,
    String? doorsTime,
    String? ticketUrl,
    // Headliner band info
    VenueEventBand? band,
  }) = _VenueUpcomingEvent;

  factory VenueUpcomingEvent.fromJson(Map<String, dynamic> json) =>
      _$VenueUpcomingEventFromJson(json);
}

/// Band info nested in venue upcoming event
@freezed
sealed class VenueEventBand with _$VenueEventBand {
  const factory VenueEventBand({
    required String id,
    required String name,
    String? genre,
    String? imageUrl,
  }) = _VenueEventBand;

  factory VenueEventBand.fromJson(Map<String, dynamic> json) =>
      _$VenueEventBandFromJson(json);
}

@freezed
sealed class CreateVenueRequest with _$CreateVenueRequest {
  const factory CreateVenueRequest({
    required String name,
    String? description,
    String? address,
    String? city,
    String? state,
    String? country,
    String? postalCode,
    double? latitude,
    double? longitude,
    String? websiteUrl,
    String? phone,
    String? email,
    int? capacity,
    VenueType? venueType,
    String? imageUrl,
    String? coverImageUrl,
  }) = _CreateVenueRequest;

  factory CreateVenueRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateVenueRequestFromJson(json);
}

/// Venue stats for the detail page
@freezed
sealed class VenueStats with _$VenueStats {
  const factory VenueStats({
    required int totalCheckins,
    required int uniqueVisitors,
    required double averageRating,
    // Current user's stats at this venue
    @Default(0) int userCheckins,
  }) = _VenueStats;

  factory VenueStats.fromJson(Map<String, dynamic> json) =>
      _$VenueStatsFromJson(json);
}

/// Loyal patron - users with most check-ins at a venue
@freezed
sealed class LoyalPatron with _$LoyalPatron {
  const factory LoyalPatron({
    required String id,
    required String username,
    required int checkinCount, String? profileImageUrl,
  }) = _LoyalPatron;

  factory LoyalPatron.fromJson(Map<String, dynamic> json) =>
      _$LoyalPatronFromJson(json);
}

/// Trending band at a venue
@freezed
sealed class TrendingBand with _$TrendingBand {
  const factory TrendingBand({
    required String id,
    required String name,
    required int checkinCount, String? imageUrl,
  }) = _TrendingBand;

  factory TrendingBand.fromJson(Map<String, dynamic> json) =>
      _$TrendingBandFromJson(json);
}
