import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';
import '../domain/concert_cred.dart';
import '../domain/user_statistics.dart';

class ProfileRepository {
  final DioClient _dioClient;

  ProfileRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Get user statistics
  Future<Either<Failure, UserStatistics>> getUserStatistics() async {
    try {
      final response = await _dioClient.get('${ApiConfig.auth}/me/statistics');
      final statisticsData = response.data['data'] as Map<String, dynamic>;
      return Right(UserStatistics.fromJson(statisticsData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get concert cred aggregate stats for a user
  Future<Either<Failure, ConcertCred>> getConcertCred(String userId) async {
    try {
      final response = await _dioClient.get(ApiConfig.concertCred(userId));
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(ConcertCred.fromJson(data));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Upload profile image via multipart form data
  Future<Either<Failure, String>> uploadProfileImage(String filePath) async {
    try {
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(filePath),
      });
      final response = await _dioClient.post(
        '${ApiConfig.auth}/me/profile-image',
        data: formData,
      );
      final responseData = response.data['data'] as Map<String, dynamic>;
      return Right(responseData['imageUrl'] as String);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
