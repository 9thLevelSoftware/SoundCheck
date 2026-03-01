import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/providers/providers.dart';

part 'discovery_providers.g.dart';

/// Model for a suggested user from the discovery API.
class SuggestedUser {
  final String id;
  final String username;
  final String displayName;
  final String? profileImageUrl;
  final String? bio;
  final int totalCheckins;
  final bool isVerified;
  final int sharedBands;
  final int sharedVenues;
  final String? reason;

  const SuggestedUser({
    required this.id,
    required this.username,
    required this.displayName,
    this.profileImageUrl,
    this.bio,
    this.totalCheckins = 0,
    this.isVerified = false,
    this.sharedBands = 0,
    this.sharedVenues = 0,
    this.reason,
  });

  factory SuggestedUser.fromJson(Map<String, dynamic> json) => SuggestedUser(
        id: json['id'] as String,
        username: json['username'] as String,
        displayName:
            json['displayName'] as String? ?? json['username'] as String,
        profileImageUrl: json['profileImageUrl'] as String?,
        bio: json['bio'] as String?,
        totalCheckins: json['totalCheckins'] as int? ?? 0,
        isVerified: json['isVerified'] as bool? ?? false,
        sharedBands: json['sharedBands'] as int? ?? 0,
        sharedVenues: json['sharedVenues'] as int? ?? 0,
        reason: json['reason'] as String?,
      );
}

/// Fetches user suggestions for discovery.
@riverpod
Future<List<SuggestedUser>> userSuggestions(Ref ref) async {
  final dioClient = ref.watch(dioClientProvider);
  final response = await dioClient.get(
    '/discover/users/suggestions',
    queryParameters: {'limit': 15},
  );
  final data = response.data['data'] as List<dynamic>;
  return data
      .map((json) => SuggestedUser.fromJson(json as Map<String, dynamic>))
      .toList();
}
