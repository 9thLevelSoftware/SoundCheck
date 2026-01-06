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
  return repository.getBandById(id);
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
      backgroundColor: AppTheme.backgroundDark,
      body: bandAsync.when(
        data: (band) => _buildContent(context, band),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.electricPurple),
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
            backgroundColor: AppTheme.backgroundDark,
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
                          AppTheme.backgroundDark.withValues(alpha:0.9),
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

          // Stats Row
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
                    backgroundColor: AppTheme.electricPurple,
                  ),
                );
              },
              onFindShows: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Find shows coming soon!'),
                    backgroundColor: AppTheme.electricPurple,
                  ),
                );
              },
            ),
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
              color: AppTheme.surfaceVariantDark,
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
                        color: AppTheme.electricPurple,
                      ),
                    )
                  : const Icon(
                      Icons.music_note,
                      size: 40,
                      color: AppTheme.electricPurple,
                    ),
            ),
          ),
          const SizedBox(width: 16),
          // Band Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  band.name,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
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
            value: _formatNumber(band.totalCheckins),
            label: 'Check-ins',
          ),
          _StatDivider(),
          _StatItem(
            value: _formatNumber(band.uniqueFans),
            label: 'Unique Fans',
          ),
          _StatDivider(),
          _StatItem(
            value: _formatNumber(band.monthlyCheckins),
            label: 'This Month',
          ),
          _StatDivider(),
          _StatItem(
            value: band.averageRating.toStringAsFixed(1),
            label: 'Rating',
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
                backgroundColor: AppTheme.electricPurple,
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
                    ? AppTheme.electricPurple
                    : AppTheme.textSecondary,
                side: BorderSide(
                  color: isOnWishlist
                      ? AppTheme.electricPurple
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
                color: AppTheme.cardDark,
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
                          color: AppTheme.electricPurple,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
                      Icon(
                        _isExpanded
                            ? Icons.keyboard_arrow_up
                            : Icons.keyboard_arrow_down,
                        color: AppTheme.electricPurple,
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
            ),
          if (band.instagramUrl != null)
            _SocialIcon(
              icon: Icons.camera_alt,
              color: const Color(0xFFE4405F),
              onTap: () => _launchUrl(band.instagramUrl!),
            ),
          if (band.facebookUrl != null)
            _SocialIcon(
              icon: Icons.facebook,
              color: const Color(0xFF1877F2),
              onTap: () => _launchUrl(band.facebookUrl!),
            ),
          if (band.websiteUrl != null)
            _SocialIcon(
              icon: Icons.language,
              color: AppTheme.electricPurple,
              onTap: () => _launchUrl(band.websiteUrl!),
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

  const _SocialIcon({
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: color.withValues(alpha:0.15),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 24),
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
      color: AppTheme.backgroundDark,
      child: TabBar(
        controller: tabController,
        tabs: tabs.map((t) => Tab(text: t)).toList(),
        labelColor: AppTheme.electricPurple,
        unselectedLabelColor: AppTheme.textTertiary,
        indicatorColor: AppTheme.electricPurple,
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
        child: CircularProgressIndicator(color: AppTheme.electricPurple),
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
                  backgroundColor: AppTheme.electricPurple,
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
        child: CircularProgressIndicator(color: AppTheme.electricPurple),
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
                  backgroundColor: AppTheme.electricPurple,
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
                            color: AppTheme.electricPurple,
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
                                ? AppTheme.electricPurple
                                : AppTheme.ratingInactive,
                          );
                        }),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        timeAgo,
                        style: const TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  if (checkin.reviewText != null &&
                      checkin.reviewText!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      checkin.reviewText!,
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
