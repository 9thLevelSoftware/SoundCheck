import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';
import '../domain/checkin.dart';
import '../domain/nearby_event.dart';
import '../domain/toast.dart';
import '../domain/checkin_comment.dart';
import '../domain/vibe_tag.dart';

/// Repository for Check-in operations
class CheckInRepository {
  final DioClient _dioClient;

  CheckInRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Get social feed (friends' check-ins)
  Future<Either<Failure, List<CheckIn>>> getFeed({
    String filter = 'friends',
    int limit = 50,
    int offset = 0,
  }) async {
    try {
      final response = await _dioClient.get(
        ApiConfig.feed,
        queryParameters: {
          'filter': filter,
          'limit': limit,
          'offset': offset,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => CheckIn.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get all check-ins with optional filters
  Future<Either<Failure, List<CheckIn>>> getCheckIns({
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
      return Right(data.map((json) => CheckIn.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get check-in by ID
  Future<Either<Failure, CheckIn>> getCheckInById(String id) async {
    try {
      final response = await _dioClient.get('${ApiConfig.checkins}/$id');
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return Right(CheckIn.fromJson(checkinData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Delete check-in
  Future<Either<Failure, void>> deleteCheckIn(String id) async {
    try {
      await _dioClient.delete('${ApiConfig.checkins}/$id');
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get vibe tags
  Future<Either<Failure, List<VibeTag>>> getVibeTags() async {
    try {
      final response = await _dioClient.get('${ApiConfig.checkins}/vibe-tags');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => VibeTag.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  // ======== EVENT-FIRST CHECK-IN OPERATIONS ========

  /// Get nearby events based on GPS coordinates
  Future<Either<Failure, List<NearbyEvent>>> getNearbyEvents(
    double lat,
    double lng, {
    double radius = 10,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        ApiConfig.nearbyEvents,
        queryParameters: {
          'lat': lat,
          'lng': lng,
          'radius': radius,
          'limit': limit,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data
          .map((json) => NearbyEvent.fromJson(json as Map<String, dynamic>))
          .toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Create event-first check-in (single tap on event card)
  Future<Either<Failure, CheckIn>> createEventCheckIn({
    required String eventId,
    double? locationLat,
    double? locationLon,
  }) async {
    try {
      final body = <String, dynamic>{
        'eventId': eventId,
      };
      if (locationLat != null) body['locationLat'] = locationLat;
      if (locationLon != null) body['locationLon'] = locationLon;

      final response = await _dioClient.post(
        ApiConfig.checkins,
        data: body,
      );
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return Right(CheckIn.fromJson(checkinData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Create a manual check-in (band + venue, no event required)
  /// Fallback for users who can't find their show in nearby events
  Future<Either<Failure, CheckIn>> createManualCheckIn({
    required String bandId,
    required String venueId,
    double? rating,
    String? comment,
    List<String>? vibeTagIds,
    double? locationLat,
    double? locationLon,
  }) async {
    try {
      final body = <String, dynamic>{
        'bandId': bandId,
        'venueId': venueId,
      };
      if (rating != null && rating > 0) body['rating'] = rating;
      if (comment != null && comment.isNotEmpty) body['comment'] = comment;
      if (vibeTagIds != null && vibeTagIds.isNotEmpty) {
        body['vibeTagIds'] = vibeTagIds;
      }
      if (locationLat != null) body['locationLat'] = locationLat;
      if (locationLon != null) body['locationLon'] = locationLon;

      final response = await _dioClient.post(
        ApiConfig.checkins,
        data: body,
      );
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return Right(CheckIn.fromJson(checkinData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Submit per-band ratings and/or venue rating for a check-in
  Future<Either<Failure, CheckIn>> submitRatings(
    String checkinId, {
    List<Map<String, dynamic>>? bandRatings,
    double? venueRating,
  }) async {
    try {
      final body = <String, dynamic>{};
      if (bandRatings != null) body['bandRatings'] = bandRatings;
      if (venueRating != null) body['venueRating'] = venueRating;

      final response = await _dioClient.patch(
        '${ApiConfig.checkins}/$checkinId/ratings',
        data: body,
      );
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return Right(CheckIn.fromJson(checkinData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  // ======== TOAST OPERATIONS ========

  /// Toast a check-in (like a fist bump)
  /// Backend returns success-only response, no toast data
  Future<Either<Failure, void>> toastCheckIn(String checkInId) async {
    try {
      await _dioClient.post(
        '${ApiConfig.checkins}/$checkInId/toast',
      );
      // Backend returns { success: true, message: "Toasted!" }
      // No toast data is returned, just confirm success
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Remove toast from a check-in
  Future<Either<Failure, void>> untoastCheckIn(String checkInId) async {
    try {
      await _dioClient.delete('${ApiConfig.checkins}/$checkInId/toast');
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get toasts for a check-in
  Future<Either<Failure, List<Toast>>> getCheckInToasts(String checkInId) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.checkins}/$checkInId/toasts',
      );
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => Toast.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  // ======== COMMENT OPERATIONS ========

  /// Add a comment to a check-in
  Future<Either<Failure, CheckInComment>> addComment(String checkInId, String comment) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.checkins}/$checkInId/comments',
        data: {'commentText': comment},
      );
      final commentData = response.data['data'] as Map<String, dynamic>;
      return Right(CheckInComment.fromJson(commentData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get comments for a check-in
  Future<Either<Failure, List<CheckInComment>>> getCheckInComments(
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
      return Right(data.map((json) => CheckInComment.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Delete a comment
  Future<Either<Failure, void>> deleteComment(String checkInId, String commentId) async {
    try {
      await _dioClient.delete(
        '${ApiConfig.checkins}/$checkInId/comments/$commentId',
      );
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  // ======== USER STATS ========

  /// Get user's check-in statistics
  Future<Either<Failure, Map<String, dynamic>>> getUserStats(String userId) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.auth}/$userId/stats',
      );
      return Right(response.data['data'] as Map<String, dynamic>);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get user's recent check-ins
  Future<Either<Failure, List<CheckIn>>> getUserRecentCheckIns(
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
      return Right(data.map((json) => CheckIn.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
