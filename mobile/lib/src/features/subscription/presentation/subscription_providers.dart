import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../../../core/providers/providers.dart';
import '../data/subscription_repository.dart';
import 'subscription_service.dart';

final subscriptionRepositoryProvider = Provider<SubscriptionRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return SubscriptionRepository(dioClient);
});

/// Client-side premium state. Use ref.read(isPremiumNotifier.notifier).set(true/false).
class IsPremiumNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void set(bool value) => state = value;
}

final isPremiumProvider = NotifierProvider<IsPremiumNotifier, bool>(
  IsPremiumNotifier.new,
);

final packagesProvider = FutureProvider<List<Package>>((ref) {
  return SubscriptionService.getPackages();
});

final serverSubscriptionStatusProvider = FutureProvider((ref) {
  return ref.read(subscriptionRepositoryProvider).getStatus();
});
