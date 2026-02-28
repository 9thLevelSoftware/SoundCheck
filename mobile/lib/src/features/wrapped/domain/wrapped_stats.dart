import 'package:freezed_annotation/freezed_annotation.dart';

part 'wrapped_stats.freezed.dart';
part 'wrapped_stats.g.dart';

@freezed
sealed class WrappedStats with _$WrappedStats {
  const factory WrappedStats({
    required int year,
    required int totalShows,
    required int uniqueBands,
    required int uniqueVenues,
    String? topGenre,
    @Default(0) int topGenrePercentage,
    String? homeVenueName,
    String? homeVenueId,
    @Default(0) int homeVenueVisits,
    String? topArtistName,
    String? topArtistId,
    @Default(0) int topArtistTimesSeen,
    @Default(false) bool meetsThreshold,
    // Premium-only fields (null for free users)
    List<MonthlyActivity>? monthlyBreakdown,
    List<GenreMonth>? genreEvolution,
    List<FriendOverlap>? friendOverlap,
    List<TopRatedSet>? topRatedSets,
  }) = _WrappedStats;

  factory WrappedStats.fromJson(Map<String, dynamic> json) =>
      _$WrappedStatsFromJson(json);
}

@freezed
sealed class MonthlyActivity with _$MonthlyActivity {
  const factory MonthlyActivity({
    required int month,
    required int showCount,
  }) = _MonthlyActivity;

  factory MonthlyActivity.fromJson(Map<String, dynamic> json) =>
      _$MonthlyActivityFromJson(json);
}

@freezed
sealed class GenreMonth with _$GenreMonth {
  const factory GenreMonth({
    required int month,
    required String genre,
    required int count,
  }) = _GenreMonth;

  factory GenreMonth.fromJson(Map<String, dynamic> json) =>
      _$GenreMonthFromJson(json);
}

@freezed
sealed class FriendOverlap with _$FriendOverlap {
  const factory FriendOverlap({
    required String friendId,
    required String friendUsername,
    String? friendProfileImageUrl,
    required int sharedShows,
  }) = _FriendOverlap;

  factory FriendOverlap.fromJson(Map<String, dynamic> json) =>
      _$FriendOverlapFromJson(json);
}

@freezed
sealed class TopRatedSet with _$TopRatedSet {
  const factory TopRatedSet({
    required String bandName,
    required String bandId,
    required String venueName,
    required String eventDate,
    required double rating,
  }) = _TopRatedSet;

  factory TopRatedSet.fromJson(Map<String, dynamic> json) =>
      _$TopRatedSetFromJson(json);
}
