import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/providers.dart';
import '../../data/claim_repository.dart';

/// Claim repository provider.
/// Manual Riverpod providers (not @riverpod codegen) per Phase 10 decision [10-05].
final claimRepositoryProvider = Provider<ClaimRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return ClaimRepository(client: dioClient);
});

/// All claims submitted by the current user.
/// Auto-dispose so it refetches when navigating to the screen.
final myClaimsProvider =
    FutureProvider.autoDispose<List<VerificationClaim>>((ref) async {
  return ref.read(claimRepositoryProvider).getMyClaims();
});
