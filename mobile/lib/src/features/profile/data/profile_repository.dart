import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/concert_cred.dart';
import '../domain/user_statistics.dart';

class ProfileRepository {
  final DioClient _dioClient;

  ProfileRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get user statistics
  Future<UserStatistics> getUserStatistics() async {
    try {
      final response = await _dioClient.get('${ApiConfig.auth}/me/statistics');
      final statisticsData = response.data['data'] as Map<String, dynamic>;
      return UserStatistics.fromJson(statisticsData);
    } catch (e) {
      rethrow;
    }
  }

  /// Get concert cred aggregate stats for a user
  Future<ConcertCred> getConcertCred(String userId) async {
    try {
      final response = await _dioClient.get(ApiConfig.concertCred(userId));
      final data = response.data['data'] as Map<String, dynamic>;
      return ConcertCred.fromJson(data);
    } catch (e) {
      rethrow;
    }
  }

  /// Upload profile image
  Future<String> uploadProfileImage(String filePath) async {
    try {
      // In a real implementation, this would upload the file
      // For now, we'll return a placeholder
      // You would use FormData from dio to upload the file
      final response = await _dioClient.post(
        '${ApiConfig.auth}/me/profile-image',
        data: {'imagePath': filePath},
      );
      final responseData = response.data['data'] as Map<String, dynamic>;
      return responseData['imageUrl'] as String;
    } catch (e) {
      rethrow;
    }
  }
}
