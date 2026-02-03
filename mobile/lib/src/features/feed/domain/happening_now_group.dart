import 'package:freezed_annotation/freezed_annotation.dart';

part 'happening_now_group.freezed.dart';
part 'happening_now_group.g.dart';

/// A group of friends at the same event (Happening Now tab)
@freezed
sealed class HappeningNowGroup with _$HappeningNowGroup {
  const factory HappeningNowGroup({
    @JsonKey(name: 'event_id') required String eventId,
    @JsonKey(name: 'event_name') required String eventName,
    @JsonKey(name: 'venue_name') required String venueName,
    required List<HappeningNowFriend> friends,
    @JsonKey(name: 'total_friend_count') required int totalFriendCount,
    @JsonKey(name: 'last_checkin_at') required String lastCheckinAt,
  }) = _HappeningNowGroup;

  factory HappeningNowGroup.fromJson(Map<String, dynamic> json) =>
      _$HappeningNowGroupFromJson(json);
}

/// A friend in a Happening Now group
@freezed
sealed class HappeningNowFriend with _$HappeningNowFriend {
  const factory HappeningNowFriend({
    @JsonKey(name: 'user_id') required String userId,
    required String username,
    @JsonKey(name: 'profile_image_url') String? profileImageUrl,
  }) = _HappeningNowFriend;

  factory HappeningNowFriend.fromJson(Map<String, dynamic> json) =>
      _$HappeningNowFriendFromJson(json);
}
