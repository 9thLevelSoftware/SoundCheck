# SoundCheck APK Testing Checklist

## 📱 **APK Information**

**File**: `mobile/build/app/outputs/flutter-apk/app-release.apk`
**Size**: 51.6 MB
**Version**: 0.1.0+1 (Beta)
**Package**: com.soundcheck.app
**Build Date**: November 13, 2025

---

## 🚀 **Pre-Installation Setup**

### Prepare Your Android Device

1. **Enable Developer Options**
   ```
   Settings → About Phone → Tap "Build Number" 7 times
   ```

2. **Enable USB Debugging**
   ```
   Settings → Developer Options → USB Debugging (ON)
   ```

3. **Allow Unknown Sources** (if installing via APK)
   ```
   Settings → Security → Unknown Sources (ON)
   ```

4. **Connect Device**
   ```bash
   # Verify device connected
   adb devices

   # Should show: List of devices attached
   #              <device-id>    device
   ```

---

## 📦 **Installation**

### Method 1: ADB Install (Recommended)
```bash
cd C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile

# Install APK
adb install build/app/outputs/flutter-apk/app-release.apk

# If already installed, use -r to replace
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

**Expected Output**:
```
Performing Streamed Install
Success
```

### Method 2: Manual Transfer
1. Copy `app-release.apk` to device (via USB or cloud)
2. On device, tap APK file
3. Tap "Install"
4. Tap "Open" when done

---

## ✅ **Critical Tests (Must Pass)**

### 1. App Launch
- [ ] **App installs without errors**
- [ ] **Tap icon on home screen**
- [ ] **App launches without crash**
- [ ] **Splash screen displays** (if configured)
- [ ] **No ANR (Application Not Responding)** within 5 seconds
- [ ] **Home screen loads**

**Pass Criteria**: App reaches home screen within 5 seconds

---

### 2. Network Connectivity
- [ ] **App connects to backend**
  - Backend URL: `https://soundcheckmobile-production.up.railway.app/api`
- [ ] **No "network error" on launch**
- [ ] **Data loads on home screen**

**Test Command**:
```bash
# Check if backend is reachable from device
adb shell ping -c 3 soundcheckmobile-production.up.railway.app
```

**Pass Criteria**: Backend responds, data loads

---

### 3. User Registration
- [ ] **Navigate to Register screen**
- [ ] **Form fields visible**: Email, Username, Password
- [ ] **Enter test credentials**:
  - Email: `beta.test.{timestamp}@soundcheck.com`
  - Username: `betatester{random}`
  - Password: `TestBeta2024!`
- [ ] **Tap "Register" button**
- [ ] **Success message displays**
- [ ] **User is logged in or redirected to login**

**Pass Criteria**: Registration succeeds, no errors

**Debug**: If fails, check logcat:
```bash
adb logcat | grep -i "error\|exception"
```

---

### 4. User Login
- [ ] **Navigate to Login screen** (if not auto-logged in)
- [ ] **Form fields visible**: Email/Username, Password
- [ ] **Enter credentials** (from registration)
- [ ] **Tap "Login" button**
- [ ] **Success message or redirect**
- [ ] **User reaches authenticated screen** (profile or home)

**Pass Criteria**: Login succeeds, token stored

**Verify Token Storage**:
```bash
# Check secure storage (if using flutter_secure_storage)
adb shell run-as com.soundcheck.app ls -la /data/data/com.soundcheck.app/files
```

---

### 5. Browse Venues
- [ ] **Navigate to Venues screen/tab**
- [ ] **List of venues displays**
- [ ] **Each venue shows**:
  - Venue name
  - Location (city, state)
  - Rating (if available)
  - Capacity or type
- [ ] **Tap on a venue**
- [ ] **Venue detail screen loads**
- [ ] **Detail screen shows**:
  - Full venue info
  - Reviews (if any)
  - Action buttons (review, share, etc.)

**Expected Data**: 5 venues (Madison Square Garden, Red Rocks, etc.)

**Pass Criteria**: Venues list loads, detail view works

---

### 6. Browse Bands
- [ ] **Navigate to Bands screen/tab**
- [ ] **List of bands displays**
- [ ] **Each band shows**:
  - Band name
  - Genre
  - Rating
  - Hometown
- [ ] **Tap on a band**
- [ ] **Band detail screen loads**
- [ ] **Detail screen shows**:
  - Band profile
  - Performance reviews
  - Related info

**Expected Data**: 5 bands (Luna Waves, The Electric Kings, etc.)

**Pass Criteria**: Bands list loads, detail view works

---

### 7. Submit Review (If Authenticated)
- [ ] **Navigate to venue or band detail**
- [ ] **Tap "Write Review" or similar button**
- [ ] **Review form displays**:
  - Rating (1-5 stars)
  - Text input
  - Submit button
- [ ] **Enter test review**:
  - Rating: 4 stars
  - Text: "Great venue! Test review from beta."
- [ ] **Tap "Submit"**
- [ ] **Success message**
- [ ] **Review appears in list**

**Pass Criteria**: Review submits successfully

---

### 8. Profile Screen
- [ ] **Navigate to Profile screen/tab**
- [ ] **User info displays**:
  - Username
  - Email (if shown)
  - Avatar/icon
- [ ] **User stats display** (if implemented):
  - Reviews count
  - Badges earned
  - Venues visited
- [ ] **Badges section visible**
- [ ] **Any earned badges display**

**Pass Criteria**: Profile loads with user data

---

### 9. Navigation
- [ ] **Bottom navigation works** (if using bottom nav)
- [ ] **All tabs accessible**:
  - Home
  - Venues
  - Bands
  - Profile
  - (Any other tabs)
- [ ] **Back button works correctly**
- [ ] **No navigation stack issues**
- [ ] **No crashes during navigation**

**Pass Criteria**: Smooth navigation between all screens

---

### 10. Search (If Implemented)
- [ ] **Search bar visible**
- [ ] **Tap search bar**
- [ ] **Enter search query**: "Madison"
- [ ] **Search results display**
- [ ] **Results are relevant**
- [ ] **Tap result navigates to detail**

**Pass Criteria**: Search works or gracefully indicates "not implemented"

---

## 🛡️ **Error Handling Tests**

### No Internet Connection
- [ ] **Enable Airplane Mode**
- [ ] **Launch app**
- [ ] **App displays "No connection" message** (not crash)
- [ ] **Disable Airplane Mode**
- [ ] **App recovers automatically** or shows retry button

**Pass Criteria**: App handles offline gracefully

---

### Invalid Login
- [ ] **Enter wrong password**
- [ ] **Tap Login**
- [ ] **Error message displays**: "Invalid credentials"
- [ ] **App doesn't crash**
- [ ] **Can retry login**

**Pass Criteria**: Clear error messages, no crashes

---

### Empty States
- [ ] **Check screens with no data**:
  - Empty review list
  - No badges earned
  - No search results
- [ ] **Each shows helpful message** (not blank screen)
- [ ] **No crashes**

**Pass Criteria**: Graceful empty states

---

## 📊 **Performance Tests**

### App Size
- [x] **APK size**: 51.6 MB
- [ ] **Acceptable**: < 100 MB for beta
- [ ] **After install size** (check in Settings → Apps):
  - Expected: 60-80 MB

**Pass Criteria**: Reasonable size for feature set

---

### Load Times
- [ ] **Cold start** (first launch): < 3 seconds to home screen
- [ ] **Warm start** (from background): < 1 second
- [ ] **Screen transitions**: < 0.5 seconds
- [ ] **API requests**: < 2 seconds for list data
- [ ] **Image loading**: Progressive (doesn't block UI)

**Measure Load Time**:
```bash
# Measure app startup time
adb shell am start -W -n com.soundcheck.app/.MainActivity
# Look for "ThisTime" value in output
```

**Pass Criteria**: Responsive, no noticeable lag

---

### Memory Usage
- [ ] **Check memory** while app running:
  ```bash
  adb shell dumpsys meminfo com.soundcheck.app
  ```
- [ ] **Total PSS**: < 150 MB (acceptable for Flutter)
- [ ] **No memory leaks** (memory doesn't grow continuously)
- [ ] **App survives background** (Android doesn't kill it immediately)

**Pass Criteria**: Stable memory usage

---

## 🔄 **Stability Tests**

### Orientation Changes
- [ ] **Portrait mode** → Rotate to **Landscape**
- [ ] **Screen content adjusts** (or locks to portrait)
- [ ] **No crashes**
- [ ] **No data loss** (form inputs persist)
- [ ] **Rotate back** to portrait

**Pass Criteria**: Handles rotation gracefully

---

### App Backgrounding
- [ ] **Open app, navigate to venue detail**
- [ ] **Press Home button** (app goes to background)
- [ ] **Wait 30 seconds**
- [ ] **Reopen app** (tap icon or recent apps)
- [ ] **App resumes on same screen**
- [ ] **No crash, no restart**

**Pass Criteria**: Resumes correctly

---

### Multitasking
- [ ] **Open app**
- [ ] **Press Home button**
- [ ] **Open 2-3 other apps** (browser, messages, camera)
- [ ] **Return to SoundCheck via recent apps**
- [ ] **App still running** (not restarted)
- [ ] **User remains logged in**

**Pass Criteria**: Survives multitasking

---

## 🐛 **Debug Tools**

### View Logs in Real-Time
```bash
# All logs
adb logcat

# Flutter/Dart logs only
adb logcat | grep -i "flutter"

# Errors only
adb logcat *:E

# Save logs to file
adb logcat > soundcheck_test_logs.txt
```

### Check Crash Reports
```bash
# View recent crashes
adb logcat -b crash

# Get stack trace if app crashes
adb logcat *:E | grep -A 20 "FATAL EXCEPTION"
```

### Network Inspection
```bash
# Check which URLs app is hitting
adb logcat | grep -i "http\|api"
```

### App Info
```bash
# Get package info
adb shell dumpsys package com.soundcheck.app | grep "versionName\|versionCode"

# Get app permissions
adb shell dumpsys package com.soundcheck.app | grep "permission"

# Get storage usage
adb shell dumpsys package com.soundcheck.app | grep "dataDir\|codeDir"
```

---

## ✅ **Sign-Off Checklist**

### Before declaring "PASS":
- [ ] All 10 critical tests passed
- [ ] No crashes during 10-minute usage
- [ ] Error handling is graceful
- [ ] Performance is acceptable
- [ ] Navigation works smoothly
- [ ] User can complete key flows:
  - Register → Login → Browse → Review
- [ ] App survives orientation changes
- [ ] App survives backgrounding
- [ ] Logs show no critical errors

### Known Issues to Document:
- [ ] List any bugs found
- [ ] Note any missing features
- [ ] Record any UI glitches
- [ ] Document any error messages

---

## 📝 **Test Report Template**

```markdown
# SoundCheck Beta APK Test Report

**Tester**: [Your Name]
**Date**: November 13, 2025
**Device**: [Model, Android Version]
**APK**: app-release.apk (51.6 MB, v0.1.0+1)

## Results Summary
- **Critical Tests**: X/10 passed
- **Performance**: [Acceptable/Needs Improvement]
- **Stability**: [Stable/Unstable]
- **Overall**: [PASS/FAIL/CONDITIONAL PASS]

## Issues Found
1. [Issue 1 description]
   - Severity: [Critical/High/Medium/Low]
   - Steps to reproduce: ...

2. [Issue 2 description]
   - Severity: ...
   - Steps to reproduce: ...

## Recommendations
- [Fix X before public beta]
- [Y is acceptable for beta, fix later]
- [Z requires design review]

## Next Steps
- [ ] Fix critical issues
- [ ] Rebuild and retest
- [ ] Proceed to AAB build
- [ ] Upload to Play Store Internal Testing
```

---

## 🚀 **If All Tests Pass**

**You're ready for the next step!**

1. **Build AAB** for Play Store:
   ```bash
   cd mobile
   flutter build appbundle --release
   ```
   Output: `build/app/outputs/bundle/release/app-release.aab`

2. **Upload to Google Play Console**
   - Create internal testing release
   - Upload AAB
   - Add release notes
   - Invite testers

3. **Send to Beta Testers**
   - Share internal testing link
   - Provide testing instructions
   - Collect feedback

---

## 📞 **Need Help?**

**If app crashes**:
1. Get logcat: `adb logcat > crash_log.txt`
2. Look for "FATAL EXCEPTION"
3. Check stack trace for file:line references
4. Review those files in codebase

**If networking fails**:
1. Verify backend is up: `curl https://soundcheckmobile-production.up.railway.app/health`
2. Check device can reach internet
3. Review INTERNET permission in AndroidManifest (already added)
4. Check logcat for network errors

**If data doesn't load**:
1. Check API response: Use Charles Proxy or Postman
2. Verify JSON parsing is correct
3. Check Dio configuration in code
4. Review backend logs on Railway dashboard

---

**Testing Time**: 30-60 minutes
**Priority**: Critical (must pass before AAB build)
**Next After Pass**: Build AAB → Upload to Play Store

**Good luck! 🧪📱**
