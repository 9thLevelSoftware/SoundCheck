import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/providers.dart';
import '../../../auth/domain/user.dart';
import '../../data/block_repository.dart';

/// Block repository provider (keepAlive for consistency with other repositories).
/// Manual Riverpod providers per Phase 10 decision [10-05].
final blockRepositoryProvider = Provider<BlockRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return BlockRepository(dioClient: dioClient);
});

/// Block status for a specific user (bilateral check).
/// Auto-dispose so it refetches on re-entry.
final blockStatusProvider =
    FutureProvider.autoDispose.family<bool, String>((ref, userId) async {
  return ref.watch(blockRepositoryProvider).isBlocked(userId);
});

/// List of all blocked users.
/// Auto-dispose so it refetches when navigating to the screen.
final blockedUsersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return ref.watch(blockRepositoryProvider).getBlockedUsers();
});

/// Provider to fetch another user's public profile.
/// GET /users/:userId returns the user object, parsed into a User model.
final userPublicProfileProvider =
    FutureProvider.autoDispose.family<User, String>(
        (ref, userId) async {
  final dioClient = ref.watch(dioClientProvider);
  final response = await dioClient.get('/users/$userId');
  final data = response.data['data'] as Map<String, dynamic>;
  return User.fromJson(data);
});
