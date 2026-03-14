import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/services/analytics_service.dart';
import '../../sharing/services/social_share_service.dart';
import '../domain/wrapped_stats.dart';
import 'wrapped_providers.dart';
import 'widgets/story_progress_bar.dart';
import 'widgets/wrapped_slide.dart';

class WrappedStoryScreen extends ConsumerStatefulWidget {
  final int year;

  const WrappedStoryScreen({required this.year, super.key});

  @override
  ConsumerState<WrappedStoryScreen> createState() =>
      _WrappedStoryScreenState();
}

class _WrappedStoryScreenState extends ConsumerState<WrappedStoryScreen>
    with SingleTickerProviderStateMixin {
  late final PageController _pageController;
  late final AnimationController _timerController;
  int _currentPage = 0;
  bool _isPaused = false;
  bool _isSharing = false;
  static const _slideDuration = Duration(seconds: 5);
  static const _slideCount = 6;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _timerController = AnimationController(
      vsync: this,
      duration: _slideDuration,
    )..addStatusListener(_onTimerComplete);

    AnalyticsService.logEvent(
      name: 'wrapped_viewed',
      parameters: {'year': widget.year},
    );
  }

  @override
  void dispose() {
    _timerController.removeStatusListener(_onTimerComplete);
    _timerController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _onTimerComplete(AnimationStatus status) {
    if (status == AnimationStatus.completed) {
      _goToNextSlide();
    }
  }

  void _startTimer() {
    if (_currentPage >= _slideCount - 1) return; // Don't auto-advance last slide
    _timerController.forward(from: 0.0);
  }

  void _goToNextSlide() {
    if (_currentPage < _slideCount - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    }
  }

  void _onPageChanged(int page) {
    setState(() => _currentPage = page);
    _timerController.reset();
    if (page < _slideCount - 1 && !_isPaused) {
      _startTimer();
    }

    AnalyticsService.logEvent(
      name: 'wrapped_slide_viewed',
      parameters: {'year': widget.year, 'slide_index': page},
    );
  }

  void _onTapDown(TapDownDetails _) {
    _isPaused = true;
    _timerController.stop();
  }

  void _onTapUp(TapUpDetails _) {
    _isPaused = false;
    if (_currentPage < _slideCount - 1) {
      _timerController.forward();
    }
  }

  List<WrappedSlide> _buildSlides(WrappedStats stats) {
    return [
      WrappedSlide(
        type: WrappedSlideType.topGenre,
        headline: '${stats.topGenrePercentage}% of your shows were',
        value: stats.topGenre ?? 'Unknown',
      ),
      WrappedSlide(
        type: WrappedSlideType.uniqueVenues,
        headline: 'You hit',
        value: '${stats.uniqueVenues}',
        subtitle: 'different venues',
      ),
      WrappedSlide(
        type: WrappedSlideType.uniqueBands,
        headline: 'You saw',
        value: '${stats.uniqueBands}',
        subtitle: 'different bands',
      ),
      WrappedSlide(
        type: WrappedSlideType.homeVenue,
        headline: 'Your home venue',
        value: stats.homeVenueName ?? 'Unknown',
        subtitle: '${stats.homeVenueVisits} visits',
      ),
      WrappedSlide(
        type: WrappedSlideType.topArtist,
        headline: '#1 artist',
        value: stats.topArtistName ?? 'Unknown',
        subtitle: 'Seen ${stats.topArtistTimesSeen} times',
      ),
      WrappedSlide(
        type: WrappedSlideType.totalShows,
        headline: '',
        value: '${stats.totalShows}',
        subtitle: 'shows total. Legend.',
        isLastSlide: true,
      ),
    ];
  }

  Future<void> _onShareTapped() async {
    if (_isSharing) return;
    setState(() => _isSharing = true);

    try {
      final cardUrls =
          await ref.read(wrappedSummaryCardProvider(widget.year).future);
      if (!mounted) return;

      await SocialShareService.shareGeneric(
        text: 'Check out my ${widget.year} SoundCheck Wrapped!',
        imageUrl: cardUrls.ogUrl,
        shareUrl: '',
      );

      AnalyticsService.logEvent(
        name: 'wrapped_shared',
        parameters: {'year': widget.year},
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to generate share card')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final statsAsync = ref.watch(wrappedStatsProvider(widget.year));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: statsAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline,
                  color: AppTheme.error, size: 48,),
              const SizedBox(height: 16),
              const Text(
                'Failed to load Wrapped',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 16),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.invalidate(wrappedStatsProvider(widget.year)),
                child: const Text('Retry'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context.pop(),
                child: const Text('Go back'),
              ),
            ],
          ),
        ),
        data: (stats) {
          if (!stats.meetsThreshold) {
            return _buildBelowThreshold(stats);
          }

          final slides = _buildSlides(stats);

          // Start timer on first build
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_timerController.isDismissed && !_isPaused &&
                _currentPage < _slideCount - 1) {
              _startTimer();
            }
          });

          return GestureDetector(
            onTapDown: _onTapDown,
            onTapUp: _onTapUp,
            child: Stack(
              children: [
                // Slides
                PageView.builder(
                  controller: _pageController,
                  itemCount: slides.length,
                  onPageChanged: _onPageChanged,
                  itemBuilder: (context, index) => slides[index],
                ),
                // Progress bar
                Positioned(
                  top: MediaQuery.of(context).padding.top + 8,
                  left: 16,
                  right: 16,
                  child: StoryProgressBar(
                    slideCount: _slideCount,
                    currentSlide: _currentPage,
                    progress: _timerController,
                  ),
                ),
                // Close button
                Positioned(
                  top: MediaQuery.of(context).padding.top + 20,
                  right: 16,
                  child: GestureDetector(
                    onTap: () => context.pop(),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surfaceContainerHigh.withValues(alpha: 0.7),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: AppTheme.textPrimary,
                        size: 20,
                      ),
                    ),
                  ),
                ),
                // Bottom actions (on last slide)
                if (_currentPage == _slideCount - 1)
                  Positioned(
                    bottom: MediaQuery.of(context).padding.bottom + 32,
                    left: 32,
                    right: 32,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _isSharing ? null : _onShareTapped,
                            icon: _isSharing
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Theme.of(context).scaffoldBackgroundColor,
                                    ),
                                  )
                                : const Icon(Icons.share),
                            label: Text(
                                _isSharing ? 'Generating...' : 'Share',),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: () => context.push(
                              '/wrapped/${widget.year}/detail',
                            ),
                            child: const Text('View Details'),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildBelowThreshold(WrappedStats stats) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.music_note,
                  size: 64, color: AppTheme.voltLime,),
              const SizedBox(height: 24),
              Text(
                "You've been to ${stats.totalShows} show${stats.totalShows == 1 ? '' : 's'} this year.",
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              const Text(
                'Hit 3 shows to unlock your Wrapped!',
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => context.pop(),
                child: const Text('Got it'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
