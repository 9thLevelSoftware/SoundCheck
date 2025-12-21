import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../../core/providers/providers.dart';
import '../../data/checkin_repository.dart';
import '../../domain/checkin.dart';
import '../../domain/vibe_tag.dart';
import '../../domain/toast.dart';
import '../../domain/checkin_comment.dart';

part 'checkin_providers.g.dart';

/// Provider for the social feed
@riverpod
Future<List<CheckIn>> socialFeed(SocialFeedRef ref) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getFeed();
}

/// Provider for vibe tags
@riverpod
Future<List<VibeTag>> vibeTags(VibeTagsRef ref) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getVibeTags();
}

/// Provider for band check-ins
@riverpod
Future<List<CheckIn>> bandCheckIns(BandCheckInsRef ref, String bandId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckIns(bandId: bandId);
}

/// Provider for venue check-ins
@riverpod
Future<List<CheckIn>> venueCheckIns(VenueCheckInsRef ref, String venueId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckIns(venueId: venueId);
}

/// Provider for user's check-ins
@riverpod
Future<List<CheckIn>> userCheckIns(UserCheckInsRef ref, String userId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckIns(userId: userId);
}

/// Provider for a single check-in detail
@riverpod
Future<CheckIn> checkInDetail(CheckInDetailRef ref, String checkInId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckInById(checkInId);
}

/// Provider for check-in toasts
@riverpod
Future<List<Toast>> checkInToasts(CheckInToastsRef ref, String checkInId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckInToasts(checkInId);
}

/// Provider for check-in comments
@riverpod
Future<List<CheckInComment>> checkInComments(CheckInCommentsRef ref, String checkInId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckInComments(checkInId);
}

/// Notifier for creating check-ins
@riverpod
class CreateCheckIn extends _$CreateCheckIn {
  @override
  Future<void> build() async {}

  Future<CheckIn?> submit({
    required String bandId,
    required String venueId,
    required String eventDate,
    double? venueRating,
    double? bandRating,
    String? reviewText,
    List<String>? imageUrls,
    List<String>? vibeTagIds,
  }) async {
    state = const AsyncValue.loading();

    final repository = ref.read(checkInRepositoryProvider);

    try {
      final checkIn = await repository.createCheckIn(
        CreateCheckInRequest(
          bandId: bandId,
          venueId: venueId,
          eventDate: eventDate,
          venueRating: venueRating,
          bandRating: bandRating,
          reviewText: reviewText,
          imageUrls: imageUrls,
          vibeTagIds: vibeTagIds,
        ),
      );

      // Invalidate feed and user check-ins to refresh
      ref.invalidate(socialFeedProvider);

      state = const AsyncValue.data(null);
      return checkIn;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return null;
    }
  }
}

/// Notifier for toasting/un-toasting check-ins
@riverpod
class ToastCheckIn extends _$ToastCheckIn {
  @override
  Future<void> build() async {}

  Future<bool> toggle(String checkInId, bool hasToasted) async {
    state = const AsyncValue.loading();

    final repository = ref.read(checkInRepositoryProvider);

    try {
      if (hasToasted) {
        await repository.untoastCheckIn(checkInId);
      } else {
        await repository.toastCheckIn(checkInId);
      }

      // Invalidate related providers
      ref.invalidate(checkInToastsProvider(checkInId));
      ref.invalidate(checkInDetailProvider(checkInId));
      ref.invalidate(socialFeedProvider);

      state = const AsyncValue.data(null);
      return !hasToasted;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return hasToasted;
    }
  }
}

/// Notifier for adding comments
@riverpod
class AddComment extends _$AddComment {
  @override
  Future<void> build() async {}

  Future<CheckInComment?> submit(String checkInId, String comment) async {
    state = const AsyncValue.loading();

    final repository = ref.read(checkInRepositoryProvider);

    try {
      final newComment = await repository.addComment(checkInId, comment);

      // Invalidate comments provider
      ref.invalidate(checkInCommentsProvider(checkInId));
      ref.invalidate(checkInDetailProvider(checkInId));
      ref.invalidate(socialFeedProvider);

      state = const AsyncValue.data(null);
      return newComment;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return null;
    }
  }
}

/// Notifier for deleting comments
@riverpod
class DeleteComment extends _$DeleteComment {
  @override
  Future<void> build() async {}

  Future<bool> delete(String checkInId, String commentId) async {
    state = const AsyncValue.loading();

    final repository = ref.read(checkInRepositoryProvider);

    try {
      await repository.deleteComment(checkInId, commentId);

      // Invalidate comments provider
      ref.invalidate(checkInCommentsProvider(checkInId));
      ref.invalidate(checkInDetailProvider(checkInId));

      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }
}

/// Provider for user check-in stats
@riverpod
Future<Map<String, dynamic>> userCheckInStats(UserCheckInStatsRef ref, String userId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getUserStats(userId);
}
