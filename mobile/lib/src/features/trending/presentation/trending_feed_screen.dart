import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../data/trending_repository.dart';
import 'providers/trending_providers.dart';

/// Trending Shows Near You section for the Discover screen.
/// Displays a horizontal scrollable list of trending event cards
/// ranked by Wilson-scored composite trending score.
class TrendingFeedSection extends ConsumerWidget {
  const TrendingFeedSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trendingAsync = ref.watch(trendingFeedProvider);

    return trendingAsync.when(
      data: (events) {
        if (events.isEmpty) {
          return const SizedBox.shrink();
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section header
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Trending Shows Near You',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Hot events with the most buzz',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
            // Horizontal card list
            SizedBox(
              height: 160,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: events.length,
                itemBuilder: (context, index) {
                  return _TrendingCard(
                    event: events[index],
                    onTap: () {
                      context.push('/events/${events[index].id}');
                    },
                  );
                },
              ),
            ),
            const SizedBox(height: 24),
          ],
        );
      },
      loading: () => const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Trending Shows Near You',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Hot events with the most buzz',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppTheme.textTertiary,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            height: 160,
            child: Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: AppTheme.hotOrange,
                  strokeWidth: 2,
                ),
              ),
            ),
          ),
          SizedBox(height: 24),
        ],
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Row(
          children: [
            const Icon(
              Icons.error_outline,
              color: AppTheme.hotOrange,
              size: 20,
            ),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'Could not load trending shows',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 14,
                ),
              ),
            ),
            TextButton(
              onPressed: () => ref.invalidate(trendingFeedProvider),
              child: const Text(
                'Retry',
                style: TextStyle(
                  color: AppTheme.voltLime,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Individual trending event card (horizontal scroll).
class _TrendingCard extends StatelessWidget {
  const _TrendingCard({
    required this.event,
    required this.onTap,
  });

  final TrendingEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Format date
    String dateDisplay = '';
    try {
      final date = DateTime.parse(event.eventDate);
      dateDisplay = DateFormat('MMM d').format(date);
    } catch (_) {}

    // Format distance
    final distanceText = event.distanceKm < 1
        ? '< 1 km'
        : '${event.distanceKm.round()} km away';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 280,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            width: 1,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Event name (bold, max 2 lines)
              Text(
                event.eventName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 6),

              // Venue + city (secondary text)
              Text(
                '${event.venueName} - ${event.venueCity}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 4),

              // Date
              if (dateDisplay.isNotEmpty)
                Text(
                  dateDisplay,
                  style: const TextStyle(
                    color: AppTheme.voltLime,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),

              const Spacer(),

              // Bottom row: signals + distance
              Row(
                children: [
                  // Fire icon + RSVP count
                  const Icon(
                    Icons.local_fire_department,
                    size: 16,
                    color: AppTheme.hotOrange,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${event.rsvpCount}',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 12),

                  // People icon + friend signals
                  if (event.friendSignals > 0) ...[
                    const Icon(
                      Icons.people,
                      size: 16,
                      color: AppTheme.electricBlue,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${event.friendSignals}',
                      style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],

                  const Spacer(),

                  // Distance badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      distanceText,
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
