import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/services/analytics_service.dart';
import 'subscription_service.dart';
import 'subscription_providers.dart';

class ProFeatureScreen extends ConsumerStatefulWidget {
  const ProFeatureScreen({super.key});

  @override
  ConsumerState<ProFeatureScreen> createState() => _ProFeatureScreenState();
}

class _ProFeatureScreenState extends ConsumerState<ProFeatureScreen> {
  bool _isPurchasing = false;
  bool _isRestoring = false;

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  void initState() {
    super.initState();
    AnalyticsService.logEvent(name: 'subscription_viewed');
  }

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
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Welcome to SoundCheck Pro!')),
          );
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
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Purchases restored!')),
            );
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
    final isPremium = ref.watch(isPremiumProvider);

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        title: const Text('SoundCheck Pro'),
        backgroundColor: AppTheme.backgroundDark,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Icon(Icons.auto_awesome, color: AppTheme.voltLime, size: 48),
            const SizedBox(height: 16),
            const Text(
              'SoundCheck Pro',
              style: TextStyle(
                color: AppTheme.voltLime,
                fontSize: 28,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              isPremium
                  ? "You're a Pro member!"
                  : 'Unlock the full concert experience',
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 32),
            _PerkCard(
              icon: Icons.analytics_outlined,
              title: 'Detailed Wrapped Analytics',
              description:
                  'Monthly breakdown, genre evolution, friend overlap',
            ),
            _PerkCard(
              icon: Icons.share_outlined,
              title: 'Per-Stat Share Cards',
              description: 'Share individual Wrapped stats to social',
            ),
            _PerkCard(
              icon: Icons.history,
              title: 'Wrapped Archive',
              description: "Browse previous years' Wrapped",
            ),
            _PerkCard(
              icon: Icons.insights,
              title: 'Year-Round Analytics',
              description: 'Detailed concert analytics anytime',
            ),
            const SizedBox(height: 32),
            if (!isPremium) ...[
              const Text(
                '\$4.99/mo or \$39.99/yr',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Save ~33% with annual (2 months free)',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 24),
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
                            color: AppTheme.backgroundDark,
                          ),
                        )
                      : const Text('Subscribe'),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _isRestoring ? null : _onRestore,
                child: Text(_isRestoring
                    ? 'Restoring...'
                    : 'Restore Purchases'),
              ),
            ] else ...[
              const Icon(Icons.check_circle,
                  color: AppTheme.voltLime, size: 48),
              const SizedBox(height: 8),
              const Text(
                'All Pro features are unlocked',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
              ),
            ],
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(
                  onPressed: () => _launchUrl('https://soundcheck.app/terms'),
                  child: const Text('Terms of Service',
                      style: TextStyle(fontSize: 12)),
                ),
                const Text(' | ',
                    style: TextStyle(color: AppTheme.textTertiary)),
                TextButton(
                  onPressed: () => _launchUrl('https://soundcheck.app/privacy'),
                  child: const Text('Privacy Policy',
                      style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PerkCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;

  const _PerkCard({
    required this.icon,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.cardDark,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppTheme.voltLime, size: 28),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    )),
                const SizedBox(height: 2),
                Text(description,
                    style: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 13,
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
