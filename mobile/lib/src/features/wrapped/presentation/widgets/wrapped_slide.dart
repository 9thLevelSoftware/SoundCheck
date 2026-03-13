import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

enum WrappedSlideType {
  topGenre,
  uniqueVenues,
  uniqueBands,
  homeVenue,
  topArtist,
  totalShows,
}

class WrappedSlide extends StatelessWidget {
  final WrappedSlideType type;
  final String headline;
  final String value;
  final String? subtitle;
  final bool isLastSlide;

  const WrappedSlide({
    required this.type, required this.headline, required this.value, super.key,
    this.subtitle,
    this.isLastSlide = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: AppTheme.backgroundDark,
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 80),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (headline.isNotEmpty)
            Text(
              headline,
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 20,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
            ),
          if (headline.isNotEmpty) const SizedBox(height: 24),
          Text(
            value,
            style: TextStyle(
              color: isLastSlide ? AppTheme.voltLime : AppTheme.textPrimary,
              fontSize: isLastSlide ? 72 : 56,
              fontWeight: FontWeight.w700,
              height: 1.1,
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 16),
            Text(
              subtitle!,
              style: const TextStyle(
                color: AppTheme.textTertiary,
                fontSize: 18,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}
