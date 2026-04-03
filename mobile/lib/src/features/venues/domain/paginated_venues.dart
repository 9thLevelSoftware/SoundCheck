import 'package:freezed_annotation/freezed_annotation.dart';
import 'venue.dart';

part 'paginated_venues.freezed.dart';
part 'paginated_venues.g.dart';

/// Paginated venues response from the API
@freezed
sealed class PaginatedVenues with _$PaginatedVenues {
  const factory PaginatedVenues({
    required List<Venue> venues,
    required int total,
    required int page,
    required int totalPages,
  }) = _PaginatedVenues;

  factory PaginatedVenues.fromJson(Map<String, dynamic> json) =>
      _$PaginatedVenuesFromJson(json);
}
