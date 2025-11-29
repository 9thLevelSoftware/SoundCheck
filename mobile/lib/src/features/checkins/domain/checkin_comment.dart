import 'package:freezed_annotation/freezed_annotation.dart';
import '../../auth/domain/user.dart';

part 'checkin_comment.freezed.dart';
part 'checkin_comment.g.dart';

/// CheckInComment - A comment on a check-in
@freezed
class CheckInComment with _$CheckInComment {
  const factory CheckInComment({
    required String id,
    required String checkinId,
    required String userId,
    required String content,
    required String createdAt,
    required String updatedAt,
    // Populated fields
    User? user,
  }) = _CheckInComment;

  factory CheckInComment.fromJson(Map<String, dynamic> json) =>
      _$CheckInCommentFromJson(json);
}

/// Request to create a comment
@freezed
class CreateCommentRequest with _$CreateCommentRequest {
  const factory CreateCommentRequest({
    required String checkinId,
    required String content,
  }) = _CreateCommentRequest;

  factory CreateCommentRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateCommentRequestFromJson(json);
}
