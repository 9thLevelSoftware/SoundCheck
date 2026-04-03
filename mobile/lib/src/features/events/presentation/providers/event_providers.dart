import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../data/rsvp_repository.dart';

part 'event_providers.g.dart';

/// RSVP repository provider (keepAlive for consistency with other repositories)
@Riverpod(keepAlive: true)
RsvpRepository rsvpRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return RsvpRepository(dioClient: dioClient);
}

/// User's RSVP'd event IDs (batch check for event list indicators).
/// Auto-dispose so it refetches on re-entry.
@riverpod
Future<Set<String>> userRsvps(Ref ref) async {
  final repo = ref.watch(rsvpRepositoryProvider);
  final result = await repo.getUserRsvps();
  return result.fold(
    (failure) => throw Exception(failure.message),
    (eventIds) => eventIds,
  );
}

/// Friends going to a specific event (family provider keyed by eventId).
/// Used on event detail screens.
@riverpod
Future<FriendsGoingData> friendsGoing(Ref ref, String eventId) async {
  final repo = ref.watch(rsvpRepositoryProvider);
  final result = await repo.getFriendsGoing(eventId);
  return result.fold(
    (failure) => throw Exception(failure.message),
    (data) => data,
  );
}
