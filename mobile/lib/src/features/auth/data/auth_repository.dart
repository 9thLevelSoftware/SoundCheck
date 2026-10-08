import 'dart:convert';
import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/auth_session_store.dart';
import '../../../core/error/failures.dart';
import '../domain/user.dart';

class AuthPersistenceResult {
  const AuthPersistenceResult({
    required this.committed,
    required this.revision,
  });

  final bool committed;
  final String? revision;
}

class AuthRepository {
  final DioClient _dioClient;
  final AuthSessionStore _authSessionStore;

  AuthRepository({
    required DioClient dioClient,
    required FlutterSecureStorage secureStorage,
    AuthSessionStore? authSessionStore,
  }) : _dioClient = dioClient,
       _authSessionStore = authSessionStore ?? dioClient.authSessionStore;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Register a new user.
  ///
  /// The API uses the same acknowledgement for a new address and one that
  /// already has an account, and it does not return a session.
  Future<Either<Failure, String>> register(RegisterRequest request) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.auth}/register',
        data: request.toJson(),
      );

      final body = response.data;
      final message = body is Map && body['message'] is String
          ? body['message'] as String
          : 'Check your email to finish creating your account.';
      return Right(message);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Login user
  Future<Either<Failure, AuthResponse>> login(LoginRequest request) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.auth}/login',
        data: request.toJson(),
      );

      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(AuthResponse.fromJson(data));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Persists credentials only while the notifier-owned authentication
  /// operation remains current.
  ///
  /// Callers must serialize this method with logout and newer credential
  /// commits. If the guard changes while a platform write is in flight, the
  /// partial credential set is removed before the serialized section ends.
  Future<bool> persistAuthentication(
    AuthResponse response, {
    required bool Function() isCurrent,
  }) async {
    return (await persistAuthenticationWithRevision(
      response,
      isCurrent: isCurrent,
    )).committed;
  }

  Future<AuthPersistenceResult> persistAuthenticationWithRevision(
    AuthResponse response, {
    required bool Function() isCurrent,
  }) async {
    try {
      final committed = await _authSessionStore.commit(
        accessToken: response.token,
        refreshToken: response.refreshToken,
        userJson: jsonEncode(response.user.toJson()),
        isCurrent: isCurrent,
      );
      if (committed == null) {
        return const AuthPersistenceResult(committed: false, revision: null);
      }
      if (!isCurrent()) {
        await _authSessionStore.invalidateIfActiveRevision(committed.revision);
        return AuthPersistenceResult(
          committed: false,
          revision: committed.revision,
        );
      }
      return AuthPersistenceResult(
        committed: true,
        revision: committed.revision,
      );
    } catch (error) {
      throw _mapErrorToFailure(error);
    }
  }

  Future<void> invalidateAuthenticationRevision(String revision) async {
    await _authSessionStore.invalidateIfActiveRevision(revision);
  }

  /// Logout user
  Future<Either<Failure, AuthSessionInvalidationResult>> logout() async {
    try {
      return Right(await _authSessionStore.invalidate());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  Future<Either<Failure, AuthSessionInvalidationResult>>
  retryLogoutCredentialCleanup() async {
    try {
      return Right(await _authSessionStore.retryResidualCleanup());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get current user from storage
  Future<User?> getCurrentUser() async {
    try {
      final session = await _authSessionStore.readSession();
      if (session == null) return null;

      final userJson = jsonDecode(session.userJson) as Map<String, dynamic>;
      return User.fromJson(userJson);
    } catch (e) {
      return null;
    }
  }

  /// Get current auth token
  Future<String?> getToken() async {
    return _authSessionStore.readAccessToken();
  }

  /// Get current user from API
  Future<Either<Failure, User>> getMe() async {
    try {
      final response = await _dioClient.get('${ApiConfig.auth}/me');
      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(User.fromJson(data));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Update user profile
  Future<Either<Failure, User>> updateProfile(
    Map<String, dynamic> updates,
  ) async {
    try {
      final initiatingSession = await _authSessionStore.readSession();
      if (initiatingSession == null) {
        throw StateError('Cannot update an inactive authentication session');
      }
      final response = await _dioClient.put(
        '${ApiConfig.auth}/me',
        data: updates,
        options: _dioClient.optionsForAuthSession(initiatingSession),
      );

      // Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      final user = User.fromJson(data);

      final updated = await _authSessionStore.updateUserJson(
        jsonEncode(user.toJson()),
        expectedRevision: initiatingSession.revision,
      );
      if (!updated) {
        throw StateError('Cannot update an inactive authentication session');
      }

      return Right(user);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Check if user is authenticated
  Future<bool> isAuthenticated() async {
    final token = await getToken();
    return token != null;
  }

  /// Check username availability
  Future<Either<Failure, bool>> checkUsernameAvailability(
    String username,
  ) async {
    try {
      final response = await _dioClient.get(
        '${ApiConfig.auth}/check-username/$username',
      );
      final data = response.data['data'] as Map<String, dynamic>;
      return Right(data['available'] as bool);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
