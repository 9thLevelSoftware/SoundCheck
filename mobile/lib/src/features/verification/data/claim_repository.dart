import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/error/failures.dart';

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

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Submit a new claim for a venue or band.
  /// POST /claims
  Future<Either<Failure, VerificationClaim>> submitClaim({
    required String entityType,
    required String entityId,
    String? evidenceText,
    String? evidenceUrl,
  }) async {
    try {
      final response = await _client.post('/claims', data: {
        'entityType': entityType,
        'entityId': entityId,
        if (evidenceText != null && evidenceText.isNotEmpty)
          'evidenceText': evidenceText,
        if (evidenceUrl != null && evidenceUrl.isNotEmpty)
          'evidenceUrl': evidenceUrl,
      },);
      return Right(VerificationClaim.fromJson(
        response.data['data'] as Map<String, dynamic>,
      ));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get all claims submitted by the current user.
  /// GET /claims/me
  Future<Either<Failure, List<VerificationClaim>>> getMyClaims() async {
    try {
      final response = await _client.get('/claims/me');
      final data = response.data['data'] as List;
      return Right(data
          .map((e) => VerificationClaim.fromJson(e as Map<String, dynamic>))
          .toList());
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Get aggregate stats for a claimed entity.
  /// GET /claims/stats/:entityType/:entityId
  Future<Either<Failure, Map<String, dynamic>>> getEntityStats(
    String entityType,
    String entityId,
  ) async {
    try {
      final response = await _client.get('/claims/stats/$entityType/$entityId');
      return Right(response.data['data'] as Map<String, dynamic>);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

}
