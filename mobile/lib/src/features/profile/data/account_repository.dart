import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';

/// Repository for account management operations (deletion, cancellation).
class AccountRepository {
  final DioClient _dioClient;

  AccountRepository(this._dioClient);

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Request account deletion with 30-day grace period.
  ///
  /// Returns the deletion request details including scheduled deletion date.
  /// Throws on failure (user not found, existing pending request).
  Future<Either<Failure, Map<String, dynamic>>> requestAccountDeletion() async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.auth}/me/delete-account',
      );
      return Right(response.data['data'] as Map<String, dynamic>);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Cancel a pending account deletion request.
  ///
  /// Reactivates the user account.
  /// Throws if no pending deletion request exists.
  Future<Either<Failure, void>> cancelDeletion() async {
    try {
      await _dioClient.post(
        '${ApiConfig.auth}/me/cancel-deletion',
      );
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get the current deletion request status.
  ///
  /// Returns null if no deletion request exists.
  Future<Either<Failure, Map<String, dynamic>?>> getDeletionStatus() async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.auth}/me/deletion-status',
      );
      return Right(response.data['data'] as Map<String, dynamic>?);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
