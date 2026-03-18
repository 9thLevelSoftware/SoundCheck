import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// "N new check-ins" banner that appears at top of feed when WebSocket
/// delivers new items. Tapping loads the new items into the feed.
/// Animates in from top with SlideTransition (300ms duration).
class NewCheckinsBanner extends StatefulWidget {
  const NewCheckinsBanner({
    required this.count, required this.onTap, super.key,
  });

  final int count;
  final VoidCallback onTap;

  @override
  State<NewCheckinsBanner> createState() => _NewCheckinsBannerState();
}

class _NewCheckinsBannerState extends State<NewCheckinsBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, -1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    ),);
  }

  @override
  void didUpdateWidget(NewCheckinsBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.count > 0 && oldWidget.count == 0) {
      _controller.forward();
    } else if (widget.count == 0 && oldWidget.count > 0) {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.count <= 0) {
      return const SizedBox.shrink();
    }

    // Start animation if count > 0 on first build
    if (widget.count > 0 && !_controller.isCompleted) {
      _controller.forward();
    }

    return SlideTransition(
      position: _slideAnimation,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.voltLime,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: AppTheme.voltLime.withValues(alpha: 0.3),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.arrow_upward,
                size: 16,
                color: Theme.of(context).scaffoldBackgroundColor,
              ),
              const SizedBox(width: 6),
              Text(
                '${widget.count} new check-in${widget.count == 1 ? '' : 's'}',
                style: TextStyle(
                  color: Theme.of(context).scaffoldBackgroundColor,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
