import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../providers/providers.dart';
import '../services/analytics_service.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/reset_password_screen.dart';
import '../../features/feed/presentation/feed_screen.dart';
import '../../features/discover/presentation/discover_screen.dart';
import '../../features/checkins/presentation/checkin_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/profile/presentation/edit_profile_screen.dart';
import '../../features/profile/presentation/settings_screen.dart';
import '../../features/profile/presentation/user_profile_screen.dart';
import '../../features/profile/presentation/blocked_users_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/venues/presentation/venue_detail_screen.dart';
import '../../features/bands/presentation/band_detail_screen.dart';
import '../../features/checkins/presentation/checkin_detail_screen.dart';
import '../../features/badges/presentation/badge_collection_screen.dart';
import '../../features/sharing/presentation/celebration_screen.dart';
import '../../features/events/presentation/event_detail_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/onboarding/presentation/genre_picker_screen.dart';
import '../../features/verification/presentation/claim_submission_screen.dart';
import '../../features/verification/presentation/my_claims_screen.dart';
import '../../features/wrapped/presentation/wrapped_story_screen.dart';
import '../../features/wrapped/presentation/wrapped_detail_screen.dart';
import '../../features/subscription/presentation/pro_feature_screen.dart';
import '../../shared/widgets/scaffold_with_nav_bar.dart';

part 'app_router.g.dart';

// Custom Listenable for auth state changes
class _AuthStateNotifier extends ChangeNotifier {
  _AuthStateNotifier(this._ref) {
    _ref.listen(authStateProvider, (_, __) {
      notifyListeners();
    });
  }

  final Ref _ref;
}

@riverpod
GoRouter goRouter(Ref ref) {
  final authState = ref.watch(authStateProvider);
  final notifier = _AuthStateNotifier(ref);

  return GoRouter(
    initialLocation: '/splash',
    observers: [
      if (AnalyticsService.observer != null) AnalyticsService.observer!,
    ],
    redirect: (context, state) {
      final isLoading = authState.isLoading;
      final isAuthenticated = authState.hasValue && authState.value != null;
      final isError = authState.hasError;
      final isOnAuthPage = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/register') ||
          state.matchedLocation.startsWith('/forgot-password') ||
          state.matchedLocation.startsWith('/reset-password');
      final isOnOnboardingPage =
          state.matchedLocation.startsWith('/onboarding');

      // Don't redirect if on auth pages during loading or error state
      // This allows the auth screens to show their own loading/error UI
      if (isOnAuthPage && (isLoading || isError)) {
        return null;
      }

      // Allow onboarding pages without authentication
      if (isOnOnboardingPage) {
        return null;
      }

      // Only redirect to splash during initial app loading (not auth actions)
      if (isLoading && !isOnAuthPage) {
        return '/splash';
      }

      if (!isAuthenticated && !isOnAuthPage) {
        return '/login';
      }

      if (isAuthenticated && isOnAuthPage) {
        return '/feed';
      }

      if (state.matchedLocation == '/splash') {
        return isAuthenticated ? '/feed' : '/login';
      }

      return null;
    },
    refreshListenable: notifier,
    routes: [
      // Splash Route (for loading state)
      GoRoute(
        path: '/splash',
        builder: (context, state) => const Scaffold(
          body: Center(
            child: CircularProgressIndicator(),
          ),
        ),
      ),

      // Auth Routes
      GoRoute(
        path: '/login',
        name: 'login',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const LoginScreen(),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        ),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const RegisterScreen(),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            const begin = Offset(1.0, 0.0);
            const end = Offset.zero;
            const curve = Curves.easeInOut;
            final tween = Tween(begin: begin, end: end).chain(
              CurveTween(curve: curve),
            );
            return SlideTransition(
              position: animation.drive(tween),
              child: child,
            );
          },
        ),
      ),

      // Forgot Password Route
      GoRoute(
        path: '/forgot-password',
        name: 'forgot-password',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const ForgotPasswordScreen(),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            const begin = Offset(1.0, 0.0);
            const end = Offset.zero;
            const curve = Curves.easeInOut;
            final tween = Tween(begin: begin, end: end).chain(
              CurveTween(curve: curve),
            );
            return SlideTransition(
              position: animation.drive(tween),
              child: child,
            );
          },
        ),
      ),

      // Reset Password Route (Deep Link from email)
      GoRoute(
        path: '/reset-password',
        name: 'reset-password',
        pageBuilder: (context, state) {
          final token = state.uri.queryParameters['token'] ?? '';
          return CustomTransitionPage(
            key: state.pageKey,
            child: ResetPasswordScreen(token: token),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Onboarding Routes
      GoRoute(
        path: '/onboarding',
        name: 'onboarding',
        builder: (context, state) => const OnboardingScreen(),
        routes: [
          GoRoute(
            path: 'genres',
            name: 'onboarding-genres',
            builder: (context, state) => const GenrePickerScreen(),
          ),
        ],
      ),

      // Main App Routes with Shell Navigation (4 branches)
      // Feed, Discover, Profile, Notifications
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return ScaffoldWithNavBar(navigationShell: navigationShell);
        },
        branches: [
          // Feed Branch (Home)
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/feed',
                name: 'feed',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: FeedScreen(),
                ),
              ),
            ],
          ),

          // Discover Branch
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/discover',
                name: 'discover',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: DiscoverScreen(),
                ),
              ),
            ],
          ),

          // Profile Branch
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                name: 'profile',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: ProfileScreen(),
                ),
                routes: [
                  GoRoute(
                    path: 'edit',
                    name: 'edit-profile',
                    pageBuilder: (context, state) {
                      return CustomTransitionPage(
                        key: state.pageKey,
                        child: const EditProfileScreen(),
                        transitionsBuilder: (context, animation, secondaryAnimation, child) {
                          const begin = Offset(1.0, 0.0);
                          const end = Offset.zero;
                          const curve = Curves.easeInOut;
                          final tween = Tween(begin: begin, end: end).chain(
                            CurveTween(curve: curve),
                          );
                          return SlideTransition(
                            position: animation.drive(tween),
                            child: child,
                          );
                        },
                      );
                    },
                  ),
                  GoRoute(
                    path: 'settings',
                    name: 'settings',
                    pageBuilder: (context, state) {
                      return CustomTransitionPage(
                        key: state.pageKey,
                        child: const SettingsScreen(),
                        transitionsBuilder: (context, animation, secondaryAnimation, child) {
                          const begin = Offset(1.0, 0.0);
                          const end = Offset.zero;
                          const curve = Curves.easeInOut;
                          final tween = Tween(begin: begin, end: end).chain(
                            CurveTween(curve: curve),
                          );
                          return SlideTransition(
                            position: animation.drive(tween),
                            child: child,
                          );
                        },
                      );
                    },
                    routes: [
                      GoRoute(
                        path: 'blocked-users',
                        name: 'blocked-users',
                        pageBuilder: (context, state) {
                          return CustomTransitionPage(
                            key: state.pageKey,
                            child: const BlockedUsersScreen(),
                            transitionsBuilder: (context, animation, secondaryAnimation, child) {
                              const begin = Offset(1.0, 0.0);
                              const end = Offset.zero;
                              const curve = Curves.easeInOut;
                              final tween = Tween(begin: begin, end: end).chain(
                                CurveTween(curve: curve),
                              );
                              return SlideTransition(
                                position: animation.drive(tween),
                                child: child,
                              );
                            },
                          );
                        },
                      ),
                      GoRoute(
                        path: 'my-claims',
                        name: 'my-claims',
                        pageBuilder: (context, state) {
                          return CustomTransitionPage(
                            key: state.pageKey,
                            child: const MyClaimsScreen(),
                            transitionsBuilder: (context, animation, secondaryAnimation, child) {
                              const begin = Offset(1.0, 0.0);
                              const end = Offset.zero;
                              const curve = Curves.easeInOut;
                              final tween = Tween(begin: begin, end: end).chain(
                                CurveTween(curve: curve),
                              );
                              return SlideTransition(
                                position: animation.drive(tween),
                                child: child,
                              );
                            },
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),

          // Notifications Branch
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/notifications',
                name: 'notifications',
                pageBuilder: (context, state) => const NoTransitionPage(
                  child: NotificationsScreen(),
                ),
              ),
            ],
          ),
        ],
      ),

      // Check-in Route (Modal/Full Screen)
      GoRoute(
        path: '/checkin',
        name: 'checkin',
        pageBuilder: (context, state) {
          return CustomTransitionPage(
            key: state.pageKey,
            child: const CheckInScreen(),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(0.0, 1.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Celebration Route (Post Check-in)
      GoRoute(
        path: '/celebration',
        name: 'celebration',
        pageBuilder: (context, state) {
          final params = state.extra as CelebrationParams;
          return CustomTransitionPage(
            key: state.pageKey,
            child: CelebrationScreen(params: params),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(0.0, 1.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Badge Collection Route
      GoRoute(
        path: '/badges',
        name: 'badges',
        pageBuilder: (context, state) {
          return CustomTransitionPage(
            key: state.pageKey,
            child: const BadgeCollectionScreen(),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Band Detail Route
      GoRoute(
        path: '/bands/:id',
        name: 'band-detail',
        pageBuilder: (context, state) {
          final bandId = state.pathParameters['id']!;
          return CustomTransitionPage(
            key: state.pageKey,
            child: BandDetailScreen(bandId: bandId),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Venue Detail Route
      GoRoute(
        path: '/venues/:id',
        name: 'venue-detail',
        pageBuilder: (context, state) {
          final venueId = state.pathParameters['id']!;
          return CustomTransitionPage(
            key: state.pageKey,
            child: VenueDetailScreen(venueId: venueId),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Event Detail Route
      GoRoute(
        path: '/events/:id',
        name: 'event-detail',
        pageBuilder: (context, state) {
          final eventId = state.pathParameters['id']!;
          return CustomTransitionPage(
            key: state.pageKey,
            child: EventDetailScreen(eventId: eventId),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // User Profile Route (for viewing other users)
      GoRoute(
        path: '/users/:id',
        name: 'user-profile',
        pageBuilder: (context, state) {
          final userId = state.pathParameters['id']!;
          return CustomTransitionPage(
            key: state.pageKey,
            child: UserProfileScreen(userId: userId),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Claim Submission Route
      GoRoute(
        path: '/claim/:entityType/:entityId',
        name: 'claim-submission',
        pageBuilder: (context, state) {
          final entityType = state.pathParameters['entityType']!;
          final entityId = state.pathParameters['entityId']!;
          final entityName = state.uri.queryParameters['name'] ?? '';
          return CustomTransitionPage(
            key: state.pageKey,
            child: ClaimSubmissionScreen(
              entityType: entityType,
              entityId: entityId,
              entityName: entityName,
            ),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Check-in Detail Route (for viewing a specific check-in)
      GoRoute(
        path: '/checkins/:id',
        name: 'checkin-detail',
        pageBuilder: (context, state) {
          final checkinId = state.pathParameters['id']!;
          return CustomTransitionPage(
            key: state.pageKey,
            child: CheckInDetailScreen(checkinId: checkinId),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Wrapped Story Route
      GoRoute(
        path: '/wrapped/:year',
        name: 'wrapped',
        pageBuilder: (context, state) {
          final year = int.parse(state.pathParameters['year']!);
          return CustomTransitionPage(
            key: state.pageKey,
            child: WrappedStoryScreen(year: year),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              return FadeTransition(opacity: animation, child: child);
            },
          );
        },
      ),

      // Wrapped Detail Route (premium analytics)
      GoRoute(
        path: '/wrapped/:year/detail',
        name: 'wrapped-detail',
        pageBuilder: (context, state) {
          final year = int.parse(state.pathParameters['year']!);
          return CustomTransitionPage(
            key: state.pageKey,
            child: WrappedDetailScreen(year: year),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),

      // Pro Feature Screen Route
      GoRoute(
        path: '/pro',
        name: 'pro',
        pageBuilder: (context, state) {
          return CustomTransitionPage(
            key: state.pageKey,
            child: const ProFeatureScreen(),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              const begin = Offset(1.0, 0.0);
              const end = Offset.zero;
              const curve = Curves.easeInOut;
              final tween = Tween(begin: begin, end: end).chain(
                CurveTween(curve: curve),
              );
              return SlideTransition(
                position: animation.drive(tween),
                child: child,
              );
            },
          );
        },
      ),
    ],
  );
}
