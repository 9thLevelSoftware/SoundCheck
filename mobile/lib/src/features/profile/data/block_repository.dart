import '../../../core/api/dio_client.dart';

/// Repository for user block/unblock operations.
/// Follows existing RsvpRepository pattern with DioClient.
class BlockRepository {
  final DioClient _dioClient;

  BlockRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Block a user.
  /// POST /blocks/:userId/block
  Future<void> blockUser(String userId) async {
    await _dioClient.post('/blocks/$userId/block');
  }

  /// Unblock a user.
  /// DELETE /blocks/:userId/block
  Future<void> unblockUser(String userId) async {
    await _dioClient.delete('/blocks/$userId/block');
  }

  /// Check if a user is blocked (bilateral -- true if either user blocked the other).
  /// GET /blocks/:userId/status -> { data: { blocked: boolean } }
  Future<bool> isBlocked(String userId) async {
    final response = await _dioClient.get('/blocks/$userId/status');
    return response.data['data']['blocked'] as bool;
  }

  /// Get all blocked users.
  /// GET /blocks -> { data: [...] }
  Future<List<Map<String, dynamic>>> getBlockedUsers() async {
    final response = await _dioClient.get('/blocks');
    return List<Map<String, dynamic>>.from(response.data['data'] as List);
  }
}
