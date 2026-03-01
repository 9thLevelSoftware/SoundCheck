import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/empty_state_widget.dart';
import 'providers/feed_providers.dart';
import 'widgets/feed_card.dart';
import 'widgets/happening_now_card.dart';
import 'widgets/new_checkins_banner.dart';

/// Social Activity Feed - The Home Screen
/// Three tabs: Friends, Events, Happening Now
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
    _tabController = TabController(length: 4, vsync: this);
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

    final feedItems = ref.read(friendsFeedProvider).value;
    if (feedItems == null || feedItems.isEmpty) return;

    // Shift index by 1 to account for Discover tab at index 0
    final feedTypes = ['friends', 'event', 'happening_now'];
    final adjustedIndex = tabIndex - 1;
    if (adjustedIndex >= 0 && adjustedIndex < feedTypes.length) {
      ref.read(feedRepositoryProvider).markFeedRead(
            feedTypes[adjustedIndex],
            feedItems.first.createdAt,
            lastSeenCheckinId: feedItems.first.id,
          );
      // Refresh unseen counts
      ref.invalidate(unseenCountsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final unseenAsync = ref.watch(unseenCountsProvider);
    final newCheckinCount = ref.watch(newCheckinCountProvider);

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          // App Bar with SOUNDCHECK branding
          SliverAppBar(
            floating: true,
            pinned: true,
            backgroundColor: AppTheme.backgroundDark,
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'SOUNDCHECK',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.backgroundDark,
                      letterSpacing: 1.5,
                    ),
                  ),
                ),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.search),
                tooltip: 'Search',
                onPressed: () => context.push('/discover'),
              ),
            ],
            bottom: TabBar(
              controller: _tabController,
              indicatorColor: AppTheme.electricPurple,
              labelColor: AppTheme.electricPurple,
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
                const _TabWithBadge(
                  label: 'Discover',
                  count: 0,
                ),
                _TabWithBadge(
                  label: 'Friends',
                  count: unseenAsync.value?.friends ?? 0,
                ),
                _TabWithBadge(
                  label: 'Events',
                  count: unseenAsync.value?.event ?? 0,
                ),
                _TabWithBadge(
                  label: 'Happening Now',
                  count: unseenAsync.value?.happeningNow ?? 0,
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
            // Events tab
            const _EventsTab(),
            // Happening Now tab
            const _HappeningNowTab(),
          ],
        ),
      ),
    );
  }
}

/// Tab label with optional unseen count badge
class _TabWithBadge extends StatelessWidget {
  const _TabWithBadge({
    required this.label,
    required this.count,
  });

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Tab(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label),
          if (count > 0) ...[
            const SizedBox(width: 6),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Container(
                key: ValueKey(count),
                padding: const EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.neonPink,
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
      color: AppTheme.electricPurple,
      backgroundColor: AppTheme.cardDark,
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
                  customMessage:
                      'Check in to a show and it\'ll appear here!',
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
      color: AppTheme.electricPurple,
      backgroundColor: AppTheme.cardDark,
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

/// Events feed tab -- shows check-ins at events the user has attended
class _EventsTab extends ConsumerWidget {
  const _EventsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(eventsFeedProvider);

    return RefreshIndicator(
      color: AppTheme.electricPurple,
      backgroundColor: AppTheme.cardDark,
      onRefresh: () async {
        ref.invalidate(eventsFeedProvider);
      },
      child: feedAsync.when(
        loading: () => const _FeedLoadingState(),
        error: (error, stack) => _FeedErrorState(
          error: error,
          onRetry: () => ref.invalidate(eventsFeedProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: [
                EmptyStateWidget(
                  type: EmptyStateType.general,
                  customTitle: 'No event activity yet',
                  customMessage: 'RSVP to upcoming events to see activity here!',
                  actionLabel: 'Discover Events',
                  onAction: () => context.go('/discover'),
                ),
              ],
            );
          }

          return ListView.builder(
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

/// Happening Now tab -- shows friends grouped by event
class _HappeningNowTab extends ConsumerWidget {
  const _HappeningNowTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupsAsync = ref.watch(happeningNowProvider);

    return RefreshIndicator(
      color: AppTheme.electricPurple,
      backgroundColor: AppTheme.cardDark,
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
                  customMessage: 'Check in to a show to be the first! Your friends will see you here when they follow you.',
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
              return HappeningNowCard(group: groups[index]);
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
        (index) => Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          height: 280,
          decoration: BoxDecoration(
            color: AppTheme.cardDark,
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Center(
            child: CircularProgressIndicator(
              color: AppTheme.electricPurple,
            ),
          ),
        ),
      ),
    );
  }
}

class _FeedErrorState extends StatelessWidget {
  const _FeedErrorState({
    required this.error,
    required this.onRetry,
  });

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(32.0),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.error_outline,
                  color: AppTheme.neonPink,
                  size: 48,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Failed to load feed',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  error.toString(),
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: onRetry,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.electricPurple,
                  ),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

