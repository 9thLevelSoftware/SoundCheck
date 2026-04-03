import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';

/// Repository for onboarding-related API calls.
///
/// Provides genre preference CRUD and onboarding completion tracking.
/// Backend endpoints from Plan 10-01: /api/onboarding/*
class OnboardingRepository {
  final DioClient _dioClient;

  OnboardingRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Save user's genre preferences (3-8 genres).
  /// POST /api/onboarding/genres
  Future<Either<Failure, void>> saveGenrePreferences(List<String> genres) async {
    try {
      await _dioClient.post(
        '/onboarding/genres',
        data: {'genres': genres},
      );
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get user's saved genre preferences.
  /// GET /api/onboarding/genres
  Future<Either<Failure, List<String>>> getGenrePreferences() async {
    try {
      final response = await _dioClient.get('/onboarding/genres');
      return Right(List<String>.from(response.data['data']['genres'] ?? []));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Mark onboarding as complete on the backend.
  /// POST /api/onboarding/complete
  Future<Either<Failure, void>> completeOnboarding() async {
    try {
      await _dioClient.post('/onboarding/complete');
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Check if onboarding is complete on the backend.
  /// GET /api/onboarding/status
  Future<Either<Failure, bool>> isOnboardingComplete() async {
    try {
      final response = await _dioClient.get('/onboarding/status');
      return Right(response.data['data']['completed'] ?? false);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
