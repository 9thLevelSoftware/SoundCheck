import 'package:freezed_annotation/freezed_annotation.dart';

part 'feed_item.freezed.dart';
part 'feed_item.g.dart';

/// A single item in the social activity feed
@freezed
sealed class FeedItem with _$FeedItem {
  const factory FeedItem({
    required String id,
    @JsonKey(name: 'checkin_id') required String checkinId,
    @JsonKey(name: 'user_id') required String userId,
    required String username,
    @JsonKey(name: 'user_avatar_url') String? userAvatarUrl,
    @JsonKey(name: 'event_id') required String eventId,
    @JsonKey(name: 'event_name') required String eventName,
    @JsonKey(name: 'venue_name') required String venueName,
    @JsonKey(name: 'photo_url') String? photoUrl,
    @JsonKey(name: 'created_at') required String createdAt,
    @JsonKey(name: 'has_badge_earned') @Default(false) bool hasBadgeEarned,
    @JsonKey(name: 'toast_count') @Default(0) int toastCount,
    @JsonKey(name: 'comment_count') @Default(0) int commentCount,
    @JsonKey(name: 'has_user_toasted') @Default(false) bool hasUserToasted,
    @JsonKey(name: 'event_date') String? eventDate,
    @JsonKey(name: 'comment_preview') String? commentPreview,
  }) = _FeedItem;

  factory FeedItem.fromJson(Map<String, dynamic> json) =>
      _$FeedItemFromJson(json);
}

/// A page of feed items with cursor-based pagination
@freezed
sealed class FeedPage with _$FeedPage {
  const factory FeedPage({
    required List<FeedItem> items,
    @JsonKey(name: 'next_cursor') String? nextCursor,
    @JsonKey(name: 'has_more') @Default(false) bool hasMore,
  }) = _FeedPage;

  factory FeedPage.fromJson(Map<String, dynamic> json) =>
      _$FeedPageFromJson(json);
}

/// Unseen counts per feed tab for badge display
@freezed
sealed class UnseenCounts with _$UnseenCounts {
  const factory UnseenCounts({
    @Default(0) int friends,
    @Default(0) int event,
    @JsonKey(name: 'happening_now') @Default(0) int happeningNow,
  }) = _UnseenCounts;

  factory UnseenCounts.fromJson(Map<String, dynamic> json) =>
      _$UnseenCountsFromJson(json);
}
