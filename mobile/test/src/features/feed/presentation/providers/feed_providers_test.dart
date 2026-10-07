import 'dart:async';

import 'package:dartz/dartz.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/core/services/websocket_service.dart';
import 'package:soundcheck_flutter/src/features/feed/data/feed_repository.dart';
import 'package:soundcheck_flutter/src/features/feed/domain/feed_item.dart';
import 'package:soundcheck_flutter/src/features/feed/domain/happening_now_group.dart';
import 'package:soundcheck_flutter/src/features/feed/presentation/providers/feed_providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('feed pagination providers', () {
    test('global feed appends pages and stops when hasMore is false', () async {
      final repository = _FeedRepository()
        ..global.addAll([
          Right(_page(['global-1'], cursor: 'next', hasMore: true)),
          Right(_page(['global-2'])),
        ]);
      final container = _container(repository);
      addTearDown(container.dispose);
      final subscription = container.listen(globalFeedProvider, (_, _) {});
      addTearDown(subscription.close);

      expect((await container.read(globalFeedProvider.future)).ids, [
        'global-1',
      ]);
      await container.read(globalFeedProvider.notifier).loadMore();
      expect(container.read(globalFeedProvider).requireValue.ids, [
        'global-1',
        'global-2',
      ]);
      await container.read(globalFeedProvider.notifier).loadMore();

      expect(repository.globalCursors, [null, 'next']);
    });

    test('global feed surfaces initial and load-more failures', () async {
      final repository = _FeedRepository()
        ..global.addAll([
          const Left(NetworkFailure('offline')),
          Right(_page(['recovered'], cursor: 'next', hasMore: true)),
          const Left(ServerFailure('timeout')),
        ]);
      final container = _container(repository);
      addTearDown(container.dispose);
      final subscription = container.listen(globalFeedProvider, (_, _) {});
      addTearDown(subscription.close);

      await expectLater(
        container.read(globalFeedProvider.future),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('offline'),
          ),
        ),
      );

      container.invalidate(globalFeedProvider);
      expect((await container.read(globalFeedProvider.future)).ids, [
        'recovered',
      ]);
      await container.read(globalFeedProvider.notifier).loadMore();
      expect(
        container.read(globalFeedProvider),
        isA<AsyncError<List<FeedItem>>>(),
      );
    });

    test(
      'friends feed prepends realtime items and fences duplicate loadMore',
      () async {
        final delayedPage = Completer<Either<Failure, FeedPage>>();
        final repository = _FeedRepository()
          ..friends.addAll([
            Right(_page(['friend-1'], cursor: 'next', hasMore: true)),
            delayedPage.future,
          ]);
        final container = _container(repository);
        addTearDown(container.dispose);
        final subscription = container.listen(friendsFeedProvider, (_, _) {});
        addTearDown(subscription.close);

        await container.read(friendsFeedProvider.future);
        final notifier = container.read(friendsFeedProvider.notifier);
        notifier.prependItems([_item('realtime')]);
        expect(container.read(friendsFeedProvider).requireValue.ids, [
          'realtime',
          'friend-1',
        ]);

        final firstLoad = notifier.loadMore();
        final duplicateLoad = notifier.loadMore();
        delayedPage.complete(Right(_page(['friend-2'])));
        await Future.wait([firstLoad, duplicateLoad]);

        expect(repository.friendsCursors, [null, 'next']);
        expect(container.read(friendsFeedProvider).requireValue.ids, [
          'realtime',
          'friend-1',
          'friend-2',
        ]);
      },
    );

    test('event notifier passes ids and cursors and appends pages', () async {
      final repository = _FeedRepository()
        ..event.addAll([
          Right(_page(['event-1'], cursor: 'event-next', hasMore: true)),
          Right(_page(['event-2'])),
        ]);
      final container = _container(repository);
      addTearDown(container.dispose);
      final eventSub = container.listen(eventFeedProvider('show-1'), (_, _) {});
      addTearDown(eventSub.close);

      await container.read(eventFeedProvider('show-1').future);
      await container.read(eventFeedProvider('show-1').notifier).loadMore();

      expect(repository.eventCalls, [
        ('show-1', null),
        ('show-1', 'event-next'),
      ]);
      expect(container.read(eventFeedProvider('show-1')).requireValue.ids, [
        'event-1',
        'event-2',
      ]);
    });
  });

  group('feed scalar and lifecycle providers', () {
    test('happening-now and unseen providers return repository data', () async {
      final repository = _FeedRepository()
        ..happening = Right([_group('event-1')])
        ..unseen = const Right(
          UnseenCounts(friends: 2, event: 3, happeningNow: 4),
        );
      final container = _container(repository);
      addTearDown(container.dispose);

      expect(
        (await container.read(happeningNowProvider.future)).single.eventId,
        'event-1',
      );
      final counts = await container.read(unseenCountsProvider.future);
      expect((counts.friends, counts.event, counts.happeningNow), (2, 3, 4));
    });

    test('happening-now and unseen providers expose failures', () async {
      final repository = _FeedRepository()
        ..happening = const Left(NetworkFailure('offline'))
        ..unseen = const Left(ServerFailure('unavailable'));
      final container = _container(repository);
      addTearDown(container.dispose);
      final happeningSubscription = container.listen(
        happeningNowProvider,
        (_, _) {},
      );
      final unseenSubscription = container.listen(
        unseenCountsProvider,
        (_, _) {},
      );
      addTearDown(happeningSubscription.close);
      addTearDown(unseenSubscription.close);

      await expectLater(
        container.read(happeningNowProvider.future),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('offline'),
          ),
        ),
      );
      await expectLater(
        container.read(unseenCountsProvider.future),
        throwsA(
          isA<Exception>().having(
            (e) => e.toString(),
            'message',
            contains('unavailable'),
          ),
        ),
      );
    });

    test('new-checkin count increments and resets', () {
      final container = _container(_FeedRepository());
      addTearDown(container.dispose);

      final notifier = container.read(newCheckinCountProvider.notifier);
      notifier
        ..increment()
        ..increment();
      expect(container.read(newCheckinCountProvider), 2);
      notifier.reset();
      expect(container.read(newCheckinCountProvider), 0);
    });

    test(
      'active event ids reconcile rooms and leave latest rooms on dispose',
      () {
        final webSocket = _RecordingWebSocketService();
        final container = _container(_FeedRepository(), webSocket: webSocket);
        final subscription = container.listen(
          activeEventIdsProvider,
          (_, _) {},
        );

        final notifier = container.read(activeEventIdsProvider.notifier);
        notifier.addEventId('event-1');
        notifier.setEventIds({'event-2', 'event-3'});

        expect(notifier.isAtEvent('event-2'), isTrue);
        expect(notifier.isAtEvent('event-1'), isFalse);
        expect(webSocket.joined, ['event-1', 'event-2', 'event-3']);
        expect(webSocket.left, ['event-1']);

        subscription.close();
        container.dispose();
        expect(webSocket.left, ['event-1', 'event-2', 'event-3']);
      },
    );
  });
}

ProviderContainer _container(
  FeedRepository repository, {
  WebSocketService? webSocket,
}) {
  return ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      feedRepositoryProvider.overrideWithValue(repository),
      if (webSocket != null)
        webSocketServiceProvider.overrideWithValue(webSocket),
    ],
  );
}

FeedPage _page(List<String> ids, {String? cursor, bool hasMore = false}) {
  return FeedPage(
    items: ids.map(_item).toList(),
    nextCursor: cursor,
    hasMore: hasMore,
  );
}

FeedItem _item(String id) => FeedItem(
  id: id,
  checkinId: 'checkin-$id',
  userId: 'user-$id',
  username: 'User $id',
  eventId: 'event-$id',
  eventName: 'Event $id',
  venueName: 'Venue $id',
  createdAt: '2026-07-27T20:00:00Z',
);

HappeningNowGroup _group(String eventId) => HappeningNowGroup(
  eventId: eventId,
  eventName: 'Event',
  venueName: 'Venue',
  friends: const [HappeningNowFriend(userId: 'friend-1', username: 'Alex')],
  totalFriendCount: 1,
  lastCheckinAt: '2026-07-27T20:00:00Z',
);

extension on List<FeedItem> {
  List<String> get ids => map((item) => item.id).toList();
}

typedef _PageResult = Either<Failure, FeedPage>;
typedef _PageOutcome = FutureOr<_PageResult>;

class _FeedRepository extends FeedRepository {
  _FeedRepository()
    : super(dioClient: DioClient(secureStorage: const FlutterSecureStorage()));

  final global = <_PageOutcome>[];
  final friends = <_PageOutcome>[];
  final event = <_PageOutcome>[];
  final globalCursors = <String?>[];
  final friendsCursors = <String?>[];
  final eventCalls = <(String, String?)>[];
  Either<Failure, List<HappeningNowGroup>> happening = const Right([]);
  Either<Failure, UnseenCounts> unseen = const Right(UnseenCounts());

  Future<_PageResult> _next(List<_PageOutcome> outcomes) async =>
      await outcomes.removeAt(0);

  @override
  Future<_PageResult> getGlobalFeed({String? cursor, int limit = 20}) {
    globalCursors.add(cursor);
    return _next(global);
  }

  @override
  Future<_PageResult> getFriendsFeed({String? cursor, int limit = 20}) {
    friendsCursors.add(cursor);
    return _next(friends);
  }

  @override
  Future<_PageResult> getEventFeed(
    String eventId, {
    String? cursor,
    int limit = 20,
  }) {
    eventCalls.add((eventId, cursor));
    return _next(event);
  }

  @override
  @override
  Future<Either<Failure, List<HappeningNowGroup>>> getHappeningNow() async =>
      happening;

  @override
  Future<Either<Failure, UnseenCounts>> getUnseenCounts() async => unseen;
}

class _RecordingWebSocketService extends WebSocketService {
  final joined = <String>[];
  final left = <String>[];

  @override
  void joinEventRoom(String eventId) => joined.add(eventId);

  @override
  void leaveEventRoom(String eventId) => left.add(eventId);
}
