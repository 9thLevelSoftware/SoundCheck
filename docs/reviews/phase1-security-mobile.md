# Phase 1: Mobile Security Audit -- SoundCheck Flutter App

**Audit Date:** 2026-03-18
**Auditor:** Security Engineer (automated review)
**Scope:** `mobile/lib/src/` -- Flutter client, platform configs, auth flows, state management
**App Version:** Pre-beta (master branch)
**Target Audience:** ~500-2,000 invite-only beta users

---

## Summary

| Severity | Count |
|----------|-------|
| Blocker  | 1     |
| High     | 5     |
| Medium   | 6     |
| Low      | 5     |
| **Total**| **17**|

**Overall Assessment:** The application has a solid security foundation -- tokens are stored in `flutter_secure_storage`, TLS is enforced for production traffic, and ProGuard obfuscation is enabled for release builds. However, several issues must be resolved before beta launch. One blocker (token refresh race condition / silent credential wipe on 401) and five high-severity findings were identified. The most impactful gaps are in the Dio 401 handler, incomplete logout cleanup, WebSocket token exposure over plaintext in dev, and Sentry screenshot capture of sensitive screens.

---

## Findings

### [SEC-050]: Dio 401 Handler Silently Wipes Credentials Without Token Refresh or User Notification
**Severity:** Blocker
**File(s):** `mobile/lib/src/core/api/dio_client.dart:41-48`
**Description:** When any API request returns HTTP 401, the interceptor immediately deletes both `auth_token` and `user_data` from secure storage and then passes the error through. There is no token refresh attempt, no user notification, and no coordination with the `AuthState` provider. This creates three problems:

1. **No refresh token flow:** The `SocialAuthService` stores a `refresh_token` (line 185-188 of `social_auth_service.dart`), but the Dio interceptor never attempts to use it. A single expired JWT silently logs the user out.
2. **Race condition on concurrent 401s:** If multiple API calls fire simultaneously and all get 401, each independently deletes credentials and passes errors through. The `AuthState` provider is never formally set to `null`, causing the app to remain in a stale authenticated state while storage is empty.
3. **Silent credential destruction:** The user receives no feedback that they were logged out. The UI may continue to show authenticated screens until the next router redirect check.

**Evidence:**
```dart
// dio_client.dart:41-48
onError: (error, handler) async {
  if (error.response?.statusCode == 401) {
    // Token expired or invalid - clear storage
    await _secureStorage.delete(key: ApiConfig.tokenKey);
    await _secureStorage.delete(key: ApiConfig.userKey);
  }
  return handler.next(error);
},
```
**Recommended Fix:**
- Implement a `QueuedInterceptor` (Dio's built-in class) instead of `InterceptorsWrapper` to serialize concurrent 401 handling.
- On the first 401, attempt a token refresh using the stored `refresh_token`. If the refresh succeeds, retry the original request with the new token. If the refresh fails, then clear credentials and navigate to login.
- Notify the `AuthState` provider to transition to an unauthenticated state so the router redirect fires immediately.
- Use a lock/mutex pattern to prevent multiple concurrent 401 handlers from racing.

---

### [SEC-051]: Logout Does Not Clear Sentry User Context or Analytics User ID
**Severity:** High
**File(s):** `mobile/lib/src/core/providers/providers.dart:171-186`
**Description:** The `AuthState.logout()` method disconnects WebSocket, clears RevenueCat identity, and deletes token/user from secure storage, but it never calls `CrashReportingService.clearUser()` or `AnalyticsService.clearUserId()`. After logout, if the device is shared or a different user logs in, crash reports and analytics events will continue to be attributed to the previous user. The `CrashReportingService.setUser()` method exists (line 125 of `crash_reporting_service.dart`) but is never called on login either -- so Sentry never has user context at all, while `AnalyticsService.setUserId()` also appears unused.

**Evidence:**
```dart
// providers.dart:171-186  --  logout() method
Future<void> logout() async {
  final authRepository = ref.read(authRepositoryProvider);
  final wsService = ref.read(webSocketServiceProvider);
  wsService.disconnect();
  try {
    await SubscriptionService.logout();
    ref.read(isPremiumProvider.notifier).set(false);
  } catch (_) {}
  await authRepository.logout();
  state = const AsyncValue.data(null);
  // Missing: CrashReportingService.clearUser()
  // Missing: AnalyticsService.clearUserId()
}
```
Grep confirms no call sites for `CrashReportingService.setUser` or `AnalyticsService.setUserId` anywhere in the providers or auth flow.

**Recommended Fix:**
- In `AuthState.login()` and `AuthState.register()`, after successful authentication, call:
  - `CrashReportingService.setUser(user.id, user.email)`
  - `AnalyticsService.setUserId(user.id)`
- In `AuthState.logout()`, call:
  - `CrashReportingService.clearUser()`
  - `AnalyticsService.clearUserId()`

---

### [SEC-052]: Logout Does Not Clear Social Auth Refresh Token from Secure Storage
**Severity:** High
**File(s):** `mobile/lib/src/features/auth/data/auth_repository.dart:74-81`, `mobile/lib/src/features/auth/data/social_auth_service.dart:184-188`
**Description:** The `SocialAuthService._saveAuthData()` method stores a `refresh_token` in secure storage (key: `'refresh_token'`), but `AuthRepository.logout()` only deletes `auth_token` and `user_data`. The refresh token persists after logout. An attacker with physical device access after logout could extract this token and potentially obtain a new access token.

**Evidence:**
```dart
// social_auth_service.dart:184-188 -- saves refresh_token
await _secureStorage.write(
  key: 'refresh_token',
  value: result.refreshToken,
);

// auth_repository.dart:74-81 -- logout only clears 2 of 3 keys
Future<void> logout() async {
  try {
    await _secureStorage.delete(key: ApiConfig.tokenKey);  // auth_token
    await _secureStorage.delete(key: ApiConfig.userKey);    // user_data
    // Missing: _secureStorage.delete(key: 'refresh_token')
  } catch (e) {
    rethrow;
  }
}
```
**Recommended Fix:**
Add `await _secureStorage.delete(key: 'refresh_token');` to the `AuthRepository.logout()` method. Consider centralizing all storage key constants in `ApiConfig` to prevent future omissions.

---

### [SEC-053]: Sentry Captures Screenshots and View Hierarchy in Production
**Severity:** High
**File(s):** `mobile/lib/src/core/services/crash_reporting_service.dart:57-60`
**Description:** Sentry is configured with `attachScreenshot = true` and `attachViewHierarchy = true` unconditionally -- including production builds. If a crash occurs while the user is on a screen displaying PII (email, profile info, password reset forms, financial data on the subscription screen), a screenshot containing that PII will be transmitted to and stored in Sentry. This creates a data leak risk and may violate GDPR/CCPA requirements for data minimization.

**Evidence:**
```dart
// crash_reporting_service.dart:57-60
options.attachScreenshot = true;
options.attachViewHierarchy = true;
```
These are set inside the general `init()` with no `kDebugMode` or environment guard.

**Recommended Fix:**
Gate screenshot attachment on debug/staging environments only:
```dart
options.attachScreenshot = !kReleaseMode;
options.attachViewHierarchy = !kReleaseMode;
```
Or at minimum, configure Sentry's `beforeScreenshot` callback to redact screens containing PII (login, register, profile edit, settings, subscription).

---

### [SEC-054]: RevenueCat SDK Log Level Set to Debug Unconditionally
**Severity:** High
**File(s):** `mobile/lib/src/features/subscription/presentation/subscription_service.dart:22`
**Description:** `Purchases.setLogLevel(LogLevel.debug)` is called unconditionally during initialization, including in production builds. RevenueCat's debug log level outputs detailed purchase flow information, user identifiers, entitlement data, and API responses to the device console. On Android, this output is readable via `adb logcat` by anyone with USB debugging access to the device.

**Evidence:**
```dart
// subscription_service.dart:22
await Purchases.setLogLevel(LogLevel.debug);
```
**Recommended Fix:**
Guard log level based on build mode:
```dart
await Purchases.setLogLevel(kDebugMode ? LogLevel.debug : LogLevel.error);
```

---

### [SEC-055]: WebSocket Auth Token Stored in Memory Field and Sent in Plaintext Payload
**Severity:** High
**File(s):** `mobile/lib/src/core/services/websocket_service.dart:67-68, 182-197`
**Description:** The `WebSocketService` stores the raw JWT `_authToken` as a persistent instance field (not cleared until explicit disconnect). The token is also sent as a plaintext JSON payload in the `authenticate()` method. While production uses WSS (encrypted), the dev environment uses `ws://` (unencrypted), meaning the token is transmitted in cleartext during development. Additionally, the stored `_authToken` field is accessible for the lifetime of the keepAlive provider and survives in memory after the user's intent to use it has passed.

**Evidence:**
```dart
// websocket_service.dart:67-68
String? _authToken;
// ...
// websocket_service.dart:189-197
_authToken = token;
_send(WebSocketMessage(
  type: 'auth',
  payload: {
    'userId': userId,
    'token': token,  // JWT sent in message body
  },
));
```
The `_wsUrl` getter (line 107-116) derives ws/wss from the base URL, so dev builds use `ws://10.0.2.2:3000` (unencrypted).

**Recommended Fix:**
- Clear `_authToken` from the instance field after authentication completes (retain only in secure storage).
- For reconnect scenarios, re-read the token from secure storage rather than keeping it in memory.
- Consider using WebSocket connection headers for token transmission rather than message payload, as headers are less likely to be logged.

---

### [SEC-056]: Deep Link Custom Scheme `soundcheck://` Vulnerable to URI Scheme Hijacking
**Severity:** Medium
**File(s):** `mobile/android/app/src/main/AndroidManifest.xml:49-54`, `mobile/ios/Runner/Info.plist:87-97`
**Description:** The app registers the custom URI scheme `soundcheck://` for deep linking. Custom URI schemes are not verified by the OS -- any malicious app installed on the same device can register the same scheme and intercept deep links intended for SoundCheck. This is particularly concerning for the `/reset-password?token=...` deep link, where a malicious app could capture the password reset token.

Android uses `android:autoVerify="true"` on the intent filter, but this only works for App Links (HTTPS `https://` scheme with `assetlinks.json`), not for custom schemes. The `soundcheck://` scheme bypass has no OS-level verification.

**Evidence:**
```xml
<!-- AndroidManifest.xml:49-54 -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="soundcheck" />
</intent-filter>
```
```xml
<!-- Info.plist:92-94 -->
<array>
    <string>soundcheck</string>
</array>
```
**Recommended Fix:**
Implement Android App Links (`https://soundcheck.app/.well-known/assetlinks.json`) and iOS Universal Links (`https://soundcheck.app/.well-known/apple-app-site-association`) using HTTPS scheme. These provide cryptographic verification that only your app can handle the links. Keep the custom scheme as a fallback, but route sensitive flows (password reset) exclusively through verified Universal/App Links.

---

### [SEC-057]: Reset Password Token Passed as URL Query Parameter Without Validation
**Severity:** Medium
**File(s):** `mobile/lib/src/core/router/app_router.dart:178-182`, `mobile/lib/src/features/auth/presentation/reset_password_screen.dart:49`
**Description:** The password reset token is extracted directly from URL query parameters with no format validation or sanitization. The only check is whether the token is empty (line 114 of `reset_password_screen.dart`). An attacker controlling the deep link URL could inject arbitrary strings. While the backend should validate the token, the client should also perform basic validation (expected length, character set) as defense-in-depth.

**Evidence:**
```dart
// app_router.dart:180
final token = state.uri.queryParameters['token'] ?? '';
// reset_password_screen.dart:49 -- sent directly to API
'token': widget.token,
```
**Recommended Fix:**
Add client-side validation of the token format before sending to the API. If the backend issues hex or base64 tokens of a known length, validate against that pattern. Also sanitize against URL-injection characters.

---

### [SEC-058]: Dio LogInterceptor Logs Full Request and Response Bodies in Dev Mode
**Severity:** Medium
**File(s):** `mobile/lib/src/core/api/dio_client.dart:54-63`
**Description:** When `ApiConfig.isDev` is true, the Dio `LogInterceptor` is enabled with `requestBody: true` and `responseBody: true`. This logs full request bodies (including passwords in login/register requests) and full response bodies (including JWTs) to the debug console. While gated by `ApiConfig.isDev`, the environment flag defaults to `'prod'` via `String.fromEnvironment`. If a developer runs the app without `--dart-define=ENVIRONMENT=dev`, the logging is disabled. However, if a debug APK is built with `ENVIRONMENT=dev`, these logs are visible via `adb logcat` and may be captured by other apps with `READ_LOGS` permission on older Android versions.

**Evidence:**
```dart
// dio_client.dart:54-63
if (ApiConfig.isDev) {
  _dio.interceptors.add(
    LogInterceptor(
      requestBody: true,   // Logs passwords, tokens in requests
      responseBody: true,  // Logs JWTs in responses
      error: true,
      logPrint: (object) => LogService.d(object.toString()),
    ),
  );
}
```
**Recommended Fix:**
Even in dev mode, redact sensitive fields from logged bodies. Consider using a custom log interceptor that strips `password`, `token`, `Authorization`, and `refreshToken` fields before logging. Also add a `kDebugMode` guard as a secondary check so that profile/release builds never log request bodies regardless of environment flag:
```dart
if (ApiConfig.isDev && kDebugMode) { ... }
```

---

### [SEC-059]: All Core Providers Use `keepAlive: true` -- State Not Cleared on Logout
**Severity:** Medium
**File(s):** `mobile/lib/src/core/providers/providers.dart:25-99`
**Description:** Every core provider (`secureStorage`, `dioClient`, `authRepository`, `venueRepository`, `bandRepository`, `badgeRepository`, `checkInRepository`, `notificationRepository`, `feedRepository`, `profileRepository`, `discoveryRepository`) is annotated with `@Riverpod(keepAlive: true)`. When a user logs out and a different user logs in, these providers retain their previous instances. This is particularly concerning for `DioClient` (which holds a `_secureStorage` reference) and repository instances that may have cached data from the previous user's session.

The `AuthState.logout()` method sets `state = const AsyncValue.data(null)` but does not invalidate any other provider. The router redirects to `/login`, but repository state from the previous user persists in memory.

**Evidence:**
```dart
// providers.dart -- all repositories keepAlive
@Riverpod(keepAlive: true)
FeedRepository feedRepository(Ref ref) { ... }

@Riverpod(keepAlive: true)
ProfileRepository profileRepository(Ref ref) { ... }

// In logout():
await authRepository.logout();
state = const AsyncValue.data(null);
// No ref.invalidate() calls for cached data providers
```
**Recommended Fix:**
In `AuthState.logout()`, invalidate all user-scoped providers to ensure no cross-user data leakage:
```dart
ref.invalidate(feedRepositoryProvider);
ref.invalidate(profileRepositoryProvider);
ref.invalidate(notificationRepositoryProvider);
// ... etc
```
Alternatively, consider using `autoDispose` for repositories that cache user-specific data, or implement a container-level reset pattern.

---

### [SEC-060]: User Email Displayed in Social Auth Success SnackBars
**Severity:** Medium
**File(s):** `mobile/lib/src/features/auth/presentation/login_screen.dart:145, 184-189`
**Description:** After successful Google or Apple Sign-In, the user's email address is displayed in a SnackBar message (`'Google Sign-In successful: ${result.user.email}'`). On devices used by multiple people or in public settings, this briefly exposes the user's email on screen. SnackBars remain visible for several seconds and could be captured by shoulder surfing or screen recording.

**Evidence:**
```dart
// login_screen.dart:145
content: Text('Google Sign-In successful: ${result.user.email}'),
// login_screen.dart:184-189
final displayText = result.user.email.isNotEmpty
    ? result.user.email
    : 'User authenticated';
content: Text('Apple Sign-In successful: $displayText'),
```
**Recommended Fix:**
Remove the email from the SnackBar text. Use a generic success message like `'Sign-in successful'` or at most display the username instead of email.

---

### [SEC-061]: iOS Info.plist Requests Excessive Permissions for Beta Feature Set
**Severity:** Medium
**File(s):** `mobile/ios/Runner/Info.plist:78-84`
**Description:** The Info.plist requests `NSLocationAlwaysAndWhenInUseUsageDescription` (background location) and `NSMotionUsageDescription` (motion/fitness data). The descriptions reference "future" features ("for background geofencing in future", "may use motion data"). Apple App Review will flag and likely reject apps that request permissions for features not yet implemented. More importantly, requesting `Always` location access without using it is a privacy concern and may cause user distrust.

**Evidence:**
```xml
<!-- Info.plist:78-84 -->
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>SoundCheck uses your location to discover nearby venues and can
notify you about upcoming events at your favorite venues.</string>

<key>NSMotionUsageDescription</key>
<string>SoundCheck may use motion data to enhance your concert experience
and automatically detect when you're at a venue.</string>
```
**Recommended Fix:**
Remove `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSMotionUsageDescription` from `Info.plist` until the corresponding features are actually implemented. Keep only `NSLocationWhenInUseUsageDescription`, which is sufficient for the current venue discovery feature.

---

### [SEC-062]: `debugPrint` Calls in Production Code Outside LogService Guard
**Severity:** Low
**File(s):** Multiple locations
**Description:** Several files use `debugPrint()` directly instead of routing through `LogService`, which wraps all output in a `kDebugMode` check. While `debugPrint` is compiled out of release builds by the Flutter framework in most cases, the Dart documentation notes that `debugPrint` throttles output but does not guarantee removal in all build modes. More critically, these direct calls bypass any future centralized log filtering or redaction.

Affected locations:
- `mobile/lib/src/features/notifications/presentation/notifications_screen.dart:263` -- logs notification type
- `mobile/lib/src/features/profile/presentation/profile_screen.dart:770` -- logs UI tap
- `mobile/lib/src/core/services/crash_reporting_service.dart:36,74,84,86,109` -- logs when Sentry is not configured
- `mobile/lib/src/core/services/analytics_service.dart:35,37,54,84` -- logs when Analytics is not configured

**Recommended Fix:**
Replace all direct `debugPrint()` calls with `LogService` calls to ensure consistent logging behavior and enable future centralized log management.

---

### [SEC-063]: Login Screen Shows User Email in Success SnackBar for Social Auth (PII Leakage in UI)
**Severity:** Low
**File(s):** `mobile/lib/src/features/profile/presentation/settings_screen.dart:232-238`
**Description:** The account deletion error handler displays the raw exception message to the user: `'Failed to delete account: $e'`. Exception messages may contain server error details, stack traces, or internal API paths that should not be exposed to end users.

**Evidence:**
```dart
// settings_screen.dart:235
content: Text('Failed to delete account: $e'),
```
**Recommended Fix:**
Display a generic error message to the user:
```dart
content: Text('Failed to delete account. Please try again or contact support.'),
```
Log the detailed exception via `LogService.e()` for debugging purposes.

---

### [SEC-064]: `FlutterSecureStorage` Created Without Android EncryptedSharedPreferences Option
**Severity:** Low
**File(s):** `mobile/lib/src/core/providers/providers.dart:33-35`
**Description:** The `FlutterSecureStorage` instance is created with `const FlutterSecureStorage()` using default options. On Android, the default implementation uses a custom AES encryption scheme with keys stored in the Android Keystore. While functional, the recommended approach for Android API 23+ is to use `AndroidOptions(encryptedSharedPreferences: true)`, which delegates to Android's native `EncryptedSharedPreferences` implementation. This provides better compatibility with Android backup/restore and avoids known issues with the legacy implementation on some Samsung devices.

**Evidence:**
```dart
// providers.dart:33-35
@Riverpod(keepAlive: true)
FlutterSecureStorage secureStorage(Ref ref) {
  return const FlutterSecureStorage();
}
```
**Recommended Fix:**
```dart
return const FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);
```

---

### [SEC-065]: `int.parse()` on Deep Link Path Parameter Without Error Handling
**Severity:** Low
**File(s):** `mobile/lib/src/core/router/app_router.dart:601, 617`
**Description:** The `/wrapped/:year` and `/wrapped/:year/detail` routes parse the `year` path parameter using `int.parse()` without try-catch. If a malformed deep link provides a non-numeric year value (e.g., `soundcheck://wrapped/abc`), this will throw a `FormatException` and crash the route builder, potentially showing an unhandled error screen.

**Evidence:**
```dart
// app_router.dart:601
final year = int.parse(state.pathParameters['year']!);
// app_router.dart:617
final year = int.parse(state.pathParameters['year']!);
```
**Recommended Fix:**
Use `int.tryParse()` with a fallback, or wrap in try-catch and redirect to a safe route:
```dart
final year = int.tryParse(state.pathParameters['year'] ?? '') ?? DateTime.now().year;
```

---

### [SEC-066]: Network Security Config Only Present in Debug Build Variant
**Severity:** Low
**File(s):** `mobile/android/app/src/debug/AndroidManifest.xml:12`, `mobile/android/app/src/debug/res/xml/network_security_config.xml`
**Description:** The Android `networkSecurityConfig` attribute referencing `@xml/network_security_config` is only declared in the debug-variant `AndroidManifest.xml`. The main `AndroidManifest.xml` does not reference a network security config. While this means release builds use Android's default (cleartext blocked on API 28+), it is better practice to explicitly declare a release network security config that enforces HTTPS-only and, optionally, certificate pinning for the production API domain.

**Evidence:**
- `mobile/android/app/src/debug/AndroidManifest.xml:12` -- `android:networkSecurityConfig="@xml/network_security_config"`
- `mobile/android/app/src/main/AndroidManifest.xml` -- No `networkSecurityConfig` attribute
- `mobile/android/app/src/debug/res/xml/network_security_config.xml` -- Allows cleartext to `10.0.2.2`, `localhost`, `127.0.0.1` (debug-only, correctly scoped)

**Recommended Fix:**
Create a release-variant network security config at `mobile/android/app/src/main/res/xml/network_security_config.xml` that explicitly blocks cleartext:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```
Reference it in the main `AndroidManifest.xml`. Consider adding certificate pinning for `soundcheck-app.up.railway.app` for production.

---

## Positive Observations

The following security practices were found to be well-implemented:

1. **Token Storage**: All authentication tokens (`auth_token`, `user_data`, `refresh_token`) are stored using `flutter_secure_storage`, which uses the Android Keystore and iOS Keychain. No tokens were found in `SharedPreferences` or plain files.

2. **TLS Enforcement**: Production and staging URLs use HTTPS/WSS exclusively. Dev cleartext HTTP is correctly scoped to debug builds only via the network security config. iOS ATS has `NSAllowsArbitraryLoads = false` with only a localhost exception.

3. **Input Validation**: The `Validators` class enforces strong password policy (8+ chars, upper, lower, digit, special), email format, and username constraints. Registration has client-side validation matching backend requirements.

4. **Build Hardening**: Android release builds have `isMinifyEnabled = true`, `isShrinkResources = true`, and ProGuard rules properly configured. `flutter_secure_storage` classes are preserved in ProGuard.

5. **Secrets Management**: No hardcoded API keys, tokens, or credentials found in source code. API keys (Sentry DSN, RevenueCat keys) are injected via `--dart-define` at build time. Keystore properties and Firebase configs are properly gitignored.

6. **Environment Separation**: `ApiConfig` cleanly separates dev/staging/prod URLs using compile-time environment variables with prod as the safe default.

7. **LogService Guard**: The centralized `LogService` wraps all output in `kDebugMode` checks, preventing log leakage in release builds for most log calls.

8. **Router Auth Guard**: The GoRouter `redirect` function checks `authState` on every navigation and redirects unauthenticated users to `/login`. Auth-required routes cannot be reached without valid auth state.

9. **Password UI**: Password fields use `obscureText: true`, provide visibility toggle, and registration includes a password strength meter.

10. **Error Message Sanitization**: Login failures display generic "Invalid email or password" rather than leaking whether the email or password was incorrect.

---

## Risk Matrix

| Finding | Severity | Exploitability | Data Impact | Fix Effort |
|---------|----------|---------------|-------------|------------|
| SEC-050 | Blocker  | High          | Auth bypass | Medium     |
| SEC-051 | High     | Medium        | PII leak    | Low        |
| SEC-052 | High     | Low           | Token theft | Low        |
| SEC-053 | High     | Medium        | PII leak    | Low        |
| SEC-054 | High     | Low           | Info leak   | Low        |
| SEC-055 | High     | Medium        | Token leak  | Medium     |
| SEC-056 | Medium   | Medium        | Token theft | Medium     |
| SEC-057 | Medium   | Low           | Low         | Low        |
| SEC-058 | Medium   | Low           | Credential  | Low        |
| SEC-059 | Medium   | Low           | Data leak   | Low        |
| SEC-060 | Medium   | Low           | PII leak    | Low        |
| SEC-061 | Medium   | Low           | PII leak    | Low        |
| SEC-062 | Low      | Low           | Info leak   | Low        |
| SEC-063 | Low      | Low           | Info leak   | Low        |
| SEC-064 | Low      | None          | None        | Low        |
| SEC-065 | Low      | Low           | Crash       | Low        |
| SEC-066 | Low      | None          | None        | Low        |

---

## Recommended Prioritization for Beta Launch

### Must Fix Before Beta (Blocker + High)
1. **SEC-050** -- Implement token refresh flow and `QueuedInterceptor`
2. **SEC-052** -- Delete `refresh_token` on logout (one-line fix)
3. **SEC-053** -- Gate Sentry screenshots on debug mode
4. **SEC-054** -- Gate RevenueCat log level on debug mode
5. **SEC-051** -- Wire up Sentry/Analytics user context on login/logout
6. **SEC-055** -- Clear WebSocket token from memory after auth

### Should Fix Before Beta (Medium)
7. **SEC-056** -- Implement Universal Links / App Links for password reset
8. **SEC-059** -- Invalidate user-scoped providers on logout
9. **SEC-060** -- Remove email from success SnackBars
10. **SEC-058** -- Add `kDebugMode` guard to Dio logging

### Fix During Beta (Low)
11. **SEC-057** -- Add client-side reset token validation
12. **SEC-061** -- Sanitize account deletion error messages
13. **SEC-062** -- Replace direct `debugPrint` with `LogService`
14. **SEC-063** -- Sanitize account deletion error message
15. **SEC-064** -- Enable `EncryptedSharedPreferences` option
16. **SEC-065** -- Use `int.tryParse` for deep link year parameter
17. **SEC-066** -- Add explicit release network security config
