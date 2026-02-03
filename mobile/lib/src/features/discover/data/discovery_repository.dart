import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/discovery_models.dart';

class DiscoveryRepository {
  final DioClient _dioClient;

  DiscoveryRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get nearby upcoming events within radius and date range.
  /// GET /api/events/discover?lat=&lon=&radius=&days=&limit=
  Future<List<DiscoverEvent>> getNearbyUpcoming({
    required double lat,
    required double lon,
    double radiusKm = 50,
    int days = 30,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.events}/discover',
        queryParameters: {
          'lat': lat,
          'lon': lon,
          'radius': radiusKm,
          'days': days,
          'limit': limit,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) =>
              DiscoverEvent.fromEventJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get trending events near user (sorted by recent check-in count).
  /// GET /api/events/trending?lat=&lon=&radius=&limit=
  Future<List<DiscoverEvent>> getTrendingNearby({
    required double lat,
    required double lon,
    double radiusKm = 50,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.events}/trending',
        queryParameters: {
          'lat': lat,
          'lon': lon,
          'radius': radiusKm,
          'limit': limit,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) =>
              DiscoverEvent.fromEventJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get events filtered by genre.
  /// GET /api/events/genre/:genre?limit=&offset=
  Future<List<DiscoverEvent>> getEventsByGenre({
    required String genre,
    int limit = 20,
    int offset = 0,
  }) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.events}/genre/$genre',
        queryParameters: {
          'limit': limit,
          'offset': offset,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) =>
              DiscoverEvent.fromEventJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get personalized event recommendations.
  /// GET /api/events/recommended?lat=&lon=&radius=&limit=
  Future<List<DiscoverEvent>> getRecommendations({
    double? lat,
    double? lon,
    double? radiusKm,
    int limit = 20,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'limit': limit,
      };
      if (lat != null) queryParams['lat'] = lat;
      if (lon != null) queryParams['lon'] = lon;
      if (radiusKm != null) queryParams['radius'] = radiusKm;

      final response = await _dioClient.get(
        '${ApiConfig.events}/recommended',
        queryParameters: queryParams,
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) =>
              DiscoverEvent.fromEventJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Search events by name, band, venue, or genre.
  /// GET /api/events/search?q=&limit=
  Future<List<DiscoverEvent>> searchEvents({
    required String query,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.events}/search',
        queryParameters: {
          'q': query,
          'limit': limit,
        },
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) =>
              DiscoverEvent.fromEventJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }
}
