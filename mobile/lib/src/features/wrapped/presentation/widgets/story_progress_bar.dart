import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

class StoryProgressBar extends StatelessWidget {
  final int slideCount;
  final int currentSlide;
  final AnimationController progress;

  const StoryProgressBar({
    super.key,
    required this.slideCount,
    required this.currentSlide,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(slideCount, (index) {
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: index < currentSlide
                ? _buildCompleted()
                : index == currentSlide
                    ? _buildActive()
                    : _buildUpcoming(),
          ),
        );
      }),
    );
  }

  Widget _buildCompleted() {
    return Container(
      height: 3,
      decoration: BoxDecoration(
        color: AppTheme.voltLime,
        borderRadius: BorderRadius.circular(1.5),
      ),
    );
  }

  Widget _buildActive() {
    return AnimatedBuilder(
      animation: progress,
      builder: (context, _) => ClipRRect(
        borderRadius: BorderRadius.circular(1.5),
        child: LinearProgressIndicator(
          value: progress.value,
          backgroundColor: AppTheme.textTertiary.withValues(alpha: 0.3),
          color: AppTheme.voltLime,
          minHeight: 3,
        ),
      ),
    );
  }

  Widget _buildUpcoming() {
    return Container(
      height: 3,
      decoration: BoxDecoration(
        color: AppTheme.textTertiary.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(1.5),
      ),
    );
  }
}
