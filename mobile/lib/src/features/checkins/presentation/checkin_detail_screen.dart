import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/providers/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../reporting/presentation/widgets/report_bottom_sheet.dart';
import '../domain/checkin.dart';
import '../domain/checkin_comment.dart';
import 'providers/checkin_providers.dart';

/// CheckInDetailScreen - Shows full details of a single check-in
/// Displays user info, event details, ratings, notes, vibes, photos, and comments
class CheckInDetailScreen extends ConsumerStatefulWidget {
  final String checkinId;

  const CheckInDetailScreen({
    required this.checkinId,
    super.key,
  });

  @override
  ConsumerState<CheckInDetailScreen> createState() => _CheckInDetailScreenState();
}

class _CheckInDetailScreenState extends ConsumerState<CheckInDetailScreen> {
  final TextEditingController _commentController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _commentController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  String _getTimeAgo(String createdAt) {
    try {
      final dateTime = DateTime.parse(createdAt);
      final now = DateTime.now();
      final difference = now.difference(dateTime);

      if (difference.inMinutes < 1) {
        return 'just now';
      } else if (difference.inMinutes < 60) {
        return '${difference.inMinutes}m ago';
      } else if (difference.inHours < 24) {
        return '${difference.inHours}h ago';
      } else if (difference.inDays < 7) {
        return '${difference.inDays}d ago';
      } else {
        return '${difference.inDays ~/ 7}w ago';
      }
    } catch (e) {
      return '';
    }
  }

  String _formatEventDate(String? eventDate) {
    if (eventDate == null) return '';
    try {
      final date = DateTime.parse(eventDate);
      final months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[date.month - 1]} ${date.day}, ${date.year}';
    } catch (e) {
      return eventDate;
    }
  }

  IconData _getVibeIcon(String vibeName) {
    final lowerName = vibeName.toLowerCase();
    if (lowerName.contains('sound') || lowerName.contains('audio')) {
      return Icons.volume_up;
    } else if (lowerName.contains('mosh') || lowerName.contains('pit') ||
        lowerName.contains('energy')) {
      return Icons.local_fire_department;
    } else if (lowerName.contains('light') || lowerName.contains('visual')) {
      return Icons.lightbulb;
    } else if (lowerName.contains('crowd') || lowerName.contains('audience')) {
      return Icons.people;
    } else if (lowerName.contains('stage')) {
      return Icons.theater_comedy;
    } else {
      return Icons.music_note;
    }
  }

  Future<void> _handleToast(CheckIn checkIn) async {
    await ref.read(toastCheckInProvider.notifier).toggle(
      checkIn.id,
      checkIn.hasUserToasted,
    );
  }

  Future<void> _handleSubmitComment() async {
    final comment = _commentController.text.trim();
    if (comment.isEmpty) return;

    final result = await ref.read(addCommentProvider.notifier).submit(
      widget.checkinId,
      comment,
    );

    if (result != null && mounted) {
      _commentController.clear();
      FocusScope.of(context).unfocus();
    }
  }

  void _handleShare(CheckIn checkIn) {
    final bandName = checkIn.band?.name ?? 'a band';
    final venueName = checkIn.venue?.name ?? 'a venue';
    final userName = checkIn.user?.username ?? 'Someone';

    SharePlus.instance.share(
      ShareParams(
        text: '$userName checked in to $bandName at $venueName! Check it out on SoundCheck.',
        subject: 'Check-in on SoundCheck',
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final checkinAsync = ref.watch(checkInDetailProvider(widget.checkinId));
    final commentsAsync = ref.watch(checkInCommentsProvider(widget.checkinId));

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        title: const Text('Check-in'),
        actions: [
          checkinAsync.maybeWhen(
            data: (checkIn) {
              final currentUserId = ref.watch(authStateProvider).value?.id;
              final isOwnContent = currentUserId != null &&
                  checkIn.userId == currentUserId;
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    icon: const Icon(Icons.share),
                    tooltip: 'Share',
                    onPressed: () => _handleShare(checkIn),
                  ),
                  if (!isOwnContent)
                    PopupMenuButton<String>(
                      icon: const Icon(
                        Icons.more_vert,
                        color: AppTheme.textSecondary,
                      ),
                      onSelected: (value) {
                        if (value == 'report') {
                          showReportBottomSheet(
                            context,
                            contentType: 'checkin',
                            contentId: widget.checkinId,
                          );
                        }
                      },
                      itemBuilder: (context) => [
                        const PopupMenuItem(
                          value: 'report',
                          child: Row(
                            children: [
                              Icon(Icons.flag_outlined, size: 18),
                              SizedBox(width: 8),
                              Text('Report Check-in'),
                            ],
                          ),
                        ),
                      ],
                    ),
                ],
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
      body: checkinAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppTheme.voltLime),
        ),
        error: (error, _) => _buildErrorState(context),
        data: (checkIn) => Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                controller: _scrollController,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // User Header
                    _UserHeader(
                      checkIn: checkIn,
                      timeAgo: _getTimeAgo(checkIn.createdAt),
                      onUserTap: () {
                        if (checkIn.userId.isNotEmpty) {
                          context.push('/users/${checkIn.userId}');
                        }
                      },
                    ),

                    // Event Info Section
                    _EventInfoSection(
                      checkIn: checkIn,
                      formattedDate: _formatEventDate(checkIn.eventDate),
                      onBandTap: () {
                        if (checkIn.bandId != null) {
                          context.push('/bands/${checkIn.bandId}');
                        }
                      },
                      onVenueTap: () {
                        if (checkIn.venueId != null) {
                          context.push('/venues/${checkIn.venueId}');
                        }
                      },
                    ),

                    // Ratings Section
                    if (checkIn.bandRating != null || checkIn.venueRating != null)
                      _RatingsSection(checkIn: checkIn),

                    // Notes
                    if (checkIn.noteText != null && checkIn.noteText!.isNotEmpty)
                      _NotesSection(noteText: checkIn.noteText!),

                    // Vibe Tags
                    if (checkIn.vibeTags != null && checkIn.vibeTags!.isNotEmpty)
                      _VibeTagsSection(
                        vibeTags: checkIn.vibeTags!,
                        getVibeIcon: _getVibeIcon,
                      ),

                    // Photos Carousel
                    if (checkIn.imageUrls != null && checkIn.imageUrls!.isNotEmpty)
                      _PhotosCarousel(
                        imageUrls: checkIn.imageUrls!,
                        checkinId: widget.checkinId,
                        currentUserId: ref.watch(authStateProvider).value?.id,
                        checkinUserId: checkIn.userId,
                      ),

                    // Action Bar
                    _ActionBar(
                      checkIn: checkIn,
                      onToast: () => _handleToast(checkIn),
                      onShare: () => _handleShare(checkIn),
                    ),

                    // Divider
                    Divider(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest,
                      height: 1,
                    ),

                    // Comments Section
                    _CommentsSection(
                      commentsAsync: commentsAsync,
                      checkinId: widget.checkinId,
                      getTimeAgo: _getTimeAgo,
                      onUserTap: (userId) => context.push('/users/$userId'),
                      currentUserId: ref.watch(authStateProvider).value?.id,
                    ),

                    // Bottom padding for comment input
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),

            // Comment Input
            _CommentInput(
              controller: _commentController,
              onSubmit: _handleSubmitComment,
              isLoading: ref.watch(addCommentProvider).isLoading,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: AppTheme.error),
            const SizedBox(height: 16),
            const Text(
              'Could not load check-in',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Please try again later',
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => ref.invalidate(checkInDetailProvider(widget.checkinId)),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// User Header - Shows avatar, username, and time
class _UserHeader extends StatelessWidget {
  final CheckIn checkIn;
  final String timeAgo;
  final VoidCallback onUserTap;

  const _UserHeader({
    required this.checkIn,
    required this.timeAgo,
    required this.onUserTap,
  });

  @override
  Widget build(BuildContext context) {
    final user = checkIn.user;
    final userName = user?.username ?? 'Unknown';
    final profileImageUrl = user?.profileImageUrl;

    return InkWell(
      onTap: onUserTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            // User Avatar
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: profileImageUrl == null ? AppTheme.primaryGradient : null,
              ),
              child: ClipOval(
                child: profileImageUrl != null
                    ? CachedNetworkImage(
                        imageUrl: profileImageUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => Center(
                          child: Text(
                            userName[0].toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 20,
                            ),
                          ),
                        ),
                      )
                    : Center(
                        child: Text(
                          userName[0].toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 20,
                          ),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            // User Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    userName,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  Text(
                    timeAgo,
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
            // Badge indicator
            if (checkIn.earnedBadges != null && checkIn.earnedBadges!.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.toastGold.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.emoji_events,
                      size: 14,
                      color: AppTheme.toastGold,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${checkIn.earnedBadges!.length}',
                      style: const TextStyle(
                        color: AppTheme.toastGold,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
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

/// Event Info Section - Band name, venue, and event date
class _EventInfoSection extends StatelessWidget {
  final CheckIn checkIn;
  final String formattedDate;
  final VoidCallback onBandTap;
  final VoidCallback onVenueTap;

  const _EventInfoSection({
    required this.checkIn,
    required this.formattedDate,
    required this.onBandTap,
    required this.onVenueTap,
  });

  @override
  Widget build(BuildContext context) {
    final band = checkIn.band;
    final venue = checkIn.venue;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Band Row
          InkWell(
            onTap: onBandTap,
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: band?.imageUrl != null
                        ? CachedNetworkImage(
                            imageUrl: band!.imageUrl!,
                            fit: BoxFit.cover,
                            errorWidget: (_, __, ___) => const Icon(
                              Icons.music_note,
                              color: AppTheme.voltLime,
                            ),
                          )
                        : const Icon(
                            Icons.music_note,
                            color: AppTheme.voltLime,
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        band?.name ?? 'Unknown Band',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      if (band?.genre != null)
                        Text(
                          band!.genre!,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppTheme.textTertiary,
                          ),
                        ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  color: AppTheme.textTertiary,
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),
          Divider(color: Theme.of(context).colorScheme.surfaceContainerHighest, height: 1),
          const SizedBox(height: 12),

          // Venue Row
          InkWell(
            onTap: onVenueTap,
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: venue?.imageUrl != null
                        ? CachedNetworkImage(
                            imageUrl: venue!.imageUrl!,
                            fit: BoxFit.cover,
                            errorWidget: (_, __, ___) => const Icon(
                              Icons.location_on,
                              color: AppTheme.electricBlue,
                            ),
                          )
                        : const Icon(
                            Icons.location_on,
                            color: AppTheme.electricBlue,
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        venue?.name ?? 'Unknown Venue',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      if (venue?.city != null || venue?.state != null)
                        Text(
                          [venue?.city, venue?.state]
                              .where((s) => s != null)
                              .join(', '),
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppTheme.textTertiary,
                          ),
                        ),
                    ],
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  color: AppTheme.textTertiary,
                ),
              ],
            ),
          ),

          // Event Date
          if (formattedDate.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(
                  Icons.calendar_today,
                  size: 16,
                  color: AppTheme.textTertiary,
                ),
                const SizedBox(width: 8),
                Text(
                  formattedDate,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppTheme.textTertiary,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Ratings Section - Band and venue ratings
class _RatingsSection extends StatelessWidget {
  final CheckIn checkIn;

  const _RatingsSection({required this.checkIn});

  Widget _buildRatingRow(String label, double? rating, Color color) {
    if (rating == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                color: AppTheme.textSecondary,
              ),
            ),
          ),
          ...List.generate(5, (i) {
            final isActive = i < rating;
            return Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Icon(
                Icons.star,
                size: 20,
                color: isActive ? color : AppTheme.ratingInactive,
              ),
            );
          }),
          const SizedBox(width: 8),
          Text(
            rating.toStringAsFixed(1),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Ratings',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          _buildRatingRow('Band', checkIn.bandRating, AppTheme.voltLime),
          _buildRatingRow('Venue', checkIn.venueRating, AppTheme.electricBlue),
        ],
      ),
    );
  }
}

/// Notes Section - User's check-in notes
class _NotesSection extends StatelessWidget {
  final String noteText;

  const _NotesSection({required this.noteText});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.format_quote,
                  size: 20,
                  color: AppTheme.voltLime,
                ),
                SizedBox(width: 8),
                Text(
                  'Notes',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              noteText,
              style: const TextStyle(
                fontSize: 15,
                color: AppTheme.textPrimary,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Vibe Tags Section
class _VibeTagsSection extends StatelessWidget {
  final List vibeTags;
  final IconData Function(String) getVibeIcon;

  const _VibeTagsSection({
    required this.vibeTags,
    required this.getVibeIcon,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Vibes',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: vibeTags.map((vibe) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      getVibeIcon(vibe.displayName),
                      size: 16,
                      color: AppTheme.voltLime,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      vibe.displayName,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

/// Photos Carousel
class _PhotosCarousel extends StatelessWidget {
  final List<String> imageUrls;
  final String checkinId;
  final String? currentUserId;
  final String checkinUserId;

  const _PhotosCarousel({
    required this.imageUrls,
    required this.checkinId,
    required this.checkinUserId,
    this.currentUserId,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            'Photos',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
        SizedBox(
          height: 200,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: imageUrls.length,
            itemBuilder: (context, index) {
              final isOwnPhoto = currentUserId != null &&
                  checkinUserId == currentUserId;
              return GestureDetector(
                onLongPress: isOwnPhoto
                    ? null
                    : () => showReportBottomSheet(
                          context,
                          contentType: 'photo',
                          contentId: checkinId,
                        ),
                child: Padding(
                  padding: EdgeInsets.only(
                    right: index < imageUrls.length - 1 ? 8 : 0,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: CachedNetworkImage(
                      imageUrl: imageUrls[index],
                      width: 200,
                      height: 200,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(
                        width: 200,
                        height: 200,
                        color: Theme.of(context).colorScheme.surfaceContainerHighest,
                        child: const Center(
                          child: CircularProgressIndicator(
                            color: AppTheme.voltLime,
                            strokeWidth: 2,
                          ),
                        ),
                      ),
                      errorWidget: (_, __, ___) => Container(
                        width: 200,
                        height: 200,
                        color: Theme.of(context).colorScheme.surfaceContainerHighest,
                        child: const Icon(
                          Icons.broken_image,
                          color: AppTheme.textTertiary,
                          size: 48,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Action Bar - Toast, Comments, Share buttons
class _ActionBar extends StatelessWidget {
  final CheckIn checkIn;
  final VoidCallback onToast;
  final VoidCallback onShare;

  const _ActionBar({
    required this.checkIn,
    required this.onToast,
    required this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          // Toast Button
          _ActionButton(
            icon: Icons.sports_bar,
            label: '${checkIn.toastCount}',
            isActive: checkIn.hasUserToasted,
            activeColor: AppTheme.toastGold,
            onTap: onToast,
          ),
          const SizedBox(width: 24),
          // Comments indicator
          Row(
            children: [
              const Icon(
                Icons.chat_bubble_outline,
                size: 20,
                color: AppTheme.textTertiary,
              ),
              const SizedBox(width: 6),
              Text(
                '${checkIn.commentCount}',
                style: const TextStyle(
                  color: AppTheme.textTertiary,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const Spacer(),
          // Share Button
          IconButton(
            icon: const Icon(Icons.share, color: AppTheme.textSecondary),
            onPressed: onShare,
          ),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final Color? activeColor;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
    this.activeColor,
  });

  @override
  Widget build(BuildContext context) {
    final color = isActive
        ? (activeColor ?? AppTheme.voltLime)
        : AppTheme.textTertiary;

    return GestureDetector(
      onTap: onTap,
      child: Row(
        children: [
          Icon(icon, size: 24, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Comments Section
class _CommentsSection extends StatelessWidget {
  final AsyncValue<List<CheckInComment>> commentsAsync;
  final String checkinId;
  final String Function(String) getTimeAgo;
  final void Function(String) onUserTap;
  final String? currentUserId;

  const _CommentsSection({
    required this.commentsAsync,
    required this.checkinId,
    required this.getTimeAgo,
    required this.onUserTap,
    this.currentUserId,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Comments',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppTheme.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          commentsAsync.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(
                  color: AppTheme.voltLime,
                  strokeWidth: 2,
                ),
              ),
            ),
            error: (error, _) => const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Failed to load comments',
                style: TextStyle(color: AppTheme.error),
              ),
            ),
            data: (comments) {
              if (comments.isEmpty) {
                return Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Column(
                      children: [
                        Icon(
                          Icons.chat_bubble_outline,
                          size: 32,
                          color: AppTheme.textTertiary,
                        ),
                        SizedBox(height: 8),
                        Text(
                          'No comments yet',
                          style: TextStyle(
                            fontSize: 14,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Be the first to comment!',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textTertiary,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }

              return ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: comments.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final comment = comments[index];
                  return _CommentItem(
                    comment: comment,
                    timeAgo: getTimeAgo(comment.createdAt),
                    onUserTap: () => onUserTap(comment.userId),
                    currentUserId: currentUserId,
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Comment Item
class _CommentItem extends StatelessWidget {
  final CheckInComment comment;
  final String timeAgo;
  final VoidCallback onUserTap;
  final String? currentUserId;

  const _CommentItem({
    required this.comment,
    required this.timeAgo,
    required this.onUserTap,
    this.currentUserId,
  });

  @override
  Widget build(BuildContext context) {
    final user = comment.user;
    final userName = user?.username ?? 'Unknown';
    final profileImageUrl = user?.profileImageUrl;
    final isOwnComment =
        currentUserId != null && comment.userId == currentUserId;

    return GestureDetector(
      onLongPress: isOwnComment
          ? null
          : () => showReportBottomSheet(
                context,
                contentType: 'comment',
                contentId: comment.id,
              ),
      child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          GestureDetector(
            onTap: onUserTap,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: profileImageUrl == null ? AppTheme.primaryGradient : null,
              ),
              child: ClipOval(
                child: profileImageUrl != null
                    ? CachedNetworkImage(
                        imageUrl: profileImageUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => Center(
                          child: Text(
                            userName[0].toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      )
                    : Center(
                        child: Text(
                          userName[0].toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    GestureDetector(
                      onTap: onUserTap,
                      child: Text(
                        userName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      timeAgo,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textTertiary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  comment.content,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppTheme.textSecondary,
                    height: 1.4,
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

/// Comment Input
class _CommentInput extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSubmit;
  final bool isLoading;

  const _CommentInput({
    required this.controller,
    required this.onSubmit,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.surfaceContainerHighest, width: 1),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              decoration: InputDecoration(
                hintText: 'Add a comment...',
                hintStyle: const TextStyle(color: AppTheme.textTertiary),
                filled: true,
                fillColor: Theme.of(context).colorScheme.surfaceContainerHigh,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
              ),
              style: const TextStyle(color: AppTheme.textPrimary),
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSubmit(),
            ),
          ),
          const SizedBox(width: 8),
          isLoading
              ? const SizedBox(
                  width: 48,
                  height: 48,
                  child: Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        color: AppTheme.voltLime,
                        strokeWidth: 2,
                      ),
                    ),
                  ),
                )
              : IconButton(
                  icon: const Icon(Icons.send, color: AppTheme.voltLime),
                  onPressed: onSubmit,
                ),
        ],
      ),
    );
  }
}
