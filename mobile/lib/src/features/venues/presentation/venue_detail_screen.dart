import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../domain/venue.dart';
import '../../checkins/presentation/providers/checkin_providers.dart';
import '../../checkins/domain/checkin.dart';


final venueDetailProvider = FutureProvider.autoDispose.family<Venue, String>((ref, id) async {
  final repository = ref.watch(venueRepositoryProvider);
  return repository.getVenueById(id);
});

/// Venue Detail Screen - The "Brewery Page" Model
/// Modeled after Untappd's Brewery/Venue detail page
class VenueDetailScreen extends ConsumerWidget {
  final String venueId;

  const VenueDetailScreen({
    required this.venueId,
    super.key,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final venueAsync = ref.watch(venueDetailProvider(venueId));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: venueAsync.when(
        data: (venue) => _VenueContent(venue: venue, venueId: venueId),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) => _buildErrorState(context, ref),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: AppTheme.error),
            const SizedBox(height: 16),
            const Text(
              'Could not load venue details',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(venueDetailProvider(venueId)),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _VenueContent extends ConsumerWidget {
  final Venue venue;
  final String venueId;

  const _VenueContent({required this.venue, required this.venueId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CustomScrollView(
      slivers: [
        // Cover Header
        SliverAppBar(
          expandedHeight: 220,
          pinned: true,
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          flexibleSpace: FlexibleSpaceBar(
            background: Stack(
              fit: StackFit.expand,
              children: [
                // Cover Image
                if (venue.coverImageUrl != null || venue.imageUrl != null)
                  CachedNetworkImage(
                    imageUrl: venue.coverImageUrl ?? venue.imageUrl!,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _buildGradientBg(),
                  )
                else
                  _buildGradientBg(),
                // Gradient overlay
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Theme.of(context).scaffoldBackgroundColor.withValues(alpha:0.95),
                      ],
                    ),
                  ),
                ),
                // Venue Name and Address
                Positioned(
                  bottom: 16,
                  left: 16,
                  right: 16,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              venue.name,
                              style: const TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          if (venue.claimedByUserId != null)
                            Tooltip(
                              message: 'Verified venue',
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.primary.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.verified,
                                      size: 20,
                                      color: AppTheme.primary,
                                    ),
                                    SizedBox(width: 4),
                                    Text(
                                      'Claimed',
                                      style: TextStyle(
                                        color: AppTheme.primary,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          else if (venue.isVerified)
                            Tooltip(
                              message: 'Verified venue',
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.info.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.verified,
                                      size: 20,
                                      color: AppTheme.info,
                                    ),
                                    SizedBox(width: 4),
                                    Text(
                                      'Verified',
                                      style: TextStyle(
                                        color: AppTheme.info,
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                      if (venue.city != null) ...[
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(
                              Icons.location_on,
                              size: 16,
                              color: AppTheme.textSecondary,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _formatAddress(venue),
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        // Map Strip
        SliverToBoxAdapter(
          child: _MapStrip(venue: venue),
        ),

        // Claim button (only for unclaimed venues)
        if (venue.claimedByUserId == null)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextButton.icon(
                onPressed: () {
                  context.push(
                    '/claim/venue/${venue.id}?name=${Uri.encodeComponent(venue.name)}',
                  );
                },
                icon: const Icon(
                  Icons.verified_outlined,
                  size: 18,
                  color: AppTheme.textSecondary,
                ),
                label: const Text(
                  'Claim this venue',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ),

        // Stats Row -- uses aggregate if available
        SliverToBoxAdapter(
          child: _VenueStatsRow(venue: venue),
        ),

        // Upcoming Events Section (Phase 7 -- real data from backend)
        SliverToBoxAdapter(
          child: _UpcomingEventsSection(venue: venue, venueId: venueId),
        ),

        // Recent Bands (data-driven)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _RecentBandsSection(venueId: venueId),
          ),
        ),

        // Bottom padding for nav bar
        const SliverToBoxAdapter(
          child: SizedBox(height: 100),
        ),
      ],
    );
  }

  Widget _buildGradientBg() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.hotOrange.withValues(alpha:0.7),
            AppTheme.voltLime.withValues(alpha:0.7),
          ],
        ),
      ),
    );
  }

  String _formatAddress(Venue venue) {
    final parts = <String>[];
    if (venue.city != null) parts.add(venue.city!);
    if (venue.state != null) parts.add(venue.state!);
    return parts.join(', ');
  }
}

class _MapStrip extends StatelessWidget {
  final Venue venue;

  const _MapStrip({required this.venue});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _openInMaps,
      child: Container(
        height: 80,
        margin: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            // Map placeholder
            Container(
              width: 100,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(12),
                ),
              ),
              child: const Center(
                child: Icon(
                  Icons.map,
                  size: 32,
                  color: AppTheme.voltLime,
                ),
              ),
            ),
            // Address info
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (venue.address != null)
                      Text(
                        venue.address!,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 4),
                    Text(
                      _formatFullAddress(),
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
            // Direction icon
            Container(
              padding: const EdgeInsets.all(12),
              child: const Icon(
                Icons.directions,
                color: AppTheme.voltLime,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatFullAddress() {
    final parts = <String>[];
    if (venue.city != null) parts.add(venue.city!);
    if (venue.state != null) parts.add(venue.state!);
    if (venue.postalCode != null) parts.add(venue.postalCode!);
    return parts.join(', ');
  }

  Future<void> _openInMaps() async {
    String query;
    if (venue.latitude != null && venue.longitude != null) {
      query = '${venue.latitude},${venue.longitude}';
    } else if (venue.address != null) {
      query = Uri.encodeComponent('${venue.address}, ${venue.city}');
    } else {
      return;
    }

    final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=$query');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _VenueStatsRow extends StatelessWidget {
  final Venue venue;

  const _VenueStatsRow({required this.venue});

  @override
  Widget build(BuildContext context) {
    // Use aggregate data if available; fall back to legacy averageRating
    final aggregateRating = venue.aggregate?.avgExperienceRating ?? 0;
    final displayRating = aggregateRating > 0
        ? aggregateRating
        : venue.averageRating;
    final ratingLabel = aggregateRating > 0 ? 'Experience' : 'Rating';
    final visitors = venue.aggregate?.uniqueVisitors ?? venue.uniqueVisitors;
    final ratings = venue.aggregate?.totalRatings ?? 0;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _StatItem(
            value: _formatNumber(venue.totalCheckins),
            label: 'Check-ins',
          ),
          _StatDivider(),
          _StatItem(
            value: _formatNumber(visitors),
            label: 'Visitors',
          ),
          _StatDivider(),
          if (ratings > 0) ...[
            _StatItem(
              value: _formatNumber(ratings),
              label: 'Ratings',
            ),
            _StatDivider(),
          ],
          _StatItem(
            value: displayRating.toStringAsFixed(1),
            label: ratingLabel,
            isRating: true,
          ),
          if (venue.capacity != null) ...[
            _StatDivider(),
            _StatItem(
              value: _formatNumber(venue.capacity!),
              label: 'Capacity',
            ),
          ],
        ],
      ),
    );
  }

  String _formatNumber(int number) {
    if (number >= 1000000) {
      return '${(number / 1000000).toStringAsFixed(1)}M';
    } else if (number >= 1000) {
      return '${(number / 1000).toStringAsFixed(1)}k';
    }
    return number.toString();
  }
}

class _StatItem extends StatelessWidget {
  final String value;
  final String label;
  final bool isRating;

  const _StatItem({
    required this.value,
    required this.label,
    this.isRating = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isRating)
              const Padding(
                padding: EdgeInsets.only(right: 4),
                child: Icon(
                  Icons.star,
                  size: 16,
                  color: AppTheme.toastGold,
                ),
              ),
            Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            color: AppTheme.textSecondary,
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
      height: 30,
      width: 1,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
    );
  }
}

/// Upcoming Events section -- uses real data from backend (Phase 7)
class _UpcomingEventsSection extends StatelessWidget {
  final Venue venue;
  final String venueId;

  const _UpcomingEventsSection({required this.venue, required this.venueId});

  @override
  Widget build(BuildContext context) {
    final events = venue.upcomingEvents;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.event,
                    color: AppTheme.voltLime,
                    size: 20,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Upcoming Events',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ],
              ),
              // TODO: Add "See All" button when venue shows list screen is implemented
            ],
          ),
          const SizedBox(height: 12),
          if (events == null || events.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(Icons.event_busy, color: AppTheme.textTertiary, size: 20),
                  SizedBox(width: 12),
                  Text(
                    'No upcoming events',
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            )
          else
            ...events.map((event) => _UpcomingEventItem(event: event)),
        ],
      ),
    );
  }
}

class _UpcomingEventItem extends StatelessWidget {
  final VenueUpcomingEvent event;

  const _UpcomingEventItem({required this.event});

  @override
  Widget build(BuildContext context) {
    final bandName = event.band?.name ?? event.eventName ?? 'TBA';
    final eventDate = event.eventDate ?? '';

    // Parse date for display
    String monthStr = '';
    String dayStr = '';
    if (eventDate.length >= 10) {
      try {
        final date = DateTime.parse(eventDate);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',];
        monthStr = months[date.month - 1];
        dayStr = date.day.toString();
      } catch (_) {
        monthStr = eventDate.substring(5, 7);
        dayStr = eventDate.substring(8, 10);
      }
    }

    final timeInfo = event.doorsTime != null
        ? 'Doors open ${event.doorsTime}'
        : event.startTime != null
            ? 'Starts ${event.startTime}'
            : '';

    return GestureDetector(
      onTap: () => context.push('/events/${event.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            // Date
            Container(
              width: 50,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.voltLime.withValues(alpha:0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    monthStr,
                    style: const TextStyle(
                      color: AppTheme.voltLime,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    dayStr,
                    style: const TextStyle(
                      color: AppTheme.voltLime,
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            // Event info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    bandName,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (timeInfo.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      timeInfo,
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Tickets button if URL available
            if (event.ticketUrl != null)
              GestureDetector(
                onTap: () async {
                  final uri = Uri.parse(event.ticketUrl!);
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppTheme.voltLime,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Tickets',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                ),
              )
            else
              const Icon(
                Icons.chevron_right,
                color: AppTheme.textTertiary,
                size: 20,
              ),
          ],
        ),
      ),
    );
  }
}



/// Widget that displays recent bands from venue check-ins
class _RecentBandsSection extends ConsumerWidget {
  final String venueId;

  const _RecentBandsSection({required this.venueId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bandsAsync = ref.watch(venueRecentBandsProvider(venueId));

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.trending_up, color: AppTheme.hotOrange, size: 16),
              SizedBox(width: 6),
              Text(
                'Recent Bands',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          bandsAsync.when(
            data: (bands) => _buildBandsList(context, bands),
            loading: () => const SizedBox(
              height: 20,
              child: Center(
                child: SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppTheme.voltLime,
                  ),
                ),
              ),
            ),
            error: (_, __) => const Text(
              'Unable to load',
              style: TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBandsList(BuildContext context, List<CheckInBand> bands) {
    if (bands.isEmpty) {
      return const Text(
        'No recent check-ins',
        style: TextStyle(
          color: AppTheme.textSecondary,
          fontSize: 14,
        ),
      );
    }

    return Wrap(
      spacing: 0,
      runSpacing: 4,
      children: bands.asMap().entries.map((entry) {
        final index = entry.key;
        final band = entry.value;
        final isLast = index == bands.length - 1;
        return GestureDetector(
          onTap: () => context.push('/bands/${band.id}'),
          child: Text(
            isLast ? band.name : '${band.name}, ',
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        );
      }).toList(),
    );
  }
}


