import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../shared/widgets/error_state_widget.dart';
import '../../auth/domain/user.dart';
import 'providers/block_providers.dart';

/// User profile screen for viewing another user's profile.
/// Routed at /users/:id -- separate from /profile (own profile).
/// Shows user data, stats, and block/unblock button.
class UserProfileScreen extends ConsumerWidget {
  final String userId;

  const UserProfileScreen({required this.userId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(userPublicProfileProvider(userId));
    final blockStatusAsync = ref.watch(blockStatusProvider(userId));
    final currentUser = ref.watch(authStateProvider).value;
    final isOwnProfile = currentUser?.id == userId;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          if (!isOwnProfile)
            blockStatusAsync.when(
              data: (isBlocked) => PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert),
                onSelected: (value) {
                  if (value == 'block') {
                    _showBlockDialog(context, ref, isBlocked, null);
                  }
                },
                itemBuilder: (context) => [
                  PopupMenuItem(
                    value: 'block',
                    child: Row(
                      children: [
                        Icon(
                          isBlocked ? Icons.check_circle_outline : Icons.block,
                          size: 20,
                          color: isBlocked
                              ? AppTheme.textSecondary
                              : AppTheme.error,
                        ),
                        const SizedBox(width: AppTheme.spacing8),
                        Text(isBlocked ? 'Unblock' : 'Block'),
                      ],
                    ),
                  ),
                ],
              ),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
        ],
      ),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => ErrorStateWidget(
          error: err,
          stackTrace: stack,
          customMessage: 'Failed to load profile',
          onRetry: () => ref.invalidate(userPublicProfileProvider(userId)),
        ),
        data: (user) {
          final username = user.username;
          final displayName = _buildDisplayName(user);
          final profileImageUrl = user.profileImageUrl;
          final initials = username.isNotEmpty ? username[0].toUpperCase() : '?';

          return RefreshIndicator(
            color: AppTheme.primary,
            backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
            onRefresh: () async {
              ref.invalidate(userPublicProfileProvider(userId));
              ref.invalidate(blockStatusProvider(userId));
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppTheme.spacing16),
              child: Column(
                children: [
                  const SizedBox(height: AppTheme.spacing16),

                  // User Avatar
                  CircleAvatar(
                    radius: 50,
                    backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                    backgroundImage: profileImageUrl != null
                        ? CachedNetworkImageProvider(profileImageUrl)
                        : null,
                    child: profileImageUrl == null
                        ? Text(
                            initials,
                            style: const TextStyle(
                              fontSize: 36,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(height: AppTheme.spacing16),

                  // Display name
                  Text(
                    displayName,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: AppTheme.spacing4),

                  // Username
                  Text(
                    '@$username',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppTheme.textSecondary,
                        ),
                  ),

                  // Bio
                  if (user.bio != null && user.bio!.isNotEmpty) ...[
                    const SizedBox(height: AppTheme.spacing12),
                    Text(
                      user.bio!,
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                  ],

                  const SizedBox(height: AppTheme.spacing24),

                  // Stats Row
                  _StatsRow(user: user),

                  const SizedBox(height: AppTheme.spacing24),

                  // Block/Unblock Button (only for other users)
                  if (!isOwnProfile)
                    blockStatusAsync.when(
                      data: (isBlocked) => SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => _showBlockDialog(
                              context, ref, isBlocked, username,),
                          icon: Icon(
                            isBlocked
                                ? Icons.check_circle_outline
                                : Icons.block,
                            color: isBlocked
                                ? AppTheme.textSecondary
                                : AppTheme.error,
                          ),
                          label: Text(
                            isBlocked ? 'Unblock' : 'Block',
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: isBlocked
                                ? AppTheme.textSecondary
                                : AppTheme.error,
                            side: BorderSide(
                              color: isBlocked
                                  ? AppTheme.textSecondary
                                  : AppTheme.error,
                            ),
                            padding: const EdgeInsets.symmetric(
                              vertical: AppTheme.spacing12,
                            ),
                          ),
                        ),
                      ),
                      loading: () => const SizedBox(
                        height: 48,
                        child: Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      ),
                      error: (_, __) => const SizedBox.shrink(),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _buildDisplayName(User user) {
    if (user.firstName != null || user.lastName != null) {
      return [user.firstName, user.lastName]
          .where((s) => s != null && s.isNotEmpty)
          .join(' ');
    }
    return user.username;
  }

  Future<void> _showBlockDialog(
    BuildContext context,
    WidgetRef ref,
    bool isCurrentlyBlocked,
    String? username,
  ) async {
    final name = username ?? 'this user';
    final title = isCurrentlyBlocked ? 'Unblock $name?' : 'Block $name?';
    final message = isCurrentlyBlocked
        ? 'They will be able to see your content again.'
        : 'They will not be able to see your content and you will not see theirs. Blocking also removes follows in both directions.';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(
              isCurrentlyBlocked ? 'Unblock' : 'Block',
              style: TextStyle(
                color: isCurrentlyBlocked ? null : AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      try {
        final repo = ref.read(blockRepositoryProvider);
        if (isCurrentlyBlocked) {
          await repo.unblockUser(userId);
        } else {
          await repo.blockUser(userId);
        }
        // Refresh block status to toggle button immediately
        ref.invalidate(blockStatusProvider(userId));
        // Refresh blocked users list if it was previously fetched
        ref.invalidate(blockedUsersProvider);

        if (context.mounted) {
          final action = isCurrentlyBlocked ? 'unblocked' : 'blocked';
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${username ?? 'User'} has been $action'),
            ),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to ${isCurrentlyBlocked ? 'unblock' : 'block'} user: $e'),
              backgroundColor: AppTheme.error,
            ),
          );
        }
      }
    }
  }
}

/// Stats row showing user's key metrics.
class _StatsRow extends StatelessWidget {
  final User user;

  const _StatsRow({required this.user});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: AppTheme.spacing16,
        horizontal: AppTheme.spacing8,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        border: Border.all(color: Theme.of(context).colorScheme.surfaceContainerHighest),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _StatItem(
            label: 'Check-ins',
            value: user.totalCheckins.toString(),
          ),
          _StatDivider(),
          _StatItem(
            label: 'Bands',
            value: user.uniqueBands.toString(),
          ),
          _StatDivider(),
          _StatItem(
            label: 'Venues',
            value: user.uniqueVenues.toString(),
          ),
          _StatDivider(),
          _StatItem(
            label: 'Badges',
            value: user.badgesCount.toString(),
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;

  const _StatItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: AppTheme.primary,
              ),
        ),
        const SizedBox(height: AppTheme.spacing4),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 32,
      width: 1,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
    );
  }
}
