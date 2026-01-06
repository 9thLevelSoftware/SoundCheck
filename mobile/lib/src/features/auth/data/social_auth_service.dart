import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Service for handling social authentication (Google, Apple).
///
/// Note: Full functionality requires developer console setup:
/// - Google: Configure OAuth 2.0 in Google Cloud Console
/// - Apple: Configure Sign in with Apple in Apple Developer Portal
class SocialAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: ['email', 'profile'],
  );

  /// Sign in with Google.
  ///
  /// Returns a map containing user credentials and profile info,
  /// or null if the user cancelled the sign-in flow.
  ///
  /// TODO: Backend verification - send idToken to backend for verification
  /// and exchange for app-specific auth tokens.
  Future<Map<String, String>?> signInWithGoogle() async {
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) return null;

      final auth = await account.authentication;
      return {
        'idToken': auth.idToken ?? '',
        'accessToken': auth.accessToken ?? '',
        'email': account.email,
        'displayName': account.displayName ?? '',
      };
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
  /// Returns a map containing user credentials and profile info,
  /// or null if the user cancelled the sign-in flow.
  ///
  /// Note: Apple only provides email/name on first authorization.
  /// Subsequent sign-ins return empty values for these fields.
  ///
  /// TODO: Backend verification - send identityToken to backend for verification
  /// and exchange for app-specific auth tokens.
  Future<Map<String, String>?> signInWithApple() async {
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      return {
        'identityToken': credential.identityToken ?? '',
        'authorizationCode': credential.authorizationCode,
        'email': credential.email ?? '',
        'givenName': credential.givenName ?? '',
        'familyName': credential.familyName ?? '',
      };
    } catch (e) {
      rethrow;
    }
  }
}
