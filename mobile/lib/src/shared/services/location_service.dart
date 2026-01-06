import 'package:geolocator/geolocator.dart';
import '../../core/services/log_service.dart';

/// Location service for handling GPS and location permissions
class LocationService {
  /// Check if location services are enabled
  static Future<bool> isLocationServiceEnabled() async {
    return await Geolocator.isLocationServiceEnabled();
  }

  /// Check current location permission status
  static Future<LocationPermission> checkPermission() async {
    return await Geolocator.checkPermission();
  }

  /// Request location permission
  static Future<LocationPermission> requestPermission() async {
    return await Geolocator.requestPermission();
  }

  /// Get current position with error handling
  ///
  /// Returns null if:
  /// - Location services are disabled
  /// - Permission is denied
  /// - Unable to get location
  static Future<Position?> getCurrentPosition() async {
    try {
      // Check if location services are enabled
      final serviceEnabled = await isLocationServiceEnabled();
      if (!serviceEnabled) {
        return null;
      }

      // Check permission
      var permission = await checkPermission();

      // Request permission if denied
      if (permission == LocationPermission.denied) {
        permission = await requestPermission();
        if (permission == LocationPermission.denied) {
          return null;
        }
      }

      // Check for permanent denial
      if (permission == LocationPermission.deniedForever) {
        return null;
      }

      // Get position
      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );
    } catch (e) {
      LogService.e('Error getting location', e);
      return null;
    }
  }

  /// Calculate distance between two coordinates in kilometers
  static double calculateDistance(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    return Geolocator.distanceBetween(lat1, lon1, lat2, lon2) / 1000;
  }

  /// Open location settings if permission is permanently denied
  static Future<bool> openLocationSettings() async {
    return await Geolocator.openLocationSettings();
  }

  /// Open app settings to manually enable location permission
  static Future<bool> openAppSettings() async {
    return await Geolocator.openAppSettings();
  }

  /// Get location permission status as user-friendly string
  static String getPermissionStatusMessage(LocationPermission permission) {
    switch (permission) {
      case LocationPermission.denied:
        return 'Location permission denied. Please grant permission to find nearby venues.';
      case LocationPermission.deniedForever:
        return 'Location permission permanently denied. Please enable it in app settings to find nearby venues.';
      case LocationPermission.whileInUse:
      case LocationPermission.always:
        return 'Location permission granted.';
      default:
        return 'Location permission status unknown.';
    }
  }

  /// Check if we have sufficient permission to use location
  static bool hasPermission(LocationPermission permission) {
    return permission == LocationPermission.whileInUse ||
        permission == LocationPermission.always;
  }
}
