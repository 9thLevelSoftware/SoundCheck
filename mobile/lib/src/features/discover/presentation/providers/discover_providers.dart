import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../../core/providers/providers.dart';
import '../../../bands/domain/band.dart';
import '../../../venues/domain/venue.dart';
import '../../../auth/domain/user.dart';
import '../../domain/discovery_models.dart';

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
  final List<DiscoverEvent> events;
  final bool isLoading;
  final Object? error;

  const DiscoverSearchResults({
    required this.bands,
    required this.venues,
    required this.users,
    required this.events,
    this.isLoading = false,
    this.error,
  });

  factory DiscoverSearchResults.empty() => const DiscoverSearchResults(
    bands: [],
    venues: [],
    users: [],
    events: [],
  );

  factory DiscoverSearchResults.loading() => const DiscoverSearchResults(
    bands: [],
    venues: [],
    users: [],
    events: [],
    isLoading: true,
  );

  bool get isEmpty => bands.isEmpty && venues.isEmpty && users.isEmpty && events.isEmpty;
  int get totalCount => bands.length + venues.length + users.length + events.length;
}

/// Provider for band search results in discover (debounced)
@riverpod
Future<List<Band>> discoverBandSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  // Debounce: wait 300ms after last keystroke before firing API call
  await Future<void>.delayed(const Duration(milliseconds: 300));
  // If query changed during the delay, Riverpod will cancel this provider
  // rebuild and start a new one with the latest value
  if (ref.watch(discoverSearchQueryProvider) != query) return [];

  final repository = ref.watch(bandRepositoryProvider);
  final result = await repository.getBands(search: query, limit: 10);
  return result.fold(
    (failure) => [],
    (bands) => bands,
  );
}

/// Provider for venue search results in discover (debounced)
@riverpod
Future<List<Venue>> discoverVenueSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  await Future<void>.delayed(const Duration(milliseconds: 300));
  if (ref.watch(discoverSearchQueryProvider) != query) return [];

  final repository = ref.watch(venueRepositoryProvider);
  final paginatedResult = await repository.getVenues(search: query, page: 1, limit: 10);
  return paginatedResult.venues;
}

/// User search result model for discover
class UserSearchResult {
  final String id;
  final String username;
  final String? displayName;
  final String? profileImageUrl;
  final String? bio;

  const UserSearchResult({
    required this.id,
    required this.username,
    this.displayName,
    this.profileImageUrl,
    this.bio,
  });

  factory UserSearchResult.fromJson(Map<String, dynamic> json) {
    return UserSearchResult(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String?,
      profileImageUrl: json['profileImageUrl'] as String?,
      bio: json['bio'] as String?,
    );
  }

  /// Convert to User for compatibility with existing code
  User toUser() {
    return User(
      id: id,
      email: '', // Not returned by search
      username: username,
      isVerified: false,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      firstName: displayName?.split(' ').firstOrNull,
      lastName: displayName?.split(' ').skip(1).join(' '),
      bio: bio,
      profileImageUrl: profileImageUrl,
    );
  }
}

/// Provider for user search results in discover (debounced)
@riverpod
Future<List<User>> discoverUserSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  await Future<void>.delayed(const Duration(milliseconds: 300));
  if (ref.watch(discoverSearchQueryProvider) != query) return [];

  final dioClient = ref.watch(dioClientProvider);

  try {
    final response = await dioClient.get(
      '/search/users',
      queryParameters: {
        'q': query,
        'limit': 10,
      },
    );

    if (response.data['success'] == true && response.data['data'] != null) {
      return (response.data['data'] as List)
          .map((json) => UserSearchResult.fromJson(json as Map<String, dynamic>).toUser())
          .toList();
    }

    return [];
  } catch (e) {
    // Return empty list on error - error will be shown via combined results
    return [];
  }
}

/// Provider for event search results in discover (debounced)
@riverpod
Future<List<DiscoverEvent>> discoverEventSearch(Ref ref) async {
  final query = ref.watch(discoverSearchQueryProvider);
  if (query.length < 2) return [];

  await Future<void>.delayed(const Duration(milliseconds: 300));
  if (ref.watch(discoverSearchQueryProvider) != query) return [];

  final repository = ref.watch(discoveryRepositoryProvider);

  try {
    final result = await repository.searchEvents(query: query, limit: 10);
    return result.fold(
      (failure) => [],
      (events) => events,
    );
  } catch (e) {
    return [];
  }
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
  final eventsAsync = ref.watch(discoverEventSearchProvider);

  final isLoading = bandsAsync.isLoading ||
                    venuesAsync.isLoading ||
                    usersAsync.isLoading ||
                    eventsAsync.isLoading;

  final hasError = bandsAsync.hasError ||
                   venuesAsync.hasError ||
                   usersAsync.hasError ||
                   eventsAsync.hasError;

  if (isLoading && bandsAsync.value == null && venuesAsync.value == null && eventsAsync.value == null) {
    return DiscoverSearchResults.loading();
  }

  return DiscoverSearchResults(
    bands: bandsAsync.value ?? [],
    venues: venuesAsync.value ?? [],
    users: usersAsync.value ?? [],
    events: eventsAsync.value ?? [],
    isLoading: isLoading,
    error: hasError ? (bandsAsync.error ?? venuesAsync.error ?? usersAsync.error ?? eventsAsync.error) : null,
  );
}

// ============================================
// Event Discovery Providers (Phase 7)
// ============================================

/// Personalized event recommendations based on genre affinity + friend attendance + trending.
/// Falls back to trending events for new users (cold start handled server-side).
@riverpod
Future<List<DiscoverEvent>> recommendedEvents(Ref ref) async {
  final position = await ref.watch(currentLocationProvider.future);
  final repository = ref.watch(discoveryRepositoryProvider);

  try {
    if (position != null) {
      final result = await repository.getRecommendations(
        lat: position.latitude,
        lon: position.longitude,
        radiusKm: 50,
        limit: 15,
      );
      return result.fold(
        (failure) => [],
        (events) => events,
      );
    } else {
      final result = await repository.getRecommendations(limit: 15);
      return result.fold(
        (failure) => [],
        (events) => events,
      );
    }
  } catch (e) {
    // Graceful degradation: return empty list on error (section hides itself)
    return [];
  }
}

/// Nearby upcoming events based on user GPS location
@riverpod
Future<List<DiscoverEvent>> nearbyUpcomingEvents(Ref ref) async {
  final position = await ref.watch(currentLocationProvider.future);
  if (position == null) return [];

  final repository = ref.watch(discoveryRepositoryProvider);
  final result = await repository.getNearbyUpcoming(
    lat: position.latitude,
    lon: position.longitude,
    radiusKm: 50,
    days: 30,
    limit: 20,
  );
  return result.fold(
    (failure) => [],
    (events) => events,
  );
}

/// Trending events near user (sorted by recent check-in count)
@riverpod
Future<List<DiscoverEvent>> trendingNearbyEvents(Ref ref) async {
  final position = await ref.watch(currentLocationProvider.future);
  if (position == null) return [];

  final repository = ref.watch(discoveryRepositoryProvider);
  final result = await repository.getTrendingNearby(
    lat: position.latitude,
    lon: position.longitude,
    radiusKm: 50,
    limit: 20,
  );
  return result.fold(
    (failure) => [],
    (events) => events,
  );
}

/// Available genres list (from bands endpoint)
@riverpod
Future<List<String>> genreList(Ref ref) async {
  final repository = ref.watch(bandRepositoryProvider);
  final result = await repository.getGenres();
  return result.fold(
    (failure) => [],
    (genres) => genres,
  );
}

/// Events filtered by genre (family provider)
@riverpod
Future<List<DiscoverEvent>> genreEvents(Ref ref, String genre) async {
  final repository = ref.watch(discoveryRepositoryProvider);
  final result = await repository.getEventsByGenre(genre: genre, limit: 20);
  return result.fold(
    (failure) => [],
    (events) => events,
  );
}
