import 'package:freezed_annotation/freezed_annotation.dart';
import '../../auth/domain/user.dart';
import '../../badges/domain/badge.dart';
import '../../checkins/domain/checkin.dart';
import '../../shows/domain/show.dart';

part 'notification.freezed.dart';
part 'notification.g.dart';

/// NotificationType enum
enum NotificationType {
  toast,
  comment,
  badgeEarned,
  friendCheckin,
  showReminder,
  newFollower,
}

extension NotificationTypeExtension on NotificationType {
  String get value {
    switch (this) {
      case NotificationType.toast:
        return 'toast';
      case NotificationType.comment:
        return 'comment';
      case NotificationType.badgeEarned:
        return 'badge_earned';
      case NotificationType.friendCheckin:
        return 'friend_checkin';
      case NotificationType.showReminder:
        return 'show_reminder';
      case NotificationType.newFollower:
        return 'new_follower';
    }
  }

  static NotificationType fromString(String value) {
    switch (value) {
      case 'toast':
        return NotificationType.toast;
      case 'comment':
        return NotificationType.comment;
      case 'badge_earned':
        return NotificationType.badgeEarned;
      case 'friend_checkin':
        return NotificationType.friendCheckin;
      case 'show_reminder':
        return NotificationType.showReminder;
      case 'new_follower':
        return NotificationType.newFollower;
      default:
        return NotificationType.toast;
    }
  }
}

/// AppNotification - Notification entity
/// Named AppNotification to avoid conflict with Flutter's Notification class
@freezed
class AppNotification with _$AppNotification {
  const factory AppNotification({
    required String id,
    required String userId,
    required String type,
    String? title,
    String? message,
    String? checkinId,
    String? fromUserId,
    String? badgeId,
    String? showId,
    @Default(false) bool isRead,
    required String createdAt,
    // Populated fields
    User? fromUser,
    CheckIn? checkin,
    Badge? badge,
    Show? show,
  }) = _AppNotification;

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      _$AppNotificationFromJson(json);
}

/// Notification feed with pagination
@freezed
class NotificationFeed with _$NotificationFeed {
  const factory NotificationFeed({
    required List<AppNotification> notifications,
    required int unreadCount,
    required int total,
    required bool hasMore,
  }) = _NotificationFeed;

  factory NotificationFeed.fromJson(Map<String, dynamic> json) =>
      _$NotificationFeedFromJson(json);
}
