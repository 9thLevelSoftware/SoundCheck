import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shimmer/shimmer.dart';

import '../../../core/theme/app_theme.dart';
import '../data/share_repository.dart';
import '../services/social_share_service.dart';

/// Reusable widget that shows a share card image preview with share buttons.
///
/// Displays the card image from [cardUrls] (or loading shimmer / error state),
/// followed by a row of share target buttons (Instagram Stories, TikTok, Share).
class ShareCardPreview extends StatelessWidget {
  const ShareCardPreview({
    super.key,
    required this.cardUrls,
    required this.shareText,
    required this.shareUrl,
  });

  /// Async value of the share card URLs (OG + Stories).
  final AsyncValue<ShareCardUrls> cardUrls;

  /// Text to include in the share (e.g. "I just checked in at Venue!")
  final String shareText;

  /// Deep link URL for the share landing page.
  final String shareUrl;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Share header
        const Text(
          'Share your check-in',
          style: TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        // Card image preview
        _buildCardImage(context),
        const SizedBox(height: 16),
        // Share buttons row
        _buildShareButtons(context),
      ],
    );
  }

  Widget _buildCardImage(BuildContext context) {
    return cardUrls.when(
      loading: () => _buildShimmer(),
      error: (_, __) => _buildErrorState(),
      data: (urls) => ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        child: Image.network(
          urls.ogUrl,
          width: double.infinity,
          height: 180,
          fit: BoxFit.cover,
          loadingBuilder: (context, child, loadingProgress) {
            if (loadingProgress == null) return child;
            return _buildShimmer();
          },
          errorBuilder: (_, __, ___) => _buildErrorState(),
        ),
      ),
    );
  }

  Widget _buildShimmer() {
    return Shimmer.fromColors(
      baseColor: AppTheme.surfaceVariantDark,
      highlightColor: AppTheme.cardDark,
      child: Container(
        width: double.infinity,
        height: 180,
        decoration: BoxDecoration(
          color: AppTheme.surfaceVariantDark,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Container(
      width: double.infinity,
      height: 100,
      decoration: BoxDecoration(
        color: AppTheme.surfaceVariantDark,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
      ),
      child: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.image_not_supported_outlined,
                color: AppTheme.textTertiary, size: 32),
            SizedBox(height: 8),
            Text(
              'Card preview unavailable',
              style: TextStyle(color: AppTheme.textTertiary, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShareButtons(BuildContext context) {
    final hasUrls = cardUrls.hasValue;
    final urls = hasUrls ? cardUrls.value : null;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _ShareButton(
          icon: Icons.camera_alt,
          label: 'Stories',
          onTap: hasUrls && urls != null
              ? () => SocialShareService.shareToInstagramStories(urls.storiesUrl)
              : null,
        ),
        const SizedBox(width: 24),
        _ShareButton(
          icon: Icons.music_note,
          label: 'TikTok',
          onTap: hasUrls && urls != null
              ? () => SocialShareService.shareToTikTok(urls.storiesUrl)
              : null,
        ),
        const SizedBox(width: 24),
        _ShareButton(
          icon: Icons.share,
          label: 'Share',
          onTap: () {
            if (hasUrls && urls != null) {
              SocialShareService.shareGeneric(
                text: shareText,
                imageUrl: urls.ogUrl,
                shareUrl: shareUrl,
              );
            } else {
              // Fallback: share text only
              SocialShareService.shareGeneric(
                text: shareText,
                imageUrl: '',
                shareUrl: shareUrl,
              );
            }
          },
        ),
      ],
    );
  }
}

/// Individual share target button with icon and label.
class _ShareButton extends StatelessWidget {
  const _ShareButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isEnabled = onTap != null;

    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: isEnabled ? 1.0 : 0.4,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: AppTheme.surfaceVariantDark,
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppTheme.voltLime.withValues(alpha: 0.3),
                  width: 1,
                ),
              ),
              child: Icon(icon, color: AppTheme.voltLime, size: 24),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
