import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';
import '../domain/notification.dart';

/// Repository for Notification operations
class NotificationRepository {
  final DioClient _dioClient;

  NotificationRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Get notifications with pagination
  Future<Either<Failure, NotificationFeed>> getNotifications({
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
      return Right(NotificationFeed.fromJson(data));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get unread notification count
  Future<Either<Failure, int>> getUnreadCount() async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.notifications}/unread-count',
      );

      final data = response.data['data'] as Map<String, dynamic>;
      return Right(data['count'] as int);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Mark a single notification as read
  Future<Either<Failure, void>> markAsRead(String notificationId) async {
    try {
      await _dioClient.post(
        '${ApiConfig.notifications}/$notificationId/read',
      );
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Mark all notifications as read
  Future<Either<Failure, int>> markAllAsRead() async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.notifications}/read-all',
      );

      final data = response.data['data'] as Map<String, dynamic>;
      return Right(data['markedCount'] as int);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Delete a notification
  Future<Either<Failure, void>> deleteNotification(String notificationId) async {
    try {
      await _dioClient.delete(
        '${ApiConfig.notifications}/$notificationId',
      );
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
