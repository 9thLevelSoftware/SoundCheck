# Phase 12: Monetization & Wrapped - Research

**Researched:** 2026-02-28
**Domain:** In-app purchases (RevenueCat), annual recap experience (Wrapped), subscription lifecycle management
**Confidence:** HIGH

## Summary

Phase 12 adds two tightly coupled features: a SoundCheck Wrapped annual recap experience and a SoundCheck Pro subscription tier ($4.99/mo, $39.99/yr) powered by RevenueCat. The Wrapped story-style UI serves as both a standalone engagement feature (free tier) and the primary upsell surface for Pro subscriptions (premium detail page + per-stat share cards).

The mobile side uses `purchases_flutter` (v9.12.x) for RevenueCat SDK integration, with `Purchases.logIn()` synced to the existing auth flow and `CustomerInfo.entitlements` for client-side gating. The backend receives RevenueCat webhooks at a new `POST /api/subscription/webhook` endpoint, validates the Authorization header, and sets `is_premium` on the users table. A new `requirePremium()` middleware (mirroring `requireAdmin()`) gates premium API endpoints.

The Wrapped story UI reuses the existing `PageView.builder` pattern from onboarding and the `elasticOut` scale animation from the celebration screen. Share cards reuse the production-ready satori pipeline in `ShareCardService.ts` with new Wrapped-specific templates using the voltLime brand palette (#D2FF00 on #0D0D0D). No new backend dependencies are needed beyond what already exists.

**Primary recommendation:** Build the Wrapped data pipeline and story UI first (free tier), then layer in RevenueCat integration and premium gating second -- this allows the Wrapped feature to be independently testable before subscription complexity is introduced.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Story format**: 6 slides, full-screen swipeable, 5-second auto-advance with pause/skip, progress bar at top
- **Slide sequence**: Genre % -> Venue count -> Band count -> Home venue -> Top artist -> Total shows + Share CTA
- **Paywall placement**: Full story free, detail page locked behind Pro
- **Share cards**: Free gets 1 summary card; Pro gets per-stat cards (top artist, top venue, genre)
- **Pricing**: $4.99/mo or $39.99/yr (save ~33%)
- **Availability**: Year-round with running stats; December gets "year complete" presentation
- **Minimum threshold**: 3+ check-ins required for Wrapped
- **Visual style**: VoltLime brand (#D2FF00 accents on #0D0D0D dark background)
- **RevenueCat integration**: `purchases_flutter` for mobile, webhook at `POST /api/subscription/webhook`
- **Database**: `is_premium` boolean on users table, migration 038
- **Middleware**: `requirePremium()` following `requireAdmin()` pattern
- **Route pattern**: Dual-router (api + public) for wrapped routes; separate subscription routes

### Claude's Discretion
- No areas explicitly marked for discretion -- all major decisions are locked

### Deferred Ideas (OUT OF SCOPE)
- None captured during discussion
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MONEY-01 | User can view SoundCheck Wrapped annual recap (basic version free) | StatsService extension with year-range filter; PageView story UI with auto-advance timer; 3+ check-in threshold check |
| MONEY-02 | Wrapped generates shareable recap cards via satori pipeline | ShareCardService extension with new Wrapped templates; R2 namespace `cards/wrapped/`; existing ShareCardPreview widget reuse |
| MONEY-03 | User can subscribe to SoundCheck Pro ($4.99/mo) via in-app purchase | purchases_flutter v9.12.x SDK; RevenueCat dashboard configuration; platform-specific IAP capability setup |
| MONEY-04 | Premium users access enhanced Wrapped with detailed analytics | requirePremium() middleware gating detail endpoints; client-side entitlement check for UI gating; premium detail page with deeper stats |
| MONEY-05 | Premium entitlements validated server-side via RevenueCat webhooks | Webhook handler with Authorization header validation; idempotent event processing; is_premium column sync on INITIAL_PURCHASE/RENEWAL/CANCELLATION/EXPIRATION events |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| purchases_flutter | ^9.12.0 | RevenueCat Flutter SDK for IAP | Industry standard abstraction over StoreKit 2 and Google Play Billing 7; handles receipt validation, entitlement management, cross-platform subscription state |
| satori | 0.19.2 (already installed) | HTML/CSS to SVG for share card generation | Already in production for checkin and badge cards; proven pipeline |
| @resvg/resvg-js | 2.6.2 (already installed) | SVG to PNG rasterization | Already in production; pairs with satori |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.25.x (already installed) | Webhook payload validation | Validate incoming RevenueCat webhook payloads before processing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| purchases_flutter (RevenueCat) | in_app_purchase (Flutter team) | RevenueCat handles receipt validation, server sync, cross-platform state; in_app_purchase requires building all of that yourself |
| story_view package | Custom PageView implementation | story_view adds dependency for something achievable with existing PageView.builder pattern already in codebase; custom gives full control over brand styling |

**Installation (mobile):**
```bash
cd mobile && flutter pub add purchases_flutter
```

**No new backend dependencies needed.** satori, @resvg/resvg-js, and zod are already installed.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
  controllers/
    WrappedController.ts       # Wrapped stats + card generation endpoints
    SubscriptionController.ts  # Webhook handler + subscription status
  services/
    WrappedService.ts          # Wrapped stats computation with year filter
    SubscriptionService.ts     # Webhook processing + is_premium sync
  routes/
    wrappedRoutes.ts           # Dual-router: api (authenticated) + public (landing)
    subscriptionRoutes.ts      # Webhook endpoint (no auth) + status (authenticated)
  middleware/
    auth.ts                    # Add requirePremium() here alongside requireAdmin()
  templates/share-cards/
    wrapped-summary-card.ts    # Summary card template (OG + Stories)
    wrapped-stat-card.ts       # Per-stat card templates (top artist, venue, genre)

mobile/lib/src/features/
  wrapped/
    data/
      wrapped_repository.dart     # DioClient-based API calls
    domain/
      wrapped_stats.dart          # Freezed model for Wrapped data
    presentation/
      wrapped_story_screen.dart   # Story slides with auto-advance
      wrapped_detail_screen.dart  # Premium analytics detail page
      wrapped_slide.dart          # Individual slide widget
      wrapped_providers.dart      # Manual Riverpod providers
      widgets/
        story_progress_bar.dart   # Instagram-style segmented progress bar
  subscription/
    data/
      subscription_repository.dart  # DioClient for subscription status
    domain/
      subscription_state.dart       # Freezed model
    presentation/
      subscription_service.dart     # RevenueCat SDK wrapper
      pro_feature_screen.dart       # Dedicated Pro perks + subscribe CTA
      subscription_providers.dart   # Manual Riverpod providers
      widgets/
        premium_paywall_sheet.dart  # Bottom sheet upsell
        pro_badge.dart              # Pro badge widget for profile
```

### Pattern 1: RevenueCat SDK Initialization and User Login
**What:** Initialize purchases_flutter with platform-specific API keys, then sync user identity via `Purchases.logIn()` after authentication.
**When to use:** App startup and after auth state changes.
**Example:**
```dart
// Source: RevenueCat official docs (https://www.revenuecat.com/docs/getting-started/quickstart)
import 'dart:io' show Platform;
import 'package:purchases_flutter/purchases_flutter.dart';

class SubscriptionService {
  static const _appleApiKey = String.fromEnvironment('RC_APPLE_KEY');
  static const _googleApiKey = String.fromEnvironment('RC_GOOGLE_KEY');

  /// Initialize RevenueCat SDK. Call once at app startup.
  static Future<void> initialize() async {
    await Purchases.setLogLevel(LogLevel.debug);

    final PurchasesConfiguration config;
    if (Platform.isIOS) {
      config = PurchasesConfiguration(_appleApiKey);
    } else if (Platform.isAndroid) {
      config = PurchasesConfiguration(_googleApiKey);
    } else {
      return; // Unsupported platform
    }

    await Purchases.configure(config);
  }

  /// Sync RevenueCat identity with app user ID after login.
  static Future<void> login(String userId) async {
    await Purchases.logIn(userId);
  }

  /// Clear RevenueCat identity on logout.
  static Future<void> logout() async {
    await Purchases.logOut();
  }

  /// Check if user has active "pro" entitlement.
  static Future<bool> isPremium() async {
    final customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.all['pro']?.isActive ?? false;
  }
}
```

### Pattern 2: Webhook Handler with Authorization Validation
**What:** Express endpoint that receives RevenueCat webhook events, validates the Authorization header, processes events idempotently, and syncs `is_premium` state.
**When to use:** Receives POST from RevenueCat servers on subscription lifecycle events.
**Example:**
```typescript
// Source: RevenueCat webhook docs + Despia best practices
import { Router, Request, Response } from 'express';

const router = Router();
const WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH!;

// POST /api/subscription/webhook
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== WEBHOOK_AUTH) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Extract event
    const event = req.body?.event;
    if (!event) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // 3. Idempotency check
    const alreadyProcessed = await checkProcessedEvent(event.id);
    if (alreadyProcessed) {
      return res.status(200).json({ message: 'Already processed' });
    }

    // 4. Sync is_premium based on event type
    const appUserId = event.app_user_id;
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        await setUserPremium(appUserId, true);
        break;
      case 'EXPIRATION':
        await setUserPremium(appUserId, false);
        break;
      case 'CANCELLATION':
        // User still has access until expiration_at_ms
        // Don't revoke immediately -- wait for EXPIRATION event
        break;
    }

    // 5. Mark event as processed
    await markEventProcessed(event.id);

    return res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Webhook error:', error);
    // Return 200 to prevent retry storms
    return res.status(200).json({ message: 'Error processed' });
  }
});
```

### Pattern 3: requirePremium() Middleware
**What:** Express middleware that checks `user.isPremium` following the exact same pattern as `requireAdmin()`.
**When to use:** Protecting premium-only API endpoints.
**Example:**
```typescript
// Source: Existing auth.ts pattern
export const requirePremium = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!user.isPremium) {
      res.status(403).json({
        success: false,
        error: 'SoundCheck Pro subscription required',
      });
      return;
    }

    next();
  };
};
```

### Pattern 4: Story-Style Auto-Advance PageView
**What:** Full-screen PageView with 5-second auto-advance timer, segmented progress bar, tap-to-pause, swipe-to-skip.
**When to use:** Wrapped story reveal experience.
**Example:**
```dart
// Source: Reuse of existing onboarding_screen.dart PageView pattern + custom timer
class WrappedStoryScreen extends ConsumerStatefulWidget {
  final int year;
  const WrappedStoryScreen({super.key, required this.year});

  @override
  ConsumerState<WrappedStoryScreen> createState() => _WrappedStoryScreenState();
}

class _WrappedStoryScreenState extends ConsumerState<WrappedStoryScreen>
    with SingleTickerProviderStateMixin {
  final PageController _pageController = PageController();
  late AnimationController _timerController;
  int _currentPage = 0;
  bool _isPaused = false;
  static const _slideCount = 6;
  static const _slideDuration = Duration(seconds: 5);

  @override
  void initState() {
    super.initState();
    _timerController = AnimationController(
      vsync: this,
      duration: _slideDuration,
    )..addStatusListener((status) {
      if (status == AnimationStatus.completed && !_isPaused) {
        _nextSlide();
      }
    });
    _timerController.forward();
  }

  void _nextSlide() {
    if (_currentPage < _slideCount - 1) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
    // Last slide: stop auto-advance, show Share CTA
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => _pause(),
      onTapUp: (_) => _resume(),
      onLongPressEnd: (_) => _resume(),
      child: Scaffold(
        backgroundColor: AppTheme.backgroundDark,
        body: SafeArea(
          child: Stack(
            children: [
              // Slide content
              PageView.builder(
                controller: _pageController,
                itemCount: _slideCount,
                onPageChanged: (index) {
                  setState(() => _currentPage = index);
                  _timerController.reset();
                  _timerController.forward();
                },
                itemBuilder: (context, index) => _buildSlide(index),
              ),
              // Progress bars at top
              Positioned(
                top: 8,
                left: 16,
                right: 16,
                child: StoryProgressBar(
                  slideCount: _slideCount,
                  currentSlide: _currentPage,
                  progress: _timerController,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
  // ...
}
```

### Pattern 5: Wrapped Stats Year-Range Query Extension
**What:** Extend StatsService with `getWrappedStats(userId, year)` that adds `EXTRACT(YEAR FROM c.created_at) = $year` filter.
**When to use:** Computing per-year stats for Wrapped.
**Example:**
```typescript
// Source: Existing StatsService pattern
async getWrappedStats(userId: string, year: number): Promise<WrappedStats> {
  const yearFilter = `AND EXTRACT(YEAR FROM c.created_at) = $2`;

  const result = await this.db.query(
    `SELECT
      (SELECT COUNT(DISTINCT c.id)::int FROM checkins c
       WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE ${yearFilter}) as total_shows,
      (SELECT COUNT(DISTINCT el.band_id)::int FROM checkins c
       JOIN event_lineup el ON c.event_id = el.event_id
       WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE ${yearFilter}) as unique_bands,
      (SELECT COUNT(DISTINCT c.venue_id)::int FROM checkins c
       WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE ${yearFilter}) as unique_venues`,
    [userId, year]
  );
  // ... aggregate top genre, home venue, top artist
}
```

### Anti-Patterns to Avoid
- **Client-side premium validation only:** Never trust the client for entitlement gating. Always validate server-side with `requirePremium()` middleware and the `is_premium` database flag set by webhooks.
- **Direct StoreKit/Play Billing calls:** Do not bypass RevenueCat with raw platform IAP APIs. RevenueCat handles receipt validation, cross-platform sync, and subscription state management.
- **Revoking on CANCELLATION:** Cancellation means auto-renew is off, NOT that access should be removed. The user still has access until the paid period ends. Only revoke on EXPIRATION.
- **Blocking webhook handler errors with non-200 responses:** Return 200 even on processing errors to prevent RevenueCat retry storms. Log the error, return 200, fix later.
- **Using `@riverpod` codegen for subscription providers:** This project uses manual Riverpod providers for feature-level code (established pattern from Phase 10+). Only core providers use codegen.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Receipt validation | Custom Apple/Google receipt verification | RevenueCat SDK (purchases_flutter) | Receipt validation is incredibly complex (Apple vs Google formats, server-to-server verification, grace periods, family sharing); RevenueCat handles all of it |
| Subscription state management | Custom webhook state machine | RevenueCat's entitlement system + webhook events | RevenueCat tracks 17 event types with proper state transitions; custom state machines miss edge cases (billing retries, grace periods, refund reversals) |
| Cross-platform purchase sync | Custom server-side purchase database | RevenueCat customer identity system | Purchases.logIn(userId) automatically syncs purchases across iOS/Android for the same user |
| Instagram-style story progress bar | npm package or complex custom widget | Simple Row of AnimatedBuilder + LinearProgressIndicator | The progress bar is just N segments where one animates -- trivial with AnimationController; packages add dependency for 30 lines of code |
| Share card image pipeline | New image generation system | Extend existing ShareCardService + satori pipeline | Already production-proven for checkin and badge cards; just add new template functions |

**Key insight:** RevenueCat exists specifically because subscription lifecycle management is a known-hard problem (grace periods, billing retries, family sharing, cross-platform sync, receipt validation). Building any of this custom is a months-long project with ongoing maintenance burden.

## Common Pitfalls

### Pitfall 1: RevenueCat User Identity Mismatch
**What goes wrong:** Anonymous RevenueCat users make purchases, then log into the app -- purchases are stranded on a different RevenueCat customer ID.
**Why it happens:** RevenueCat creates anonymous `$RCAnonymousID` if not configured with a user ID before purchase.
**How to avoid:** Call `Purchases.logIn(userId)` immediately after app login (in the AuthState provider), and call `Purchases.logOut()` on app logout. Never configure RevenueCat with a hardcoded ID.
**Warning signs:** Users report "I subscribed but features aren't unlocking" -- check if `app_user_id` in RevenueCat dashboard matches the app's user ID.

### Pitfall 2: Revoking Access on CANCELLATION Instead of EXPIRATION
**What goes wrong:** User cancels subscription but immediately loses access, even though they've paid through the end of the billing period.
**Why it happens:** Developer treats CANCELLATION as "remove access" when it actually means "auto-renew turned off."
**How to avoid:** Only set `is_premium = false` on EXPIRATION events. On CANCELLATION, optionally log it for analytics but do NOT revoke access. The user has paid through `expiration_at_ms`.
**Warning signs:** User complaints about losing access immediately after canceling. App Store / Play Store review rejections.

### Pitfall 3: Non-Idempotent Webhook Processing
**What goes wrong:** Duplicate webhook deliveries cause double-processing (e.g., sending duplicate welcome emails, double-counting revenue).
**Why it happens:** RevenueCat may deliver the same event more than once in rare cases. Network retries compound this.
**How to avoid:** Track processed event IDs. Before processing, check if `event.id` has been seen. Use `INSERT ... ON CONFLICT DO NOTHING` or a dedicated `processed_webhook_events` table.
**Warning signs:** Duplicate analytics events, duplicate emails, inconsistent subscription state.

### Pitfall 4: Missing App Store / Play Store Compliance Requirements
**What goes wrong:** App rejected during review for subscription-related compliance failures.
**Why it happens:** Apple and Google have specific requirements for subscription apps that are easy to miss.
**How to avoid:** Ensure these are present:
  - **Restore Purchases button** on the paywall/Pro feature screen (Apple requirement)
  - **Clear pricing disclosure** before purchase (both platforms)
  - **Subscription management link** to platform settings (both platforms)
  - **Terms of Service and Privacy Policy** links accessible from paywall
  - **Ongoing value justification** -- clearly communicate what Pro provides
**Warning signs:** Review rejection citing guideline 3.1.2 (ongoing value) or missing restore button.

### Pitfall 5: Webhook Endpoint Not Receiving Events
**What goes wrong:** RevenueCat sends webhooks but they never reach the handler.
**Why it happens:** Webhook URL misconfigured, Authorization header mismatch, firewall blocking, or JSON body parsing issue.
**How to avoid:**
  - Ensure `express.json()` middleware runs before the webhook route
  - Use RevenueCat's TEST event type to verify connectivity
  - Log every incoming request to the webhook endpoint initially
  - Double-check the Authorization header value matches exactly between dashboard and env var
**Warning signs:** RevenueCat dashboard shows webhook delivery failures; `is_premium` never updates.

### Pitfall 6: Satori Layout Surprises with Long Text
**What goes wrong:** Wrapped card renders with text overflow or broken layout when band/venue names are long.
**Why it happens:** Satori uses flexbox-only layout with limited text truncation support.
**How to avoid:** Use `overflow: 'hidden'` and set explicit `maxHeight` on text containers. Truncate names server-side before passing to template (e.g., 30 chars max for band names on cards). Test with edge case data.
**Warning signs:** Cards with clipped or overlapping text in production.

### Pitfall 7: Year Boundary Edge Cases
**What goes wrong:** Wrapped shows wrong data during January transition period (previous year data mixed with current year, or previous year Wrapped disappears prematurely).
**Why it happens:** Using `new Date().getFullYear()` without accounting for timezone differences or the transition period.
**How to avoid:** Use explicit year parameter in all Wrapped queries (`EXTRACT(YEAR FROM c.created_at) = $year`). Default to current year on the client but allow year parameter in the API. For December/January edge case: expose both current and previous year endpoints.
**Warning signs:** Users see empty Wrapped on January 1st, or see data from the wrong year.

## Code Examples

### Wrapped Stats Data Model (Freezed)
```dart
// Source: Project convention (Freezed models with snake_case JSON)
import 'package:freezed_annotation/freezed_annotation.dart';

part 'wrapped_stats.freezed.dart';
part 'wrapped_stats.g.dart';

@freezed
class WrappedStats with _$WrappedStats {
  const factory WrappedStats({
    required int year,
    required int totalShows,
    required int uniqueBands,
    required int uniqueVenues,
    required String topGenre,
    required int topGenrePercentage,
    required String homeVenueName,
    required int homeVenueVisits,
    required String topArtistName,
    required int topArtistTimesSeen,
    // Premium-only fields (null for free users)
    List<MonthlyActivity>? monthlyBreakdown,
    List<GenreEvolution>? genreEvolution,
    List<FriendOverlap>? friendOverlap,
    List<TopRatedSet>? topRatedSets,
  }) = _WrappedStats;

  factory WrappedStats.fromJson(Map<String, dynamic> json) =>
      _$WrappedStatsFromJson(json);
}
```

### Wrapped Repository (DioClient Pattern)
```dart
// Source: Project convention (all repos use DioClient, not raw Dio)
class WrappedRepository {
  final DioClient _dioClient;
  WrappedRepository(this._dioClient);

  Future<WrappedStats> getWrappedStats(int year) async {
    final response = await _dioClient.get('/wrapped/$year');
    return WrappedStats.fromJson(response.data['data']);
  }

  Future<WrappedStats> getWrappedDetailStats(int year) async {
    final response = await _dioClient.get('/wrapped/$year/detail');
    return WrappedStats.fromJson(response.data['data']);
  }

  Future<ShareCardUrls> generateWrappedCard(int year, String type) async {
    final response = await _dioClient.post('/wrapped/$year/card/$type');
    final data = response.data['data'] as Map<String, dynamic>;
    return ShareCardUrls(
      ogUrl: data['ogUrl'] as String,
      storiesUrl: data['storiesUrl'] as String,
    );
  }
}
```

### Manual Riverpod Provider Pattern
```dart
// Source: Project convention (manual providers, not @riverpod codegen for features)
final wrappedRepositoryProvider = Provider<WrappedRepository>((ref) {
  final dioClient = ref.watch(dioClientProvider);
  return WrappedRepository(dioClient);
});

final wrappedStatsProvider = FutureProvider.family<WrappedStats, int>((ref, year) {
  final repo = ref.watch(wrappedRepositoryProvider);
  return repo.getWrappedStats(year);
});

final isPremiumProvider = StateProvider<bool>((ref) => false);
```

### Satori Wrapped Card Template (voltLime Brand)
```typescript
// Source: Existing checkin-card.ts pattern, adapted for Wrapped
export interface WrappedSummaryData {
  username: string;
  year: number;
  totalShows: number;
  uniqueBands: number;
  uniqueVenues: number;
  topGenre: string;
  topArtist: string;
}

export function wrappedSummaryCardStories(data: WrappedSummaryData): SatoriElement {
  return el('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#0D0D0D',
      padding: '120px 64px',
      fontFamily: 'Inter',
      justifyContent: 'center',
      alignItems: 'center',
    },
  },
    // Branding
    el('div', {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: '60px',
      },
    },
      el('span', {
        style: { color: '#D2FF00', fontSize: '24px', letterSpacing: '0.1em' },
      }, 'SOUNDCHECK WRAPPED'),
    ),
    // Year
    el('div', {
      style: { color: '#D2FF00', fontSize: '96px', fontWeight: 700, marginBottom: '48px', display: 'flex' },
    }, `${data.year}`),
    // Stats
    el('div', {
      style: { color: '#FFFFFF', fontSize: '48px', fontWeight: 700, marginBottom: '24px', display: 'flex' },
    }, `${data.totalShows} shows`),
    el('div', {
      style: { color: '#9CA3AF', fontSize: '28px', marginBottom: '16px', display: 'flex' },
    }, `${data.uniqueBands} bands \u2022 ${data.uniqueVenues} venues`),
    // Username
    el('div', {
      style: { color: '#6B7280', fontSize: '22px', marginTop: '60px', display: 'flex' },
    }, `@${data.username}`),
  );
}
```

### Story Progress Bar Widget
```dart
// Source: Custom implementation (trivial -- Row of animated segments)
class StoryProgressBar extends StatelessWidget {
  final int slideCount;
  final int currentSlide;
  final AnimationController progress;

  const StoryProgressBar({
    super.key,
    required this.slideCount,
    required this.currentSlide,
    required this.progress,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(slideCount, (index) {
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: index < currentSlide
                ? _buildCompleted()
                : index == currentSlide
                    ? _buildActive()
                    : _buildUpcoming(),
          ),
        );
      }),
    );
  }

  Widget _buildCompleted() {
    return Container(
      height: 3,
      decoration: BoxDecoration(
        color: AppTheme.voltLime,
        borderRadius: BorderRadius.circular(1.5),
      ),
    );
  }

  Widget _buildActive() {
    return AnimatedBuilder(
      animation: progress,
      builder: (context, _) => ClipRRect(
        borderRadius: BorderRadius.circular(1.5),
        child: LinearProgressIndicator(
          value: progress.value,
          backgroundColor: AppTheme.textTertiary.withValues(alpha: 0.3),
          color: AppTheme.voltLime,
          minHeight: 3,
        ),
      ),
    );
  }

  Widget _buildUpcoming() {
    return Container(
      height: 3,
      decoration: BoxDecoration(
        color: AppTheme.textTertiary.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(1.5),
      ),
    );
  }
}
```

### Database Migration 038 Pattern
```typescript
// Source: Existing migration pattern (node-pg-migrate with pgm.sql())
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add is_premium to users table
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE`);

  // Create processed_webhook_events table for idempotency
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      app_user_id TEXT,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Index for cleanup queries
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
            ON processed_webhook_events (processed_at)`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS processed_webhook_events`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS is_premium`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| StoreKit 1 (iOS) | StoreKit 2 via RevenueCat SDK v5+ | 2024 | purchases_flutter v9.x uses StoreKit 2 by default; no code change needed |
| Google Play Billing Library 5-6 | Billing Library 7 via RevenueCat | 2025 | purchases_flutter v9.x wraps BillingClient 7; Google requires v7+ for new apps |
| RevenueCat x-revenuecat-signature header | Authorization header only | ~2024 | No cryptographic signature verification available; Authorization header is the only security mechanism |
| RevenueCat API v1 for server-side checks | Still v1 for GET /subscribers | Current | API v2 `/subscriptions` only covers web purchases; v1 is correct for mobile subscription verification |

**Deprecated/outdated:**
- `x-revenuecat-signature` header: Does not exist despite some third-party docs claiming it does. Use Authorization header.
- RevenueCat API v2 for mobile subscription verification: v2 `/subscriptions` only returns web purchases. Use v1 `/subscribers/{app_user_id}` for mobile.

## Open Questions

1. **RevenueCat API Keys**
   - What we know: Need separate Apple and Google API keys from RevenueCat dashboard; also need a webhook Authorization secret.
   - What's unclear: These are environment-specific secrets that need to be configured in the RevenueCat dashboard and added to the app's environment variables.
   - Recommendation: Add `REVENUECAT_APPLE_KEY`, `REVENUECAT_GOOGLE_KEY`, `REVENUECAT_WEBHOOK_AUTH` to the pending todos in STATE.md. For development, use RevenueCat's test/sandbox environment.

2. **App Store / Play Store Product Configuration**
   - What we know: Products (monthly $4.99, annual $39.99) and entitlements ("pro") must be configured in App Store Connect, Google Play Console, AND the RevenueCat dashboard.
   - What's unclear: This is a manual dashboard step that cannot be automated in code.
   - Recommendation: Document the required product IDs (`soundcheck_pro_monthly`, `soundcheck_pro_annual`) and entitlement ID (`pro`) for the planner. Actual store configuration is a pre-deployment todo.

3. **Processed Webhook Events Table Cleanup**
   - What we know: The `processed_webhook_events` table will grow indefinitely.
   - What's unclear: Optimal retention period.
   - Recommendation: Add a periodic cleanup job (cron or manual) that deletes events older than 30 days. This is non-blocking for the phase.

## Sources

### Primary (HIGH confidence)
- [RevenueCat Flutter Installation](https://www.revenuecat.com/docs/getting-started/installation/flutter) - SDK setup, platform requirements
- [RevenueCat Webhooks](https://www.revenuecat.com/docs/integrations/webhooks) - Webhook configuration, retry behavior, security
- [RevenueCat Event Types](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) - Complete event type list, payload structure
- [RevenueCat Quickstart](https://www.revenuecat.com/docs/getting-started/quickstart) - SDK initialization, entitlement checking
- [RevenueCat Identifying Customers](https://www.revenuecat.com/docs/customers/identifying-customers) - logIn/logOut flow, user identity best practices
- [pub.dev purchases_flutter](https://pub.dev/packages/purchases_flutter/versions) - Current version 9.12.3, Dart SDK >=3.6
- [Satori GitHub](https://github.com/vercel/satori) - CSS support, limitations, font handling, image support
- Existing codebase: `ShareCardService.ts`, `StatsService.ts`, `auth.ts`, `checkin-card.ts`, `onboarding_screen.dart`, `celebration_screen.dart` -- all verified by direct file reads

### Secondary (MEDIUM confidence)
- [Despia Webhook Best Practices](https://setup.despia.com/best-practices/backend/revenue-cat/webhooks) - Production webhook handler pattern, idempotency, error handling
- [Apple Subscription Guidelines](https://developer.apple.com/app-store/subscriptions/) - Restore purchases requirement, ongoing value, disclosure requirements
- [RevenueCat Community - Webhook Security](https://community.revenuecat.com/general-questions-7/how-to-secure-revenuecat-webhooks-with-an-api-key-5705) - Confirmed Authorization header is the only security mechanism

### Tertiary (LOW confidence)
- [Flutter Gems Story View packages](https://fluttergems.dev/story-view/) - Survey of story UI packages (decision: not using, building custom with PageView)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - purchases_flutter is the industry standard Flutter IAP solution; satori/resvg already proven in production
- Architecture: HIGH - All patterns directly extend proven codebase patterns (dual-router, DioClient, manual Riverpod providers, ShareCardService)
- Pitfalls: HIGH - RevenueCat webhook behavior, store compliance requirements, and identity management are well-documented by official sources
- Wrapped UI: HIGH - PageView.builder and AnimationController patterns already in codebase; just combining them with a timer

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable -- RevenueCat SDK and satori are mature)
