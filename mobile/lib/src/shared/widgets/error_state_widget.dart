import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/theme/app_theme.dart';

/// Type of error to display
enum ErrorType {
  network,
  server,
  notFound,
  unauthorized,
  timeout,
  unknown,
}

/// A reusable widget for displaying error states with retry functionality
class ErrorStateWidget extends StatelessWidget {
  final Object error;
  final StackTrace? stackTrace;
  final VoidCallback? onRetry;
  final String? customMessage;

  const ErrorStateWidget({
    required this.error, super.key,
    this.stackTrace,
    this.onRetry,
    this.customMessage,
  });

  @override
  Widget build(BuildContext context) {
    final errorType = _determineErrorType(error);
    final config = _getErrorConfig(errorType);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spacing32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Error Icon
            Container(
              padding: const EdgeInsets.all(AppTheme.spacing24),
              decoration: BoxDecoration(
                color: config.color.withValues(alpha:0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                config.icon,
                size: 64,
                color: config.color,
              ),
            ),
            const SizedBox(height: AppTheme.spacing24),

            // Error Title
            Text(
              config.title,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppTheme.spacing12),

            // Error Message
            Text(
              customMessage ?? config.message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.textSecondary,
                  ),
              textAlign: TextAlign.center,
            ),

            // Retry Button (if provided)
            if (onRetry != null) ...[
              const SizedBox(height: AppTheme.spacing24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: config.color,
                ),
              ),
            ],

            // Technical Details (only visible in debug builds)
            if (kDebugMode && error.toString().isNotEmpty) ...[
              const SizedBox(height: AppTheme.spacing16),
              TextButton(
                onPressed: () {
                  _showErrorDetails(context);
                },
                child: const Text(
                  'View Technical Details',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  ErrorType _determineErrorType(Object error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return ErrorType.timeout;
        case DioExceptionType.connectionError:
          return ErrorType.network;
        case DioExceptionType.badResponse:
          final statusCode = error.response?.statusCode;
          if (statusCode == 404) return ErrorType.notFound;
          if (statusCode == 401 || statusCode == 403) {
            return ErrorType.unauthorized;
          }
          if (statusCode != null && statusCode >= 500) {
            return ErrorType.server;
          }
          return ErrorType.unknown;
        default:
          return ErrorType.unknown;
      }
    }
    return ErrorType.unknown;
  }

  _ErrorConfig _getErrorConfig(ErrorType type) {
    switch (type) {
      case ErrorType.network:
        return _ErrorConfig(
          icon: Icons.wifi_off_outlined,
          color: AppTheme.error,
          title: 'No Internet Connection',
          message:
              'Please check your internet connection and try again. Make sure you\'re connected to Wi-Fi or mobile data.',
        );
      case ErrorType.server:
        return _ErrorConfig(
          icon: Icons.cloud_off_outlined,
          color: AppTheme.error,
          title: 'Server Error',
          message:
              'Our servers are experiencing issues. Please try again in a few moments.',
        );
      case ErrorType.notFound:
        return _ErrorConfig(
          icon: Icons.search_off_outlined,
          color: AppTheme.warning,
          title: 'Not Found',
          message:
              'The content you\'re looking for doesn\'t exist or has been removed.',
        );
      case ErrorType.unauthorized:
        return _ErrorConfig(
          icon: Icons.lock_outline,
          color: AppTheme.warning,
          title: 'Access Denied',
          message:
              'You don\'t have permission to access this content. Please sign in or contact support.',
        );
      case ErrorType.timeout:
        return _ErrorConfig(
          icon: Icons.access_time_outlined,
          color: AppTheme.warning,
          title: 'Request Timeout',
          message:
              'The request took too long to complete. Please check your connection and try again.',
        );
      case ErrorType.unknown:
        return _ErrorConfig(
          icon: Icons.error_outline,
          color: AppTheme.error,
          title: 'Something Went Wrong',
          message:
              'An unexpected error occurred. Please try again or contact support if the problem persists.',
        );
    }
  }

  void _showErrorDetails(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Technical Details'),
        content: SingleChildScrollView(
          child: SelectableText(
            'Error: ${error.toString()}\n\n'
            'Stack Trace:\n${stackTrace?.toString() ?? 'Not available'}',
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class _ErrorConfig {
  final IconData icon;
  final Color color;
  final String title;
  final String message;

  _ErrorConfig({
    required this.icon,
    required this.color,
    required this.title,
    required this.message,
  });
}
