import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';

/// URLs for generated share card images (OG + Stories variants).
class ShareCardUrls {
  final String ogUrl;
  final String storiesUrl;
  const ShareCardUrls({required this.ogUrl, required this.storiesUrl});
}

/// Repository for generating share card images via the backend API.
///
/// The backend generates OG (1200x630) and Stories (1080x1920) card images
/// using satori + resvg-js and uploads them to R2. This repository requests
/// generation and returns the resulting URLs.
class ShareRepository {
  final DioClient _dioClient;

  ShareRepository(this._dioClient);

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Request server to generate check-in share card images.
  Future<Either<Failure, ShareCardUrls>> generateCheckinCard(String checkinId) async {
    try {
      final response = await _dioClient.post('/share/checkin/$checkinId');
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(ShareCardUrls(
        ogUrl: data['ogUrl'] as String,
        storiesUrl: data['storiesUrl'] as String,
      ));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Request server to generate badge share card images.
  Future<Either<Failure, ShareCardUrls>> generateBadgeCard(String badgeAwardId) async {
    try {
      final response = await _dioClient.post('/share/badge/$badgeAwardId');
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
