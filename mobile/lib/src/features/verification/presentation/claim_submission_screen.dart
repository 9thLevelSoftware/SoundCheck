import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import 'providers/claim_providers.dart';

/// Full-screen form for submitting a verification claim for a venue or band.
/// Route params: entityType (venue/band), entityId, and entityName for display.
class ClaimSubmissionScreen extends ConsumerStatefulWidget {
  final String entityType;
  final String entityId;
  final String entityName;

  const ClaimSubmissionScreen({
    required this.entityType,
    required this.entityId,
    required this.entityName,
    super.key,
  });

  @override
  ConsumerState<ClaimSubmissionScreen> createState() =>
      _ClaimSubmissionScreenState();
}

class _ClaimSubmissionScreenState extends ConsumerState<ClaimSubmissionScreen> {
  final _evidenceTextController = TextEditingController();
  final _evidenceUrlController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _evidenceTextController.dispose();
    _evidenceUrlController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;

    setState(() => _isSubmitting = true);

    try {
      final repo = ref.read(claimRepositoryProvider);
      await repo.submitClaim(
        entityType: widget.entityType,
        entityId: widget.entityId,
        evidenceText: _evidenceTextController.text.trim(),
        evidenceUrl: _evidenceUrlController.text.trim(),
      );

      if (mounted) {
        // Invalidate claims list so it refreshes
        ref.invalidate(myClaimsProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Claim submitted! We\'ll review it shortly.'),
            backgroundColor: AppTheme.voltLime,
          ),
        );
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceFirst('Exception: ', '')),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final entityLabel = widget.entityType == 'venue' ? 'venue' : 'band';

    return Scaffold(
      appBar: AppBar(
        title: Text('Claim ${widget.entityName}'),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Info card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.info.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppTheme.info.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.info_outline,
                    color: AppTheme.info,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Verify that you own or manage this $entityLabel. '
                      'An admin will review your claim.',
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 14,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Evidence text field
            const Text(
              'Your Connection',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _evidenceTextController,
              maxLines: 4,
              style: const TextStyle(color: AppTheme.textPrimary),
              decoration: InputDecoration(
                hintText:
                    'Explain your connection to this $entityLabel...',
                hintStyle: const TextStyle(color: AppTheme.textTertiary),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surfaceContainerHigh,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: AppTheme.voltLime,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Evidence URL field
            const Text(
              'Supporting Link (optional)',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _evidenceUrlController,
              style: const TextStyle(color: AppTheme.textPrimary),
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                hintText: 'Link to your official website or social media',
                hintStyle: const TextStyle(color: AppTheme.textTertiary),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surfaceContainerHigh,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  ),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(
                    color: AppTheme.voltLime,
                  ),
                ),
                prefixIcon: const Icon(
                  Icons.link,
                  color: AppTheme.textTertiary,
                ),
              ),
            ),
            const SizedBox(height: 32),

            // Submit button
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.voltLime,
                  foregroundColor: Theme.of(context).scaffoldBackgroundColor,
                  disabledBackgroundColor:
                      AppTheme.voltLime.withValues(alpha: 0.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isSubmitting
                    ? SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Theme.of(context).scaffoldBackgroundColor,
                        ),
                      )
                    : const Text(
                        'Submit Claim',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
