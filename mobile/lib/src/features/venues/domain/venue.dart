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
class Venue with _$Venue {
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
    @Default(0) int totalCheckins,
    @Default(0) int uniqueVisitors,
    @Default(false) bool isVerified,
  }) = _Venue;

  factory Venue.fromJson(Map<String, dynamic> json) => _$VenueFromJson(json);
}

@freezed
class CreateVenueRequest with _$CreateVenueRequest {
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
class VenueStats with _$VenueStats {
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
class LoyalPatron with _$LoyalPatron {
  const factory LoyalPatron({
    required String id,
    required String username,
    String? profileImageUrl,
    required int checkinCount,
  }) = _LoyalPatron;

  factory LoyalPatron.fromJson(Map<String, dynamic> json) =>
      _$LoyalPatronFromJson(json);
}

/// Trending band at a venue
@freezed
class TrendingBand with _$TrendingBand {
  const factory TrendingBand({
    required String id,
    required String name,
    String? imageUrl,
    required int checkinCount,
  }) = _TrendingBand;

  factory TrendingBand.fromJson(Map<String, dynamic> json) =>
      _$TrendingBandFromJson(json);
}
