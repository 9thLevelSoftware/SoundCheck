import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/providers/providers.dart';
import '../data/share_repository.dart';

part 'share_providers.g.dart';

/// Provides the ShareRepository with DioClient injection.
@Riverpod(keepAlive: true)
ShareRepository shareRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return ShareRepository(dioClient);
}

/// Generates check-in share card images on demand.
/// Auto-disposes when the widget consuming it unmounts.
@riverpod
Future<ShareCardUrls> checkinCard(Ref ref, String checkinId) async {
  final repo = ref.watch(shareRepositoryProvider);
  final result = await repo.generateCheckinCard(checkinId);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (urls) => urls,
  );
}

/// Generates badge share card images on demand.
/// Auto-disposes when the widget consuming it unmounts.
@riverpod
Future<ShareCardUrls> badgeCard(Ref ref, String badgeAwardId) async {
  final repo = ref.watch(shareRepositoryProvider);
  final result = await repo.generateBadgeCard(badgeAwardId);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (urls) => urls,
  );
}
