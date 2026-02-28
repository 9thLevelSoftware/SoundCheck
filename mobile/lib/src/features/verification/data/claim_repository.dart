import '../../../core/api/dio_client.dart';
import '../../reviews/domain/review.dart';

/// Model representing a verification claim for a venue or band.
class VerificationClaim {
  final String id;
  final String entityType;
  final String entityId;
  final String status; // 'pending', 'approved', 'denied'
  final String? evidenceText;
  final String? evidenceUrl;
  final String? entityName;
  final String? reviewNotes;
  final String createdAt;

  VerificationClaim({
    required this.id,
    required this.entityType,
    required this.entityId,
    required this.status,
    required this.createdAt,
    this.evidenceText,
    this.evidenceUrl,
    this.entityName,
    this.reviewNotes,
  });

  factory VerificationClaim.fromJson(Map<String, dynamic> json) {
    return VerificationClaim(
      id: json['id'] as String,
      entityType: json['entityType'] as String? ?? json['entity_type'] as String,
      entityId: json['entityId'] as String? ?? json['entity_id'] as String,
      status: json['status'] as String,
      evidenceText: json['evidenceText'] as String? ?? json['evidence_text'] as String?,
      evidenceUrl: json['evidenceUrl'] as String? ?? json['evidence_url'] as String?,
      entityName: json['entityName'] as String? ?? json['entity_name'] as String?,
      reviewNotes: json['reviewNotes'] as String? ?? json['review_notes'] as String?,
      createdAt: json['createdAt'] as String? ?? json['created_at'] as String? ?? '',
    );
  }
}

/// Repository for claim endpoints.
/// Follows the established DioClient repository pattern
/// (see ReportRepository, RsvpRepository).
class ClaimRepository {
  final DioClient _client;

  ClaimRepository({required DioClient client}) : _client = client;

  /// Submit a new claim for a venue or band.
  /// POST /claims
  Future<VerificationClaim> submitClaim({
    required String entityType,
    required String entityId,
    String? evidenceText,
    String? evidenceUrl,
  }) async {
    final response = await _client.post('/claims', data: {
      'entityType': entityType,
      'entityId': entityId,
      if (evidenceText != null && evidenceText.isNotEmpty)
        'evidenceText': evidenceText,
      if (evidenceUrl != null && evidenceUrl.isNotEmpty)
        'evidenceUrl': evidenceUrl,
    },);
    return VerificationClaim.fromJson(
      response.data['data'] as Map<String, dynamic>,
    );
  }

  /// Get all claims submitted by the current user.
  /// GET /claims/me
  Future<List<VerificationClaim>> getMyClaims() async {
    final response = await _client.get('/claims/me');
    final data = response.data['data'] as List;
    return data
        .map((e) => VerificationClaim.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Get aggregate stats for a claimed entity.
  /// GET /claims/stats/:entityType/:entityId
  Future<Map<String, dynamic>> getEntityStats(
    String entityType,
    String entityId,
  ) async {
    final response = await _client.get('/claims/stats/$entityType/$entityId');
    return response.data['data'] as Map<String, dynamic>;
  }

  /// Submit an owner response to a review.
  /// POST /claims/reviews/:reviewId/respond
  Future<Map<String, dynamic>> respondToReview(
    String reviewId,
    String ownerResponse,
  ) async {
    final response = await _client.post(
      '/claims/reviews/$reviewId/respond',
      data: {'ownerResponse': ownerResponse},
    );
    return response.data['data'] as Map<String, dynamic>;
  }

  /// Fetch reviews for a venue.
  /// GET /reviews/venue/:venueId
  Future<List<Review>> getVenueReviews(String venueId) async {
    final response = await _client.get('/reviews/venue/$venueId');
    final data = response.data['data'] as Map<String, dynamic>;
    final reviewsList = data['reviews'] as List;
    return reviewsList.map((e) {
      final json = Map<String, dynamic>.from(e as Map<String, dynamic>);
      // Flatten nested user object into top-level fields for Review.fromJson
      final user = json['user'] as Map<String, dynamic>?;
      if (user != null) {
        json['userName'] = user['username'] as String? ??
            user['firstName'] as String?;
        json['userProfileImageUrl'] = user['profileImageUrl'] as String?;
      }
      return Review.fromJson(json);
    }).toList();
  }
}
