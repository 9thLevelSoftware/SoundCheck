import 'package:freezed_annotation/freezed_annotation.dart';

part 'subscription_state.freezed.dart';
part 'subscription_state.g.dart';

@freezed
sealed class SubscriptionStatus with _$SubscriptionStatus {
  const factory SubscriptionStatus({
    @Default(false) bool isPremium,
    String? expiresAt,
    String? productId,
  }) = _SubscriptionStatus;

  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) =>
      _$SubscriptionStatusFromJson(json);
}
