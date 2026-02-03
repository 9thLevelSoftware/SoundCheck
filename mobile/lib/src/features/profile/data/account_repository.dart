import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';

/// Repository for account management operations (deletion, cancellation).
class AccountRepository {
  final DioClient _dioClient;

  AccountRepository(this._dioClient);

  /// Request account deletion with 30-day grace period.
  ///
  /// Returns the deletion request details including scheduled deletion date.
  /// Throws on failure (user not found, existing pending request).
  Future<Map<String, dynamic>> requestAccountDeletion() async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.auth}/me/delete-account',
      );
      return response.data['data'] as Map<String, dynamic>;
    } catch (e) {
      rethrow;
    }
  }

  /// Cancel a pending account deletion request.
  ///
  /// Reactivates the user account.
  /// Throws if no pending deletion request exists.
  Future<void> cancelDeletion() async {
    try {
      await _dioClient.post(
        '${ApiConfig.auth}/me/cancel-deletion',
      );
    } catch (e) {
      rethrow;
    }
  }

  /// Get the current deletion request status.
  ///
  /// Returns null if no deletion request exists.
  Future<Map<String, dynamic>?> getDeletionStatus() async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.auth}/me/deletion-status',
      );
      return response.data['data'] as Map<String, dynamic>?;
    } catch (e) {
      rethrow;
    }
  }
}
