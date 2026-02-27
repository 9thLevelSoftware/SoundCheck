import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/utils/a11y_utils.dart';
import '../../domain/happening_now_group.dart';

/// Card showing a group of friends at the same event (Happening Now tab)
/// Displays event name, venue, friend avatars row, and relative timestamp
class HappeningNowCard extends StatelessWidget {
  const HappeningNowCard({
    required this.group, super.key,
    this.onTap,
  });

  final HappeningNowGroup group;
  final VoidCallback? onTap;

  String _getTimeAgo(String createdAt) {
    try {
      final dateTime = DateTime.parse(createdAt);
      final now = DateTime.now();
      final difference = now.difference(dateTime);

      if (difference.inMinutes < 1) {
        return 'just now';
      } else if (difference.inMinutes < 60) {
        return '${difference.inMinutes}m ago';
      } else if (difference.inHours < 24) {
        return '${difference.inHours}h ago';
      } else {
        return '${difference.inDays}d ago';
      }
    } catch (e) {
      return '';
    }
  }

  String _buildFriendNames() {
    final names = group.friends.map((f) => f.username).toList();
    final remaining = group.totalFriendCount - names.length;

    if (names.isEmpty) return '';

    if (names.length == 1 && remaining == 0) {
      return '${names[0]} at this show';
    } else if (names.length == 2 && remaining == 0) {
      return '${names[0]} and ${names[1]} at this show';
    } else if (remaining > 0) {
      return '${names.join(", ")} and $remaining more at this show';
    } else {
      final last = names.removeLast();
      return '${names.join(", ")} and $last at this show';
    }
  }

  @override
  Widget build(BuildContext context) {
    final timeAgo = _getTimeAgo(group.lastCheckinAt);
    final firstFriend = group.friends.isNotEmpty ? group.friends.first.username : 'Friends';

    return Semantics(
      label: happeningNowSemantics(
        username: firstFriend,
        eventName: group.eventName,
      ),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.electricPurple.withValues(alpha: 0.3),
            width: 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Event header with live indicator
            Row(
              children: [
                // Pulsing live dot
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppTheme.liveIndicator,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.eventName,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        group.venueName,
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 13,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Friend avatars row (max 3 visible + overflow count)
            Row(
              children: [
                _FriendAvatarRow(
                  friends: group.friends,
                  totalCount: group.totalFriendCount,
                ),
              ],
            ),

            const SizedBox(height: 8),

            // Friend names summary
            Text(
              _buildFriendNames(),
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 13,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),

            const SizedBox(height: 8),

            // Timestamp
            Text(
              'Last check-in: $timeAgo',
              style: const TextStyle(
                color: AppTheme.textTertiary,
                fontSize: 12,
              ),
            ),
          ],
        ),
        ),
      ),
    );
  }
}

/// Row of friend avatars with +N overflow indicator
class _FriendAvatarRow extends StatelessWidget {
  const _FriendAvatarRow({
    required this.friends,
    required this.totalCount,
  });

  final List<HappeningNowFriend> friends;
  final int totalCount;

  static const double _avatarSize = 36;
  static const double _overlap = 8;
  static const int _maxVisible = 3;

  @override
  Widget build(BuildContext context) {
    final visibleFriends = friends.take(_maxVisible).toList();
    final overflowCount = totalCount - visibleFriends.length;

    return SizedBox(
      height: _avatarSize,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Overlapping avatars
          SizedBox(
            width: visibleFriends.length * (_avatarSize - _overlap) + _overlap,
            child: Stack(
              children: [
                for (int i = 0; i < visibleFriends.length; i++)
                  Positioned(
                    left: i * (_avatarSize - _overlap),
                    child: _FriendAvatar(
                      friend: visibleFriends[i],
                      size: _avatarSize,
                    ),
                  ),
              ],
            ),
          ),
          // +N more indicator
          if (overflowCount > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.surfaceVariantDark,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '+$overflowCount more',
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _FriendAvatar extends StatelessWidget {
  const _FriendAvatar({
    required this.friend,
    required this.size,
  });

  final HappeningNowFriend friend;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: AppTheme.cardDark,
          width: 2,
        ),
      ),
      child: ClipOval(
        child: friend.profileImageUrl != null &&
                friend.profileImageUrl!.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: friend.profileImageUrl!,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorWidget: (context, url, error) => _InitialCircle(
                  username: friend.username,
                  size: size,
                ),
              )
            : _InitialCircle(
                username: friend.username,
                size: size,
              ),
      ),
    );
  }
}

class _InitialCircle extends StatelessWidget {
  const _InitialCircle({
    required this.username,
    required this.size,
  });

  final String username;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: AppTheme.primaryGradient,
      ),
      child: Center(
        child: Text(
          username.isNotEmpty ? username[0].toUpperCase() : '?',
          style: TextStyle(
            color: AppTheme.backgroundDark,
            fontWeight: FontWeight.bold,
            fontSize: size * 0.35,
          ),
        ),
      ),
    );
  }
}
