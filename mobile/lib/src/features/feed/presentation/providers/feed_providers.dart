import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';
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

/// Event feed parameterized by eventId with cursor pagination
@riverpod
class EventFeedNotifier extends _$EventFeedNotifier {
  String? _nextCursor;
  bool _hasMore = true;
  List<FeedItem> _items = [];

  @override
  Future<List<FeedItem>> build(String eventId) async {
    _nextCursor = null;
    _hasMore = true;
    _items = [];
    return _fetchPage(eventId);
  }

  Future<List<FeedItem>> _fetchPage(String eventId) async {
    final repo = ref.read(feedRepositoryProvider);
    final page = await repo.getEventFeed(eventId, cursor: _nextCursor);
    _nextCursor = page.nextCursor;
    _hasMore = page.hasMore;
    _items = [..._items, ...page.items];
    return _items;
  }

  Future<void> loadMore() async {
    if (!_hasMore) return;
    final eventId = this.eventId;
    state = AsyncValue.data(await _fetchPage(eventId));
  }
}

/// Events feed overview -- shows shared experiences at events user has attended
/// For now returns empty; populated when user navigates to an event's feed
@riverpod
class EventsFeedNotifier extends _$EventsFeedNotifier {
  @override
  Future<List<FeedItem>> build() async {
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

/// Active event IDs cache -- events the current user has checked into today
/// Used for O(1) same-event detection when WebSocket events arrive
@riverpod
class ActiveEventIds extends _$ActiveEventIds {
  @override
  Set<String> build() => {};

  void addEventId(String eventId) {
    state = {...state, eventId};
  }

  void setEventIds(Set<String> ids) {
    state = ids;
  }

  bool isAtEvent(String eventId) => state.contains(eventId);
}

/// Mixin for feed screens that need WebSocket listeners
/// Provides new_checkin and same_event_checkin handling
///
/// Usage: mix into ConsumerStatefulWidget state, call
/// initFeedWebSocketListeners() in initState and
/// disposeFeedWebSocketListeners() in dispose.
mixin FeedWebSocketListenerMixin<T extends ConsumerStatefulWidget>
    on ConsumerState<T> {
  StreamSubscription<Map<String, dynamic>>? _newCheckinSub;
  StreamSubscription<Map<String, dynamic>>? _sameEventSub;

  /// Start listening to WebSocket feed events
  void initFeedWebSocketListeners() {
    final wsService = ref.read(webSocketServiceProvider);

    // Listen for new check-in events from friends
    _newCheckinSub = wsService.newCheckinStream.listen((payload) {
      // Increment the new checkin banner count
      ref.read(newCheckinCountProvider.notifier).increment();

      // Refresh happening now (live updates)
      ref.invalidate(happeningNowProvider);

      // Refresh unseen counts
      ref.invalidate(unseenCountsProvider);
    });

    // Listen for same-event check-in events ("Alex is here too!")
    _sameEventSub = wsService.sameEventCheckinStream.listen((payload) {
      final username = payload['username'] as String? ?? 'Someone';
      _showSameEventAlert(username);

      // Also count as a new checkin
      ref.read(newCheckinCountProvider.notifier).increment();
      ref.invalidate(happeningNowProvider);
      ref.invalidate(unseenCountsProvider);
    });
  }

  /// Show "Alex is here too!" alert as a prominent SnackBar
  void _showSameEventAlert(String username) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            const Icon(
              Icons.celebration,
              color: AppTheme.toastGold,
              size: 24,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '$username is here too!',
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: AppTheme.cardDark,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(
            color: AppTheme.toastGold,
            width: 1.5,
          ),
        ),
        duration: const Duration(seconds: 4),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  /// Clean up WebSocket subscriptions
  void disposeFeedWebSocketListeners() {
    _newCheckinSub?.cancel();
    _sameEventSub?.cancel();
  }
}
