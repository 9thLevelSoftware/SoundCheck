import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:geolocator/geolocator.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../api/dio_client.dart';
import '../services/biometric_service.dart';
import '../../shared/services/location_service.dart';
import '../../features/auth/data/auth_repository.dart';
import '../../features/auth/domain/user.dart';
import '../../features/venues/data/venue_repository.dart';
import '../../features/bands/data/band_repository.dart';
import '../../features/badges/data/badge_repository.dart';
import '../../features/checkins/data/checkin_repository.dart';

part 'providers.g.dart';

@Riverpod(keepAlive: true)
BiometricService biometricService(Ref ref) {
  return BiometricService();
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
class AuthState extends _$AuthState {
  @override
  Future<User?> build() async {
    final authRepository = ref.watch(authRepositoryProvider);
    return authRepository.getCurrentUser();
  }

  Future<void> login(String email, String password) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final authRepository = ref.read(authRepositoryProvider);
      final authResponse = await authRepository.login(
        LoginRequest(email: email, password: password),
      );
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
      return authResponse.user;
    });
  }

  Future<void> logout() async {
    final authRepository = ref.read(authRepositoryProvider);
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
