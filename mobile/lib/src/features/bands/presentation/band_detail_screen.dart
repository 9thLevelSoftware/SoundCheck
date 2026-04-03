import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../shared/utils/date_formatter.dart';
import '../../checkins/domain/checkin.dart';
import '../domain/band.dart';
import 'providers/band_providers.dart';

final bandDetailProvider = FutureProvider.autoDispose.family<Band, String>((ref, id) async {
  final repository = ref.watch(bandRepositoryProvider);
  final result = await repository.getBandById(id);
  return result.fold(
    (failure) => throw failure,
    (band) => band,
  );
});

/// Band Detail Screen - The "Beer Page" Model
/// Modeled after Untappd's Beer detail page
class BandDetailScreen extends ConsumerStatefulWidget {
  final String bandId;

  const BandDetailScreen({
    required this.bandId,
    super.key,
  });

  @override
  ConsumerState<BandDetailScreen> createState() => _BandDetailScreenState();
}

class _BandDetailScreenState extends ConsumerState<BandDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isOnWishlist = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bandAsync = ref.watch(bandDetailProvider(widget.bandId));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: bandAsync.when(
        data: (band) => _buildContent(context, band),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) => _buildErrorState(context),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Band band) {
    return NestedScrollView(
      headerSliverBuilder: (context, innerBoxIsScrolled) {
        return [
          // Custom App Bar with Cover Image
          SliverAppBar(
            expandedHeight: 180,
            pinned: true,
            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  // Cover Image or Gradient
                  if (band.coverImageUrl != null)
                    CachedNetworkImage(
                      imageUrl: band.coverImageUrl!,
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
                          Theme.of(context).scaffoldBackgroundColor.withValues(alpha:0.9),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Band Header
          SliverToBoxAdapter(
            child: _BandHeader(band: band),
          ),

          // Stats Row -- uses aggregate if available, falls back to legacy
          SliverToBoxAdapter(
            child: _StatsRow(band: band),
          ),

          // Action Bar
          SliverToBoxAdapter(
            child: _ActionBar(
              bandId: widget.bandId,
              isOnWishlist: _isOnWishlist,
              onCheckIn: () => context.push('/checkin'),
              onWishlistToggle: () {
                setState(() => _isOnWishlist = !_isOnWishlist);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      _isOnWishlist
                          ? 'Added to wishlist'
                          : 'Removed from wishlist',
                    ),
                    backgroundColor: AppTheme.voltLime,
                  ),
                );
              },
              onFindShows: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Find shows coming soon!'),
                    backgroundColor: AppTheme.voltLime,
                  ),
                );
              },
            ),
          ),

          // Claim button (only for unclaimed bands)
          if (band.claimedByUserId == null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextButton.icon(
                  onPressed: () {
                    context.push(
                      '/claim/band/${band.id}?name=${Uri.encodeComponent(band.name)}',
                    );
                  },
                  icon: const Icon(
                    Icons.verified_outlined,
                    size: 18,
                    color: AppTheme.textSecondary,
                  ),
                  label: const Text(
                    'Claim this band',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),

          // Upcoming Shows section (Phase 7)
          SliverToBoxAdapter(
            child: _UpcomingShowsSection(band: band),
          ),

          // Description (collapsible)
          if (band.description != null && band.description!.isNotEmpty)
            SliverToBoxAdapter(
              child: _DescriptionSection(description: band.description!),
            ),

          // Social Links
          if (band.spotifyUrl != null ||
              band.instagramUrl != null ||
              band.facebookUrl != null ||
              band.websiteUrl != null)
            SliverToBoxAdapter(
              child: _SocialLinksSection(band: band),
            ),

          // Tabs
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(
              tabController: _tabController,
              tabs: const ['Global Activity', 'Your Activity'],
            ),
          ),
        ];
      },
      body: TabBarView(
        controller: _tabController,
        children: [
          // Global Activity Tab
          _GlobalActivityTab(bandId: widget.bandId),
          // Your Activity Tab
          _YourActivityTab(bandId: widget.bandId),
        ],
      ),
    );
  }

  Widget _buildGradientBg() {
    return Container(
      decoration: const BoxDecoration(
        gradient: AppTheme.primaryGradient,
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: AppTheme.error),
            const SizedBox(height: 16),
            const Text(
              'Could not load band details',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(bandDetailProvider(widget.bandId)),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _BandHeader extends StatelessWidget {
  final Band band;

  const _BandHeader({required this.band});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Band Logo (square)
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: band.imageUrl != null
                  ? CachedNetworkImage(
                      imageUrl: band.imageUrl!,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => const Icon(
                        Icons.music_note,
                        size: 40,
                        color: AppTheme.voltLime,
                      ),
                    )
                  : const Icon(
                      Icons.music_note,
                      size: 40,
                      color: AppTheme.voltLime,
                    ),
            ),
          ),
          const SizedBox(width: 16),
          // Band Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        band.name,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ),
                    if (band.claimedByUserId != null)
                      const Tooltip(
                        message: 'Verified band',
                        child: Icon(
                          Icons.verified,
                          color: AppTheme.primary,
                          size: 20,
                        ),
                      ),
                  ],
                ),
                if (band.genre != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    band.genre!,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
                if (band.hometown != null) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on,
                        size: 14,
                        color: AppTheme.textTertiary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        band.hometown!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppTheme.textTertiary,
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
    );
  }
}

class _StatsRow extends StatelessWidget {
  final Band band;

  const _StatsRow({required this.band});

  @override
  Widget build(BuildContext context) {
    // Use aggregate data if available; fall back to legacy averageRating
    final aggregateRating = band.aggregate?.avgPerformanceRating ?? 0;
    final displayRating = aggregateRating > 0
        ? aggregateRating
        : band.averageRating;
    final ratingLabel = aggregateRating > 0 ? 'Live Performance' : 'Rating';
    final fans = band.aggregate?.uniqueFans ?? band.uniqueFans;
    final ratings = band.aggregate?.totalRatings ?? 0;

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
            value: _formatNumber(band.totalCheckins),
            label: 'Check-ins',
          ),
          _StatDivider(),
          _StatItem(
            value: _formatNumber(fans),
            label: 'Fans',
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

/// Upcoming Shows section -- displays upcoming events from backend aggregate
class _UpcomingShowsSection extends StatelessWidget {
  final Band band;

  const _UpcomingShowsSection({required this.band});

  @override
  Widget build(BuildContext context) {
    final shows = band.upcomingShows;
    if (shows == null || shows.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Container(
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
                'No upcoming shows',
                style: TextStyle(
                  color: AppTheme.textTertiary,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            icon: Icons.event,
            iconColor: AppTheme.voltLime,
            title: 'Upcoming Shows',
          ),
          const SizedBox(height: 8),
          ...shows.map((show) => _UpcomingShowItem(show: show)),
        ],
      ),
    );
  }
}

class _UpcomingShowItem extends StatelessWidget {
  final BandUpcomingShow show;

  const _UpcomingShowItem({required this.show});

  @override
  Widget build(BuildContext context) {
    final venueName = show.venue?.name ?? 'Unknown Venue';
    final venueLocation = [show.venue?.city, show.venue?.state]
        .where((s) => s != null && s.isNotEmpty)
        .join(', ');
    final eventDate = show.eventDate ?? '';

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

    return GestureDetector(
      onTap: () => context.push('/events/${show.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            // Date badge
            Container(
              width: 50,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.voltLime.withValues(alpha: 0.2),
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
            // Show info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    show.eventName ?? venueName,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    venueLocation.isNotEmpty
                        ? '$venueName - $venueLocation'
                        : venueName,
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
            // Chevron
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

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;

  const _SectionHeader({
    required this.icon,
    required this.iconColor,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: iconColor, size: 20),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppTheme.textPrimary,
          ),
        ),
      ],
    );
  }
}

class _ActionBar extends StatelessWidget {
  final String bandId;
  final bool isOnWishlist;
  final VoidCallback onCheckIn;
  final VoidCallback onWishlistToggle;
  final VoidCallback onFindShows;

  const _ActionBar({
    required this.bandId,
    required this.isOnWishlist,
    required this.onCheckIn,
    required this.onWishlistToggle,
    required this.onFindShows,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          // Check-in Button (Primary)
          Expanded(
            flex: 2,
            child: ElevatedButton.icon(
              onPressed: onCheckIn,
              icon: const Icon(Icons.check_circle),
              label: const Text('Check In'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.voltLime,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Wishlist Button
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onWishlistToggle,
              icon: Icon(
                isOnWishlist ? Icons.bookmark : Icons.bookmark_border,
                size: 20,
              ),
              label: const Text(
                'Wishlist',
                style: TextStyle(fontSize: 12),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: isOnWishlist
                    ? AppTheme.voltLime
                    : AppTheme.textSecondary,
                side: BorderSide(
                  color: isOnWishlist
                      ? AppTheme.voltLime
                      : AppTheme.textTertiary,
                ),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Find Shows Button
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onFindShows,
              icon: const Icon(Icons.event, size: 20),
              label: const Text(
                'Shows',
                style: TextStyle(fontSize: 12),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.textSecondary,
                side: const BorderSide(color: AppTheme.textTertiary),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DescriptionSection extends StatefulWidget {
  final String description;

  const _DescriptionSection({required this.description});

  @override
  State<_DescriptionSection> createState() => _DescriptionSectionState();
}

class _DescriptionSectionState extends State<_DescriptionSection> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => setState(() => _isExpanded = !_isExpanded),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.description,
                    maxLines: _isExpanded ? null : 3,
                    overflow: _isExpanded ? null : TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 14,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _isExpanded ? 'Show less' : 'Show more',
                        style: const TextStyle(
                          color: AppTheme.voltLime,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      Icon(
                        _isExpanded
                            ? Icons.keyboard_arrow_up
                            : Icons.keyboard_arrow_down,
                        color: AppTheme.voltLime,
                        size: 20,
                      ),
                    ],
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

class _SocialLinksSection extends StatelessWidget {
  final Band band;

  const _SocialLinksSection({required this.band});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (band.spotifyUrl != null)
            _SocialIcon(
              icon: Icons.audiotrack,
              color: const Color(0xFF1DB954),
              onTap: () => _launchUrl(band.spotifyUrl!),
              semanticLabel: 'Open Spotify',
            ),
          if (band.instagramUrl != null)
            _SocialIcon(
              icon: Icons.camera_alt,
              color: const Color(0xFFE4405F),
              onTap: () => _launchUrl(band.instagramUrl!),
              semanticLabel: 'Open Instagram',
            ),
          if (band.facebookUrl != null)
            _SocialIcon(
              icon: Icons.facebook,
              color: const Color(0xFF1877F2),
              onTap: () => _launchUrl(band.facebookUrl!),
              semanticLabel: 'Open Facebook',
            ),
          if (band.websiteUrl != null)
            _SocialIcon(
              icon: Icons.language,
              color: AppTheme.voltLime,
              onTap: () => _launchUrl(band.websiteUrl!),
              semanticLabel: 'Open website',
            ),
        ],
      ),
    );
  }
}

class _SocialIcon extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final String semanticLabel;

  const _SocialIcon({
    required this.icon,
    required this.color,
    required this.onTap,
    required this.semanticLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Semantics(
        label: semanticLabel,
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(24),
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.3),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 24),
          ),
        ),
      ),
    );
  }
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabController tabController;
  final List<String> tabs;

  _TabBarDelegate({required this.tabController, required this.tabs});

  @override
  Widget build(context, shrinkOffset, overlapsContent) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: TabBar(
        controller: tabController,
        tabs: tabs.map((t) => Tab(text: t)).toList(),
        labelColor: AppTheme.voltLime,
        unselectedLabelColor: AppTheme.textTertiary,
        indicatorColor: AppTheme.voltLime,
        indicatorWeight: 3,
      ),
    );
  }

  @override
  double get maxExtent => 48;

  @override
  double get minExtent => 48;

  @override
  bool shouldRebuild(covariant SliverPersistentHeaderDelegate oldDelegate) => false;
}

class _GlobalActivityTab extends ConsumerWidget {
  final String bandId;

  const _GlobalActivityTab({required this.bandId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final checkinsAsync = ref.watch(bandGlobalCheckinsProvider(bandId));

    return checkinsAsync.when(
      data: (checkins) {
        if (checkins.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.people_outline,
                    size: 64,
                    color: AppTheme.textTertiary.withValues(alpha: 0.5),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No check-ins yet',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Be the first to check in to this band!',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: checkins.length,
          itemBuilder: (context, index) {
            return _CheckInPreviewCard(checkin: checkins[index]);
          },
        );
      },
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppTheme.voltLime),
      ),
      error: (error, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: AppTheme.error,
              ),
              const SizedBox(height: 16),
              const Text(
                'Could not load activity',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => ref.invalidate(bandGlobalCheckinsProvider(bandId)),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.voltLime,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _YourActivityTab extends ConsumerWidget {
  final String bandId;

  const _YourActivityTab({required this.bandId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final checkinsAsync = ref.watch(bandUserCheckinsProvider(bandId));

    return checkinsAsync.when(
      data: (checkins) {
        if (checkins.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.history,
                    size: 64,
                    color: AppTheme.textTertiary.withValues(alpha: 0.5),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No check-ins yet',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Check in to this band to see your activity here',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: checkins.length,
          itemBuilder: (context, index) {
            return _CheckInPreviewCard(checkin: checkins[index]);
          },
        );
      },
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppTheme.voltLime),
      ),
      error: (error, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 48,
                color: AppTheme.error,
              ),
              const SizedBox(height: 16),
              const Text(
                'Could not load your activity',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => ref.invalidate(bandUserCheckinsProvider(bandId)),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.voltLime,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CheckInPreviewCard extends StatelessWidget {
  final CheckIn checkin;

  const _CheckInPreviewCard({required this.checkin});

  @override
  Widget build(BuildContext context) {
    final userName = checkin.user?.username ??
        checkin.user?.firstName ??
        'Unknown User';
    final venueName = checkin.venue?.name ?? 'Unknown Venue';
    final timeAgo = DateFormatter.formatRelativeTime(checkin.createdAt);
    final rating = checkin.rating;
    final userInitial = userName.isNotEmpty ? userName[0].toUpperCase() : '?';
    final userAvatarUrl = checkin.user?.profileImageUrl;

    return GestureDetector(
      onTap: () => context.push('/checkins/${checkin.id}'),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHigh,
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
              child: ClipOval(
                child: userAvatarUrl != null
                    ? CachedNetworkImage(
                        imageUrl: userAvatarUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => Center(
                          child: Text(
                            userInitial,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      )
                    : Center(
                        child: Text(
                          userInitial,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
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
                          text: userName,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const TextSpan(
                          text: ' at ',
                          style: TextStyle(color: AppTheme.textSecondary),
                        ),
                        TextSpan(
                          text: venueName,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.voltLime,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (rating > 0) ...[
                        ...List.generate(5, (i) {
                          return Icon(
                            Icons.star,
                            size: 14,
                            color: i < rating.round()
                                ? AppTheme.toastGold
                                : AppTheme.ratingInactive,
                          );
                        }),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        timeAgo,
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                  if (checkin.noteText != null &&
                      checkin.noteText!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      checkin.noteText!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Chevron indicator
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
