import 'package:freezed_annotation/freezed_annotation.dart';
import '../domain/venue.dart';

part 'venue_filters_state.freezed.dart';

/// Enum for venue sort options
enum VenueSortBy {
  nameAsc,
  nameDesc,
  ratingDesc,
  ratingAsc,
  checkinCountDesc,
  newestFirst,
}

extension VenueSortByExtension on VenueSortBy {
  String get label {
    switch (this) {
      case VenueSortBy.nameAsc:
        return 'Name (A-Z)';
      case VenueSortBy.nameDesc:
        return 'Name (Z-A)';
      case VenueSortBy.ratingDesc:
        return 'Rating (Highest First)';
      case VenueSortBy.ratingAsc:
        return 'Rating (Lowest First)';
      case VenueSortBy.checkinCountDesc:
        return 'Most Popular';
      case VenueSortBy.newestFirst:
        return 'Newest First';
    }
  }

  String get apiValue {
    switch (this) {
      case VenueSortBy.nameAsc:
        return 'name';
      case VenueSortBy.nameDesc:
        return '-name';
      case VenueSortBy.ratingDesc:
        return '-rating';
      case VenueSortBy.ratingAsc:
        return 'rating';
      case VenueSortBy.checkinCountDesc:
        return '-total_checkins';
      case VenueSortBy.newestFirst:
        return '-createdAt';
    }
  }
}

/// Venue filters state
@freezed
sealed class VenueFiltersState with _$VenueFiltersState {
  const factory VenueFiltersState({
    @Default([]) List<VenueType> venueTypes,
    @Default([]) List<String> cities,
    int? minCapacity,
    int? maxCapacity,
    double? minRating,
    @Default(VenueSortBy.nameAsc) VenueSortBy sortBy,
  }) = _VenueFiltersState;

  const VenueFiltersState._();

  /// Count of active filters
  int get activeFilterCount {
    int count = 0;
    if (venueTypes.isNotEmpty) count++;
    if (cities.isNotEmpty) count++;
    if (minCapacity != null || maxCapacity != null) count++;
    if (minRating != null) count++;
    return count;
  }

  /// Check if any filters are active
  bool get hasActiveFilters {
    return venueTypes.isNotEmpty ||
        cities.isNotEmpty ||
        minCapacity != null ||
        maxCapacity != null ||
        minRating != null;
  }

  /// Clear all filters
  VenueFiltersState clearAll() {
    return const VenueFiltersState();
  }

  /// Convert to query parameters for API
  Map<String, dynamic> toQueryParams() {
    final params = <String, dynamic>{};

    if (venueTypes.isNotEmpty) {
      params['venueType'] = venueTypes.map((t) => t.name).join(',');
    }
    if (cities.isNotEmpty) {
      params['city'] = cities.join(',');
    }
    if (minCapacity != null) {
      params['minCapacity'] = minCapacity;
    }
    if (maxCapacity != null) {
      params['maxCapacity'] = maxCapacity;
    }
    if (minRating != null) {
      params['minRating'] = minRating;
    }
    params['sort'] = sortBy.apiValue;

    return params;
  }
}
