import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/services/location_service.dart';
import '../domain/nearby_event.dart';
import '../domain/checkin.dart';
import 'providers/checkin_providers.dart';
import 'rating_bottom_sheet.dart';

/// Check-in Screen - Event-first quick-tap flow
///
/// Flow: GPS auto-suggest nearby events -> single tap check-in -> optional rating enrichment
/// Fallback: manual band+venue search for backward compat
class CheckInScreen extends ConsumerStatefulWidget {
  const CheckInScreen({super.key});

  @override
  ConsumerState<CheckInScreen> createState() => _CheckInScreenState();
}

enum _ScreenState { events, success, manual }

class _CheckInScreenState extends ConsumerState<CheckInScreen> {
  _ScreenState _screenState = _ScreenState.events;
  String? _checkingInEventId;
  CheckIn? _completedCheckIn;
  NearbyEvent? _checkedInEvent;
  Position? _cachedPosition;
  bool _ratingsCompleted = false;
  bool _venueRatingCompleted = false;

  // Manual check-in state (legacy fallback)
  final TextEditingController _bandSearchController = TextEditingController();
  final TextEditingController _venueSearchController = TextEditingController();
  final TextEditingController _commentController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();
  String? _selectedBandId;
  String? _selectedBandName;
  String? _selectedVenueId;
  String? _selectedVenueName;
  double _rating = 0;
  final Set<String> _selectedVibes = {};
  bool _isSearchingBand = true;
  final List<XFile> _selectedImages = [];
  static const int _maxImages = 4;

  final List<Map<String, String>> _vibeOptions = [
    {'id': 'mosh_pit', 'name': 'Mosh Pit', 'icon': '\u{1F918}'},
    {'id': 'crowd_surfing', 'name': 'Crowd Surfing', 'icon': '\u{1F3C4}'},
    {'id': 'great_sound', 'name': 'Great Sound', 'icon': '\u{1F50A}'},
    {'id': 'epic_lighting', 'name': 'Epic Lighting', 'icon': '\u{2728}'},
    {'id': 'intimate', 'name': 'Intimate', 'icon': '\u{1F56F}'},
    {'id': 'packed', 'name': 'Packed House', 'icon': '\u{1F465}'},
    {'id': 'good_vibes', 'name': 'Good Vibes', 'icon': '\u{270C}'},
    {'id': 'singing_along', 'name': 'Singing Along', 'icon': '\u{1F3A4}'},
    {'id': 'headbanging', 'name': 'Headbanging', 'icon': '\u{1F3B8}'},
    {'id': 'pyro', 'name': 'Pyro', 'icon': '\u{1F525}'},
  ];

  @override
  void initState() {
    super.initState();
    _cachePosition();
  }

  Future<void> _cachePosition() async {
    _cachedPosition = await LocationService.getCurrentPosition();
  }

  @override
  void dispose() {
    _bandSearchController.dispose();
    _venueSearchController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _checkInToEvent(NearbyEvent event) async {
    setState(() => _checkingInEventId = event.id);

    // Use cached position or fetch fresh
    final position = _cachedPosition ?? await LocationService.getCurrentPosition();

    final notifier = ref.read(createEventCheckInProvider.notifier);
    final checkIn = await notifier.submit(
      eventId: event.id,
      locationLat: position?.latitude,
      locationLon: position?.longitude,
    );

    if (!mounted) return;

    if (checkIn != null) {
      setState(() {
        _completedCheckIn = checkIn;
        _checkedInEvent = event;
        _screenState = _ScreenState.success;
        _checkingInEventId = null;
      });
    } else {
      // Check for duplicate check-in (409)
      final error = ref.read(createEventCheckInProvider);
      final errorMsg = error.error?.toString() ?? '';
      final isDuplicate = errorMsg.contains('already') ||
          errorMsg.contains('duplicate') ||
          errorMsg.contains('409');

      setState(() => _checkingInEventId = null);

      if (isDuplicate) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("You've already checked in to this event"),
            backgroundColor: AppTheme.warning,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              errorMsg.isNotEmpty
                  ? errorMsg
                  : 'Failed to check in. Please try again.',
            ),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    }
  }

  Future<void> _openBandRatings() async {
    if (_completedCheckIn == null || _checkedInEvent == null) return;

    final result = await RatingBottomSheet.show(
      context,
      checkinId: _completedCheckIn!.id,
      eventId: _checkedInEvent!.id,
      lineup: _checkedInEvent!.lineup,
      venueName: _checkedInEvent!.venue?.name,
      initialTab: 0,
    );

    if (result == true && mounted) {
      setState(() => _ratingsCompleted = true);
    }
  }

  Future<void> _openVenueRating() async {
    if (_completedCheckIn == null || _checkedInEvent == null) return;

    final result = await RatingBottomSheet.show(
      context,
      checkinId: _completedCheckIn!.id,
      eventId: _checkedInEvent!.id,
      lineup: _checkedInEvent!.lineup,
      venueName: _checkedInEvent!.venue?.name,
      initialTab: 1,
    );

    if (result == true && mounted) {
      setState(() => _venueRatingCompleted = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppTheme.backgroundDark,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Check In',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: true,
      ),
      body: switch (_screenState) {
        _ScreenState.events => _buildEventList(),
        _ScreenState.success => _buildSuccessState(),
        _ScreenState.manual => _isSearchingBand
            ? _buildBandSearch()
            : _buildCheckInForm(),
      },
    );
  }

  // ======== EVENT-FIRST FLOW ========

  Widget _buildEventList() {
    final nearbyEventsAsync = ref.watch(nearbyEventsProvider);

    return nearbyEventsAsync.when(
      data: (events) {
        if (events.isEmpty) {
          return _buildNoEventsState();
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppTheme.liveGreen,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'Shows near you',
                    style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),

            // Event list
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: events.length,
                itemBuilder: (context, index) {
                  return _EventCard(
                    event: events[index],
                    isCheckingIn: _checkingInEventId == events[index].id,
                    onCheckIn: () => _checkInToEvent(events[index]),
                  );
                },
              ),
            ),

            // Manual check-in fallback
            Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: TextButton(
                  onPressed: () {
                    setState(() {
                      _screenState = _ScreenState.manual;
                      _isSearchingBand = true;
                    });
                  },
                  child: const Text(
                    "Can't find your show? Check in manually",
                    style: TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
      loading: () => const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: AppTheme.electricPurple),
            SizedBox(height: 16),
            Text(
              'Finding shows near you...',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 16),
            ),
          ],
        ),
      ),
      error: (error, stack) => _buildNoEventsState(),
    );
  }

  Widget _buildNoEventsState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.location_off,
              size: 64,
              color: AppTheme.textTertiary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            const Text(
              'No shows near you right now',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Try checking in manually or make sure location services are enabled.',
              style: TextStyle(
                color: AppTheme.textTertiary,
                fontSize: 14,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () async {
                final perm = await LocationService.requestPermission();
                if (LocationService.hasPermission(perm) && mounted) {
                  ref.invalidate(nearbyEventsProvider);
                }
              },
              icon: const Icon(Icons.my_location),
              label: const Text('Grant location access'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.electricPurple,
                foregroundColor: AppTheme.backgroundDark,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () {
                setState(() {
                  _screenState = _ScreenState.manual;
                  _isSearchingBand = true;
                });
              },
              child: const Text(
                'Check in manually',
                style: TextStyle(color: AppTheme.electricPurple),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ======== SUCCESS STATE ========

  Widget _buildSuccessState() {
    final event = _checkedInEvent;
    final eventName = event?.eventName ??
        event?.band?.name ??
        event?.lineup?.firstOrNull?.band?.name ??
        'Event';
    final isVerified = _completedCheckIn?.isVerified ?? false;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const SizedBox(height: 24),

          // Success header
          Container(
            width: 80,
            height: 80,
            decoration: const BoxDecoration(
              gradient: AppTheme.primaryGradient,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check,
              color: AppTheme.backgroundDark,
              size: 48,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            "You're checked in!",
            style: TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 28,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            eventName,
            style: const TextStyle(
              color: AppTheme.electricPurple,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
            textAlign: TextAlign.center,
          ),
          if (event?.venue?.name != null) ...[
            const SizedBox(height: 4),
            Text(
              event!.venue!.name,
              style: const TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 14,
              ),
            ),
          ],
          if (isVerified) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.liveGreen.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.verified, color: AppTheme.liveGreen, size: 16),
                  SizedBox(width: 4),
                  Text(
                    'Location verified',
                    style: TextStyle(
                      color: AppTheme.liveGreen,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 32),

          // Enrichment options
          const Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Add to your check-in',
              style: TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Rate bands
          _EnrichmentCard(
            icon: Icons.star,
            iconColor: AppTheme.electricPurple,
            label: 'Rate the bands',
            completed: _ratingsCompleted,
            onTap: _openBandRatings,
          ),
          const SizedBox(height: 8),

          // Rate venue
          _EnrichmentCard(
            icon: Icons.location_on,
            iconColor: AppTheme.neonPink,
            label: 'Rate the venue',
            completed: _venueRatingCompleted,
            onTap: _openVenueRating,
          ),
          const SizedBox(height: 8),

          // Add photos (placeholder)
          _EnrichmentCard(
            icon: Icons.camera_alt,
            iconColor: AppTheme.electricBlue,
            label: 'Add photos',
            completed: false,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Photo uploads coming soon!'),
                  backgroundColor: AppTheme.info,
                ),
              );
            },
          ),
          const SizedBox(height: 32),

          // Done button
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: () => context.pop(),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.electricPurple,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: const Text(
                'Done',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.backgroundDark,
                ),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // ======== MANUAL CHECK-IN (LEGACY FALLBACK) ========

  void _selectBand(String id, String name) {
    setState(() {
      _selectedBandId = id;
      _selectedBandName = name;
      _isSearchingBand = false;
    });
  }

  void _selectVenue(String id, String name) {
    setState(() {
      _selectedVenueId = id;
      _selectedVenueName = name;
    });
    Navigator.pop(context);
  }

  void _toggleVibe(String vibeId) {
    setState(() {
      if (_selectedVibes.contains(vibeId)) {
        _selectedVibes.remove(vibeId);
      } else {
        _selectedVibes.add(vibeId);
      }
    });
  }

  Future<void> _pickImage() async {
    if (_selectedImages.length >= _maxImages) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Maximum $_maxImages photos allowed'),
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (image != null) {
        setState(() {
          _selectedImages.add(image);
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to pick image. Please try again.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  void _removeImage(int index) {
    setState(() {
      _selectedImages.removeAt(index);
    });
  }

  void _showImageOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.textTertiary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 24),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.electricPurple.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.photo_library,
                    color: AppTheme.electricPurple,
                  ),
                ),
                title: const Text(
                  'Choose from Gallery',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _pickImage();
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.neonPink.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.camera_alt,
                    color: AppTheme.neonPink,
                  ),
                ),
                title: const Text(
                  'Take a Photo',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _pickImageFromCamera();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickImageFromCamera() async {
    if (_selectedImages.length >= _maxImages) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Maximum $_maxImages photos allowed'),
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1080,
        imageQuality: 85,
      );

      if (image != null) {
        setState(() {
          _selectedImages.add(image);
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to take photo. Please try again.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  Future<void> _submitCheckIn() async {
    if (_selectedBandId == null || _selectedVenueId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a band and venue'),
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    final createCheckInNotifier = ref.read(createCheckInProvider.notifier);
    final checkIn = await createCheckInNotifier.submit(
      bandId: _selectedBandId!,
      venueId: _selectedVenueId!,
      eventDate: DateTime.now().toIso8601String(),
      venueRating: _rating > 0 ? _rating : null,
      bandRating: _rating > 0 ? _rating : null,
      reviewText:
          _commentController.text.isNotEmpty ? _commentController.text : null,
      vibeTagIds: _selectedVibes.isNotEmpty ? _selectedVibes.toList() : null,
    );

    if (!mounted) return;

    if (checkIn != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Check-in successful!'),
          backgroundColor: AppTheme.liveGreen,
        ),
      );
      context.pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to create check-in. Please try again.'),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  Widget _buildBandSearch() {
    return Column(
      children: [
        // Back to event flow
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () {
                setState(() {
                  _screenState = _ScreenState.events;
                });
              },
              icon: const Icon(Icons.arrow_back, size: 18),
              label: const Text('Back to nearby events'),
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.textTertiary,
              ),
            ),
          ),
        ),
        // Search Bar
        Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "What are you watching?",
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(
                  color: AppTheme.surfaceVariantDark,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: TextField(
                  controller: _bandSearchController,
                  style: const TextStyle(color: AppTheme.textPrimary),
                  autofocus: true,
                  decoration: const InputDecoration(
                    hintText: 'Search for a band...',
                    hintStyle: TextStyle(color: AppTheme.textTertiary),
                    prefixIcon:
                        Icon(Icons.search, color: AppTheme.textTertiary),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                  ),
                  onChanged: (value) {
                    ref.read(bandSearchQueryProvider.notifier).setQuery(value);
                  },
                ),
              ),
            ],
          ),
        ),
        Expanded(child: _buildBandSearchResults()),
      ],
    );
  }

  Widget _buildBandSearchResults() {
    final searchQuery = ref.watch(bandSearchQueryProvider);
    final searchResults = ref.watch(searchBandsForCheckinProvider);

    if (searchQuery.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.search,
                size: 64,
                color: AppTheme.textTertiary.withValues(alpha: 0.5),
              ),
              const SizedBox(height: 16),
              const Text(
                'Search for a band to check in',
                style: TextStyle(
                  color: AppTheme.textTertiary,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return searchResults.when(
      data: (bands) {
        if (bands.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.music_off,
                    size: 64,
                    color: AppTheme.textTertiary.withValues(alpha: 0.5),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No bands found for "$searchQuery"',
                    style: const TextStyle(
                      color: AppTheme.textTertiary,
                      fontSize: 16,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: bands.length,
          itemBuilder: (context, index) {
            final band = bands[index];
            return _BandSearchResult(
              name: band.name,
              genre: band.genre ?? 'Unknown Genre',
              imageUrl: band.imageUrl,
              onTap: () => _selectBand(band.id, band.name),
            );
          },
        );
      },
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: CircularProgressIndicator(
            color: AppTheme.electricPurple,
          ),
        ),
      ),
      error: (error, stack) {
        if (error.toString().contains('Query changed')) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: CircularProgressIndicator(
                color: AppTheme.electricPurple,
              ),
            ),
          );
        }

        return Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.error_outline,
                  size: 64,
                  color: AppTheme.error.withValues(alpha: 0.7),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Failed to search bands',
                  style: TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 16,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(searchBandsForCheckinProvider),
                  child: const Text(
                    'Retry',
                    style: TextStyle(color: AppTheme.electricPurple),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildCheckInForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Back to event flow
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () {
                setState(() {
                  _screenState = _ScreenState.events;
                });
              },
              icon: const Icon(Icons.arrow_back, size: 18),
              label: const Text('Back to nearby events'),
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.textTertiary,
              ),
            ),
          ),
          const SizedBox(height: 8),

          // Selected Band Header
          _SelectedBandCard(
            bandName: _selectedBandName ?? '',
            onClear: () => setState(() {
              _selectedBandId = null;
              _selectedBandName = null;
              _isSearchingBand = true;
            }),
          ),
          const SizedBox(height: 24),

          // Venue Selector
          const _SectionTitle(title: 'Where are you?'),
          const SizedBox(height: 12),
          _VenueSelector(
            selectedVenueName: _selectedVenueName,
            onTap: _showVenueSearch,
          ),
          const SizedBox(height: 24),

          // Rating
          const _SectionTitle(title: 'How is it?'),
          const SizedBox(height: 12),
          _RatingSelector(
            rating: _rating,
            onChanged: (value) => setState(() => _rating = value),
          ),
          const SizedBox(height: 24),

          // Photo
          _SectionTitle(
            title: 'Add photos (${_selectedImages.length}/$_maxImages)',
          ),
          const SizedBox(height: 12),
          _PhotoSelector(
            selectedImages: _selectedImages,
            maxImages: _maxImages,
            onAddPhoto: _showImageOptions,
            onRemovePhoto: _removeImage,
          ),
          const SizedBox(height: 24),

          // Vibes
          const _SectionTitle(title: 'Tag the vibes'),
          const SizedBox(height: 12),
          _VibeSelector(
            vibes: _vibeOptions,
            selectedVibes: _selectedVibes,
            onToggle: _toggleVibe,
          ),
          const SizedBox(height: 24),

          // Comment
          const _SectionTitle(title: "What's the vibe? (optional)"),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: AppTheme.surfaceVariantDark,
              borderRadius: BorderRadius.circular(12),
            ),
            child: TextField(
              controller: _commentController,
              style: const TextStyle(color: AppTheme.textPrimary),
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Share your experience...',
                hintStyle: TextStyle(color: AppTheme.textTertiary),
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(16),
              ),
            ),
          ),
          const SizedBox(height: 32),

          // Submit Button
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: _submitCheckIn,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.electricPurple,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle, color: AppTheme.backgroundDark),
                  SizedBox(width: 8),
                  Text(
                    'Check In',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.backgroundDark,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  void _showVenueSearch() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surfaceDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => _VenueSearchSheet(
          scrollController: scrollController,
          onSelect: _selectVenue,
        ),
      ),
    );
  }
}

// ======== EVENT CARD WIDGET ========

class _EventCard extends StatelessWidget {
  const _EventCard({
    required this.event,
    required this.isCheckingIn,
    required this.onCheckIn,
  });

  final NearbyEvent event;
  final bool isCheckingIn;
  final VoidCallback onCheckIn;

  @override
  Widget build(BuildContext context) {
    final eventName = event.eventName ??
        event.band?.name ??
        event.lineup?.firstOrNull?.band?.name ??
        'Live Music';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surfaceDark,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.surfaceVariantDark,
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Event name + distance
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      eventName,
                      style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (event.venue?.name != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.location_on,
                              color: AppTheme.textTertiary, size: 14),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              [
                                event.venue!.name,
                                if (event.venue?.city != null)
                                  event.venue!.city,
                              ].join(', '),
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 14,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              // Distance badge
              if (event.distanceKm != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.liveGreen.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${event.distanceKm!.toStringAsFixed(1)} km',
                    style: const TextStyle(
                      color: AppTheme.liveGreen,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),

          // Time info
          if (event.doorsTime != null || event.startTime != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.schedule,
                    color: AppTheme.textTertiary, size: 14),
                const SizedBox(width: 4),
                Text(
                  [
                    if (event.doorsTime != null) 'Doors: ${event.doorsTime}',
                    if (event.startTime != null) 'Starts: ${event.startTime}',
                  ].join(' | '),
                  style: const TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ],

          // Lineup chips (first 3)
          if (event.lineup != null && event.lineup!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: event.lineup!.take(3).map((entry) {
                final name = entry.band?.name ?? 'TBA';
                return Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceVariantDark,
                    borderRadius: BorderRadius.circular(8),
                    border: entry.isHeadliner
                        ? Border.all(
                            color:
                                AppTheme.electricPurple.withValues(alpha: 0.5))
                        : null,
                  ),
                  child: Text(
                    name,
                    style: TextStyle(
                      color: entry.isHeadliner
                          ? AppTheme.electricPurple
                          : AppTheme.textSecondary,
                      fontSize: 12,
                      fontWeight:
                          entry.isHeadliner ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],

          // Check-in count
          if (event.checkinCount != null && event.checkinCount! > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.people, color: AppTheme.textTertiary, size: 14),
                const SizedBox(width: 4),
                Text(
                  '${event.checkinCount} checked in',
                  style: const TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: 12),

          // CHECK IN button
          SizedBox(
            width: double.infinity,
            height: 44,
            child: ElevatedButton(
              onPressed: isCheckingIn ? null : onCheckIn,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.electricPurple,
                disabledBackgroundColor:
                    AppTheme.electricPurple.withValues(alpha: 0.5),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: EdgeInsets.zero,
              ),
              child: isCheckingIn
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        color: AppTheme.backgroundDark,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
                      'CHECK IN',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.backgroundDark,
                        letterSpacing: 0.5,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ======== ENRICHMENT CARD WIDGET ========

class _EnrichmentCard extends StatelessWidget {
  const _EnrichmentCard({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.completed,
    required this.onTap,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final bool completed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.surfaceDark,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: completed
                ? AppTheme.liveGreen.withValues(alpha: 0.5)
                : AppTheme.surfaceVariantDark,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (completed)
              const Icon(Icons.check_circle, color: AppTheme.liveGreen, size: 24)
            else
              const Icon(Icons.chevron_right, color: AppTheme.textTertiary),
          ],
        ),
      ),
    );
  }
}

// ======== LEGACY WIDGETS (preserved for manual check-in fallback) ========

class _BandSearchResult extends StatelessWidget {
  const _BandSearchResult({
    required this.name,
    required this.genre,
    required this.onTap,
    this.imageUrl,
  });

  final String name;
  final String genre;
  final VoidCallback onTap;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(vertical: 8),
      leading: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          gradient: imageUrl == null ? AppTheme.primaryGradient : null,
          borderRadius: BorderRadius.circular(12),
          image: imageUrl != null
              ? DecorationImage(
                  image: NetworkImage(imageUrl!),
                  fit: BoxFit.cover,
                )
              : null,
        ),
        child: imageUrl == null
            ? const Icon(Icons.music_note, color: AppTheme.backgroundDark, size: 28)
            : null,
      ),
      title: Text(
        name,
        style: const TextStyle(
          color: AppTheme.textPrimary,
          fontWeight: FontWeight.bold,
          fontSize: 16,
        ),
      ),
      subtitle: Text(
        genre,
        style: const TextStyle(color: AppTheme.textTertiary),
      ),
      trailing: const Icon(Icons.add_circle, color: AppTheme.electricPurple),
    );
  }
}

class _SelectedBandCard extends StatelessWidget {
  const _SelectedBandCard({
    required this.bandName,
    required this.onClear,
  });

  final String bandName;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child:
                const Icon(Icons.music_note, color: AppTheme.backgroundDark, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Checking in to',
                  style: TextStyle(
                    color: AppTheme.backgroundDark.withValues(alpha: 0.7),
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  bandName,
                  style: const TextStyle(
                    color: AppTheme.backgroundDark,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onClear,
            icon: Icon(Icons.close,
                color: AppTheme.backgroundDark.withValues(alpha: 0.7)),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: AppTheme.textPrimary,
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _VenueSelector extends StatelessWidget {
  const _VenueSelector({
    required this.selectedVenueName,
    required this.onTap,
  });

  final String? selectedVenueName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.surfaceVariantDark,
          borderRadius: BorderRadius.circular(12),
          border: selectedVenueName != null
              ? Border.all(color: AppTheme.electricPurple)
              : null,
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.electricPurple.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.location_on,
                color: AppTheme.electricPurple,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                selectedVenueName ?? 'Select venue...',
                style: TextStyle(
                  color: selectedVenueName != null
                      ? AppTheme.textPrimary
                      : AppTheme.textTertiary,
                  fontSize: 16,
                  fontWeight: selectedVenueName != null
                      ? FontWeight.w600
                      : FontWeight.normal,
                ),
              ),
            ),
            const Icon(Icons.chevron_right, color: AppTheme.textTertiary),
          ],
        ),
      ),
    );
  }
}

class _RatingSelector extends StatelessWidget {
  const _RatingSelector({
    required this.rating,
    required this.onChanged,
  });

  final double rating;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(5, (index) {
        final starValue = index + 1.0;
        final isActive = starValue <= rating;
        final isHalf = rating > index && rating < starValue;

        return GestureDetector(
          onTap: () => onChanged(starValue),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Icon(
              isActive
                  ? Icons.star
                  : (isHalf ? Icons.star_half : Icons.star_border),
              size: 48,
              color: isActive || isHalf
                  ? AppTheme.electricPurple
                  : AppTheme.ratingInactive,
            ),
          ),
        );
      }),
    );
  }
}

class _PhotoSelector extends StatelessWidget {
  const _PhotoSelector({
    required this.selectedImages,
    required this.maxImages,
    required this.onAddPhoto,
    required this.onRemovePhoto,
  });

  final List<XFile> selectedImages;
  final int maxImages;
  final VoidCallback onAddPhoto;
  final void Function(int) onRemovePhoto;

  @override
  Widget build(BuildContext context) {
    if (selectedImages.isEmpty) {
      return GestureDetector(
        onTap: onAddPhoto,
        child: Container(
          height: 120,
          decoration: BoxDecoration(
            color: AppTheme.surfaceVariantDark,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.textTertiary.withValues(alpha: 0.3),
              width: 2,
              style: BorderStyle.solid,
            ),
          ),
          child: const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.camera_alt, color: AppTheme.textTertiary, size: 32),
                SizedBox(height: 8),
                Text(
                  'Tap to add photo',
                  style: TextStyle(
                    color: AppTheme.textTertiary,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return SizedBox(
      height: 120,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount:
            selectedImages.length + (selectedImages.length < maxImages ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == selectedImages.length) {
            return GestureDetector(
              onTap: onAddPhoto,
              child: Container(
                width: 100,
                height: 120,
                margin: const EdgeInsets.only(right: 12),
                decoration: BoxDecoration(
                  color: AppTheme.surfaceVariantDark,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.textTertiary.withValues(alpha: 0.3),
                    width: 2,
                    style: BorderStyle.solid,
                  ),
                ),
                child: const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add, color: AppTheme.textTertiary, size: 28),
                      SizedBox(height: 4),
                      Text(
                        'Add',
                        style: TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }

          return Container(
            width: 100,
            height: 120,
            margin: const EdgeInsets.only(right: 12),
            child: Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(
                    File(selectedImages[index].path),
                    width: 100,
                    height: 120,
                    fit: BoxFit.cover,
                  ),
                ),
                Positioned(
                  top: 4,
                  right: 4,
                  child: GestureDetector(
                    onTap: () => onRemovePhoto(index),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: AppTheme.error.withValues(alpha: 0.9),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: Colors.white,
                        size: 16,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _VibeSelector extends StatelessWidget {
  const _VibeSelector({
    required this.vibes,
    required this.selectedVibes,
    required this.onToggle,
  });

  final List<Map<String, String>> vibes;
  final Set<String> selectedVibes;
  final Function(String) onToggle;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: vibes.map((vibe) {
        final isSelected = selectedVibes.contains(vibe['id']);
        return GestureDetector(
          onTap: () => onToggle(vibe['id']!),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.electricPurple
                  : AppTheme.surfaceVariantDark,
              borderRadius: BorderRadius.circular(20),
              border: isSelected
                  ? null
                  : Border.all(
                      color: AppTheme.textTertiary.withValues(alpha: 0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(vibe['icon']!, style: const TextStyle(fontSize: 14)),
                const SizedBox(width: 6),
                Text(
                  vibe['name']!,
                  style: TextStyle(
                    color: isSelected
                        ? AppTheme.backgroundDark
                        : AppTheme.textSecondary,
                    fontWeight:
                        isSelected ? FontWeight.w600 : FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _VenueSearchSheet extends StatelessWidget {
  const _VenueSearchSheet({
    required this.scrollController,
    required this.onSelect,
  });

  final ScrollController scrollController;
  final Function(String, String) onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          margin: const EdgeInsets.only(top: 12),
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: AppTheme.textTertiary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            decoration: BoxDecoration(
              color: AppTheme.surfaceVariantDark,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const TextField(
              style: TextStyle(color: AppTheme.textPrimary),
              decoration: InputDecoration(
                hintText: 'Search venues nearby...',
                hintStyle: TextStyle(color: AppTheme.textTertiary),
                prefixIcon:
                    Icon(Icons.search, color: AppTheme.textTertiary),
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
              ),
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            controller: scrollController,
            itemCount: 10,
            itemBuilder: (context, index) {
              final venues = [
                'The Forum',
                'Madison Square Garden',
                'Red Rocks',
                'Wembley Arena',
                'The Fillmore',
                'House of Blues',
                'The Troubadour',
                'Irving Plaza',
                'The Roxy',
                'Bowery Ballroom',
              ];
              final locations = [
                'Los Angeles, CA',
                'New York, NY',
                'Morrison, CO',
                'London, UK',
                'San Francisco, CA',
                'Chicago, IL',
                'West Hollywood, CA',
                'New York, NY',
                'West Hollywood, CA',
                'New York, NY',
              ];

              return ListTile(
                onTap: () => onSelect('venue_$index', venues[index]),
                leading: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppTheme.neonPink.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.location_on,
                    color: AppTheme.neonPink,
                  ),
                ),
                title: Text(
                  venues[index],
                  style: const TextStyle(
                    color: AppTheme.textPrimary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(
                  locations[index],
                  style: const TextStyle(color: AppTheme.textTertiary),
                ),
                trailing: const Icon(
                  Icons.chevron_right,
                  color: AppTheme.textTertiary,
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
