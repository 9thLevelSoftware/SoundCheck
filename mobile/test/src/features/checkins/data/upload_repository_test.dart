import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/core/api/dio_client.dart';
import 'package:soundcheck_flutter/src/core/error/failures.dart';
import 'package:soundcheck_flutter/src/features/checkins/data/upload_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('UploadRepository', () {
    test('requests one presigned contract per content type', () async {
      final client = _UploadDioClient(
        outcomes: [
          Response<dynamic>(
            requestOptions: RequestOptions(path: '/checkins/checkin-1/photos'),
            data: {
              'data': [
                {
                  'uploadUrl': 'https://r2.example/put/one',
                  'objectKey': 'checkins/checkin-1/one.jpg',
                  'publicUrl': 'https://cdn.example/one.jpg',
                },
                {
                  'uploadUrl': 'https://r2.example/put/two',
                  'objectKey': 'checkins/checkin-1/two.png',
                  'publicUrl': 'https://cdn.example/two.png',
                },
              ],
            },
          ),
        ],
      );
      final repository = UploadRepository(dioClient: client);

      final result = await repository.requestPresignedUrls(
        'checkin-1',
        ['image/jpeg', 'image/png'],
        contentLengths: [1200, 3400],
      );

      expect(client.method, 'POST');
      expect(client.path, '/checkins/checkin-1/photos');
      expect(client.data, {
        'contentTypes': ['image/jpeg', 'image/png'],
        'contentLengths': [1200, 3400],
      });
      result.fold(
        (failure) => fail('Expected presigned URLs, got ${failure.message}'),
        (uploads) {
          expect(uploads, hasLength(2));
          expect(uploads.first.objectKey, 'checkins/checkin-1/one.jpg');
          expect(uploads.last.publicUrl, 'https://cdn.example/two.png');
        },
      );
    });

    test('confirms uploaded keys and parses the updated check-in', () async {
      final client = _UploadDioClient(
        outcomes: [
          Response<dynamic>(
            requestOptions: RequestOptions(path: '/checkins/checkin-1/photos'),
            data: {
              'data': {
                'id': 'checkin-1',
                'userId': 'user-1',
                'createdAt': '2026-07-27T20:00:00Z',
                'updatedAt': '2026-07-27T20:01:00Z',
                'imageUrls': ['https://cdn.example/one.jpg'],
              },
            },
          ),
        ],
      );
      final repository = UploadRepository(dioClient: client);

      final result = await repository.confirmPhotoUploads('checkin-1', [
        'checkins/checkin-1/one.jpg',
      ]);

      expect(client.method, 'PATCH');
      expect(client.path, '/checkins/checkin-1/photos');
      expect(client.data, {
        'photoKeys': ['checkins/checkin-1/one.jpg'],
      });
      expect(
        result.fold(
          (failure) => fail('Expected check-in, got ${failure.message}'),
          (checkin) => checkin.imageUrls,
        ),
        ['https://cdn.example/one.jpg'],
      );
    });

    test('rejects a prepared photo larger than the 10MB presign cap', () async {
      final client = _UploadDioClient(outcomes: const []);
      final repository = UploadRepository(
        dioClient: client,
        compressPhoto: (_) async => Uint8List(maxUploadBytes + 1),
      );

      final result = await repository.uploadPhotos('checkin-1', [
        XFile('/tmp/oversized.jpg'),
      ]);

      expect(
        result.fold((failure) => failure, (_) => fail('Expected validation')),
        isA<ValidationFailure>().having(
          (failure) => failure.message,
          'message',
          'Each photo must be 10MB or smaller',
        ),
      );
      expect(client.path, isNull);
    });

    test('empty photo selection is a no-op without API calls', () async {
      final client = _UploadDioClient(outcomes: const []);
      final repository = UploadRepository(dioClient: client);

      final result = await repository.uploadPhotos('checkin-1', const []);

      expect(result.isRight(), isTrue);
      expect(client.path, isNull);
    });

    test('offline and malformed presign responses remain observable', () async {
      final client = _UploadDioClient(
        outcomes: [
          DioException(
            requestOptions: RequestOptions(path: '/checkins/checkin-1/photos'),
            type: DioExceptionType.connectionError,
          ),
          Response<dynamic>(
            requestOptions: RequestOptions(path: '/checkins/checkin-1/photos'),
            data: {
              'data': [
                {'uploadUrl': 'https://r2.example/put/one'},
              ],
            },
          ),
        ],
      );
      final repository = UploadRepository(dioClient: client);

      final offline = await repository.requestPresignedUrls(
        'checkin-1',
        ['image/jpeg'],
        contentLengths: [100],
      );
      final malformed = await repository.requestPresignedUrls(
        'checkin-1',
        ['image/jpeg'],
        contentLengths: [100],
      );

      expect(
        offline.fold((failure) => failure, (_) => fail('Expected failure')),
        isA<NetworkFailure>(),
      );
      expect(
        malformed.fold((failure) => failure, (_) => fail('Expected failure')),
        isA<ServerFailure>().having(
          (failure) => failure.message,
          'message',
          contains('Unexpected error'),
        ),
      );
    });
  });
}

class _UploadDioClient extends DioClient {
  _UploadDioClient({required List<Object> outcomes})
    : _outcomes = [...outcomes],
      super(secureStorage: const FlutterSecureStorage());

  final List<Object> _outcomes;
  String? method;
  String? path;
  dynamic data;

  Future<Response<dynamic>> _next(
    String nextMethod,
    String nextPath,
    dynamic nextData,
  ) async {
    method = nextMethod;
    path = nextPath;
    data = nextData;
    final outcome = _outcomes.removeAt(0);
    if (outcome is Response<dynamic>) return outcome;
    throw outcome;
  }

  @override
  Future<Response<dynamic>> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) => _next('POST', path, data);

  @override
  Future<Response<dynamic>> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) => _next('PATCH', path, data);
}
