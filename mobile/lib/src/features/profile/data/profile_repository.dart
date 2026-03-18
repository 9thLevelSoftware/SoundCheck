import 'package:dio/dio.dart';

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

  /// Upload profile image via multipart form data
  Future<String> uploadProfileImage(String filePath) async {
    try {
      final formData = FormData.fromMap({
        'image': await MultipartFile.fromFile(filePath),
      });
      final response = await _dioClient.post(
        '${ApiConfig.auth}/me/profile-image',
        data: formData,
      );
      final responseData = response.data['data'] as Map<String, dynamic>;
      return responseData['imageUrl'] as String;
    } catch (e) {
      rethrow;
    }
  }
}
