import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/brand_widgets.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import '../../../shared/widgets/error_state_widget.dart';
import 'providers/feed_providers.dart';
import 'widgets/feed_card.dart';
import 'widgets/happening_now_card.dart';
import 'widgets/new_checkins_banner.dart';

/// Social Activity Feed - The Home Screen
/// Three tabs: Discover, Friends, and live event activity (Happening Now)
/// Real-time updates via WebSocket with "N new check-ins" banner
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen>
    with SingleTickerProviderStateMixin, FeedWebSocketListenerMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_onTabChanged);
    // Start WebSocket listeners for real-time feed updates
    initFeedWebSocketListeners();
  }

  @override
  void dispose() {
    disposeFeedWebSocketListeners();
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (!_tabController.indexIsChanging) {
      // Mark the current tab as read when switching to it
      _markTabRead(_tabController.index);
    }
  }

  void _markTabRead(int tabIndex) {
    // Index 0 is Discover (global feed) — no mark-read needed
    if (tabIndex == 0) return;

    if (tabIndex == 1) {
      // Friends tab
      final feedItems = ref.read(friendsFeedProvider).value;
      if (feedItems == null || feedItems.isEmpty) return;
      ref
          .read(feedRepositoryProvider)
          .markFeedRead(
            'friends',
            feedItems.first.createdAt,
            lastSeenCheckinId: feedItems.first.id,
          );
    } else if (tabIndex == 2) {
      unawaited(_markHappeningNowRead());
    }
    // Refresh unseen counts. The live-events tab refreshes after its own read.
    if (tabIndex != 2) {
      ref.invalidate(unseenCountsProvider);
    }
  }

  Future<void> _markHappeningNowRead() async {
    try {
      final groups = await ref.read(happeningNowProvider.future);
      if (!mounted || groups.isEmpty) return;

      final latestGroup = groups.reduce(
        (latest, candidate) =>
            candidate.lastCheckinAt.compareTo(latest.lastCheckinAt) > 0
            ? candidate
            : latest,
      );
      await ref
          .read(feedRepositoryProvider)
          .markFeedRead('happening_now', latestGroup.lastCheckinAt);
      if (mounted) ref.invalidate(unseenCountsProvider);
    } catch (_) {
      // Leave the cursor unchanged when the live feed could not be loaded.
    }
  }

  @override
  Widget build(BuildContext context) {
    final unseenAsync = ref.watch(unseenCountsProvider);
    final newCheckinCount = ref.watch(newCheckinCountProvider);

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: BrandGradientBackground(
        heroAsset: AppTheme.feedBackdropAsset,
        heroOpacity: 0.26,
        child: NestedScrollView(
          headerSliverBuilder: (context, innerBoxIsScrolled) => [
            // App Bar with SOUNDCHECK branding
            SliverAppBar(
              floating: true,
              pinned: true,
              toolbarHeight: 70,
              backgroundColor: AppTheme.stageBlack.withValues(alpha: 0.86),
              title: const Row(
                children: [
                  SizedBox(
                    width: 164,
                    child: BrandLogoImage(
                      height: 46,
                      alignment: Alignment.centerLeft,
                    ),
                  ),
                ],
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.search),
                  tooltip: 'Search',
                  onPressed: () => context.push('/search'),
                ),
              ],
              bottom: TabBar(
                controller: _tabController,
                indicatorColor: AppTheme.voltLime,
                labelColor: AppTheme.voltLime,
                unselectedLabelColor: AppTheme.textTertiary,
                indicatorSize: TabBarIndicatorSize.label,
                labelStyle: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
                unselectedLabelStyle: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
                tabs: [
                  const _TabWithBadge(label: 'Discover', count: 0),
                  _TabWithBadge(
                    label: 'Friends',
                    count: unseenAsync.value?.friends ?? 0,
                  ),
                  _TabWithBadge(
                    label: 'Events',
                    count: unseenAsync.value?.happeningNow ?? 0,
                    showLiveDot: (unseenAsync.value?.happeningNow ?? 0) > 0,
                  ),
                ],
              ),
            ),
          ],
          body: TabBarView(
            controller: _tabController,
            children: [
              // Discover (global) tab
              const _GlobalFeedTab(),
              // Friends tab
              _FriendsTab(newCheckinCount: newCheckinCount),
              const _HappeningNowTab(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Tab label with optional unseen count badge and live indicator dot
class _TabWithBadge extends StatelessWidget {
  const _TabWithBadge({
    required this.label,
    required this.count,
    this.showLiveDot = false,
  });

  final String label;
  final int count;
  final bool showLiveDot;

  @override
  Widget build(BuildContext context) {
    return Tab(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label),
          if (showLiveDot && count == 0) ...[
            const SizedBox(width: 6),
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: AppTheme.voltLime,
                shape: BoxShape.circle,
              ),
            ),
          ],
          if (count > 0) ...[
            const SizedBox(width: 6),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Container(
                key: ValueKey(count),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppTheme.hotOrange,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  count > 99 ? '99+' : '$count',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Global discovery feed tab with infinite scroll and pull-to-refresh
class _GlobalFeedTab extends ConsumerStatefulWidget {
  const _GlobalFeedTab();

  @override
  ConsumerState<_GlobalFeedTab> createState() => _GlobalFeedTabState();
}

class _GlobalFeedTabState extends ConsumerState<_GlobalFeedTab> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(globalFeedProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final feedAsync = ref.watch(globalFeedProvider);

    return RefreshIndicator(
      color: AppTheme.voltLime,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
      onRefresh: () async {
        ref.invalidate(globalFeedProvider);
      },
      child: feedAsync.when(
        loading: () => const _FeedLoadingState(),
        error: (error, stack) => _FeedErrorState(
          error: error,
          onRetry: () => ref.invalidate(globalFeedProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: const [
                EmptyStateWidget(
                  type: EmptyStateType.general,
                  customTitle: 'No activity yet',
                  customMessage: 'Check in to a show and it\'ll appear here!',
                ),
              ],
            );
          }

          return ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.only(bottom: 100),
            itemCount: items.length,
            itemBuilder: (context, index) {
              return FeedCard(item: items[index]);
            },
          );
        },
      ),
    );
  }
}

/// Friends feed tab with infinite scroll, pull-to-refresh, and new checkins banner
class _FriendsTab extends ConsumerStatefulWidget {
  const _FriendsTab({required this.newCheckinCount});

  final int newCheckinCount;

  @override
  ConsumerState<_FriendsTab> createState() => _FriendsTabState();
}

class _FriendsTabState extends ConsumerState<_FriendsTab> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      // Near bottom: load more
      ref.read(friendsFeedProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final feedAsync = ref.watch(friendsFeedProvider);

    return RefreshIndicator(
      color: AppTheme.voltLime,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
      onRefresh: () async {
        ref.invalidate(friendsFeedProvider);
        ref.read(newCheckinCountProvider.notifier).reset();
      },
      child: feedAsync.when(
        loading: () => const _FeedLoadingState(),
        error: (error, stack) => _FeedErrorState(
          error: error,
          onRetry: () => ref.invalidate(friendsFeedProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: [
                EmptyStateWidget(
                  type: EmptyStateType.general,
                  customTitle: 'No friend activity yet',
                  customMessage: 'Follow friends to see their check-ins here!',
                  actionLabel: 'Find Friends',
                  onAction: () => context.push('/discover/users'),
                ),
              ],
            );
          }

          return ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.only(bottom: 100),
            itemCount: items.length + 1, // +1 for banner
            itemBuilder: (context, index) {
              // New checkins banner at top
              if (index == 0) {
                return Center(
                  child: NewCheckinsBanner(
                    count: widget.newCheckinCount,
                    onTap: () {
                      ref.invalidate(friendsFeedProvider);
                      ref.read(newCheckinCountProvider.notifier).reset();
                      _scrollController.animateTo(
                        0,
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOut,
                      );
                    },
                  ),
                );
              }

              final item = items[index - 1];
              return FeedCard(item: item);
            },
          );
        },
      ),
    );
  }
}

/// Live check-ins at events happening now. There is no separate events feed.
class _HappeningNowTab extends ConsumerWidget {
  const _HappeningNowTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupsAsync = ref.watch(happeningNowProvider);

    return RefreshIndicator(
      color: AppTheme.voltLime,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
      onRefresh: () async {
        ref.invalidate(happeningNowProvider);
      },
      child: groupsAsync.when(
        loading: () => const _FeedLoadingState(),
        error: (error, stack) => _FeedErrorState(
          error: error,
          onRetry: () => ref.invalidate(happeningNowProvider),
        ),
        data: (groups) {
          if (groups.isEmpty) {
            return ListView(
              children: [
                EmptyStateWidget(
                  type: EmptyStateType.general,
                  customTitle: 'No one\'s checked in right now',
                  customMessage:
                      'Check in to a show to be the first! Your friends will see you here when they follow you.',
                  actionLabel: 'Explore Events',
                  onAction: () => context.go('/discover'),
                ),
              ],
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.only(bottom: 100),
            itemCount: groups.length,
            itemBuilder: (context, index) {
              final group = groups[index];
              return HappeningNowCard(
                group: group,
                onTap: () => context.push('/events/${group.eventId}'),
              );
            },
          );
        },
      ),
    );
  }
}

// ========== Shared state widgets ==========

class _FeedLoadingState extends StatelessWidget {
  const _FeedLoadingState();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: List.generate(
        3,
        (index) => const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: FlashSkeleton(height: 280),
        ),
      ),
    );
  }
}

class _FeedErrorState extends StatelessWidget {
  const _FeedErrorState({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        ErrorStateWidget(
          error: error,
          customMessage: 'Failed to load feed',
          onRetry: onRetry,
        ),
      ],
    );
  }
}
