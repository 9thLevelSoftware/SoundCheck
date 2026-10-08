import 'dart:typed_data';

import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

import '../../../core/api/dio_client.dart';
import '../../../core/api/api_config.dart';
import '../../../core/error/failures.dart';
import '../domain/checkin.dart';

/// Matches the API presign cap in `MAX_UPLOAD_FILE_SIZE_BYTES`.
const int maxUploadBytes = 10 * 1024 * 1024;

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
  final Future<Uint8List?> Function(String sourcePath)? _compressPhoto;

  UploadRepository({
    required DioClient dioClient,
    Future<Uint8List?> Function(String sourcePath)? compressPhoto,
  }) : _dioClient = dioClient,
       _compressPhoto = compressPhoto;

  /// Helper method to map errors to Failures
  Failure _mapErrorToFailure(Object e) {
    if (e is Failure) return e;
    if (e is DioException) return DioClient.handleDioError(e);
    return ServerFailure('Unexpected error: $e');
  }

  /// Request presigned upload URLs from the backend.
  ///
  /// [checkinId] - Check-in to attach photos to
  /// [contentTypes] - MIME types for each photo (e.g., ['image/jpeg'])
  /// [contentLengths] - Byte length of each photo. The API signs this length
  /// into the upload URL, so it must match the bytes that will be PUT.
  Future<Either<Failure, List<PresignedUpload>>> requestPresignedUrls(
    String checkinId,
    List<String> contentTypes, {
    required List<int> contentLengths,
  }) async {
    try {
      final response = await _dioClient.post(
        '${ApiConfig.checkins}/$checkinId/photos',
        data: {'contentTypes': contentTypes, 'contentLengths': contentLengths},
      );

      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return Right(
        data
            .map(
              (json) => PresignedUpload.fromJson(json as Map<String, dynamic>),
            )
            .toList(),
      );
    } catch (e) {
      return Left(_mapErrorToFailure(e));
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
  Future<Either<Failure, void>> uploadPhotoToR2(
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
      return const Right(null);
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Confirm photo uploads with the backend, storing URLs in the check-in.
  ///
  /// [checkinId] - Check-in to update
  /// [photoKeys] - R2 object keys that were successfully uploaded
  Future<Either<Failure, CheckIn>> confirmPhotoUploads(
    String checkinId,
    List<String> photoKeys,
  ) async {
    try {
      final response = await _dioClient.patch(
        '${ApiConfig.checkins}/$checkinId/photos',
        data: {'photoKeys': photoKeys},
      );
      final checkinData = response.data['data'] as Map<String, dynamic>;
      return Right(CheckIn.fromJson(checkinData));
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }

  /// Convenience method: compress, upload, and confirm photos in one call.
  ///
  /// Full flow:
  /// 1. Compress each photo client-side
  /// 2. Request presigned URLs bound to those byte lengths
  /// 3. PUT each compressed photo directly to R2
  /// 4. PATCH backend to confirm and store URLs
  ///
  /// [checkinId] - Check-in to attach photos to
  /// [photos] - XFile list from ImagePicker
  /// [onProgress] - Optional callback for per-photo progress (index, 0.0-1.0)
  Future<Either<Failure, CheckIn?>> uploadPhotos(
    String checkinId,
    List<XFile> photos, {
    void Function(int index, double progress)? onProgress,
  }) async {
    if (photos.isEmpty) return const Right(null);

    try {
      // Compress before requesting URLs so the signed Content-Length matches
      // the bytes that will be uploaded. flutter_image_compress emits JPEG.
      final prepared = <({Uint8List bytes, String contentType})>[];
      for (var i = 0; i < photos.length; i++) {
        onProgress?.call(i, 0.1);
        final compressed = _compressPhoto == null
            ? await FlutterImageCompress.compressWithFile(
                photos[i].path,
                quality: 85,
                minWidth: 1920,
                minHeight: 1080,
              )
            : await _compressPhoto(photos[i].path);
        if (compressed != null) {
          prepared.add((
            bytes: Uint8List.fromList(compressed),
            contentType: 'image/jpeg',
          ));
        } else {
          final mimeType = photos[i].mimeType;
          prepared.add((
            bytes: await photos[i].readAsBytes(),
            contentType: mimeType != null && mimeType.startsWith('image/')
                ? mimeType
                : 'image/jpeg',
          ));
        }
      }

      for (final photo in prepared) {
        if (photo.bytes.isEmpty || photo.bytes.length > maxUploadBytes) {
          return const Left(
            ValidationFailure('Each photo must be 10MB or smaller'),
          );
        }
      }

      final presignedUrlsResult = await requestPresignedUrls(
        checkinId,
        prepared.map((photo) => photo.contentType).toList(),
        contentLengths: prepared.map((photo) => photo.bytes.length).toList(),
      );

      // Early return on error
      final List<PresignedUpload> presignedUrls;
      if (presignedUrlsResult.isLeft()) {
        return Left(
          presignedUrlsResult.fold(
            (l) => l,
            (r) => const ServerFailure('Unexpected error'),
          ),
        );
      } else {
        presignedUrls = presignedUrlsResult.getOrElse(() => []);
      }

      final uploadedKeys = <String>[];

      for (int i = 0; i < prepared.length; i++) {
        onProgress?.call(i, 0.3);

        final uploadResult = await uploadPhotoToR2(
          presignedUrls[i].uploadUrl,
          prepared[i].bytes,
          prepared[i].contentType,
        );

        // Early return on error
        if (uploadResult.isLeft()) {
          return Left(
            uploadResult.fold(
              (l) => l,
              (r) => const ServerFailure('Unexpected error'),
            ),
          );
        }

        onProgress?.call(i, 0.9);
        uploadedKeys.add(presignedUrls[i].objectKey);
      }

      // 5. Confirm all uploads with backend
      final confirmResult = await confirmPhotoUploads(checkinId, uploadedKeys);

      // Mark all as complete
      for (int i = 0; i < photos.length; i++) {
        onProgress?.call(i, 1.0);
      }

      return confirmResult;
    } catch (e) {
      return Left(_mapErrorToFailure(e));
    }
  }
}
