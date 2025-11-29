import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';

/// Social Activity Feed - The Home Screen
/// Shows a vertical scroll of check-in cards from friends and global activity
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
                    isSelected: true,
                    onTap: () {},
                  ),
                  const SizedBox(width: 12),
                  _FeedTab(
                    label: 'Global',
                    isSelected: false,
                    onTap: () {},
                  ),
                ],
              ),
            ),
          ),

          // Check-in Cards
          SliverPadding(
            padding: const EdgeInsets.only(bottom: 100), // Space for nav bar
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  // Placeholder check-in cards
                  return _CheckInCard(
                    index: index,
                    onTap: () {},
                  );
                },
                childCount: 10, // Placeholder count
              ),
            ),
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
    required this.index,
    required this.onTap,
  });

  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Placeholder data
    final userNames = ['Sarah M.', 'Mike T.', 'Alex R.', 'Jordan L.', 'Casey B.'];
    final bandNames = ['Metallica', 'Iron Maiden', 'Ghost', 'Gojira', 'Mastodon'];
    final venueNames = ['The Forum', 'Madison Square Garden', 'Red Rocks', 'Wembley Arena', 'The Fillmore'];
    final ratings = [4.5, 5.0, 4.0, 4.5, 3.5];
    final times = ['15m ago', '1h ago', '2h ago', '3h ago', '5h ago'];

    final userName = userNames[index % userNames.length];
    final bandName = bandNames[index % bandNames.length];
    final venueName = venueNames[index % venueNames.length];
    final rating = ratings[index % ratings.length];
    final time = times[index % times.length];

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
                    if (index % 3 == 0)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.toastGold.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.emoji_events,
                              size: 14,
                              color: AppTheme.toastGold,
                            ),
                            SizedBox(width: 4),
                            Text(
                              'Badge Earned!',
                              style: TextStyle(
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
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    const _VibeChip(label: 'Great Sound', icon: Icons.volume_up),
                    if (index % 2 == 0) const _VibeChip(label: 'Mosh Pit', icon: Icons.local_fire_department),
                    if (index % 3 == 0) const _VibeChip(label: 'Epic Lighting', icon: Icons.lightbulb),
                  ],
                ),

                // Comment
                if (index % 2 == 0) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Incredible show! The energy was unreal tonight.',
                    style: TextStyle(
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
                  label: '${12 + index}',
                  isActive: index % 2 == 0,
                  activeColor: AppTheme.toastGold,
                  onTap: () {},
                ),
                const SizedBox(width: 24),
                // Comment Button
                _ActionButton(
                  icon: Icons.chat_bubble_outline,
                  label: '${3 + (index % 5)}',
                  isActive: false,
                  onTap: () {},
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
