import 'dart:convert';

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/providers/providers.dart';
import '../data/onboarding_repository.dart';

part 'onboarding_provider.g.dart';

/// Tracks whether onboarding has been completed (local SharedPreferences).
@riverpod
class OnboardingState extends _$OnboardingState {
  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool('hasSeenOnboarding') ?? false;
  }

  Future<void> completeOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('hasSeenOnboarding', true);
    state = const AsyncValue.data(true);
  }
}

/// Provides the OnboardingRepository with DioClient from the core providers.
@Riverpod(keepAlive: true)
OnboardingRepository onboardingRepository(Ref ref) {
  final dioClient = ref.watch(dioClientProvider);
  return OnboardingRepository(dioClient: dioClient);
}

/// Manages genre selection state during onboarding.
@riverpod
class SelectedGenres extends _$SelectedGenres {
  @override
  Set<String> build() => {};

  void toggle(String genre) {
    final current = Set<String>.from(state);
    if (current.contains(genre)) {
      current.remove(genre);
    } else {
      current.add(genre);
    }
    state = current;
  }

  void clear() {
    state = {};
  }
}

/// Saves genre preferences locally during onboarding.
///
/// Genres are stored in SharedPreferences as a JSON string list.
/// After the user logs in, [syncGenresToBackendIfNeeded] should be called
/// from the auth success callback to push them to the backend API.
@riverpod
class GenrePersistence extends _$GenrePersistence {
  static const _prefsKey = 'pending_genre_preferences';

  @override
  FutureOr<void> build() {}

  /// Save genre selections to SharedPreferences for later backend sync.
  Future<void> saveLocally(List<String> genres) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, jsonEncode(genres));
  }

  /// Sync locally saved genre preferences to the backend, then clear local copy.
  ///
  /// Call this from the auth success callback (login/register) to push
  /// onboarding genre selections to POST /api/onboarding/genres.
  Future<void> syncGenresToBackendIfNeeded() async {
    final prefs = await SharedPreferences.getInstance();
    final pending = prefs.getString(_prefsKey);
    if (pending == null) return;

    final genres = List<String>.from(jsonDecode(pending) as List);
    if (genres.isEmpty) return;

    try {
      final repo = ref.read(onboardingRepositoryProvider);
      await repo.saveGenrePreferences(genres);
      // Also mark onboarding complete on backend
      await repo.completeOnboarding();
      // Clear local pending genres after successful sync
      await prefs.remove(_prefsKey);
    } catch (_) {
      // Sync failed -- genres remain in SharedPreferences for next attempt.
      // Non-blocking: user can still use the app without genre sync.
    }
  }

  /// Check if there are pending genres waiting to be synced.
  Future<bool> hasPendingGenres() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.containsKey(_prefsKey);
  }
}
