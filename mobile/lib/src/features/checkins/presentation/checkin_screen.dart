import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';

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

  // State
  String? _selectedBandId;
  String? _selectedBandName;
  String? _selectedVenueId;
  String? _selectedVenueName;
  double _rating = 0;
  final Set<String> _selectedVibes = {};
  bool _isSearchingBand = true;

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

  void _submitCheckIn() {
    if (_selectedBandId == null || _selectedVenueId == null || _rating == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please select a band, venue, and rating'),
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    // TODO: Submit check-in via API
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Check-in successful!'),
        backgroundColor: AppTheme.liveGreen,
      ),
    );
    context.pop();
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
                  onChanged: (value) => setState(() {}),
                ),
              ),
            ],
          ),
        ),

        // Search Results
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: 5,
            itemBuilder: (context, index) {
              final bands = ['Metallica', 'Iron Maiden', 'Ghost', 'Gojira', 'Mastodon'];
              final genres = ['Thrash Metal', 'Heavy Metal', 'Rock', 'Death Metal', 'Sludge Metal'];

              return _BandSearchResult(
                name: bands[index],
                genre: genres[index],
                onTap: () => _selectBand('band_$index', bands[index]),
              );
            },
          ),
        ),
      ],
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
          _SectionTitle(title: 'Where are you?'),
          const SizedBox(height: 12),
          _VenueSelector(
            selectedVenueName: _selectedVenueName,
            onTap: () => _showVenueSearch(),
          ),
          const SizedBox(height: 24),

          // Rating
          _SectionTitle(title: 'How is it?'),
          const SizedBox(height: 12),
          _RatingSelector(
            rating: _rating,
            onChanged: (value) => setState(() => _rating = value),
          ),
          const SizedBox(height: 24),

          // Photo
          _SectionTitle(title: 'Add a photo (optional)'),
          const SizedBox(height: 12),
          _PhotoSelector(
            onTap: () {
              // TODO: Open image picker
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Photo picker coming soon!'),
                  backgroundColor: AppTheme.electricPurple,
                ),
              );
            },
          ),
          const SizedBox(height: 24),

          // Vibes
          _SectionTitle(title: 'Tag the vibes'),
          const SizedBox(height: 12),
          _VibeSelector(
            vibes: _vibeOptions,
            selectedVibes: _selectedVibes,
            onToggle: _toggleVibe,
          ),
          const SizedBox(height: 24),

          // Comment
          _SectionTitle(title: "What's the vibe? (optional)"),
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
  });

  final String name;
  final String genre;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(vertical: 8),
      leading: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Icon(Icons.music_note, color: Colors.white, size: 28),
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
              color: Colors.white.withOpacity(0.2),
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
                color: AppTheme.electricPurple.withOpacity(0.2),
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
  const _PhotoSelector({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 120,
        decoration: BoxDecoration(
          color: AppTheme.surfaceVariantDark,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.textTertiary.withOpacity(0.3),
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
                  : Border.all(color: AppTheme.textTertiary.withOpacity(0.3)),
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
                    color: AppTheme.neonPink.withOpacity(0.2),
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
