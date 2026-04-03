import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';
import '../../sharing/data/share_repository.dart';
import '../domain/wrapped_stats.dart';

class WrappedRepository {
  final DioClient _dioClient;
  WrappedRepository(this._dioClient);

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  Future<Either<Failure, WrappedStats>> getWrappedStats(int year) async {
    try {
      final response = await _dioClient.get('/wrapped/$year');
      return Right(WrappedStats.fromJson(response.data['data'] as Map<String, dynamic>));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  Future<Either<Failure, WrappedStats>> getWrappedDetailStats(int year) async {
    try {
      final response = await _dioClient.get('/wrapped/$year/detail');
      return Right(WrappedStats.fromJson(response.data['data'] as Map<String, dynamic>));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  Future<Either<Failure, ShareCardUrls>> generateSummaryCard(int year) async {
    try {
      final response = await _dioClient.post('/wrapped/$year/card/summary');
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(ShareCardUrls(
        ogUrl: data['ogUrl'] as String,
        storiesUrl: data['storiesUrl'] as String,
      ));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  Future<Either<Failure, ShareCardUrls>> generateStatCard(int year, String statType) async {
    try {
      final response = await _dioClient.post('/wrapped/$year/card/$statType');
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(ShareCardUrls(
        ogUrl: data['ogUrl'] as String,
        storiesUrl: data['storiesUrl'] as String,
      ));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
