import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';
import '../domain/subscription_state.dart';

class SubscriptionRepository {
  final DioClient _dioClient;
  SubscriptionRepository(this._dioClient);

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  Future<Either<Failure, SubscriptionStatus>> getStatus() async {
    try {
      final response = await _dioClient.get('/subscription/status');
      return Right(SubscriptionStatus.fromJson(
        response.data['data'] as Map<String, dynamic>,
      ));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
