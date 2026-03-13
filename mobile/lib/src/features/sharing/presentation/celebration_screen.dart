import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:percent_indicator/linear_percent_indicator.dart';

import '../../../core/theme/app_theme.dart';
import '../../badges/domain/badge.dart';
import '../../badges/presentation/badge_providers.dart';
import '../../checkins/domain/checkin.dart';
import 'share_card_preview.dart';
import 'share_providers.dart';

/// Parameters passed to the CelebrationScreen after a successful check-in.
class CelebrationParams {
  final String checkinId;
  final String bandName;
  final String venueName;
  final List<EarnedBadge> earnedBadges;

  const CelebrationParams({
    required this.checkinId,
    required this.bandName,
    required this.venueName,
    this.earnedBadges = const [],
  });
}

/// Post-check-in celebration screen.
///
/// Shown after a successful check-in, this screen displays:
/// 1. Success animation with checkmark
/// 2. Event info (band, venue)
/// 3. Badge progress section (newly earned + progress toward others)
/// 4. Share card preview with platform-specific share buttons
/// 5. Done button to dismiss
class CelebrationScreen extends ConsumerStatefulWidget {
  const CelebrationScreen({
    required this.params, super.key,
  });

  final CelebrationParams params;

  @override
  ConsumerState<CelebrationScreen> createState() => _CelebrationScreenState();
}

class _CelebrationScreenState extends ConsumerState<CelebrationScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animController, curve: Curves.elasticOut),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _animController,
        curve: const Interval(0.0, 0.5, curve: Curves.easeIn),
      ),
    );
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final params = widget.params;
    final cardUrls = ref.watch(checkinCardProvider(params.checkinId));

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppTheme.backgroundDark,
        leading: IconButton(
          icon: const Icon(Icons.close),
          tooltip: 'Close',
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Checked In!',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const SizedBox(height: 16),

            // Success animation
            AnimatedBuilder(
              animation: _animController,
              builder: (context, child) => Transform.scale(
                scale: _scaleAnimation.value,
                child: FadeTransition(
                  opacity: _fadeAnimation,
                  child: child,
                ),
              ),
              child: Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check,
                  color: AppTheme.backgroundDark,
                  size: 48,
                ),
              ),
            ),
            const SizedBox(height: 16),

            // "You checked in!" heading
            const Text(
              'You checked in!',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),

            // Band name
            Text(
              params.bandName,
              style: const TextStyle(
                color: AppTheme.voltLime,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),

            // Venue name
            Text(
              params.venueName,
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 14,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),

            // Share card preview - PRIMARY CTA (elevated above badges)
            ShareCardPreview(
              cardUrls: cardUrls,
              shareText:
                  'I just checked in at ${params.venueName} for ${params.bandName}!',
              shareUrl:
                  'https://soundcheck-app.up.railway.app/share/c/${params.checkinId}',
            ),
            const SizedBox(height: 24),

            // Badge progress section (secondary)
            if (params.earnedBadges.isNotEmpty) ...[
              _buildBadgeSection(params.earnedBadges),
              const SizedBox(height: 16),
            ],

            // Badge progress from existing provider
            _buildBadgeProgressSection(),
            const SizedBox(height: 24),

            // Done button - DEMOTED to ghost/outlined style
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton(
                onPressed: () => context.pop(),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppTheme.textTertiary),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text(
                  'Done',
                  style: TextStyle(
                    fontSize: 16,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  /// Newly earned badges section with golden highlights.
  Widget _buildBadgeSection(List<EarnedBadge> badges) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.emoji_events, color: AppTheme.toastGold, size: 20),
            SizedBox(width: 8),
            Text(
              'Badges Earned!',
              style: TextStyle(
                color: AppTheme.toastGold,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ...badges.map((badge) => _BadgeEarnedTile(badge: badge)),
      ],
    );
  }

  /// Badge progress section showing progress toward unearned badges.
  Widget _buildBadgeProgressSection() {
    final progressAsync = ref.watch(badgeProgressProvider);

    return progressAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (allProgress) {
        // Show badges that are close to being earned (>50% progress, not yet earned)
        final nearCompletion = allProgress.where((bp) {
          if (bp.isEarned) return false;
          if (bp.requirementValue <= 0) return false;
          final pct = bp.currentValue / bp.requirementValue;
          return pct >= 0.3;
        }).toList();

        if (nearCompletion.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Badge Progress',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...nearCompletion.take(3).map(
                  (bp) => _BadgeProgressTile(progress: bp),
                ),
          ],
        );
      },
    );
  }
}

/// Tile displaying a newly earned badge with golden styling.
class _BadgeEarnedTile extends StatelessWidget {
  const _BadgeEarnedTile({required this.badge});

  final EarnedBadge badge;

  @override
  Widget build(BuildContext context) {
    final color = _parseColor(badge.color);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.toastGold.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: AppTheme.toastGold.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: badge.iconUrl != null
                ? ClipOval(
                    child: Image.network(
                      badge.iconUrl!,
                      width: 40,
                      height: 40,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Icon(
                        Icons.emoji_events,
                        color: color,
                        size: 24,
                      ),
                    ),
                  )
                : Icon(Icons.emoji_events, color: color, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  badge.name,
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (badge.description != null)
                  Text(
                    badge.description!,
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
          const Icon(
            Icons.star,
            color: AppTheme.toastGold,
            size: 20,
          ),
        ],
      ),
    );
  }

  Color _parseColor(String? hex) {
    if (hex == null || hex.isEmpty) return AppTheme.voltLime;
    final code = hex.replaceAll('#', '');
    if (code.length != 6) return AppTheme.voltLime;
    return Color(int.parse('FF$code', radix: 16));
  }
}

/// Tile displaying progress toward a badge with a progress bar.
class _BadgeProgressTile extends StatelessWidget {
  const _BadgeProgressTile({required this.progress});

  final BadgeProgress progress;

  @override
  Widget build(BuildContext context) {
    final pct = progress.requirementValue > 0
        ? (progress.currentValue / progress.requirementValue).clamp(0.0, 1.0)
        : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  progress.badge.name,
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 6),
                LinearPercentIndicator(
                  padding: EdgeInsets.zero,
                  lineHeight: 6,
                  percent: pct,
                  progressColor: AppTheme.voltLime,
                  backgroundColor: AppTheme.surfaceVariantDark,
                  barRadius: const Radius.circular(3),
                  animation: true,
                  animationDuration: 600,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '${progress.currentValue}/${progress.requirementValue}',
            style: const TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
