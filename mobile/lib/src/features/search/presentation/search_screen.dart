import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/app_theme.dart';
import '../data/search_providers.dart';
import '../../../shared/widgets/venue_card.dart';
import '../../../shared/widgets/band_card.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged() {
    // Cancel previous timer
    _debounceTimer?.cancel();

    // Create new timer for debouncing (300ms delay)
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      ref.read(searchQueryProvider.notifier).setQuery(_searchController.text);
    });
  }

  @override
  Widget build(BuildContext context) {
    final searchResults = ref.watch(combinedSearchResultsProvider);
    final currentFilter = ref.watch(searchFilterStateProvider);
    final query = ref.watch(searchQueryProvider);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _searchController,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search bands, venues, events, people...',
            border: InputBorder.none,
            hintStyle: TextStyle(color: AppTheme.textSecondary, fontSize: 18),
          ),
          style: const TextStyle(color: AppTheme.textPrimary, fontSize: 18),
        ),
        actions: [
          if (_searchController.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              tooltip: 'Clear search',
              onPressed: () {
                _searchController.clear();
                ref.read(searchQueryProvider.notifier).setQuery('');
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.spacing16,
              vertical: AppTheme.spacing8,
            ),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  FilterChip(
                    label: const Text('All'),
                    selected: currentFilter == SearchFilter.all,
                    onSelected: (selected) {
                      if (selected) {
                        ref
                            .read(searchFilterStateProvider.notifier)
                            .setFilter(SearchFilter.all);
                      }
                    },
                  ),
                  const SizedBox(width: AppTheme.spacing8),
                  FilterChip(
                    label: const Text('Bands'),
                    selected: currentFilter == SearchFilter.bands,
                    onSelected: (selected) {
                      if (selected) {
                        ref
                            .read(searchFilterStateProvider.notifier)
                            .setFilter(SearchFilter.bands);
                      }
                    },
                  ),
                  const SizedBox(width: AppTheme.spacing8),
                  FilterChip(
                    label: const Text('Venues'),
                    selected: currentFilter == SearchFilter.venues,
                    onSelected: (selected) {
                      if (selected) {
                        ref
                            .read(searchFilterStateProvider.notifier)
                            .setFilter(SearchFilter.venues);
                      }
                    },
                  ),
                  const SizedBox(width: AppTheme.spacing8),
                  FilterChip(
                    label: const Text('Events'),
                    selected: currentFilter == SearchFilter.events,
                    onSelected: (selected) {
                      if (selected) {
                        ref
                            .read(searchFilterStateProvider.notifier)
                            .setFilter(SearchFilter.events);
                      }
                    },
                  ),
                  const SizedBox(width: AppTheme.spacing8),
                  FilterChip(
                    label: const Text('Users'),
                    selected: currentFilter == SearchFilter.users,
                    onSelected: (selected) {
                      if (selected) {
                        ref
                            .read(searchFilterStateProvider.notifier)
                            .setFilter(SearchFilter.users);
                      }
                    },
                  ),
                ],
              ),
            ),
          ),

          // Search Results
          Expanded(
            child: _buildSearchResults(context, query, searchResults),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchResults(
    BuildContext context,
    String query,
    SearchResults results,
  ) {
    // Show initial state
    if (query.trim().isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.search,
              size: 64,
              color: AppTheme.textTertiary,
            ),
            const SizedBox(height: AppTheme.spacing16),
            Text(
              'Start typing to search',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: AppTheme.textSecondary,
                  ),
            ),
          ],
        ),
      );
    }

    // Show loading state
    if (results.isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    // Show error state
    if (results.error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacing24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 64,
                color: AppTheme.error,
              ),
              const SizedBox(height: AppTheme.spacing16),
              Text(
                'Could not load search results',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppTheme.spacing8),
              Text(
                'Please check your connection and try again.',
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Show empty results
    if (results.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spacing24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.search_off,
                size: 64,
                color: AppTheme.textTertiary,
              ),
              const SizedBox(height: AppTheme.spacing16),
              Text(
                'No results for "$query"',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: AppTheme.spacing8),
              Text(
                'Try searching with different keywords',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppTheme.textSecondary,
                    ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    // Show categorized results
    return ListView(
      padding: const EdgeInsets.all(AppTheme.spacing16),
      children: [
        // Bands Section
        if (results.bands.isNotEmpty) ...[
          _buildSectionHeader(
            context,
            title: 'Bands',
            count: results.bands.length,
            icon: Icons.music_note,
            color: AppTheme.voltLime,
          ),
          const SizedBox(height: AppTheme.spacing8),
          ...results.bands.take(5).map(
                (band) => Padding(
                  padding: const EdgeInsets.only(bottom: AppTheme.spacing8),
                  child: BandCard(
                    band: band,
                    onTap: () => context.push('/bands/${band.id}'),
                  ),
                ),
              ),
          if (results.bands.length > 5)
            _buildSeeAllButton(
              context,
              label: 'See all ${results.bands.length} bands',
              onTap: () {
                ref
                    .read(searchFilterStateProvider.notifier)
                    .setFilter(SearchFilter.bands);
              },
            ),
          const SizedBox(height: AppTheme.spacing16),
        ],

        // Venues Section
        if (results.venues.isNotEmpty) ...[
          _buildSectionHeader(
            context,
            title: 'Venues',
            count: results.venues.length,
            icon: Icons.location_on,
            color: AppTheme.hotOrange,
          ),
          const SizedBox(height: AppTheme.spacing8),
          ...results.venues.take(5).map(
                (venue) => Padding(
                  padding: const EdgeInsets.only(bottom: AppTheme.spacing8),
                  child: VenueCard(
                    venue: venue,
                    onTap: () => context.push('/venues/${venue.id}'),
                  ),
                ),
              ),
          if (results.venues.length > 5)
            _buildSeeAllButton(
              context,
              label: 'See all ${results.venues.length} venues',
              onTap: () {
                ref
                    .read(searchFilterStateProvider.notifier)
                    .setFilter(SearchFilter.venues);
              },
            ),
          const SizedBox(height: AppTheme.spacing16),
        ],

        // Events Section
        if (results.events.isNotEmpty) ...[
          _buildSectionHeader(
            context,
            title: 'Events',
            count: results.events.length,
            icon: Icons.calendar_today,
            color: AppTheme.electricBlue,
          ),
          const SizedBox(height: AppTheme.spacing8),
          ...results.events.take(5).map(
                (event) => _EventSearchTile(
                  event: event,
                  onTap: () => context.push('/events/${event.id}'),
                ),
              ),
          if (results.events.length > 5)
            _buildSeeAllButton(
              context,
              label: 'See all ${results.events.length} events',
              onTap: () {
                ref
                    .read(searchFilterStateProvider.notifier)
                    .setFilter(SearchFilter.events);
              },
            ),
          const SizedBox(height: AppTheme.spacing16),
        ],

        // Users Section
        if (results.users.isNotEmpty) ...[
          _buildSectionHeader(
            context,
            title: 'Users',
            count: results.users.length,
            icon: Icons.person,
            color: AppTheme.voltLime,
          ),
          const SizedBox(height: AppTheme.spacing8),
          ...results.users.take(5).map(
                (user) => _UserSearchTile(
                  user: user,
                  onTap: () => context.push('/users/${user.id}'),
                ),
              ),
          if (results.users.length > 5)
            _buildSeeAllButton(
              context,
              label: 'See all ${results.users.length} users',
              onTap: () {
                ref
                    .read(searchFilterStateProvider.notifier)
                    .setFilter(SearchFilter.users);
              },
            ),
        ],
      ],
    );
  }

  Widget _buildSectionHeader(
    BuildContext context, {
    required String title,
    required int count,
    required IconData icon,
    required Color color,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 8),
        Text(
          '$title ($count)',
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ],
    );
  }

  Widget _buildSeeAllButton(
    BuildContext context, {
    required String label,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: AppTheme.spacing4),
      child: TextButton(
        style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
        onPressed: onTap,
        child: Text(
          label,
          style: const TextStyle(
            color: AppTheme.voltLime,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

/// User search result tile.
class _UserSearchTile extends StatelessWidget {
  const _UserSearchTile({
    required this.user,
    required this.onTap,
  });

  final SearchUser user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacing8),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          radius: 24,
          backgroundColor: AppTheme.voltLime.withValues(alpha: 0.2),
          backgroundImage: user.profileImageUrl != null
              ? NetworkImage(user.profileImageUrl!)
              : null,
          child: user.profileImageUrl == null
              ? const Icon(Icons.person, color: AppTheme.voltLime)
              : null,
        ),
        title: Row(
          children: [
            Flexible(
              child: Text(
                user.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (user.isVerified) ...[
              const SizedBox(width: 4),
              const Icon(Icons.verified, color: AppTheme.electricBlue, size: 16),
            ],
          ],
        ),
        subtitle: Text(
          '@${user.username} \u00B7 ${user.totalCheckins} shows',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: AppTheme.textTertiary),
        ),
        trailing: const Icon(
          Icons.chevron_right,
          color: AppTheme.textTertiary,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spacing8,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        ),
        tileColor: AppTheme.cardDark,
      ),
    );
  }
}

/// Event search result tile.
class _EventSearchTile extends StatelessWidget {
  const _EventSearchTile({
    required this.event,
    required this.onTap,
  });

  final SearchEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Format date
    String dateDisplay = '';
    if (event.eventDate != null && event.eventDate!.isNotEmpty) {
      try {
        final date = DateTime.parse(event.eventDate!);
        dateDisplay = DateFormat('MMM d, yyyy').format(date);
      } catch (_) {}
    }

    // Build subtitle
    final parts = <String>[];
    if (event.venueName != null) parts.add(event.venueName!);
    if (event.venueCity != null) parts.add(event.venueCity!);
    if (dateDisplay.isNotEmpty) parts.add(dateDisplay);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spacing8),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: AppTheme.electricBlue.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(
            Icons.calendar_today,
            color: AppTheme.electricBlue,
          ),
        ),
        title: Text(
          event.eventName ?? 'Event',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: AppTheme.textPrimary,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: parts.isNotEmpty
            ? Text(
                parts.join(' - '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppTheme.textTertiary),
              )
            : null,
        trailing: const Icon(
          Icons.chevron_right,
          color: AppTheme.textTertiary,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spacing8,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        ),
        tileColor: AppTheme.cardDark,
      ),
    );
  }
}
