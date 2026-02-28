import '../../../core/api/dio_client.dart';

/// Repository for onboarding-related API calls.
///
/// Provides genre preference CRUD and onboarding completion tracking.
/// Backend endpoints from Plan 10-01: /api/onboarding/*
class OnboardingRepository {
  final DioClient _dioClient;

  OnboardingRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Save user's genre preferences (3-8 genres).
  /// POST /api/onboarding/genres
  Future<void> saveGenrePreferences(List<String> genres) async {
    try {
      await _dioClient.post(
        '/onboarding/genres',
        data: {'genres': genres},
      );
    } catch (e) {
      rethrow;
    }
  }

  /// Get user's saved genre preferences.
  /// GET /api/onboarding/genres
  Future<List<String>> getGenrePreferences() async {
    try {
      final response = await _dioClient.get('/onboarding/genres');
      return List<String>.from(response.data['data']['genres'] ?? []);
    } catch (e) {
      rethrow;
    }
  }

  /// Mark onboarding as complete on the backend.
  /// POST /api/onboarding/complete
  Future<void> completeOnboarding() async {
    try {
      await _dioClient.post('/onboarding/complete');
    } catch (e) {
      rethrow;
    }
  }

  /// Check if onboarding is complete on the backend.
  /// GET /api/onboarding/status
  Future<bool> isOnboardingComplete() async {
    try {
      final response = await _dioClient.get('/onboarding/status');
      return response.data['data']['completed'] ?? false;
    } catch (e) {
      rethrow;
    }
  }
}
