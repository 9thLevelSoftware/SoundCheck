import 'package:freezed_annotation/freezed_annotation.dart';

part 'band_filters_state.freezed.dart';

/// Enum for band sort options
enum BandSortBy {
  nameAsc,
  nameDesc,
  ratingDesc,
  ratingAsc,
  checkinCountDesc,
  formedYearDesc,
  formedYearAsc,
}

extension BandSortByExtension on BandSortBy {
  String get label {
    switch (this) {
      case BandSortBy.nameAsc:
        return 'Name (A-Z)';
      case BandSortBy.nameDesc:
        return 'Name (Z-A)';
      case BandSortBy.ratingDesc:
        return 'Rating (Highest First)';
      case BandSortBy.ratingAsc:
        return 'Rating (Lowest First)';
      case BandSortBy.checkinCountDesc:
        return 'Most Popular';
      case BandSortBy.formedYearDesc:
        return 'Formed Year (Newest)';
      case BandSortBy.formedYearAsc:
        return 'Formed Year (Oldest)';
    }
  }

  String get apiValue {
    switch (this) {
      case BandSortBy.nameAsc:
        return 'name';
      case BandSortBy.nameDesc:
        return '-name';
      case BandSortBy.ratingDesc:
        return '-rating';
      case BandSortBy.ratingAsc:
        return 'rating';
      case BandSortBy.checkinCountDesc:
        return '-total_checkins';
      case BandSortBy.formedYearDesc:
        return '-formedYear';
      case BandSortBy.formedYearAsc:
        return 'formedYear';
    }
  }
}

/// Band filters state
@freezed
sealed class BandFiltersState with _$BandFiltersState {
  const factory BandFiltersState({
    @Default([]) List<String> genres,
    @Default([]) List<String> hometowns,
    double? minRating,
    @Default(BandSortBy.nameAsc) BandSortBy sortBy,
  }) = _BandFiltersState;

  const BandFiltersState._();

  /// Count of active filters
  int get activeFilterCount {
    int count = 0;
    if (genres.isNotEmpty) count++;
    if (hometowns.isNotEmpty) count++;
    if (minRating != null) count++;
    return count;
  }

  /// Check if any filters are active
  bool get hasActiveFilters {
    return genres.isNotEmpty || hometowns.isNotEmpty || minRating != null;
  }

  /// Clear all filters
  BandFiltersState clearAll() {
    return const BandFiltersState();
  }

  /// Convert to query parameters for API
  Map<String, dynamic> toQueryParams() {
    final params = <String, dynamic>{};

    if (genres.isNotEmpty) {
      params['genre'] = genres.join(',');
    }
    if (hometowns.isNotEmpty) {
      params['hometown'] = hometowns.join(',');
    }
    if (minRating != null) {
      params['minRating'] = minRating;
    }
    params['sort'] = sortBy.apiValue;

    return params;
  }
}
