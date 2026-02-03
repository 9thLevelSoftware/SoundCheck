import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../domain/checkin.dart';

/// Data class for presigned upload URL response from backend
class PresignedUpload {
  final String uploadUrl;
  final String objectKey;
  final String publicUrl;

  PresignedUpload({
    required this.uploadUrl,
    required this.objectKey,
    required this.publicUrl,
  });

  factory PresignedUpload.fromJson(Map<String, dynamic> json) {
    return PresignedUpload(
      uploadUrl: json['uploadUrl'] as String,
      objectKey: json['objectKey'] as String,
      publicUrl: json['publicUrl'] as String,
    );
  }
}

/// Repository for photo upload operations.
///
/// Handles the presigned-URL flow:
/// 1. POST to backend to get presigned upload URLs
/// 2. PUT photo bytes directly to Cloudflare R2 (not through Railway)
/// 3. PATCH backend to confirm uploads and store URLs in check-in
class UploadRepository {
  final DioClient _dioClient;

  UploadRepository({required DioClient dioClient}) : _dioClient = dioClient;

  /// Request presigned upload URLs from the backend.
  ///
  /// [checkinId] - Check-in to attach photos to
  /// [contentTypes] - MIME types for each photo (e.g., ['image/jpeg'])
  Future<List<PresignedUpload>> requestPresignedUrls(
    String checkinId,
    List<String> contentTypes,
  ) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.checkins}/$checkinId/photos',
        data: {'contentTypes': contentTypes},
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((json) => PresignedUpload.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      rethrow;
    }
  }

  /// Upload photo bytes directly to Cloudflare R2 via presigned URL.
  ///
  /// CRITICAL: Uses a fresh Dio instance (not the authenticated DioClient),
  /// because presigned URLs are self-authenticating and the DioClient's
  /// auth interceptor would interfere.
  ///
  /// [presignedUrl] - Full presigned PUT URL from R2
  /// [photoBytes] - Compressed photo data
  /// [contentType] - Must match what was used to generate the presigned URL
  Future<void> uploadPhotoToR2(
    String presignedUrl,
    Uint8List photoBytes,
    String contentType,
  ) async {
    try {
      await Dio().put(
        presignedUrl,
        data: Stream.fromIterable([photoBytes]),
        options: Options(
          headers: {
            'Content-Type': contentType,
            'Content-Length': photoBytes.length,
          },
        ),
      );
    } catch (e) {
      rethrow;
    }
  }

  /// Confirm photo uploads with the backend, storing URLs in the check-in.
  ///
  /// [checkinId] - Check-in to update
  /// [photoKeys] - R2 object keys that were successfully uploaded
  Future<CheckIn> confirmPhotoUploads(
    String checkinId,
    List<String> photoKeys,
  ) async {
    try {
      final response = await _dioClient.patch(
        '${ApiConfig.checkins}/$checkinId/photos',
        data: {'photoKeys': photoKeys},
      );
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return CheckIn.fromJson(checkinData);
    } catch (e) {
      rethrow;
    }
  }

  /// Convenience method: compress, upload, and confirm photos in one call.
  ///
  /// Full flow:
  /// 1. Determine content types from XFile list
  /// 2. Request presigned URLs from backend
  /// 3. Compress each photo client-side
  /// 4. PUT each compressed photo directly to R2
  /// 5. PATCH backend to confirm and store URLs
  ///
  /// [checkinId] - Check-in to attach photos to
  /// [photos] - XFile list from ImagePicker
  /// [onProgress] - Optional callback for per-photo progress (index, 0.0-1.0)
  Future<CheckIn?> uploadPhotos(
    String checkinId,
    List<XFile> photos, {
    void Function(int index, double progress)? onProgress,
  }) async {
    if (photos.isEmpty) return null;

    try {
      // 1. Determine content types
      final contentTypes = photos.map((photo) {
        final mimeType = photo.mimeType;
        if (mimeType != null && mimeType.startsWith('image/')) {
          return mimeType;
        }
        // Default to JPEG if mimeType is unavailable
        return 'image/jpeg';
      }).toList();

      // 2. Request presigned URLs
      final presignedUrls = await requestPresignedUrls(checkinId, contentTypes);

      // 3. Compress and upload each photo
      final uploadedKeys = <String>[];

      for (int i = 0; i < photos.length; i++) {
        onProgress?.call(i, 0.1);

        // Compress the photo client-side
        final compressed = await FlutterImageCompress.compressWithFile(
          photos[i].path,
          quality: 85,
          minWidth: 1920,
          minHeight: 1080,
        );

        if (compressed == null) {
          // Fallback: read original bytes if compression fails
          final originalBytes = await photos[i].readAsBytes();
          onProgress?.call(i, 0.3);

          await uploadPhotoToR2(
            presignedUrls[i].uploadUrl,
            originalBytes,
            contentTypes[i],
          );
        } else {
          onProgress?.call(i, 0.3);

          await uploadPhotoToR2(
            presignedUrls[i].uploadUrl,
            Uint8List.fromList(compressed),
            contentTypes[i],
          );
        }

        onProgress?.call(i, 0.9);
        uploadedKeys.add(presignedUrls[i].objectKey);
      }

      // 4. Confirm all uploads with backend
      final updatedCheckIn = await confirmPhotoUploads(checkinId, uploadedKeys);

      // Mark all as complete
      for (int i = 0; i < photos.length; i++) {
        onProgress?.call(i, 1.0);
      }

      return updatedCheckIn;
    } catch (e) {
      rethrow;
    }
  }
}
