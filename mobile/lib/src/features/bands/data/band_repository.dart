import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';
import '../domain/band.dart';

class BandRepository {
  final DioClient _dioClient;

  BandRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Get all bands with optional filters
  Future<Either<Failure, List<Band>>> getBands({
    String? search,
    String? genre,
    String? hometown,
    double? minRating,
    String? sortBy,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'page': page,
        'limit': limit,
      };

      if (search != null) queryParams['q'] = search;
      if (genre != null) queryParams['genre'] = genre;
      if (hometown != null) queryParams['hometown'] = hometown;
      if (minRating != null) queryParams['rating'] = minRating;
      if (sortBy != null) queryParams['sort'] = sortBy;

      final response = await _dioClient.get(
        ApiConfig.bands,
        queryParameters: queryParams,
      );

      // Backend returns paginated object: { bands: [...], total, page, totalPages }
      final responseData = response.data['data'] as Map<String, dynamic>;
      final List<dynamic> bands = responseData['bands'] as List<dynamic>;
      return Right(bands.map((json) => Band.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get band by ID
  Future<Either<Failure, Band>> getBandById(String id) async {
    try {
      final response = await _dioClient.get('${ApiConfig.bands}/$id');
      final bandData = response.data['data'] as Map<String, dynamic>;
      return Right(Band.fromJson(bandData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get popular bands
  Future<Either<Failure, List<Band>>> getPopularBands({int limit = 10}) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.bands}/popular',
        queryParameters: {'limit': limit},
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => Band.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get trending bands
  Future<Either<Failure, List<Band>>> getTrendingBands({int limit = 10}) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.bands}/trending',
        queryParameters: {'limit': limit},
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.map((json) => Band.fromJson(json)).toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get all genres
  Future<Either<Failure, List<String>>> getGenres() async {
    try {
      final response = await _dioClient.get('${ApiConfig.bands}/genres');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data.cast<String>());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Create a new band (admin only)
  Future<Either<Failure, Band>> createBand(CreateBandRequest request) async {
    try {
      final response = await _dioClient.post(
        ApiConfig.bands,
        data: request.toJson(),
      );
      final bandData = response.data['data'] as Map<String, dynamic>;
      return Right(Band.fromJson(bandData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Update band (admin only)
  Future<Either<Failure, Band>> updateBand(String id, Map<String, dynamic> updates) async {
    try {
      final response = await _dioClient.put(
        '${ApiConfig.bands}/$id',
        data: updates,
      );
      final bandData = response.data['data'] as Map<String, dynamic>;
      return Right(Band.fromJson(bandData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Delete band (admin only)
  Future<Either<Failure, void>> deleteBand(String id) async {
    try {
      await _dioClient.delete('${ApiConfig.bands}/$id');
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
