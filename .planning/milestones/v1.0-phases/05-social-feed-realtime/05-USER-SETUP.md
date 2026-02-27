# Phase 5: User Setup Required

**Generated:** 2026-02-03
**Phase:** 05-social-feed-realtime
**Status:** Incomplete

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console -> Project Settings -> Service Accounts -> Generate New Private Key -> copy JSON contents | `.env` (Railway) |

## Dashboard Configuration

- [ ] **Enable Cloud Messaging in Firebase project**
  - Location: Firebase Console -> Project Settings -> Cloud Messaging -> Enable
  - Details: Required for FCM push notifications to mobile devices

## Mobile Configuration

- [ ] **Add google-services.json to Android app**
  - Location: Firebase Console -> Project Settings -> Your apps -> Android -> Download google-services.json
  - Copy to: `mobile/android/app/google-services.json`

- [ ] **Add GoogleService-Info.plist to iOS app**
  - Location: Firebase Console -> Project Settings -> Your apps -> iOS -> Download GoogleService-Info.plist
  - Copy to: `mobile/ios/Runner/GoogleService-Info.plist`

## Verification

```bash
# Backend: Check Firebase is configured
echo $FIREBASE_SERVICE_ACCOUNT_JSON | head -c 20
# Should show: {"type":"service_ac...

# Backend: Check notification worker starts
npm start 2>&1 | grep "Notification batch worker"
# Should show: Notification batch worker started

# Mobile: Check FCM token registration
# Run app, check backend logs for POST /api/users/device-token
```

---
**Once all items complete:** Mark status as "Complete"
