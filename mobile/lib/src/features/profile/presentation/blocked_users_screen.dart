import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import 'providers/block_providers.dart';

/// Screen displaying all blocked users with unblock capability.
/// Accessible from Settings > Blocked Users.
class BlockedUsersScreen extends ConsumerWidget {
  const BlockedUsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blockedUsers = ref.watch(blockedUsersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Blocked Users'),
      ),
      body: blockedUsers.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppTheme.error),
              const SizedBox(height: AppTheme.spacing16),
              Text(
                'Failed to load blocked users',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: AppTheme.spacing8),
              Text(
                err.toString(),
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppTheme.spacing16),
              TextButton.icon(
                onPressed: () => ref.invalidate(blockedUsersProvider),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (users) {
          if (users.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.block,
                    size: 64,
                    color: AppTheme.textTertiary,
                  ),
                  const SizedBox(height: AppTheme.spacing16),
                  Text(
                    'No blocked users',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          color: AppTheme.textSecondary,
                        ),
                  ),
                  const SizedBox(height: AppTheme.spacing8),
                  Text(
                    'Users you block will appear here',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: AppTheme.spacing8),
            itemCount: users.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final user = users[index];
              // The blocked user data may be nested under 'blockedUser' or at top level
              final blockedUser =
                  user['blockedUser'] as Map<String, dynamic>? ?? user;
              final userId =
                  blockedUser['id'] as String? ?? user['blockedId'] as String? ?? '';
              final username =
                  blockedUser['username'] as String? ?? 'Unknown User';
              final profileImageUrl =
                  blockedUser['profileImageUrl'] as String?;
              final initials = username.isNotEmpty
                  ? username[0].toUpperCase()
                  : '?';

              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppTheme.surfaceVariantDark,
                  backgroundImage: profileImageUrl != null
                      ? NetworkImage(profileImageUrl)
                      : null,
                  child: profileImageUrl == null
                      ? Text(
                          initials,
                          style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontWeight: FontWeight.bold,
                          ),
                        )
                      : null,
                ),
                title: Text(
                  username,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                trailing: TextButton(
                  onPressed: () =>
                      _showUnblockDialog(context, ref, userId, username),
                  child: const Text(
                    'Unblock',
                    style: TextStyle(color: AppTheme.primary),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _showUnblockDialog(
    BuildContext context,
    WidgetRef ref,
    String userId,
    String username,
  ) async {
    final shouldUnblock = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Unblock $username?'),
        content: const Text(
          'They will be able to see your content again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Unblock'),
          ),
        ],
      ),
    );

    if (shouldUnblock == true && context.mounted) {
      try {
        await ref.read(blockRepositoryProvider).unblockUser(userId);
        ref.invalidate(blockedUsersProvider);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$username has been unblocked'),
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to unblock $username: $e'),
              backgroundColor: AppTheme.error,
            ),
          );
        }
      }
    }
  }
}
