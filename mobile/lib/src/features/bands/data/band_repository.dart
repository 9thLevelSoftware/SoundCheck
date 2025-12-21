import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/band.dart';

class BandRepository {
  final DioClient _dioClient;

  BandRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get all bands with optional filters
  Future<List<Band>> getBands({
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
      return bands.map((json) => Band.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get band by ID
  Future<Band> getBandById(String id) async {
    try {
      final response = await _dioClient.get('${ApiConfig.bands}/$id');
      final bandData = response.data['data'] as Map<String, dynamic>;
      return Band.fromJson(bandData);
    } catch (e) {
      rethrow;
    }
  }

  /// Get popular bands
  Future<List<Band>> getPopularBands({int limit = 10}) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.bands}/popular',
        queryParameters: {'limit': limit},
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => Band.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get trending bands
  Future<List<Band>> getTrendingBands({int limit = 10}) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.bands}/trending',
        queryParameters: {'limit': limit},
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => Band.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get all genres
  Future<List<String>> getGenres() async {
    try {
      final response = await _dioClient.get('${ApiConfig.bands}/genres');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.cast<String>();
    } catch (e) {
      rethrow;
    }
  }

  /// Create a new band (admin only)
  Future<Band> createBand(CreateBandRequest request) async {
    try {
      final response = await _dioClient.post(
        ApiConfig.bands,
        data: request.toJson(),
      );
      final bandData = response.data['data'] as Map<String, dynamic>;
      return Band.fromJson(bandData);
    } catch (e) {
      rethrow;
    }
  }

  /// Update band (admin only)
  Future<Band> updateBand(String id, Map<String, dynamic> updates) async {
    try {
      final response = await _dioClient.put(
        '${ApiConfig.bands}/$id',
        data: updates,
      );
      final bandData = response.data['data'] as Map<String, dynamic>;
      return Band.fromJson(bandData);
    } catch (e) {
      rethrow;
    }
  }

  /// Delete band (admin only)
  Future<void> deleteBand(String id) async {
    try {
      await _dioClient.delete('${ApiConfig.bands}/$id');
    } catch (e) {
      rethrow;
    }
  }
}
