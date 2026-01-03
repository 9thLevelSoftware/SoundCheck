import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../domain/venue.dart';

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
      backgroundColor: AppTheme.backgroundDark,
      body: venueAsync.when(
        data: (venue) => _VenueContent(venue: venue, venueId: venueId),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.electricPurple),
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

class _VenueContent extends StatelessWidget {
  final Venue venue;
  final String venueId;

  const _VenueContent({required this.venue, required this.venueId});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        // Cover Header
        SliverAppBar(
          expandedHeight: 220,
          pinned: true,
          backgroundColor: AppTheme.backgroundDark,
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
                        AppTheme.backgroundDark.withOpacity(0.95),
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
                          if (venue.isVerified)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.info.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.verified,
                                    size: 16,
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

        // Stats Row
        SliverToBoxAdapter(
          child: _VenueStatsRow(venue: venue),
        ),

        // Upcoming Shows Section ("On Stage")
        SliverToBoxAdapter(
          child: _UpcomingShowsSection(venueId: venueId),
        ),

        // Loyal Patrons & Trending Bands
        const SliverToBoxAdapter(
          child: _VenueInsightsSection(),
        ),

        // Recent Check-ins Feed
        SliverToBoxAdapter(
          child: _RecentCheckinsSection(venueId: venueId),
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
            AppTheme.neonPink.withOpacity(0.7),
            AppTheme.electricPurple.withOpacity(0.7),
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
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            // Map placeholder
            Container(
              width: 100,
              decoration: const BoxDecoration(
                color: AppTheme.surfaceVariantDark,
                borderRadius: BorderRadius.horizontal(
                  left: Radius.circular(12),
                ),
              ),
              child: const Center(
                child: Icon(
                  Icons.map,
                  size: 32,
                  color: AppTheme.electricPurple,
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
                        color: AppTheme.textTertiary,
                        fontSize: 12,
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
                color: AppTheme.electricPurple,
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
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
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
            value: _formatNumber(venue.uniqueVisitors),
            label: 'Visitors',
          ),
          _StatDivider(),
          _StatItem(
            value: venue.averageRating.toStringAsFixed(1),
            label: 'Rating',
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
                  color: AppTheme.electricPurple,
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
      height: 30,
      width: 1,
      color: AppTheme.surfaceVariantDark,
    );
  }
}

class _UpcomingShowsSection extends StatelessWidget {
  final String venueId;

  const _UpcomingShowsSection({required this.venueId});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.event,
                    color: AppTheme.liveGreen,
                    size: 20,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Upcoming Shows',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ],
              ),
              TextButton(
                onPressed: () {
                  context.push('/venues/$venueId/shows');
                },
                child: const Text(
                  'See All',
                  style: TextStyle(color: AppTheme.electricPurple),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Upcoming shows list
          ...List.generate(3, (index) => _ShowListItem(index: index)),
        ],
      ),
    );
  }
}

class _ShowListItem extends StatelessWidget {
  final int index;

  const _ShowListItem({required this.index});

  @override
  Widget build(BuildContext context) {
    final bands = ['Metallica', 'Gojira', 'Ghost'];
    final dates = ['Dec 15', 'Dec 22', 'Jan 5'];
    final times = ['8:00 PM', '7:30 PM', '9:00 PM'];

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          // Date
          Container(
            width: 50,
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: AppTheme.electricPurple.withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Text(
                  dates[index].split(' ')[0],
                  style: const TextStyle(
                    color: AppTheme.electricPurple,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
                Text(
                  dates[index].split(' ')[1],
                  style: const TextStyle(
                    color: AppTheme.electricPurple,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          // Band info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  bands[index],
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Doors open ${times[index]}',
                  style: const TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          // Tickets button
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppTheme.electricPurple,
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
        ],
      ),
    );
  }
}

class _VenueInsightsSection extends StatelessWidget {
  const _VenueInsightsSection();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          // Loyal Patrons
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.cardDark,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.emoji_events, color: AppTheme.toastGold, size: 16),
                      SizedBox(width: 6),
                      Text(
                        'Loyal Patrons',
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  // Stack of avatars
                  Row(
                    children: List.generate(4, (i) {
                      return Container(
                        margin: EdgeInsets.only(left: i == 0 ? 0 : -8),
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: AppTheme.primaryGradient,
                          border: Border.all(color: AppTheme.cardDark, width: 2),
                        ),
                        child: Center(
                          child: Text(
                            i == 3 ? '+5' : ['S', 'M', 'A'][i],
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Trending Bands
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.cardDark,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.trending_up, color: AppTheme.neonPink, size: 16),
                      SizedBox(width: 6),
                      Text(
                        'Trending Bands',
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Metallica, Ghost, Gojira',
                    style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RecentCheckinsSection extends StatelessWidget {
  final String venueId;

  const _RecentCheckinsSection({required this.venueId});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Recent Check-ins',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Check-in cards
          ...List.generate(5, (index) => _CheckInPreviewCard(index: index)),
        ],
      ),
    );
  }
}

class _CheckInPreviewCard extends StatelessWidget {
  final int index;

  const _CheckInPreviewCard({required this.index});

  @override
  Widget build(BuildContext context) {
    final users = ['Sarah M.', 'Mike T.', 'Alex R.', 'Jordan L.', 'Casey B.'];
    final bands = ['Metallica', 'Ghost', 'Gojira', 'Mastodon', 'Slipknot'];
    final times = ['15m ago', '1h ago', '2h ago', '3h ago', '5h ago'];
    final ratings = [5.0, 4.5, 4.0, 5.0, 4.5];

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: AppTheme.primaryGradient,
            ),
            child: Center(
              child: Text(
                users[index][0],
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RichText(
                  text: TextSpan(
                    style: const TextStyle(fontSize: 14),
                    children: [
                      TextSpan(
                        text: users[index],
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const TextSpan(
                        text: ' saw ',
                        style: TextStyle(color: AppTheme.textSecondary),
                      ),
                      TextSpan(
                        text: bands[index],
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppTheme.electricPurple,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    ...List.generate(5, (i) {
                      return Icon(
                        Icons.star,
                        size: 14,
                        color: i < ratings[index]
                            ? AppTheme.electricPurple
                            : AppTheme.ratingInactive,
                      );
                    }),
                    const SizedBox(width: 8),
                    Text(
                      times[index],
                      style: const TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
