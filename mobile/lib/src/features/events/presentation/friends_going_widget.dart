import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/theme/app_theme.dart';
import '../data/rsvp_repository.dart';
import 'providers/event_providers.dart';

/// Shows overlapping friend avatars and a "N friends going" count
/// for a specific event. Hides itself when no friends are going.
class FriendsGoingWidget extends ConsumerWidget {
  final String eventId;
  const FriendsGoingWidget({required this.eventId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final friendsGoing = ref.watch(friendsGoingProvider(eventId));

    return friendsGoing.when(
      data: (data) {
        if (data.count == 0) return const SizedBox.shrink();
        return _FriendsGoingContent(data: data);
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _FriendsGoingContent extends StatelessWidget {
  final FriendsGoingData data;
  const _FriendsGoingContent({required this.data});

  @override
  Widget build(BuildContext context) {
    final visibleCount = data.friends.length.clamp(0, 5);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Overlapping avatar stack (max 5 shown)
        if (visibleCount > 0)
          SizedBox(
            width: (visibleCount * 20.0) + 12,
            height: 32,
            child: Stack(
              children: data.friends
                  .take(5)
                  .toList()
                  .asMap()
                  .entries
                  .map((entry) {
                return Positioned(
                  left: entry.key * 20.0,
                  child: _FriendAvatarCircle(friend: entry.value),
                );
              }).toList(),
            ),
          ),
        const SizedBox(width: 8),
        // Count text
        Flexible(
          child: Text(
            data.count == 1
                ? '1 friend going'
                : '${data.count} friends going',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppTheme.voltLime,
                  fontWeight: FontWeight.w600,
                ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _FriendAvatarCircle extends StatelessWidget {
  final FriendAvatar friend;
  const _FriendAvatarCircle({required this.friend});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 2),
      ),
      child: CircleAvatar(
        radius: 14,
        backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
        backgroundImage: friend.profileImageUrl != null
            ? CachedNetworkImageProvider(friend.profileImageUrl!)
            : null,
        child: friend.profileImageUrl == null
            ? Text(
                friend.username.isNotEmpty
                    ? friend.username[0].toUpperCase()
                    : '?',
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              )
            : null,
      ),
    );
  }
}
