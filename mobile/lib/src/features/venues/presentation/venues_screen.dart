import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../domain/venue.dart';
import '../../../shared/widgets/venue_card.dart';
import '../../../shared/widgets/venue_card_skeleton.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import '../../../shared/widgets/error_state_widget.dart';
import 'venue_filters_notifier.dart';
import 'venue_filters_state.dart';
import 'widgets/venue_filters_sheet.dart';

final filteredVenuesProvider = FutureProvider.autoDispose<List<Venue>>((ref) async {
  final repository = ref.watch(venueRepositoryProvider);
  final filters = ref.watch(venueFiltersProvider);

  // Get venues with filter parameters
  final venues = await repository.getVenues();

  // Apply client-side filtering and sorting
  final filtered = venues.where((venue) {
    // Venue type filter
    if (filters.venueTypes.isNotEmpty) {
      if (venue.venueType == null || !filters.venueTypes.contains(venue.venueType)) {
        return false;
      }
    }

    // City filter
    if (filters.cities.isNotEmpty && venue.city != null) {
      if (!filters.cities.contains(venue.city)) {
        return false;
      }
    }

    // Capacity filter
    if (filters.minCapacity != null && venue.capacity != null) {
      if (venue.capacity! < filters.minCapacity!) {
        return false;
      }
    }
    if (filters.maxCapacity != null && venue.capacity != null) {
      if (venue.capacity! > filters.maxCapacity!) {
        return false;
      }
    }

    // Rating filter
    if (filters.minRating != null) {
      if (venue.averageRating < filters.minRating!) {
        return false;
      }
    }

    return true;
  }).toList();

  // Apply sorting
  switch (filters.sortBy) {
    case VenueSortBy.nameAsc:
      filtered.sort((a, b) => a.name.compareTo(b.name));
      break;
    case VenueSortBy.nameDesc:
      filtered.sort((a, b) => b.name.compareTo(a.name));
      break;
    case VenueSortBy.ratingDesc:
      filtered.sort((a, b) => b.averageRating.compareTo(a.averageRating));
      break;
    case VenueSortBy.ratingAsc:
      filtered.sort((a, b) => a.averageRating.compareTo(b.averageRating));
      break;
    case VenueSortBy.reviewCountDesc:
      filtered.sort((a, b) => b.totalReviews.compareTo(a.totalReviews));
      break;
    case VenueSortBy.newestFirst:
      filtered.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      break;
  }

  return filtered;
});

class VenuesScreen extends ConsumerWidget {
  const VenuesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final venuesAsync = ref.watch(filteredVenuesProvider);
    final filters = ref.watch(venueFiltersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Venues'),
        actions: [
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                onPressed: () {
                  showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: Colors.transparent,
                    builder: (context) => const VenueFiltersSheet(),
                  );
                },
                icon: const Icon(Icons.filter_list),
              ),
              if (filters.activeFilterCount > 0)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: AppTheme.primary,
                      shape: BoxShape.circle,
                    ),
                    constraints: const BoxConstraints(
                      minWidth: 16,
                      minHeight: 16,
                    ),
                    child: Text(
                      '${filters.activeFilterCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Quick filter chips
          if (filters.hasActiveFilters)
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.spacing16,
                vertical: AppTheme.spacing8,
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    if (filters.venueTypes.isNotEmpty)
                      ...filters.venueTypes.map((type) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: Chip(
                              label: Text(_venueTypeLabel(type)),
                              deleteIcon: const Icon(Icons.close, size: 16),
                              onDeleted: () {
                                ref.read(venueFiltersProvider.notifier).toggleVenueType(type);
                              },
                            ),
                          ),),
                    if (filters.minRating != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Chip(
                          label: Text('${filters.minRating!.toStringAsFixed(1)}+ stars'),
                          deleteIcon: const Icon(Icons.close, size: 16),
                          onDeleted: () {
                            ref.read(venueFiltersProvider.notifier).setMinRating(null);
                          },
                        ),
                      ),
                    if (filters.minCapacity != null || filters.maxCapacity != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Chip(
                          label: Text(
                            'Capacity: ${filters.minCapacity ?? 0}-${filters.maxCapacity ?? '∞'}',
                          ),
                          deleteIcon: const Icon(Icons.close, size: 16),
                          onDeleted: () {
                            ref.read(venueFiltersProvider.notifier).setCapacityRange(
                                  min: null,
                                  max: null,
                                );
                          },
                        ),
                      ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: venuesAsync.when(
              data: (venues) => RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(filteredVenuesProvider);
                },
                child: venues.isEmpty
                    ? filters.hasActiveFilters
                        ? EmptyStateWidget(
                            type: EmptyStateType.noSearchResults,
                            customTitle: 'No Venues Found',
                            customMessage: 'No venues match your current filters. Try adjusting your filter criteria.',
                            actionLabel: 'Clear Filters',
                            onAction: () => ref.read(venueFiltersProvider.notifier).clearAll(),
                          )
                        : EmptyStateWidget(
                            type: EmptyStateType.noVenues,
                            onAction: () => ref.invalidate(filteredVenuesProvider),
                          )
                    : ListView.builder(
                        padding: const EdgeInsets.all(AppTheme.spacing16),
                        itemCount: venues.length,
                        itemBuilder: (context, index) {
                          return VenueCard(
                            venue: venues[index],
                            onTap: () => context.push('/venues/${venues[index].id}'),
                          );
                        },
                      ),
              ),
              loading: () => ListView.builder(
                padding: const EdgeInsets.all(AppTheme.spacing16),
                itemCount: 5,
                itemBuilder: (context, index) => const VenueCardSkeleton(),
              ),
              error: (error, stackTrace) => ErrorStateWidget(
                error: error,
                stackTrace: stackTrace,
                onRetry: () => ref.invalidate(filteredVenuesProvider),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _venueTypeLabel(VenueType type) {
    switch (type) {
      case VenueType.concertHall:
        return 'Concert Hall';
      case VenueType.club:
        return 'Club';
      case VenueType.arena:
        return 'Arena';
      case VenueType.outdoor:
        return 'Outdoor';
      case VenueType.bar:
        return 'Bar';
      case VenueType.theater:
        return 'Theater';
      case VenueType.stadium:
        return 'Stadium';
      case VenueType.other:
        return 'Other';
    }
  }
}
