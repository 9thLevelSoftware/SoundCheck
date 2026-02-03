import 'package:freezed_annotation/freezed_annotation.dart';

part 'nearby_event.freezed.dart';
part 'nearby_event.g.dart';

/// NearbyEvent - An event near the user's GPS location
/// Used for the event-first check-in flow
@freezed
sealed class NearbyEvent with _$NearbyEvent {
  const factory NearbyEvent({
    required String id,
    required String eventDate,
    String? eventName,
    String? doorsTime,
    String? startTime,
    String? endTime,
    @Default(false) bool isCancelled,
    @Default(false) bool isSoldOut,
    String? source,
    double? distanceKm,
    int? checkinCount,
    NearbyEventVenue? venue,
    List<NearbyEventLineup>? lineup,
    // backward compat
    String? bandId,
    NearbyEventBand? band,
  }) = _NearbyEvent;

  factory NearbyEvent.fromJson(Map<String, dynamic> json) =>
      _$NearbyEventFromJson(json);
}

/// Venue info nested in a nearby event
@freezed
sealed class NearbyEventVenue with _$NearbyEventVenue {
  const factory NearbyEventVenue({
    required String id,
    required String name,
    String? city,
    String? state,
    String? imageUrl,
  }) = _NearbyEventVenue;

  factory NearbyEventVenue.fromJson(Map<String, dynamic> json) =>
      _$NearbyEventVenueFromJson(json);
}

/// Band info nested in a nearby event
@freezed
sealed class NearbyEventBand with _$NearbyEventBand {
  const factory NearbyEventBand({
    required String id,
    required String name,
    String? genre,
    String? imageUrl,
  }) = _NearbyEventBand;

  factory NearbyEventBand.fromJson(Map<String, dynamic> json) =>
      _$NearbyEventBandFromJson(json);
}

/// Lineup entry for an event (band performing at a set)
@freezed
sealed class NearbyEventLineup with _$NearbyEventLineup {
  const factory NearbyEventLineup({
    required String bandId,
    int? setOrder,
    @Default(false) bool isHeadliner,
    NearbyEventBand? band,
  }) = _NearbyEventLineup;

  factory NearbyEventLineup.fromJson(Map<String, dynamic> json) =>
      _$NearbyEventLineupFromJson(json);
}
