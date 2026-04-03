import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../data/trending_repository.dart';

part 'trending_providers.g.dart';

/// Trending repository provider.
@Riverpod(keepAlive: true)
TrendingRepository trendingRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return TrendingRepository(dioClient: dioClient);
}

/// Trending events near user location.
/// Auto-dispose so it refetches on re-entry to the discover screen.
@riverpod
Future<List<TrendingEvent>> trendingFeed(Ref ref) async {
  final repo = ref.watch(trendingRepositoryProvider);
  final position = await ref.watch(currentLocationProvider.future);
  if (position == null) return [];
  
  final result = await repo.getTrendingNearby(
    lat: position.latitude,
    lon: position.longitude,
  );
  
  return result.fold(
    (failure) => throw Exception(failure.message),
    (events) => events,
  );
}
