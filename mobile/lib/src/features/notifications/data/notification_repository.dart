import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/notification.dart';

/// Repository for Notification operations
class NotificationRepository {
  final DioClient _dioClient;

  NotificationRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get notifications with pagination
  Future<NotificationFeed> getNotifications({
    int limit = 20,
    int offset = 0,
  }) async {
    try {
      final response = await _dioClient.get(
        ApiConfig.notifications,
        queryParameters: {
          'limit': limit,
          'offset': offset,
        },
      );

      final data = response.data['data'] as Map<String, dynamic>;
      return NotificationFeed.fromJson(data);
    } catch (e) {
      rethrow;
    }
  }

  /// Get unread notification count
  Future<int> getUnreadCount() async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.notifications}/unread-count',
      );

      final data = response.data['data'] as Map<String, dynamic>;
      return data['count'] as int;
    } catch (e) {
      rethrow;
    }
  }

  /// Mark a single notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await _dioClient.post(
        '${ApiConfig.notifications}/$notificationId/read',
      );
    } catch (e) {
      rethrow;
    }
  }

  /// Mark all notifications as read
  Future<int> markAllAsRead() async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.notifications}/read-all',
      );

      final data = response.data['data'] as Map<String, dynamic>;
      return data['markedCount'] as int;
    } catch (e) {
      rethrow;
    }
  }

  /// Delete a notification
  Future<void> deleteNotification(String notificationId) async {
    try {
      await _dioClient.delete(
        '${ApiConfig.notifications}/$notificationId',
      );
    } catch (e) {
      rethrow;
    }
  }
}
