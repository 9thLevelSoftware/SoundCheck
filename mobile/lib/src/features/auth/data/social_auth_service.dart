import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../../../core/api/api_config.dart';
import '../../../core/api/dio_client.dart';
import '../domain/user.dart';

/// Result of social authentication
class SocialAuthResult {
  final User user;
  final String token;
  final String refreshToken;
  final bool isNewUser;

  SocialAuthResult({
    required this.user,
    required this.token,
    required this.refreshToken,
    required this.isNewUser,
  });

  factory SocialAuthResult.fromJson(Map<String, dynamic> json) {
    return SocialAuthResult(
      user: User.fromJson(json['user'] as Map<String, dynamic>),
      token: json['token'] as String,
      refreshToken: json['refreshToken'] as String,
      isNewUser: json['isNewUser'] as bool? ?? false,
    );
  }
}

/// Service for handling social authentication (Google, Apple).
///
/// This service handles the client-side OAuth flow and sends tokens
/// to the backend for verification and account management.
class SocialAuthService {
  final DioClient _dioClient;
  final FlutterSecureStorage _secureStorage;
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  SocialAuthService({
    required DioClient dioClient,
    required FlutterSecureStorage secureStorage,
  })  : _dioClient = dioClient,
        _secureStorage = secureStorage;

  /// Sign in with Google.
  ///
  /// Gets the Google ID token from the client and sends it to the backend
  /// for verification. The backend handles user creation/linking and
  /// returns app-specific auth tokens.
  ///
  /// Returns [SocialAuthResult] with user data and tokens,
  /// or null if the user cancelled the sign-in flow.
  Future<SocialAuthResult?> signInWithGoogle() async {
    try {
      // Step 1: Get Google credentials from client SDK
      final account = await _googleSignIn.signIn();
      if (account == null) return null; // User cancelled

      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception('Failed to get Google ID token');
      }

      // Step 2: Send token to backend for verification
      final response = await _dioClient.post(
        '/auth/social/google',
        data: {'idToken': idToken},
      );

      // Step 3: Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      final result = SocialAuthResult.fromJson(data);

      // Step 4: Save tokens and user data locally
      await _saveAuthData(result);

      return result;
    } catch (e) {
      rethrow;
    }
  }

  /// Sign out from Google.
  Future<void> signOutGoogle() async {
    await _googleSignIn.signOut();
  }

  /// Sign in with Apple.
  ///
  /// Gets the Apple identity token from the client and sends it to the backend
  /// for verification. The backend handles user creation/linking and
  /// returns app-specific auth tokens.
  ///
  /// Note: Apple only provides email/name on first authorization.
  /// Subsequent sign-ins return empty values for these fields.
  ///
  /// Returns [SocialAuthResult] with user data and tokens,
  /// or null if the user cancelled the sign-in flow.
  Future<SocialAuthResult?> signInWithApple() async {
    try {
      // Step 1: Get Apple credentials from client SDK
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      final identityToken = credential.identityToken;
      if (identityToken == null || identityToken.isEmpty) {
        throw Exception('Failed to get Apple identity token');
      }

      // Step 2: Prepare request data with optional name
      // Apple only provides name on first sign-in
      final requestData = <String, dynamic>{
        'identityToken': identityToken,
      };

      // Include name if provided (first sign-in only)
      if (credential.givenName != null || credential.familyName != null) {
        requestData['fullName'] = {
          'givenName': credential.givenName,
          'familyName': credential.familyName,
        };
      }

      // Step 3: Send token to backend for verification
      final response = await _dioClient.post(
        '/auth/social/apple',
        data: requestData,
      );

      // Step 4: Extract data from API wrapper: {success, data, message}
      final data = response.data['data'] as Map<String, dynamic>;
      final result = SocialAuthResult.fromJson(data);

      // Step 5: Save tokens and user data locally
      await _saveAuthData(result);

      return result;
    } catch (e) {
      rethrow;
    }
  }

  /// Save authentication data to secure storage
  Future<void> _saveAuthData(SocialAuthResult result) async {
    await _secureStorage.write(
      key: ApiConfig.tokenKey,
      value: result.token,
    );
    await _secureStorage.write(
      key: ApiConfig.userKey,
      value: jsonEncode(result.user.toJson()),
    );
    // Store refresh token for token renewal
    await _secureStorage.write(
      key: 'refresh_token',
      value: result.refreshToken,
    );
  }
}
