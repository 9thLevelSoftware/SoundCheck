import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/providers.dart';
import '../../sharing/data/share_repository.dart';
import '../data/wrapped_repository.dart';
import '../domain/wrapped_stats.dart';

final wrappedRepositoryProvider = Provider<WrappedRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return WrappedRepository(dioClient);
});

final wrappedStatsProvider =
    FutureProvider.autoDispose.family<WrappedStats, int>((ref, year) {
  return ref.read(wrappedRepositoryProvider).getWrappedStats(year);
});

final wrappedDetailProvider =
    FutureProvider.autoDispose.family<WrappedStats, int>((ref, year) {
  return ref.read(wrappedRepositoryProvider).getWrappedDetailStats(year);
});

final wrappedSummaryCardProvider =
    FutureProvider.autoDispose.family<ShareCardUrls, int>((ref, year) {
  return ref.read(wrappedRepositoryProvider).generateSummaryCard(year);
});
