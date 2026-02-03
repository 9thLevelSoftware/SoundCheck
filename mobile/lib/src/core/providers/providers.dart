import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../api/dio_client.dart';
import '../services/biometric_service.dart';
import '../services/websocket_service.dart';
import '../../shared/services/location_service.dart';
import '../../features/auth/data/auth_repository.dart';
import '../../features/auth/domain/user.dart';
import '../../features/venues/data/venue_repository.dart';
import '../../features/bands/data/band_repository.dart';
import '../../features/badges/data/badge_repository.dart';
import '../../features/checkins/data/checkin_repository.dart';
import '../../features/feed/data/feed_repository.dart';
import '../../features/notifications/data/notification_repository.dart';

part 'providers.g.dart';

@Riverpod(keepAlive: true)
BiometricService biometricService(Ref ref) {
  return BiometricService();
}

@Riverpod(keepAlive: true)
WebSocketService webSocketService(Ref ref) {
  final service = WebSocketService();
  ref.onDispose(service.dispose);
  return service;
}

@Riverpod(keepAlive: true)
FlutterSecureStorage secureStorage(Ref ref) {
  return const FlutterSecureStorage();
}

@Riverpod(keepAlive: true)
DioClient dioClient(Ref ref) {
  final secureStorage = ref.watch(secureStorageProvider);
  return DioClient(secureStorage: secureStorage);
}

@Riverpod(keepAlive: true)
AuthRepository authRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  final secureStorage = ref.watch(secureStorageProvider);
  return AuthRepository(
    dioClient: dioClient,
    secureStorage: secureStorage,
  );
}

@Riverpod(keepAlive: true)
VenueRepository venueRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return VenueRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
BandRepository bandRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return BandRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
BadgeRepository badgeRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return BadgeRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
CheckInRepository checkInRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return CheckInRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
NotificationRepository notificationRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return NotificationRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
FeedRepository feedRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return FeedRepository(dioClient: dioClient);
}

@Riverpod(keepAlive: true)
class AuthState extends _$AuthState {
  @override
  Future<User?> build() async {
    final authRepository = ref.watch(authRepositoryProvider);
    final user = await authRepository.getCurrentUser();

    // Connect WebSocket if user is logged in
    if (user != null) {
      _connectWebSocket(user.id);
    }

    return user;
  }

  Future<void> login(String email, String password) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      final authResponse = await authRepository.login(
        LoginRequest(email: email, password: password),
      );

      // Connect WebSocket after successful login
      _connectWebSocket(authResponse.user.id);

      return authResponse.user;
    });
  }

  Future<void> register({
    required String email,
    required String password,
    required String username,
    String? firstName,
    String? lastName,
  }) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      final authResponse = await authRepository.register(
        RegisterRequest(
          email: email,
          password: password,
          username: username,
          firstName: firstName,
          lastName: lastName,
        ),
      );

      // Connect WebSocket after successful registration
      _connectWebSocket(authResponse.user.id);

      return authResponse.user;
    });
  }

  Future<void> logout() async {
    final authRepository = ref.read(authRepositoryProvider);

    // Disconnect WebSocket before logout
    final wsService = ref.read(webSocketServiceProvider);
    wsService.disconnect();

    await authRepository.logout();
    state = const AsyncValue.data(null);
  }

  Future<void> refreshUser() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      return authRepository.getMe();
    });
  }

  /// Connect to WebSocket with authentication
  Future<void> _connectWebSocket(String userId) async {
    try {
      final secureStorage = ref.read(secureStorageProvider);
      final token = await secureStorage.read(key: 'auth_token');

      if (token != null) {
        final wsService = ref.read(webSocketServiceProvider);
        await wsService.connect(authToken: token, userId: userId);
      }
    } catch (e) {
      // WebSocket connection failure shouldn't prevent login
      // Log error but continue
    }
  }
}

/// Location permission state
enum LocationStatus {
  unknown,
  denied,
  deniedForever,
  granted,
  serviceDisabled,
}

/// Provider for current user location
@riverpod
Future<Position?> currentLocation(Ref ref) async {
  return LocationService.getCurrentPosition();
}

/// Provider for location permission status
@riverpod
Future<LocationStatus> locationStatus(Ref ref) async {
  final serviceEnabled = await LocationService.isLocationServiceEnabled();
  if (!serviceEnabled) {
    return LocationStatus.serviceDisabled;
  }

  final permission = await LocationService.checkPermission();
  switch (permission) {
    case LocationPermission.denied:
      return LocationStatus.denied;
    case LocationPermission.deniedForever:
      return LocationStatus.deniedForever;
    case LocationPermission.whileInUse:
    case LocationPermission.always:
      return LocationStatus.granted;
    default:
      return LocationStatus.unknown;
  }
}
