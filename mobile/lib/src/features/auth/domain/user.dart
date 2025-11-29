import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

@freezed
class User with _$User {
  const factory User({
    required String id,
    required String email,
    required String username,
    required bool isVerified,
    required bool isActive,
    required String createdAt,
    required String updatedAt,
    String? firstName,
    String? lastName,
    String? bio,
    String? profileImageUrl,
    String? location,
    String? dateOfBirth,
    // Gamification stats (denormalized for performance)
    @Default(0) int totalCheckins,
    @Default(0) int uniqueBands,
    @Default(0) int uniqueVenues,
    // Follower counts
    @Default(0) int followersCount,
    @Default(0) int followingCount,
    // Badge count
    @Default(0) int badgesCount,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

@freezed
class AuthResponse with _$AuthResponse {
  const factory AuthResponse({
    required User user,
    required String token,
  }) = _AuthResponse;

  factory AuthResponse.fromJson(Map<String, dynamic> json) =>
      _$AuthResponseFromJson(json);
}

@freezed
class LoginRequest with _$LoginRequest {
  const factory LoginRequest({
    required String email,
    required String password,
  }) = _LoginRequest;

  factory LoginRequest.fromJson(Map<String, dynamic> json) =>
      _$LoginRequestFromJson(json);
}

@freezed
class RegisterRequest with _$RegisterRequest {
  const factory RegisterRequest({
    required String email,
    required String password,
    required String username,
    String? firstName,
    String? lastName,
  }) = _RegisterRequest;

  factory RegisterRequest.fromJson(Map<String, dynamic> json) =>
      _$RegisterRequestFromJson(json);
}

/// User profile with full stats and badges
@freezed
class UserProfile with _$UserProfile {
  const factory UserProfile({
    required User user,
    required List<UserBadgeInfo> badges,
    @Default(false) bool isFollowing,
    @Default(false) bool isFollowedBy,
  }) = _UserProfile;

  factory UserProfile.fromJson(Map<String, dynamic> json) =>
      _$UserProfileFromJson(json);
}

/// Badge info for user profile
@freezed
class UserBadgeInfo with _$UserBadgeInfo {
  const factory UserBadgeInfo({
    required String id,
    required String name,
    String? description,
    String? iconUrl,
    String? color,
    required String earnedAt,
  }) = _UserBadgeInfo;

  factory UserBadgeInfo.fromJson(Map<String, dynamic> json) =>
      _$UserBadgeInfoFromJson(json);
}
