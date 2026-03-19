import 'package:freezed_annotation/freezed_annotation.dart';

part 'band.freezed.dart';
part 'band.g.dart';

/// Band - The "Beer" equivalent in the Untappd model
/// Users check in to bands at venues
@freezed
sealed class Band with _$Band {
  const factory Band({
    required String id,
    required String name,
    required double averageRating,
    required bool isActive,
    required String createdAt,
    required String updatedAt,
    String? description,
    String? genre,
    int? formedYear,
    String? websiteUrl,
    String? spotifyUrl,
    String? instagramUrl,
    String? facebookUrl,
    String? imageUrl, // Square logo
    String? coverImageUrl,
    String? hometown,
    // Stats for the "Beer page" model
    @Default(0) int totalCheckins,
    @Default(0) int uniqueFans,
    @Default(0) int monthlyCheckins,
    // Claimed owner user ID (Phase 11 - verification claims)
    String? claimedByUserId,
    // Discovery aggregate (Phase 7) -- from check-in ratings, not old reviews
    BandAggregate? aggregate,
    // Upcoming shows for this band (Phase 7)
    List<BandUpcomingShow>? upcomingShows,
  }) = _Band;

  factory Band.fromJson(Map<String, dynamic> json) => _$BandFromJson(json);
}

/// Aggregate performance rating for a band, computed from checkin_band_ratings
@freezed
sealed class BandAggregate with _$BandAggregate {
  const factory BandAggregate({
    @Default(0) double avgPerformanceRating,
    @Default(0) int totalRatings,
    @Default(0) int uniqueFans,
  }) = _BandAggregate;

  factory BandAggregate.fromJson(Map<String, dynamic> json) =>
      _$BandAggregateFromJson(json);
}

/// Lightweight upcoming show for band detail page
@freezed
sealed class BandUpcomingShow with _$BandUpcomingShow {
  const factory BandUpcomingShow({
    required String id,
    String? eventName,
    String? eventDate,
    String? startTime,
    String? doorsTime,
    String? ticketUrl,
    // Nested venue info
    BandShowVenue? venue,
  }) = _BandUpcomingShow;

  factory BandUpcomingShow.fromJson(Map<String, dynamic> json) =>
      _$BandUpcomingShowFromJson(json);
}

/// Venue info nested in upcoming show
@freezed
sealed class BandShowVenue with _$BandShowVenue {
  const factory BandShowVenue({
    required String id,
    required String name,
    String? city,
    String? state,
    String? imageUrl,
  }) = _BandShowVenue;

  factory BandShowVenue.fromJson(Map<String, dynamic> json) =>
      _$BandShowVenueFromJson(json);
}

@freezed
sealed class CreateBandRequest with _$CreateBandRequest {
  const factory CreateBandRequest({
    required String name,
    String? description,
    String? genre,
    int? formedYear,
    String? websiteUrl,
    String? spotifyUrl,
    String? instagramUrl,
    String? facebookUrl,
    String? imageUrl,
    String? coverImageUrl,
    String? hometown,
  }) = _CreateBandRequest;

  factory CreateBandRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateBandRequestFromJson(json);
}

/// Band stats for the detail page
@freezed
sealed class BandStats with _$BandStats {
  const factory BandStats({
    required int totalCheckins,
    required int uniqueFans,
    required int monthlyCheckins,
    required double averageRating,
    // Current user's stats with this band
    @Default(0) int userCheckins,
    @Default(false) bool isOnWishlist,
  }) = _BandStats;

  factory BandStats.fromJson(Map<String, dynamic> json) =>
      _$BandStatsFromJson(json);
}
