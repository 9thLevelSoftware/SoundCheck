import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/providers/providers.dart';
import '../domain/badge.dart';

part 'badge_providers.g.dart';

@riverpod
Future<List<BadgeProgress>> badgeProgress(Ref ref) async {
  final repo = ref.watch(badgeRepositoryProvider);
  final result = await repo.getMyProgress();
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
}

@riverpod
Future<List<BadgeRarity>> badgeRarity(Ref ref) async {
  final repo = ref.watch(badgeRepositoryProvider);
  final result = await repo.getRarity();
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
}

/// User's earned badges (UserBadge records with award IDs).
/// Used to look up badge award IDs for sharing.
@riverpod
Future<List<UserBadge>> myBadges(Ref ref) async {
  final repo = ref.watch(badgeRepositoryProvider);
  final result = await repo.getMyBadges();
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
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
