import 'package:freezed_annotation/freezed_annotation.dart';
import '../../bands/domain/band.dart';
import '../../venues/domain/venue.dart';

part 'show.freezed.dart';
part 'show.g.dart';

/// Show - An upcoming concert/show at a venue
/// This is the "Beer Menu" equivalent for venues
@freezed
sealed class Show with _$Show {
  const factory Show({
    required String id,
    required String venueId,
    required String bandId,
    required String showDate,
    required String createdAt, required String updatedAt, String? doorsTime,
    String? startTime,
    String? endTime,
    String? ticketUrl,
    double? ticketPriceMin,
    double? ticketPriceMax,
    @Default(false) bool isSoldOut,
    @Default(false) bool isCancelled,
    String? description,
    // Populated fields
    Band? band,
    Venue? venue,
  }) = _Show;

  factory Show.fromJson(Map<String, dynamic> json) => _$ShowFromJson(json);
}

/// Request to create a show
@freezed
sealed class CreateShowRequest with _$CreateShowRequest {
  const factory CreateShowRequest({
    required String venueId,
    required String bandId,
    required String showDate,
    String? doorsTime,
    String? startTime,
    String? endTime,
    String? ticketUrl,
    double? ticketPriceMin,
    double? ticketPriceMax,
    String? description,
  }) = _CreateShowRequest;

  factory CreateShowRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateShowRequestFromJson(json);
}

/// User wishlist item - bands they want to see
@freezed
sealed class WishlistItem with _$WishlistItem {
  const factory WishlistItem({
    required String id,
    required String userId,
    required String bandId,
    required String createdAt, @Default(true) bool notifyWhenNearby,
    // Populated fields
    Band? band,
  }) = _WishlistItem;

  factory WishlistItem.fromJson(Map<String, dynamic> json) =>
      _$WishlistItemFromJson(json);
}
