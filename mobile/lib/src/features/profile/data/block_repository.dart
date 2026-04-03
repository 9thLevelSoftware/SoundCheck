import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';

/// Repository for user block/unblock operations.
/// Follows existing RsvpRepository pattern with DioClient.
class BlockRepository {
  final DioClient _dioClient;

  BlockRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Block a user.
  /// POST /blocks/:userId/block
  Future<Either<Failure, void>> blockUser(String userId) async {
    try {
      await _dioClient.post('/blocks/$userId/block');
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Unblock a user.
  /// DELETE /blocks/:userId/block
  Future<Either<Failure, void>> unblockUser(String userId) async {
    try {
      await _dioClient.delete('/blocks/$userId/block');
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Check if a user is blocked (bilateral -- true if either user blocked the other).
  /// GET /blocks/:userId/status -> { data: { blocked: boolean } }
  Future<Either<Failure, bool>> isBlocked(String userId) async {
    try {
      final response = await _dioClient.get('/blocks/$userId/status');
      return Right(response.data['data']['blocked'] as bool);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get all blocked users.
  /// GET /blocks -> { data: [...] }
  Future<Either<Failure, List<Map<String, dynamic>>>> getBlockedUsers() async {
    try {
      final response = await _dioClient.get('/blocks');
      return Right(List<Map<String, dynamic>>.from(response.data['data'] as List));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
