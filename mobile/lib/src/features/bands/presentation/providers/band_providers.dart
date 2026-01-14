import 'package:riverpod_annotation/riverpod_annotation.dart';
import '../../../../core/providers/providers.dart';
import '../../../checkins/domain/checkin.dart';

part 'band_providers.g.dart';

/// Provider for global check-ins for a band
@riverpod
Future<List<CheckIn>> bandGlobalCheckins(Ref ref, String bandId) async {
  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckIns(bandId: bandId, limit: 20);
}

/// Provider for current user's check-ins for a band
@riverpod
Future<List<CheckIn>> bandUserCheckins(Ref ref, String bandId) async {
  final authState = ref.watch(authStateProvider);
  final user = authState.value;
  if (user == null) return [];

  final repository = ref.watch(checkInRepositoryProvider);
  return repository.getCheckIns(bandId: bandId, userId: user.id, limit: 20);
}
