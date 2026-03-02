import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../data/discovery_providers.dart';

/// Screen showing suggested users for discovery with follow buttons.
class DiscoverUsersScreen extends ConsumerStatefulWidget {
  const DiscoverUsersScreen({super.key});

  @override
  ConsumerState<DiscoverUsersScreen> createState() =>
      _DiscoverUsersScreenState();
}

class _DiscoverUsersScreenState extends ConsumerState<DiscoverUsersScreen> {
  final Set<String> _followedIds = {};
  final Set<String> _loadingIds = {};

  Future<void> _toggleFollow(String userId) async {
    if (_loadingIds.contains(userId)) return;

    setState(() => _loadingIds.add(userId));
    try {
      final dioClient = ref.read(dioClientProvider);
      if (_followedIds.contains(userId)) {
        await dioClient.delete('/follow/$userId');
        setState(() => _followedIds.remove(userId));
      } else {
        await dioClient.post('/follow/$userId');
        setState(() => _followedIds.add(userId));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update follow: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingIds.remove(userId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final suggestionsAsync = ref.watch(userSuggestionsProvider);

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppTheme.backgroundDark,
        title: const Text('Discover People'),
      ),
      body: RefreshIndicator(
        color: AppTheme.voltLime,
        backgroundColor: AppTheme.cardDark,
        onRefresh: () async {
          ref.invalidate(userSuggestionsProvider);
        },
        child: suggestionsAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppTheme.voltLime),
          ),
          error: (error, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(32),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        color: AppTheme.hotOrange,
                        size: 48,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Failed to load suggestions',
                        style: TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        error.toString(),
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 14,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () =>
                            ref.invalidate(userSuggestionsProvider),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.voltLime,
                        ),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          data: (suggestions) {
            if (suggestions.isEmpty) {
              return ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.people_outline,
                            color: AppTheme.textTertiary,
                            size: 64,
                          ),
                          SizedBox(height: 16),
                          Text(
                            'No suggestions yet',
                            style: TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Check in to more shows to get personalized suggestions!',
                            style: TextStyle(
                              color: AppTheme.textSecondary,
                              fontSize: 14,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            }

            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: suggestions.length,
              itemBuilder: (context, index) {
                final user = suggestions[index];
                final isFollowed = _followedIds.contains(user.id);
                final isLoading = _loadingIds.contains(user.id);

                return _SuggestionCard(
                  user: user,
                  isFollowed: isFollowed,
                  isLoading: isLoading,
                  onFollow: () => _toggleFollow(user.id),
                  onTap: () => context.push('/users/${user.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({
    required this.user,
    required this.isFollowed,
    required this.isLoading,
    required this.onFollow,
    required this.onTap,
  });

  final SuggestedUser user;
  final bool isFollowed;
  final bool isLoading;
  final VoidCallback onFollow;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppTheme.cardDark,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor:
                    AppTheme.voltLime.withValues(alpha: 0.2),
                backgroundImage: user.profileImageUrl != null
                    ? NetworkImage(user.profileImageUrl!)
                    : null,
                child: user.profileImageUrl == null
                    ? const Icon(Icons.person,
                        color: AppTheme.voltLime, size: 28)
                    : null,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            user.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (user.isVerified) ...[
                          const SizedBox(width: 4),
                          const Icon(Icons.verified,
                              color: AppTheme.electricBlue, size: 16),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '@${user.username}',
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 14,
                      ),
                    ),
                    if (user.reason != null && user.reason!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        user.reason!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 100,
                height: 36,
                child: isLoading
                    ? const Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppTheme.voltLime,
                          ),
                        ),
                      )
                    : isFollowed
                        ? FilledButton(
                            onPressed: onFollow,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppTheme.voltLime,
                              padding: EdgeInsets.zero,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: const Text(
                              'Following',
                              style: TextStyle(fontSize: 13),
                            ),
                          )
                        : OutlinedButton(
                            onPressed: onFollow,
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(
                                  color: AppTheme.voltLime),
                              padding: EdgeInsets.zero,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: const Text(
                              'Follow',
                              style: TextStyle(
                                color: AppTheme.voltLime,
                                fontSize: 13,
                              ),
                            ),
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
