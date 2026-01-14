import 'package:freezed_annotation/freezed_annotation.dart';

part 'vibe_tag.freezed.dart';
part 'vibe_tag.g.dart';

/// VibeTag - Descriptive tags for check-ins (like "Mosh Pit", "Acoustic", etc.)
@freezed
sealed class VibeTag with _$VibeTag {
  const factory VibeTag({
    required String id,
    required String name, // e.g., 'mosh_pit'
    required String displayName, // e.g., 'Mosh Pit'
    String? icon, // emoji or icon name
    String? category, // 'energy', 'sound', 'crowd', 'atmosphere'
  }) = _VibeTag;

  factory VibeTag.fromJson(Map<String, dynamic> json) =>
      _$VibeTagFromJson(json);
}

/// Predefined vibe categories
enum VibeCategory {
  energy,
  sound,
  crowd,
  atmosphere,
  special,
}

extension VibeCategoryExtension on VibeCategory {
  String get displayName {
    switch (this) {
      case VibeCategory.energy:
        return 'Energy';
      case VibeCategory.sound:
        return 'Sound';
      case VibeCategory.crowd:
        return 'Crowd';
      case VibeCategory.atmosphere:
        return 'Atmosphere';
      case VibeCategory.special:
        return 'Special';
    }
  }
}
