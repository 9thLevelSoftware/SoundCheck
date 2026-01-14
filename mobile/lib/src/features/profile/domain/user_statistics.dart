import 'package:freezed_annotation/freezed_annotation.dart';

part 'user_statistics.freezed.dart';
part 'user_statistics.g.dart';

@freezed
sealed class UserStatistics with _$UserStatistics {
  const factory UserStatistics({
    @Default(0) int totalCheckins,
    @Default(0) int uniqueBands,
    @Default(0) int uniqueVenues,
    @Default(0) int totalToasts,
    @Default(0) int totalComments,
    @Default(0) int badgesEarned,
    @Default(0) int followersCount,
    @Default(0) int followingCount,
  }) = _UserStatistics;

  factory UserStatistics.fromJson(Map<String, dynamic> json) =>
      _$UserStatisticsFromJson(json);
}
