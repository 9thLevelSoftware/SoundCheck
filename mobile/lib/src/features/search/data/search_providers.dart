import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../core/providers/providers.dart';
import '../../venues/domain/venue.dart';
import '../../bands/domain/band.dart';

part 'search_providers.g.dart';

@riverpod
class SearchQuery extends _$SearchQuery {
  @override
  String build() => '';

  void setQuery(String query) {
    state = query;
  }
}

/// Search filter type provider
enum SearchFilter { all, venues, bands }

@riverpod
class SearchFilterState extends _$SearchFilterState {
  @override
  SearchFilter build() => SearchFilter.all;

  void setFilter(SearchFilter filter) {
    state = filter;
  }
}

@riverpod
Future<List<Venue>> venueSearch(Ref ref) async {
  final query = ref.watch(searchQueryProvider);
  final filter = ref.watch(searchFilterStateProvider);

  if (query.trim().isEmpty || filter == SearchFilter.bands) {
    return [];
  }

  final repository = ref.watch(venueRepositoryProvider);
  return repository.getVenues(search: query, limit: 50);
}

@riverpod
Future<List<Band>> bandSearch(Ref ref) async {
  final query = ref.watch(searchQueryProvider);
  final filter = ref.watch(searchFilterStateProvider);

  if (query.trim().isEmpty || filter == SearchFilter.venues) {
    return [];
  }

  final repository = ref.watch(bandRepositoryProvider);
  return repository.getBands(search: query, limit: 50);
}

/// Combined search results
class SearchResults {
  final List<Venue> venues;
  final List<Band> bands;
  final bool isLoading;
  final Object? error;

  SearchResults({
    required this.venues,
    required this.bands,
    this.isLoading = false,
    this.error,
  });

  bool get isEmpty => venues.isEmpty && bands.isEmpty;
  int get totalCount => venues.length + bands.length;
}

@riverpod
SearchResults combinedSearchResults(Ref ref) {
  final venueResults = ref.watch(venueSearchProvider);
  final bandResults = ref.watch(bandSearchProvider);

  final isLoading = venueResults.isLoading || bandResults.isLoading;
  final hasError = venueResults.hasError || bandResults.hasError;

  return SearchResults(
    venues: venueResults.value ?? [],
    bands: bandResults.value ?? [],
    isLoading: isLoading,
    error: hasError ? (venueResults.error ?? bandResults.error) : null,
  );
}
