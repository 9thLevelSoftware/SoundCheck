import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/theme/app_theme.dart';
import '../../features/venues/domain/venue.dart';
import '../utils/haptic_feedback.dart';
import 'star_rating.dart';

class VenueCard extends StatelessWidget {
  final Venue venue;
  final VoidCallback? onTap;

  const VenueCard({
    required this.venue,
    super.key,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final location = [venue.city, venue.state]
        .where((e) => e != null)
        .join(', ');

    return Semantics(
      button: true,
      enabled: onTap != null,
      label: 'Venue: ${venue.name}${location.isNotEmpty ? ', located in $location' : ''}, ${venue.averageRating.toStringAsFixed(1)} star rating',
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
                tag: 'venue_image_${venue.id}',
                child: SizedBox(
                  height: 200,
                  width: double.infinity,
                  child: venue.imageUrl != null
                      ? CachedNetworkImage(
                          imageUrl: venue.imageUrl!,
                          fit: BoxFit.cover,
                          placeholder: (context, url) => Container(
                            color: Theme.of(context).scaffoldBackgroundColor,
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
                      venue.name,
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
                    if (location.isNotEmpty)
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on,
                            color: Colors.white70,
                            size: 14,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              location,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        StarRating(
                          rating: venue.averageRating,
                          size: 16,
                          color: AppTheme.accentOrange,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${venue.totalCheckins} check-ins',
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
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: const Center(
        child: Icon(
          Icons.location_city,
          size: 48,
          color: AppTheme.textSecondary,
        ),
      ),
    );
  }
}
