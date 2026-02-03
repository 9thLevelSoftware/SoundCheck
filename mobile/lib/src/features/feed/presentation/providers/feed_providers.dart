import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../domain/feed_item.dart';
import '../../domain/happening_now_group.dart';

// Re-export feedRepositoryProvider so feed screen can access it
export '../../../../core/providers/providers.dart' show feedRepositoryProvider;

part 'feed_providers.g.dart';

/// Friends feed with cursor-based pagination
@riverpod
class FriendsFeedNotifier extends _$FriendsFeedNotifier {
  String? _nextCursor;
  bool _hasMore = true;
  List<FeedItem> _items = [];

  @override
  Future<List<FeedItem>> build() async {
    _nextCursor = null;
    _hasMore = true;
    _items = [];
    return _fetchPage();
  }

  Future<List<FeedItem>> _fetchPage() async {
    final repo = ref.read(feedRepositoryProvider);
    final page = await repo.getFriendsFeed(cursor: _nextCursor);
    _nextCursor = page.nextCursor;
    _hasMore = page.hasMore;
    _items = [..._items, ...page.items];
    return _items;
  }

  Future<void> loadMore() async {
    if (!_hasMore) return;
    state = AsyncValue.data(await _fetchPage());
  }

  void prependItems(List<FeedItem> newItems) {
    _items = [...newItems, ..._items];
    state = AsyncValue.data(_items);
  }
}

/// Events feed -- shows check-ins at events the user has attended
/// For now, uses the friends feed endpoint; will be parameterized by eventId later
@riverpod
class EventsFeedNotifier extends _$EventsFeedNotifier {
  @override
  Future<List<FeedItem>> build() async {
    // Events tab shows shared experiences -- for now return empty
    // Will be populated when user taps an event name to view that event's feed
    return [];
  }
}

/// Happening Now -- friends grouped by event
@riverpod
Future<List<HappeningNowGroup>> happeningNow(Ref ref) async {
  final repo = ref.watch(feedRepositoryProvider);
  return repo.getHappeningNow();
}

/// Unseen counts per feed tab
@riverpod
Future<UnseenCounts> unseenCounts(Ref ref) async {
  final repo = ref.watch(feedRepositoryProvider);
  return repo.getUnseenCounts();
}

/// New checkin count -- tracks WebSocket arrivals since last feed refresh
@riverpod
class NewCheckinCount extends _$NewCheckinCount {
  @override
  int build() => 0;

  void increment() => state++;
  void reset() => state = 0;
}
