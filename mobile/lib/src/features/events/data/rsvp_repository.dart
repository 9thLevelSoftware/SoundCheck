import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';

/// Data class representing friends going to an event
class FriendsGoingData {
  final int count;
  final List<FriendAvatar> friends;
  const FriendsGoingData({required this.count, required this.friends});
}

/// Data class for a friend's avatar in the going list
class FriendAvatar {
  final String id;
  final String username;
  final String? profileImageUrl;
  const FriendAvatar({
    required this.id,
    required this.username,
    this.profileImageUrl,
  });
}

/// Repository for RSVP operations.
/// Follows existing DiscoveryRepository pattern with DioClient.
class RsvpRepository {
  final DioClient _dioClient;

  RsvpRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Toggle RSVP for an event (creates or deletes).
  /// POST /api/rsvp/:eventId -> { success: true, data: { isGoing: boolean } }
  Future<Either<Failure, bool>> toggleRsvp(String eventId) async {
    try {
      final response = await _dioClient.post('/rsvp/$eventId');
      return Right(response.data['data']['isGoing'] as bool);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get friends who RSVP'd to an event.
  /// GET /api/rsvp/:eventId/friends -> { success: true, data: { count, friends: [...] } }
  Future<Either<Failure, FriendsGoingData>> getFriendsGoing(String eventId) async {
    try {
      final response = await _dioClient.get('/rsvp/$eventId/friends');
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(FriendsGoingData(
        count: data['count'] as int,
        friends: (data['friends'] as List)
            .map(
              (f) => FriendAvatar(
                id: f['id'] as String,
                username: f['username'] as String,
                profileImageUrl: f['profileImageUrl'] as String?,
              ),
            )
            .toList(),
      ));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get all event IDs user has RSVP'd to (batch status check for event lists).
  /// GET /api/rsvp/me -> { success: true, data: { eventIds: [...] } }
  Future<Either<Failure, Set<String>>> getUserRsvps() async {
    try {
      final response = await _dioClient.get('/rsvp/me');
      final eventIds = response.data['data']['eventIds'] as List;
      return Right(eventIds.map((e) => e as String).toSet());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
