import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/badge.dart';

class BadgeRepository {
  final DioClient _dioClient;

  BadgeRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Get all available badges
  Future<List<Badge>> getAllBadges() async {
    try {
      final response = await _dioClient.get(ApiConfig.badges);
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => Badge.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get user's earned badges
  Future<List<UserBadge>> getMyBadges() async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/my-badges');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => UserBadge.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get user's badge progress
  Future<List<BadgeProgress>> getMyProgress() async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/my-progress');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => BadgeProgress.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Get badge rarity percentages for all badges
  Future<List<BadgeRarity>> getRarity() async {
    try {
      final response = await _dioClient.get('${ApiConfig.badges}/rarity');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => BadgeRarity.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Check for newly earned badges (manual debug trigger -- badge eval is automatic)
  Future<List<UserBadge>> checkNewBadges() async {
    try {
      final response = await _dioClient.post('${ApiConfig.badges}/check-awards');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data.map((json) => UserBadge.fromJson(json as Map<String, dynamic>)).toList();
    } catch (e) {
      rethrow;
    }
  }
}
