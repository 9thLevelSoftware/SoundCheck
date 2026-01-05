import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';

/// Notifications Screen - Activity alerts
/// Shows toasts, comments, badges earned, friend check-ins
/// Currently showing "Coming Soon" state as backend notifications route is not yet implemented
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppTheme.backgroundDark,
        elevation: 0,
        title: const Text(
          'Activity',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Icon
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: AppTheme.electricPurple.withValues(alpha:0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.notifications_outlined,
                  size: 64,
                  color: AppTheme.electricPurple.withValues(alpha:0.6),
                ),
              ),
              const SizedBox(height: 32),

              // Title
              const Text(
                'Notifications Coming Soon',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),

              // Description
              Text(
                'Stay tuned for updates on toasts, comments, badges, and friend check-ins.',
                style: TextStyle(
                  fontSize: 16,
                  color: AppTheme.textSecondary.withValues(alpha:0.8),
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),

              // Feature Preview List
              const _FeaturePreviewItem(
                icon: Icons.sports_bar,
                color: AppTheme.toastGold,
                label: 'Toasts on your check-ins',
              ),
              const SizedBox(height: 12),
              const _FeaturePreviewItem(
                icon: Icons.chat_bubble_outline,
                color: AppTheme.electricPurple,
                label: 'Comments and replies',
              ),
              const SizedBox(height: 12),
              const _FeaturePreviewItem(
                icon: Icons.emoji_events_outlined,
                color: AppTheme.neonPink,
                label: 'Badges and achievements',
              ),
              const SizedBox(height: 12),
              const _FeaturePreviewItem(
                icon: Icons.music_note,
                color: AppTheme.liveGreen,
                label: 'Friend check-ins',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeaturePreviewItem extends StatelessWidget {
  const _FeaturePreviewItem({
    required this.icon,
    required this.color,
    required this.label,
  });

  final IconData icon;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha:0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 16),
          Text(
            label,
            style: const TextStyle(
              fontSize: 15,
              color: AppTheme.textPrimary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
