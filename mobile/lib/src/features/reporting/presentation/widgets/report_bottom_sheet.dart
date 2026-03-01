import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failures.dart';
import '../../../../core/theme/app_theme.dart';
import '../providers/report_providers.dart';

/// Report reasons matching the backend enum exactly.
enum ReportReason {
  spam('spam', 'Spam', 'Unsolicited or repetitive content'),
  harassment('harassment', 'Harassment', 'Bullying, threats, or targeted abuse'),
  inappropriate('inappropriate', 'Inappropriate', 'Offensive or unsuitable content'),
  copyright('copyright', 'Copyright', 'Unauthorized use of copyrighted material'),
  other('other', 'Other', 'Another reason not listed above');

  const ReportReason(this.value, this.label, this.description);

  final String value;
  final String label;
  final String description;
}

/// Show the report bottom sheet for any content type.
///
/// [contentType]: 'checkin' | 'comment' | 'photo' | 'user'
/// [contentId]: ID of the content being reported (for photos, use the check-in ID)
void showReportBottomSheet(
  BuildContext context, {
  required String contentType,
  required String contentId,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppTheme.cardDark,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => ReportBottomSheet(
      contentType: contentType,
      contentId: contentId,
    ),
  );
}

/// Reusable report bottom sheet with reason picker and optional description.
class ReportBottomSheet extends ConsumerStatefulWidget {
  const ReportBottomSheet({
    required this.contentType,
    required this.contentId,
    super.key,
  });

  final String contentType;
  final String contentId;

  @override
  ConsumerState<ReportBottomSheet> createState() => _ReportBottomSheetState();
}

class _ReportBottomSheetState extends ConsumerState<ReportBottomSheet> {
  ReportReason? _selectedReason;
  final TextEditingController _descriptionController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  String get _title {
    switch (widget.contentType) {
      case 'checkin':
        return 'Report Check-in';
      case 'comment':
        return 'Report Comment';
      case 'photo':
        return 'Report Photo';
      case 'user':
        return 'Report User';
      default:
        return 'Report Content';
    }
  }

  Future<void> _submitReport() async {
    if (_selectedReason == null || _isSubmitting) return;

    setState(() => _isSubmitting = true);

    try {
      await ref.read(reportRepositoryProvider).submitReport(
            contentType: widget.contentType,
            contentId: widget.contentId,
            reason: _selectedReason!.value,
            description: _descriptionController.text.trim().isNotEmpty
                ? _descriptionController.text.trim()
                : null,
          );

      if (!mounted) return;

      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Report submitted successfully. Our team will review it shortly.',
          ),
          backgroundColor: AppTheme.voltLime,
        ),
      );
    } on Failure catch (e) {
      if (!mounted) return;

      setState(() => _isSubmitting = false);

      // Handle duplicate report (409 maps to ServerFailure with backend message)
      final isDuplicate = e.message.toLowerCase().contains('already reported');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            isDuplicate
                ? "You've already reported this content"
                : e.message,
          ),
          backgroundColor: AppTheme.error,
        ),
      );

      if (isDuplicate) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (!mounted) return;

      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to submit report. Please try again.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;

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
              Center(
                child: Text(
                  _title,
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              const Center(
                child: Text(
                  'Why are you reporting this content?',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Reason options
              ...ReportReason.values.map(
                (reason) => _ReasonTile(
                  reason: reason,
                  isSelected: _selectedReason == reason,
                  onTap: () => setState(() => _selectedReason = reason),
                ),
              ),
              const SizedBox(height: 16),

              // Optional description
              const Text(
                'Additional details (optional)',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _descriptionController,
                maxLength: 500,
                maxLines: 3,
                style: const TextStyle(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Provide more context...',
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
                      _selectedReason != null && !_isSubmitting
                          ? _submitReport
                          : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.error,
                    disabledBackgroundColor:
                        AppTheme.error.withValues(alpha: 0.3),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          'Submit Report',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: _selectedReason != null
                                ? Colors.white
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

/// Individual reason tile for the report reason picker.
class _ReasonTile extends StatelessWidget {
  const _ReasonTile({
    required this.reason,
    required this.isSelected,
    required this.onTap,
  });

  final ReportReason reason;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: isSelected
                ? AppTheme.error.withValues(alpha: 0.15)
                : AppTheme.surfaceDark,
            borderRadius: BorderRadius.circular(12),
            border: isSelected
                ? Border.all(color: AppTheme.error, width: 1.5)
                : null,
          ),
          child: Row(
            children: [
              Icon(
                isSelected
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
                color: isSelected ? AppTheme.error : AppTheme.textTertiary,
                size: 22,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reason.label,
                      style: TextStyle(
                        color: isSelected
                            ? AppTheme.textPrimary
                            : AppTheme.textSecondary,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      reason.description,
                      style: const TextStyle(
                        color: AppTheme.textTertiary,
                        fontSize: 12,
                      ),
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
}
