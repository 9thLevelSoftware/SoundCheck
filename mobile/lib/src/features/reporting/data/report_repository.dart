import '../../../core/api/dio_client.dart';

/// Repository for submitting content reports.
/// Follows the established DioClient repository pattern
/// (see RsvpRepository, DiscoveryRepository).
class ReportRepository {
  final DioClient _dioClient;

  ReportRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Submit a content report.
  /// POST /reports (DioClient baseUrl already includes /api)
  ///
  /// [contentType]: 'checkin' | 'comment' | 'photo' | 'user'
  /// [contentId]: ID of the content being reported
  /// [reason]: 'spam' | 'harassment' | 'inappropriate' | 'copyright' | 'other'
  /// [description]: Optional additional details (max 500 chars)
  ///
  /// Throws [Failure] on error:
  /// - 409: duplicate report (same user + same content)
  /// - 429: rate limit exceeded (10 reports/user/day)
  Future<void> submitReport({
    required String contentType,
    required String contentId,
    required String reason,
    String? description,
  }) async {
    await _dioClient.post('/reports', data: {
      'contentType': contentType,
      'contentId': contentId,
      'reason': reason,
      if (description != null && description.isNotEmpty)
        'description': description,
    },);
  }
}
