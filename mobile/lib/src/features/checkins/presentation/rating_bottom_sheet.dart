import 'package:flutter/material.dart';
import 'package:flutter_rating_bar/flutter_rating_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/nearby_event.dart';
import 'providers/checkin_providers.dart';

/// Bottom sheet for rating bands and venue after a check-in
/// Supports per-set band ratings and venue rating with half-star increments
class RatingBottomSheet extends ConsumerStatefulWidget {
  const RatingBottomSheet({
    required this.checkinId, super.key,
    this.eventId,
    this.lineup,
    this.venueName,
    this.initialTab = 0,
  });

  final String checkinId;
  final String? eventId;
  final List<NearbyEventLineup>? lineup;
  final String? venueName;
  /// 0 = bands tab, 1 = venue tab
  final int initialTab;

  /// Show the rating bottom sheet
  static Future<bool?> show(
    BuildContext context, {
    required String checkinId,
    String? eventId,
    List<NearbyEventLineup>? lineup,
    String? venueName,
    int initialTab = 0,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => RatingBottomSheet(
        checkinId: checkinId,
        eventId: eventId,
        lineup: lineup,
        venueName: venueName,
        initialTab: initialTab,
      ),
    );
  }

  @override
  ConsumerState<RatingBottomSheet> createState() => _RatingBottomSheetState();
}

class _RatingBottomSheetState extends ConsumerState<RatingBottomSheet>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final Map<String, double> _bandRatings = {};
  double _venueRating = 0;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTab,
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  bool get _hasAnyRatings =>
      _bandRatings.values.any((r) => r > 0) || _venueRating > 0;

  Future<void> _submitRatings() async {
    if (!_hasAnyRatings || _isSubmitting) return;

    setState(() => _isSubmitting = true);

    // Build band ratings list (only include rated bands)
    final bandRatings = _bandRatings.entries
        .where((e) => e.value > 0)
        .map((e) => {
              'bandId': e.key,
              'rating': e.value,
            },)
        .toList();

    final submitNotifier = ref.read(submitRatingsProvider.notifier);
    final result = await submitNotifier.submit(
      widget.checkinId,
      bandRatings: bandRatings.isNotEmpty ? bandRatings : null,
      venueRating: _venueRating > 0 ? _venueRating : null,
    );

    if (!mounted) return;

    setState(() => _isSubmitting = false);

    if (result != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ratings saved!'),
          backgroundColor: AppTheme.voltLime,
        ),
      );
      Navigator.of(context).pop(true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to save ratings. Please try again.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      builder: (context, scrollController) => Container(
        decoration: const BoxDecoration(
          color: AppTheme.surfaceDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textTertiary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // Title
            const Text(
              'Rate Your Experience',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),

            // Tab bar
            TabBar(
              controller: _tabController,
              tabs: [
                Tab(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Rate Bands'),
                      if (_bandRatings.values.any((r) => r > 0)) ...[
                        const SizedBox(width: 6),
                        const Icon(
                            Icons.check_circle,
                            color: AppTheme.voltLime,
                            size: 16,
                        ),
                      ],
                    ],
                  ),
                ),
                Tab(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Rate Venue'),
                      if (_venueRating > 0) ...[
                        const SizedBox(width: 6),
                        const Icon(
                            Icons.check_circle,
                            color: AppTheme.voltLime,
                            size: 16,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),

            // Tab content
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildBandsTab(scrollController),
                  _buildVenueTab(scrollController),
                ],
              ),
            ),

            // Submit button + helper text
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!_hasAnyRatings)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Rate at least one band or the venue to submit',
                          style: TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 13,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton(
                        onPressed: _hasAnyRatings && !_isSubmitting
                            ? _submitRatings
                            : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.voltLime,
                          disabledBackgroundColor:
                              AppTheme.voltLime.withValues(alpha: 0.3),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: _isSubmitting
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : Text(
                                'Submit Ratings',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: _hasAnyRatings
                                      ? AppTheme.backgroundDark
                                      : AppTheme.textTertiary,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBandsTab(ScrollController scrollController) {
    final lineup = widget.lineup;

    if (lineup == null || lineup.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'No bands in lineup for this event',
            style: TextStyle(
              color: AppTheme.textTertiary,
              fontSize: 16,
            ),
          ),
        ),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: lineup.length,
      itemBuilder: (context, index) {
        final entry = lineup[index];
        final bandName =
            entry.band?.name ?? 'Band ${entry.setOrder ?? index + 1}';
        final bandId = entry.bandId;
        final currentRating = _bandRatings[bandId] ?? 0;

        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.surfaceVariantDark,
            borderRadius: BorderRadius.circular(16),
            border: currentRating > 0
                ? Border.all(
                    color: AppTheme.voltLime.withValues(alpha: 0.5),)
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Band avatar
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.music_note,
                        color: AppTheme.backgroundDark, size: 24,),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          bandName,
                          style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (entry.isHeadliner)
                          const Text(
                            'Headliner',
                            style: TextStyle(
                              color: AppTheme.voltLime,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (currentRating > 0)
                    Text(
                      currentRating.toStringAsFixed(1),
                      style: const TextStyle(
                        color: AppTheme.voltLime,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Center(
                child: Semantics(
                  label: 'Band rating: ${currentRating > 0 ? '$currentRating out of 5 stars' : 'not yet rated'}',
                  liveRegion: true,
                  child: RatingBar.builder(
                    initialRating: currentRating,
                    minRating: 0.5,
                    allowHalfRating: true,
                    itemCount: 5,
                    itemSize: 36,
                    unratedColor: AppTheme.ratingInactive,
                    itemBuilder: (context, _) => const Icon(
                      Icons.star,
                      color: AppTheme.voltLime,
                    ),
                    onRatingUpdate: (rating) {
                      setState(() {
                        _bandRatings[bandId] = rating;
                      });
                    },
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildVenueTab(ScrollController scrollController) {
    return SingleChildScrollView(
      controller: scrollController,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const SizedBox(height: 24),

          // Venue icon
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppTheme.hotOrange.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(
              Icons.location_on,
              color: AppTheme.hotOrange,
              size: 40,
            ),
          ),
          const SizedBox(height: 16),

          // Venue name
          Text(
            widget.venueName ?? 'Venue',
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'How was the venue experience?',
            style: TextStyle(
              color: AppTheme.textSecondary,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 32),

          // Venue rating
          Semantics(
            label: 'Venue rating: ${_venueRating > 0 ? '$_venueRating out of 5 stars' : 'not yet rated'}',
            liveRegion: true,
            child: RatingBar.builder(
              initialRating: _venueRating,
              minRating: 0.5,
              allowHalfRating: true,
              itemCount: 5,
              itemSize: 48,
              unratedColor: AppTheme.ratingInactive,
              itemBuilder: (context, _) => const Icon(
                Icons.star,
                color: AppTheme.voltLime,
              ),
              onRatingUpdate: (rating) {
                setState(() {
                  _venueRating = rating;
                });
              },
            ),
          ),
          const SizedBox(height: 16),

          // Rating label
          if (_venueRating > 0)
            Text(
              _getRatingLabel(_venueRating),
              style: const TextStyle(
                color: AppTheme.voltLime,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
        ],
      ),
    );
  }

  String _getRatingLabel(double rating) {
    if (rating >= 4.5) return 'Amazing!';
    if (rating >= 4.0) return 'Great';
    if (rating >= 3.0) return 'Good';
    if (rating >= 2.0) return 'Okay';
    return 'Not great';
  }
}
