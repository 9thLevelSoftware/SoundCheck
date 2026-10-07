import 'dart:async';

import 'package:dartz/dartz.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/core/providers/providers.dart';
import 'package:soundcheck_flutter/src/core/services/websocket_service.dart';
import 'package:soundcheck_flutter/src/features/auth/domain/user.dart';
import 'package:soundcheck_flutter/src/features/feed/data/feed_repository.dart';
import 'package:soundcheck_flutter/src/features/feed/domain/feed_item.dart';
import 'package:soundcheck_flutter/src/features/feed/domain/happening_now_group.dart';
import 'package:soundcheck_flutter/src/features/feed/presentation/feed_screen.dart';
import 'package:soundcheck_flutter/src/features/feed/presentation/providers/feed_providers.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'renders data, handles realtime, marks tabs read, and navigates',
    (tester) async {
      final repository = _ScreenFeedRepository();
      final webSocket = _ScreenWebSocketService();
      final router = _router();
      addTearDown(webSocket.dispose);
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _app(
          router: router,
          repository: repository,
          webSocket: webSocket,
          global: [_item('global')],
          friends: [_item('friend')],
          happening: [_group()],
          unseen: const UnseenCounts(friends: 2, event: 3, happeningNow: 4),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Discover'), findsOneWidget);
      expect(find.text('Friends'), findsOneWidget);
      expect(find.text('Events'), findsWidgets);
      expect(find.text('2'), findsWidgets);
      expect(find.text('4'), findsOneWidget);
      expect(find.byTooltip('Search'), findsOneWidget);

      webSocket.emitNewCheckin({'checkinId': 'checkin-new'});
      await tester.pump();
      webSocket.emitSameEvent({'username': 'Alex', 'eventId': 'event-1'});
      await tester.pump();
      expect(find.text('Alex is here too!'), findsOneWidget);

      await tester.tap(_tab('Friends'));
      await tester.pumpAndSettle();
      expect(find.text('2 new check-ins'), findsOneWidget);
      expect(repository.markedTypes, ['friends']);

      await tester.tap(find.text('2 new check-ins'));
      await tester.pumpAndSettle();
      expect(find.textContaining('new check-in'), findsNothing);

      await tester.tap(_tab('Events'));
      await tester.pumpAndSettle();
      expect(repository.markedTypes, ['friends', 'happening_now']);
      expect(repository.markedAt['happening_now'], _group().lastCheckinAt);
      expect(find.text('Summer Fest'), findsOneWidget);
      expect(find.text('Alex at this show'), findsOneWidget);

      await tester.tap(find.text('Summer Fest'));
      await tester.pumpAndSettle();
      expect(find.text('route-event-1'), findsOneWidget);

      router.go('/');
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Search'));
      await tester.pumpAndSettle();
      expect(find.text('route-search'), findsOneWidget);
    },
  );

  testWidgets('shows loading, error retry, and every empty feed state', (
    tester,
  ) async {
    final repository = _ScreenFeedRepository();
    final webSocket = _ScreenWebSocketService();
    final router = _router();
    final global = Completer<List<FeedItem>>();
    var attempts = 0;
    addTearDown(webSocket.dispose);
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        retry: (_, _) => null,
        overrides: [
          feedRepositoryProvider.overrideWithValue(repository),
          webSocketServiceProvider.overrideWithValue(webSocket),
          authStateProvider.overrideWithBuild((_, _) async => _currentUser),
          globalFeedProvider.overrideWithBuild((_, _) async {
            attempts++;
            if (attempts == 1) return global.future;
            return [];
          }),
          friendsFeedProvider.overrideWithBuild((_, _) async => []),
          happeningNowProvider.overrideWith((_) async => []),
          unseenCountsProvider.overrideWith((_) async => const UnseenCounts()),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
    expect(find.byType(FeedScreen), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    global.completeError(Exception('offline'));
    await tester.pumpAndSettle();
    expect(find.text('Failed to load feed'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('No activity yet'), findsOneWidget);

    await tester.tap(_tab('Friends'));
    await tester.pumpAndSettle();
    expect(find.text('No friend activity yet'), findsOneWidget);
    expect(find.text('Find Friends'), findsOneWidget);

    await tester.tap(_tab('Events'));
    await tester.pumpAndSettle();
    expect(find.text('No one\'s checked in right now'), findsOneWidget);
    expect(find.text('Explore Events'), findsOneWidget);
  });
}

Widget _app({
  required GoRouter router,
  required FeedRepository repository,
  required WebSocketService webSocket,
  required List<FeedItem> global,
  required List<FeedItem> friends,
  required List<HappeningNowGroup> happening,
  required UnseenCounts unseen,
}) {
  return ProviderScope(
    retry: (_, _) => null,
    overrides: [
      feedRepositoryProvider.overrideWithValue(repository),
      webSocketServiceProvider.overrideWithValue(webSocket),
      authStateProvider.overrideWithBuild((_, _) async => _currentUser),
      globalFeedProvider.overrideWithBuild((_, _) async => global),
      friendsFeedProvider.overrideWithBuild((_, _) async => friends),
      happeningNowProvider.overrideWith((_) async => happening),
      unseenCountsProvider.overrideWith((_) async => unseen),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

Finder _tab(String label) =>
    find.descendant(of: find.byType(TabBar), matching: find.text(label));

GoRouter _router() {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, _) => const FeedScreen()),
      GoRoute(
        path: '/search',
        builder: (_, _) =>
            const Text('route-search', textDirection: TextDirection.ltr),
      ),
      GoRoute(
        path: '/events/:id',
        builder: (_, state) => Text(
          'route-${state.pathParameters['id']}',
          textDirection: TextDirection.ltr,
        ),
      ),
      GoRoute(
        path: '/checkins/:id',
        builder: (_, state) => Text(
          'route-${state.pathParameters['id']}',
          textDirection: TextDirection.ltr,
        ),
      ),
      GoRoute(
        path: '/discover',
        builder: (_, _) =>
            const Text('route-discover', textDirection: TextDirection.ltr),
      ),
      GoRoute(
        path: '/discover/users',
        builder: (_, _) =>
            const Text('route-users', textDirection: TextDirection.ltr),
      ),
    ],
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

HappeningNowGroup _group() => const HappeningNowGroup(
  eventId: 'event-1',
  eventName: 'Summer Fest',
  venueName: 'The Bowl',
  friends: [HappeningNowFriend(userId: 'friend-1', username: 'Alex')],
  totalFriendCount: 1,
  lastCheckinAt: '2026-07-27T20:00:00Z',
);

const _currentUser = User(
  id: 'current-user',
  email: 'current@example.com',
  username: 'current',
  isVerified: true,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
);

class _ScreenFeedRepository extends FeedRepository {
  _ScreenFeedRepository()
    : super(dioClient: DioClient(secureStorage: const FlutterSecureStorage()));

  final markedTypes = <String>[];
  final markedAt = <String, String>{};

  @override
  Future<Either<Failure, void>> markFeedRead(
    String feedType,
    String lastSeenAt, {
    String? lastSeenCheckinId,
  }) async {
    markedTypes.add(feedType);
    markedAt[feedType] = lastSeenAt;
    return const Right(null);
  }
}

class _ScreenWebSocketService extends WebSocketService {
  final _newCheckins = StreamController<Map<String, dynamic>>.broadcast();
  final _sameEvents = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get newCheckinStream => _newCheckins.stream;

  @override
  Stream<Map<String, dynamic>> get sameEventCheckinStream => _sameEvents.stream;

  void emitNewCheckin(Map<String, dynamic> payload) =>
      _newCheckins.add(payload);

  void emitSameEvent(Map<String, dynamic> payload) => _sameEvents.add(payload);

  @override
  void dispose() {
    _newCheckins.close();
    _sameEvents.close();
    super.dispose();
  }
}
