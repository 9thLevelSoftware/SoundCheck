import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';

/// Event data from the trending endpoint (GET /api/trending).
/// Uses Wilson-scored composite ranking from Plan 11-02.
class TrendingEvent {
  final String id;
  final String eventName;
  final String eventDate;
  final String venueName;
  final String venueCity;
  final String venueState;
  final int rsvpCount;
  final int checkinVelocity;
  final int friendSignals;
  final double distanceKm;
  final double trendingScore;
  final String? imageUrl;
  final List<String>? lineupBands;

  const TrendingEvent({
    required this.id,
    required this.eventName,
    required this.eventDate,
    required this.venueName,
    required this.venueCity,
    required this.venueState,
    required this.rsvpCount,
    required this.checkinVelocity,
    required this.friendSignals,
    required this.distanceKm,
    required this.trendingScore,
    this.imageUrl,
    this.lineupBands,
  });

  factory TrendingEvent.fromJson(Map<String, dynamic> json) {
    return TrendingEvent(
      id: json['id'] as String,
      eventName: (json['eventName'] ?? json['event_name'] ?? '') as String,
      eventDate: (json['eventDate'] ?? json['event_date'] ?? '') as String,
      venueName: (json['venueName'] ?? json['venue_name'] ?? '') as String,
      venueCity: (json['venueCity'] ?? json['venue_city'] ?? '') as String,
      venueState: (json['venueState'] ?? json['venue_state'] ?? '') as String,
      rsvpCount: (json['rsvpCount'] ?? json['rsvp_count'] ?? 0) as int,
      checkinVelocity:
          (json['checkinVelocity'] ?? json['checkin_velocity'] ?? 0) as int,
      friendSignals:
          (json['friendSignals'] ?? json['friend_signals'] ?? 0) as int,
      distanceKm: ((json['distanceKm'] ?? json['distance_km'] ?? 0) as num)
          .toDouble(),
      trendingScore:
          ((json['trendingScore'] ?? json['trending_score'] ?? 0) as num)
              .toDouble(),
      imageUrl: json['imageUrl'] as String? ?? json['image_url'] as String?,
      lineupBands: (json['lineupBands'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          (json['lineup_bands'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList(),
    );
  }
}

/// Repository for trending events via GET /api/trending.
/// Follows existing DioClient pattern (see rsvp_repository.dart).
class TrendingRepository {
  final DioClient _dioClient;

  TrendingRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Fetch trending events near a location.
  /// GET /api/trending?lat=X&lon=Y&radius=80&days=30&limit=20
  Future<Either<Failure, List<TrendingEvent>>> getTrendingNearby({
    required double lat,
    required double lon,
    int radius = 80,
    int days = 30,
    int limit = 20,
  }) async {
    try {
      final response = await _dioClient.get(
        '/trending',
        queryParameters: {
          'lat': lat,
          'lon': lon,
          'radius': radius,
          'days': days,
          'limit': limit,
        },
      );
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(data
          .map((e) => TrendingEvent.fromJson(e as Map<String, dynamic>))
          .toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
