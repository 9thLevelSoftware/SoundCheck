import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'band_filters_state.dart';

part 'band_filters_notifier.g.dart';

@riverpod
class BandFilters extends _$BandFilters {
  @override
  BandFiltersState build() => const BandFiltersState();

  void toggleGenre(String genre) {
    final genres = List<String>.from(state.genres);
    if (genres.contains(genre)) {
      genres.remove(genre);
    } else {
      genres.add(genre);
    }
    state = state.copyWith(genres: genres);
  }

  void setGenres(List<String> genres) {
    state = state.copyWith(genres: genres);
  }

  void toggleHometown(String hometown) {
    final hometowns = List<String>.from(state.hometowns);
    if (hometowns.contains(hometown)) {
      hometowns.remove(hometown);
    } else {
      hometowns.add(hometown);
    }
    state = state.copyWith(hometowns: hometowns);
  }

  void setHometowns(List<String> hometowns) {
    state = state.copyWith(hometowns: hometowns);
  }

  void setMinRating(double? rating) {
    state = state.copyWith(minRating: rating);
  }

  void setSortBy(BandSortBy sortBy) {
    state = state.copyWith(sortBy: sortBy);
  }

  void clearAll() {
    state = const BandFiltersState();
  }
}

@riverpod
Future<List<String>> availableGenres(Ref ref) async {
  // This would fetch from the API in a real scenario
  // For now, return a default list
  return [
    'Rock',
    'Pop',
    'Jazz',
    'Blues',
    'Metal',
    'Alternative',
    'Indie',
    'Electronic',
    'Hip Hop',
    'Country',
    'Folk',
    'Punk',
    'Reggae',
    'Classical',
    'R&B',
    'Other',
  ];
}
