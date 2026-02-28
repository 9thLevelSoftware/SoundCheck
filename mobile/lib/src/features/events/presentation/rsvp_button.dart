import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import 'providers/event_providers.dart';

/// "I'm Going" toggle button for RSVP on events.
/// Shows filled state when user has RSVP'd, outlined when not.
/// Optimistic update with provider invalidation on success.
class RsvpButton extends ConsumerStatefulWidget {
  final String eventId;
  const RsvpButton({required this.eventId, super.key});

  @override
  ConsumerState<RsvpButton> createState() => _RsvpButtonState();
}

class _RsvpButtonState extends ConsumerState<RsvpButton> {
  bool _isToggling = false;

  Future<void> _toggleRsvp() async {
    if (_isToggling) return;

    setState(() => _isToggling = true);

    try {
      await ref.read(rsvpRepositoryProvider).toggleRsvp(widget.eventId);
      // Invalidate to refresh RSVP state from server
      ref.invalidate(userRsvpsProvider);
      ref.invalidate(friendsGoingProvider(widget.eventId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update RSVP. Try again.')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isToggling = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final userRsvps = ref.watch(userRsvpsProvider);
    final isGoing = userRsvps.value?.contains(widget.eventId) ?? false;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      child: ElevatedButton.icon(
        onPressed: _isToggling ? null : _toggleRsvp,
        icon: _isToggling
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppTheme.voltLime,
                ),
              )
            : Icon(
                isGoing ? Icons.check_circle : Icons.add_circle_outline,
              ),
        label: Text(isGoing ? "I'm Going!" : "I'm Going"),
        style: ElevatedButton.styleFrom(
          backgroundColor:
              isGoing ? AppTheme.voltLime : Colors.transparent,
          foregroundColor:
              isGoing ? AppTheme.backgroundDark : AppTheme.voltLime,
          side: const BorderSide(color: AppTheme.voltLime),
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusFull),
          ),
        ),
      ),
    );
  }
}
