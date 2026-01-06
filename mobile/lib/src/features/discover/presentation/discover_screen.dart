import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../shared/services/location_service.dart';
import '../../bands/domain/band.dart';
import '../../venues/domain/venue.dart';
import 'providers/discover_providers.dart';

part 'discover_screen.g.dart';

/// Provider for trending bands (locally active)
@riverpod
Future<List<Band>> trendingBands(Ref ref) async {
  final repository = ref.watch(bandRepositoryProvider);
  return repository.getTrendingBands(limit: 10);
}

/// Provider for top rated venues
@riverpod
Future<List<Venue>> topRatedVenues(Ref ref) async {
  final repository = ref.watch(venueRepositoryProvider);
  return repository.getPopularVenues(limit: 10);
}

/// Provider for popular bands
@riverpod
Future<List<Band>> popularBands(Ref ref) async {
  final repository = ref.watch(bandRepositoryProvider);
  return repository.getPopularBands(limit: 10);
}

/// Provider for nearby venues based on user location
@riverpod
Future<List<Venue>> nearbyVenues(Ref ref) async {
  final position = await ref.watch(currentLocationProvider.future);
  if (position == null) {
    return []; // No location available
  }

  final repository = ref.watch(venueRepositoryProvider);
  return repository.getNearbyVenues(
    latitude: position.latitude,
    longitude: position.longitude,
    radius: 50, // 50km radius
    limit: 10,
  );
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
  Timer? _debounceTimer;

  @override
  void dispose() {
    _searchController.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    setState(() => _isSearching = value.isNotEmpty);

    // Cancel previous timer
    _debounceTimer?.cancel();

    // Create new timer for debouncing (300ms delay)
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      ref.read(discoverSearchQueryProvider.notifier).setQuery(value);
    });
  }

  void _clearSearch() {
    _searchController.clear();
    _debounceTimer?.cancel();
    ref.read(discoverSearchQueryProvider.notifier).clear();
    setState(() => _isSearching = false);
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
            expandedHeight: 140,
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
                                  onPressed: _clearSearch,
                                )
                              : null,
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        onChanged: _onSearchChanged,
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
    final searchResults = ref.watch(discoverSearchResultsProvider);
    final query = ref.watch(discoverSearchQueryProvider);

    // Minimum length check
    if (query.length < 2) {
      return SliverPadding(
        padding: const EdgeInsets.all(16),
        sliver: SliverToBoxAdapter(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.search,
                    size: 48,
                    color: AppTheme.textTertiary.withValues(alpha: 0.5),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Type at least 2 characters to search',
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // Loading state
    if (searchResults.isLoading) {
      return const SliverPadding(
        padding: EdgeInsets.all(16),
        sliver: SliverToBoxAdapter(
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: CircularProgressIndicator(
                color: AppTheme.electricPurple,
              ),
            ),
          ),
        ),
      );
    }

    // Error state
    if (searchResults.error != null) {
      return const SliverPadding(
        padding: EdgeInsets.all(16),
        sliver: SliverToBoxAdapter(
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 48,
                    color: AppTheme.neonPink,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Could not load search results',
                    style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Please check your connection and try again',
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // Empty results
    if (searchResults.isEmpty) {
      return SliverPadding(
        padding: const EdgeInsets.all(16),
        sliver: SliverToBoxAdapter(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.search_off,
                    size: 48,
                    color: AppTheme.textTertiary.withValues(alpha: 0.5),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No results for "$query"',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Try searching with different keywords',
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // Show results
    return SliverPadding(
      padding: const EdgeInsets.all(16),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          // Bands section
          if (searchResults.bands.isNotEmpty) ...[
            _SectionHeader(
              title: 'Bands',
              subtitle: '${searchResults.bands.length} found',
            ),
            const SizedBox(height: 8),
            ...searchResults.bands.map(
              (band) => _SearchResultItem(
                type: SearchResultType.band,
                name: band.name,
                subtitle: band.genre ?? 'Band',
                onTap: () => context.push('/bands/${band.id}'),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Venues section
          if (searchResults.venues.isNotEmpty) ...[
            _SectionHeader(
              title: 'Venues',
              subtitle: '${searchResults.venues.length} found',
            ),
            const SizedBox(height: 8),
            ...searchResults.venues.map(
              (venue) => _SearchResultItem(
                type: SearchResultType.venue,
                name: venue.name,
                subtitle: '${venue.city ?? ''}, ${venue.state ?? ''}',
                onTap: () => context.push('/venues/${venue.id}'),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Users section
          if (searchResults.users.isNotEmpty) ...[
            _SectionHeader(
              title: 'Users',
              subtitle: '${searchResults.users.length} found',
            ),
            const SizedBox(height: 8),
            ...searchResults.users.map(
              (user) => _SearchResultItem(
                type: SearchResultType.user,
                name: '@${user.username}',
                subtitle: '${user.totalCheckins} check-ins',
                onTap: () => context.push('/users/${user.id}'),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _buildTrendingContent() {
    final trendingBandsAsync = ref.watch(trendingBandsProvider);
    final topVenuesAsync = ref.watch(topRatedVenuesProvider);
    final popularBandsAsync = ref.watch(popularBandsProvider);
    final nearbyVenuesAsync = ref.watch(nearbyVenuesProvider);
    final locationStatusAsync = ref.watch(locationStatusProvider);

    return SliverPadding(
      padding: const EdgeInsets.only(bottom: 100),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          // Nearby Venues (location-based)
          _buildNearbyVenuesSection(nearbyVenuesAsync, locationStatusAsync),
          const SizedBox(height: 24),

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
                            context.push('/bands/${bands[index].id}');
                          },
                        );
                      },
                    ),
              loading: () => const Center(
                child: CircularProgressIndicator(
                  color: AppTheme.electricPurple,
                ),
              ),
              error: (err, stack) => const Center(
                child: Text(
                  'Error loading trending bands',
                  style: TextStyle(color: AppTheme.textTertiary),
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
                            context.push('/venues/${venues[index].id}');
                          },
                        );
                      },
                    ),
              loading: () => const Center(
                child: CircularProgressIndicator(
                  color: AppTheme.neonPink,
                ),
              ),
              error: (err, stack) => const Center(
                child: Text(
                  'Error loading venues',
                  style: TextStyle(color: AppTheme.textTertiary),
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
                          context.push('/bands/${band.id}');
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
            error: (err, stack) => const Padding(
              padding: EdgeInsets.all(16),
              child: Center(
                child: Text(
                  'Error loading popular bands',
                  style: TextStyle(color: AppTheme.textTertiary),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildNearbyVenuesSection(
    AsyncValue<List<Venue>> nearbyVenuesAsync,
    AsyncValue<LocationStatus> locationStatusAsync,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(
          title: 'Nearby Venues',
          subtitle: 'Live music spots near you',
        ),
        SizedBox(
          height: 160,
          child: locationStatusAsync.when(
            data: (status) {
              // Handle permission states
              if (status == LocationStatus.denied) {
                return _LocationPermissionPrompt(
                  message: 'Enable location to find venues near you',
                  buttonText: 'Grant Permission',
                  onPressed: () async {
                    await LocationService.requestPermission();
                    ref.invalidate(locationStatusProvider);
                    ref.invalidate(nearbyVenuesProvider);
                  },
                );
              } else if (status == LocationStatus.deniedForever) {
                return _LocationPermissionPrompt(
                  message: 'Location permission denied. Enable it in settings.',
                  buttonText: 'Open Settings',
                  onPressed: () async {
                    await LocationService.openAppSettings();
                  },
                );
              } else if (status == LocationStatus.serviceDisabled) {
                return _LocationPermissionPrompt(
                  message: 'Location services are disabled',
                  buttonText: 'Enable Location',
                  onPressed: () async {
                    await LocationService.openLocationSettings();
                  },
                );
              }

              // Location granted - show nearby venues
              return nearbyVenuesAsync.when(
                data: (venues) => venues.isEmpty
                    ? const Center(
                        child: Text(
                          'No venues found nearby',
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
                              context.push('/venues/${venues[index].id}');
                            },
                          );
                        },
                      ),
                loading: () => const Center(
                  child: CircularProgressIndicator(
                    color: AppTheme.voltLime,
                  ),
                ),
                error: (err, stack) => const Center(
                  child: Text(
                    'Error loading nearby venues',
                    style: TextStyle(color: AppTheme.textTertiary),
                  ),
                ),
              );
            },
            loading: () => const Center(
              child: CircularProgressIndicator(
                color: AppTheme.voltLime,
              ),
            ),
            error: (err, stack) => const Center(
              child: Text(
                'Error checking location',
                style: TextStyle(color: AppTheme.textTertiary),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Prompt widget for location permission
class _LocationPermissionPrompt extends StatelessWidget {
  const _LocationPermissionPrompt({
    required this.message,
    required this.buttonText,
    required this.onPressed,
  });

  final String message;
  final String buttonText;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.location_off,
              color: AppTheme.textTertiary,
              size: 32,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: const TextStyle(
                color: AppTheme.textTertiary,
                fontSize: 14,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: onPressed,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.voltLime,
                foregroundColor: AppTheme.backgroundDark,
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 10,
                ),
              ),
              child: Text(buttonText),
            ),
          ],
        ),
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
          color: _color.withValues(alpha:0.2),
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
                    AppTheme.electricPurple.withValues(alpha:0.5),
                    AppTheme.neonPink.withValues(alpha:0.5),
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
                            color: Colors.white.withValues(alpha:0.7),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: Icon(
                        Icons.music_note,
                        size: 36,
                        color: Colors.white.withValues(alpha:0.7),
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
                    AppTheme.neonPink.withValues(alpha:0.5),
                    AppTheme.electricPurple.withValues(alpha:0.5),
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
                            color: Colors.white.withValues(alpha:0.7),
                          ),
                        ),
                      ),
                    )
                  : Center(
                      child: Icon(
                        Icons.location_city,
                        size: 36,
                        color: Colors.white.withValues(alpha:0.7),
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
