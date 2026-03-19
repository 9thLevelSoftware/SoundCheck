// ignore_for_file: invalid_annotation_target
import 'package:freezed_annotation/freezed_annotation.dart';

part 'badge.freezed.dart';
part 'badge.g.dart';

enum BadgeCategory {
  @JsonValue('checkin_count')
  checkinCount,
  @JsonValue('genre_explorer')
  genreExplorer,
  @JsonValue('unique_venues')
  uniqueVenues,
  @JsonValue('superfan')
  superfan,
  @JsonValue('festival_warrior')
  festivalWarrior,
  @JsonValue('road_warrior')
  roadWarrior,
}

@freezed
sealed class Badge with _$Badge {
  const factory Badge({
    required String id,
    required String name,
    required String createdAt,
    @JsonKey(name: 'badgeType') required BadgeCategory category,
    String? description,
    String? iconUrl,
    int? requirementValue,
    String? color,
    Map<String, dynamic>? criteria,
  }) = _Badge;

  factory Badge.fromJson(Map<String, dynamic> json) => _$BadgeFromJson(json);
}

@freezed
sealed class UserBadge with _$UserBadge {
  const factory UserBadge({
    required String id,
    required String userId,
    required String badgeId,
    required String earnedAt,
    Badge? badge,
    Map<String, dynamic>? metadata,
  }) = _UserBadge;

  factory UserBadge.fromJson(Map<String, dynamic> json) =>
      _$UserBadgeFromJson(json);
}

@freezed
sealed class BadgeProgress with _$BadgeProgress {
  const factory BadgeProgress({
    required Badge badge,
    required int currentValue,
    required int requirementValue,
    required bool isEarned,
  }) = _BadgeProgress;

  factory BadgeProgress.fromJson(Map<String, dynamic> json) =>
      _$BadgeProgressFromJson(json);
}

@freezed
sealed class BadgeRarity with _$BadgeRarity {
  const factory BadgeRarity({
    required String badgeId,
    required String name,
    required String category,
    required int threshold,
    required int earnedCount,
    required int totalUsers,
    required double rarityPct,
  }) = _BadgeRarity;

  factory BadgeRarity.fromJson(Map<String, dynamic> json) =>
      _$BadgeRarityFromJson(json);
}
