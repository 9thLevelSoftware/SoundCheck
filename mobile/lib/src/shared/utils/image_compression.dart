import 'dart:io';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;

import '../../core/services/log_service.dart';

/// Image compression utility for optimizing image uploads
class ImageCompression {
  /// Compress an image file for upload
  ///
  /// Parameters:
  /// - file: The image file to compress
  /// - maxWidth: Maximum width (default: 1920)
  /// - maxHeight: Maximum height (default: 1920)
  /// - quality: Compression quality 1-100 (default: 85)
  ///
  /// Returns: Compressed image file or null if compression fails
  static Future<File?> compressImage(
    File file, {
    int maxWidth = 1920,
    int maxHeight = 1920,
    int quality = 85,
  }) async {
    try {
      // Get temp directory
      final tempDir = await getTemporaryDirectory();
      final targetPath = path.join(
        tempDir.path,
        '${DateTime.now().millisecondsSinceEpoch}_compressed.jpg',
      );

      // Compress the image
      final compressedFile = await FlutterImageCompress.compressAndGetFile(
        file.absolute.path,
        targetPath,
        quality: quality,
        minWidth: maxWidth,
        minHeight: maxHeight,
        format: CompressFormat.jpeg,
      );

      if (compressedFile == null) {
        return null;
      }

      return File(compressedFile.path);
    } catch (e) {
      LogService.e('Error compressing image', e);
      return null;
    }
  }

  /// Compress image for profile picture (smaller size)
  static Future<File?> compressProfileImage(File file) async {
    return compressImage(
      file,
      maxWidth: 512,
      maxHeight: 512,
      quality: 90,
    );
  }

  /// Compress image for check-in photo (medium size)
  static Future<File?> compressCheckinImage(File file) async {
    return compressImage(
      file,
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 85,
    );
  }

  /// Compress image for venue/band cover (large size, high quality)
  static Future<File?> compressCoverImage(File file) async {
    return compressImage(
      file,
      maxWidth: 2048,
      maxHeight: 2048,
      quality: 90,
    );
  }

  /// Get compressed file size in KB
  static Future<double> getFileSizeKB(File file) async {
    final bytes = await file.length();
    return bytes / 1024;
  }

  /// Get compression ratio as percentage
  static Future<double> getCompressionRatio(File original, File compressed) async {
    final originalSize = await original.length();
    final compressedSize = await compressed.length();
    return ((originalSize - compressedSize) / originalSize) * 100;
  }
}
