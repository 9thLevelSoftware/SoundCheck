import '../../../core/api/dio_client.dart';

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

  /// Toggle RSVP for an event (creates or deletes).
  /// POST /api/rsvp/:eventId -> { success: true, data: { isGoing: boolean } }
  Future<bool> toggleRsvp(String eventId) async {
    final response = await _dioClient.post('/rsvp/$eventId');
    return response.data['data']['isGoing'] as bool;
  }

  /// Get friends who RSVP'd to an event.
  /// GET /api/rsvp/:eventId/friends -> { success: true, data: { count, friends: [...] } }
  Future<FriendsGoingData> getFriendsGoing(String eventId) async {
    final response = await _dioClient.get('/api/rsvp/$eventId/friends');
    final data = response.data['data'] as Map<String, dynamic>;
    return FriendsGoingData(
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
    );
  }

  /// Get all event IDs user has RSVP'd to (batch status check for event lists).
  /// GET /api/rsvp/me -> { success: true, data: { eventIds: [...] } }
  Future<Set<String>> getUserRsvps() async {
    final response = await _dioClient.get('/rsvp/me');
    final eventIds = response.data['data']['eventIds'] as List;
    return eventIds.map((e) => e as String).toSet();
  }
}
