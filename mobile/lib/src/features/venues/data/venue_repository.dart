import 'dart:developer';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/paginated_venues.dart';
import '../domain/venue.dart';

class VenueRepository {
  final DioClient _dioClient;

  VenueRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get all venues with optional filters and server-side pagination
  /// Returns paginated response with venues, total, page, and totalPages
  Future<PaginatedVenues> getVenues({
    String? search,
    String? city,
    String? venueType,
    double? minRating,
    int? minCapacity,
    int? maxCapacity,
    String? sortBy,
    required int page,
    required int limit,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'page': page,
        'limit': limit,
      };

      if (search != null && search.isNotEmpty) queryParams['q'] = search;
      if (city != null && city.isNotEmpty) queryParams['city'] = city;
      if (venueType != null && venueType.isNotEmpty) queryParams['venueType'] = venueType;
      if (minRating != null) queryParams['rating'] = minRating;
      if (minCapacity != null) queryParams['minCapacity'] = minCapacity;
      if (maxCapacity != null) queryParams['maxCapacity'] = maxCapacity;
      if (sortBy != null && sortBy.isNotEmpty) queryParams['sort'] = sortBy;

      final response = await _dioClient.get(
        ApiConfig.venues,
        queryParameters: queryParams,
      );

      // API returns: { success: true, data: { venues: [...], total, page, totalPages } }
      final responseData = response.data['data'] as Map<String, dynamic>;
      return PaginatedVenues.fromJson(responseData);
    } catch (e) {
      log('Error fetching venues: $e');
      rethrow;
    }
  }

  /// Search venues with server-side pagination and filtering
  /// This is an alias for getVenues to provide a clearer API
  Future<PaginatedVenues> searchVenues({
    String? query,
    String? city,
    String? venueType,
    double? minRating,
    int? minCapacity,
    int? maxCapacity,
    String? sortBy,
    required int page,
    required int limit,
  }) async {
    return getVenues(
      search: query,
      city: city,
      venueType: venueType,
      minRating: minRating,
      minCapacity: minCapacity,
      maxCapacity: maxCapacity,
      sortBy: sortBy,
      page: page,
      limit: limit,
    );
  }

  /// Get venue by ID
  Future<Venue> getVenueById(String id) async {
    try {
      final response = await _dioClient.get('${ApiConfig.venues}/$id');
      // API returns: { success: true, data: { venue object } }
      final venueData = response.data['data'] as Map<String, dynamic>;
      return Venue.fromJson(venueData);
    } catch (e) {
      log('Error fetching venue by ID: $e');
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
      return venues.map((json) => Venue.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      log('Error fetching popular venues: $e');
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
      return venues.map((json) => Venue.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      log('Error fetching nearby venues: $e');
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
      log('Error creating venue: $e');
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
      log('Error updating venue: $e');
      rethrow;
    }
  }

  /// Delete venue (admin only)
  Future<void> deleteVenue(String id) async {
    try {
      await _dioClient.delete('${ApiConfig.venues}/$id');
    } catch (e) {
      log('Error deleting venue: $e');
      rethrow;
    }
  }
}
