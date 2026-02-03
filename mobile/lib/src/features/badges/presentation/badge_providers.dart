import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/providers/providers.dart';
import '../domain/badge.dart';

part 'badge_providers.g.dart';

@riverpod
Future<List<BadgeProgress>> badgeProgress(Ref ref) async {
  final repo = ref.watch(badgeRepositoryProvider);
  return repo.getMyProgress();
}

@riverpod
Future<List<BadgeRarity>> badgeRarity(Ref ref) async {
  final repo = ref.watch(badgeRepositoryProvider);
  return repo.getRarity();
}

/// Combined provider that groups badge progress by category
@riverpod
Future<Map<BadgeCategory, List<BadgeProgress>>> badgeCollection(Ref ref) async {
  final progress = await ref.watch(badgeProgressProvider.future);
  final grouped = <BadgeCategory, List<BadgeProgress>>{};
  for (final bp in progress) {
    grouped.putIfAbsent(bp.badge.category, () => []).add(bp);
  }
  // Sort each group by requirementValue ascending
  for (final list in grouped.values) {
    list.sort((a, b) => a.requirementValue.compareTo(b.requirementValue));
  }
  return grouped;
}
