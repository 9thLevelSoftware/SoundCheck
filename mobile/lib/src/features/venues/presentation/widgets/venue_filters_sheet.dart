import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/venue.dart';
import '../venue_filters_notifier.dart';
import '../venue_filters_state.dart';

class VenueFiltersSheet extends ConsumerWidget {
  const VenueFiltersSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filters = ref.watch(venueFiltersProvider);
    final notifier = ref.read(venueFiltersProvider.notifier);

    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        final isDark = Theme.of(context).brightness == Brightness.dark;
        return Container(
          decoration: BoxDecoration(
            color: isDark ? Theme.of(context).colorScheme.surface : Colors.white,
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

                    // Venue Type Filter
                    _buildVenueTypeSection(context, filters, notifier),
                    const SizedBox(height: AppTheme.spacing24),

                    // Rating Filter
                    _buildRatingSection(context, filters, notifier),
                    const SizedBox(height: AppTheme.spacing24),

                    // Capacity Filter
                    _buildCapacitySection(context, filters, notifier),
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
    VenueFiltersState filters,
    VenueFilters notifier,
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
        RadioGroup<VenueSortBy>(
          groupValue: filters.sortBy,
          onChanged: (value) {
            if (value != null) {
              notifier.setSortBy(value);
            }
          },
          child: Column(
            children: VenueSortBy.values.map((sortOption) {
              return ListTile(
                title: Text(sortOption.label),
                leading: Radio<VenueSortBy>(value: sortOption),
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

  Widget _buildVenueTypeSection(
    BuildContext context,
    VenueFiltersState filters,
    VenueFilters notifier,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Venue Type',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppTheme.spacing12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: VenueType.values.map((type) {
            final isSelected = filters.venueTypes.contains(type);
            return FilterChip(
              label: Text(_venueTypeLabel(type)),
              selected: isSelected,
              onSelected: (selected) {
                notifier.toggleVenueType(type);
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildRatingSection(
    BuildContext context,
    VenueFiltersState filters,
    VenueFilters notifier,
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

  Widget _buildCapacitySection(
    BuildContext context,
    VenueFiltersState filters,
    VenueFilters notifier,
  ) {
    final minController = TextEditingController(
      text: filters.minCapacity?.toString() ?? '',
    );
    final maxController = TextEditingController(
      text: filters.maxCapacity?.toString() ?? '',
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Capacity Range',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppTheme.spacing12),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: minController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Min',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (value) {
                  final min = int.tryParse(value);
                  notifier.setCapacityRange(
                    min: min,
                    max: filters.maxCapacity,
                  );
                },
              ),
            ),
            const SizedBox(width: AppTheme.spacing16),
            Expanded(
              child: TextField(
                controller: maxController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Max',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                onChanged: (value) {
                  final max = int.tryParse(value);
                  notifier.setCapacityRange(
                    min: filters.minCapacity,
                    max: max,
                  );
                },
              ),
            ),
          ],
        ),
        if (filters.minCapacity != null || filters.maxCapacity != null)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: () => notifier.setCapacityRange(min: null, max: null),
              child: const Text('Clear'),
            ),
          ),
      ],
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
