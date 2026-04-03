import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../../badges/domain/badge.dart';
import '../../../checkins/domain/checkin.dart';
import '../../data/account_repository.dart';
import '../../domain/concert_cred.dart';

part 'profile_providers.g.dart';

/// Provider for account repository (deletion, cancellation)
@Riverpod(keepAlive: true)
AccountRepository accountRepository(Ref ref) {
  return AccountRepository(ref.watch(dioClientProvider));
}

/// Provider for user's recent check-ins
@riverpod
Future<List<CheckIn>> userRecentCheckins(Ref ref, String userId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  final result = await repository.getUserRecentCheckIns(userId, limit: 5);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
}

/// Provider for user's genre stats (computed from check-ins)
/// @deprecated Use concertCredProvider instead for server-side genre stats.
@riverpod
Future<List<Map<String, dynamic>>> userGenreStats(Ref ref, String userId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  final result = await repository.getCheckIns(userId: userId, limit: 100);

  final checkins = result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );

  // Compute genre counts
  final genreCounts = <String, int>{};
  for (final checkin in checkins) {
    final genre = checkin.band?.genre ?? 'Other';
    genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
  }

  // Sort by count and compute percentages
  final total = checkins.length;
  final sortedGenres = genreCounts.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));

  return sortedGenres.take(5).map((e) => {
    'name': e.key,
    'count': e.value,
    'percent': total > 0 ? e.value / total : 0.0,
  },).toList();
}

/// Provider for user's earned badges
@riverpod
Future<List<UserBadge>> userBadges(Ref ref, String userId) async {
  final repository = ref.watch(badgeRepositoryProvider);
  final result = await repository.getUserBadges(userId);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
}

/// Provider for concert cred aggregate stats from server
@riverpod
Future<ConcertCred> concertCred(Ref ref, String userId) async {
  final repository = ref.watch(profileRepositoryProvider);
  final result = await repository.getConcertCred(userId);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
}
