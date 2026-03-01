import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/theme/app_theme.dart';
import '../providers/claim_providers.dart';

/// Show the owner response bottom sheet for a review.
void showOwnerResponseBottomSheet(
  BuildContext context, {
  required String reviewId,
  required String venueId,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppTheme.cardDark,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => OwnerResponseBottomSheet(
      reviewId: reviewId,
      venueId: venueId,
    ),
  );
}

class OwnerResponseBottomSheet extends ConsumerStatefulWidget {
  const OwnerResponseBottomSheet({
    required this.reviewId,
    required this.venueId,
    super.key,
  });

  final String reviewId;
  final String venueId;

  @override
  ConsumerState<OwnerResponseBottomSheet> createState() =>
      _OwnerResponseBottomSheetState();
}

class _OwnerResponseBottomSheetState
    extends ConsumerState<OwnerResponseBottomSheet> {
  final TextEditingController _responseController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _responseController.dispose();
    super.dispose();
  }

  Future<void> _submitResponse() async {
    final text = _responseController.text.trim();
    if (text.isEmpty || _isSubmitting) return;

    setState(() => _isSubmitting = true);

    try {
      await ref
          .read(claimRepositoryProvider)
          .respondToReview(widget.reviewId, text);

      if (!mounted) return;

      // Refetch reviews to show the new response
      ref.invalidate(venueReviewsProvider(widget.venueId));

      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Response submitted'),
          backgroundColor: AppTheme.voltLime,
        ),
      );
    } on Failure catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: AppTheme.error,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to submit response'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;
    final text = _responseController.text.trim();

    return Padding(
      padding: EdgeInsets.only(bottom: bottomPadding),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Drag handle
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppTheme.textTertiary,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Title
              const Center(
                child: Text(
                  'Respond to Review',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text(
                  'Your response will be visible to all users',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Response text field
              TextField(
                controller: _responseController,
                maxLength: 1000,
                maxLines: 5,
                onChanged: (_) => setState(() {}),
                style: const TextStyle(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Write your response...',
                  hintStyle: const TextStyle(color: AppTheme.textTertiary),
                  filled: true,
                  fillColor: AppTheme.surfaceDark,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  counterStyle: const TextStyle(color: AppTheme.textTertiary),
                ),
              ),
              const SizedBox(height: 16),

              // Submit button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed:
                      text.isNotEmpty && !_isSubmitting ? _submitResponse : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    disabledBackgroundColor:
                        AppTheme.primary.withValues(alpha: 0.3),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: AppTheme.backgroundDark,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          'Submit Response',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: text.isNotEmpty
                                ? AppTheme.backgroundDark
                                : AppTheme.textTertiary,
                          ),
                        ),
                ),
              ),

              // Safety bottom padding
              SizedBox(height: MediaQuery.of(context).padding.bottom),
            ],
          ),
        ),
      ),
    );
  }
}
