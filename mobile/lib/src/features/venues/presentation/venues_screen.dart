import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/venue.dart';
import '../../../shared/widgets/venue_card.dart';
import '../../../shared/widgets/venue_card_skeleton.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import 'providers/venue_providers.dart';
import 'venue_filters_notifier.dart';
import 'venue_filters_state.dart';
import 'widgets/venue_filters_sheet.dart';

class VenuesScreen extends ConsumerStatefulWidget {
  const VenuesScreen({super.key});

  @override
  ConsumerState<VenuesScreen> createState() => _VenuesScreenState();
}

class _VenuesScreenState extends ConsumerState<VenuesScreen> {
  late final ScrollController _scrollController;
  bool _isLoadingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;

    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.position.pixels;
    const scrollThreshold = 200.0;

    final venuesState = ref.read(paginatedVenuesProvider);

    if (currentScroll >= maxScroll - scrollThreshold &&
        !venuesState.isLoading &&
        venuesState.hasMore &&
        !_isLoadingMore) {
      setState(() {
        _isLoadingMore = true;
      });
      ref.read(paginatedVenuesProvider.notifier).loadMore().then((_) {
        if (mounted) {
          setState(() {
            _isLoadingMore = false;
          });
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final venuesState = ref.watch(paginatedVenuesProvider);
    final filters = ref.watch(venueFiltersProvider);

    // Listen for filter changes and update paginated provider
    ref.listen(venueFiltersProvider, (previous, next) {
      if (previous != next) {
        ref.read(paginatedVenuesProvider.notifier).updateFilters(next);
      }
    });

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
          // Error banner
          if (venuesState.error != null)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: AppTheme.spacing16, vertical: AppTheme.spacing8),
              padding: const EdgeInsets.all(AppTheme.spacing12),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline,
                    color: Theme.of(context).colorScheme.error,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      venuesState.error!.message,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      ref.read(paginatedVenuesProvider.notifier).loadMore();
                    },
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await ref.read(paginatedVenuesProvider.notifier).refresh();
              },
              child: _buildVenuesList(context, ref, venuesState, filters),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVenuesList(
    BuildContext context,
    WidgetRef ref,
    VenuePaginationState venuesState,
    VenueFiltersState filters,
  ) {
    // Show loading skeleton on initial load
    if (venuesState.isLoading && venuesState.venues.isEmpty) {
      return ListView.builder(
        padding: const EdgeInsets.all(AppTheme.spacing16),
        itemCount: 5,
        itemBuilder: (context, index) => const VenueCardSkeleton(),
      );
    }

    // Show empty state
    if (venuesState.venues.isEmpty && !venuesState.isLoading) {
      return filters.hasActiveFilters
          ? EmptyStateWidget(
              type: EmptyStateType.noSearchResults,
              customTitle: 'No Venues Found',
              customMessage: 'No venues match your current filters. Try adjusting your filter criteria.',
              actionLabel: 'Clear Filters',
              onAction: () => ref.read(venueFiltersProvider.notifier).clearAll(),
            )
          : EmptyStateWidget(
              type: EmptyStateType.noVenues,
              onAction: () => ref.read(paginatedVenuesProvider.notifier).refresh(),
            );
    }

    // Show venues list with infinite scroll
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(AppTheme.spacing16),
      itemCount: venuesState.venues.length + (venuesState.hasMore ? 1 : 0),
      itemBuilder: (context, index) {
        // Loading indicator at the end
        if (index >= venuesState.venues.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        return VenueCard(
          venue: venuesState.venues[index],
          onTap: () => context.push('/venues/${venuesState.venues[index].id}'),
        );
      },
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
