import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../bands/domain/band.dart';
import '../../venues/domain/venue.dart';

part 'discover_screen.g.dart';

/// Provider for trending bands (locally active)
@riverpod
Future<List<Band>> trendingBands(TrendingBandsRef ref) async {
  final repository = ref.watch(bandRepositoryProvider);
  return repository.getTrendingBands(limit: 10);
}

/// Provider for top rated venues
@riverpod
Future<List<Venue>> topRatedVenues(TopRatedVenuesRef ref) async {
  final repository = ref.watch(venueRepositoryProvider);
  return repository.getPopularVenues(limit: 10);
}

/// Provider for popular bands
@riverpod
Future<List<Band>> popularBands(PopularBandsRef ref) async {
  final repository = ref.watch(bandRepositoryProvider);
  return repository.getPopularBands(limit: 10);
}

/// Discover & Search Screen
/// Search for Bands, Venues, or Users
/// Shows trending lists and map toggle
class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: CustomScrollView(
        slivers: [
          // App Bar with Search
          SliverAppBar(
            floating: true,
            pinned: true,
            backgroundColor: AppTheme.backgroundDark,
            expandedHeight: 120,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                padding: const EdgeInsets.fromLTRB(16, 60, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Discover',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Search Bar
                    Container(
                      decoration: BoxDecoration(
                        color: AppTheme.surfaceVariantDark,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: TextField(
                        controller: _searchController,
                        style: const TextStyle(color: AppTheme.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Search bands, venues, or users...',
                          hintStyle: const TextStyle(color: AppTheme.textTertiary),
                          prefixIcon: const Icon(
                            Icons.search,
                            color: AppTheme.textTertiary,
                          ),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(
                                    Icons.clear,
                                    color: AppTheme.textTertiary,
                                  ),
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() => _isSearching = false);
                                  },
                                )
                              : null,
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        onChanged: (value) {
                          setState(() => _isSearching = value.isNotEmpty);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              // Map Toggle Button
              IconButton(
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceVariantDark,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.map,
                    color: AppTheme.electricPurple,
                    size: 20,
                  ),
                ),
                onPressed: () {
                  // TODO: Toggle map view
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Map view coming soon!'),
                      backgroundColor: AppTheme.electricPurple,
                    ),
                  );
                },
              ),
            ],
          ),

          // Content
          if (_isSearching)
            // Search Results
            _buildSearchResults()
          else
            // Trending Lists
            _buildTrendingContent(),
        ],
      ),
    );
  }

  Widget _buildSearchResults() {
    // Placeholder search results
    return SliverPadding(
      padding: const EdgeInsets.all(16),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          const _SectionHeader(title: 'Search Results'),
          const SizedBox(height: 12),
          // Placeholder results
          _SearchResultItem(
            type: SearchResultType.band,
            name: 'Metallica',
            subtitle: 'Thrash Metal',
            onTap: () {},
          ),
          _SearchResultItem(
            type: SearchResultType.venue,
            name: 'The Forum',
            subtitle: 'Los Angeles, CA',
            onTap: () {},
          ),
          _SearchResultItem(
            type: SearchResultType.user,
            name: '@metalhead92',
            subtitle: '150 check-ins',
            onTap: () {},
          ),
        ]),
      ),
    );
  }

  Widget _buildTrendingContent() {
    final trendingBandsAsync = ref.watch(trendingBandsProvider);
    final topVenuesAsync = ref.watch(topRatedVenuesProvider);
    final popularBandsAsync = ref.watch(popularBandsProvider);

    return SliverPadding(
      padding: const EdgeInsets.only(bottom: 100),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          // Trending Locally
          const _SectionHeader(
            title: 'Trending Locally',
            subtitle: 'Bands being checked into right now',
          ),
          SizedBox(
            height: 160,
            child: trendingBandsAsync.when(
              data: (bands) => bands.isEmpty
                  ? const Center(
                      child: Text(
                        'No trending bands yet',
                        style: TextStyle(color: AppTheme.textTertiary),
                      ),
                    )
                  : ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: bands.length,
                      itemBuilder: (context, index) {
                        return _TrendingBandCard(
                          band: bands[index],
                          onTap: () {
                            // TODO: Navigate to band detail screen
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('View ${bands[index].name}'),
                                backgroundColor: AppTheme.electricPurple,
                              ),
                            );
                          },
                        );
                      },
                    ),
              loading: () => const Center(
                child: CircularProgressIndicator(
                  color: AppTheme.electricPurple,
                ),
              ),
              error: (err, stack) => Center(
                child: Text(
                  'Error loading trending bands',
                  style: const TextStyle(color: AppTheme.textTertiary),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Top Rated Venues
          const _SectionHeader(
            title: 'Top Rated Venues',
            subtitle: 'Highest average check-in ratings',
          ),
          SizedBox(
            height: 160,
            child: topVenuesAsync.when(
              data: (venues) => venues.isEmpty
                  ? const Center(
                      child: Text(
                        'No venues yet',
                        style: TextStyle(color: AppTheme.textTertiary),
                      ),
                    )
                  : ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: venues.length,
                      itemBuilder: (context, index) {
                        return _TrendingVenueCard(
                          venue: venues[index],
                          onTap: () {
                            // TODO: Navigate to venue detail screen
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('View ${venues[index].name}'),
                                backgroundColor: AppTheme.neonPink,
                              ),
                            );
                          },
                        );
                      },
                    ),
              loading: () => const Center(
                child: CircularProgressIndicator(
                  color: AppTheme.neonPink,
                ),
              ),
              error: (err, stack) => Center(
                child: Text(
                  'Error loading venues',
                  style: const TextStyle(color: AppTheme.textTertiary),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Popular This Week
          const _SectionHeader(
            title: 'Popular This Week',
            subtitle: 'Bands on tour with high activity',
          ),
          const SizedBox(height: 12),
          popularBandsAsync.when(
            data: (bands) => bands.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(16),
                    child: Center(
                      child: Text(
                        'No popular bands yet',
                        style: TextStyle(color: AppTheme.textTertiary),
                      ),
                    ),
                  )
                : Column(
                    children: bands.map((band) {
                      final index = bands.indexOf(band);
                      return _PopularBandListItem(
                        band: band,
                        rank: index + 1,
                        onTap: () {
                          // TODO: Navigate to band detail screen
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('View ${band.name}'),
                              backgroundColor: AppTheme.electricPurple,
                            ),
                          );
                        },
                      );
                    }).toList(),
                  ),
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(
                  color: AppTheme.electricPurple,
                ),
              ),
            ),
            error: (err, stack) => Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  'Error loading popular bands',
                  style: const TextStyle(color: AppTheme.textTertiary),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.subtitle,
  });

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textTertiary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

enum SearchResultType { band, venue, user }

class _SearchResultItem extends StatelessWidget {
  const _SearchResultItem({
    required this.type,
    required this.name,
    required this.subtitle,
    required this.onTap,
  });

  final SearchResultType type;
  final String name;
  final String subtitle;
  final VoidCallback onTap;

  IconData get _icon {
    switch (type) {
      case SearchResultType.band:
        return Icons.music_note;
      case SearchResultType.venue:
        return Icons.location_on;
      case SearchResultType.user:
        return Icons.person;
    }
  }

  Color get _color {
    switch (type) {
      case SearchResultType.band:
        return AppTheme.electricPurple;
      case SearchResultType.venue:
        return AppTheme.neonPink;
      case SearchResultType.user:
        return AppTheme.liveGreen;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: _color.withOpacity(0.2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(_icon, color: _color),
      ),
      title: Text(
        name,
        style: const TextStyle(
          color: AppTheme.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: AppTheme.textTertiary),
      ),
      trailing: const Icon(
        Icons.chevron_right,
        color: AppTheme.textTertiary,
      ),
    );
  }
}

class _TrendingBandCard extends StatelessWidget {
  const _TrendingBandCard({
    required this.band,
    required this.onTap,
  });

  final Band band;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Container(
              height: 90,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.electricPurple.withOpacity(0.5),
                    AppTheme.neonPink.withOpacity(0.5),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: band.imageUrl != null
                  ? ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                      child: Image.network(
                        band.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Center(
                          child: Icon(
                            Icons.music_note,
                            size: 36,
                            color: Colors.white.withOpacity(0.7),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: Icon(
                        Icons.music_note,
                        size: 36,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    band.name,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.local_fire_department,
                        size: 12,
                        color: AppTheme.neonPink,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${band.totalCheckins} check-ins',
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
      ),
    );
  }
}

class _TrendingVenueCard extends StatelessWidget {
  const _TrendingVenueCard({
    required this.venue,
    required this.onTap,
  });

  final Venue venue;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Container(
              height: 90,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.neonPink.withOpacity(0.5),
                    AppTheme.electricPurple.withOpacity(0.5),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: venue.imageUrl != null
                  ? ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                      child: Image.network(
                        venue.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Center(
                          child: Icon(
                            Icons.location_city,
                            size: 36,
                            color: Colors.white.withOpacity(0.7),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: Icon(
                        Icons.location_city,
                        size: 36,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    venue.name,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.star,
                        size: 12,
                        color: AppTheme.toastGold,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        venue.averageRating.toStringAsFixed(1),
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
      ),
    );
  }
}

class _PopularBandListItem extends StatelessWidget {
  const _PopularBandListItem({
    required this.band,
    required this.rank,
    required this.onTap,
  });

  final Band band;
  final int rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            '$rank',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
        ),
      ),
      title: Text(
        band.name,
        style: const TextStyle(
          color: AppTheme.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        '${band.totalCheckins} check-ins • ${band.genre ?? "Various"}',
        style: const TextStyle(color: AppTheme.textTertiary, fontSize: 12),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.star,
            size: 16,
            color: AppTheme.toastGold,
          ),
          const SizedBox(width: 4),
          Text(
            band.averageRating.toStringAsFixed(1),
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
