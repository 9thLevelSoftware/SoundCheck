import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'settings_provider.dart';
import 'providers/profile_providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../../core/utils/app_info.dart';
import '../../../shared/widgets/error_state_widget.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationSettings = ref.watch(notificationSettingsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        elevation: 0,
        backgroundColor: Theme.of(context).cardColor,
      ),
      body: notificationSettings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(notificationSettingsProvider),
          child: ListView(
            children: [
              ErrorStateWidget(
                error: err,
                stackTrace: stack,
                onRetry: () => ref.invalidate(notificationSettingsProvider),
              ),
            ],
          ),
        ),
        data: (settings) {
          final pushEnabled = settings.$1;
          final emailEnabled = settings.$2;

          return ListView(
            children: [
              // Appearance Section
              const _SectionHeader(title: 'Appearance'),
              const _SettingsTile(
                title: 'Theme',
                subtitle: 'Dark',
                leading: Icon(Icons.palette_outlined),
                trailing: Text('Dark',
                    style: TextStyle(color: AppTheme.textSecondary),),
              ),
              const Divider(),

              // Notifications Section
              const _SectionHeader(title: 'Notifications'),
              _SettingsTile(
                title: 'Push Notifications',
                subtitle: 'New reviews, badges, and followers',
                leading: const Icon(Icons.notifications_outlined),
                trailing: Switch(
                  value: pushEnabled,
                  onChanged: (value) {
                    ref.read(notificationSettingsProvider.notifier).setPushNotifications(value);
                  },
                ),
              ),
              _SettingsTile(
                title: 'Email Notifications',
                subtitle: 'Receive occasional updates',
                leading: const Icon(Icons.email_outlined),
                trailing: Switch(
                  value: emailEnabled,
                  onChanged: (value) {
                    ref.read(notificationSettingsProvider.notifier).setEmailNotifications(value);
                  },
                ),
              ),
              const Divider(),

              // Privacy Section
              const _SectionHeader(title: 'Privacy & Legal'),
              _SettingsTile(
                title: 'Privacy Policy',
                leading: const Icon(Icons.privacy_tip_outlined),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  _launchUrl('https://soundcheck.app/privacy');
                },
              ),
              _SettingsTile(
                title: 'Terms of Service',
                leading: const Icon(Icons.description_outlined),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  _launchUrl('https://soundcheck.app/terms');
                },
              ),
              _SettingsTile(
                title: 'Blocked Users',
                subtitle: 'Manage blocked users',
                leading: const Icon(Icons.block),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/profile/settings/blocked-users'),
              ),
              _SettingsTile(
                title: 'My Claims',
                subtitle: 'View your venue and band claims',
                leading: const Icon(Icons.verified_outlined),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/profile/settings/my-claims'),
              ),
              const Divider(),

              // About Section
              const _SectionHeader(title: 'About'),
              _SettingsTile(
                title: 'About SoundCheck',
                subtitle: 'Version ${AppInfo.version}',
                leading: const Icon(Icons.info_outline),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  showAboutDialog(
                    context: context,
                    applicationName: 'SoundCheck',
                    applicationVersion: AppInfo.version,
                    applicationIcon: const Icon(
                      Icons.music_note,
                      size: 48,
                      color: AppTheme.primary,
                    ),
                    children: [
                      const Text(
                        'Discover and review concert venues and bands. '
                        'Share your experiences with the music community.',
                      ),
                    ],
                  );
                },
              ),
               _SettingsTile(
                title: 'Contact Support',
                leading: const Icon(Icons.support_agent_outlined),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  _launchUrl('mailto:support@soundcheck.app');
                },
              ),
              const Divider(),

              // Account Section
              const _SectionHeader(title: 'Account'),
              _SettingsTile(
                title: 'Delete Account',
                subtitle: 'Permanently remove your account and data',
                leading: const Icon(Icons.delete_forever, color: AppTheme.error),
                textColor: AppTheme.error,
                onTap: () => _showDeleteAccountDialog(context, ref),
              ),
              _SettingsTile(
                title: 'Logout',
                leading: const Icon(Icons.logout, color: AppTheme.error),
                textColor: AppTheme.error,
                onTap: () async {
                  final shouldLogout = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Logout'),
                      content: const Text('Are you sure you want to logout?'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(false),
                          child: const Text('Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.of(context).pop(true),
                          child: const Text(
                            'Logout',
                            style: TextStyle(color: AppTheme.error),
                          ),
                        ),
                      ],
                    ),
                  );

                  if (shouldLogout == true && context.mounted) {
                    await ref.read(authStateProvider.notifier).logout();
                    if (context.mounted) {
                      context.go('/login');
                    }
                  }
                },
              ),
              const SizedBox(height: AppTheme.spacing32),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showDeleteAccountDialog(BuildContext context, WidgetRef ref) async {
    final shouldDelete = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Account?'),
        content: const Text(
          'Your account will be deactivated immediately and permanently '
          'deleted after 30 days. During this period, you can cancel by '
          'logging back in.\n\nThis action cannot be undone after 30 days.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(
              'Delete My Account',
              style: TextStyle(color: AppTheme.error),
            ),
          ),
        ],
      ),
    );

    if (shouldDelete == true && context.mounted) {
      try {
        final accountRepo = ref.read(accountRepositoryProvider);
        await accountRepo.requestAccountDeletion();
        await ref.read(authStateProvider.notifier).logout();
        if (context.mounted) {
          context.go('/login');
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete account: $e'),
              backgroundColor: AppTheme.error,
            ),
          );
        }
      }
    }
  }

}

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppTheme.spacing16,
        AppTheme.spacing24,
        AppTheme.spacing16,
        AppTheme.spacing8,
      ),
      child: Text(
        title.toUpperCase(),
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: AppTheme.primary,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? textColor;

  const _SettingsTile({
    required this.title,
    required this.leading,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: leading,
      title: Text(
        title,
        style: TextStyle(color: textColor, fontWeight: FontWeight.w500),
      ),
      subtitle: subtitle != null ? Text(subtitle!, style: Theme.of(context).textTheme.bodySmall) : null,
      trailing: trailing,
      onTap: onTap,
    );
  }
}