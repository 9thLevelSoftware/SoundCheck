# Phase 8: Polish & App Store Readiness - Research

**Researched:** 2026-02-03
**Domain:** Flutter UX polish, Apple App Store compliance, privacy manifests, account deletion
**Confidence:** HIGH

## Summary

Phase 8 covers two distinct work streams: UX polish (Plan 08-01) and App Store compliance (Plan 08-02). Research reveals that significant infrastructure already exists in the codebase for both streams. The backend has a complete DataRetentionService with GDPR-compliant account deletion (30-day grace period, data anonymization, transaction-based cleanup), but it lacks API routes to expose this to the mobile client. The check-in flow, feed cards, badge UI, and profile screen are all implemented from prior phases but need refinement. Photo upload via presigned URLs to Cloudflare R2 is fully implemented (PLSH-05 already done). Push notifications via FCM are fully implemented (PLSH-06 already done). Privacy manifests do NOT exist yet and must be created. No Flutter version pinning mechanism (FVM or similar) is in place.

**Primary recommendation:** Focus implementation effort on (1) wiring the existing DataRetentionService to new API routes + mobile UI, (2) creating the PrivacyInfo.xcprivacy file for the app-level manifest, (3) pinning Flutter to a stable version >= 3.27 (avoiding the known 3.24.3/3.24.4 App Store rejection bug), (4) creating a demo account seed script, and (5) UX refinements to existing screens (success state photo upload wiring, feed card enhancements, profile layout tuning).

## Standard Stack

The established libraries/tools for this domain:

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flutter | 3.38.x (target) | Mobile framework | Current stable, supports iOS 26 |
| flutter_riverpod | ^3.1.0 | State management | Already used throughout |
| go_router | ^17.0.1 | Navigation | Already used |
| dio | ^5.4.3+1 | HTTP client | Already used |
| sentry_flutter | ^9.9.2 | Crash reporting | Already used, includes privacy manifest |
| firebase_core | ^4.3.0 | Firebase base | Already used |
| firebase_messaging | ^16.1.1 | Push notifications | Already used |
| firebase_analytics | ^12.1.0 | Analytics | Already used |
| image_picker | ^1.1.2 | Photo capture | Already used |
| flutter_image_compress | ^2.4.0 | Client-side compression | Already used |
| geolocator | ^14.0.2 | Location services | Already used, has own privacy manifest |

### Supporting (new for Phase 8)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| FVM | latest | Flutter version pinning | Pin Flutter SDK per-project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FVM for version pinning | `.flutter-version` file | FVM is more standard, supports CI/CD, team workflows |
| 30-day grace period deletion | Immediate deletion | Grace period is GDPR best practice and matches existing DataRetentionService |

**Installation:**
```bash
# FVM (global install, one-time)
dart pub global activate fvm

# Pin Flutter version for project
cd mobile
fvm use 3.38.6 --pin
```

No new pub dependencies needed -- everything is already in pubspec.yaml.

## Architecture Patterns

### What Already Exists (leverage, don't rebuild)

**Backend:**
- `DataRetentionService` -- Full account deletion with 30-day grace, anonymization, transaction rollback (COMPLETE)
- `DataExportService` -- GDPR data export (COMPLETE)
- `ConsentService` -- User consent management (COMPLETE)
- `R2Service` -- Presigned URL generation for Cloudflare R2 (COMPLETE)
- `UserService.deactivateAccount()` -- Simple deactivation (COMPLETE, but insufficient for Apple requirement)
- `deletion_requests` table -- Already exists in database schema
- `user_consents` table -- Already exists in database schema

**Mobile:**
- `CheckInScreen` -- Event-first flow with GPS auto-suggest, single-tap check-in (COMPLETE)
- `PhotoUploadSheet` -- Camera/gallery picker with direct-to-R2 upload (COMPLETE)
- `FeedCard` -- Untappd-style card with photo, badge indicator, toast/comment actions (COMPLETE)
- `ProfileScreen` -- Concert resume with stats, genres, badges, recent check-ins (COMPLETE)
- `BadgeCollectionScreen` -- Badge grid with progress rings (COMPLETE)
- `SettingsScreen` -- Existing settings with logout (needs: account deletion option)

### What Needs Building

**08-01 UX Polish:**
```
Refinements to existing screens:
1. CheckInScreen success state -> wire photo upload to PhotoUploadSheet (currently shows "coming soon")
2. FeedCard -> optional comment text preview, event date display
3. ProfileScreen -> layout spacing tuning, section ordering
4. Badge showcase -> ensure detail view navigation works
```

**08-02 App Store Compliance:**
```
New code needed:
1. Account deletion API routes (expose DataRetentionService)
2. Account deletion mobile UI (settings screen + confirmation flow)
3. PrivacyInfo.xcprivacy file (iOS privacy manifest)
4. Flutter version pin (.fvmrc or equivalent)
5. Demo account seed script (migration or seed command)
```

### Pattern: Account Deletion Flow

**Apple's Required Flow:**
```
Settings -> "Delete Account" -> Confirmation Dialog ->
  -> Re-authentication (optional but recommended) ->
  -> Inform user of 30-day grace period ->
  -> POST /api/users/me/delete-account ->
  -> Backend: DataRetentionService.requestAccountDeletion() ->
  -> Account deactivated, deletion scheduled ->
  -> User logged out automatically
```

**Backend route pattern (follows existing project conventions):**
```typescript
// New routes in userRoutes.ts
router.post('/me/delete-account', authenticateToken, /* handler */);
router.post('/me/cancel-deletion', authenticateToken, /* handler */);
router.get('/me/deletion-status', authenticateToken, /* handler */);
```

### Pattern: Privacy Manifest Structure

```xml
<!-- ios/Runner/PrivacyInfo.xcprivacy -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <!-- Location data -->
    <!-- Crash data (Sentry) -->
    <!-- Performance data (Sentry) -->
    <!-- User content (photos) -->
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <!-- UserDefaults - CA92.1 -->
    <!-- SystemBootTime - 35F9.1 -->
    <!-- FileTimestamp - C617.1 -->
    <!-- DiskSpace - E174.1 (if needed) -->
  </array>
</dict>
</plist>
```

### Anti-Patterns to Avoid
- **Building a custom deletion service:** The DataRetentionService already exists with proper transaction handling, anonymization, and grace period. Use it.
- **Immediate permanent deletion:** Apple allows grace periods. The existing 30-day grace period is good practice and already implemented.
- **Skipping re-authentication on deletion:** Apple recommends confirmation steps. Add a password/biometric check before initiating deletion.
- **Creating PrivacyInfo.xcprivacy without Xcode integration:** The file must be added to "Copy Bundle Resources" build phase or it will be silently ignored.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Account deletion with data cleanup | Custom DELETE cascade | `DataRetentionService.requestAccountDeletion()` + `executeAccountDeletion()` | Already handles 12+ tables, anonymization, transactions |
| GDPR data export | Custom CSV/JSON builder | `DataExportService.exportUserData()` | Already exports 10 data categories |
| Photo upload to cloud storage | Server-proxied uploads | `R2Service` + `UploadRepository` presigned URL flow | Already implemented, never proxy through Railway |
| Privacy manifest API categories | Manual audit | Check Flutter engine's built-in manifest + SDK manifests | Flutter 3.19+ includes engine-level privacy manifest |
| Flutter version pinning | Manual documentation | FVM with `.fvmrc` committed to repo | Standard tool, supports CI/CD |
| Demo data generation | Manual SQL inserts | Extend existing `seed.ts` script | Already has venue/band seed data patterns |

**Key insight:** Phase 8 is primarily about WIRING existing services to new routes/UI and adding compliance files, not building new core functionality.

## Common Pitfalls

### Pitfall 1: Flutter 3.24.3/3.24.4 App Store Rejection
**What goes wrong:** Apps built with Flutter 3.24.3 or 3.24.4 are rejected by Apple for Guideline 2.5.1 -- these versions reference non-public Apple APIs (kCTFontVariationAxisHiddenKey, etc.)
**Why it happens:** Regression in Flutter engine; symbols for non-public APIs were included in the binary.
**How to avoid:** Pin Flutter to version >= 3.27.0. Current stable is 3.38.6. Use FVM to pin per-project.
**Warning signs:** App Store rejection citing "non-public or deprecated APIs" after Flutter upgrade.
**Confidence:** HIGH -- confirmed P0 bug, fixed in 3.27+, documented in Flutter issue #158423.

### Pitfall 2: Missing Privacy Manifest Causes Silent Rejection
**What goes wrong:** App upload to App Store Connect fails or generates warning emails about missing Required Reason API declarations.
**Why it happens:** Since May 1, 2024, Apple requires all apps using Required Reason APIs to declare them in a PrivacyInfo.xcprivacy file. Flutter apps use UserDefaults, FileTimestamp, SystemBootTime APIs.
**How to avoid:** Create PrivacyInfo.xcprivacy in ios/Runner/, add to Xcode Copy Bundle Resources, declare all Required Reason APIs used by the app and its SDKs.
**Warning signs:** Emails from Apple about "ITMS-91053: Missing API declaration" after TestFlight upload.
**Confidence:** HIGH -- enforced since May 2024, well-documented by Apple.

### Pitfall 3: Account Deletion That Only Deactivates
**What goes wrong:** Apple rejects app because "Delete Account" only sets `is_active = false` without actual data deletion.
**Why it happens:** The existing `DELETE /api/users/me` route calls `UserService.deactivateAccount()` which only flips the is_active flag.
**How to avoid:** Use `DataRetentionService.requestAccountDeletion()` which deactivates AND schedules full data anonymization. Clearly communicate the 30-day timeline to the user.
**Warning signs:** App review feedback citing "account deletion does not appear to delete user data."
**Confidence:** HIGH -- Apple's requirement is explicit: "Temporarily deactivating or disabling an account is insufficient."

### Pitfall 4: Demo Account Gets Deleted or Modified During Review
**What goes wrong:** App Store reviewer logs in with demo account, triggers account deletion or modifies test data, breaking the review.
**Why it happens:** No protection on the demo account.
**How to avoid:** Create a dedicated demo account that either (a) has deletion disabled or (b) is automatically re-seeded. Simpler approach: just document in App Review Notes that the demo account should not be deleted, and ensure the demo data is compelling enough.
**Warning signs:** Rejection for "app completeness" issues.
**Confidence:** MEDIUM -- based on common App Store review patterns.

### Pitfall 5: PrivacyInfo.xcprivacy Created but Not in Build Phase
**What goes wrong:** File exists in ios/Runner/ but Apple still reports missing privacy manifest.
**Why it happens:** The file must be explicitly added to the Xcode project's "Copy Bundle Resources" build phase. Just placing it in the directory is not enough.
**How to avoid:** Open Runner.xcworkspace in Xcode, add file to Runner target, verify it appears in Build Phases > Copy Bundle Resources.
**Warning signs:** File exists on disk but not in project.pbxproj.
**Confidence:** HIGH -- documented in multiple Flutter community guides.

### Pitfall 6: Success State Photo Upload Not Wired
**What goes wrong:** Users complete event-first check-in, tap "Add photos" on success screen, see "Photo uploads coming soon!" snackbar instead of the PhotoUploadSheet.
**Why it happens:** The check-in screen's success state has a placeholder for photo upload (line 482-490 of checkin_screen.dart) that was never wired to the existing PhotoUploadSheet widget.
**How to avoid:** Replace the placeholder SnackBar with a call to show PhotoUploadSheet bottom sheet, passing the completed check-in ID.
**Warning signs:** The code literally says `'Photo uploads coming soon!'` on line 488.
**Confidence:** HIGH -- verified by reading the source code.

## Code Examples

Verified patterns from the existing codebase:

### Account Deletion Route (new, follows existing route patterns)
```typescript
// Backend: add to userRoutes.ts (follows existing pattern)
import { DataRetentionService } from '../services/DataRetentionService';
const dataRetentionService = new DataRetentionService();

router.post('/me/delete-account', authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    const result = await dataRetentionService.requestAccountDeletion(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/me/cancel-deletion', authenticateToken, async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    const result = await dataRetentionService.cancelDeletionRequest(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
```

### Wire Photo Upload in Success State (existing pattern)
```dart
// In checkin_screen.dart success state, replace "coming soon" snackbar:
_EnrichmentCard(
  icon: Icons.camera_alt,
  iconColor: AppTheme.electricBlue,
  label: 'Add photos',
  completed: _photosUploaded,
  onTap: () {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surfaceDark,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => PhotoUploadSheet(
        checkinId: _completedCheckIn!.id,
        onComplete: (updatedCheckIn) {
          setState(() {
            _completedCheckIn = updatedCheckIn;
            _photosUploaded = true;
          });
        },
      ),
    );
  },
),
```

### Account Deletion UI (follows existing SettingsScreen pattern)
```dart
// Add to settings_screen.dart Account section, before Logout tile:
_SettingsTile(
  title: 'Delete Account',
  leading: const Icon(Icons.delete_forever, color: AppTheme.error),
  textColor: AppTheme.error,
  onTap: () => _showDeleteAccountDialog(context, ref),
),
```

### Demo Account Seed Migration
```typescript
// Migration pattern (follows existing seed.ts conventions):
// Create a demo user with known credentials for App Store review
const DEMO_USER = {
  email: 'demo@soundcheck.app',
  username: 'demo_user',
  password: 'SoundCheck2026!',  // Provide in App Review Notes
  firstName: 'Demo',
  lastName: 'User',
};
// Seed with check-ins, badges, followers for realistic experience
```

### PrivacyInfo.xcprivacy (complete template for this app)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePreciseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeCrashData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePerformanceData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>35F9.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No privacy manifest needed | PrivacyInfo.xcprivacy required for all apps | May 2024 | Rejection without it |
| Flutter 3.24.x for App Store | Flutter >= 3.27 (current: 3.38.6) | Oct 2024 | 3.24.3/3.24.4 rejected by Apple |
| Account deactivation sufficient | Full account deletion required | Jun 2022 | Apple rejects deactivation-only |
| No Flutter version pinning | FVM with .fvmrc per-project | 2024+ | Prevents "works on my machine" issues |
| iOS 18 SDK minimum | iOS 18 SDK (April 2025), iOS 26 SDK (April 2026) | Apr 2025 | Must use Xcode 16+ currently |

**Deprecated/outdated:**
- `DELETE /api/users/me` calling `deactivateAccount()`: Insufficient for Apple -- must use DataRetentionService for proper deletion
- Flutter 3.24.3/3.24.4: Known P0 bug causes App Store rejection
- Privacy manifest not needed: Enforced since May 2024

## Requirements Assessment

### Already Complete (from prior phases)
| Requirement | Status | Where |
|-------------|--------|-------|
| PLSH-05: R2 photo storage | DONE | R2Service + UploadRepository + PhotoUploadSheet |
| PLSH-06: FCM push notifications | DONE | PushNotificationService + firebase_messaging |
| PLSH-03: Badge showcase UI | MOSTLY DONE | BadgeCollectionScreen with progress rings |
| PLSH-04: Profile as concert resume | MOSTLY DONE | ProfileScreen with concert cred sections |

### Needs Work
| Requirement | What's Missing | Effort |
|-------------|---------------|--------|
| PLSH-01: Check-in flow optimization | Wire photo upload in success state, minor UI tuning | Small |
| PLSH-02: Feed visual cards | Cards exist, may need comment preview + event date | Small |
| PLSH-07: Account deletion end-to-end | API routes + mobile UI (backend service exists) | Medium |
| PLSH-08: Flutter version pin | Add FVM, create .fvmrc, document | Small |
| PLSH-09: Privacy manifests | Create PrivacyInfo.xcprivacy, add to Xcode | Medium |
| PLSH-10: Demo account | Seed script + data population | Medium |

## Open Questions

Things that couldn't be fully resolved:

1. **Exact Flutter version to pin**
   - What we know: Current stable is 3.38.6 (as of Jan 2026). Any version >= 3.27 avoids the 3.24.x bug.
   - What's unclear: Whether the developer has already upgraded past 3.24.x on their machine.
   - Recommendation: Check `flutter --version` during implementation, pin to whatever stable version is installed if >= 3.27, or upgrade to 3.38.6 if on an older version.

2. **Privacy manifest completeness for all SDKs**
   - What we know: Flutter engine (3.19+), sentry_flutter, geolocator_apple, and firebase packages include their own privacy manifests for dynamically linked frameworks.
   - What's unclear: Whether ALL dependencies have up-to-date privacy manifests. Some packages may have been updated since initial install.
   - Recommendation: Run `pod update` after Flutter upgrade to get latest SDK versions with privacy manifests. Upload to TestFlight to verify -- Apple will email about missing declarations.

3. **Sign in with Apple token revocation on account deletion**
   - What we know: Apple requires revoking Sign in with Apple tokens when deleting accounts (if the app uses Sign in with Apple). The app has `sign_in_with_apple: ^7.0.1`.
   - What's unclear: Whether the current SocialAuthService stores Apple refresh tokens that need revocation.
   - Recommendation: Check SocialAuthService during implementation. If Apple tokens are stored, add revocation call to the deletion flow using Apple's REST API.

4. **Demo account protection during review**
   - What we know: The demo account needs realistic data but must not break during review.
   - What's unclear: Whether to add code-level protection or rely on App Review Notes instructions.
   - Recommendation: Add a simple `is_demo` flag check that prevents deletion of the demo account, plus clear instructions in App Review Notes.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/services/DataRetentionService.ts` -- Full account deletion already implemented
- Codebase analysis: `backend/src/services/R2Service.ts` + `mobile/lib/src/features/checkins/data/upload_repository.dart` -- Photo upload pipeline complete
- Codebase analysis: `mobile/lib/src/features/checkins/presentation/checkin_screen.dart` line 482-490 -- Photo upload placeholder identified
- Codebase analysis: `backend/database-schema.sql` -- deletion_requests table exists
- [Apple Developer - Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/) -- Account deletion requirements
- [Apple Developer - Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) -- Privacy manifest spec
- [Apple Developer - Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements) -- SDK privacy requirements

### Secondary (MEDIUM confidence)
- [Flutter Issue #158423](https://github.com/flutter/flutter/issues/158423) -- Flutter 3.24.x App Store rejection (P0, fixed)
- [Sentry Flutter Privacy Manifest Guide](https://docs.sentry.io/platforms/flutter/data-management/apple-privacy-manifest/) -- Sentry privacy manifest details
- [FVM Documentation](https://fvm.app/documentation/guides/basic-commands) -- Flutter version management
- [Flutter SDK Archive](https://docs.flutter.dev/install/archive) -- Current stable version 3.38.6
- [Geolocator Apple PrivacyInfo](https://github.com/Baseflow/flutter-geolocator/blob/main/geolocator_apple/ios/Resources/PrivacyInfo.xcprivacy) -- Geolocator privacy manifest

### Tertiary (LOW confidence)
- WebSearch results for Flutter App Store review preparation best practices
- WebSearch results for iOS privacy manifest enforcement timeline in 2026

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verified against existing pubspec.yaml and package.json
- Architecture: HIGH - Based on direct codebase analysis of existing services
- Account deletion: HIGH - DataRetentionService code reviewed, Apple requirements verified via official docs
- Privacy manifests: HIGH - Apple documentation is authoritative and current
- Flutter version: HIGH - Bug confirmed in Flutter issue tracker, current stable verified
- UX polish areas: HIGH - Identified specific code gaps through source review
- Demo account: MEDIUM - Standard practice, but specific implementation choices are discretionary

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days -- Apple requirements stable, Flutter versions may update)
