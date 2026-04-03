import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/providers/providers.dart';
import '../../sharing/data/share_repository.dart';
import '../data/wrapped_repository.dart';
import '../domain/wrapped_stats.dart';

part 'wrapped_providers.g.dart';

@Riverpod(keepAlive: true)
WrappedRepository wrappedRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return WrappedRepository(dioClient);
}

@riverpod
Future<WrappedStats> wrappedStats(Ref ref, int year) async {
  final repo = ref.watch(wrappedRepositoryProvider);
  final result = await repo.getWrappedStats(year);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (stats) => stats,
  );
}

@riverpod
Future<WrappedStats> wrappedDetail(Ref ref, int year) async {
  final repo = ref.watch(wrappedRepositoryProvider);
  final result = await repo.getWrappedDetailStats(year);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (stats) => stats,
  );
}

@riverpod
Future<ShareCardUrls> wrappedSummaryCard(Ref ref, int year) async {
  final repo = ref.watch(wrappedRepositoryProvider);
  final result = await repo.generateSummaryCard(year);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (urls) => urls,
  );
}
