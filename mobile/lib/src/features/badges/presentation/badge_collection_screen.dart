import 'dart:async';

import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:percent_indicator/circular_percent_indicator.dart';

import '../../../core/providers/providers.dart';
import '../../../core/services/websocket_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/utils/a11y_utils.dart';
import '../domain/badge.dart';
import 'badge_providers.dart';

/// Display name for each badge category
String categoryDisplayName(BadgeCategory category) {
  switch (category) {
    case BadgeCategory.checkinCount:
      return 'Milestone';
    case BadgeCategory.genreExplorer:
      return 'Genre Explorer';
    case BadgeCategory.uniqueVenues:
      return 'Venue Collector';
    case BadgeCategory.superfan:
      return 'Superfan';
    case BadgeCategory.festivalWarrior:
      return 'Festival Warrior';
    case BadgeCategory.roadWarrior:
      return 'Road Warrior';
  }
}

/// Parse a hex color string (e.g. "#FF5733") to a Color
Color parseHexColor(String? hex) {
  if (hex == null || hex.isEmpty) return Colors.blueGrey;
  final hexCode = hex.replaceAll('#', '');
  if (hexCode.length != 6) return Colors.blueGrey;
  return Color(int.parse('FF$hexCode', radix: 16));
}

/// Full-screen badge collection view with category-grouped display,
/// progress rings, rarity indicators, and WebSocket badge-earned toast.
class BadgeCollectionScreen extends ConsumerStatefulWidget {
  const BadgeCollectionScreen({super.key});

  @override
  ConsumerState<BadgeCollectionScreen> createState() =>
      _BadgeCollectionScreenState();
}

class _BadgeCollectionScreenState extends ConsumerState<BadgeCollectionScreen> {
  StreamSubscription<WebSocketMessage>? _badgeSubscription;

  @override
  void initState() {
    super.initState();
    _listenForBadgeEarned();
  }

  @override
  void dispose() {
    _badgeSubscription?.cancel();
    super.dispose();
  }

  void _listenForBadgeEarned() {
    final wsService = ref.read(webSocketServiceProvider);
    _badgeSubscription = wsService.messageStream
        .where((msg) => msg.type == WebSocketEvents.badgeEarned)
        .listen((msg) {
      if (!mounted) return;
      final badgeName = msg.payload['badgeName'] as String? ?? 'New Badge';
      final badgeColor = parseHexColor(msg.payload['color'] as String?);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.emoji_events, color: Colors.white),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Badge Earned: $badgeName',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          backgroundColor: badgeColor,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
        ),
      );

      // Refresh badge data after earning a new badge
      ref.invalidate(badgeProgressProvider);
      ref.invalidate(badgeRarityProvider);
      ref.invalidate(badgeCollectionProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final collectionAsync = ref.watch(badgeCollectionProvider);
    final rarityAsync = ref.watch(badgeRarityProvider);

    // Build a map of badgeId -> BadgeRarity for quick lookup
    final rarityMap = <String, BadgeRarity>{};
    rarityAsync.whenData((rarities) {
      for (final r in rarities) {
        rarityMap[r.badgeId] = r;
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Badge Collection'),
      ),
      body: collectionAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(),
        ),
        error: (error, stack) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.error, size: 48),
              const SizedBox(height: 16),
              Text(
                'Failed to load badges',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  ref.invalidate(badgeCollectionProvider);
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (collection) {
          if (collection.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.emoji_events_outlined,
                    size: 64,
                    color: AppTheme.textTertiary,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'No badges available yet',
                    style: TextStyle(
                      fontSize: 16,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Check in to events to start earning badges!',
                    style: TextStyle(
                      fontSize: 14,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
              ),
            );
          }

          // Order categories consistently
          final orderedCategories = BadgeCategory.values
              .where((c) => collection.containsKey(c))
              .toList();

          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 16),
            itemCount: orderedCategories.length,
            itemBuilder: (context, index) {
              final category = orderedCategories[index];
              final badges = collection[category]!;

              return _CategorySection(
                category: category,
                badges: badges,
                rarityMap: rarityMap,
              );
            },
          );
        },
      ),
    );
  }
}

/// A section displaying a category header and horizontal badge row
class _CategorySection extends StatelessWidget {
  const _CategorySection({
    required this.category,
    required this.badges,
    required this.rarityMap,
  });

  final BadgeCategory category;
  final List<BadgeProgress> badges;
  final Map<String, BadgeRarity> rarityMap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            categoryDisplayName(category),
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
        SizedBox(
          height: 170,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: badges.length,
            itemBuilder: (context, index) {
              final bp = badges[index];
              final rarity = rarityMap[bp.badge.id];

              return _BadgeCard(
                progress: bp,
                rarity: rarity,
              );
            },
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

/// Individual badge card with progress ring, name, progress text, and rarity
class _BadgeCard extends StatelessWidget {
  const _BadgeCard({
    required this.progress,
    this.rarity,
  });

  final BadgeProgress progress;
  final BadgeRarity? rarity;

  @override
  Widget build(BuildContext context) {
    final badge = progress.badge;
    final isEarned = progress.isEarned;
    final percent = progress.requirementValue > 0
        ? (progress.currentValue / progress.requirementValue).clamp(0.0, 1.0)
        : 0.0;
    final progressColor = parseHexColor(badge.color);
    final theme = Theme.of(context);

    return Semantics(
      label: badgeSemantics(
        badgeName: badge.name,
        isEarned: isEarned,
        progress: progress.currentValue.toInt(),
        total: progress.requirementValue.toInt(),
      ),
      child: Container(
      width: 120,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      child: Opacity(
        opacity: isEarned ? 1.0 : 0.5,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Progress ring with badge icon
            Stack(
              alignment: Alignment.center,
              children: [
                CircularPercentIndicator(
                  radius: 35,
                  lineWidth: 4,
                  percent: percent,
                  center: _buildBadgeIcon(badge, progressColor),
                  progressColor: isEarned
                      ? progressColor
                      : progressColor.withValues(alpha: 0.7),
                  backgroundColor: Colors.grey[300]!,
                  circularStrokeCap: CircularStrokeCap.round,
                  animation: true,
                  animationDuration: 800,
                ),
                // Earned checkmark overlay
                if (isEarned)
                  Positioned(
                    right: 8,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                        color: AppTheme.liveGreen,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check,
                        size: 14,
                        color: Colors.white,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            // Badge name
            Text(
              badge.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isEarned ? FontWeight.w600 : FontWeight.normal,
                color: isEarned
                    ? theme.colorScheme.onSurface
                    : AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 2),
            // Progress text
            Text(
              '${progress.currentValue}/${progress.requirementValue}',
              style: TextStyle(
                fontSize: 10,
                color: AppTheme.textTertiary,
              ),
            ),
            // Rarity percentage (earned badges only)
            if (isEarned && rarity != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  '${rarity!.rarityPct.toStringAsFixed(1)}% of users',
                  style: TextStyle(
                    fontSize: 9,
                    fontStyle: FontStyle.italic,
                    color: AppTheme.textTertiary,
                  ),
                ),
              ),
          ],
        ),
        ),
      ),
    );
  }

  /// Build the center icon for the progress ring
  Widget _buildBadgeIcon(Badge badge, Color fallbackColor) {
    if (badge.iconUrl != null && badge.iconUrl!.isNotEmpty) {
      return ClipOval(
        child: Image.network(
          badge.iconUrl!,
          width: 40,
          height: 40,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              _buildLetterIcon(badge.name, fallbackColor),
        ),
      );
    }
    return _buildLetterIcon(badge.name, fallbackColor);
  }

  /// Build a colored circle with the first letter of the badge name
  Widget _buildLetterIcon(String name, Color color) {
    final letter = name.isNotEmpty ? name[0].toUpperCase() : '?';
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          letter,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ),
    );
  }
}
