import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../data/claim_repository.dart';

part 'claim_providers.g.dart';

/// Claim repository provider.
@Riverpod(keepAlive: true)
ClaimRepository claimRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return ClaimRepository(client: dioClient);
}

/// All claims submitted by the current user.
/// Auto-dispose so it refetches when navigating to the screen.
@riverpod
Future<List<VerificationClaim>> myClaims(Ref ref) async {
  final repo = ref.watch(claimRepositoryProvider);
  final result = await repo.getMyClaims();
  return result.fold(
    (failure) => throw Exception(failure.message),
    (claims) => claims,
  );
}

/// Entity stats for a claimed venue or band.
/// Keyed by "$entityType:$entityId" (e.g., "venue:abc-123").
@riverpod
Future<Map<String, dynamic>> entityStats(Ref ref, String entityType, String entityId) async {
  final repo = ref.watch(claimRepositoryProvider);
  final result = await repo.getEntityStats(entityType, entityId);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (stats) => stats,
  );
}

