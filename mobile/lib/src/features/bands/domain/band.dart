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
  }) = _Band;

  factory Band.fromJson(Map<String, dynamic> json) => _$BandFromJson(json);
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
