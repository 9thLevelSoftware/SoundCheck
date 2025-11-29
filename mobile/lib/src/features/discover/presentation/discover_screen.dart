import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';

/// Discover & Search Screen
/// Search for Bands, Venues, or Users
/// Shows trending lists and map toggle
class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: CustomScrollView(
        slivers: [
          // App Bar with Search
          SliverAppBar(
            floating: true,
            pinned: true,
            backgroundColor: AppTheme.backgroundDark,
            expandedHeight: 120,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                padding: const EdgeInsets.fromLTRB(16, 60, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Discover',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Search Bar
                    Container(
                      decoration: BoxDecoration(
                        color: AppTheme.surfaceVariantDark,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: TextField(
                        controller: _searchController,
                        style: const TextStyle(color: AppTheme.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Search bands, venues, or users...',
                          hintStyle: const TextStyle(color: AppTheme.textTertiary),
                          prefixIcon: const Icon(
                            Icons.search,
                            color: AppTheme.textTertiary,
                          ),
                          suffixIcon: _searchController.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(
                                    Icons.clear,
                                    color: AppTheme.textTertiary,
                                  ),
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() => _isSearching = false);
                                  },
                                )
                              : null,
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        onChanged: (value) {
                          setState(() => _isSearching = value.isNotEmpty);
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
            actions: [
              // Map Toggle Button
              IconButton(
                icon: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceVariantDark,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.map,
                    color: AppTheme.electricPurple,
                    size: 20,
                  ),
                ),
                onPressed: () {
                  // TODO: Toggle map view
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Map view coming soon!'),
                      backgroundColor: AppTheme.electricPurple,
                    ),
                  );
                },
              ),
            ],
          ),

          // Content
          if (_isSearching)
            // Search Results
            _buildSearchResults()
          else
            // Trending Lists
            _buildTrendingContent(),
        ],
      ),
    );
  }

  Widget _buildSearchResults() {
    // Placeholder search results
    return SliverPadding(
      padding: const EdgeInsets.all(16),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          _SectionHeader(title: 'Search Results'),
          const SizedBox(height: 12),
          // Placeholder results
          _SearchResultItem(
            type: SearchResultType.band,
            name: 'Metallica',
            subtitle: 'Thrash Metal',
            onTap: () {},
          ),
          _SearchResultItem(
            type: SearchResultType.venue,
            name: 'The Forum',
            subtitle: 'Los Angeles, CA',
            onTap: () {},
          ),
          _SearchResultItem(
            type: SearchResultType.user,
            name: '@metalhead92',
            subtitle: '150 check-ins',
            onTap: () {},
          ),
        ]),
      ),
    );
  }

  Widget _buildTrendingContent() {
    return SliverPadding(
      padding: const EdgeInsets.only(bottom: 100),
      sliver: SliverList(
        delegate: SliverChildListDelegate([
          // Trending Locally
          _SectionHeader(
            title: 'Trending Locally',
            subtitle: 'Bands being checked into right now',
          ),
          SizedBox(
            height: 160,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: 5,
              itemBuilder: (context, index) {
                return _TrendingBandCard(
                  index: index,
                  onTap: () {},
                );
              },
            ),
          ),
          const SizedBox(height: 24),

          // Top Rated Venues
          _SectionHeader(
            title: 'Top Rated Venues',
            subtitle: 'Highest average check-in ratings',
          ),
          SizedBox(
            height: 160,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: 5,
              itemBuilder: (context, index) {
                return _TrendingVenueCard(
                  index: index,
                  onTap: () {},
                );
              },
            ),
          ),
          const SizedBox(height: 24),

          // Popular This Week
          _SectionHeader(
            title: 'Popular This Week',
            subtitle: 'Bands on tour with high activity',
          ),
          const SizedBox(height: 12),
          ...List.generate(5, (index) {
            return _PopularBandListItem(
              index: index,
              onTap: () {},
            );
          }),
        ]),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    this.subtitle,
  });

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textTertiary,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

enum SearchResultType { band, venue, user }

class _SearchResultItem extends StatelessWidget {
  const _SearchResultItem({
    required this.type,
    required this.name,
    required this.subtitle,
    required this.onTap,
  });

  final SearchResultType type;
  final String name;
  final String subtitle;
  final VoidCallback onTap;

  IconData get _icon {
    switch (type) {
      case SearchResultType.band:
        return Icons.music_note;
      case SearchResultType.venue:
        return Icons.location_on;
      case SearchResultType.user:
        return Icons.person;
    }
  }

  Color get _color {
    switch (type) {
      case SearchResultType.band:
        return AppTheme.electricPurple;
      case SearchResultType.venue:
        return AppTheme.neonPink;
      case SearchResultType.user:
        return AppTheme.liveGreen;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: _color.withOpacity(0.2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(_icon, color: _color),
      ),
      title: Text(
        name,
        style: const TextStyle(
          color: AppTheme.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: AppTheme.textTertiary),
      ),
      trailing: const Icon(
        Icons.chevron_right,
        color: AppTheme.textTertiary,
      ),
    );
  }
}

class _TrendingBandCard extends StatelessWidget {
  const _TrendingBandCard({
    required this.index,
    required this.onTap,
  });

  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bands = ['Metallica', 'Gojira', 'Ghost', 'Mastodon', 'Slipknot'];
    final genres = ['Thrash Metal', 'Death Metal', 'Heavy Metal', 'Sludge Metal', 'Nu Metal'];
    final checkins = [42, 38, 35, 31, 28];

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Container(
              height: 90,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.electricPurple.withOpacity(0.5),
                    AppTheme.neonPink.withOpacity(0.5),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: Center(
                child: Icon(
                  Icons.music_note,
                  size: 36,
                  color: Colors.white.withOpacity(0.7),
                ),
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    bands[index],
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.local_fire_department,
                        size: 12,
                        color: AppTheme.neonPink,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${checkins[index]} now',
                        style: const TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 12,
                        ),
                      ),
                    ],
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

class _TrendingVenueCard extends StatelessWidget {
  const _TrendingVenueCard({
    required this.index,
    required this.onTap,
  });

  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final venues = ['Red Rocks', 'The Forum', 'MSG', 'Wembley', 'The Fillmore'];
    final locations = ['Morrison, CO', 'Los Angeles, CA', 'New York, NY', 'London, UK', 'San Francisco, CA'];
    final ratings = [4.9, 4.8, 4.7, 4.7, 4.6];

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: AppTheme.cardDark,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Container(
              height: 90,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.neonPink.withOpacity(0.5),
                    AppTheme.electricPurple.withOpacity(0.5),
                  ],
                ),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
              ),
              child: Center(
                child: Icon(
                  Icons.location_city,
                  size: 36,
                  color: Colors.white.withOpacity(0.7),
                ),
              ),
            ),
            // Info
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    venues[index],
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.star,
                        size: 12,
                        color: AppTheme.toastGold,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${ratings[index]}',
                        style: const TextStyle(
                          color: AppTheme.textTertiary,
                          fontSize: 12,
                        ),
                      ),
                    ],
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

class _PopularBandListItem extends StatelessWidget {
  const _PopularBandListItem({
    required this.index,
    required this.onTap,
  });

  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bands = ['Tool', 'Deftones', 'System of a Down', 'A Perfect Circle', 'Puscifer'];
    final checkins = [1250, 980, 875, 720, 650];
    final trends = ['+45%', '+32%', '+28%', '+22%', '+18%'];

    return ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            '${index + 1}',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
        ),
      ),
      title: Text(
        bands[index],
        style: const TextStyle(
          color: AppTheme.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        '${checkins[index]} check-ins this week',
        style: const TextStyle(color: AppTheme.textTertiary, fontSize: 12),
      ),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.liveGreen.withOpacity(0.2),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          trends[index],
          style: const TextStyle(
            color: AppTheme.liveGreen,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
