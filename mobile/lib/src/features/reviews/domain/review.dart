import 'package:freezed_annotation/freezed_annotation.dart';

part 'review.freezed.dart';
part 'review.g.dart';

@freezed
sealed class Review with _$Review {
  const factory Review({
    required String id,
    required String userId,
    required double rating,
    required String createdAt,
    required String updatedAt,
    String? content,
    String? venueId,
    String? bandId,
    String? userName,
    String? userProfileImageUrl,
    String? venueName,
    String? bandName,
    String? ownerResponse,
    String? ownerResponseAt,
  }) = _Review;

  factory Review.fromJson(Map<String, dynamic> json) => _$ReviewFromJson(json);
}
