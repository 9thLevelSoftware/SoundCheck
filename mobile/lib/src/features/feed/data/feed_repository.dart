import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';
import '../domain/feed_item.dart';
import '../domain/happening_now_group.dart';

/// Repository for feed API operations
class FeedRepository {
  final DioClient _dioClient;

  FeedRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Get global discovery feed with cursor-based pagination
  /// GET /feed/global?cursor=X&limit=N
  Future<Either<Failure, FeedPage>> getGlobalFeed({String? cursor, int limit = 20}) async {
    try {
      final queryParams = <String, dynamic>{'limit': limit};
      if (cursor != null) queryParams['cursor'] = cursor;

      final response = await _dioClient.get(
        '/feed/global',
        queryParameters: queryParams,
      );

      return Right(FeedPage.fromJson(response.data['data'] as Map<String, dynamic>));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get friends feed with cursor-based pagination
  /// GET /feed/friends?cursor=X&limit=N
  Future<Either<Failure, FeedPage>> getFriendsFeed({String? cursor, int limit = 20}) async {
    try {
      final queryParams = <String, dynamic>{'limit': limit};
      if (cursor != null) queryParams['cursor'] = cursor;

      final response = await _dioClient.get(
        '/feed/friends',
        queryParameters: queryParams,
      );

      return Right(FeedPage.fromJson(response.data['data'] as Map<String, dynamic>));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get event feed with cursor-based pagination
  /// GET /feed/events/:eventId?cursor=X&limit=N
  Future<Either<Failure, FeedPage>> getEventFeed(
    String eventId, {
    String? cursor,
    int limit = 20,
  }) async {
    try {
      final queryParams = <String, dynamic>{'limit': limit};
      if (cursor != null) queryParams['cursor'] = cursor;

      final response = await _dioClient.get(
        '/feed/events/$eventId',
        queryParameters: queryParams,
      );

      return Right(FeedPage.fromJson(response.data['data'] as Map<String, dynamic>));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get event-based feed showing activity from events user has attended
  /// GET /feed/events?cursor=X&limit=N
  Future<Either<Failure, FeedPage>> getEventsFeed({String? cursor, int limit = 20}) async {
    try {
      final queryParams = <String, dynamic>{'limit': limit};
      if (cursor != null) queryParams['cursor'] = cursor;

      final response = await _dioClient.get(
        '/feed/events',
        queryParameters: queryParams,
      );

      return Right(FeedPage.fromJson(response.data['data'] as Map<String, dynamic>));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get happening now groups (friends at events today)
  /// GET /feed/happening-now
  Future<Either<Failure, List<HappeningNowGroup>>> getHappeningNow() async {
    try {
      final response = await _dioClient.get('/feed/happening-now');

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data
          .map((json) =>
              HappeningNowGroup.fromJson(json as Map<String, dynamic>),)
          .toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get unseen counts per feed tab
  /// GET /feed/unseen
  Future<Either<Failure, UnseenCounts>> getUnseenCounts() async {
    try {
      final response = await _dioClient.get('/feed/unseen');

      return Right(UnseenCounts.fromJson(
          response.data['data'] as Map<String, dynamic>,));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Mark a feed tab as read
  /// POST /feed/mark-read
  Future<Either<Failure, void>> markFeedRead(
    String feedType,
    String lastSeenAt, {
    String? lastSeenCheckinId,
  }) async {
    try {
      final body = <String, dynamic>{
        'feedType': feedType,
        'lastSeenAt': lastSeenAt,
      };
      if (lastSeenCheckinId != null) {
        body['lastSeenCheckinId'] = lastSeenCheckinId;
      }

      await _dioClient.post('/feed/mark-read', data: body);
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Register a device token for push notifications
  /// POST /users/device-token
  Future<Either<Failure, void>> registerDeviceToken(String token, String platform) async {
    try {
      await _dioClient.post(
        '/users/device-token',
        data: {
          'token': token,
          'platform': platform,
        },
      );
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
