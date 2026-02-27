# Phase 9: Trust & Safety Foundation - Research

**Researched:** 2026-02-27
**Domain:** Content moderation, user safety, password reset, auth cleanup
**Confidence:** HIGH

## Summary

Phase 9 implements the trust and safety infrastructure required for App Store Guideline 1.2 compliance and basic auth hygiene. The phase covers seven requirements across three domains: (1) a content reporting and moderation pipeline with automated image scanning, (2) user blocking with bilateral interaction suppression, and (3) authentication cleanup including forgot-password flow and removal of non-functional UI stubs.

The existing codebase provides strong foundations: BullMQ job infrastructure for async image scanning, Cloudflare R2 photo uploads to scan, PostgreSQL with UUID primary keys, JWT auth with refresh tokens, and an admin middleware stub (with a critical gap -- see Pitfalls). The primary new dependencies are `@google-cloud/vision` for SafeSearch image scanning and `resend` for transactional password-reset emails. Both are lightweight, well-maintained, and have generous free tiers.

**Primary recommendation:** Build the report/flag system first (it is the App Store hard blocker), then layer moderation queue and SafeSearch scanning on top, implement blocking as a parallel workstream, and handle forgot-password and auth cleanup as independent tasks.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SAFE-01 | User can report any check-in, comment, or photo for abuse/spam/inappropriate content | Reports table schema, report reason enum, REST endpoints for creating reports on each content type, mobile UI patterns (long-press menu / overflow menu with "Report" option) |
| SAFE-02 | Reported content enters moderation queue with automated Cloud Vision SafeSearch image scan | `@google-cloud/vision` SafeSearch API integration, BullMQ worker pattern (same as badge/notification workers), async scan-after-upload pattern, moderation_items table linking reports to scan results |
| SAFE-03 | Admin can review, approve, or remove reported content from moderation queue | Admin moderation endpoints, requireAdmin middleware fix (isAdmin not populated -- pre-existing bug), moderation queue queries with status filtering, action logging via AuditService |
| SAFE-04 | User can block another user (bilateral -- blocks all interactions in both directions) | user_blocks table, bilateral block check helper, feed/follow/toast/comment query filtering, block/unblock REST endpoints, mobile UI on user profile screen |
| SAFE-05 | User can reset forgotten password via email link | Resend transactional email, password_reset_tokens table, token generation/verification flow, mobile forgot-password screen, rate limiting on reset requests |
| AUTH-01 | Fake biometric login button removed from login screen | Remove biometric UI from login_screen.dart, remove BiometricService provider, remove local_auth dependency |
| AUTH-02 | Facebook sign-in stub removed from login screen | Remove Facebook _SocialLoginButton from login_screen.dart |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google-cloud/vision` | ^4.x | SafeSearch image scanning for uploaded photos | Google's official Node.js client; SafeSearch is the industry standard for UGC image moderation at this scale; 1,000 free units/month, then $1.50/1K |
| `resend` | ^4.x | Transactional email for password reset links | Modern email API with TypeScript support, 3,000 free emails/month, simpler than SendGrid/SES for a single transactional use case |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bullmq` | ^5.67 (existing) | Async job queue for image scanning worker | Already in the project for badge eval, notification batching, and event sync -- reuse the same pattern |
| `ioredis` | ^5.9 (existing) | Redis connection for BullMQ queues | Already in the project; moderation queue uses same Redis infrastructure |
| `bcryptjs` | ^3.0 (existing) | Password hashing for new password after reset | Already used for user registration; reuse for password reset |
| `crypto` (Node built-in) | N/A | Generate secure random reset tokens | Already used for refresh tokens; same pattern for reset tokens |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `resend` | SendGrid | SendGrid is more established but heavier SDK, worse DX, overkill for a single transactional email type. Resend is purpose-built for developer email with simpler API. |
| `resend` | Firebase Auth built-in reset | Firebase Auth has a `sendPasswordResetEmail()` method, but this project uses custom JWT auth, not Firebase Auth for identity. Adopting Firebase Auth just for password reset would require migrating the entire auth system. |
| `@google-cloud/vision` | AWS Rekognition | AWS Rekognition is comparable but SoundCheck already uses Google ecosystem (Firebase). Keeping within GCP reduces credential management complexity. |
| Custom text moderation ML | Simple keyword blocklist + regex | At current scale (pre-launch), custom NLP is massive overkill. Short check-in comments and star ratings have low text-abuse surface area. Keyword blocklist is sufficient. |

**Installation:**
```bash
cd backend
npm install @google-cloud/vision resend
```

No new mobile dependencies required. `local_auth` dependency should be REMOVED (AUTH-01).

## Architecture Patterns

### Recommended Project Structure

New files to add:
```
backend/src/
  controllers/
    ReportController.ts         # Report/block/moderation endpoints
  services/
    ReportService.ts            # Report CRUD, content hiding
    BlockService.ts             # Block/unblock, bilateral check
    ModerationService.ts        # Queue management, admin actions
    ImageModerationService.ts   # Cloud Vision SafeSearch wrapper
    EmailService.ts             # Resend wrapper for transactional email
    PasswordResetService.ts     # Reset token generation/verification
  jobs/
    moderationQueue.ts          # BullMQ queue for image scan jobs
    moderationWorker.ts         # Worker that processes image scans
  routes/
    reportRoutes.ts             # /api/reports, /api/blocks
    moderationRoutes.ts         # /api/admin/moderation (admin-only)
    passwordResetRoutes.ts      # /api/auth/forgot-password, /api/auth/reset-password
  migrations/
    026_reports-and-moderation.ts
    027_user-blocks.ts
    028_password-reset-tokens.ts
    029_add-is-admin-column.ts  # Fix pre-existing gap

mobile/lib/src/
  features/
    auth/
      presentation/
        forgot_password_screen.dart
        reset_password_screen.dart
  shared/
    widgets/
      report_dialog.dart        # Reusable report reason picker
```

### Pattern 1: Async Moderation Pipeline (Scan-After-Upload)

**What:** Photos are uploaded and published immediately. A BullMQ job scans them asynchronously. If flagged, the content is auto-hidden and enters the moderation queue.
**When to use:** For all photo uploads (check-in photos).
**Why:** Blocking the check-in flow on scan results adds 500ms-2s latency to the core UX action. The project explicitly decided against real-time moderation blocking (see REQUIREMENTS.md Out of Scope: "Real-time moderation blocking check-in flow").

```typescript
// In CheckinController after photo upload confirmation:
import { moderationQueue } from '../jobs/moderationQueue';

// Fire-and-forget: enqueue scan job after photo is confirmed uploaded
if (moderationQueue && photoUrls.length > 0) {
  for (const url of photoUrls) {
    await moderationQueue.add('scan-image', {
      contentType: 'checkin_photo',
      contentId: checkinId,
      imageUrl: url,
      userId: req.user.id,
    });
  }
}
```

```typescript
// moderationWorker.ts processes the job:
import { ImageModerationService } from '../services/ImageModerationService';

const imageMod = new ImageModerationService();
const result = await imageMod.scanImage(job.data.imageUrl);

if (result.isFlagged) {
  // Auto-hide the content
  await moderationService.autoHideContent(job.data.contentType, job.data.contentId);
  // Create moderation queue item for admin review
  await moderationService.createModerationItem({
    contentType: job.data.contentType,
    contentId: job.data.contentId,
    reason: 'auto_safesearch',
    safesearchResults: result.annotations,
    status: 'pending_review',
  });
}
```

### Pattern 2: Bilateral Block with Query Filtering

**What:** When user A blocks user B, a single row is inserted with a canonical ordering (blocker_id, blocked_id). All content queries check both directions.
**When to use:** Every query that returns user-generated content (feed, comments, toasts, search results, follower lists).

```typescript
// BlockService helper used by all content-serving queries:
async isBlocked(userA: string, userB: string): Promise<boolean> {
  const result = await this.db.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userA, userB]
  );
  return result.rows.length > 0;
}

// Feed queries add a NOT EXISTS subquery:
// WHERE ... AND NOT EXISTS (
//   SELECT 1 FROM user_blocks
//   WHERE (blocker_id = $userId AND blocked_id = c.user_id)
//      OR (blocker_id = c.user_id AND blocked_id = $userId)
// )
```

### Pattern 3: Time-Limited Token with SHA-256 Hash Storage

**What:** Password reset tokens follow the same pattern as existing refresh tokens -- generate a random token, store only its SHA-256 hash in the database, send the raw token to the user via email, verify by hashing the submitted token and comparing.
**When to use:** Password reset flow.
**Why:** The project already uses this exact pattern for refresh tokens in `backend/src/utils/auth.ts` (lines 166-185). Reusing the pattern ensures consistency and avoids introducing new security primitives.

```typescript
// Generate reset token (same pattern as generateRefreshToken):
const token = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

await db.query(
  `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
   VALUES ($1, $2, $3)`,
  [userId, tokenHash, expiresAt]
);

// Email the raw token to the user via Resend
// User clicks link, submits token + new password
// Server hashes submitted token, looks up matching row
```

### Anti-Patterns to Avoid
- **Blocking check-in flow on moderation scan:** The requirements explicitly exclude this. Scan async, hide if flagged, admin reviews.
- **Storing raw reset tokens in database:** Always store SHA-256 hashes. If the DB is compromised, raw tokens are useless.
- **Unidirectional block checks:** Block MUST be bilateral. If A blocks B, B also cannot see A. Single-direction checks will leak content.
- **Inline block checks (N+1):** Don't check `isBlocked()` per item in a loop. Use a NOT EXISTS subquery in the SQL so the database handles it in one pass.
- **Allowing password reset for social-auth-only users:** Users created via Google/Apple sign-in have a placeholder password (`$SOCIAL_AUTH$`). The reset flow must check for this and show "Sign in with Google/Apple instead" rather than sending a reset email.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image content scanning | Custom ML model or manual review of all photos | `@google-cloud/vision` SafeSearch API | Pre-trained model, 5 content categories, sub-second response, 1K free/month. Custom ML requires training data SoundCheck doesn't have. |
| Transactional email delivery | Raw SMTP, Nodemailer with Gmail | `resend` SDK | Email deliverability is hard (SPF, DKIM, DMARC, warm-up). Resend handles all of it. 3K free emails/month covers password resets at this scale. |
| Report reason taxonomy | Custom freeform text field | Enum/dropdown (spam, harassment, inappropriate, other) | Structured reasons enable automated routing and reporting. Freeform text requires NLP to categorize. |
| Admin role system | Complex RBAC with permissions | Simple `is_admin` boolean column on users table | At this scale, there's one admin (the developer). Full RBAC is premature. The existing `requireAdmin` middleware already checks `isAdmin`. |
| Rate limiting on password reset | Custom implementation | Existing `perUserRateLimit` middleware + IP-based rate limit | The project already has sophisticated per-user rate limiting with Redis. Reuse it for reset requests (5 requests per hour per email). |

**Key insight:** Every component in this phase has a proven pattern already in the codebase (BullMQ workers, SHA-256 token storage, admin middleware, rate limiting). The implementation is mostly wiring existing patterns to new tables and endpoints.

## Common Pitfalls

### Pitfall 1: isAdmin Not Populated from Database
**What goes wrong:** The `requireAdmin` middleware checks `user.isAdmin` but `mapDbUserToUser()` in `dbMappers.ts` never maps `is_admin` from the database. Furthermore, there is no `is_admin` column on the users table at all. The admin moderation queue (SAFE-03) will be completely inaccessible.
**Why it happens:** This is a pre-existing gap. The admin type and middleware were created during v1.0 but the database column was never added. The AdminController exists but its routes are effectively unreachable in production.
**How to avoid:** Migration 029 must add `is_admin BOOLEAN DEFAULT FALSE` to the users table. The `mapDbUserToUser` function must be updated to include `isAdmin: row.is_admin ?? false`. The seed script should set the developer's account as admin.
**Warning signs:** Admin moderation endpoints return 403 for every request.

### Pitfall 2: Social Auth Users and Password Reset
**What goes wrong:** A user who signed up via Google/Apple tries to reset their password. The system sends a reset email, user sets a new password, but their account has `$SOCIAL_AUTH$` as the password hash. Now they have two auth paths (social + password) but may not realize it, or worse, the social auth path breaks.
**Why it happens:** The `SocialAuthService` stores a recognizable placeholder constant (`$SOCIAL_AUTH$`) as the password hash for social-only users.
**How to avoid:** The forgot-password endpoint must check if the user has a social auth account linked. If yes, respond with a message like "Your account uses Google/Apple Sign-In. Please use that method to log in." Do NOT send a reset email.
**Warning signs:** Social auth users receiving password reset emails; `CONCERNS.md` already flagged this risk.

### Pitfall 3: Block Enforcement Gaps in Feed Queries
**What goes wrong:** User blocks someone, but the blocked user's check-ins still appear in the "Happening Now" feed or "Events" discovery feed because those queries don't include block filtering.
**Why it happens:** Multiple services serve content (FeedService, CheckinService, DiscoveryService). Each needs block filtering added independently. Missing even one creates an inconsistent experience.
**How to avoid:** Create a centralized `BlockService.getBlockFilterSQL(userId)` helper that returns a SQL fragment. All content-serving queries include this fragment. Write integration tests that verify blocked content is hidden across ALL feed types.
**Warning signs:** User reports that they can still see blocked user's content in certain views.

### Pitfall 4: Report Spam / Weaponized Reporting
**What goes wrong:** A malicious user submits hundreds of reports against a legitimate user to overwhelm the moderation queue or get content auto-hidden.
**Why it happens:** No rate limit on report submissions; auto-hide threshold too aggressive.
**How to avoid:** Rate limit reports (10 per user per day). Do NOT auto-hide content based on report count alone -- only auto-hide based on SafeSearch scan results. Reports go to the admin queue for human review. Deduplicate: one user can report the same content only once.
**Warning signs:** Moderation queue flooded with reports from a single user.

### Pitfall 5: Password Reset Token Reuse
**What goes wrong:** User requests multiple resets, receives multiple emails, and all tokens remain valid. An attacker who intercepts an older email can still use that token.
**Why it happens:** New tokens don't invalidate old tokens for the same user.
**How to avoid:** When generating a new reset token, revoke all existing tokens for that user first (same pattern as `revokeAllUserTokens` for refresh tokens). Set a 1-hour expiry. After successful reset, revoke all refresh tokens too (forces re-login on all devices).
**Warning signs:** Multiple valid reset tokens in the database for the same user.

## Code Examples

### SafeSearch Image Scanning Service
```typescript
// Source: Google Cloud Vision API official docs
// https://docs.cloud.google.com/vision/docs/detecting-safe-search
import vision from '@google-cloud/vision';

interface SafeSearchResult {
  isFlagged: boolean;
  annotations: {
    adult: string;
    violence: string;
    racy: string;
    spoof: string;
    medical: string;
  };
  flagReasons: string[];
}

export class ImageModerationService {
  private client: vision.ImageAnnotatorClient;

  constructor() {
    // Uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS env var)
    this.client = new vision.ImageAnnotatorClient();
  }

  async scanImage(imageUrl: string): Promise<SafeSearchResult> {
    const [result] = await this.client.safeSearchDetection(imageUrl);
    const annotations = result.safeSearchAnnotation;

    if (!annotations) {
      return { isFlagged: false, annotations: {} as any, flagReasons: [] };
    }

    const flagReasons: string[] = [];
    // Flag if LIKELY or VERY_LIKELY for adult/violence
    // Flag if VERY_LIKELY for racy (concerts have suggestive but not explicit content)
    const highRiskCategories = ['adult', 'violence'];
    const mediumRiskCategories = ['racy'];

    for (const cat of highRiskCategories) {
      const likelihood = (annotations as any)[cat];
      if (likelihood === 'LIKELY' || likelihood === 'VERY_LIKELY') {
        flagReasons.push(`${cat}: ${likelihood}`);
      }
    }
    for (const cat of mediumRiskCategories) {
      const likelihood = (annotations as any)[cat];
      if (likelihood === 'VERY_LIKELY') {
        flagReasons.push(`${cat}: ${likelihood}`);
      }
    }

    return {
      isFlagged: flagReasons.length > 0,
      annotations: {
        adult: annotations.adult || 'UNKNOWN',
        violence: annotations.violence || 'UNKNOWN',
        racy: annotations.racy || 'UNKNOWN',
        spoof: annotations.spoof || 'UNKNOWN',
        medical: annotations.medical || 'UNKNOWN',
      },
      flagReasons,
    };
  }
}
```

### Password Reset Email with Resend
```typescript
// Source: https://resend.com/docs/send-with-nodejs
import { Resend } from 'resend';

export class EmailService {
  private resend: Resend;
  private fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable required');
    }
    this.resend = new Resend(apiKey);
    this.fromAddress = process.env.RESEND_FROM_ADDRESS || 'SoundCheck <noreply@soundcheck.app>';
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL || 'soundcheck://'}reset-password?token=${resetToken}`;

    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: [to],
      subject: 'Reset your SoundCheck password',
      html: `
        <h2>Password Reset</h2>
        <p>You requested a password reset for your SoundCheck account.</p>
        <p>Tap the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#CCFF00;color:#000;text-decoration:none;border-radius:8px;font-weight:bold;">
          Reset Password
        </a>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (error) {
      throw new Error(`Failed to send reset email: ${error.message}`);
    }
  }
}
```

### Database Migrations
```sql
-- Migration 026: Reports and moderation
CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'inappropriate', 'copyright', 'other');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'actioned', 'dismissed');
CREATE TYPE content_type AS ENUM ('checkin', 'comment', 'photo', 'user');

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  content_type content_type NOT NULL,
  content_id UUID NOT NULL,
  target_user_id UUID REFERENCES users(id),
  reason report_reason NOT NULL,
  description TEXT,
  status report_status DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reporter_id, content_type, content_id) -- one report per user per content
);

CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_content ON reports(content_type, content_id);
CREATE INDEX idx_reports_target_user ON reports(target_user_id);

CREATE TABLE moderation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type content_type NOT NULL,
  content_id UUID NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'user_report' or 'auto_safesearch'
  report_id UUID REFERENCES reports(id),
  safesearch_results JSONB,
  status VARCHAR(20) DEFAULT 'pending_review',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  action_taken VARCHAR(50), -- 'approved', 'removed', 'user_warned', 'user_banned'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_moderation_status ON moderation_items(status, created_at);

-- Migration 027: User blocks
CREATE TABLE user_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id) -- can't block yourself
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Migration 028: Password reset tokens
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- Migration 029: Add is_admin column
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Firebase Auth for password reset | Custom JWT auth + Resend transactional email | N/A -- project uses custom auth from day 1 | Must build reset flow from scratch since Firebase Auth isn't used for identity |
| Manual photo review only | Automated pre-screen (Cloud Vision) + human review queue | Google SafeSearch updated Feb 2026 | Two-tier approach: automated catches obvious violations, humans handle edge cases |
| In-app moderation only | Report + auto-scan + admin queue | Apple Guideline 1.2 enforcement | App Store now explicitly requires all four mechanisms (filter, report, block, contact info) |

**Deprecated/outdated:**
- `local_auth` package usage on login screen: The biometric button is a placeholder that simulates auth without actually authenticating against any credential store. It must be removed entirely (AUTH-01).
- Facebook Sign-In stub: Facebook OAuth for mobile apps requires Meta Business verification and app review, which SoundCheck has not pursued. The stub misleads users. Remove entirely (AUTH-02).

## Open Questions

1. **GOOGLE_APPLICATION_CREDENTIALS for Cloud Vision**
   - What we know: Cloud Vision requires a service account JSON file. The project already uses Firebase (which is also GCP). It may be possible to reuse the Firebase service account.
   - What's unclear: Whether the Firebase service account has Vision API permissions, or whether a separate service account is needed.
   - Recommendation: Create a dedicated service account with only `roles/visionai.user` permission. Store the JSON as a Railway environment variable (`GOOGLE_VISION_CREDENTIALS`). Parse and write to a temp file at startup.

2. **Resend domain verification for email deliverability**
   - What we know: Resend requires domain verification (DNS records: SPF, DKIM) to send from a custom domain. Without it, emails come from `@resend.dev` which looks unprofessional and may hit spam filters.
   - What's unclear: Whether `soundcheck.app` domain exists and DNS is accessible.
   - Recommendation: Start with Resend's default `@resend.dev` sender for development. Before production launch, verify the custom domain. The Resend free tier supports custom domains.

3. **Admin user bootstrapping**
   - What we know: There's no `is_admin` column in the database yet. The `requireAdmin` middleware exists but can never pass. There's no admin UI.
   - What's unclear: How to initially set the admin flag. SQL migration with a specific user email? Seed script? Manual SQL?
   - Recommendation: Migration 029 adds the column. A seed script or manual SQL sets `is_admin = true` for the developer's account. No self-service admin promotion needed at this scale.

4. **Deep link handling for password reset on mobile**
   - What we know: The reset email needs to link to the mobile app. Flutter supports deep links via `go_router`. The project uses `go_router` ^17.0.1.
   - What's unclear: Whether Universal Links / App Links are configured. Without them, the `soundcheck://reset-password?token=X` scheme may not work reliably.
   - Recommendation: Use a custom URL scheme (`soundcheck://`) for now. It works without server-side configuration. Universal Links can be added later when a web landing page exists (Phase 10 - SHARE-04).

## Sources

### Primary (HIGH confidence)
- [Google Cloud Vision SafeSearch official docs](https://docs.cloud.google.com/vision/docs/detecting-safe-search) - API usage, SafeSearch categories, likelihood values
- [Google Cloud Vision Node.js client](https://docs.cloud.google.com/nodejs/docs/reference/vision/latest/overview) - Package `@google-cloud/vision` v5.2.0
- [Google Cloud Vision pricing](https://cloud.google.com/vision/pricing) - SafeSearch: first 1K/month free, then $1.50/1K
- [Apple App Store Review Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/) - Exact UGC requirements: filter, report, block, contact info
- [Resend Node.js SDK docs](https://resend.com/docs/send-with-nodejs) - Email sending API
- [Resend npm package](https://www.npmjs.com/package/resend) - Package info and version

### Secondary (MEDIUM confidence)
- [Resend pricing](https://resend.com) - 3,000 free emails/month, domain verification required for custom sender
- [App Store Review Guidelines checklist 2025-2026](https://nextnative.dev/blog/app-store-review-guidelines) - Community interpretation of Guideline 1.2 requirements
- [Content moderation database architecture](https://www.sqlservercentral.com/articles/database-architecture-considerations-for-implementing-content-moderation-services) - Schema patterns for queue management, audit requirements

### Tertiary (LOW confidence)
- None -- all critical claims verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Both `@google-cloud/vision` and `resend` verified against official docs and npm; pricing confirmed
- Architecture: HIGH - All patterns (BullMQ worker, SHA-256 token, bilateral block) already exist in the codebase; this is adaptation, not invention
- Pitfalls: HIGH - isAdmin gap confirmed by reading source code; social auth placeholder confirmed in SocialAuthService.ts; CONCERNS.md already flagged the social auth risk

**Pre-existing issues identified during research:**
1. `is_admin` column missing from users table -- `requireAdmin` middleware can never pass (affects SAFE-03)
2. `mapDbUserToUser()` does not map `is_admin` even if column existed (affects SAFE-03)
3. `SocialAuthService.ts.backup` and `SocialAuthService.ts.bak` files in services directory -- should be cleaned up
4. UserProfileScreen (`user_profile_screen.dart`) is a stub with placeholder content -- needs proper implementation for block/report buttons

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain -- App Store guidelines, Cloud Vision API, and Resend are all mature/stable)
