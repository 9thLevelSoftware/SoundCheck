import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/theme/app_theme.dart';
import 'providers/checkin_providers.dart';

/// Check-in Screen - The Core Feature
/// Step 1: Search for a band
/// Step 2: Fill in the check-in form (venue, rating, photo, vibes)
class CheckInScreen extends ConsumerStatefulWidget {
  const CheckInScreen({super.key});

  @override
  ConsumerState<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends ConsumerState<CheckInScreen> {
  final TextEditingController _bandSearchController = TextEditingController();
  final TextEditingController _venueSearchController = TextEditingController();
  final TextEditingController _commentController = TextEditingController();
  final ImagePicker _imagePicker = ImagePicker();

  // State
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
    {'id': 'mosh_pit', 'name': 'Mosh Pit', 'icon': '🤘'},
    {'id': 'crowd_surfing', 'name': 'Crowd Surfing', 'icon': '🏄'},
    {'id': 'great_sound', 'name': 'Great Sound', 'icon': '🔊'},
    {'id': 'epic_lighting', 'name': 'Epic Lighting', 'icon': '✨'},
    {'id': 'intimate', 'name': 'Intimate', 'icon': '🕯️'},
    {'id': 'packed', 'name': 'Packed House', 'icon': '👥'},
    {'id': 'good_vibes', 'name': 'Good Vibes', 'icon': '✌️'},
    {'id': 'singing_along', 'name': 'Singing Along', 'icon': '🎤'},
    {'id': 'headbanging', 'name': 'Headbanging', 'icon': '🎸'},
    {'id': 'pyro', 'name': 'Pyro', 'icon': '🔥'},
  ];

  @override
  void dispose() {
    _bandSearchController.dispose();
    _venueSearchController.dispose();
    _commentController.dispose();
    super.dispose();
  }

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
        SnackBar(
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
        SnackBar(
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

    // Submit check-in via API with new fields
    final createCheckInNotifier = ref.read(createCheckInProvider.notifier);
    final checkIn = await createCheckInNotifier.submit(
      bandId: _selectedBandId!,
      venueId: _selectedVenueId!,
      eventDate: DateTime.now().toIso8601String(),
      venueRating: _rating > 0 ? _rating : null,
      bandRating: _rating > 0 ? _rating : null,
      reviewText: _commentController.text.isNotEmpty ? _commentController.text : null,
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
      body: _isSearchingBand
          ? _buildBandSearch()
          : _buildCheckInForm(),
    );
  }

  Widget _buildBandSearch() {
    return Column(
      children: [
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
                    prefixIcon: Icon(Icons.search, color: AppTheme.textTertiary),
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

        // Search Results
        Expanded(
          child: _buildBandSearchResults(),
        ),
      ],
    );
  }

  Widget _buildBandSearchResults() {
    final searchQuery = ref.watch(bandSearchQueryProvider);
    final searchResults = ref.watch(searchBandsForCheckinProvider);

    // Show empty state when no search query
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
        // Ignore debounce cancellation errors
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
                  onPressed: () => ref.invalidate(searchBandsForCheckinProvider),
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
                  Icon(Icons.check_circle, color: Colors.white),
                  SizedBox(width: 8),
                  Text(
                    'Check In',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
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
            ? const Icon(Icons.music_note, color: Colors.white, size: 28)
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
              color: Colors.white.withValues(alpha:0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.music_note, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Checking in to',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  bandName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onClear,
            icon: const Icon(Icons.close, color: Colors.white70),
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
                color: AppTheme.electricPurple.withValues(alpha:0.2),
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
      // Show empty state placeholder
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

    // Show selected images in horizontal scroll
    return SizedBox(
      height: 120,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: selectedImages.length + (selectedImages.length < maxImages ? 1 : 0),
        itemBuilder: (context, index) {
          // Add button at the end
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

          // Image thumbnail
          return Container(
            width: 100,
            height: 120,
            margin: const EdgeInsets.only(right: 12),
            child: Stack(
              children: [
                // Image
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(
                    File(selectedImages[index].path),
                    width: 100,
                    height: 120,
                    fit: BoxFit.cover,
                  ),
                ),
                // Remove button
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
                  : Border.all(color: AppTheme.textTertiary.withValues(alpha:0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(vibe['icon']!, style: const TextStyle(fontSize: 14)),
                const SizedBox(width: 6),
                Text(
                  vibe['name']!,
                  style: TextStyle(
                    color: isSelected ? Colors.white : AppTheme.textSecondary,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
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
        // Handle
        Container(
          margin: const EdgeInsets.only(top: 12),
          width: 40,
          height: 4,
          decoration: BoxDecoration(
            color: AppTheme.textTertiary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        // Search Bar
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
                prefixIcon: Icon(Icons.search, color: AppTheme.textTertiary),
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
              ),
            ),
          ),
        ),
        // Venue List
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
                    color: AppTheme.neonPink.withValues(alpha:0.2),
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
