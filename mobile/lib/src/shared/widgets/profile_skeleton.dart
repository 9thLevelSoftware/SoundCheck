import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_theme.dart';

/// Skeleton loading state for Profile screen
class ProfileSkeleton extends StatelessWidget {
  const ProfileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final baseColor = isDark ? Theme.of(context).colorScheme.surfaceContainerHighest : Colors.grey[300]!;
    final highlightColor = isDark ? Theme.of(context).colorScheme.surfaceContainerHigh : Colors.grey[100]!;
    final shapeColor = isDark ? Theme.of(context).colorScheme.surface : Colors.white;
    final iconColor = isDark ? AppTheme.textMuted : Colors.grey[300];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppTheme.spacing16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Profile Header Skeleton
          Center(
            child: Column(
              children: [
                Shimmer.fromColors(
                  baseColor: baseColor,
                  highlightColor: highlightColor,
                  child: CircleAvatar(
                    radius: 50,
                    backgroundColor: shapeColor,
                  ),
                ),
                const SizedBox(height: AppTheme.spacing16),
                Shimmer.fromColors(
                  baseColor: baseColor,
                  highlightColor: highlightColor,
                  child: Container(
                    height: 28,
                    width: 180,
                    decoration: BoxDecoration(
                      color: shapeColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.spacing8),
                Shimmer.fromColors(
                  baseColor: baseColor,
                  highlightColor: highlightColor,
                  child: Container(
                    height: 16,
                    width: 220,
                    decoration: BoxDecoration(
                      color: shapeColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppTheme.spacing32),

          // Badges Section Skeleton
          Shimmer.fromColors(
            baseColor: baseColor,
            highlightColor: highlightColor,
            child: Container(
              height: 24,
              width: 120,
              decoration: BoxDecoration(
                color: shapeColor,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          const SizedBox(height: AppTheme.spacing16),

          // Badges Grid Skeleton
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: AppTheme.spacing16,
              mainAxisSpacing: AppTheme.spacing16,
            ),
            itemCount: 6,
            itemBuilder: (context, index) {
              return Card(
                child: Shimmer.fromColors(
                  baseColor: baseColor,
                  highlightColor: highlightColor,
                  child: Padding(
                    padding: const EdgeInsets.all(AppTheme.spacing8),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.emoji_events,
                          size: 32,
                          color: iconColor,
                        ),
                        const SizedBox(height: AppTheme.spacing4),
                        Container(
                          height: 12,
                          width: 60,
                          decoration: BoxDecoration(
                            color: shapeColor,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
