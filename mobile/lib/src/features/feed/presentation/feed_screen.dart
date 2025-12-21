import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../checkins/presentation/providers/checkin_providers.dart';
import '../../checkins/domain/checkin.dart';

/// Social Activity Feed - The Home Screen
/// Shows a vertical scroll of check-in cards from friends and global activity
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final ScrollController _scrollController = ScrollController();
  String _selectedFilter = 'friends';

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _changeFilter(String filter) {
    if (_selectedFilter != filter) {
      setState(() {
        _selectedFilter = filter;
      });
      // Invalidate and refetch the feed
      ref.invalidate(socialFeedProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final feedAsync = ref.watch(socialFeedProvider);

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: CustomScrollView(
        controller: _scrollController,
        slivers: [
          // App Bar
          SliverAppBar(
            floating: true,
            backgroundColor: AppTheme.backgroundDark,
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'PITPULSE',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.search),
                onPressed: () => context.push('/discover'),
              ),
            ],
          ),

          // Feed Tabs (Friends / Global)
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  _FeedTab(
                    label: 'Friends',
                    isSelected: _selectedFilter == 'friends',
                    onTap: () => _changeFilter('friends'),
                  ),
                  const SizedBox(width: 12),
                  _FeedTab(
                    label: 'Global',
                    isSelected: _selectedFilter == 'global',
                    onTap: () => _changeFilter('global'),
                  ),
                ],
              ),
            ),
          ),

          // Check-in Cards - Using real data
          feedAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(32.0),
                child: Center(
                  child: CircularProgressIndicator(
                    color: AppTheme.electricPurple,
                  ),
                ),
              ),
            ),
            error: (error, stack) => SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        color: AppTheme.neonPink,
                        size: 48,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Failed to load feed',
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        error.toString(),
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 14,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(socialFeedProvider),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.electricPurple,
                        ),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            data: (checkIns) {
              if (checkIns.isEmpty) {
                return const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.all(32.0),
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.music_off,
                            color: AppTheme.textTertiary,
                            size: 64,
                          ),
                          SizedBox(height: 16),
                          Text(
                            'No check-ins yet',
                            style: TextStyle(
                              color: AppTheme.textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 8),
                          Text(
                            'Start checking in to shows to see activity here!',
                            style: TextStyle(
                              color: AppTheme.textSecondary,
                              fontSize: 14,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }

              return SliverPadding(
                padding: const EdgeInsets.only(bottom: 100), // Space for nav bar
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final checkIn = checkIns[index];
                      return _CheckInCard(
                        checkIn: checkIn,
                        onTap: () {
                          // Navigate to check-in detail
                          context.push('/checkins/${checkIn.id}');
                        },
                        onToast: () async {
                          await ref
                              .read(toastCheckInProvider.notifier)
                              .toggle(checkIn.id, checkIn.hasToasted);
                        },
                      );
                    },
                    childCount: checkIns.length,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _FeedTab extends StatelessWidget {
  const _FeedTab({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.electricPurple : AppTheme.surfaceVariantDark,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppTheme.textSecondary,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}

/// Check-in Card - The main feed item
class _CheckInCard extends StatelessWidget {
  const _CheckInCard({
    required this.checkIn,
    required this.onTap,
    this.onToast,
  });

  final CheckIn checkIn;
  final VoidCallback onTap;
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

  IconData _getVibeIcon(String vibeName) {
    final lowerName = vibeName.toLowerCase();
    if (lowerName.contains('sound') || lowerName.contains('audio')) {
      return Icons.volume_up;
    } else if (lowerName.contains('mosh') || lowerName.contains('pit') ||
        lowerName.contains('energy')) {
      return Icons.local_fire_department;
    } else if (lowerName.contains('light') || lowerName.contains('visual')) {
      return Icons.lightbulb;
    } else if (lowerName.contains('crowd') || lowerName.contains('audience')) {
      return Icons.people;
    } else if (lowerName.contains('stage')) {
      return Icons.theater_comedy;
    } else {
      return Icons.music_note;
    }
  }

  @override
  Widget build(BuildContext context) {
    final userName = checkIn.user?.username ?? 'Unknown';
    final bandName = checkIn.band?.name ?? 'Unknown Band';
    final venueName = checkIn.venue?.name ?? 'Unknown Venue';
    final rating = checkIn.rating;
    final time = _getTimeAgo(checkIn.createdAt);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: User info
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                // User Avatar
                Container(
                  width: 40,
                  height: 40,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: AppTheme.primaryGradient,
                  ),
                  child: Center(
                    child: Text(
                      userName[0],
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // User action text
                Expanded(
                  child: RichText(
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
                        const TextSpan(text: ' is watching '),
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
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.electricPurple,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Concert Photo (placeholder)
          Container(
            height: 200,
            width: double.infinity,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppTheme.electricPurple.withOpacity(0.3),
                  AppTheme.neonPink.withOpacity(0.3),
                ],
              ),
            ),
            child: Stack(
              children: [
                // Placeholder pattern
                Center(
                  child: Icon(
                    Icons.music_note,
                    size: 64,
                    color: Colors.white.withOpacity(0.3),
                  ),
                ),
                // Gradient overlay at bottom
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
                          Colors.black.withOpacity(0.7),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Rating and Vibes
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Rating Row
                Row(
                  children: [
                    ...List.generate(5, (i) {
                      final isActive = i < rating;
                      return Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: Icon(
                          Icons.star,
                          size: 20,
                          color: isActive
                              ? AppTheme.electricPurple
                              : AppTheme.ratingInactive,
                        ),
                      );
                    }),
                    const Spacer(),
                    // Badge indicator
                    if (checkIn.earnedBadges != null &&
                        checkIn.earnedBadges!.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.toastGold.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.emoji_events,
                              size: 14,
                              color: AppTheme.toastGold,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${checkIn.earnedBadges!.length} Badge${checkIn.earnedBadges!.length > 1 ? 's' : ''} Earned!',
                              style: const TextStyle(
                                color: AppTheme.toastGold,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),

                // Vibe Tags
                if (checkIn.vibes != null && checkIn.vibes!.isNotEmpty)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: checkIn.vibes!.map((vibe) {
                      return _VibeChip(
                        label: vibe.displayName,
                        icon: _getVibeIcon(vibe.displayName),
                      );
                    }).toList(),
                  ),

                // Comment
                if (checkIn.comment != null && checkIn.comment!.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(
                    checkIn.comment!,
                    style: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Footer Actions
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
            child: Row(
              children: [
                // Toast Button
                _ActionButton(
                  icon: Icons.sports_bar,
                  label: '${checkIn.toastCount}',
                  isActive: checkIn.hasToasted,
                  activeColor: AppTheme.toastGold,
                  onTap: onToast ?? () {},
                ),
                const SizedBox(width: 24),
                // Comment Button
                _ActionButton(
                  icon: Icons.chat_bubble_outline,
                  label: '${checkIn.commentCount}',
                  isActive: false,
                  onTap: onTap,
                ),
                const Spacer(),
                // Timestamp
                Text(
                  time,
                  style: const TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 12,
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

class _VibeChip extends StatelessWidget {
  const _VibeChip({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppTheme.surfaceVariantDark,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 14,
            color: AppTheme.textSecondary,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
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
