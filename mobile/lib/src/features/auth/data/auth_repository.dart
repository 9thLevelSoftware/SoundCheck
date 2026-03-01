import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/user.dart';

class AuthRepository {
  final DioClient _dioClient;
  final FlutterSecureStorage _secureStorage;

  AuthRepository({
    required DioClient dioClient,
    required FlutterSecureStorage secureStorage,
  })  : _dioClient = dioClient,
        _secureStorage = secureStorage;

  /// Register a new user
  Future<AuthResponse> register(RegisterRequest request) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.auth}/register',
        data: request.toJson(),
      );

      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      final authResponse = AuthResponse.fromJson(data);

      // Save token and user data
      await _secureStorage.write(
        key: ApiConfig.tokenKey,
        value: authResponse.token,
      );
      await _secureStorage.write(
        key: ApiConfig.userKey,
        value: jsonEncode(authResponse.user.toJson()),
      );

      return authResponse;
    } catch (e) {
      rethrow;
    }
  }

  /// Login user
  Future<AuthResponse> login(LoginRequest request) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.auth}/login',
        data: request.toJson(),
      );

      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      final authResponse = AuthResponse.fromJson(data);

      // Save token and user data
      await _secureStorage.write(
        key: ApiConfig.tokenKey,
        value: authResponse.token,
      );
      await _secureStorage.write(
        key: ApiConfig.userKey,
        value: jsonEncode(authResponse.user.toJson()),
      );

      return authResponse;
    } catch (e) {
      rethrow;
    }
  }

  /// Logout user
  Future<void> logout() async {
    try {
      await _secureStorage.delete(key: ApiConfig.tokenKey);
      await _secureStorage.delete(key: ApiConfig.userKey);
    } catch (e) {
      rethrow;
    }
  }

  /// Get current user from storage
  Future<User?> getCurrentUser() async {
    try {
      final userData = await _secureStorage.read(key: ApiConfig.userKey);
      if (userData == null) return null;
      
      final userJson = jsonDecode(userData) as Map<String, dynamic>;
      return User.fromJson(userJson);
    } catch (e) {
      return null;
    }
  }

  /// Get current auth token
  Future<String?> getToken() async {
    try {
      return await _secureStorage.read(key: ApiConfig.tokenKey);
    } catch (e) {
      return null;
    }
  }

  /// Get current user from API
  Future<User> getMe() async {
    try {
      final response = await _dioClient.get('${ApiConfig.auth}/me');
      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      return User.fromJson(data);
    } catch (e) {
      rethrow;
    }
  }

  /// Update user profile
  Future<User> updateProfile(Map<String, dynamic> updates) async {
    try {
      final response = await _dioClient.put(
        '${ApiConfig.auth}/me',
        data: updates,
      );

      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      final user = User.fromJson(data);

      // Update stored user data
      await _secureStorage.write(
        key: ApiConfig.userKey,
        value: jsonEncode(user.toJson()),
      );

      return user;
    } catch (e) {
      rethrow;
    }
  }

  /// Check if user is authenticated
  Future<bool> isAuthenticated() async {
    final token = await getToken();
    return token != null;
  }

  /// Check username availability
  Future<bool> checkUsernameAvailability(String username) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.auth}/check-username/$username',
      );
      final data = response.data['data'] as Map<String, dynamic>;
      return data['available'] as bool;
    } catch (e) {
      return true;
    }
  }
}
