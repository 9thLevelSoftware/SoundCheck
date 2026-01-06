import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../shared/utils/haptic_feedback.dart';

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
                      child: _RecentCheckins(),
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
                      child: _BadgesShowcase(),
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
                      child: _GenreStats(),
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
    // Mock data - would come from user stats
    final totalCheckins = user.totalCheckins ?? 47;
    final uniqueBands = user.uniqueBands ?? 32;
    final uniqueVenues = user.uniqueVenues ?? 15;
    final badgesCount = user.badgesCount ?? 8;

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
class _RecentCheckins extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Mock data
    final checkins = [
      {
        'band': 'Metallica',
        'venue': 'Red Rocks Amphitheatre',
        'rating': 4.75,
        'time': '2 hours ago',
        'toasts': 12,
        'comments': 3,
      },
      {
        'band': 'Ghost',
        'venue': 'The Forum',
        'rating': 4.5,
        'time': 'Yesterday',
        'toasts': 8,
        'comments': 2,
      },
      {
        'band': 'Iron Maiden',
        'venue': 'Madison Square Garden',
        'rating': 5.0,
        'time': '3 days ago',
        'toasts': 24,
        'comments': 7,
      },
    ];

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: checkins.length,
      itemBuilder: (context, index) {
        final checkin = checkins[index];
        return _CheckinCard(
          bandName: checkin['band'] as String,
          venueName: checkin['venue'] as String,
          rating: checkin['rating'] as double,
          timeAgo: checkin['time'] as String,
          toasts: checkin['toasts'] as int,
          comments: checkin['comments'] as int,
        );
      },
    );
  }
}

class _CheckinCard extends StatelessWidget {
  const _CheckinCard({
    required this.bandName,
    required this.venueName,
    required this.rating,
    required this.timeAgo,
    required this.toasts,
    required this.comments,
  });

  final String bandName;
  final String venueName;
  final double rating;
  final String timeAgo;
  final int toasts;
  final int comments;

  @override
  Widget build(BuildContext context) {
    return Container(
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
              // Band logo placeholder
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppTheme.surfaceDark,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.album,
                  color: AppTheme.electricPurple,
                ),
              ),
              const SizedBox(width: 12),
              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      bandName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _getRatingColor(rating).withValues(alpha:0.15),
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
class _BadgesShowcase extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Mock badges
    final badges = [
      {'name': 'First Check-in', 'icon': Icons.celebration, 'color': AppTheme.liveGreen, 'earned': true},
      {'name': 'Mosh Pit Hero', 'icon': Icons.whatshot, 'color': AppTheme.neonPink, 'earned': true},
      {'name': 'Venue Explorer', 'icon': Icons.explore, 'color': AppTheme.info, 'earned': true},
      {'name': 'Weekend Warrior', 'icon': Icons.nightlife, 'color': AppTheme.electricPurple, 'earned': true},
      {'name': 'Metal Head', 'icon': Icons.music_note, 'color': AppTheme.toastGold, 'earned': true},
      {'name': 'Night Owl', 'icon': Icons.nights_stay, 'color': Colors.indigo, 'earned': false},
    ];

    return SizedBox(
      height: 110,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: badges.length,
        itemBuilder: (context, index) {
          final badge = badges[index];
          final isEarned = badge['earned'] as bool;
          return Container(
            width: 80,
            margin: const EdgeInsets.only(right: 12),
            child: Column(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: isEarned
                        ? (badge['color'] as Color).withValues(alpha:0.15)
                        : AppTheme.surfaceDark,
                    shape: BoxShape.circle,
                    border: isEarned
                        ? Border.all(color: badge['color'] as Color, width: 2)
                        : Border.all(color: AppTheme.textTertiary.withValues(alpha:0.3)),
                  ),
                  child: Icon(
                    badge['icon'] as IconData,
                    color: isEarned ? badge['color'] as Color : AppTheme.textTertiary.withValues(alpha:0.5),
                    size: 28,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  badge['name'] as String,
                  style: TextStyle(
                    fontSize: 10,
                    color: isEarned ? AppTheme.textSecondary : AppTheme.textTertiary.withValues(alpha:0.5),
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
  }
}

// Wishlist Preview
class _WishlistPreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Mock wishlist
    final wishlist = [
      {'band': 'Tool', 'genre': 'Progressive Metal'},
      {'band': 'Rammstein', 'genre': 'Industrial Metal'},
      {'band': 'Slipknot', 'genre': 'Nu Metal'},
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
                onTap: () {
                  HapticFeedbackUtil.selectionClick();
                  debugPrint('Wishlist item tapped: ${item['band']}');
                  // TODO: Navigate to band detail screen when route is available
                  // context.push('/bands/${bandId}');
                },
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
class _GenreStats extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Mock genre stats
    final genres = [
      {'name': 'Heavy Metal', 'count': 18, 'percent': 0.38},
      {'name': 'Thrash Metal', 'count': 12, 'percent': 0.25},
      {'name': 'Progressive Metal', 'count': 8, 'percent': 0.17},
      {'name': 'Hard Rock', 'count': 5, 'percent': 0.11},
      {'name': 'Other', 'count': 4, 'percent': 0.09},
    ];

    final colors = [
      AppTheme.electricPurple,
      AppTheme.neonPink,
      AppTheme.liveGreen,
      AppTheme.toastGold,
      AppTheme.textTertiary,
    ];

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
                    value: genre['percent'] as double,
                    minHeight: 6,
                    backgroundColor: AppTheme.surfaceDark,
                    valueColor: AlwaysStoppedAnimation<Color>(colors[index]),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}
