# Phase 10: Viral Growth Engine - Research

**Researched:** 2026-02-27
**Domain:** Onboarding, social sharing (image generation + platform integration), event RSVP, web landing pages
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- user granted full discretion across all implementation areas.

### Claude's Discretion
- **Onboarding flow:** Carousel content, length, visual style; genre picker interaction pattern (chips, grid, swipe, etc.); how personalized recommendations surface after genre selection; whether to include skip options or require completion
- **Celebration & share UX:** Post-check-in celebration screen layout and animations; badge progress display format; one-tap share flow mechanics; which social platforms to prioritize and how to handle platform-specific formats (e.g., Stories aspect ratio)
- **Share card design:** Visual branding of check-in cards vs badge unlock cards; information density on cards (what metadata to show); web landing page layout for non-users (card preview + app store links); OG/meta tag strategy for link previews
- **RSVP & friend signals:** "I'm Going" button placement and visual treatment; friend avatar display (count, faces, overflow indicator); whether to notify friends when someone RSVPs; how RSVP data feeds into event discovery/recommendations

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONBD-01 | New user sees 3-screen onboarding carousel explaining SoundCheck's value | Existing onboarding scaffold exists -- enhance with branded illustrations and value prop content |
| ONBD-02 | Onboarding includes genre picker that seeds personalized recommendations | New `user_genre_preferences` table + API endpoint; genre picker UI widget; DiscoveryService integration for cold-start recommendations |
| ONBD-03 | After successful check-in, user sees celebration screen with badge progress and share CTA | Transform existing success state in CheckInScreen to celebration screen; integrate badge progress provider + share card trigger |
| SHARE-01 | Server generates shareable check-in card images (1200x630 OG + 1080x1920 Stories variants) | Satori + @resvg/resvg-js for server-side image generation; store to R2; serve via public URL |
| SHARE-02 | User can share check-in card to Instagram Stories, X, and TikTok from celebration screen | `social_share_kit` or `appinio_social_share` for platform-specific sharing; download card image from server then share locally |
| SHARE-03 | User can share badge unlock card to social platforms | Same image generation pipeline as SHARE-01, different card template; share trigger from badge detail screen |
| SHARE-04 | Non-users clicking a shared link see web landing page with card preview and App Store/Play Store CTAs | Express route serving minimal HTML with OG meta tags + card image; single-page HTML template (not a full web app) |
| EVENT-01 | User can RSVP "I'm Going" to upcoming events | New `event_rsvps` table; toggle API endpoint; mobile UI button on event cards/detail |
| EVENT-02 | Event detail shows count and avatars of friends going | Join RSVP data with user_followers; return friend RSVP list in event detail endpoint |
</phase_requirements>

## Summary

Phase 10 spans four distinct technical sub-domains: (1) onboarding enhancement with genre selection, (2) server-side share card image generation, (3) platform-specific social sharing from Flutter, and (4) event RSVP with friend attendance signals. The existing codebase provides strong foundations for each -- there is already an onboarding screen with carousel, a check-in success screen to extend, an R2 service for image hosting, `share_plus` in pubspec, and a DiscoveryService with genre-aware recommendation logic.

The highest-risk area is server-side image generation (SHARE-01). The standard approach is Satori (JSX-to-SVG) + @resvg/resvg-js (SVG-to-PNG), which avoids heavy dependencies like Puppeteer/Chrome. The second riskiest area is platform-specific social sharing (SHARE-02/03) -- `share_plus` only triggers the OS share sheet, not direct-to-platform sharing. For Instagram Stories and TikTok, a dedicated package like `social_share_kit` is needed alongside `share_plus` as a fallback for X (Twitter) and generic sharing.

The RSVP and onboarding features are straightforward CRUD patterns that follow existing codebase conventions (WishlistService pattern for RSVP, SharedPreferences for onboarding state).

**Primary recommendation:** Build a `ShareCardService` using Satori + @resvg/resvg-js that generates two image variants per card, uploads to R2, and returns public URLs. The Flutter app downloads the image and uses platform-specific sharing packages. The web landing page is a simple Express-served HTML template with OG meta tags.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| satori | ^0.12.x | JSX/HTML-to-SVG conversion for share cards | Vercel's official library, widely adopted for OG image generation, JSX-based templating |
| @resvg/resvg-js | ^2.6.x | SVG-to-PNG rasterization | Rust-based, fast, no native binary headaches like sharp for SVG rendering; pure WASM |
| social_share_kit (Flutter) | ^0.1.x | Direct sharing to Instagram Stories, TikTok | Handles native platform APIs for Stories/TikTok; `share_plus` cannot target specific platforms |
| share_plus (Flutter) | ^12.0.1 | OS share sheet fallback (X/Twitter, generic) | Already in project pubspec; standard for untargeted sharing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sharp | ^0.33.x | Image resizing/optimization if needed | Only if card images need post-processing beyond what resvg produces; likely NOT needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| satori | Puppeteer/Chrome headless | Puppeteer is 300MB+ install, slow cold start, memory-heavy; satori is ~2MB, instant |
| @resvg/resvg-js | sharp (for SVG-to-PNG) | sharp works but resvg-js has better SVG spec compliance; sharp is already heavy for just SVG rasterization |
| social_share_kit | appinio_social_share | Both work; social_share_kit has cleaner TikTok support and more recent maintenance |
| Dedicated web app for landing page | Express static HTML | REQUIREMENTS.md says "web landing page for share links is minimal (card preview + CTAs only)" -- no need for React/web framework |

**Installation (backend):**
```bash
cd backend && npm install satori @resvg/resvg-js
```

**Installation (mobile):**
```bash
cd mobile && flutter pub add social_share_kit
```

## Architecture Patterns

### Recommended Project Structure

**Backend additions:**
```
backend/src/
├── services/
│   └── ShareCardService.ts      # Satori rendering + R2 upload
├── controllers/
│   └── ShareController.ts       # Card generation + landing page endpoints
├── routes/
│   └── shareRoutes.ts           # /api/share/* routes
├── templates/
│   └── share-cards/
│       ├── checkin-card.tsx      # Satori JSX template for check-in cards
│       ├── badge-card.tsx        # Satori JSX template for badge cards
│       └── landing-page.html    # Mustache/handlebars-free HTML template
└── fonts/
    └── Inter-Bold.ttf           # Font for card rendering (Satori requires font buffers)
```

**Mobile additions:**
```
mobile/lib/src/features/
├── onboarding/
│   ├── data/
│   │   └── onboarding_repository.dart    # Genre selection API
│   ├── domain/
│   │   └── genre.dart                     # Genre model
│   └── presentation/
│       ├── onboarding_screen.dart         # Enhanced (existing file)
│       ├── genre_picker_screen.dart       # New: genre chip picker
│       └── onboarding_provider.dart       # Enhanced (existing file)
├── sharing/
│   ├── data/
│   │   └── share_repository.dart          # Fetch card images from API
│   ├── presentation/
│   │   ├── share_card_preview.dart        # Card preview + share buttons
│   │   ├── celebration_screen.dart        # Post-check-in celebration
│   │   └── share_providers.dart           # Riverpod providers
│   └── services/
│       └── social_share_service.dart      # Platform-specific share logic
└── shows/  (or events/)
    └── presentation/
        └── rsvp_button.dart               # "I'm Going" widget
```

### Pattern 1: Server-Side Card Image Generation
**What:** Generate branded share card images on the server, store in R2, serve via public URL
**When to use:** For all share card generation (check-in cards and badge cards)
**Why server-side:** Consistent branding across platforms; image works as OG image for web previews; no client-side rendering complexity

```typescript
// ShareCardService.ts pattern
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';

const font = fs.readFileSync('./fonts/Inter-Bold.ttf');

export class ShareCardService {
  async generateCheckinCard(checkin: CheckinCardData): Promise<{ ogUrl: string; storiesUrl: string }> {
    // Generate OG variant (1200x630)
    const ogSvg = await satori(
      checkinCardTemplate(checkin),
      { width: 1200, height: 630, fonts: [{ name: 'Inter', data: font, weight: 700 }] }
    );
    const ogPng = new Resvg(ogSvg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();

    // Generate Stories variant (1080x1920)
    const storiesSvg = await satori(
      checkinStoriesTemplate(checkin),
      { width: 1080, height: 1920, fonts: [{ name: 'Inter', data: font, weight: 700 }] }
    );
    const storiesPng = new Resvg(storiesSvg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng();

    // Upload to R2
    const ogUrl = await this.uploadToR2(ogPng, `cards/checkin/${checkin.id}-og.png`);
    const storiesUrl = await this.uploadToR2(storiesPng, `cards/checkin/${checkin.id}-stories.png`);

    return { ogUrl, storiesUrl };
  }
}
```

### Pattern 2: RSVP as Toggle (WishlistService Pattern)
**What:** Event RSVP follows the same toggle pattern as the existing WishlistService
**When to use:** For the "I'm Going" feature

```typescript
// RsvpService.ts -- mirrors WishlistService conventions
export class RsvpService {
  async toggleRsvp(userId: string, eventId: string): Promise<{ isGoing: boolean }> {
    const existing = await this.db.query(
      'SELECT id FROM event_rsvps WHERE user_id = $1 AND event_id = $2',
      [userId, eventId]
    );
    if (existing.rows.length > 0) {
      await this.db.query('DELETE FROM event_rsvps WHERE user_id = $1 AND event_id = $2', [userId, eventId]);
      return { isGoing: false };
    }
    await this.db.query(
      'INSERT INTO event_rsvps (user_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, eventId]
    );
    return { isGoing: true };
  }

  async getFriendsGoing(userId: string, eventId: string): Promise<{ count: number; friends: FriendAvatar[] }> {
    const result = await this.db.query(`
      SELECT u.id, u.username, u.profile_image_url
      FROM event_rsvps er
      JOIN user_followers uf ON er.user_id = uf.following_id AND uf.follower_id = $1
      JOIN users u ON er.user_id = u.id
      WHERE er.event_id = $2 AND u.is_active = TRUE
      ORDER BY er.created_at DESC
      LIMIT 5
    `, [userId, eventId]);
    // Also get total count separately for "and 12 others"
    ...
  }
}
```

### Pattern 3: Genre Preferences for Cold-Start Recommendations
**What:** Store user's selected genres during onboarding, use them to seed DiscoveryService recommendations before check-in history exists
**When to use:** During onboarding and in the existing recommendation engine

```typescript
// In DiscoveryService.computeRecommendations, modify the user_genres CTE:
// Before (check-in derived only):
//   SELECT b.genre ... FROM checkins c JOIN ...
// After (union with explicit preferences for cold start):
//   WITH user_genres AS (
//     SELECT genre, COALESCE(count, 1) as genre_count FROM (
//       SELECT b.genre, COUNT(*) as count FROM checkins ... GROUP BY b.genre
//       UNION ALL
//       SELECT genre, 1 FROM user_genre_preferences WHERE user_id = $1
//     ) combined GROUP BY genre ORDER BY SUM(genre_count) DESC LIMIT 5
//   )
```

### Pattern 4: Minimal Web Landing Page via Express
**What:** Serve a single HTML page with OG meta tags when a shared link is opened in a browser
**When to use:** For SHARE-04 (non-user landing page)

```typescript
// In shareRoutes.ts
router.get('/c/:checkinId', shareController.renderCheckinLanding);

// In ShareController.ts
renderCheckinLanding = async (req: Request, res: Response) => {
  const { checkinId } = req.params;
  const checkin = await this.checkinService.getCheckinById(checkinId);
  const cardUrl = `${R2_PUBLIC_URL}/cards/checkin/${checkinId}-og.png`;

  res.send(`<!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="${userName} checked in at ${venueName}" />
      <meta property="og:image" content="${cardUrl}" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      ...
    </head>
    <body>
      <!-- Card preview + App Store / Play Store badges -->
    </body>
    </html>`);
};
```

### Anti-Patterns to Avoid
- **Client-side card rendering:** Do NOT generate share card images on the mobile device. Server-side ensures consistent branding, works for OG previews, and avoids mobile rendering inconsistencies.
- **Puppeteer/Chrome for card generation:** Do NOT use headless Chrome. It's 300MB+, slow cold starts on Railway, and memory-hungry. Satori + resvg-js is purpose-built for this.
- **SPA for landing page:** Do NOT build a React/Vue web app for the share landing page. It's a single static HTML page with dynamic OG tags. Server-rendered HTML is faster, simpler, and better for social crawlers (which don't execute JS).
- **Storing genre preferences only in SharedPreferences:** Genre picks MUST be persisted server-side for the recommendation engine. SharedPreferences is for onboarding completion state only.
- **Blocking card generation on check-in flow:** Generate cards async (BullMQ job or fire-and-forget). The celebration screen can show a loading state for the share button while the card generates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSX/HTML to image conversion | Custom Canvas/ImageMagick pipeline | satori + @resvg/resvg-js | Satori handles text wrapping, flexbox layout, font embedding; resvg-js handles SVG spec compliance |
| Instagram Stories sharing | Custom platform intents via MethodChannel | social_share_kit package | Instagram Stories API requires specific native integration (URL schemes, content provider); package handles it |
| TikTok sharing | Custom TikTok Open SDK integration | social_share_kit package | TikTok SDK setup is platform-specific (Swift Package for iOS); package wraps it |
| OG image meta tags | Manual string concatenation | Express HTML template with parameterized tags | Template prevents XSS in user-generated content; consistent meta tag structure |
| Genre chip picker UI | Custom chip layout from scratch | Flutter's `Wrap` + `ChoiceChip` widgets | Built-in Material design, handles overflow wrapping, accessibility built in |

**Key insight:** The image generation pipeline (satori + resvg-js) is the core technical risk. Everything else follows existing patterns in the codebase. Don't try to do card rendering on the client or with heavy server-side solutions.

## Common Pitfalls

### Pitfall 1: Satori Font Loading Failure
**What goes wrong:** Satori renders all text as boxes/squares because fonts aren't loaded correctly.
**Why it happens:** Satori requires font files as `ArrayBuffer`/`Buffer`, not file paths. Fonts must be bundled with the deployment (not fetched at runtime from CDN).
**How to avoid:** Include a `.ttf` font file in the backend repo (e.g., Inter from Google Fonts, MIT licensed). Load with `fs.readFileSync()` once at startup, cache the buffer.
**Warning signs:** Card images show empty rectangles where text should be; no runtime error is thrown.

### Pitfall 2: Satori CSS Subset Limitations
**What goes wrong:** Card layout breaks or silently ignores CSS properties.
**Why it happens:** Satori uses Yoga (React Native layout engine) under the hood, which supports only a subset of CSS -- mainly flexbox. No CSS Grid, no `position: absolute` (use within flex), limited filter support.
**How to avoid:** Design card templates using only flexbox. Test templates in isolation before integrating. Reference Satori's CSS support docs.
**Warning signs:** Elements overlap, don't wrap, or are positioned incorrectly.

### Pitfall 3: Instagram Stories Image Size Rejection
**What goes wrong:** Instagram Stories silently fails to show the shared image.
**Why it happens:** Instagram Stories requires 1080x1920 (9:16 aspect ratio). Wrong dimensions or aspect ratios cause silent failures.
**How to avoid:** Always generate Stories variant at exactly 1080x1920. Test on a real device -- emulator sharing behaves differently.
**Warning signs:** Share action appears to succeed but Instagram opens without the image.

### Pitfall 4: OG Image Cache Staleness
**What goes wrong:** Social media platforms show stale/old card images after user updates their check-in.
**Why it happens:** Facebook, Twitter, and other platforms aggressively cache OG images (sometimes for days/weeks). Serving the same URL with updated content doesn't update the preview.
**How to avoid:** Use content-addressable URLs (include a hash or timestamp in the image URL path). When a card is regenerated, it gets a new URL.
**Warning signs:** Shared links show old images on social media even after regeneration.

### Pitfall 5: Genre Preferences Not Reaching Recommendation Engine
**What goes wrong:** New users complete onboarding, pick genres, but still get generic trending recommendations.
**Why it happens:** Genre preferences stored only client-side or in a table the DiscoveryService doesn't query.
**How to avoid:** Modify the `user_genres` CTE in `DiscoveryService.computeRecommendations()` to UNION explicit preferences with check-in-derived genres. Invalidate recommendation cache when genres are saved.
**Warning signs:** New users with 0 check-ins see same results as before despite genre selection.

### Pitfall 6: RSVP N+1 Queries on Event Lists
**What goes wrong:** Loading a list of 20 events makes 20 separate queries to check RSVP status and friend count.
**Why it happens:** Naively checking RSVP per event in a loop.
**How to avoid:** Batch RSVP status check -- single query with `WHERE event_id IN (...)`. Return RSVP data alongside event list responses (join or sub-select).
**Warning signs:** Event list page loads slowly; database query count spikes.

## Code Examples

### Satori Card Template (JSX)

```tsx
// templates/share-cards/checkin-card.tsx
// NOTE: Satori uses React-like JSX but runs on the server
// All styles must be inline (no external CSS)

interface CheckinCardData {
  username: string;
  bandName: string;
  venueName: string;
  venueCity: string;
  eventDate: string;
  rating: number;
  bandImageUrl?: string;
}

export function checkinCardTemplate(data: CheckinCardData) {
  return (
    <div style={{
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0D0D0D',
      padding: '48px',
      fontFamily: 'Inter',
    }}>
      {/* SoundCheck branding */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
        <span style={{ color: '#A855F7', fontSize: '24px', fontWeight: 700 }}>SoundCheck</span>
      </div>
      {/* Check-in content */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
        <span style={{ color: '#FFFFFF', fontSize: '48px', fontWeight: 700 }}>{data.bandName}</span>
        <span style={{ color: '#A0A0A0', fontSize: '28px', marginTop: '12px' }}>
          {data.venueName} -- {data.venueCity}
        </span>
        <span style={{ color: '#A0A0A0', fontSize: '24px', marginTop: '8px' }}>
          {data.eventDate}
        </span>
      </div>
      {/* User attribution */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#E0E0E0', fontSize: '20px' }}>
          Checked in by @{data.username}
        </span>
      </div>
    </div>
  );
}
```

### Database Migration for RSVP and Genre Preferences

```typescript
// migrations/032_event-rsvps-and-genre-prefs.ts
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Event RSVPs ("I'm Going")
  pgm.createTable('event_rsvps', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    event_id: { type: 'uuid', notNull: true, references: 'events', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });
  pgm.addConstraint('event_rsvps', 'unique_user_event_rsvp', {
    unique: ['user_id', 'event_id'],
  });
  pgm.createIndex('event_rsvps', 'user_id');
  pgm.createIndex('event_rsvps', 'event_id');
  pgm.createIndex('event_rsvps', ['event_id', 'created_at']);

  // User genre preferences (from onboarding)
  pgm.createTable('user_genre_preferences', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    genre: { type: 'varchar(100)', notNull: true },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });
  pgm.addConstraint('user_genre_preferences', 'unique_user_genre', {
    unique: ['user_id', 'genre'],
  });
  pgm.createIndex('user_genre_preferences', 'user_id');

  // Add onboarding_completed_at to users (tracks whether onboarding was finished)
  pgm.addColumn('users', {
    onboarding_completed_at: { type: 'timestamptz' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('users', 'onboarding_completed_at');
  pgm.dropTable('user_genre_preferences', { cascade: true });
  pgm.dropTable('event_rsvps', { cascade: true });
}
```

### Flutter Genre Picker Widget

```dart
// genre_picker_screen.dart
class GenrePickerScreen extends ConsumerStatefulWidget {
  const GenrePickerScreen({super.key});

  @override
  ConsumerState<GenrePickerScreen> createState() => _GenrePickerScreenState();
}

class _GenrePickerScreenState extends ConsumerState<GenrePickerScreen> {
  final Set<String> _selectedGenres = {};
  static const int minGenres = 3;
  static const int maxGenres = 8;

  static const genres = [
    'Rock', 'Metal', 'Punk', 'Indie', 'Alternative',
    'Pop', 'Hip-Hop', 'R&B', 'Electronic', 'EDM',
    'Jazz', 'Blues', 'Country', 'Folk', 'Reggae',
    'Latin', 'Classical', 'Experimental', 'Hardcore', 'Emo',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Header
            const Text('What music do you love?'),
            const Text('Pick at least 3 genres'),
            // Genre chips
            Expanded(
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: genres.map((genre) => ChoiceChip(
                  label: Text(genre),
                  selected: _selectedGenres.contains(genre),
                  onSelected: (selected) {
                    setState(() {
                      if (selected && _selectedGenres.length < maxGenres) {
                        _selectedGenres.add(genre);
                      } else {
                        _selectedGenres.remove(genre);
                      }
                    });
                  },
                )).toList(),
              ),
            ),
            // Continue button
            ElevatedButton(
              onPressed: _selectedGenres.length >= minGenres ? _saveAndContinue : null,
              child: Text('Continue (${_selectedGenres.length}/$minGenres+)'),
            ),
          ],
        ),
      ),
    );
  }
}
```

### Platform-Specific Social Sharing

```dart
// social_share_service.dart
import 'package:share_plus/share_plus.dart';
// import 'package:social_share_kit/social_share_kit.dart'; // for Instagram/TikTok

class SocialShareService {
  /// Share check-in card to Instagram Stories
  static Future<void> shareToInstagramStories(String imagePath) async {
    // social_share_kit handles the native Instagram Stories API
    // await SocialShareKit.shareToInstagramStories(imagePath: imagePath);
  }

  /// Share to TikTok
  static Future<void> shareToTikTok(String imagePath) async {
    // await SocialShareKit.shareToTikTok(imagePath: imagePath);
  }

  /// Share via OS share sheet (for X/Twitter and other platforms)
  static Future<void> shareGeneric({
    required String text,
    required String imagePath,
  }) async {
    await SharePlus.instance.share(
      ShareParams(
        text: text,
        files: [XFile(imagePath)],
      ),
    );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Puppeteer/Chrome for OG images | satori + resvg-js (WASM) | 2023 | 50x smaller footprint, no Chrome dependency, works in serverless/containers |
| Client-side share with text only | Server-generated branded card images | 2023-2024 | Consistent branding, works as OG images, higher engagement |
| share_plus for all platforms | share_plus + platform-specific packages | 2024 | share_plus cannot target Instagram Stories or TikTok directly |
| Hard-coded genre lists | Derive genres from bands table | Always | Genres should match what exists in the database, not a static list |

**Deprecated/outdated:**
- `social_share` (pub.dev) -- unmaintained, last update 2022; use `social_share_kit` instead
- `@vercel/og` -- purpose-built for Vercel Edge Functions, doesn't work well on Railway/Express; use raw `satori` directly

## Open Questions

1. **Font licensing for card images**
   - What we know: Google Fonts (Inter, etc.) are MIT/OFL licensed, safe for embedded use in generated images
   - What's unclear: Whether the project has a brand font already chosen
   - Recommendation: Use Inter Bold (already used via `google_fonts` package in mobile). Include the `.ttf` in the backend repo.

2. **social_share_kit Flutter package maturity**
   - What we know: It supports Instagram Stories and TikTok on both platforms. It requires TikTok developer portal registration for TikTok sharing.
   - What's unclear: Exact current version stability (package is relatively new, ~0.1.x). The alternative `appinio_social_share` is more established but has reported issues with some platforms.
   - Recommendation: Start with `social_share_kit`. If blockers emerge, fall back to `share_plus` OS share sheet for all platforms (less targeted but reliable). Flag for validation during implementation.

3. **Card generation timing**
   - What we know: Generating a card image takes ~100-500ms (satori + resvg-js). Blocking the check-in response is undesirable.
   - What's unclear: Whether BullMQ worker infrastructure should be used or if fire-and-forget is sufficient.
   - Recommendation: Use existing BullMQ infrastructure (badgeWorker pattern). Queue card generation after check-in. The celebration screen shows a loading shimmer on the share button until the card URL is available via polling or WebSocket push.

4. **App Store and Play Store URLs**
   - What we know: The landing page needs store badge links. These are standard Apple/Google badge images with deep link URLs.
   - What's unclear: Whether SoundCheck already has App Store/Play Store listings (it's pre-launch per STATE.md).
   - Recommendation: Use placeholder URLs during development. The landing page template should parameterize store URLs via environment variables for easy updates.

5. **Genre list source of truth**
   - What we know: `bands.genre` is a VARCHAR(100) field. Genres are not normalized (no genres table).
   - What's unclear: How many distinct genres exist in the database. Whether the genre picker should show all DB genres or a curated subset.
   - Recommendation: Curate a list of ~20 top-level genres for the picker (matching common values in the bands table). Store the raw genre string in `user_genre_preferences.genre`. The DiscoveryService already matches on `b.genre` so this will work without normalization.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/services/DiscoveryService.ts` -- existing genre-based recommendation engine with CTE pattern
- Codebase analysis: `backend/src/services/WishlistService.ts` -- toggle pattern for RSVP implementation
- Codebase analysis: `backend/src/services/R2Service.ts` -- existing R2 upload infrastructure for card images
- Codebase analysis: `mobile/lib/src/features/onboarding/` -- existing onboarding screen and provider
- Codebase analysis: `mobile/lib/src/features/checkins/presentation/checkin_screen.dart` -- existing success state to enhance
- Codebase analysis: `backend/database-schema.sql` + `migrations/` -- table patterns and conventions

### Secondary (MEDIUM confidence)
- [Satori GitHub](https://github.com/vercel/satori) -- JSX-to-SVG library capabilities and CSS subset support
- [resvg-js GitHub](https://github.com/thx/resvg-js) -- SVG-to-PNG conversion API
- [social_share_kit GitHub](https://github.com/kaiquegazola/social_share_kit) -- Flutter social sharing package
- [appinio_social_share pub.dev](https://pub.dev/packages/appinio_social_share) -- alternative Flutter sharing package
- [OG meta tag best practices](https://www.opengraph.xyz/) -- Open Graph tag structure and validation

### Tertiary (LOW confidence)
- social_share_kit version/stability -- needs validation during implementation; package is newer with fewer downloads

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH -- satori + resvg-js is well-established for OG image generation; Flutter social sharing packages need implementation validation
- Architecture: HIGH -- all patterns follow existing codebase conventions (service pattern, migration pattern, Riverpod providers)
- Pitfalls: HIGH -- documented from official Satori docs and community experience
- Onboarding/RSVP: HIGH -- straightforward CRUD following WishlistService and onboarding patterns already in codebase

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain, libraries mature)
