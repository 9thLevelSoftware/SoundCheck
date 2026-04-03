import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/providers/providers.dart';
import '../data/subscription_repository.dart';
import '../domain/subscription_state.dart';

part 'subscription_providers.g.dart';

/// Provider for the subscription repository
@Riverpod(keepAlive: true)
SubscriptionRepository subscriptionRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return SubscriptionRepository(dioClient);
}

/// Provider for packages available for purchase
@riverpod
Future<List<Package>> packages(Ref ref) async {
  final offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

/// Provider for server-side subscription status
@riverpod
Future<SubscriptionStatus> serverSubscriptionStatus(Ref ref) async {
  final repo = ref.watch(subscriptionRepositoryProvider);
  final result = await repo.getStatus();
  return result.fold(
    (failure) => throw Exception(failure.message),
    (status) => status,
  );
}

/// Notifier for client-side premium state
@riverpod
class IsPremium extends _$IsPremium {
  @override
  bool build() => false;

  void set(bool value) => state = value;
}
