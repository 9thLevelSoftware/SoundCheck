import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../shared/utils/haptic_feedback.dart';
import '../../../shared/utils/date_formatter.dart';
import '../../badges/domain/badge.dart';
import '../../checkins/domain/checkin.dart';
import 'providers/profile_providers.dart';

/// Profile Screen - Gamification-focused user profile
/// Modeled after Untappd's profile with stats emphasis
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: authState.when(
        data: (user) => user == null
            ? const Center(child: Text('Not logged in'))
            : RefreshIndicator(
                color: AppTheme.electricPurple,
                backgroundColor: AppTheme.cardDark,
                onRefresh: () async {
                  await ref.read(authStateProvider.notifier).refreshUser();
                },
                child: CustomScrollView(
                  slivers: [
                    // Profile Header with Cover
                    SliverToBoxAdapter(
                      child: _ProfileHeader(user: user),
                    ),

                    // Main Stats Row (Untappd-style)
                    SliverToBoxAdapter(
                      child: _MainStatsRow(user: user),
                    ),

                    // Level Progress
                    SliverToBoxAdapter(
                      child: _LevelProgress(totalCheckins: user.totalCheckins),
                    ),

                    // Section: Recent Activity
                    const SliverToBoxAdapter(
                      child: _SectionHeader(
                        title: 'Recent Activity',
                        trailing: 'View All',
                      ),
                    ),

                    // Recent Check-ins
                    SliverToBoxAdapter(
                      child: _RecentCheckins(userId: user.id),
                    ),

                    // Section: Badges
                    const SliverToBoxAdapter(
                      child: _SectionHeader(
                        title: 'Badges',
                        trailing: 'View All',
                      ),
                    ),

                    // Badges Grid
                    SliverToBoxAdapter(
                      child: _BadgesShowcase(userId: user.id),
                    ),

                    // Section: Wishlist
                    const SliverToBoxAdapter(
                      child: _SectionHeader(
                        title: 'Wishlist',
                        subtitle: 'Bands you want to see',
                        trailing: 'View All',
                      ),
                    ),

                    // Wishlist Preview
                    SliverToBoxAdapter(
                      child: _WishlistPreview(),
                    ),

                    // Section: Top Genres
                    const SliverToBoxAdapter(
                      child: _SectionHeader(title: 'Top Genres'),
                    ),

                    // Genre Stats
                    SliverToBoxAdapter(
                      child: _GenreStats(userId: user.id),
                    ),

                    // Bottom padding for nav bar
                    const SliverToBoxAdapter(
                      child: SizedBox(height: 120),
                    ),
                  ],
                ),
              ),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.electricPurple),
        ),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppTheme.error),
              const SizedBox(height: 16),
              const Text('Error loading profile', style: TextStyle(color: AppTheme.textSecondary)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.invalidate(authStateProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Profile Header with cover image and avatar
class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.user});

  final dynamic user;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Cover image
        Container(
          height: 140,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppTheme.electricPurple,
                AppTheme.electricPurple.withValues(alpha:0.6),
                AppTheme.neonPink.withValues(alpha:0.4),
              ],
            ),
          ),
        ),

        // Actions bar
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          right: 8,
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.share, color: Colors.white),
                onPressed: () {
                  HapticFeedbackUtil.selectionClick();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Share profile coming soon'),
                      backgroundColor: AppTheme.electricPurple,
                    ),
                  );
                },
              ),
              IconButton(
                icon: const Icon(Icons.settings, color: Colors.white),
                onPressed: () {
                  HapticFeedbackUtil.selectionClick();
                  context.push('/profile/settings');
                },
              ),
            ],
          ),
        ),

        // Profile info below cover
        Container(
          margin: const EdgeInsets.only(top: 90),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // Avatar
                  Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.backgroundDark,
                        width: 4,
                      ),
                    ),
                    child: CircleAvatar(
                      radius: 50,
                      backgroundColor: AppTheme.cardDark,
                      backgroundImage: user.profileImageUrl != null
                          ? NetworkImage(user.profileImageUrl!)
                          : null,
                      child: user.profileImageUrl == null
                          ? Text(
                              user.username[0].toUpperCase(),
                              style: const TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.electricPurple,
                              ),
                            )
                          : null,
                    ),
                  ),
                  const Spacer(),
                  // Edit button
                  OutlinedButton.icon(
                    onPressed: () {
                      HapticFeedbackUtil.selectionClick();
                      context.push('/profile/edit');
                    },
                    icon: const Icon(Icons.edit, size: 16),
                    label: const Text('Edit'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.textPrimary,
                      side: BorderSide(color: AppTheme.textTertiary.withValues(alpha:0.3)),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Username and name
              Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user.username,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    if (user.firstName != null || user.lastName != null)
                      Text(
                        '${user.firstName ?? ''} ${user.lastName ?? ''}'.trim(),
                        style: const TextStyle(
                          fontSize: 16,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    if (user.bio != null && user.bio!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          user.bio!,
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppTheme.textSecondary,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    const SizedBox(height: 8),
                    // Member since
                    Row(
                      children: [
                        const Icon(
                          Icons.calendar_today,
                          size: 14,
                          color: AppTheme.textTertiary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Member since ${DateFormat('MMMM yyyy').format(DateTime.parse(user.createdAt))}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.textTertiary,
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
      ],
    );
  }
}

// Main Stats Row - Untappd style
class _MainStatsRow extends StatelessWidget {
  const _MainStatsRow({required this.user});

  final dynamic user;

  @override
  Widget build(BuildContext context) {
    // Use real stats from user model
    final totalCheckins = user.totalCheckins;
    final uniqueBands = user.uniqueBands;
    final uniqueVenues = user.uniqueVenues;
    final badgesCount = user.badgesCount;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.electricPurple.withValues(alpha:0.2),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _StatItem(
            value: totalCheckins.toString(),
            label: 'Check-ins',
            icon: Icons.music_note,
            color: AppTheme.electricPurple,
          ),
          _StatDivider(),
          _StatItem(
            value: uniqueBands.toString(),
            label: 'Unique Bands',
            icon: Icons.album,
            color: AppTheme.neonPink,
          ),
          _StatDivider(),
          _StatItem(
            value: uniqueVenues.toString(),
            label: 'Venues',
            icon: Icons.location_on,
            color: AppTheme.liveGreen,
          ),
          _StatDivider(),
          _StatItem(
            value: badgesCount.toString(),
            label: 'Badges',
            icon: Icons.emoji_events,
            color: AppTheme.toastGold,
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppTheme.textTertiary,
          ),
        ),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      width: 1,
      color: AppTheme.textTertiary.withValues(alpha:0.2),
    );
  }
}

// Level Progress Bar
class _LevelProgress extends StatelessWidget {
  final int totalCheckins;

  const _LevelProgress({required this.totalCheckins});

  // Calculate level from total checkins
  // Each level requires more XP: Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 250 XP, etc.
  static (int level, int currentXP, int nextLevelXP, String title) _calculateLevel(int checkins) {
    // XP per checkin
    const xpPerCheckin = 50;
    final totalXP = checkins * xpPerCheckin;

    // Level thresholds (cumulative XP needed)
    const levels = [
      (1, 0, 'Newcomer'),
      (2, 100, 'Explorer'),
      (3, 250, 'Regular'),
      (4, 500, 'Enthusiast'),
      (5, 800, 'Devotee'),
      (6, 1200, 'Aficionado'),
      (7, 1700, 'Veteran'),
      (8, 2300, 'Expert'),
      (9, 3000, 'Master'),
      (10, 4000, 'Legend'),
      (11, 5500, 'Icon'),
      (12, 7500, 'Superstar'),
      (13, 10000, 'Elite'),
      (14, 15000, 'Champion'),
      (15, 25000, 'Ultimate'),
    ];

    int currentLevel = 1;
    int currentThreshold = 0;
    int nextThreshold = 100;
    String title = 'Newcomer';

    for (int i = 0; i < levels.length; i++) {
      final (level, threshold, levelTitle) = levels[i];
      if (totalXP >= threshold) {
        currentLevel = level;
        currentThreshold = threshold;
        title = levelTitle;
        nextThreshold = i + 1 < levels.length ? levels[i + 1].$2 : threshold + 10000;
      } else {
        break;
      }
    }

    final xpInCurrentLevel = totalXP - currentThreshold;
    final xpNeededForNext = nextThreshold - currentThreshold;

    return (currentLevel, xpInCurrentLevel, xpNeededForNext, title);
  }

  @override
  Widget build(BuildContext context) {
    final (currentLevel, currentXP, nextLevelXP, title) = _calculateLevel(totalCheckins);
    final progress = nextLevelXP > 0 ? (currentXP / nextLevelXP).clamp(0.0, 1.0) : 1.0;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      'LVL $currentLevel',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.backgroundDark,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ],
              ),
              Text(
                '$currentXP / $nextLevelXP XP',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.textTertiary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: AppTheme.surfaceDark,
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${nextLevelXP - currentXP} XP until Level ${currentLevel + 1}',
            style: const TextStyle(
              fontSize: 11,
              color: AppTheme.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}

// Section Header
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTrailingTap,
  });

  final String title;
  final String? subtitle;
  final String? trailing;
  final VoidCallback? onTrailingTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textTertiary,
                  ),
                ),
            ],
          ),
          if (trailing != null)
            TextButton(
              onPressed: onTrailingTap ?? () {
                debugPrint('$title - $trailing tapped');
              },
              child: Text(
                trailing!,
                style: const TextStyle(
                  color: AppTheme.electricPurple,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// Recent Check-ins
class _RecentCheckins extends ConsumerWidget {
  const _RecentCheckins({required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final checkinsAsync = ref.watch(userRecentCheckinsProvider(userId));

    return checkinsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Center(
          child: CircularProgressIndicator(color: AppTheme.electricPurple),
        ),
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.error, size: 32),
              const SizedBox(height: 8),
              const Text(
                'Failed to load check-ins',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
              TextButton(
                onPressed: () => ref.invalidate(userRecentCheckinsProvider(userId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (checkins) {
        if (checkins.isEmpty) {
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppTheme.cardDark,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.music_off, size: 48, color: AppTheme.textTertiary),
                  SizedBox(height: 12),
                  Text(
                    'No check-ins yet',
                    style: TextStyle(
                      fontSize: 16,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Start checking in to concerts!',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: checkins.length,
          itemBuilder: (context, index) {
            final checkin = checkins[index];
            return _CheckinCard(
              checkin: checkin,
              onTap: () {
                HapticFeedbackUtil.selectionClick();
                context.push('/checkins/${checkin.id}');
              },
            );
          },
        );
      },
    );
  }
}

class _CheckinCard extends StatelessWidget {
  const _CheckinCard({
    required this.checkin,
    this.onTap,
  });

  final CheckIn checkin;
  final VoidCallback? onTap;

  void _navigateToBand(BuildContext context, String bandId) {
    HapticFeedbackUtil.selectionClick();
    context.push('/bands/$bandId');
  }

  @override
  Widget build(BuildContext context) {
    final bandId = checkin.band?.id;
    final bandName = checkin.band?.name ?? 'Unknown Band';
    final venueName = checkin.venue?.name ?? 'Unknown Venue';
    final rating = checkin.rating;
    final timeAgo = DateFormatter.formatRelativeTime(checkin.createdAt);
    final toasts = checkin.toastCount;
    final comments = checkin.commentCount;
    final bandImageUrl = checkin.band?.imageUrl;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Band logo - tappable to navigate to band detail
                GestureDetector(
                  onTap: bandId != null ? () => _navigateToBand(context, bandId) : null,
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppTheme.surfaceDark,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: bandImageUrl != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              bandImageUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.album,
                                color: AppTheme.electricPurple,
                              ),
                            ),
                          )
                        : const Icon(
                            Icons.album,
                            color: AppTheme.electricPurple,
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                // Info - band name tappable to navigate to band detail
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: bandId != null ? () => _navigateToBand(context, bandId) : null,
                        child: Text(
                          bandName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ),
                      Text(
                        venueName,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                // Rating (only show if rating > 0)
                if (rating > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: _getRatingColor(rating).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.star,
                          size: 16,
                          color: _getRatingColor(rating),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          rating.toStringAsFixed(2),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: _getRatingColor(rating),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            // Footer with social stats
            Row(
              children: [
                Text(
                  timeAgo,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textTertiary,
                  ),
                ),
                const Spacer(),
                // Toasts
                Row(
                  children: [
                    const Icon(
                      Icons.sports_bar,
                      size: 14,
                      color: AppTheme.toastGold,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '$toasts',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 16),
                // Comments
                Row(
                  children: [
                    const Icon(
                      Icons.chat_bubble_outline,
                      size: 14,
                      color: AppTheme.textTertiary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '$comments',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Color _getRatingColor(double rating) {
    if (rating >= 4.5) return AppTheme.ratingExcellent;
    if (rating >= 4.0) return AppTheme.ratingGood;
    if (rating >= 3.0) return AppTheme.ratingAverage;
    return AppTheme.ratingPoor;
  }
}

// Badges Showcase
class _BadgesShowcase extends ConsumerWidget {
  const _BadgesShowcase({required this.userId});

  final String userId;

  // Map badge types to icons and colors
  static IconData _getBadgeIcon(BadgeType type) {
    switch (type) {
      case BadgeType.reviewCount:
        return Icons.rate_review;
      case BadgeType.venueExplorer:
        return Icons.explore;
      case BadgeType.musicLover:
        return Icons.music_note;
      case BadgeType.eventAttendance:
        return Icons.celebration;
      case BadgeType.helpfulCount:
        return Icons.thumb_up;
    }
  }

  static Color _getBadgeColor(BadgeType type) {
    switch (type) {
      case BadgeType.reviewCount:
        return AppTheme.neonPink;
      case BadgeType.venueExplorer:
        return AppTheme.info;
      case BadgeType.musicLover:
        return AppTheme.toastGold;
      case BadgeType.eventAttendance:
        return AppTheme.liveGreen;
      case BadgeType.helpfulCount:
        return AppTheme.electricPurple;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final badgesAsync = ref.watch(userBadgesProvider(userId));

    return badgesAsync.when(
      loading: () => const SizedBox(
        height: 110,
        child: Center(
          child: CircularProgressIndicator(color: AppTheme.electricPurple),
        ),
      ),
      error: (error, _) => SizedBox(
        height: 110,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.error, size: 32),
              const SizedBox(height: 8),
              const Text(
                'Failed to load badges',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
              TextButton(
                onPressed: () => ref.invalidate(userBadgesProvider(userId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (userBadges) {
        if (userBadges.isEmpty) {
          return Container(
            height: 110,
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.cardDark,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.emoji_events_outlined, size: 32, color: AppTheme.textTertiary),
                  SizedBox(height: 8),
                  Text(
                    'No badges earned yet',
                    style: TextStyle(
                      fontSize: 14,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  Text(
                    'Keep checking in to earn badges!',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return SizedBox(
          height: 110,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: userBadges.length,
            itemBuilder: (context, index) {
              final userBadge = userBadges[index];
              final badge = userBadge.badge;
              final badgeName = badge?.name ?? 'Badge';
              final badgeType = badge?.badgeType ?? BadgeType.eventAttendance;
              final badgeColor = badge?.color != null
                  ? Color(int.parse(badge!.color!.replaceFirst('#', '0xFF')))
                  : _getBadgeColor(badgeType);
              final badgeIcon = _getBadgeIcon(badgeType);

              return Container(
                width: 80,
                margin: const EdgeInsets.only(right: 12),
                child: Column(
                  children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        color: badgeColor.withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                        border: Border.all(color: badgeColor, width: 2),
                      ),
                      child: badge?.iconUrl != null
                          ? ClipOval(
                              child: Image.network(
                                badge!.iconUrl!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Icon(
                                  badgeIcon,
                                  color: badgeColor,
                                  size: 28,
                                ),
                              ),
                            )
                          : Icon(
                              badgeIcon,
                              color: badgeColor,
                              size: 28,
                            ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      badgeName,
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppTheme.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
    );
  }
}

// Wishlist Preview
class _WishlistPreview extends StatelessWidget {
  void _navigateToBand(BuildContext context, String bandId) {
    HapticFeedbackUtil.selectionClick();
    context.push('/bands/$bandId');
  }

  @override
  Widget build(BuildContext context) {
    // Mock wishlist - when real data is available, each item should have a bandId
    final wishlist = [
      {'id': 'mock-tool-id', 'band': 'Tool', 'genre': 'Progressive Metal'},
      {'id': 'mock-rammstein-id', 'band': 'Rammstein', 'genre': 'Industrial Metal'},
      {'id': 'mock-slipknot-id', 'band': 'Slipknot', 'genre': 'Nu Metal'},
    ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: wishlist.asMap().entries.map((entry) {
          final index = entry.key;
          final item = entry.value;
          final bandId = item['id'];
          return Column(
            children: [
              ListTile(
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceDark,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.album, color: AppTheme.textTertiary),
                ),
                title: Text(
                  item['band']!,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                subtitle: Text(
                  item['genre']!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textTertiary,
                  ),
                ),
                trailing: const Icon(
                  Icons.bookmark,
                  color: AppTheme.electricPurple,
                ),
                onTap: bandId != null ? () => _navigateToBand(context, bandId) : null,
              ),
              if (index < wishlist.length - 1)
                Divider(
                  height: 1,
                  indent: 70,
                  color: AppTheme.textTertiary.withValues(alpha:0.1),
                ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

// Genre Stats
class _GenreStats extends ConsumerWidget {
  const _GenreStats({required this.userId});

  final String userId;

  static const _colors = [
    AppTheme.electricPurple,
    AppTheme.neonPink,
    AppTheme.liveGreen,
    AppTheme.toastGold,
    AppTheme.textTertiary,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final genreStatsAsync = ref.watch(userGenreStatsProvider(userId));

    return genreStatsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Center(
          child: CircularProgressIndicator(color: AppTheme.electricPurple),
        ),
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.error, size: 32),
              const SizedBox(height: 8),
              const Text(
                'Failed to load genre stats',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
              TextButton(
                onPressed: () => ref.invalidate(userGenreStatsProvider(userId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (genres) {
        if (genres.isEmpty) {
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppTheme.cardDark,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.bar_chart, size: 48, color: AppTheme.textTertiary),
                  SizedBox(height: 12),
                  Text(
                    'No genre data yet',
                    style: TextStyle(
                      fontSize: 16,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Check in to concerts to see your genre stats!',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppTheme.textTertiary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.cardDark,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: genres.asMap().entries.map((entry) {
              final index = entry.key;
              final genre = entry.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          genre['name'] as String,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        Text(
                          '${genre['count']} check-ins',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.textTertiary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(3),
                      child: LinearProgressIndicator(
                        value: (genre['percent'] as double).clamp(0.0, 1.0),
                        minHeight: 6,
                        backgroundColor: AppTheme.surfaceDark,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          _colors[index % _colors.length],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }
}
