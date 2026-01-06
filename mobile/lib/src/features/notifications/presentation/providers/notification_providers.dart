import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../data/notification_repository.dart';
import '../../domain/notification.dart';

part 'notification_providers.g.dart';

/// Provider for the notification repository
@Riverpod(keepAlive: true)
NotificationRepository notificationRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return NotificationRepository(dioClient: dioClient);
}

/// Provider for notification feed
@riverpod
Future<NotificationFeed> notificationFeed(Ref ref) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getNotifications();
}

/// Provider for unread notification count
@riverpod
Future<int> unreadNotificationCount(Ref ref) async {
  final repository = ref.watch(notificationRepositoryProvider);
  return repository.getUnreadCount();
}

/// Notifier for marking notification as read
@riverpod
class MarkNotificationAsRead extends _$MarkNotificationAsRead {
  @override
  Future<void> build() async {}

  Future<bool> markAsRead(String notificationId) async {
    state = const AsyncValue.loading();

    final repository = ref.read(notificationRepositoryProvider);

    try {
      await repository.markAsRead(notificationId);

      // Invalidate related providers
      ref.invalidate(notificationFeedProvider);
      ref.invalidate(unreadNotificationCountProvider);

      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }
}

/// Notifier for marking all notifications as read
@riverpod
class MarkAllNotificationsAsRead extends _$MarkAllNotificationsAsRead {
  @override
  Future<void> build() async {}

  Future<int> markAllAsRead() async {
    state = const AsyncValue.loading();

    final repository = ref.read(notificationRepositoryProvider);

    try {
      final count = await repository.markAllAsRead();

      // Invalidate related providers
      ref.invalidate(notificationFeedProvider);
      ref.invalidate(unreadNotificationCountProvider);

      state = const AsyncValue.data(null);
      return count;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return 0;
    }
  }
}

/// Notifier for deleting a notification
@riverpod
class DeleteNotification extends _$DeleteNotification {
  @override
  Future<void> build() async {}

  Future<bool> delete(String notificationId) async {
    state = const AsyncValue.loading();

    final repository = ref.read(notificationRepositoryProvider);

    try {
      await repository.deleteNotification(notificationId);

      // Invalidate related providers
      ref.invalidate(notificationFeedProvider);
      ref.invalidate(unreadNotificationCountProvider);

      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }
}
