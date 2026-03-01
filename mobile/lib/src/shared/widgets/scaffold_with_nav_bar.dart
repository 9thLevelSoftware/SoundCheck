import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_theme.dart';
import '../../features/notifications/presentation/providers/notification_providers.dart';

/// A scaffold with a custom bottom navigation bar featuring:
/// - 5 tabs: Feed, Discover, [Check-In Button], Profile, Notifications
/// - A floating Check-In button that breaks the nav bar boundary
class ScaffoldWithNavBar extends StatelessWidget {
  const ScaffoldWithNavBar({
    required this.navigationShell,
    super.key,
  });

  final StatefulNavigationShell navigationShell;

  void _onTap(BuildContext context, int index) {
    // Index 2 is the check-in button (center), handled separately
    if (index == 2) {
      // Navigate to check-in screen
      context.push('/checkin');
      return;
    }

    // Adjust index for branches since check-in is not a branch
    final branchIndex = index > 2 ? index - 1 : index;

    navigationShell.goBranch(
      branchIndex,
      initialLocation: branchIndex == navigationShell.currentIndex,
    );
  }

  int _getSelectedIndex() {
    // Map branch index to nav bar index (accounting for check-in button)
    final currentIndex = navigationShell.currentIndex;
    return currentIndex >= 2 ? currentIndex + 1 : currentIndex;
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _getSelectedIndex();

    return Scaffold(
      body: navigationShell,
      extendBody: true,
      bottomNavigationBar: _CustomBottomNavBar(
        selectedIndex: selectedIndex,
        onTap: (index) => _onTap(context, index),
      ),
    );
  }
}

class _CustomBottomNavBar extends StatelessWidget {
  const _CustomBottomNavBar({
    required this.selectedIndex,
    required this.onTap,
  });

  final int selectedIndex;
  final void Function(int) onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppTheme.surfaceDark : Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha:0.1),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: SizedBox(
          height: 64,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              // Background nav items
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  // Feed
                  _NavItem(
                    icon: Icons.public,
                    label: 'Feed',
                    isSelected: selectedIndex == 0,
                    onTap: () => onTap(0),
                  ),
                  // Discover
                  _NavItem(
                    icon: Icons.explore,
                    label: 'Discover',
                    isSelected: selectedIndex == 1,
                    onTap: () => onTap(1),
                  ),
                  // Spacer for check-in button
                  const SizedBox(width: 72),
                  // Profile
                  _NavItem(
                    icon: Icons.person,
                    label: 'Profile',
                    isSelected: selectedIndex == 3,
                    onTap: () => onTap(3),
                  ),
                  // Notifications
                  Consumer(
                    builder: (context, ref, child) {
                      final unreadCount = ref.watch(unreadNotificationCountProvider);
                      return _NavItem(
                        icon: Icons.notifications,
                        label: 'Notifications',
                        isSelected: selectedIndex == 4,
                        onTap: () => onTap(4),
                        badgeCount: unreadCount.asData?.value ?? 0,
                      );
                    },
                  ),
                ],
              ),
              // Floating Check-In Button
              Positioned(
                top: -24,
                child: _CheckInButton(
                  onTap: () => onTap(2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
    this.badgeCount = 0,
  });

  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      button: true,
      selected: isSelected,
      child: Tooltip(
        message: label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Builder(
                  builder: (context) {
                    final iconSize = IconTheme.of(context).size ?? 24;
                    final iconWidget = Icon(
                      icon,
                      size: iconSize,
                      color: isSelected
                          ? AppTheme.voltLime
                          : AppTheme.textTertiary,
                    );
                    return badgeCount > 0
                        ? Badge(
                            label: Text(
                              badgeCount > 99 ? '99+' : '$badgeCount',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            backgroundColor: AppTheme.hotOrange,
                            child: iconWidget,
                          )
                        : iconWidget;
                  },
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                    color: isSelected
                        ? AppTheme.voltLime
                        : AppTheme.textTertiary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CheckInButton extends StatelessWidget {
  const _CheckInButton({
    required this.onTap,
  });

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Check in to a show',
      button: true,
      child: Tooltip(
        message: 'Check In',
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: AppTheme.primaryGradient,
              boxShadow: [
                BoxShadow(
                  color: AppTheme.voltLime.withValues(alpha:0.4),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Icon(
              Icons.add,
              color: Colors.white,
              size: 32,
            ),
          ),
        ),
      ),
    );
  }
}
