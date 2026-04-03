import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';
import '../domain/badge.dart';

class BadgeRepository {
  final DioClient _dioClient;

  BadgeRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Get all available badges
  Future<Either<Failure, List<Badge>>> getAllBadges() async {
    try {
      final response = await _dioClient.get(ApiConfig.badges);
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => Badge.fromJson(json as Map<String, dynamic>)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get user's earned badges
  Future<Either<Failure, List<UserBadge>>> getMyBadges() async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/my-badges');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => UserBadge.fromJson(json as Map<String, dynamic>)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get a specific user's earned badges
  Future<Either<Failure, List<UserBadge>>> getUserBadges(String userId) async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/user/$userId');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => UserBadge.fromJson(json as Map<String, dynamic>)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get user's badge progress
  Future<Either<Failure, List<BadgeProgress>>> getMyProgress() async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/my-progress');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => BadgeProgress.fromJson(json as Map<String, dynamic>)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get badge rarity percentages for all badges
  Future<Either<Failure, List<BadgeRarity>>> getRarity() async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/rarity');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => BadgeRarity.fromJson(json as Map<String, dynamic>)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Check for newly earned badges (manual debug trigger -- badge eval is automatic)
  Future<Either<Failure, List<UserBadge>>> checkNewBadges() async {
    try {
      final response = await _dioClient.post('${ApiConfig.badges}/check-awards');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => UserBadge.fromJson(json as Map<String, dynamic>)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
