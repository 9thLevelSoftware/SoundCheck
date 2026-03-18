import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/notification.dart';
import 'providers/notification_providers.dart';

/// Notifications Screen - Activity alerts
/// Shows toasts, comments, badges earned, friend check-ins
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationFeedAsync = ref.watch(notificationFeedProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        title: const Text(
          'Activity',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          notificationFeedAsync.when(
            data: (feed) => feed.unreadCount > 0
                ? TextButton(
                    style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: () async {
                      await ref
                          .read(markAllNotificationsAsReadProvider.notifier)
                          .markAllAsRead();
                    },
                    child: const Text(
                      'Mark all read',
                      style: TextStyle(
                        color: AppTheme.voltLime,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: notificationFeedAsync.when(
        data: (feed) => _buildNotificationList(context, ref, feed),
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: AppTheme.voltLime,
          ),
        ),
        error: (error, _) => _buildErrorState(context, ref, error),
      ),
    );
  }

  Widget _buildNotificationList(
    BuildContext context,
    WidgetRef ref,
    NotificationFeed feed,
  ) {
    if (feed.notifications.isEmpty) {
      return _buildEmptyState(context);
    }

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(notificationFeedProvider);
      },
      color: AppTheme.voltLime,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: feed.notifications.length,
        itemBuilder: (context, index) {
          final notification = feed.notifications[index];
          return _NotificationItem(
            notification: notification,
            onTap: () => _handleNotificationTap(context, ref, notification),
            onDismiss: () => _handleNotificationDismiss(ref, notification),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: AppTheme.voltLime.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.notifications_outlined,
                size: 64,
                color: AppTheme.voltLime.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'No notifications yet',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            Text(
              'When you get toasts, comments, badges, or friend check-ins, they\'ll show up here.',
              style: TextStyle(
                fontSize: 16,
                color: AppTheme.textSecondary.withValues(alpha: 0.8),
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, WidgetRef ref, Object error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: AppTheme.error.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.error_outline,
                size: 48,
                color: AppTheme.error.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Something went wrong',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'Unable to load notifications. Please try again.',
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary.withValues(alpha: 0.8),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                ref.invalidate(notificationFeedProvider);
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  void _handleNotificationTap(
    BuildContext context,
    WidgetRef ref,
    AppNotification notification,
  ) async {
    // Mark as read
    if (!notification.isRead) {
      await ref
          .read(markNotificationAsReadProvider.notifier)
          .markAsRead(notification.id);
    }

    // Check if context is still valid after async operation
    if (!context.mounted) return;

    // Navigate based on notification type
    switch (notification.type) {
      case 'new_follower':
        // Navigate to the follower's profile
        final userId = notification.fromUserId ?? notification.fromUser?.id;
        if (userId != null) {
          context.push('/users/$userId');
        }
        break;

      case 'toast':
      case 'comment':
        // Navigate to the check-in
        final checkinId = notification.checkinId ?? notification.checkin?.id;
        if (checkinId != null) {
          context.push('/checkins/$checkinId');
        }
        break;

      case 'friend_checkin':
        // Navigate to the check-in (or venue if no check-in ID)
        final checkinId = notification.checkinId ?? notification.checkin?.id;
        if (checkinId != null) {
          context.push('/checkins/$checkinId');
        } else {
          // Fallback to venue if available
          final venueId = notification.checkin?.venue?.id;
          if (venueId != null) {
            context.push('/venues/$venueId');
          }
        }
        break;

      case 'badge_earned':
        // Navigate to user's own profile to see badges
        // No dedicated badges route exists, so go to profile
        context.go('/profile');
        break;

      case 'show_reminder':
        // Navigate to band detail (shows are tied to bands)
        final bandId = notification.show?.band?.id;
        if (bandId != null) {
          context.push('/bands/$bandId');
        } else {
          // Fallback to venue if available
          final venueId = notification.show?.venue?.id;
          if (venueId != null) {
            context.push('/venues/$venueId');
          }
        }
        break;

      default:
        // For unknown types, log and do nothing
        debugPrint('Unknown notification type: ${notification.type}');
    }
  }

  void _handleNotificationDismiss(WidgetRef ref, AppNotification notification) {
    ref.read(deleteNotificationProvider.notifier).delete(notification.id);
  }
}

class _NotificationItem extends StatelessWidget {
  const _NotificationItem({
    required this.notification,
    required this.onTap,
    required this.onDismiss,
  });

  final AppNotification notification;
  final VoidCallback onTap;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key(notification.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDismiss(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: AppTheme.error,
        child: const Icon(
          Icons.delete,
          color: Colors.white,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: notification.isRead
                ? Colors.transparent
                : AppTheme.voltLime.withValues(alpha: 0.05),
            border: Border(
              bottom: BorderSide(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                width: 0.5,
              ),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildNotificationIcon(),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildNotificationContent(),
                    const SizedBox(height: 4),
                    Text(
                      _formatTimestamp(notification.createdAt),
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (!notification.isRead)
                Container(
                  width: 8,
                  height: 8,
                  margin: const EdgeInsets.only(top: 6),
                  decoration: const BoxDecoration(
                    color: AppTheme.voltLime,
                    shape: BoxShape.circle,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNotificationIcon() {
    IconData icon;
    Color color;

    switch (notification.type) {
      case 'toast':
        icon = Icons.sports_bar;
        color = AppTheme.toastGold;
        break;
      case 'comment':
        icon = Icons.chat_bubble_outline;
        color = AppTheme.electricBlue;
        break;
      case 'badge_earned':
        icon = Icons.emoji_events_outlined;
        color = AppTheme.hotOrange;
        break;
      case 'friend_checkin':
        icon = Icons.music_note;
        color = AppTheme.voltLime;
        break;
      case 'show_reminder':
        icon = Icons.event;
        color = AppTheme.electricBlue;
        break;
      case 'new_follower':
        icon = Icons.person_add_outlined;
        color = AppTheme.voltLime;
        break;
      default:
        icon = Icons.notifications_outlined;
        color = AppTheme.textSecondary;
    }

    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: color, size: 22),
    );
  }

  Widget _buildNotificationContent() {
    String title;
    String? subtitle;

    switch (notification.type) {
      case 'toast':
        final username = notification.fromUser?.username ?? 'Someone';
        title = '$username toasted your check-in';
        subtitle = notification.checkin?.band?.name;
        break;
      case 'comment':
        final username = notification.fromUser?.username ?? 'Someone';
        title = '$username commented on your check-in';
        subtitle = notification.message;
        break;
      case 'badge_earned':
        final badgeName = notification.badge?.name ?? 'a badge';
        title = 'You earned $badgeName!';
        subtitle = notification.badge?.name;
        break;
      case 'friend_checkin':
        final username = notification.fromUser?.username ?? 'A friend';
        final bandName = notification.checkin?.band?.name ?? 'a show';
        title = '$username checked in to $bandName';
        subtitle = notification.checkin?.venue?.name;
        break;
      case 'show_reminder':
        final bandName = notification.show?.band?.name ?? 'A show';
        title = 'Reminder: $bandName is playing soon';
        subtitle = notification.show?.venue?.name;
        break;
      case 'new_follower':
        final username = notification.fromUser?.username ?? 'Someone';
        title = '$username started following you';
        subtitle = null;
        break;
      default:
        title = notification.title ?? 'New notification';
        subtitle = notification.message;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 15,
            fontWeight: notification.isRead ? FontWeight.w400 : FontWeight.w600,
            color: AppTheme.textPrimary,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 13,
              color: AppTheme.textSecondary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ],
    );
  }

  String _formatTimestamp(String timestamp) {
    try {
      final date = DateTime.parse(timestamp);
      final now = DateTime.now();
      final difference = now.difference(date);

      if (difference.inMinutes < 1) {
        return 'Just now';
      } else if (difference.inHours < 1) {
        return '${difference.inMinutes}m ago';
      } else if (difference.inDays < 1) {
        return '${difference.inHours}h ago';
      } else if (difference.inDays < 7) {
        return '${difference.inDays}d ago';
      } else {
        return '${date.month}/${date.day}/${date.year}';
      }
    } catch (e) {
      return '';
    }
  }
}
