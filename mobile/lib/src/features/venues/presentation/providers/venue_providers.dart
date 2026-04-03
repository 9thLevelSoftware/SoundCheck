import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../../../core/error/failures.dart';
import '../../domain/venue.dart';
import '../venue_filters_state.dart';

part 'venue_providers.g.dart';

/// State for paginated venues with infinite scroll
class VenuePaginationState {
  const VenuePaginationState({
    this.venues = const [],
    this.currentPage = 0,
    this.hasMore = true,
    this.isLoading = false,
    this.error,
    this.filters = const VenueFiltersState(),
  });

  final List<Venue> venues;
  final int currentPage;
  final bool hasMore;
  final bool isLoading;
  final Failure? error;
  final VenueFiltersState filters;

  VenuePaginationState copyWith({
    List<Venue>? venues,
    int? currentPage,
    bool? hasMore,
    bool? isLoading,
    Failure? error,
    VenueFiltersState? filters,
  }) {
    return VenuePaginationState(
      venues: venues ?? this.venues,
      currentPage: currentPage ?? this.currentPage,
      hasMore: hasMore ?? this.hasMore,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      filters: filters ?? this.filters,
    );
  }
}

/// Provider for paginated venues with infinite scroll support
/// Uses server-side pagination to avoid loading all venues into memory
@riverpod
class PaginatedVenuesNotifier extends _$PaginatedVenuesNotifier {
  static const int _pageSize = 20;

  @override
  VenuePaginationState build() {
    // Load initial page when provider is first accessed
    Future.microtask(() => loadMore());
    
    return const VenuePaginationState(
      venues: [],
      currentPage: 0,
      hasMore: true,
      isLoading: false,
      filters: VenueFiltersState(),
    );
  }

  /// Load the next page of venues
  Future<void> loadMore() async {
    if (state.isLoading || !state.hasMore) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final repository = ref.read(venueRepositoryProvider);
      final result = await repository.getVenues(
        search: null, // Search is handled separately via a different provider if needed
        city: state.filters.cities.isNotEmpty ? state.filters.cities.first : null,
        venueType: state.filters.venueTypes.isNotEmpty ? state.filters.venueTypes.first.name : null,
        minRating: state.filters.minRating,
        minCapacity: state.filters.minCapacity,
        maxCapacity: state.filters.maxCapacity,
        sortBy: state.filters.sortBy.apiValue,
        page: state.currentPage + 1,
        limit: _pageSize,
      );

      state = state.copyWith(
        venues: [...state.venues, ...result.venues],
        currentPage: state.currentPage + 1,
        hasMore: result.venues.length == _pageSize && state.currentPage + 1 < result.totalPages,
        isLoading: false,
        error: null,
      );
    } on Failure catch (failure) {
      state = state.copyWith(
        isLoading: false,
        error: failure,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: UnknownFailure(e.toString()),
      );
    }
  }

  /// Refresh venues with current filters (reset pagination)
  Future<void> refresh() async {
    state = state.copyWith(
      venues: [],
      currentPage: 0,
      hasMore: true,
      isLoading: true,
      error: null,
    );
    await loadMore();
  }

  /// Update filters and reload venues with server-side filtering
  void updateFilters(VenueFiltersState newFilters) {
    if (newFilters == state.filters) return;

    // Reset pagination when filters change
    state = VenuePaginationState(
      venues: [],
      currentPage: 0,
      hasMore: true,
      isLoading: true,
      filters: newFilters,
    );

    // Load first page with new filters
    loadMore();
  }

  /// Search venues by query text
  void search(String query) {
    // Note: For search, we might want a separate notifier
    // This is a placeholder for future search functionality
    refresh();
  }
}

/// Provider for filtered venues using the paginated notifier
/// This replaces the old allVenuesProvider that loaded everything
@riverpod
Stream<List<Venue>> paginatedVenuesStream(Ref ref) async* {
  final state = ref.watch(paginatedVenuesProvider);
  yield state.venues;
}
