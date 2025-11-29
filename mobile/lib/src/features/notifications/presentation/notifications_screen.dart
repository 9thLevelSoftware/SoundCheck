import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';

/// Notifications Screen - Activity alerts
/// Shows toasts, comments, badges earned, friend check-ins
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: CustomScrollView(
        slivers: [
          // App Bar
          const SliverAppBar(
            floating: true,
            backgroundColor: AppTheme.backgroundDark,
            title: Text(
              'Activity',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            actions: [
              _MarkAllReadButton(),
            ],
          ),

          // Notifications List
          SliverPadding(
            padding: const EdgeInsets.only(bottom: 100),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  return _NotificationItem(
                    index: index,
                    onTap: () {},
                  );
                },
                childCount: 15,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MarkAllReadButton extends StatelessWidget {
  const _MarkAllReadButton();

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('All notifications marked as read'),
            backgroundColor: AppTheme.electricPurple,
          ),
        );
      },
      child: const Text(
        'Mark all read',
        style: TextStyle(
          color: AppTheme.electricPurple,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _NotificationItem extends StatelessWidget {
  const _NotificationItem({
    required this.index,
    required this.onTap,
  });

  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Generate different notification types
    final type = _NotificationType.values[index % _NotificationType.values.length];
    final isUnread = index < 3; // First 3 are unread

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: isUnread
            ? AppTheme.electricPurple.withOpacity(0.1)
            : AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
        border: isUnread
            ? Border.all(color: AppTheme.electricPurple.withOpacity(0.3))
            : null,
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: _NotificationAvatar(type: type),
        title: _NotificationContent(type: type, index: index),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            _getTimeAgo(index),
            style: const TextStyle(
              color: AppTheme.textTertiary,
              fontSize: 12,
            ),
          ),
        ),
        trailing: isUnread
            ? Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: AppTheme.electricPurple,
                  shape: BoxShape.circle,
                ),
              )
            : null,
      ),
    );
  }

  String _getTimeAgo(int index) {
    final times = ['Just now', '5m ago', '15m ago', '1h ago', '2h ago', '3h ago', 'Yesterday', '2 days ago'];
    return times[index % times.length];
  }
}

enum _NotificationType {
  toast,
  comment,
  badge,
  friendCheckin,
  newFollower,
}

class _NotificationAvatar extends StatelessWidget {
  const _NotificationAvatar({required this.type});

  final _NotificationType type;

  @override
  Widget build(BuildContext context) {
    Color bgColor;
    IconData icon;

    switch (type) {
      case _NotificationType.toast:
        bgColor = AppTheme.toastGold;
        icon = Icons.sports_bar;
        break;
      case _NotificationType.comment:
        bgColor = AppTheme.electricPurple;
        icon = Icons.chat_bubble;
        break;
      case _NotificationType.badge:
        bgColor = AppTheme.neonPink;
        icon = Icons.emoji_events;
        break;
      case _NotificationType.friendCheckin:
        bgColor = AppTheme.liveGreen;
        icon = Icons.music_note;
        break;
      case _NotificationType.newFollower:
        bgColor = AppTheme.info;
        icon = Icons.person_add;
        break;
    }

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: bgColor.withOpacity(0.2),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: bgColor, size: 24),
    );
  }
}

class _NotificationContent extends StatelessWidget {
  const _NotificationContent({
    required this.type,
    required this.index,
  });

  final _NotificationType type;
  final int index;

  @override
  Widget build(BuildContext context) {
    final userNames = ['Sarah M.', 'Mike T.', 'Alex R.', 'Jordan L.', 'Casey B.'];
    final bandNames = ['Metallica', 'Iron Maiden', 'Ghost', 'Gojira', 'Mastodon'];
    final badgeNames = ['Mosh Pit Hero', 'Concert Junkie', 'Venue Explorer', 'Band Hunter', 'Weekend Warrior'];
    final venueNames = ['The Forum', 'Red Rocks', 'MSG', 'Wembley', 'The Fillmore'];

    final userName = userNames[index % userNames.length];
    final bandName = bandNames[index % bandNames.length];
    final badgeName = badgeNames[index % badgeNames.length];
    final venueName = venueNames[index % venueNames.length];

    switch (type) {
      case _NotificationType.toast:
        return RichText(
          text: TextSpan(
            style: const TextStyle(
              fontSize: 14,
              color: AppTheme.textPrimary,
            ),
            children: [
              TextSpan(
                text: userName,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const TextSpan(text: ' toasted your check-in to '),
              TextSpan(
                text: bandName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppTheme.electricPurple,
                ),
              ),
            ],
          ),
        );

      case _NotificationType.comment:
        return RichText(
          text: TextSpan(
            style: const TextStyle(
              fontSize: 14,
              color: AppTheme.textPrimary,
            ),
            children: [
              TextSpan(
                text: userName,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const TextSpan(text: ' commented on your check-in: '),
              const TextSpan(
                text: '"Great show! 🤘"',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
            ],
          ),
        );

      case _NotificationType.badge:
        return RichText(
          text: TextSpan(
            style: const TextStyle(
              fontSize: 14,
              color: AppTheme.textPrimary,
            ),
            children: [
              const TextSpan(text: 'You earned the '),
              TextSpan(
                text: badgeName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppTheme.neonPink,
                ),
              ),
              const TextSpan(text: ' badge!'),
            ],
          ),
        );

      case _NotificationType.friendCheckin:
        return RichText(
          text: TextSpan(
            style: const TextStyle(
              fontSize: 14,
              color: AppTheme.textPrimary,
            ),
            children: [
              TextSpan(
                text: userName,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const TextSpan(text: ' just checked in to '),
              TextSpan(
                text: bandName,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppTheme.electricPurple,
                ),
              ),
              const TextSpan(text: ' at '),
              TextSpan(
                text: venueName,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ],
          ),
        );

      case _NotificationType.newFollower:
        return RichText(
          text: TextSpan(
            style: const TextStyle(
              fontSize: 14,
              color: AppTheme.textPrimary,
            ),
            children: [
              TextSpan(
                text: userName,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const TextSpan(text: ' started following you'),
            ],
          ),
        );
    }
  }
}
