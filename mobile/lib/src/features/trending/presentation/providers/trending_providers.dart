import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/providers.dart';
import '../../data/trending_repository.dart';

/// Trending repository provider (manual, matching Phase 10 pattern).
final trendingRepositoryProvider = Provider<TrendingRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return TrendingRepository(dioClient: dioClient);
});

/// Trending events near user location.
/// Auto-dispose so it refetches on re-entry to the discover screen.
final trendingFeedProvider =
    FutureProvider.autoDispose<List<TrendingEvent>>((ref) async {
  final repo = ref.read(trendingRepositoryProvider);
  final position = await ref.watch(currentLocationProvider.future);
  if (position == null) return [];
  return repo.getTrendingNearby(
    lat: position.latitude,
    lon: position.longitude,
  );
});
