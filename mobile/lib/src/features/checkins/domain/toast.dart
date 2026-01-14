import 'package:freezed_annotation/freezed_annotation.dart';
import '../../auth/domain/user.dart';

part 'toast.freezed.dart';
part 'toast.g.dart';

/// Toast - A "fist bump" or like on a check-in
@freezed
sealed class Toast with _$Toast {
  const factory Toast({
    required String id,
    required String userId,
    required String checkinId,
    required String createdAt,
    // Populated fields
    User? user,
  }) = _Toast;

  factory Toast.fromJson(Map<String, dynamic> json) =>
      _$ToastFromJson(json);
}

/// Response after toasting a check-in
@freezed
sealed class ToastResponse with _$ToastResponse {
  const factory ToastResponse({
    required bool success,
    required bool isToasted,
    required int toastCount,
  }) = _ToastResponse;

  factory ToastResponse.fromJson(Map<String, dynamic> json) =>
      _$ToastResponseFromJson(json);
}
