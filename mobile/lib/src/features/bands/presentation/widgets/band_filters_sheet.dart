import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_theme.dart';
import '../band_filters_notifier.dart';
import '../band_filters_state.dart';

class BandFiltersSheet extends ConsumerWidget {
  const BandFiltersSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filters = ref.watch(bandFiltersProvider);
    final notifier = ref.read(bandFiltersProvider.notifier);
    final genresAsync = ref.watch(availableGenresProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        return Container(
          decoration: BoxDecoration(
            color: isDark ? AppTheme.surfaceDark : Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.only(top: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? AppTheme.textMuted : Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.all(AppTheme.spacing16),
                child: Row(
                  children: [
                    const Text(
                      'Filters & Sort',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Spacer(),
                    if (filters.hasActiveFilters)
                      TextButton(
                        onPressed: notifier.clearAll,
                        child: const Text('Clear All'),
                      ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              // Content
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(AppTheme.spacing16),
                  children: [
                    // Sort By Section
                    _buildSortBySection(context, filters, notifier),
                    const SizedBox(height: AppTheme.spacing24),

                    // Genre Filter
                    genresAsync.when(
                      data: (genres) => _buildGenreSection(
                        context,
                        filters,
                        notifier,
                        genres,
                      ),
                      loading: () => const Center(
                        child: CircularProgressIndicator(),
                      ),
                      error: (error, stack) => const Text('Failed to load genres'),
                    ),
                    const SizedBox(height: AppTheme.spacing24),

                    // Rating Filter
                    _buildRatingSection(context, filters, notifier),
                    const SizedBox(height: AppTheme.spacing24),
                  ],
                ),
              ),
              // Apply Button
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(AppTheme.spacing16),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(context),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: const Text('Apply Filters'),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSortBySection(
    BuildContext context,
    BandFiltersState filters,
    BandFilters notifier,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Sort By',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppTheme.spacing12),
        RadioGroup<BandSortBy>(
          groupValue: filters.sortBy,
          onChanged: (value) {
            if (value != null) {
              notifier.setSortBy(value);
            }
          },
          child: Column(
            children: BandSortBy.values.map((sortOption) {
              return ListTile(
                title: Text(sortOption.label),
                leading: Radio<BandSortBy>(value: sortOption),
                contentPadding: EdgeInsets.zero,
                dense: true,
                onTap: () => notifier.setSortBy(sortOption),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildGenreSection(
    BuildContext context,
    BandFiltersState filters,
    BandFilters notifier,
    List<String> genres,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Genre',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppTheme.spacing12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: genres.map((genre) {
            final isSelected = filters.genres.contains(genre);
            return FilterChip(
              label: Text(genre),
              selected: isSelected,
              onSelected: (selected) {
                notifier.toggleGenre(genre);
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildRatingSection(
    BuildContext context,
    BandFiltersState filters,
    BandFilters notifier,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Minimum Rating',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Spacer(),
            if (filters.minRating != null)
              Text(
                '${filters.minRating!.toStringAsFixed(1)} stars',
                style: const TextStyle(
                  fontWeight: FontWeight.w500,
                  color: AppTheme.primary,
                ),
              ),
          ],
        ),
        const SizedBox(height: AppTheme.spacing12),
        Slider(
          value: filters.minRating ?? 0,
          min: 0,
          max: 5,
          divisions: 10,
          label: filters.minRating?.toStringAsFixed(1) ?? '0.0',
          onChanged: (value) {
            notifier.setMinRating(value == 0 ? null : value);
          },
        ),
        if (filters.minRating != null)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: () => notifier.setMinRating(null),
              child: const Text('Clear'),
            ),
          ),
      ],
    );
  }
}
