import 'package:freezed_annotation/freezed_annotation.dart';

part 'badge.freezed.dart';
part 'badge.g.dart';

enum BadgeType {
  @JsonValue('review_count')
  reviewCount,
  @JsonValue('venue_explorer')
  venueExplorer,
  @JsonValue('music_lover')
  musicLover,
  @JsonValue('event_attendance')
  eventAttendance,
  @JsonValue('helpful_count')
  helpfulCount,
}

@freezed
sealed class Badge with _$Badge {
  const factory Badge({
    required String id,
    required String name,
    required BadgeType badgeType, required String createdAt, String? description,
    String? iconUrl,
    int? requirementValue,
    String? color,
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
