import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../domain/band.dart';
import '../../../shared/widgets/band_card.dart';
import '../../../shared/widgets/band_card_skeleton.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import '../../../shared/widgets/error_state_widget.dart';
import 'band_filters_notifier.dart';
import 'band_filters_state.dart';
import 'widgets/band_filters_sheet.dart';

final filteredBandsProvider =
    FutureProvider.autoDispose<List<Band>>((ref) async {
  final repository = ref.watch(bandRepositoryProvider);
  final filters = ref.watch(bandFiltersProvider);

  // Get bands from repository
  final bands = await repository.getBands();

  // Apply client-side filtering and sorting
  final filtered = bands.where((band) {
    // Genre filter
    if (filters.genres.isNotEmpty) {
      if (band.genre == null || !filters.genres.contains(band.genre)) {
        return false;
      }
    }

    // Hometown filter
    if (filters.hometowns.isNotEmpty && band.hometown != null) {
      if (!filters.hometowns.contains(band.hometown)) {
        return false;
      }
    }

    // Rating filter
    if (filters.minRating != null) {
      if (band.averageRating < filters.minRating!) {
        return false;
      }
    }

    return true;
  }).toList();

  // Apply sorting
  switch (filters.sortBy) {
    case BandSortBy.nameAsc:
      filtered.sort((a, b) => a.name.compareTo(b.name));
      break;
    case BandSortBy.nameDesc:
      filtered.sort((a, b) => b.name.compareTo(a.name));
      break;
    case BandSortBy.ratingDesc:
      filtered.sort((a, b) => b.averageRating.compareTo(a.averageRating));
      break;
    case BandSortBy.ratingAsc:
      filtered.sort((a, b) => a.averageRating.compareTo(b.averageRating));
      break;
    case BandSortBy.reviewCountDesc:
      filtered.sort((a, b) => b.totalReviews.compareTo(a.totalReviews));
      break;
    case BandSortBy.formedYearDesc:
      filtered.sort((a, b) {
        final aYear = a.formedYear ?? 0;
        final bYear = b.formedYear ?? 0;
        return bYear.compareTo(aYear);
      });
      break;
    case BandSortBy.formedYearAsc:
      filtered.sort((a, b) {
        final aYear = a.formedYear ?? 9999;
        final bYear = b.formedYear ?? 9999;
        return aYear.compareTo(bYear);
      });
      break;
  }

  return filtered;
});

class BandsScreen extends ConsumerWidget {
  const BandsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bandsAsync = ref.watch(filteredBandsProvider);
    final filters = ref.watch(bandFiltersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Bands'),
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
                    builder: (context) => const BandFiltersSheet(),
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
                    if (filters.genres.isNotEmpty)
                      ...filters.genres.map(
                        (genre) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Chip(
                            label: Text(genre),
                            deleteIcon: const Icon(Icons.close, size: 16),
                            onDeleted: () {
                              ref
                                  .read(bandFiltersProvider.notifier)
                                  .toggleGenre(genre);
                            },
                          ),
                        ),
                      ),
                    if (filters.minRating != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Chip(
                          label: Text(
                              '${filters.minRating!.toStringAsFixed(1)}+ stars',),
                          deleteIcon: const Icon(Icons.close, size: 16),
                          onDeleted: () {
                            ref
                                .read(bandFiltersProvider.notifier)
                                .setMinRating(null);
                          },
                        ),
                      ),
                    if (filters.hometowns.isNotEmpty)
                      ...filters.hometowns.map(
                        (hometown) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Chip(
                            label: Text(hometown),
                            deleteIcon: const Icon(Icons.close, size: 16),
                            onDeleted: () {
                              ref
                                  .read(bandFiltersProvider.notifier)
                                  .toggleHometown(hometown);
                            },
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          Expanded(
            child: bandsAsync.when(
              data: (bands) => RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(filteredBandsProvider);
                },
                child: bands.isEmpty
                    ? filters.hasActiveFilters
                        ? EmptyStateWidget(
                            type: EmptyStateType.noSearchResults,
                            customTitle: 'No Bands Found',
                            customMessage:
                                'No bands match your current filters. Try adjusting your filter criteria.',
                            actionLabel: 'Clear Filters',
                            onAction: () => ref
                                .read(bandFiltersProvider.notifier)
                                .clearAll(),
                          )
                        : EmptyStateWidget(
                            type: EmptyStateType.noBands,
                            onAction: () =>
                                ref.invalidate(filteredBandsProvider),
                          )
                    : ListView.builder(
                        padding: const EdgeInsets.all(AppTheme.spacing16),
                        itemCount: bands.length,
                        itemBuilder: (context, index) {
                          return BandCard(
                            band: bands[index],
                            onTap: () =>
                                context.push('/bands/${bands[index].id}'),
                          );
                        },
                      ),
              ),
              loading: () => ListView.builder(
                padding: const EdgeInsets.all(AppTheme.spacing16),
                itemCount: 5,
                itemBuilder: (context, index) => const BandCardSkeleton(),
              ),
              error: (error, stackTrace) => ErrorStateWidget(
                error: error,
                stackTrace: stackTrace,
                onRetry: () => ref.invalidate(filteredBandsProvider),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
