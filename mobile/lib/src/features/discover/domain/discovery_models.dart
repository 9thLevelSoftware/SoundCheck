import 'package:freezed_annotation/freezed_annotation.dart';

part 'discovery_models.freezed.dart';
part 'discovery_models.g.dart';

/// Event model optimized for discover screen display.
/// Extracts relevant fields from the full backend Event response.
@freezed
sealed class DiscoverEvent with _$DiscoverEvent {
  const factory DiscoverEvent({
    required String id,
    required String eventDate,
    String? eventName,
    String? venueName,
    String? venueCity,
    String? venueState,
    double? distanceKm,
    @Default(0) int checkinCount,
    // Headliner band info (from lineup[0] or band compat field)
    String? bandName,
    String? bandGenre,
    String? bandImageUrl,
  }) = _DiscoverEvent;

  /// Parse from backend Event JSON response.
  /// Backend shape: { id, eventDate, eventName, venue: { name, city, state },
  ///   lineup: [{ band: { name, genre, imageUrl } }], band: { name, genre, imageUrl },
  ///   checkinCount, distanceKm }
  factory DiscoverEvent.fromEventJson(Map<String, dynamic> json) {
    // Extract venue info
    final venue = json['venue'] as Map<String, dynamic>?;

    // Extract headliner from band (backward-compat) or lineup[0]
    String? bandName;
    String? bandGenre;
    String? bandImageUrl;

    final band = json['band'] as Map<String, dynamic>?;
    if (band != null) {
      bandName = band['name'] as String?;
      bandGenre = band['genre'] as String?;
      bandImageUrl = band['imageUrl'] as String?;
    } else {
      final lineup = json['lineup'] as List<dynamic>?;
      if (lineup != null && lineup.isNotEmpty) {
        final firstEntry = lineup[0] as Map<String, dynamic>;
        final entryBand = firstEntry['band'] as Map<String, dynamic>?;
        if (entryBand != null) {
          bandName = entryBand['name'] as String?;
          bandGenre = entryBand['genre'] as String?;
          bandImageUrl = entryBand['imageUrl'] as String?;
        }
      }
    }

    return DiscoverEvent(
      id: json['id'] as String,
      eventDate: json['eventDate']?.toString() ?? json['event_date']?.toString() ?? '',
      eventName: json['eventName'] as String? ?? json['event_name'] as String?,
      venueName: venue?['name'] as String?,
      venueCity: venue?['city'] as String?,
      venueState: venue?['state'] as String?,
      distanceKm: json['distanceKm'] != null
          ? (json['distanceKm'] as num).toDouble()
          : null,
      checkinCount: (json['checkinCount'] as int?) ?? 0,
      bandName: bandName,
      bandGenre: bandGenre,
      bandImageUrl: bandImageUrl,
    );
  }

  factory DiscoverEvent.fromJson(Map<String, dynamic> json) =>
      _$DiscoverEventFromJson(json);
}
