import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/venue.dart';

class VenueRepository {
  final DioClient _dioClient;

  VenueRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get all venues with optional filters
  Future<List<Venue>> getVenues({
    String? search,
    String? city,
    String? venueType,
    double? minRating,
    int? minCapacity,
    int? maxCapacity,
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
      if (city != null) queryParams['city'] = city;
      if (venueType != null) queryParams['venueType'] = venueType;
      if (minRating != null) queryParams['rating'] = minRating;
      if (minCapacity != null) queryParams['minCapacity'] = minCapacity;
      if (maxCapacity != null) queryParams['maxCapacity'] = maxCapacity;
      if (sortBy != null) queryParams['sort'] = sortBy;

      final response = await _dioClient.get(
        ApiConfig.venues,
        queryParameters: queryParams,
      );

      // API returns: { success: true, data: { venues: [...], total, page, totalPages } }
      final responseData = response.data['data'] as Map<String, dynamic>;
      final List<dynamic> venues = responseData['venues'] as List<dynamic>;
      return venues.map((json) => Venue.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get venue by ID
  Future<Venue> getVenueById(String id) async {
    try {
      final response = await _dioClient.get('${ApiConfig.venues}/$id');
      // API returns: { success: true, data: { venue object } }
      final venueData = response.data['data'] as Map<String, dynamic>;
      return Venue.fromJson(venueData);
    } catch (e) {
      rethrow;
    }
  }

  /// Get popular venues
  Future<List<Venue>> getPopularVenues({int limit = 10}) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.venues}/popular',
        queryParameters: {'limit': limit},
      );

      // API returns: { success: true, data: [...venues...] }
      final List<dynamic> venues = response.data['data'] as List<dynamic>;
      return venues.map((json) => Venue.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get nearby venues
  Future<List<Venue>> getNearbyVenues({
    required double latitude,
    required double longitude,
    double radius = 50, // km
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.venues}/near',
        queryParameters: {
          'lat': latitude,
          'lng': longitude,
          'radius': radius,
          'limit': limit,
        },
      );

      // API returns: { success: true, data: [...venues...] }
      final List<dynamic> venues = response.data['data'] as List<dynamic>;
      return venues.map((json) => Venue.fromJson(json)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Create a new venue (admin only)
  Future<Venue> createVenue(CreateVenueRequest request) async {
    try {
      final response = await _dioClient.post(
        ApiConfig.venues,
        data: request.toJson(),
      );
      // API returns: { success: true, data: { venue object } }
      final venueData = response.data['data'] as Map<String, dynamic>;
      return Venue.fromJson(venueData);
    } catch (e) {
      rethrow;
    }
  }

  /// Update venue (admin only)
  Future<Venue> updateVenue(String id, Map<String, dynamic> updates) async {
    try {
      final response = await _dioClient.put(
        '${ApiConfig.venues}/$id',
        data: updates,
      );
      // API returns: { success: true, data: { venue object } }
      final venueData = response.data['data'] as Map<String, dynamic>;
      return Venue.fromJson(venueData);
    } catch (e) {
      rethrow;
    }
  }

  /// Delete venue (admin only)
  Future<void> deleteVenue(String id) async {
    try {
      await _dioClient.delete('${ApiConfig.venues}/$id');
    } catch (e) {
      rethrow;
    }
  }
}
