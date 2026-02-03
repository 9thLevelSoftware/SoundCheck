import '../../../core/api/dio_client.dart';
import '../domain/feed_item.dart';
import '../domain/happening_now_group.dart';

/// Repository for feed API operations
class FeedRepository {
  final DioClient _dioClient;

  FeedRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get friends feed with cursor-based pagination
  /// GET /feed/friends?cursor=X&limit=N
  Future<FeedPage> getFriendsFeed({String? cursor, int limit = 20}) async {
    try {
      final queryParams = <String, dynamic>{'limit': limit};
      if (cursor != null) queryParams['cursor'] = cursor;

      final response = await _dioClient.get(
        '/feed/friends',
        queryParameters: queryParams,
      );

      return FeedPage.fromJson(response.data['data'] as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Get event feed with cursor-based pagination
  /// GET /feed/events/:eventId?cursor=X&limit=N
  Future<FeedPage> getEventFeed(
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

      return FeedPage.fromJson(response.data['data'] as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Get happening now groups (friends at events today)
  /// GET /feed/happening-now
  Future<List<HappeningNowGroup>> getHappeningNow() async {
    try {
      final response = await _dioClient.get('/feed/happening-now');

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) =>
              HappeningNowGroup.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get unseen counts per feed tab
  /// GET /feed/unseen
  Future<UnseenCounts> getUnseenCounts() async {
    try {
      final response = await _dioClient.get('/feed/unseen');

      return UnseenCounts.fromJson(
          response.data['data'] as Map<String, dynamic>);
    } catch (e) {
      rethrow;
    }
  }

  /// Mark a feed tab as read
  /// POST /feed/mark-read
  Future<void> markFeedRead(
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
    } catch (e) {
      rethrow;
    }
  }

  /// Register a device token for push notifications
  /// POST /users/device-token
  Future<void> registerDeviceToken(String token, String platform) async {
    try {
      await _dioClient.post(
        '/users/device-token',
        data: {
          'token': token,
          'platform': platform,
        },
      );
    } catch (e) {
      rethrow;
    }
  }
}
