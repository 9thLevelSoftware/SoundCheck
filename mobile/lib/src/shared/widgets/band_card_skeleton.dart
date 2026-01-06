import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_theme.dart';

/// Skeleton loading state for BandCard
class BandCardSkeleton extends StatelessWidget {
  const BandCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseColor = isDark ? AppTheme.surfaceVariantDark : Colors.grey[300]!;
    final highlightColor = isDark ? AppTheme.cardDark : Colors.grey[100]!;
    final shapeColor = isDark ? AppTheme.surfaceDark : Colors.white;
    final iconColor = isDark ? AppTheme.textMuted : Colors.grey[300];

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Image skeleton
          Shimmer.fromColors(
            baseColor: baseColor,
            highlightColor: highlightColor,
            child: Container(
              height: 120,
              width: double.infinity,
              color: shapeColor,
            ),
          ),

          // Content skeleton
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacing12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title skeleton
                Shimmer.fromColors(
                  baseColor: baseColor,
                  highlightColor: highlightColor,
                  child: Container(
                    height: 20,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: shapeColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.spacing8),

                // Genre skeleton
                Shimmer.fromColors(
                  baseColor: baseColor,
                  highlightColor: highlightColor,
                  child: Container(
                    height: 14,
                    width: 120,
                    decoration: BoxDecoration(
                      color: shapeColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.spacing8),

                // Rating skeleton
                Row(
                  children: [
                    Shimmer.fromColors(
                      baseColor: baseColor,
                      highlightColor: highlightColor,
                      child: Row(
                        children: List.generate(
                          5,
                          (index) => Padding(
                            padding: const EdgeInsets.only(right: 2),
                            child: Icon(
                              Icons.star,
                              size: 16,
                              color: iconColor,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: AppTheme.spacing8),
                    Shimmer.fromColors(
                      baseColor: baseColor,
                      highlightColor: highlightColor,
                      child: Container(
                        height: 12,
                        width: 30,
                        decoration: BoxDecoration(
                          color: shapeColor,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
