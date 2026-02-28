import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/providers/providers.dart';
import '../../discover/domain/discovery_models.dart';
import 'rsvp_button.dart';
import 'friends_going_widget.dart';

/// Provider to fetch event detail data.
/// Reuses the DiscoveryRepository's existing event data via the discover endpoint.
final eventDetailProvider =
    FutureProvider.autoDispose.family<DiscoverEvent, String>((ref, eventId) async {
  final dioClient = ref.watch(dioClientProvider);
  final response = await dioClient.get('/api/events/$eventId');
  final data = response.data['data'] as Map<String, dynamic>;
  return DiscoverEvent.fromEventJson(data);
});

/// Event Detail Screen
/// Shows event info with RSVP button and friends-going section.
class EventDetailScreen extends ConsumerWidget {
  final String eventId;

  const EventDetailScreen({
    required this.eventId,
    super.key,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventAsync = ref.watch(eventDetailProvider(eventId));

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: eventAsync.when(
        data: (event) => _EventContent(event: event, eventId: eventId),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) => _buildErrorState(context, ref),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: AppTheme.error),
            const SizedBox(height: 16),
            const Text(
              'Could not load event details',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(eventDetailProvider(eventId)),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventContent extends StatelessWidget {
  final DiscoverEvent event;
  final String eventId;

  const _EventContent({required this.event, required this.eventId});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        // Cover header with band image
        SliverAppBar(
          expandedHeight: 240,
          pinned: true,
          backgroundColor: AppTheme.backgroundDark,
          flexibleSpace: FlexibleSpaceBar(
            background: Stack(
              fit: StackFit.expand,
              children: [
                // Band image or gradient fallback
                if (event.bandImageUrl != null)
                  CachedNetworkImage(
                    imageUrl: event.bandImageUrl!,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => _buildGradientBg(),
                  )
                else
                  _buildGradientBg(),
                // Gradient overlay for text readability
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        AppTheme.backgroundDark.withValues(alpha: 0.95),
                      ],
                    ),
                  ),
                ),
                // Event title and venue info
                Positioned(
                  bottom: 16,
                  left: 16,
                  right: 16,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.eventName ?? event.bandName ?? 'Event',
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          letterSpacing: -0.5,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (event.venueName != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          event.venueName!,
                          style: const TextStyle(
                            color: AppTheme.textSecondary,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),

        // Event details body
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Date and location row
                _buildInfoRow(context),

                const SizedBox(height: 24),

                // RSVP Button (primary action)
                Center(
                  child: RsvpButton(eventId: eventId),
                ),

                const SizedBox(height: 16),

                // Friends going section
                Center(
                  child: FriendsGoingWidget(eventId: eventId),
                ),

                const SizedBox(height: 24),

                // Genre badge
                if (event.bandGenre != null) ...[
                  const Text(
                    'Genre',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Chip(
                    label: Text(event.bandGenre!),
                    backgroundColor:
                        AppTheme.voltLime.withValues(alpha: 0.15),
                    labelStyle: const TextStyle(
                      color: AppTheme.voltLime,
                      fontWeight: FontWeight.w600,
                    ),
                    side: BorderSide.none,
                  ),
                ],

                const SizedBox(height: 16),

                // Check-in count if available
                if (event.checkinCount > 0) ...[
                  Row(
                    children: [
                      const Icon(
                        Icons.people_outline,
                        color: AppTheme.textSecondary,
                        size: 18,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${event.checkinCount} check-in${event.checkinCount == 1 ? '' : 's'}',
                        style: const TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ],

                // Bottom padding for scroll comfort
                const SizedBox(height: 48),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInfoRow(BuildContext context) {
    String dateDisplay = '';
    try {
      final date = DateTime.parse(event.eventDate);
      dateDisplay = DateFormat('EEE, MMM d, yyyy').format(date);
    } catch (_) {
      dateDisplay = event.eventDate;
    }

    final locationParts = <String>[];
    if (event.venueCity != null) locationParts.add(event.venueCity!);
    if (event.venueState != null) locationParts.add(event.venueState!);
    final location = locationParts.join(', ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Date
        if (dateDisplay.isNotEmpty)
          Row(
            children: [
              const Icon(
                Icons.calendar_today,
                color: AppTheme.voltLime,
                size: 18,
              ),
              const SizedBox(width: 8),
              Text(
                dateDisplay,
                style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        if (location.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(
                Icons.location_on_outlined,
                color: AppTheme.textSecondary,
                size: 18,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  location,
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
        ],
        if (event.distanceKm != null) ...[
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.only(left: 26),
            child: Text(
              '${event.distanceKm!.toStringAsFixed(1)} km away',
              style: const TextStyle(
                color: AppTheme.textTertiary,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildGradientBg() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.voltLime.withValues(alpha: 0.4),
            AppTheme.electricBlue.withValues(alpha: 0.3),
          ],
        ),
      ),
    );
  }
}
