import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/app_theme.dart';
import '../../features/bands/domain/band.dart';
import '../utils/haptic_feedback.dart';
import 'star_rating.dart';

class BandCard extends StatelessWidget {
  final Band band;
  final VoidCallback? onTap;

  const BandCard({
    required this.band,
    super.key,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: 'Band: ${band.name}${band.genre != null ? ', genre: ${band.genre}' : ''}, ${band.averageRating.toStringAsFixed(1)} star rating',
      child: Card(
        elevation: 4,
        shadowColor: Colors.black.withValues(alpha:0.2),
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: InkWell(
          onTap: onTap != null
              ? () async {
                  await HapticFeedbackUtil.lightImpact();
                  onTap!();
                }
              : null,
          child: Stack(
            children: [
              // Background Image
              Hero(
                tag: 'band_image_${band.id}',
                child: SizedBox(
                  height: 200,
                  width: double.infinity,
                  child: band.imageUrl != null
                      ? CachedNetworkImage(
                          imageUrl: band.imageUrl!,
                          fit: BoxFit.cover,
                          placeholder: (context, url) => Container(
                            color: AppTheme.background,
                            child: const Center(
                              child: CircularProgressIndicator(),
                            ),
                          ),
                          errorWidget: (context, url, error) => _buildPlaceholder(),
                        )
                      : _buildPlaceholder(),
                ),
              ),

              // Gradient Scrim
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha:0.2),
                        Colors.black.withValues(alpha:0.8),
                      ],
                      stops: const [0.4, 0.6, 1.0],
                    ),
                  ),
                ),
              ),

              // Content Overlay
              Positioned(
                bottom: 16,
                left: 16,
                right: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      band.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        shadows: [
                          Shadow(
                            offset: Offset(0, 1),
                            blurRadius: 4,
                            color: Colors.black45,
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    if (band.genre != null)
                      Row(
                        children: [
                          const Icon(
                            Icons.music_note,
                            color: AppTheme.accentTeal,
                            size: 14,
                          ),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha:0.2),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: Colors.white.withValues(alpha:0.3),
                                width: 0.5,
                              ),
                            ),
                            child: Text(
                              band.genre!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        StarRating(
                          rating: band.averageRating,
                          size: 16,
                          color: AppTheme.accentOrange,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '(${band.totalCheckins})',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlaceholder() {
    return Container(
      color: AppTheme.surfaceVariant,
      child: const Center(
        child: Icon(
          Icons.music_video,
          size: 48,
          color: AppTheme.textSecondary,
        ),
      ),
    );
  }
}
