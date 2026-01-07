import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'settings_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/theme_provider.dart' as theme_provider;
import '../../../core/providers/providers.dart';
import '../../../core/utils/app_info.dart';

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
    final themeMode = ref.watch(theme_provider.themeSettingProvider);
    final notificationSettings = ref.watch(notificationSettingsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        elevation: 0,
        backgroundColor: Theme.of(context).cardColor,
      ),
      body: notificationSettings.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
        data: (settings) {
          final pushEnabled = settings.$1;
          final emailEnabled = settings.$2;

          return ListView(
            children: [
              // Appearance Section
              const _SectionHeader(title: 'Appearance'),
              _SettingsTile(
                title: 'Theme',
                subtitle: _getThemeModeLabel(themeMode),
                leading: const Icon(Icons.palette_outlined),
                trailing: DropdownButton<theme_provider.AppThemeMode>(
                  value: themeMode,
                  underline: const SizedBox(),
                  items: const [
                    DropdownMenuItem(
                      value: theme_provider.AppThemeMode.system,
                      child: Text('System'),
                    ),
                    DropdownMenuItem(
                      value: theme_provider.AppThemeMode.light,
                      child: Text('Light'),
                    ),
                    DropdownMenuItem(
                      value: theme_provider.AppThemeMode.dark,
                      child: Text('Dark'),
                    ),
                  ],
                  onChanged: (theme_provider.AppThemeMode? mode) {
                    if (mode != null) {
                      ref.read(theme_provider.themeSettingProvider.notifier).setTheme(mode);
                    }
                  },
                ),
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
                  _launchUrl('https://pitpulse.app/privacy');
                },
              ),
              _SettingsTile(
                title: 'Terms of Service',
                leading: const Icon(Icons.description_outlined),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  _launchUrl('https://pitpulse.app/terms');
                },
              ),
              const Divider(),

              // About Section
              const _SectionHeader(title: 'About'),
              _SettingsTile(
                title: 'About PitPulse',
                subtitle: 'Version ${AppInfo.version}',
                leading: const Icon(Icons.info_outline),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  showAboutDialog(
                    context: context,
                    applicationName: 'PitPulse',
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
                  _launchUrl('mailto:support@pitpulse.app');
                },
              ),
              const Divider(),

              // Account Section
              const _SectionHeader(title: 'Account'),
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

  String _getThemeModeLabel(theme_provider.AppThemeMode mode) {
    switch (mode) {
      case theme_provider.AppThemeMode.light:
        return 'Light';
      case theme_provider.AppThemeMode.dark:
        return 'Dark';
      case theme_provider.AppThemeMode.system:
        return 'System';
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