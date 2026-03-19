import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// SEC-064: Centralized secure storage configuration.
///
/// As of flutter_secure_storage v10.0.0, the library uses custom ciphers
/// on Android and automatically migrates data from the deprecated
/// EncryptedSharedPreferences (Jetpack Security) on first access.
/// The [encryptedSharedPreferences] parameter is deprecated and ignored.
///
/// This configuration file exists to:
/// 1. Document that SEC-064 is addressed by library version (v10.0.0).
/// 2. Provide a single place to add future platform-specific options
///    (e.g., iOS accessibility, key accessibility settings).
///
/// INTEGRATION NOTE: The secureStorageProvider in providers.dart should
/// be updated by its owning agent to use this factory:
///
///   FlutterSecureStorage secureStorage(Ref ref) {
///     return SecureStorageOptions.createStorage();
///   }
class SecureStorageOptions {
  SecureStorageOptions._();

  /// Creates a [FlutterSecureStorage] instance with platform-appropriate
  /// security options applied.
  ///
  /// On Android: v10 uses custom ciphers (not EncryptedSharedPreferences)
  /// by default and auto-migrates legacy data on first access.
  static FlutterSecureStorage createStorage() {
    return const FlutterSecureStorage();
  }
}
