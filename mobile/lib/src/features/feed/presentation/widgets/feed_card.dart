import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/feed_item.dart';

/// Untappd-style balanced feed card showing user + event info + photo + badge indicator
/// Ratings and badges are behind a tap (detail view), not on the card surface
class FeedCard extends StatelessWidget {
  const FeedCard({
    super.key,
    required this.item,
    this.onToast,
  });

  final FeedItem item;
  final VoidCallback? onToast;

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
      } else if (difference.inDays < 7) {
        return '${difference.inDays}d ago';
      } else {
        return '${difference.inDays ~/ 7}w ago';
      }
    } catch (e) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final timeAgo = _getTimeAgo(item.createdAt);

    return GestureDetector(
      onTap: () => context.push('/checkins/${item.checkinId}'),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: User avatar + action text
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  _UserAvatar(
                    username: item.username,
                    avatarUrl: item.userAvatarUrl,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        RichText(
                          text: TextSpan(
                            style: const TextStyle(
                              fontSize: 14,
                              color: AppTheme.textPrimary,
                            ),
                            children: [
                              TextSpan(
                                text: item.username,
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              const TextSpan(text: ' checked in at '),
                              TextSpan(
                                text: item.eventName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.electricPurple,
                                ),
                              ),
                              const TextSpan(text: ' @ '),
                              TextSpan(
                                text: item.venueName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.electricPurple,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (item.eventDate != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              item.eventDate!,
                              style: const TextStyle(
                                color: AppTheme.textTertiary,
                                fontSize: 12,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Photo area or gradient placeholder
            _PhotoArea(
              photoUrl: item.photoUrl,
              hasBadgeEarned: item.hasBadgeEarned,
            ),

            // Footer: Comment preview + Toast + Comment + Timestamp
            Container(
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: AppTheme.surfaceVariantDark,
                    width: 1,
                  ),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (item.commentPreview != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        item.commentPreview!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  Row(
                    children: [
                      // Toast button
                      _ActionButton(
                        icon: Icons.sports_bar,
                        label: '${item.toastCount}',
                        isActive: item.hasUserToasted,
                        activeColor: AppTheme.toastGold,
                        onTap: onToast ?? () {},
                      ),
                      const SizedBox(width: 24),
                      // Comment button
                      _ActionButton(
                        icon: Icons.chat_bubble_outline,
                        label: '${item.commentCount}',
                        isActive: false,
                        onTap: () => context.push('/checkins/${item.checkinId}'),
                      ),
                      const Spacer(),
                      // Timestamp
                      Text(
                        timeAgo,
                        style: const TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// User avatar with CachedNetworkImage or initial letter fallback
class _UserAvatar extends StatelessWidget {
  const _UserAvatar({
    required this.username,
    this.avatarUrl,
    this.size = 40,
  });

  final String username;
  final String? avatarUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (avatarUrl != null && avatarUrl!.isNotEmpty) {
      return ClipOval(
        child: CachedNetworkImage(
          imageUrl: avatarUrl!,
          width: size,
          height: size,
          fit: BoxFit.cover,
          placeholder: (context, url) => _InitialAvatar(
            username: username,
            size: size,
          ),
          errorWidget: (context, url, error) => _InitialAvatar(
            username: username,
            size: size,
          ),
        ),
      );
    }
    return _InitialAvatar(username: username, size: size);
  }
}

class _InitialAvatar extends StatelessWidget {
  const _InitialAvatar({
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
            fontSize: size * 0.4,
          ),
        ),
      ),
    );
  }
}

/// Photo area with optional badge earned indicator
class _PhotoArea extends StatelessWidget {
  const _PhotoArea({
    this.photoUrl,
    required this.hasBadgeEarned,
  });

  final String? photoUrl;
  final bool hasBadgeEarned;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 200,
      width: double.infinity,
      child: Stack(
        children: [
          // Photo or placeholder
          if (photoUrl != null && photoUrl!.isNotEmpty)
            CachedNetworkImage(
              imageUrl: photoUrl!,
              width: double.infinity,
              height: 200,
              fit: BoxFit.cover,
              placeholder: (context, url) => _GradientPlaceholder(),
              errorWidget: (context, url, error) => _GradientPlaceholder(),
            )
          else
            _GradientPlaceholder(),

          // Bottom gradient overlay for text readability
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              height: 60,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.7),
                  ],
                ),
              ),
            ),
          ),

          // Badge earned indicator (top-right ribbon)
          if (hasBadgeEarned)
            Positioned(
              top: 8,
              right: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.toastGold.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.emoji_events,
                      size: 14,
                      color: AppTheme.backgroundDark,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'Badge Earned!',
                      style: TextStyle(
                        color: AppTheme.backgroundDark,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _GradientPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 200,
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.electricPurple.withValues(alpha: 0.3),
            AppTheme.neonPink.withValues(alpha: 0.3),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.music_note,
          size: 64,
          color: Colors.white.withValues(alpha: 0.3),
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
    this.activeColor,
  });

  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final Color? activeColor;

  @override
  Widget build(BuildContext context) {
    final color = isActive
        ? (activeColor ?? AppTheme.electricPurple)
        : AppTheme.textTertiary;

    return GestureDetector(
      onTap: onTap,
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
