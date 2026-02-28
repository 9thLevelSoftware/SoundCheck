import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/providers.dart';
import '../../data/rsvp_repository.dart';

/// RSVP repository provider (keepAlive for consistency with other repositories)
final rsvpRepositoryProvider = Provider<RsvpRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return RsvpRepository(dioClient: dioClient);
});

/// User's RSVP'd event IDs (batch check for event list indicators).
/// Auto-dispose so it refetches on re-entry.
final userRsvpsProvider = FutureProvider.autoDispose<Set<String>>((ref) async {
  return ref.watch(rsvpRepositoryProvider).getUserRsvps();
});

/// Friends going to a specific event (family provider keyed by eventId).
/// Used on event detail screens.
final friendsGoingProvider =
    FutureProvider.autoDispose.family<FriendsGoingData, String>(
  (ref, eventId) async {
    return ref.watch(rsvpRepositoryProvider).getFriendsGoing(eventId);
  },
);
