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
import '../domain/concert_cred.dart';
import 'providers/profile_providers.dart';

/// Profile Screen - Concert resume / concert cred
/// Modeled after Untappd's profile with stats emphasis.
/// Consumes the concert cred endpoint for server-side aggregate stats.
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
                  ref.invalidate(concertCredProvider(user.id));
                  ref.invalidate(userRecentCheckinsProvider(user.id));
                  ref.invalidate(userBadgesProvider(user.id));
                  await ref.read(authStateProvider.notifier).refreshUser();
                },
                child: CustomScrollView(
                  slivers: [
                    // Profile Header with Cover
                    SliverToBoxAdapter(
                      child: _ProfileHeader(user: user),
                    ),

                    // Main Stats Row (from concert cred)
                    SliverToBoxAdapter(
                      child: _MainStatsRow(userId: user.id),
                    ),

                    // Level Progress
                    SliverToBoxAdapter(
                      child: _LevelProgress(totalCheckins: user.totalCheckins),
                    ),

                    // Section: Genre Breakdown
                    const SliverToBoxAdapter(
                      child: _SectionHeader(title: 'Top Genres'),
                    ),

                    // Genre Breakdown (from concert cred)
                    SliverToBoxAdapter(
                      child: _GenreBreakdown(userId: user.id),
                    ),

                    // Section: Top Rated Bands
                    const SliverToBoxAdapter(
                      child: _SectionHeader(title: 'Favorite Bands'),
                    ),

                    // Top Rated Bands
                    SliverToBoxAdapter(
                      child: _TopRatedBands(userId: user.id),
                    ),

                    // Section: Top Rated Venues
                    const SliverToBoxAdapter(
                      child: _SectionHeader(title: 'Favorite Venues'),
                    ),

                    // Top Rated Venues
                    SliverToBoxAdapter(
                      child: _TopRatedVenues(userId: user.id),
                    ),

                    // Section: Badges
                    SliverToBoxAdapter(
                      child: _SectionHeader(
                        title: 'Badges',
                        trailing: 'View All',
                        onTrailingTap: () {
                          HapticFeedbackUtil.selectionClick();
                          context.push('/badges');
                        },
                      ),
                    ),

                    // Badges Showcase
                    SliverToBoxAdapter(
                      child: _BadgesShowcase(userId: user.id),
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
              const Text(
                'Error loading profile',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
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
                AppTheme.electricPurple.withValues(alpha: 0.6),
                AppTheme.neonPink.withValues(alpha: 0.4),
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
                      side: BorderSide(
                        color: AppTheme.textTertiary.withValues(alpha: 0.3),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
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

// Main Stats Row - sourced from concert cred endpoint
class _MainStatsRow extends ConsumerWidget {
  const _MainStatsRow({required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final credAsync = ref.watch(concertCredProvider(userId));

    return credAsync.when(
      loading: () => Container(
        margin: const EdgeInsets.fromLTRB(16, 24, 16, 8),
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.electricPurple.withValues(alpha: 0.2),
          ),
        ),
        child: const Center(
          child: SizedBox(
            height: 60,
            child: CircularProgressIndicator(
              color: AppTheme.electricPurple,
              strokeWidth: 2,
            ),
          ),
        ),
      ),
      error: (error, _) => Container(
        margin: const EdgeInsets.fromLTRB(16, 24, 16, 8),
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.error, size: 24),
              const SizedBox(height: 8),
              const Text(
                'Could not load stats',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              TextButton(
                onPressed: () => ref.invalidate(concertCredProvider(userId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (cred) => Container(
        margin: const EdgeInsets.fromLTRB(16, 24, 16, 8),
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.electricPurple.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _StatItem(
              value: cred.totalShows.toString(),
              label: 'Shows',
              icon: Icons.music_note,
              color: AppTheme.electricPurple,
            ),
            _StatDivider(),
            _StatItem(
              value: cred.uniqueBands.toString(),
              label: 'Bands',
              icon: Icons.album,
              color: AppTheme.neonPink,
            ),
            _StatDivider(),
            _StatItem(
              value: cred.uniqueVenues.toString(),
              label: 'Venues',
              icon: Icons.location_on,
              color: AppTheme.liveGreen,
            ),
            _StatDivider(),
            _StatItem(
              value: cred.badgesEarned.toString(),
              label: 'Badges',
              icon: Icons.emoji_events,
              color: AppTheme.toastGold,
            ),
          ],
        ),
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
    return Semantics(
      label: '$value $label',
      child: Column(
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
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 40,
      width: 1,
      color: AppTheme.textTertiary.withValues(alpha: 0.2),
    );
  }
}

// Level Progress Bar
class _LevelProgress extends StatelessWidget {
  final int totalCheckins;

  const _LevelProgress({required this.totalCheckins});

  static (int level, int currentXP, int nextLevelXP, String title)
      _calculateLevel(int checkins) {
    const xpPerCheckin = 50;
    final totalXP = checkins * xpPerCheckin;

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
        nextThreshold =
            i + 1 < levels.length ? levels[i + 1].$2 : threshold + 10000;
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
    final (currentLevel, currentXP, nextLevelXP, title) =
        _calculateLevel(totalCheckins);
    final progress =
        nextLevelXP > 0 ? (currentXP / nextLevelXP).clamp(0.0, 1.0) : 1.0;

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
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: AppTheme.surfaceDark,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppTheme.primary),
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
              onPressed: onTrailingTap ??
                  () {
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

// Genre Breakdown from concert cred (server-side computed)
class _GenreBreakdown extends ConsumerWidget {
  const _GenreBreakdown({required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final credAsync = ref.watch(concertCredProvider(userId));

    return credAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: Center(
          child: CircularProgressIndicator(
            color: AppTheme.electricPurple,
            strokeWidth: 2,
          ),
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
                onPressed: () => ref.invalidate(concertCredProvider(userId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (cred) {
        final genres = cred.genres;
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

        final displayGenres = genres.take(5).toList();
        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.cardDark,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: displayGenres.map((genre) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          genre.genre,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        Text(
                          '${genre.count} shows (${genre.percentage}%)',
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
                        value: (genre.percentage / 100).clamp(0.0, 1.0),
                        minHeight: 6,
                        backgroundColor: AppTheme.surfaceDark,
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          AppTheme.electricPurple,
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

// Top Rated Bands - horizontal scrollable list
class _TopRatedBands extends ConsumerWidget {
  const _TopRatedBands({required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final credAsync = ref.watch(concertCredProvider(userId));

    return credAsync.when(
      loading: () => const SizedBox(
        height: 160,
        child: Center(
          child: CircularProgressIndicator(
            color: AppTheme.neonPink,
            strokeWidth: 2,
          ),
        ),
      ),
      error: (error, _) => const SizedBox.shrink(),
      data: (cred) {
        final bands = cred.topBands;
        if (bands.isEmpty) {
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
                  Icon(Icons.album, size: 40, color: AppTheme.textTertiary),
                  SizedBox(height: 8),
                  Text(
                    'Rate bands to see your favorites',
                    style: TextStyle(
                      fontSize: 14,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return SizedBox(
          height: 160,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: bands.length,
            itemBuilder: (context, index) {
              final band = bands[index];
              return _TopBandCard(band: band);
            },
          ),
        );
      },
    );
  }
}

class _TopBandCard extends StatelessWidget {
  const _TopBandCard({required this.band});

  final TopRatedBand band;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: band.id.isNotEmpty
          ? () {
              HapticFeedbackUtil.selectionClick();
              context.push('/bands/${band.id}');
            }
          : null,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.neonPink.withValues(alpha: 0.15),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Band image or icon
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppTheme.surfaceDark,
                borderRadius: BorderRadius.circular(8),
              ),
              child: band.imageUrl != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        band.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.album,
                          color: AppTheme.neonPink,
                        ),
                      ),
                    )
                  : const Icon(Icons.album, color: AppTheme.neonPink),
            ),
            const SizedBox(height: 8),
            // Band name
            Text(
              band.name,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            // Genre tag
            if (band.genre != null)
              Text(
                band.genre!,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.textTertiary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            const Spacer(),
            // Rating and times seen
            Row(
              children: [
                const Icon(Icons.star, size: 14, color: AppTheme.neonPink),
                const SizedBox(width: 2),
                Text(
                  band.avgRating.toStringAsFixed(1),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.neonPink,
                  ),
                ),
                const Spacer(),
                Text(
                  '${band.timesSeen}x',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.textTertiary,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// Top Rated Venues - horizontal scrollable list
class _TopRatedVenues extends ConsumerWidget {
  const _TopRatedVenues({required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final credAsync = ref.watch(concertCredProvider(userId));

    return credAsync.when(
      loading: () => const SizedBox(
        height: 160,
        child: Center(
          child: CircularProgressIndicator(
            color: AppTheme.toastGold,
            strokeWidth: 2,
          ),
        ),
      ),
      error: (error, _) => const SizedBox.shrink(),
      data: (cred) {
        final venues = cred.topVenues;
        if (venues.isEmpty) {
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
                  Icon(
                    Icons.location_on,
                    size: 40,
                    color: AppTheme.textTertiary,
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Rate venues to see your favorites',
                    style: TextStyle(
                      fontSize: 14,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return SizedBox(
          height: 160,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: venues.length,
            itemBuilder: (context, index) {
              final venue = venues[index];
              return _TopVenueCard(venue: venue);
            },
          ),
        );
      },
    );
  }
}

class _TopVenueCard extends StatelessWidget {
  const _TopVenueCard({required this.venue});

  final TopRatedVenue venue;

  @override
  Widget build(BuildContext context) {
    final location = [venue.city, venue.state]
        .where((s) => s != null && s.isNotEmpty)
        .join(', ');

    return GestureDetector(
      onTap: venue.id.isNotEmpty
          ? () {
              HapticFeedbackUtil.selectionClick();
              context.push('/venues/${venue.id}');
            }
          : null,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.toastGold.withValues(alpha: 0.15),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Venue image or icon
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppTheme.surfaceDark,
                borderRadius: BorderRadius.circular(8),
              ),
              child: venue.imageUrl != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        venue.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.location_on,
                          color: AppTheme.toastGold,
                        ),
                      ),
                    )
                  : const Icon(Icons.location_on, color: AppTheme.toastGold),
            ),
            const SizedBox(height: 8),
            // Venue name
            Text(
              venue.name,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            // City/State
            if (location.isNotEmpty)
              Text(
                location,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.textTertiary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            const Spacer(),
            // Rating and times visited
            Row(
              children: [
                const Icon(Icons.star, size: 14, color: AppTheme.toastGold),
                const SizedBox(width: 2),
                Text(
                  venue.avgRating.toStringAsFixed(1),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.toastGold,
                  ),
                ),
                const Spacer(),
                Text(
                  '${venue.timesVisited}x',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.textTertiary,
                  ),
                ),
              ],
            ),
          ],
        ),
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
                onPressed: () =>
                    ref.invalidate(userRecentCheckinsProvider(userId)),
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
                // Band logo
                GestureDetector(
                  onTap: bandId != null
                      ? () => _navigateToBand(context, bandId)
                      : null,
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
                // Info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        onTap: bandId != null
                            ? () => _navigateToBand(context, bandId)
                            : null,
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
                // Rating
                if (rating > 0)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
            // Footer
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

  static IconData _getBadgeIcon(BadgeCategory category) {
    switch (category) {
      case BadgeCategory.checkinCount:
        return Icons.celebration;
      case BadgeCategory.genreExplorer:
        return Icons.music_note;
      case BadgeCategory.uniqueVenues:
        return Icons.explore;
      case BadgeCategory.superfan:
        return Icons.star;
      case BadgeCategory.festivalWarrior:
        return Icons.festival;
      case BadgeCategory.roadWarrior:
        return Icons.directions_car;
    }
  }

  static Color _getBadgeColor(BadgeCategory category) {
    switch (category) {
      case BadgeCategory.checkinCount:
        return AppTheme.liveGreen;
      case BadgeCategory.genreExplorer:
        return AppTheme.toastGold;
      case BadgeCategory.uniqueVenues:
        return AppTheme.info;
      case BadgeCategory.superfan:
        return AppTheme.neonPink;
      case BadgeCategory.festivalWarrior:
        return AppTheme.electricPurple;
      case BadgeCategory.roadWarrior:
        return AppTheme.neonPink;
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
                  Icon(
                    Icons.emoji_events_outlined,
                    size: 32,
                    color: AppTheme.textTertiary,
                  ),
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
              final badgeType = badge?.category ?? BadgeCategory.checkinCount;
              final badgeColor = badge?.color != null
                  ? Color(
                      int.parse(badge!.color!.replaceFirst('#', '0xFF')),
                    )
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
