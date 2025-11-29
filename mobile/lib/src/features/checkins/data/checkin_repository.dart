import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/checkin.dart';
import '../domain/toast.dart';
import '../domain/checkin_comment.dart';
import '../domain/vibe_tag.dart';

/// Request model for creating a check-in
class CreateCheckInRequest {
  final String bandId;
  final String venueId;
  final double rating;
  final String? comment;
  final String? photoUrl;
  final List<String>? vibeTagIds;

  CreateCheckInRequest({
    required this.bandId,
    required this.venueId,
    required this.rating,
    this.comment,
    this.photoUrl,
    this.vibeTagIds,
  });

  Map<String, dynamic> toJson() => {
        'bandId': bandId,
        'venueId': venueId,
        'rating': rating,
        if (comment != null) 'comment': comment,
        if (photoUrl != null) 'photoUrl': photoUrl,
        if (vibeTagIds != null) 'vibeTagIds': vibeTagIds,
      };
}

/// Repository for Check-in operations
class CheckInRepository {
  final DioClient _dioClient;

  CheckInRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get social feed (friends' check-ins)
  Future<List<CheckIn>> getFeed({
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        ApiConfig.feed,
        queryParameters: {
          'page': page,
          'limit': limit,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => CheckIn.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get all check-ins with optional filters
  Future<List<CheckIn>> getCheckIns({
    String? venueId,
    String? bandId,
    String? userId,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'page': page,
        'limit': limit,
      };

      if (venueId != null) queryParams['venueId'] = venueId;
      if (bandId != null) queryParams['bandId'] = bandId;
      if (userId != null) queryParams['userId'] = userId;

      final response = await _dioClient.get(
        ApiConfig.checkins,
        queryParameters: queryParams,
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => CheckIn.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get check-in by ID
  Future<CheckIn> getCheckInById(String id) async {
    try {
      final response = await _dioClient.get('${ApiConfig.checkins}/$id');
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return CheckIn.fromJson(checkinData);
    } catch (e) {
      rethrow;
    }
  }

  /// Create a new check-in
  Future<CheckIn> createCheckIn(CreateCheckInRequest request) async {
    try {
      final response = await _dioClient.post(
        ApiConfig.checkins,
        data: request.toJson(),
      );
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return CheckIn.fromJson(checkinData);
    } catch (e) {
      rethrow;
    }
  }

  /// Delete check-in
  Future<void> deleteCheckIn(String id) async {
    try {
      await _dioClient.delete('${ApiConfig.checkins}/$id');
    } catch (e) {
      rethrow;
    }
  }

  /// Get vibe tags
  Future<List<VibeTag>> getVibeTags() async {
    try {
      final response = await _dioClient.get('${ApiConfig.checkins}/vibe-tags');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => VibeTag.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  // ======== TOAST OPERATIONS ========

  /// Toast a check-in (like a fist bump)
  Future<Toast> toastCheckIn(String checkInId) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.checkins}/$checkInId/toast',
      );
      final toastData = response.data['data'] as Map<String, dynamic>;
      return Toast.fromJson(toastData);
    } catch (e) {
      rethrow;
    }
  }

  /// Remove toast from a check-in
  Future<void> untoastCheckIn(String checkInId) async {
    try {
      await _dioClient.delete('${ApiConfig.checkins}/$checkInId/toast');
    } catch (e) {
      rethrow;
    }
  }

  /// Get toasts for a check-in
  Future<List<Toast>> getCheckInToasts(String checkInId) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.checkins}/$checkInId/toasts',
      );
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => Toast.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  // ======== COMMENT OPERATIONS ========

  /// Add a comment to a check-in
  Future<CheckInComment> addComment(String checkInId, String comment) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.checkins}/$checkInId/comments',
        data: {'comment': comment},
      );
      final commentData = response.data['data'] as Map<String, dynamic>;
      return CheckInComment.fromJson(commentData);
    } catch (e) {
      rethrow;
    }
  }

  /// Get comments for a check-in
  Future<List<CheckInComment>> getCheckInComments(
    String checkInId, {
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.checkins}/$checkInId/comments',
        queryParameters: {
          'page': page,
          'limit': limit,
        },
      );
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => CheckInComment.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Delete a comment
  Future<void> deleteComment(String checkInId, String commentId) async {
    try {
      await _dioClient.delete(
        '${ApiConfig.checkins}/$checkInId/comments/$commentId',
      );
    } catch (e) {
      rethrow;
    }
  }

  // ======== USER STATS ========

  /// Get user's check-in statistics
  Future<Map<String, dynamic>> getUserStats(String userId) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.auth}/$userId/stats',
      );
      return response.data['data'] as Map<String, dynamic>;
    } catch (e) {
      rethrow;
    }
  }

  /// Get user's recent check-ins
  Future<List<CheckIn>> getUserRecentCheckIns(
    String userId, {
    int limit = 10,
  }) async {
    try {
      final response = await _dioClient.get(
        ApiConfig.checkins,
        queryParameters: {
          'userId': userId,
          'limit': limit,
          'sort': 'createdAt',
          'order': 'desc',
        },
      );
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => CheckIn.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }
}
