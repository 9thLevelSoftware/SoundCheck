import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Service for platform-specific social sharing.
///
/// All sharing currently uses share_plus (OS share sheet) as the reliable
/// cross-platform baseline. Instagram Stories and TikTok are available as
/// options in the system share picker. If a dedicated social SDK is added
/// later (e.g. social_share_kit), the methods below can be updated to target
/// those platforms directly without changing the calling code.
class SocialShareService {
  SocialShareService._();

  /// Share to Instagram Stories.
  ///
  /// Downloads the Stories-optimized image (1080x1920) to a temp file,
  /// then opens the OS share sheet. The user can select Instagram Stories
  /// from the picker.
  static Future<bool> shareToInstagramStories(String imageUrl) async {
    try {
      final tempFile = await _downloadToTemp(imageUrl, 'stories');
      await SharePlus.instance.share(
        ShareParams(files: [XFile(tempFile.path)]),
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Share to TikTok.
  ///
  /// Downloads the Stories-optimized image (1080x1920) to a temp file,
  /// then opens the OS share sheet. The user can select TikTok from the
  /// picker.
  static Future<bool> shareToTikTok(String imageUrl) async {
    try {
      final tempFile = await _downloadToTemp(imageUrl, 'tiktok');
      await SharePlus.instance.share(
        ShareParams(files: [XFile(tempFile.path)]),
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Share via OS share sheet (X/Twitter, generic).
  ///
  /// Downloads the OG-optimized image (1200x630) to a temp file and
  /// opens the share sheet with both the image and a text+URL payload.
  static Future<bool> shareGeneric({
    required String text,
    required String imageUrl,
    required String shareUrl,
  }) async {
    try {
      final tempFile = await _downloadToTemp(imageUrl, 'share');
      await SharePlus.instance.share(
        ShareParams(
          text: '$text\n$shareUrl',
          files: [XFile(tempFile.path)],
        ),
      );
      return true;
    } catch (e) {
      // Fallback: share text-only if image download fails
      try {
        await SharePlus.instance.share(
          ShareParams(text: '$text\n$shareUrl'),
        );
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  /// Download image URL to a temp file for sharing.
  static Future<File> _downloadToTemp(String url, String prefix) async {
    final response = await Dio().get<List<int>>(
      url,
      options: Options(responseType: ResponseType.bytes),
    );
    final tempDir = await getTemporaryDirectory();
    final file = File(
      '${tempDir.path}/${prefix}_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(response.data!);
    return file;
  }
}
