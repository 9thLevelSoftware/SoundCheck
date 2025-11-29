import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Type of empty state to display
enum EmptyStateType {
  noVenues,
  noBands,
  noCheckins,
  noBadges,
  noSearchResults,
  general,
}

/// A reusable widget for displaying empty states with illustrations and CTAs
class EmptyStateWidget extends StatelessWidget {
  final EmptyStateType type;
  final String? customTitle;
  final String? customMessage;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyStateWidget({
    required this.type, super.key,
    this.customTitle,
    this.customMessage,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final config = _getConfig();

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacing32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Illustration
            Container(
              padding: const EdgeInsets.all(AppTheme.spacing32),
              decoration: BoxDecoration(
                color: config.color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                config.icon,
                size: 80,
                color: config.color,
              ),
            ),
            const SizedBox(height: AppTheme.spacing24),

            // Title
            Text(
              customTitle ?? config.title,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppTheme.spacing12),

            // Message
            Text(
              customMessage ?? config.message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.textSecondary,
                  ),
              textAlign: TextAlign.center,
            ),

            // Action Button (if provided)
            if (onAction != null) ...[
              const SizedBox(height: AppTheme.spacing24),
              ElevatedButton.icon(
                onPressed: onAction,
                icon: Icon(config.actionIcon),
                label: Text(actionLabel ?? config.actionLabel),
              ),
            ],
          ],
        ),
      ),
    );
  }

  _EmptyStateConfig _getConfig() {
    switch (type) {
      case EmptyStateType.noVenues:
        return _EmptyStateConfig(
          icon: Icons.location_city_outlined,
          color: AppTheme.primary,
          title: 'No Venues Found',
          message:
              'There are no venues available yet. Check back later or explore other areas!',
          actionLabel: 'Refresh',
          actionIcon: Icons.refresh,
        );
      case EmptyStateType.noBands:
        return _EmptyStateConfig(
          icon: Icons.music_note_outlined,
          color: AppTheme.primary,
          title: 'No Bands Found',
          message:
              'There are no bands available yet. Check back later or explore different genres!',
          actionLabel: 'Refresh',
          actionIcon: Icons.refresh,
        );
      case EmptyStateType.noCheckins:
        return _EmptyStateConfig(
          icon: Icons.music_note_outlined,
          color: AppTheme.electricPurple,
          title: 'No Check-ins Yet',
          message:
              'Be the first to check in! Share your concert experience with the community.',
          actionLabel: 'Check In',
          actionIcon: Icons.add,
        );
      case EmptyStateType.noBadges:
        return _EmptyStateConfig(
          icon: Icons.emoji_events_outlined,
          color: AppTheme.toastGold,
          title: 'No Badges Earned Yet',
          message:
              'Start checking in to concerts and shows to earn badges! Complete challenges to unlock achievements.',
          actionLabel: 'Discover',
          actionIcon: Icons.explore,
        );
      case EmptyStateType.noSearchResults:
        return _EmptyStateConfig(
          icon: Icons.search_off_outlined,
          color: AppTheme.textSecondary,
          title: 'No Results Found',
          message:
              'We couldn\'t find what you\'re looking for. Try different keywords or browse all venues and bands.',
          actionLabel: 'Clear Search',
          actionIcon: Icons.clear,
        );
      case EmptyStateType.general:
        return _EmptyStateConfig(
          icon: Icons.inbox_outlined,
          color: AppTheme.textSecondary,
          title: 'Nothing Here',
          message: 'There\'s nothing to display at the moment.',
          actionLabel: 'Go Back',
          actionIcon: Icons.arrow_back,
        );
    }
  }
}

class _EmptyStateConfig {
  final IconData icon;
  final Color color;
  final String title;
  final String message;
  final String actionLabel;
  final IconData actionIcon;

  _EmptyStateConfig({
    required this.icon,
    required this.color,
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.actionIcon,
  });
}
