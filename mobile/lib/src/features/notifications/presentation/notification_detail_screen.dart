import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/notification.dart';
import 'providers/notification_providers.dart';

/// Notification Detail Screen
/// Shows detailed view of a specific notification with related content
class NotificationDetailScreen extends ConsumerWidget {
  final String? notificationId;

  const NotificationDetailScreen({super.key, this.notificationId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationFeedProvider);

    // Find the notification by ID, or show a loading/error state
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        title: const Text(
          'Notification',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: notificationsAsync.when(
        data: (feed) {
          if (notificationId == null) {
            return const _EmptyNotificationState(
              icon: Icons.notifications_none,
              title: 'Notification not found',
              subtitle: 'The notification ID is missing',
            );
          }

          final notification = feed.notifications.firstWhere(
            (n) => n.id == notificationId,
            orElse: () => AppNotification(
              id: notificationId!,
              userId: '',
              type: '',
              createdAt: DateTime.now().toIso8601String(),
              title: 'Notification not found',
              message: 'This notification may have been deleted or expired.',
            ),
          );

          return _NotificationContent(notification: notification);
        },
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) => _EmptyNotificationState(
          icon: Icons.error_outline,
          title: 'Error loading notification',
          subtitle: error.toString(),
        ),
      ),
    );
  }
}

/// Content view for a notification
class _NotificationContent extends StatelessWidget {
  final AppNotification notification;

  const _NotificationContent({required this.notification});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Notification type indicator
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: _getTypeColor(notification.type).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _getTypeIcon(notification.type),
                  size: 16,
                  color: _getTypeColor(notification.type),
                ),
                const SizedBox(width: 6),
                Text(
                  _getTypeLabel(notification.type),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: _getTypeColor(notification.type),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Title
          if (notification.title != null) ...[
            Text(
              notification.title!,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Message
          if (notification.message != null)
            Text(
              notification.message!,
              style: const TextStyle(
                fontSize: 16,
                color: AppTheme.textSecondary,
                height: 1.5,
              ),
            ),

          const SizedBox(height: 24),

          // Related content based on notification type
          _buildRelatedContent(context),

          const SizedBox(height: 24),

          // Timestamp
          Text(
            _formatTimestamp(notification.createdAt),
            style: const TextStyle(
              fontSize: 12,
              color: AppTheme.textTertiary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRelatedContent(BuildContext context) {
    final type = NotificationTypeExtension.fromString(notification.type);

    switch (type) {
      case NotificationType.toast:
      case NotificationType.comment:
        if (notification.checkin != null) {
          return _RelatedCheckInCard(checkIn: notification.checkin!);
        }
        break;
      case NotificationType.badgeEarned:
        if (notification.badge != null) {
          return _RelatedBadgeCard(badge: notification.badge!);
        }
        break;
      case NotificationType.newFollower:
        if (notification.fromUser != null) {
          return _RelatedUserCard(user: notification.fromUser!);
        }
        break;
      case NotificationType.showReminder:
        if (notification.show != null) {
          return _RelatedShowCard(show: notification.show!);
        }
        break;
      case NotificationType.friendCheckin:
        if (notification.checkin != null) {
          return _RelatedCheckInCard(checkIn: notification.checkin!);
        }
        break;
    }

    return const SizedBox.shrink();
  }

  Color _getTypeColor(String type) {
    final notificationType = NotificationTypeExtension.fromString(type);
    switch (notificationType) {
      case NotificationType.toast:
        return AppTheme.toastGold;
      case NotificationType.comment:
        return AppTheme.info;
      case NotificationType.badgeEarned:
        return AppTheme.voltLime;
      case NotificationType.friendCheckin:
        return AppTheme.hotOrange;
      case NotificationType.showReminder:
        return AppTheme.warning;
      case NotificationType.newFollower:
        return AppTheme.success;
    }
  }

  IconData _getTypeIcon(String type) {
    final notificationType = NotificationTypeExtension.fromString(type);
    switch (notificationType) {
      case NotificationType.toast:
        return Icons.sports_bar;
      case NotificationType.comment:
        return Icons.chat_bubble_outline;
      case NotificationType.badgeEarned:
        return Icons.emoji_events;
      case NotificationType.friendCheckin:
        return Icons.person_add;
      case NotificationType.showReminder:
        return Icons.event;
      case NotificationType.newFollower:
        return Icons.favorite;
    }
  }

  String _getTypeLabel(String type) {
    final notificationType = NotificationTypeExtension.fromString(type);
    switch (notificationType) {
      case NotificationType.toast:
        return 'Toast';
      case NotificationType.comment:
        return 'Comment';
      case NotificationType.badgeEarned:
        return 'Badge Earned';
      case NotificationType.friendCheckin:
        return 'Friend Check-in';
      case NotificationType.showReminder:
        return 'Show Reminder';
      case NotificationType.newFollower:
        return 'New Follower';
    }
  }

  String _formatTimestamp(String createdAt) {
    final date = DateTime.tryParse(createdAt);
    if (date == null) return createdAt;

    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes} min ago';
    if (diff.inDays < 1) return '${diff.inHours} hours ago';
    if (diff.inDays < 7) return '${diff.inDays} days ago';
    if (diff.inDays < 30) return '${(diff.inDays / 7).floor()} weeks ago';
    if (diff.inDays < 365) return '${(diff.inDays / 30).floor()} months ago';
    return '${(diff.inDays / 365).floor()} years ago';
  }
}

/// Empty state widget
class _EmptyNotificationState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _EmptyNotificationState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: AppTheme.textTertiary),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Related check-in card
class _RelatedCheckInCard extends StatelessWidget {
  final dynamic checkIn;

  const _RelatedCheckInCard({required this.checkIn});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Related Check-in',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppTheme.textTertiary,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: checkIn.band?.imageUrl != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          checkIn.band.imageUrl,
                          fit: BoxFit.cover,
                        ),
                      )
                    : const Icon(Icons.album, color: AppTheme.voltLime),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      checkIn.band?.name ?? 'Unknown Band',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      checkIn.venue?.name ?? 'Unknown Venue',
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Related badge card
class _RelatedBadgeCard extends StatelessWidget {
  final dynamic badge;

  const _RelatedBadgeCard({required this.badge});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: AppTheme.voltLime.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: badge.iconUrl != null
                ? ClipOval(
                    child: Image.network(
                      badge.iconUrl,
                      fit: BoxFit.cover,
                    ),
                  )
                : const Icon(Icons.emoji_events, color: AppTheme.voltLime),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  badge.name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (badge.description != null)
                  Text(
                    badge.description!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Related user card
class _RelatedUserCard extends StatelessWidget {
  final dynamic user;

  const _RelatedUserCard({required this.user});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundImage:
                user.profileImageUrl != null
                    ? NetworkImage(user.profileImageUrl)
                    : null,
            child: user.profileImageUrl == null
                ? Text(user.username[0].toUpperCase())
                : null,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  user.username,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                if (user.firstName != null || user.lastName != null)
                  Text(
                    '${user.firstName ?? ''} ${user.lastName ?? ''}'.trim(),
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Related show card
class _RelatedShowCard extends StatelessWidget {
  final dynamic show;

  const _RelatedShowCard({required this.show});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Related Show',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppTheme.textTertiary,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            show.title ?? 'Show',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          if (show.date != null)
            Text(
              show.date,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
        ],
      ),
    );
  }
}
