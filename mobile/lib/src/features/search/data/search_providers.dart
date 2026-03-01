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
enum SearchFilter { all, venues, bands, events, users }

@riverpod
class SearchFilterState extends _$SearchFilterState {
  @override
  SearchFilter build() => SearchFilter.all;

  void setFilter(SearchFilter filter) {
    state = filter;
  }
}

/// Unified search results from GET /api/search?q=X&limit=10.
/// Returns categorized bands, venues, and events in a single response.
@riverpod
Future<SearchResults> unifiedSearch(Ref ref) async {
  final query = ref.watch(searchQueryProvider);
  final filter = ref.watch(searchFilterStateProvider);

  if (query.trim().isEmpty || query.trim().length < 2) {
    return SearchResults.empty();
  }

  final dioClient = ref.watch(dioClientProvider);

  // Build types parameter based on active filter
  String types;
  switch (filter) {
    case SearchFilter.bands:
      types = 'band';
    case SearchFilter.venues:
      types = 'venue';
    case SearchFilter.events:
      types = 'event';
    case SearchFilter.users:
      types = 'user';
    case SearchFilter.all:
      types = 'band,venue,event,user';
  }

  try {
    final response = await dioClient.get(
      '/search',
      queryParameters: {
        'q': query.trim(),
        'types': types,
        'limit': 10,
      },
    );

    final data = response.data['data'] as Map<String, dynamic>;
    return SearchResults.fromJson(data);
  } catch (e) {
    // Rethrow so the provider error state is set
    rethrow;
  }
}

/// Combined search results (backward-compatible wrapper around unified search).
/// Used by search_screen.dart.
@riverpod
SearchResults combinedSearchResults(Ref ref) {
  final unifiedAsync = ref.watch(unifiedSearchProvider);

  return unifiedAsync.when(
    data: (results) => results,
    loading: () => SearchResults(
      venues: [],
      bands: [],
      events: [],
      users: [],
      isLoading: true,
    ),
    error: (error, _) => SearchResults(
      venues: [],
      bands: [],
      events: [],
      users: [],
      error: error,
    ),
  );
}

/// Lightweight search result model for events returned by unified search.
class SearchEvent {
  final String id;
  final String? eventName;
  final String? eventDate;
  final String? venueName;
  final String? venueCity;

  const SearchEvent({
    required this.id,
    this.eventName,
    this.eventDate,
    this.venueName,
    this.venueCity,
  });

  factory SearchEvent.fromJson(Map<String, dynamic> json) {
    // Handle nested venue object or flat fields
    final venue = json['venue'] as Map<String, dynamic>?;
    return SearchEvent(
      id: json['id'] as String,
      eventName: json['eventName'] as String? ?? json['event_name'] as String?,
      eventDate:
          json['eventDate']?.toString() ?? json['event_date']?.toString(),
      venueName: venue?['name'] as String? ?? json['venueName'] as String?,
      venueCity: venue?['city'] as String? ?? json['venueCity'] as String?,
    );
  }
}

/// Lightweight search result model for users returned by unified search.
class SearchUser {
  final String id;
  final String username;
  final String displayName;
  final String? profileImageUrl;
  final String? bio;
  final int totalCheckins;
  final bool isVerified;

  const SearchUser({
    required this.id,
    required this.username,
    required this.displayName,
    this.profileImageUrl,
    this.bio,
    this.totalCheckins = 0,
    this.isVerified = false,
  });

  factory SearchUser.fromJson(Map<String, dynamic> json) => SearchUser(
        id: json['id'] as String,
        username: json['username'] as String,
        displayName:
            json['displayName'] as String? ?? json['username'] as String,
        profileImageUrl: json['profileImageUrl'] as String?,
        bio: json['bio'] as String?,
        totalCheckins: json['totalCheckins'] as int? ?? 0,
        isVerified: json['isVerified'] as bool? ?? false,
      );
}

/// Combined search results with categorized bands, venues, events, and users.
class SearchResults {
  final List<Venue> venues;
  final List<Band> bands;
  final List<SearchEvent> events;
  final List<SearchUser> users;
  final bool isLoading;
  final Object? error;

  SearchResults({
    required this.venues,
    required this.bands,
    required this.events,
    required this.users,
    this.isLoading = false,
    this.error,
  });

  factory SearchResults.empty() => SearchResults(
        venues: [],
        bands: [],
        events: [],
        users: [],
      );

  factory SearchResults.fromJson(Map<String, dynamic> json) {
    return SearchResults(
      bands: (json['bands'] as List<dynamic>?)
              ?.map((e) => Band.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      venues: (json['venues'] as List<dynamic>?)
              ?.map((e) => Venue.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      events: (json['events'] as List<dynamic>?)
              ?.map((e) => SearchEvent.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      users: (json['users'] as List<dynamic>?)
              ?.map((e) => SearchUser.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  bool get isEmpty =>
      venues.isEmpty && bands.isEmpty && events.isEmpty && users.isEmpty;
  int get totalCount =>
      venues.length + bands.length + events.length + users.length;
}
