import 'package:freezed_annotation/freezed_annotation.dart';

part 'concert_cred.freezed.dart';
part 'concert_cred.g.dart';

@freezed
sealed class GenreStat with _$GenreStat {
  const factory GenreStat({
    @Default('') String genre,
    @Default(0) int count,
    @Default(0) int percentage,
  }) = _GenreStat;

  factory GenreStat.fromJson(Map<String, dynamic> json) =>
      _$GenreStatFromJson(json);
}

@freezed
sealed class TopRatedBand with _$TopRatedBand {
  const factory TopRatedBand({
    @Default('') String id,
    @Default('') String name,
    String? genre,
    String? imageUrl,
    @Default(0) double avgRating,
    @Default(0) int timesSeen,
  }) = _TopRatedBand;

  factory TopRatedBand.fromJson(Map<String, dynamic> json) =>
      _$TopRatedBandFromJson(json);
}

@freezed
sealed class TopRatedVenue with _$TopRatedVenue {
  const factory TopRatedVenue({
    @Default('') String id,
    @Default('') String name,
    String? city,
    String? state,
    String? imageUrl,
    @Default(0) double avgRating,
    @Default(0) int timesVisited,
  }) = _TopRatedVenue;

  factory TopRatedVenue.fromJson(Map<String, dynamic> json) =>
      _$TopRatedVenueFromJson(json);
}

@freezed
sealed class ConcertCred with _$ConcertCred {
  const factory ConcertCred({
    @Default(0) int totalShows,
    @Default(0) int uniqueBands,
    @Default(0) int uniqueVenues,
    @Default(0) int badgesEarned,
    @Default(0) int followersCount,
    @Default(0) int followingCount,
    @Default([]) List<GenreStat> genres,
    @Default([]) List<TopRatedBand> topBands,
    @Default([]) List<TopRatedVenue> topVenues,
  }) = _ConcertCred;

  factory ConcertCred.fromJson(Map<String, dynamic> json) =>
      _$ConcertCredFromJson(json);
}
