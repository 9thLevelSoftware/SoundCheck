/// Genre model for onboarding genre selection.
///
/// Represents a music genre with an emoji visual indicator
/// used in the genre picker during onboarding.
class Genre {
  final String name;
  final String emoji;

  const Genre({required this.name, required this.emoji});

  /// All available concert genres for the genre picker.
  static const List<Genre> allGenres = [
    Genre(name: 'Rock', emoji: '\u{1F3B8}'),
    Genre(name: 'Metal', emoji: '\u{1F918}'),
    Genre(name: 'Punk', emoji: '\u{1F480}'),
    Genre(name: 'Indie', emoji: '\u{1F3B5}'),
    Genre(name: 'Alternative', emoji: '\u{1F300}'),
    Genre(name: 'Pop', emoji: '\u{1F3A4}'),
    Genre(name: 'Hip-Hop', emoji: '\u{1F3A7}'),
    Genre(name: 'R&B', emoji: '\u{1F3B6}'),
    Genre(name: 'Electronic', emoji: '\u{1F50A}'),
    Genre(name: 'EDM', emoji: '\u{1F4BF}'),
    Genre(name: 'Jazz', emoji: '\u{1F3B7}'),
    Genre(name: 'Blues', emoji: '\u{1F3BA}'),
    Genre(name: 'Country', emoji: '\u{1F920}'),
    Genre(name: 'Folk', emoji: '\u{1FA95}'),
    Genre(name: 'Reggae', emoji: '\u{1F334}'),
    Genre(name: 'Latin', emoji: '\u{1F483}'),
    Genre(name: 'Classical', emoji: '\u{1F3BB}'),
    Genre(name: 'Experimental', emoji: '\u{1F52C}'),
    Genre(name: 'Hardcore', emoji: '\u{26A1}'),
    Genre(name: 'Emo', emoji: '\u{1F5A4}'),
  ];
}
