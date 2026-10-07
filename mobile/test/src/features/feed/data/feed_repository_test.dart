import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/features/feed/data/feed_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('FeedRepository request and response contracts', () {
    test(
      'covers feed, unseen, mark-read, and device-token endpoints',
      () async {
        final client = _QueueDioClient(
          outcomes: [
            _response({'data': _feedPageJson('global')}),
            _response({'data': _feedPageJson('friends')}),
            _response({'data': _feedPageJson('event')}),
            _response({
              'data': [
                {
                  'event_id': 'event-1',
                  'event_name': 'Summer Fest',
                  'venue_name': 'The Bowl',
                  'friends': [
                    {
                      'user_id': 'friend-1',
                      'username': 'Alex',
                      'profile_image_url': null,
                    },
                  ],
                  'total_friend_count': 1,
                  'last_checkin_at': '2026-07-27T20:00:00Z',
                },
              ],
            }),
            _response({
              'data': {'friends': 2, 'event': 3, 'happening_now': 4},
            }),
            _response({'success': true}),
            _response({'success': true}),
            _response({'success': true}),
          ],
        );
        final repository = FeedRepository(dioClient: client);

        final global = await repository.getGlobalFeed(cursor: 'g1', limit: 10);
        final friends = await repository.getFriendsFeed(
          cursor: 'f1',
          limit: 11,
        );
        final event = await repository.getEventFeed(
          'event-1',
          cursor: 'e1',
          limit: 12,
        );
        final happening = await repository.getHappeningNow();
        final unseen = await repository.getUnseenCounts();
        final marked = await repository.markFeedRead(
          'friends',
          '2026-07-27T20:00:00Z',
          lastSeenCheckinId: 'checkin-1',
        );
        final registered = await repository.registerDeviceToken(
          'fcm-token',
          'android',
        );
        final unregistered = await repository.unregisterDeviceToken(
          'fcm-token',
        );

        for (final result in [
          global,
          friends,
          event,
          happening,
          unseen,
          marked,
          registered,
          unregistered,
        ]) {
          expect(result.isRight(), isTrue);
        }
        expect(
          global.fold(
            (_) => fail('expected page'),
            (page) => page.items.single.id,
          ),
          'global-item',
        );
        expect(
          happening.fold(
            (_) => fail('expected happening-now group'),
            (groups) => groups.single.friends.single.username,
          ),
          'Alex',
        );
        expect(
          unseen.fold(
            (_) => fail('expected counts'),
            (counts) => counts.friends,
          ),
          2,
        );

        expect(client.calls, [
          _call('GET', '/feed/global', query: {'limit': 10, 'cursor': 'g1'}),
          _call('GET', '/feed/friends', query: {'limit': 11, 'cursor': 'f1'}),
          _call(
            'GET',
            '/feed/events/event-1',
            query: {'limit': 12, 'cursor': 'e1'},
          ),
          _call('GET', '/feed/happening-now'),
          _call('GET', '/feed/unseen'),
          _call(
            'POST',
            '/feed/mark-read',
            data: {
              'feedType': 'friends',
              'lastSeenAt': '2026-07-27T20:00:00Z',
              'lastSeenCheckinId': 'checkin-1',
            },
          ),
          _call(
            'POST',
            '/users/device-token',
            data: {'token': 'fcm-token', 'platform': 'android'},
          ),
          _call('DELETE', '/users/device-token', data: {'token': 'fcm-token'}),
        ]);
      },
    );

    test('omits optional cursor and last-seen check-in values', () async {
      final client = _QueueDioClient(
        outcomes: [
          _response({'data': _feedPageJson('minimal')}),
          _response({'success': true}),
        ],
      );
      final repository = FeedRepository(dioClient: client);

      expect((await repository.getGlobalFeed()).isRight(), isTrue);
      expect(
        (await repository.markFeedRead(
          'event',
          '2026-07-27T20:00:00Z',
        )).isRight(),
        isTrue,
      );

      expect(
        client.calls[0],
        _call('GET', '/feed/global', query: {'limit': 20}),
      );
      expect(
        client.calls[1],
        _call(
          'POST',
          '/feed/mark-read',
          data: {'feedType': 'event', 'lastSeenAt': '2026-07-27T20:00:00Z'},
        ),
      );
    });

    test('maps offline, timeout, existing, and malformed failures', () async {
      const existing = ValidationFailure('bad feed type');
      final client = _QueueDioClient(
        outcomes: [
          DioException(
            requestOptions: RequestOptions(path: '/feed/global'),
            type: DioExceptionType.connectionError,
          ),
          DioException(
            requestOptions: RequestOptions(path: '/feed/friends'),
            type: DioExceptionType.receiveTimeout,
          ),
          existing,
          _response({
            'data': {'items': 'not-a-list'},
          }),
        ],
      );
      final repository = FeedRepository(dioClient: client);

      final offline = await repository.getGlobalFeed();
      final timeout = await repository.getFriendsFeed();
      final preserved = await repository.markFeedRead('invalid', 'now');
      final malformed = await repository.getEventFeed('event-1');

      expect(
        offline.fold((failure) => failure, (_) => fail('expected failure')),
        isA<NetworkFailure>(),
      );
      expect(
        timeout.fold((failure) => failure, (_) => fail('expected failure')),
        isA<NetworkFailure>(),
      );
      expect(
        preserved.fold((failure) => failure, (_) => fail('expected failure')),
        same(existing),
      );
      expect(
        malformed.fold((failure) => failure, (_) => fail('expected failure')),
        isA<ServerFailure>().having(
          (failure) => failure.message,
          'message',
          contains('Unexpected error'),
        ),
      );
    });
  });
}

Map<String, dynamic> _feedPageJson(String prefix) => {
  'items': [
    {
      'id': '$prefix-item',
      'checkin_id': '$prefix-checkin',
      'user_id': 'user-1',
      'username': 'Jordan',
      'event_id': 'event-1',
      'event_name': 'Summer Fest',
      'venue_name': 'The Bowl',
      'created_at': '2026-07-27T20:00:00Z',
      'has_badge_earned': true,
      'toast_count': 3,
      'comment_count': 2,
      'has_user_toasted': true,
    },
  ],
  'next_cursor': '$prefix-next',
  'has_more': true,
};

Response<dynamic> _response(dynamic data) => Response<dynamic>(
  requestOptions: RequestOptions(path: '/test'),
  data: data,
);

_RequestCall _call(
  String method,
  String path, {
  dynamic data,
  Map<String, dynamic>? query,
}) => _RequestCall(method, path, data: data, query: query);

class _RequestCall {
  const _RequestCall(this.method, this.path, {this.data, this.query});

  final String method;
  final String path;
  final dynamic data;
  final Map<String, dynamic>? query;

  @override
  bool operator ==(Object other) {
    return other is _RequestCall &&
        other.method == method &&
        other.path == path &&
        _deepEquals(other.data, data) &&
        _deepEquals(other.query, query);
  }

  @override
  int get hashCode => Object.hash(method, path);

  @override
  String toString() =>
      '_RequestCall(method: $method, path: $path, data: $data, query: $query)';
}

bool _deepEquals(Object? left, Object? right) {
  if (left is Map && right is Map) {
    return left.length == right.length &&
        left.keys.every(
          (key) => right.containsKey(key) && _deepEquals(left[key], right[key]),
        );
  }
  if (left is List && right is List) {
    return left.length == right.length &&
        Iterable<int>.generate(
          left.length,
        ).every((index) => _deepEquals(left[index], right[index]));
  }
  return left == right;
}

class _QueueDioClient extends DioClient {
  _QueueDioClient({required List<Object> outcomes})
    : _outcomes = [...outcomes],
      super(secureStorage: const FlutterSecureStorage());

  final List<Object> _outcomes;
  final List<_RequestCall> calls = [];

  Future<Response<dynamic>> _next(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
  }) async {
    calls.add(_RequestCall(method, path, data: data, query: query));
    final outcome = _outcomes.removeAt(0);
    if (outcome is Response<dynamic>) return outcome;
    throw outcome;
  }

  @override
  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) => _next('GET', path, query: queryParameters);

  @override
  Future<Response<dynamic>> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) => _next('POST', path, data: data, query: queryParameters);

  @override
  Future<Response<dynamic>> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) => _next('DELETE', path, data: data, query: queryParameters);
}
