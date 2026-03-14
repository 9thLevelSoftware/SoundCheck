import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/analytics_service.dart';
import '../subscription_service.dart';
import '../subscription_providers.dart';

void showPremiumPaywallSheet(BuildContext context) {
  AnalyticsService.logEvent(name: 'paywall_viewed');
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (context) => const PremiumPaywallSheet(),
  );
}

class PremiumPaywallSheet extends ConsumerStatefulWidget {
  const PremiumPaywallSheet({super.key});

  @override
  ConsumerState<PremiumPaywallSheet> createState() =>
      _PremiumPaywallSheetState();
}

class _PremiumPaywallSheetState extends ConsumerState<PremiumPaywallSheet> {
  bool _isPurchasing = false;
  bool _isRestoring = false;

  Future<void> _onSubscribe() async {
    setState(() => _isPurchasing = true);
    try {
      final packages = await ref.read(packagesProvider.future);
      if (packages.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Subscriptions not available')),
          );
        }
        return;
      }
      final customerInfo = await SubscriptionService.purchase(packages.first);
      if (customerInfo != null && mounted) {
        final hasPro =
            customerInfo.entitlements.all['pro']?.isActive ?? false;
        if (hasPro) {
          ref.read(isPremiumProvider.notifier).set(true);
          AnalyticsService.logEvent(name: 'subscription_started');
          Navigator.of(context).pop();
        }
      }
      // null = user cancelled, do nothing silently
    } on PlatformException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Purchase failed: ${e.message}')),
        );
      }
    } finally {
      if (mounted) setState(() => _isPurchasing = false);
    }
  }

  Future<void> _onRestore() async {
    setState(() => _isRestoring = true);
    try {
      final customerInfo = await SubscriptionService.restorePurchases();
      if (mounted) {
        if (customerInfo != null) {
          final hasPro =
              customerInfo.entitlements.all['pro']?.isActive ?? false;
          if (hasPro) {
            ref.read(isPremiumProvider.notifier).set(true);
            AnalyticsService.logEvent(name: 'subscription_restored');
            Navigator.of(context).pop();
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('No active subscription found')),
            );
          }
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('No previous purchases found')),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _isRestoring = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textTertiary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Unlock SoundCheck Pro',
              style: TextStyle(
                color: AppTheme.voltLime,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            _perkRow(Icons.analytics_outlined, 'Detailed Wrapped analytics'),
            _perkRow(Icons.share_outlined, 'Per-stat share cards'),
            _perkRow(Icons.history, 'Wrapped archive'),
            _perkRow(Icons.insights, 'Year-round analytics'),
            const SizedBox(height: 20),
            const Text(
              '\$4.99/mo or \$39.99/yr',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isPurchasing ? null : _onSubscribe,
                child: _isPurchasing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Theme.of(context).scaffoldBackgroundColor,
                        ),
                      )
                    : const Text('Subscribe'),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: _isRestoring ? null : _onRestore,
              child:
                  Text(_isRestoring ? 'Restoring...' : 'Restore Purchases'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _perkRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, color: AppTheme.voltLime, size: 20),
          const SizedBox(width: 12),
          Text(
            text,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}
