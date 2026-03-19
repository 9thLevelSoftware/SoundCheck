import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../error/failures.dart';
import '../services/log_service.dart';
import 'api_config.dart';

/// DioClient provides a configured Dio instance with interceptors
class DioClient {
  final Dio _dio;
  final FlutterSecureStorage _secureStorage;

  DioClient({
    required FlutterSecureStorage secureStorage,
  })  : _secureStorage = secureStorage,
        _dio = Dio(
          BaseOptions(
            baseUrl: ApiConfig.baseUrl,
            connectTimeout: ApiConfig.connectTimeout,
            receiveTimeout: ApiConfig.receiveTimeout,
            sendTimeout: ApiConfig.sendTimeout,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          ),
        ) {
    _initializeInterceptors();
  }

  void _initializeInterceptors() {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Add JWT token to headers for authenticated requests
          final token = await _secureStorage.read(key: ApiConfig.tokenKey);
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          // Handle 401 Unauthorized errors
          if (error.response?.statusCode == 401) {
            // Token expired or invalid - clear storage
            await _secureStorage.delete(key: ApiConfig.tokenKey);
            await _secureStorage.delete(key: ApiConfig.userKey);
          }
          return handler.next(error);
        },
      ),
    );

    // Add retry interceptor for idempotent GET requests
    _dio.interceptors.add(
      InterceptorsWrapper(
        onError: (error, handler) async {
          final isRetryable = error.requestOptions.method == 'GET' &&
              (error.type == DioExceptionType.connectionTimeout ||
               error.type == DioExceptionType.receiveTimeout ||
               error.type == DioExceptionType.connectionError ||
               (error.type == DioExceptionType.unknown &&
                (error.message?.contains('SocketException') ?? false)));

          final retryCount =
              error.requestOptions.extra['_retryCount'] as int? ?? 0;
          const maxRetries = 2;

          if (isRetryable && retryCount < maxRetries) {
            final nextRetry = retryCount + 1;
            final delay = Duration(milliseconds: 500 * (1 << retryCount));
            LogService.d(
              'Retrying GET ${error.requestOptions.path} '
              '(attempt $nextRetry/$maxRetries, backoff ${delay.inMilliseconds}ms)',
            );
            await Future<void>.delayed(delay);
            error.requestOptions.extra['_retryCount'] = nextRetry;
            try {
              final response = await _dio.fetch(error.requestOptions);
              return handler.resolve(response);
            } on DioException catch (retryError) {
              return handler.next(retryError);
            }
          }
          return handler.next(error);
        },
      ),
    );

    // Add logging interceptor
    if (ApiConfig.isDev) {
      _dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          error: true,
          logPrint: (object) => LogService.d(object.toString()),
        ),
      );
    }
  }

  /// GET request with error classification
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.get(
        path,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// POST request with error classification
  Future<Response> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// PUT request with error classification
  Future<Response> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.put(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// DELETE request with error classification
  Future<Response> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.delete(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// PATCH request with error classification
  Future<Response> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    try {
      return await _dio.patch(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// Handle DioException and convert to Domain Failures
  Failure _handleDioError(DioException error) {
    LogService.e('API Error: ${error.message}', error, error.stackTrace);

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const NetworkFailure('Connection timeout. Please check your internet connection.');

      case DioExceptionType.badResponse:
        final statusCode = error.response?.statusCode;
        final data = error.response?.data;
        String message = 'Request failed';

        // Try to extract error message from various response formats
        if (data is Map<String, dynamic>) {
          if (data.containsKey('error')) {
            message = data['error'].toString();
          } else if (data.containsKey('message')) {
            message = data['message'].toString();
          } else if (data.containsKey('errors') && data['errors'] is List) {
            // Zod validation errors format: [{message: "...", path: [...]}]
            final errors = data['errors'] as List;
            if (errors.isNotEmpty) {
              message = errors.map((e) => e['message'] ?? e.toString()).join(', ');
            }
          }
        }

        // Log the full response for debugging
        LogService.d('API Error Response: $data');

        if (statusCode == 400) {
          return ValidationFailure(message);
        } else if (statusCode == 401) {
          return const AuthFailure('Authentication required. Please log in again.');
        } else if (statusCode == 403) {
          return AuthFailure('Access denied: $message');
        } else if (statusCode == 404) {
          return ServerFailure('Resource not found: $message');
        } else if (statusCode == 422) {
          return ValidationFailure(message);
        } else if (statusCode != null && statusCode >= 500) {
          return const ServerFailure('Server error. Please try again later.');
        }
        return ServerFailure(message);

      case DioExceptionType.cancel:
        return const UnknownFailure('Request was cancelled');

      case DioExceptionType.connectionError:
        return const NetworkFailure('No internet connection. Please check your network settings.');

      case DioExceptionType.badCertificate:
        return const NetworkFailure('Security certificate error.');

      case DioExceptionType.unknown:
        if (error.message?.contains('SocketException') ?? false) {
          return const NetworkFailure('No internet connection.');
        }
        return const UnknownFailure('An unexpected error occurred.');
    }
  }
}