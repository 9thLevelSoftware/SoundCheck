import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../../core/providers/providers.dart';
import '../../../bands/domain/band.dart';
import '../../../venues/domain/venue.dart';
import '../../../auth/domain/user.dart';

part 'discover_providers.g.dart';

/// Search query state for the discover screen
/// Separate from the main SearchQuery to avoid conflicts
@riverpod
class DiscoverSearchQuery extends _$DiscoverSearchQuery {
  @override
  String build() => '';

  void setQuery(String query) {
    state = query;
  }

  void clear() {
    state = '';
  }
}

/// Combined search results for discover screen
class DiscoverSearchResults {
  final List<Band> bands;
  final List<Venue> venues;
  final List<User> users;
  final bool isLoading;
  final Object? error;

  const DiscoverSearchResults({
    required this.bands,
    required this.venues,
    required this.users,
    this.isLoading = false,
    this.error,
  });

  factory DiscoverSearchResults.empty() => const DiscoverSearchResults(
    bands: [],
    venues: [],
    users: [],
  );

  factory DiscoverSearchResults.loading() => const DiscoverSearchResults(
    bands: [],
    venues: [],
    users: [],
    isLoading: true,
  );

  bool get isEmpty => bands.isEmpty && venues.isEmpty && users.isEmpty;
  int get totalCount => bands.length + venues.length + users.length;
}

/// Provider for band search results in discover
@riverpod
Future<List<Band>> discoverBandSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  final repository = ref.watch(bandRepositoryProvider);
  return repository.getBands(search: query, limit: 10);
}

/// Provider for venue search results in discover
@riverpod
Future<List<Venue>> discoverVenueSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  final repository = ref.watch(venueRepositoryProvider);
  return repository.getVenues(search: query, limit: 10);
}

/// Provider for user search results in discover
/// Note: This requires a user search API endpoint. For now, returns empty list.
/// TODO: Implement user search when API endpoint is available
@riverpod
Future<List<User>> discoverUserSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  // User search will need to be implemented when the API supports it
  // For now, return empty list
  return [];
}

/// Combined search results provider with debouncing
@riverpod
DiscoverSearchResults discoverSearchResults(Ref ref) {
  final query = ref.watch(discoverSearchQueryProvider);

  // Show empty state for short queries
  if (query.length < 2) {
    return DiscoverSearchResults.empty();
  }

  final bandsAsync = ref.watch(discoverBandSearchProvider);
  final venuesAsync = ref.watch(discoverVenueSearchProvider);
  final usersAsync = ref.watch(discoverUserSearchProvider);

  final isLoading = bandsAsync.isLoading ||
                    venuesAsync.isLoading ||
                    usersAsync.isLoading;

  final hasError = bandsAsync.hasError ||
                   venuesAsync.hasError ||
                   usersAsync.hasError;

  if (isLoading && bandsAsync.value == null && venuesAsync.value == null) {
    return DiscoverSearchResults.loading();
  }

  return DiscoverSearchResults(
    bands: bandsAsync.value ?? [],
    venues: venuesAsync.value ?? [],
    users: usersAsync.value ?? [],
    isLoading: isLoading,
    error: hasError ? (bandsAsync.error ?? venuesAsync.error ?? usersAsync.error) : null,
  );
}
