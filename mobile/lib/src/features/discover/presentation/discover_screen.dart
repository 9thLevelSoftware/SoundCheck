import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../shared/services/location_service.dart';
import '../../../shared/utils/a11y_utils.dart';
import '../../bands/domain/band.dart';
import '../../venues/domain/venue.dart';
import '../domain/discovery_models.dart';
import 'providers/discover_providers.dart';
import '../../events/presentation/providers/event_providers.dart';
import '../../trending/presentation/trending_feed_screen.dart';

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
/// Event-first discovery with search for bands, venues, users, and events
class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;
  bool _showMapView = false;
  String? _selectedGenre;
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
                    Semantics(
                      label: searchFieldSemantics(),
                      textField: true,
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppTheme.surfaceVariantDark,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: TextField(
                          controller: _searchController,
                          style: const TextStyle(color: AppTheme.textPrimary),
                          decoration: InputDecoration(
                            hintText: 'Search shows, bands, venues, or users...',
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
                    color: _showMapView
                        ? AppTheme.electricPurple.withValues(alpha: 0.2)
                        : AppTheme.surfaceVariantDark,
                    borderRadius: BorderRadius.circular(8),
                    border: _showMapView
                        ? Border.all(color: AppTheme.electricPurple, width: 1.5)
                        : null,
                  ),
                  child: Icon(
                    _showMapView ? Icons.list : Icons.map,
                    color: AppTheme.electricPurple,
                    size: 20,
                  ),
                ),
                onPressed: () {
                  setState(() => _showMapView = !_showMapView);
                },
              ),
            ],
          ),

          // Content
          if (_isSearching)
            // Search Results
            _buildSearchResults()
          else if (_showMapView)
            // Map View
            _buildMapView()
          else
            // Event-first Discovery Content
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
          // Events section (shown first for event-first discovery)
          if (searchResults.events.isNotEmpty) ...[
            _SectionHeader(
              title: 'Events',
              subtitle: '${searchResults.events.length} found',
            ),
            const SizedBox(height: 8),
            ...searchResults.events.map(
              (event) => _SearchResultItem(
                type: SearchResultType.event,
                name: event.eventName ?? event.bandName ?? 'Event',
                subtitle: _formatEventSubtitle(event),
                onTap: () {
                  // Navigate to event detail if available
                  context.push('/events/${event.id}');
                },
              ),
            ),
            const SizedBox(height: 16),
          ],

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

  String _formatEventSubtitle(DiscoverEvent event) {
    final parts = <String>[];
    if (event.venueName != null) parts.add(event.venueName!);
    if (event.venueCity != null) parts.add(event.venueCity!);
    if (event.eventDate.isNotEmpty) {
      try {
        final date = DateTime.parse(event.eventDate);
        parts.add(DateFormat('MMM d').format(date));
      } catch (_) {
        // Skip date formatting if parse fails
      }
    }
    return parts.join(' - ');
  }

  Widget _buildMapView() {
    final topVenuesAsync = ref.watch(topRatedVenuesProvider);
    final nearbyVenuesAsync = ref.watch(nearbyVenuesProvider);
    final locationAsync = ref.watch(currentLocationProvider);

    // Combine venues from both sources
    final allVenues = <Venue>[];
    if (topVenuesAsync.hasValue) {
      allVenues.addAll(topVenuesAsync.value!);
    }
    if (nearbyVenuesAsync.hasValue) {
      for (final venue in nearbyVenuesAsync.value!) {
        if (!allVenues.any((v) => v.id == venue.id)) {
          allVenues.add(venue);
        }
      }
    }

    // Filter venues that have valid coordinates
    final venuesWithLocation = allVenues
        .where((v) => v.latitude != null && v.longitude != null)
        .toList();

    // Default center (US center) if no user location
    var center = const LatLng(39.8283, -98.5795);
    var zoom = 4.0;

    // Use user location if available
    if (locationAsync.hasValue && locationAsync.value != null) {
      center = LatLng(
        locationAsync.value!.latitude,
        locationAsync.value!.longitude,
      );
      zoom = 10.0;
    } else if (venuesWithLocation.isNotEmpty) {
      // Center on first venue with coordinates
      center = LatLng(
        venuesWithLocation.first.latitude!,
        venuesWithLocation.first.longitude!,
      );
      zoom = 10.0;
    }

    return SliverFillRemaining(
      child: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: center,
              initialZoom: zoom,
              minZoom: 3,
              maxZoom: 18,
              backgroundColor: AppTheme.backgroundDark,
            ),
            children: [
              // OpenStreetMap tiles with dark theme
              TileLayer(
                urlTemplate:
                    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                subdomains: const ['a', 'b', 'c', 'd'],
                userAgentPackageName: 'com.soundcheck.app',
                maxZoom: 19,
              ),
              // Venue markers
              MarkerLayer(
                markers: venuesWithLocation.map((venue) {
                  return Marker(
                    point: LatLng(venue.latitude!, venue.longitude!),
                    width: 40,
                    height: 40,
                    child: GestureDetector(
                      onTap: () => _showVenueBottomSheet(venue),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppTheme.neonPink,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white,
                            width: 2,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.neonPink.withValues(alpha: 0.5),
                              blurRadius: 8,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.location_on,
                          color: Colors.white,
                          size: 24,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
          // Loading indicator
          if (topVenuesAsync.isLoading || nearbyVenuesAsync.isLoading)
            Positioned(
              top: 16,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.cardDark,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          color: AppTheme.electricPurple,
                          strokeWidth: 2,
                        ),
                      ),
                      SizedBox(width: 8),
                      Text(
                        'Loading venues...',
                        style: TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          // Venue count indicator
          if (venuesWithLocation.isNotEmpty)
            Positioned(
              bottom: 100,
              left: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.cardDark,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppTheme.electricPurple.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.location_on,
                      color: AppTheme.neonPink,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${venuesWithLocation.length} venues',
                      style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          // Empty state
          if (!topVenuesAsync.isLoading &&
              !nearbyVenuesAsync.isLoading &&
              venuesWithLocation.isEmpty)
            Center(
              child: Container(
                margin: const EdgeInsets.all(32),
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppTheme.cardDark,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.map_outlined,
                      size: 48,
                      color: AppTheme.textTertiary.withValues(alpha: 0.5),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No venues with locations',
                      style: TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Venues with coordinates will appear on the map',
                      style: TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 14,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showVenueBottomSheet(Venue venue) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: const BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textTertiary.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      // Venue image/icon
                      Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              AppTheme.neonPink.withValues(alpha: 0.5),
                              AppTheme.electricPurple.withValues(alpha: 0.5),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: venue.imageUrl != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.network(
                                  venue.imageUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const Icon(
                                    Icons.location_city,
                                    color: Colors.white,
                                    size: 30,
                                  ),
                                ),
                              )
                            : const Icon(
                                Icons.location_city,
                                color: Colors.white,
                                size: 30,
                              ),
                      ),
                      const SizedBox(width: 16),
                      // Venue info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              venue.name,
                              style: const TextStyle(
                                color: AppTheme.textPrimary,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 4),
                            if (venue.city != null || venue.state != null)
                              Text(
                                [venue.city, venue.state]
                                    .where((s) => s != null)
                                    .join(', '),
                                style: const TextStyle(
                                  color: AppTheme.textTertiary,
                                  fontSize: 14,
                                ),
                              ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(
                                  Icons.star,
                                  size: 16,
                                  color: AppTheme.toastGold,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  venue.averageRating.toStringAsFixed(1),
                                  style: const TextStyle(
                                    color: AppTheme.textPrimary,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                const Icon(
                                  Icons.people,
                                  size: 16,
                                  color: AppTheme.textTertiary,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '${venue.totalCheckins} check-ins',
                                  style: const TextStyle(
                                    color: AppTheme.textTertiary,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // View details button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        context.push('/venues/${venue.id}');
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.electricPurple,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'View Venue Details',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Bottom padding for safe area
            SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
          ],
        ),
      ),
    );
  }

  Widget _buildTrendingContent() {
    final recommendedEventsAsync = ref.watch(recommendedEventsProvider);
    final nearbyEventsAsync = ref.watch(nearbyUpcomingEventsProvider);
    final trendingEventsAsync = ref.watch(trendingNearbyEventsProvider);
    final genreListAsync = ref.watch(genreListProvider);
    final popularBandsAsync = ref.watch(popularBandsProvider);
    final locationStatusAsync = ref.watch(locationStatusProvider);

    return SliverPadding(
      padding: const EdgeInsets.only(bottom: 100),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          // Trending Shows Near You (Wilson-scored composite from /api/trending)
          const TrendingFeedSection(),

          // For You (personalized recommendations, hidden if empty)
          _buildForYouSection(recommendedEventsAsync),

          // Nearby Shows (event-first, GPS-based)
          _buildNearbyShowsSection(nearbyEventsAsync, locationStatusAsync),
          const SizedBox(height: 24),

          // Genre Browse
          _buildGenreBrowseSection(genreListAsync),
          const SizedBox(height: 24),

          // Trending Near You
          _buildTrendingNearYouSection(trendingEventsAsync, locationStatusAsync),
          const SizedBox(height: 24),

          // Popular This Week (bands - secondary content)
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

  /// "For You" section: personalized recommendations based on genre history + friend activity.
  /// Hidden entirely when recommendations are empty (no empty state shown).
  Widget _buildForYouSection(AsyncValue<List<DiscoverEvent>> recommendedEventsAsync) {
    return recommendedEventsAsync.when(
      data: (events) {
        if (events.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionHeader(
              title: 'For You',
              subtitle: 'Based on your concert taste',
            ),
            SizedBox(
              height: 200,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: events.length,
                itemBuilder: (context, index) {
                  return _ForYouCard(
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
          _SectionHeader(
            title: 'For You',
            subtitle: 'Based on your concert taste',
          ),
          SizedBox(
            height: 200,
            child: Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: AppTheme.electricPurple,
                  strokeWidth: 2,
                ),
              ),
            ),
          ),
          SizedBox(height: 24),
        ],
      ),
      error: (_, __) => const SizedBox.shrink(), // Hide on error
    );
  }

  Widget _buildNearbyShowsSection(
    AsyncValue<List<DiscoverEvent>> nearbyEventsAsync,
    AsyncValue<LocationStatus> locationStatusAsync,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(
          title: 'Nearby Shows',
          subtitle: 'Upcoming events near you',
        ),
        SizedBox(
          height: 180,
          child: locationStatusAsync.when(
            data: (status) {
              // Handle permission states
              if (status == LocationStatus.denied) {
                return _LocationPermissionPrompt(
                  message: 'Enable location to find shows near you',
                  buttonText: 'Grant Permission',
                  onPressed: () async {
                    await LocationService.requestPermission();
                    ref.invalidate(locationStatusProvider);
                    ref.invalidate(nearbyUpcomingEventsProvider);
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

              // Location granted - show nearby events
              return nearbyEventsAsync.when(
                data: (events) => events.isEmpty
                    ? const Center(
                        child: Text(
                          'No upcoming shows found nearby',
                          style: TextStyle(color: AppTheme.textTertiary),
                        ),
                      )
                    : ListView.builder(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: events.length,
                        itemBuilder: (context, index) {
                          return _EventCard(
                            event: events[index],
                            onTap: () {
                              context.push('/events/${events[index].id}');
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
                    'Error loading nearby shows',
                    style: TextStyle(color: AppTheme.textTertiary),
                  ),
                ),
              );
            },
            loading: () => const Center(
              child: CircularProgressIndicator(
                color: AppTheme.electricPurple,
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

  Widget _buildGenreBrowseSection(AsyncValue<List<String>> genreListAsync) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(
          title: 'Browse by Genre',
          subtitle: 'Find shows matching your taste',
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 40,
          child: genreListAsync.when(
            data: (genres) => genres.isEmpty
                ? const Center(
                    child: Text(
                      'No genres available',
                      style: TextStyle(color: AppTheme.textTertiary),
                    ),
                  )
                : ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: genres.length,
                    itemBuilder: (context, index) {
                      final genre = genres[index];
                      final isSelected = _selectedGenre == genre;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: GestureDetector(
                          onTap: () {
                            setState(() {
                              _selectedGenre = isSelected ? null : genre;
                            });
                            if (!isSelected) {
                              _showGenreEventsSheet(genre);
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppTheme.electricPurple
                                  : AppTheme.surfaceVariantDark,
                              borderRadius: BorderRadius.circular(20),
                              border: isSelected
                                  ? null
                                  : Border.all(
                                      color: AppTheme.electricPurple.withValues(alpha: 0.3),
                                    ),
                            ),
                            child: Text(
                              genre,
                              style: TextStyle(
                                color: isSelected
                                    ? Colors.white
                                    : AppTheme.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
            loading: () => const Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  color: AppTheme.electricPurple,
                  strokeWidth: 2,
                ),
              ),
            ),
            error: (err, stack) => const Center(
              child: Text(
                'Error loading genres',
                style: TextStyle(color: AppTheme.textTertiary, fontSize: 13),
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _showGenreEventsSheet(String genre) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => Consumer(
        builder: (context, ref, child) {
          final genreEventsAsync = ref.watch(genreEventsProvider(genre));
          return Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.6,
            ),
            decoration: const BoxDecoration(
              color: AppTheme.cardDark,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Handle bar
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppTheme.textTertiary.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    '$genre Events',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Flexible(
                  child: genreEventsAsync.when(
                    data: (events) => events.isEmpty
                        ? const Center(
                            child: Padding(
                              padding: EdgeInsets.all(32),
                              child: Text(
                                'No upcoming events for this genre',
                                style: TextStyle(color: AppTheme.textTertiary),
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: events.length,
                            itemBuilder: (context, index) {
                              final event = events[index];
                              return _GenreEventListItem(
                                event: event,
                                onTap: () {
                                  Navigator.pop(context);
                                  this.context.push('/events/${event.id}');
                                },
                              );
                            },
                          ),
                    loading: () => const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: CircularProgressIndicator(
                          color: AppTheme.electricPurple,
                        ),
                      ),
                    ),
                    error: (err, stack) => const Center(
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: Text(
                          'Error loading events',
                          style: TextStyle(color: AppTheme.textTertiary),
                        ),
                      ),
                    ),
                  ),
                ),
                SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTrendingNearYouSection(
    AsyncValue<List<DiscoverEvent>> trendingEventsAsync,
    AsyncValue<LocationStatus> locationStatusAsync,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(
          title: 'Trending Near You',
          subtitle: 'Shows with the most check-ins',
        ),
        SizedBox(
          height: 180,
          child: locationStatusAsync.when(
            data: (status) {
              if (status != LocationStatus.granted) {
                return const Center(
                  child: Text(
                    'Enable location to see trending shows nearby',
                    style: TextStyle(color: AppTheme.textTertiary, fontSize: 13),
                  ),
                );
              }

              return trendingEventsAsync.when(
                data: (events) => events.isEmpty
                    ? const Center(
                        child: Text(
                          'No trending shows nearby',
                          style: TextStyle(color: AppTheme.textTertiary),
                        ),
                      )
                    : ListView.builder(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: events.length,
                        itemBuilder: (context, index) {
                          return _TrendingEventCard(
                            event: events[index],
                            onTap: () {
                              context.push('/events/${events[index].id}');
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
                    'Error loading trending shows',
                    style: TextStyle(color: AppTheme.textTertiary),
                  ),
                ),
              );
            },
            loading: () => const Center(
              child: CircularProgressIndicator(
                color: AppTheme.neonPink,
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

enum SearchResultType { band, venue, user, event }

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
      case SearchResultType.event:
        return Icons.calendar_today;
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
      case SearchResultType.event:
        return AppTheme.toastGold;
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

/// Event card for horizontal scroll lists (Nearby Shows)
/// Shows RSVP checkmark indicator when user has RSVP'd (uses batch userRsvpsProvider).
class _EventCard extends ConsumerWidget {
  const _EventCard({
    required this.event,
    required this.onTap,
  });

  final DiscoverEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userRsvps = ref.watch(userRsvpsProvider);
    final isGoing = userRsvps.value?.contains(event.id) ?? false;

    String dateDisplay = '';
    try {
      final date = DateTime.parse(event.eventDate);
      dateDisplay = DateFormat('MMM d').format(date);
    } catch (_) {}

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 160,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image / gradient header with date
            Container(
              height: 90,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.electricPurple.withValues(alpha: 0.5),
                    AppTheme.neonPink.withValues(alpha: 0.5),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: Stack(
                children: [
                  if (event.bandImageUrl != null)
                    ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                      child: Image.network(
                        event.bandImageUrl!,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  // Date badge
                  if (dateDisplay.isNotEmpty)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundDark.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          dateDisplay,
                          style: const TextStyle(
                            color: AppTheme.electricPurple,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  // RSVP indicator (checkmark when user is going)
                  if (isGoing)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: AppTheme.voltLime,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.voltLime.withValues(alpha: 0.4),
                              blurRadius: 6,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.check,
                          color: AppTheme.backgroundDark,
                          size: 12,
                        ),
                      ),
                    ),
                  // Distance badge
                  if (event.distanceKm != null)
                    Positioned(
                      bottom: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundDark.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '${event.distanceKm!.toStringAsFixed(1)} km',
                          style: const TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.eventName ?? event.bandName ?? 'Event',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  if (event.venueName != null)
                    Text(
                      event.venueName!,
                      style: const TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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

/// Trending event card with check-in count badge
class _TrendingEventCard extends StatelessWidget {
  const _TrendingEventCard({
    required this.event,
    required this.onTap,
  });

  final DiscoverEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    String dateDisplay = '';
    try {
      final date = DateTime.parse(event.eventDate);
      dateDisplay = DateFormat('MMM d').format(date);
    } catch (_) {}

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 160,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image / gradient header
            Container(
              height: 90,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.neonPink.withValues(alpha: 0.6),
                    AppTheme.electricPurple.withValues(alpha: 0.4),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: Stack(
                children: [
                  if (event.bandImageUrl != null)
                    ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                      child: Image.network(
                        event.bandImageUrl!,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  // Check-in count badge
                  if (event.checkinCount > 0)
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.neonPink,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.local_fire_department,
                              size: 12,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 3),
                            Text(
                              '${event.checkinCount}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  // Date badge
                  if (dateDisplay.isNotEmpty)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundDark.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          dateDisplay,
                          style: const TextStyle(
                            color: AppTheme.neonPink,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.eventName ?? event.bandName ?? 'Event',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  if (event.venueName != null)
                    Text(
                      '${event.venueName!}${event.venueCity != null ? ' - ${event.venueCity}' : ''}',
                      style: const TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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

/// "For You" recommendation card -- wider than standard event cards
/// to show more info (genre tag pill, date in voltLime).
class _ForYouCard extends StatelessWidget {
  const _ForYouCard({
    required this.event,
    required this.onTap,
  });

  final DiscoverEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    String dateDisplay = '';
    try {
      final date = DateTime.parse(event.eventDate);
      dateDisplay = DateFormat('MMM d').format(date);
    } catch (_) {}

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 200,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image / gradient header
            Container(
              height: 100,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppTheme.electricPurple.withValues(alpha: 0.6),
                    AppTheme.neonPink.withValues(alpha: 0.4),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: Stack(
                children: [
                  if (event.bandImageUrl != null)
                    ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
                      child: Image.network(
                        event.bandImageUrl!,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  // Date badge (voltLime)
                  if (dateDisplay.isNotEmpty)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundDark.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          dateDisplay,
                          style: const TextStyle(
                            color: AppTheme.voltLime,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  // Genre tag pill
                  if (event.bandGenre != null)
                    Positioned(
                      bottom: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.electricPurple,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          event.bandGenre!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.eventName ?? event.bandName ?? 'Event',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  if (event.venueName != null)
                    Text(
                      '${event.venueName!}${event.venueCity != null ? ' - ${event.venueCity}' : ''}',
                      style: const TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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

/// List item for genre events in bottom sheet
class _GenreEventListItem extends StatelessWidget {
  const _GenreEventListItem({
    required this.event,
    required this.onTap,
  });

  final DiscoverEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    String dateDisplay = '';
    try {
      final date = DateTime.parse(event.eventDate);
      dateDisplay = DateFormat('EEE, MMM d').format(date);
    } catch (_) {}

    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: AppTheme.electricPurple.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(
          Icons.calendar_today,
          color: AppTheme.electricPurple,
          size: 22,
        ),
      ),
      title: Text(
        event.eventName ?? event.bandName ?? 'Event',
        style: const TextStyle(
          color: AppTheme.textPrimary,
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        [
          if (event.venueName != null) event.venueName,
          if (dateDisplay.isNotEmpty) dateDisplay,
        ].join(' - '),
        style: const TextStyle(
          color: AppTheme.textTertiary,
          fontSize: 12,
        ),
      ),
      trailing: const Icon(
        Icons.chevron_right,
        color: AppTheme.textTertiary,
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
        '${band.totalCheckins} check-ins  ${band.genre ?? "Various"}',
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
