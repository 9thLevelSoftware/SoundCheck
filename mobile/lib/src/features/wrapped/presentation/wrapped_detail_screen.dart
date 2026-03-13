import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/services/analytics_service.dart';
import '../domain/wrapped_stats.dart';
import 'wrapped_providers.dart';

class WrappedDetailScreen extends ConsumerWidget {
  final int year;

  const WrappedDetailScreen({required this.year, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(wrappedDetailProvider(year));

    AnalyticsService.logEvent(
      name: 'wrapped_detail_viewed',
      parameters: {'year': year},
    );

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        title: Text('Wrapped $year Details'),
        backgroundColor: AppTheme.backgroundDark,
      ),
      body: detailAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) {
          // Handle 403 (non-premium) gracefully
          final errorStr = error.toString();
          if (errorStr.contains('403') || errorStr.contains('premium')) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.lock_outline,
                        size: 48, color: AppTheme.voltLime,),
                    const SizedBox(height: 16),
                    const Text(
                      'Detailed analytics require SoundCheck Pro',
                      style: TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () =>
                          context.push('/pro'),
                      child: const Text('Learn about Pro'),
                    ),
                  ],
                ),
              ),
            );
          }

          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline,
                    color: AppTheme.error, size: 48,),
                const SizedBox(height: 16),
                const Text(
                  'Failed to load details',
                  style:
                      TextStyle(color: AppTheme.textSecondary, fontSize: 16),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () => ref.invalidate(wrappedDetailProvider(year)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          );
        },
        data: (stats) => CustomScrollView(
          slivers: [
            // Stats header
            SliverToBoxAdapter(child: _buildStatsHeader(stats)),
            // Monthly breakdown
            if (stats.monthlyBreakdown != null &&
                stats.monthlyBreakdown!.isNotEmpty)
              SliverToBoxAdapter(
                  child: _buildMonthlyBreakdown(stats.monthlyBreakdown!),),
            // Genre evolution
            if (stats.genreEvolution != null &&
                stats.genreEvolution!.isNotEmpty)
              SliverToBoxAdapter(
                  child: _buildGenreEvolution(stats.genreEvolution!),),
            // Friend overlap
            if (stats.friendOverlap != null &&
                stats.friendOverlap!.isNotEmpty)
              SliverToBoxAdapter(
                  child: _buildFriendOverlap(stats.friendOverlap!),),
            // Top rated sets
            if (stats.topRatedSets != null &&
                stats.topRatedSets!.isNotEmpty)
              SliverToBoxAdapter(
                  child: _buildTopRatedSets(stats.topRatedSets!),),
            // Bottom padding
            const SliverPadding(padding: EdgeInsets.only(bottom: 32)),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsHeader(WrappedStats stats) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.voltLime.withValues(alpha: 0.2),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _StatColumn(value: '${stats.totalShows}', label: 'Shows'),
          _StatColumn(value: '${stats.uniqueBands}', label: 'Bands'),
          _StatColumn(value: '${stats.uniqueVenues}', label: 'Venues'),
        ],
      ),
    );
  }

  Widget _buildMonthlyBreakdown(List<MonthlyActivity> monthly) {
    final maxCount =
        monthly.fold<int>(0, (max, m) => m.showCount > max ? m.showCount : max);
    const months = [
      'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D',
    ];

    // Fill in missing months with 0
    final allMonths = List.generate(12, (i) {
      final match = monthly.where((m) => m.month == i + 1);
      return match.isNotEmpty ? match.first.showCount : 0;
    });

    return _SectionCard(
      title: 'Monthly Activity',
      child: SizedBox(
        height: 140,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: List.generate(12, (i) {
            final count = allMonths[i];
            final height =
                maxCount > 0 ? (count / maxCount) * 100.0 : 0.0;
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (count > 0)
                      Text(
                        '$count',
                        style: const TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 10,
                        ),
                      ),
                    const SizedBox(height: 4),
                    Container(
                      height: height.clamp(4.0, 100.0),
                      decoration: BoxDecoration(
                        color: count > 0
                            ? AppTheme.voltLime
                            : AppTheme.textTertiary.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      months[i],
                      style: const TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget _buildGenreEvolution(List<GenreMonth> genres) {
    const monthNames = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    // Group by month, show top genre per month
    final byMonth = <int, List<GenreMonth>>{};
    for (final g in genres) {
      byMonth.putIfAbsent(g.month, () => []).add(g);
    }

    final sortedMonths = byMonth.keys.toList()..sort();

    return _SectionCard(
      title: 'Genre Evolution',
      child: Column(
        children: sortedMonths.map((month) {
          final top = byMonth[month]!.first; // Already sorted by count DESC
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                SizedBox(
                  width: 36,
                  child: Text(
                    monthNames[month],
                    style: const TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 13,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    top.genre,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 14,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppTheme.voltLime.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${top.count}',
                    style: const TextStyle(
                      color: AppTheme.voltLime,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildFriendOverlap(List<FriendOverlap> friends) {
    return _SectionCard(
      title: 'Concert Buddies',
      child: Column(
        children: friends.map((f) {
          final initials = f.friendUsername.isNotEmpty
              ? f.friendUsername[0].toUpperCase()
              : '?';
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppTheme.surfaceVariantDark,
                  backgroundImage: f.friendProfileImageUrl != null
                      ? NetworkImage(f.friendProfileImageUrl!)
                      : null,
                  child: f.friendProfileImageUrl == null
                      ? Text(
                          initials,
                          style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        f.friendUsername,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      Text(
                        '${f.sharedShows} shows together',
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildTopRatedSets(List<TopRatedSet> sets) {
    return _SectionCard(
      title: 'Top Rated Sets',
      child: Column(
        children: sets.map((s) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        s.bandName,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      Text(
                        '${s.venueName} \u2022 ${s.eventDate}',
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.star, color: AppTheme.voltLime, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      s.rating.toStringAsFixed(1),
                      style: const TextStyle(
                        color: AppTheme.voltLime,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  final String value;
  final String label;

  const _StatColumn({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(
            color: AppTheme.voltLime,
            fontSize: 28,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(
            color: AppTheme.textSecondary,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}
