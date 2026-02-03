import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../../core/providers/providers.dart';
import '../../../badges/domain/badge.dart';
import '../../../checkins/domain/checkin.dart';
import '../../domain/concert_cred.dart';

part 'profile_providers.g.dart';

/// Provider for user's recent check-ins
@riverpod
Future<List<CheckIn>> userRecentCheckins(Ref ref, String userId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getUserRecentCheckIns(userId, limit: 5);
}

/// Provider for user's genre stats (computed from check-ins)
/// @deprecated Use concertCredProvider instead for server-side genre stats.
@riverpod
Future<List<Map<String, dynamic>>> userGenreStats(Ref ref, String userId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  final checkins = await repository.getCheckIns(userId: userId, limit: 100);

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
  return repository.getMyBadges();
}

/// Provider for concert cred aggregate stats from server
@riverpod
Future<ConcertCred> concertCred(Ref ref, String userId) async {
  final repository = ref.watch(profileRepositoryProvider);
  return repository.getConcertCred(userId);
}
