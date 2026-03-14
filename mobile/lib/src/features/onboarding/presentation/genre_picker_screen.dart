import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/genre.dart';
import 'onboarding_provider.dart';

/// Genre picker screen shown after the onboarding carousel.
///
/// Users select 3-8 music genres to seed personalized recommendations.
/// Selections are saved locally to SharedPreferences during onboarding
/// and synced to the backend after login via [GenrePersistence].
class GenrePickerScreen extends ConsumerStatefulWidget {
  const GenrePickerScreen({super.key});

  @override
  ConsumerState<GenrePickerScreen> createState() => _GenrePickerScreenState();
}

class _GenrePickerScreenState extends ConsumerState<GenrePickerScreen> {
  static const int _minGenres = 3;
  static const int _maxGenres = 8;

  /// Skip genre selection -- finish onboarding without saving genres.
  Future<void> _skipGenres() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('hasSeenOnboarding', true);

    if (mounted) {
      context.go('/login');
    }
  }

  /// Continue with selected genres -- save locally and go to login.
  Future<void> _continueWithGenres() async {
    final selectedGenres = ref.read(selectedGenresProvider);
    if (selectedGenres.length < _minGenres) return;

    // Save genres locally for post-login sync
    await ref
        .read(genrePersistenceProvider.notifier)
        .saveLocally(selectedGenres.toList());

    // Mark onboarding as seen
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('hasSeenOnboarding', true);

    if (mounted) {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedGenres = ref.watch(selectedGenresProvider);
    final selectedCount = selectedGenres.length;
    final canContinue = selectedCount >= _minGenres;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Skip button
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.only(
                  top: AppTheme.spacing8,
                  right: AppTheme.spacing16,
                ),
                child: TextButton(
                  onPressed: _skipGenres,
                  child: const Text(
                    'Skip',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ),
              ),
            ),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.spacing24,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'What music do you love?',
                    style:
                        Theme.of(context).textTheme.headlineLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                  ),
                  const SizedBox(height: AppTheme.spacing8),
                  Text(
                    'Pick at least $_minGenres genres',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: AppTheme.textSecondary,
                        ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: AppTheme.spacing24),

            // Genre chips
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spacing24,
                ),
                child: Wrap(
                  spacing: AppTheme.spacing8,
                  runSpacing: AppTheme.spacing12,
                  children: Genre.allGenres.map((genre) {
                    final isSelected = selectedGenres.contains(genre.name);
                    final isAtMax =
                        selectedCount >= _maxGenres && !isSelected;

                    return ChoiceChip(
                      label: Text('${genre.emoji}  ${genre.name}'),
                      selected: isSelected,
                      onSelected: isAtMax
                          ? null
                          : (_) {
                              ref
                                  .read(selectedGenresProvider.notifier)
                                  .toggle(genre.name);
                            },
                      selectedColor:
                          AppTheme.primary.withValues(alpha: 0.2),
                      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                      labelStyle: TextStyle(
                        color: isSelected
                            ? AppTheme.primary
                            : AppTheme.textPrimary,
                        fontWeight: isSelected
                            ? FontWeight.w600
                            : FontWeight.w500,
                        fontSize: 14,
                      ),
                      side: BorderSide(
                        color: isSelected
                            ? AppTheme.primary
                            : Colors.transparent,
                        width: 1.5,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusFull),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppTheme.spacing12,
                        vertical: AppTheme.spacing8,
                      ),
                      showCheckmark: false,
                    );
                  }).toList(),
                ),
              ),
            ),

            // Bottom section: counter + continue button
            Padding(
              padding: const EdgeInsets.all(AppTheme.spacing24),
              child: Column(
                children: [
                  // Selection counter
                  Text(
                    '$selectedCount/$_minGenres+ selected',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: canContinue
                              ? AppTheme.primary
                              : AppTheme.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                  const SizedBox(height: AppTheme.spacing16),

                  // Continue button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: canContinue ? _continueWithGenres : null,
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        disabledBackgroundColor:
                            Theme.of(context).colorScheme.surfaceContainerHighest,
                        disabledForegroundColor: AppTheme.textTertiary,
                      ),
                      child: const Text(
                        'Continue',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
