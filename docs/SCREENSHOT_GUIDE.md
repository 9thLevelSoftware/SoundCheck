# SoundCheck Screenshot Capture Guide

## 📸 **Requirements**

**Google Play Store**:
- **Minimum**: 2 screenshots
- **Maximum**: 8 screenshots
- **Recommended**: 4-6 screenshots
- **Resolution**:
  - 1080x1920 (16:9 ratio)
  - 1080x2400 (18.5:9 ratio - newer phones)
  - 1440x3200 (QHD+ - for high quality)
- **Format**: PNG or JPEG
- **File size**: < 8MB each

**Apple App Store** (iOS):
- **iPhone 15 Pro Max**: 1290x2796
- **iPhone 15**: 1179x2556
- (Or use Android screenshots, Apple will accept)

---

## 🎯 **Screenshot Strategy**

### The 6-Screenshot Formula

**Screenshot 1: Venues List** (Hero Shot)
- Shows main functionality
- Clean, full list of venues
- Highlight best-looking venue with image
- Purpose: Show what app does immediately

**Screenshot 2: Venue Detail**
- Shows depth of content
- Venue info, ratings, reviews
- Action buttons visible
- Purpose: Show rich content

**Screenshot 3: Bands List**
- Alternative browsing mode
- Genre tags visible
- Diverse band selection
- Purpose: Show variety

**Screenshot 4: Band Detail/Profile**
- Band information
- Performance reviews
- Related venues
- Purpose: Show comprehensive profiles

**Screenshot 5: User Profile/Badges**
- Gamification elements
- Earned badges
- User stats
- Purpose: Show engagement features

**Screenshot 6: Search/Discovery** (Optional)
- Search interface
- Filtering options
- Discovery features
- Purpose: Show usability features

---

## 🛠️ **Capture Methods**

### Method 1: Physical Device (Best Quality)

**Setup**:
1. Install `app-release.apk` on device
2. Ensure device is 1080x1920 or 1080x2400
3. Set brightness to 100%
4. Disable notifications (Do Not Disturb mode)
5. Charge to 100% (clean battery icon)
6. Set time to something clean (like 9:41 AM)

**Capture**:
```
Most Android devices: Power + Volume Down
Samsung: Power + Volume Down
Google Pixel: Power + Volume Down
```

**Screenshots save to**: `Gallery` → `Screenshots` folder

---

### Method 2: ADB Screenshot (Any Device)

**Advantage**: Can capture at any resolution

```bash
# Connect device
adb devices

# Navigate to desired screen in app
# Then capture:
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png C:\Users\dasbl\AndroidStudioProjects\SoundCheck\docs\assets\screenshots\

# Repeat for each screen
```

---

### Method 3: Android Emulator (Consistent)

**Advantage**: Clean, no real device needed

1. **Open Android Studio**
2. **AVD Manager** → Create new virtual device
3. **Select**: Pixel 6 or Pixel 5 (1080x2400)
4. **System Image**: Android 13 or 14
5. **Start emulator**
6. **Install APK**:
   ```bash
   adb install build/app/outputs/flutter-apk/app-release.apk
   ```
7. **Open app and navigate to screen**
8. **Click camera icon** in emulator toolbar
9. **Screenshots save to**: `C:\Users\dasbl\Desktop`

**Emulator Settings**:
- Display: 1080x2400, 440 dpi
- Disable frame (for clean shots)
- Theme: Light mode (usually better for screenshots)

---

### Method 4: Flutter Screenshot Tool

**Use for**: Automated, consistent screenshots

```bash
cd mobile

# Take screenshots programmatically
flutter screenshot
```

(Requires additional setup - not recommended for quick use)

---

## 📝 **Screenshot Checklist (Before Capturing)**

### Prepare the App
- [ ] **Populate with real-looking data**:
  - Use actual venue names (Madison Square Garden, Red Rocks)
  - Use real band names (from seed data)
  - Add sample reviews with realistic text
  - Ensure images load (or use placeholders)

- [ ] **Login with clean test account**:
  - Username: `DemoUser` or `MusicFan`
  - Profile picture set (or nice default)
  - Some badges earned (ideally 2-3 visible)

- [ ] **Clear any errors or debug text**:
  - No "Lorem ipsum" placeholder text
  - No error messages showing
  - No loading spinners (unless intentional)

### Prepare the Device
- [ ] **Full battery** (or hide status bar)
- [ ] **Good signal** (4G/5G/WiFi icon)
- [ ] **Clean time** (9:41 AM is standard)
- [ ] **No notifications** visible
- [ ] **Brightness at 80-100%**
- [ ] **Light theme** (unless dark is your brand)

### Composition
- [ ] **Screen fully loaded** (no half-loaded content)
- [ ] **Scroll position at top** (usually)
- [ ] **No fingers/UI overlays** in shot
- [ ] **No keyboard** showing (unless showing input)
- [ ] **No "tap here" tooltips**

---

## 🎬 **Screen-by-Screen Capture Guide**

### Screenshot 1: Venues List
**Navigation**: Launch app → Home/Venues tab

**What to show**:
- [ ] App bar/title: "Venues" or "SoundCheck"
- [ ] Search bar (if implemented)
- [ ] List of 3-4 venues visible:
  - Venue images/icons
  - Venue names
  - Location (city, state)
  - Rating stars
  - Capacity or venue type
- [ ] Bottom navigation visible (shows other tabs)

**Composition Tips**:
- Scroll so best-looking venue is at top
- Ensure consistent spacing
- Images should all be loaded
- Clean alignment

**Example Layout**:
```
┌─────────────────────┐
│ ← SoundCheck        ⚙️│ (App bar)
│ 🔍 Search venues... │ (Search bar)
│                     │
│ ┌───────────────┐  │
│ │ [Venue Image] │  │ Madison Square Garden
│ │               │  │ New York, NY
│ └───────────────┘  │ ⭐⭐⭐⭐⭐ 4.7 | Arena
│                     │
│ ┌───────────────┐  │
│ │ [Venue Image] │  │ Red Rocks Amphitheatre
│ │               │  │ Morrison, CO
│ └───────────────┘  │ ⭐⭐⭐⭐⭐ 4.9 | Outdoor
│                     │
│ ┌───────────────┐  │
│ │ [Venue Image] │  │ House of Blues
│                     │
├─────────────────────┤
│ 🏠  🎸  🎤  👤     │ (Bottom nav)
└─────────────────────┘
```

---

### Screenshot 2: Venue Detail
**Navigation**: Venues list → Tap "Madison Square Garden"

**What to show**:
- [ ] Hero image (large venue photo at top)
- [ ] Venue name and address
- [ ] Rating and review count
- [ ] Key details (capacity, type, amenities)
- [ ] "Write Review" button or similar CTA
- [ ] Reviews section (show 1-2 reviews)
- [ ] Scroll position shows some content below

**Composition Tips**:
- Capture right after scrolling down slightly
- Show hero image + details + start of reviews
- Include floating action button if present
- Ensure "Write Review" button is visible

---

### Screenshot 3: Bands List
**Navigation**: Bottom nav → Bands tab

**What to show**:
- [ ] App bar: "Bands" or "Artists"
- [ ] Genre filter chips (Rock, Jazz, Indie, etc.) - if implemented
- [ ] List of 3-4 bands:
  - Band images/icons
  - Band names
  - Genre tags
  - Hometown
  - Rating
- [ ] Bottom navigation

**Composition Tips**:
- Show diversity (different genres visible)
- Colorful genre tags stand out
- Clean, organized list
- Similar layout to venues for consistency

---

### Screenshot 4: Band Detail/Profile
**Navigation**: Bands list → Tap "Luna Waves" or "The Electric Kings"

**What to show**:
- [ ] Band hero image/photo
- [ ] Band name and genre
- [ ] Band description/bio
- [ ] Key stats (formed year, hometown)
- [ ] Social links (Spotify, Instagram) - if implemented
- [ ] "Performances" or "Reviews" section
- [ ] Related venues (where they've played)

**Composition Tips**:
- Showcase rich content
- Show personality (bio text, genre, hometown)
- Include call-to-action buttons
- Scroll to show content breadth

---

### Screenshot 5: User Profile with Badges
**Navigation**: Bottom nav → Profile tab

**What to show**:
- [ ] User avatar/photo
- [ ] Username prominently
- [ ] User stats:
  - Number of reviews written
  - Venues visited
  - Badges earned
- [ ] Badge showcase (2-3 badges visible):
  - Badge icons
  - Badge names
  - Badge descriptions (on tap/hover)
- [ ] "My Reviews" section preview
- [ ] Settings gear icon

**Composition Tips**:
- Make badges visually prominent
- Use colorful, attractive badge designs
- Show progression (2/5 badges, etc.)
- Clean, organized profile layout

**If badges not implemented yet**:
- Show user stats and review history
- Add placeholder text: "Earn badges by reviewing venues!"

---

### Screenshot 6: Search or Filter (Optional)
**Navigation**: Tap search bar → Enter query

**What to show**:
- [ ] Active search bar with query: "Rock" or "New York"
- [ ] Search results below:
  - Filtered venues or bands
  - Relevant results highlighted
- [ ] Empty state if no results (with helpful message)
- [ ] Filter chips active state

**Composition Tips**:
- Use realistic search term
- Show useful results
- Demonstrate usability
- Include "clear" or "back" button

**Alternative if search not ready**:
- Screenshot of Settings screen
- Screenshot of About/Help screen
- Screenshot of Reviews list

---

## 🎨 **Post-Processing (Optional)**

### Add Device Frames

**Tool**: [Screener.io](https://www.screener.io) or [MockUPhone](https://mockuphone.com)

1. Upload screenshot
2. Select device (Pixel 6, Samsung S23, etc.)
3. Choose color (black, white, or colored)
4. Download with frame

**Pros**: Professional look, shows app on real device
**Cons**: Takes extra time, reduces actual app visibility

**Recommendation**: Use frames for marketing, not for Play Store (Google prefers frameless)

---

### Add Text Overlays (Marketing Only)

**Tools**: Figma, Canva, Photoshop

Add text to highlight features:
- "Discover Nearby Venues"
- "Read Reviews from Real Fans"
- "Earn Badges & Track Your Journey"

**Only use for**: Website, social media, NOT Play Store
**Play Store**: Text overlays not allowed in first 2 screenshots

---

### Adjust Brightness/Contrast

If screenshots are too dark:
1. Open in image editor (Photoshop, GIMP, Photopea)
2. Increase brightness: +10-15%
3. Increase contrast: +5-10%
4. Save as PNG (quality: 100%)

---

## ✅ **Screenshot Quality Checklist**

### Technical
- [ ] Resolution: 1080x1920 or 1080x2400 minimum
- [ ] Format: PNG (preferred) or JPEG
- [ ] File size: < 8MB each
- [ ] Aspect ratio: 16:9 or 18.5:9
- [ ] No upscaling (native resolution)
- [ ] No artifacts or compression issues

### Content
- [ ] No placeholder text ("Lorem ipsum")
- [ ] No debug info or error messages
- [ ] Real-looking data (not "Test User 123")
- [ ] UI is fully loaded (no half-loaded content)
- [ ] Images are loaded (no broken image icons)
- [ ] Text is readable at thumbnail size

### Composition
- [ ] Important content in center 80%
- [ ] No fingers or hands in frame
- [ ] No keyboard covering content
- [ ] Clean status bar (or hidden)
- [ ] Consistent theme (all light or all dark)
- [ ] Logical flow (tells a story across screenshots)

### Branding
- [ ] App name visible (in app bar or splash)
- [ ] Brand colors prominent
- [ ] Consistent with app icon colors
- [ ] Professional appearance

---

## 📂 **File Organization**

Save screenshots to:
```
C:\Users\dasbl\AndroidStudioProjects\SoundCheck\docs\assets\screenshots\

├── 01_venues_list.png
├── 02_venue_detail.png
├── 03_bands_list.png
├── 04_band_profile.png
├── 05_user_profile_badges.png
├── 06_search_or_filter.png
└── originals\
    ├── 01_venues_list_original.png (full res backups)
    └── ...
```

**Naming convention**:
- Number prefix for order
- Descriptive name
- Lowercase with underscores
- PNG extension

---

## 🚀 **Upload to Play Store**

1. **Google Play Console** → Your app
2. **Store Presence** → **Main Store Listing**
3. **Phone screenshots** section
4. **Add** → Upload 4-6 screenshots
5. **Drag to reorder** (first screenshot is most important)
6. **Save draft**
7. **Preview** how they look in store listing

**Play Store displays**:
- 1st screenshot: Large in search results
- 2nd-8th: Horizontal scrollable gallery

**Order by importance**:
1. Hero shot (what app does)
2. Key feature (venue detail)
3. Alternative feature (bands)
4. User value (profile/badges)
5. Additional features
6. Call-to-action or special feature

---

## 💡 **Pro Tips**

### Tip 1: Use Light Mode
Light screenshots typically look better in Play Store thumbnails (white background). If your app supports dark mode, consider light mode for screenshots.

### Tip 2: Show Real Content
Use actual venue names from your seed data (Madison Square Garden, Red Rocks, House of Blues). It looks more legitimate than "Test Venue 1, Test Venue 2".

### Tip 3: Tell a Story
Your 4-6 screenshots should tell a narrative:
1. "Here's what the app does" (venues list)
2. "Here's how deep the content is" (venue detail)
3. "Here's another way to explore" (bands)
4. "Here's what makes it engaging" (badges)

### Tip 4: Test on Play Store Preview
Before submitting, view your screenshots in:
- Search results (small thumbnail)
- Store listing (gallery view)
- Tablet view (landscape orientation)

### Tip 5: Update Regularly
Plan to update screenshots when you:
- Add major features
- Redesign UI
- Get better content (real venue photos)
- Approach public launch

---

## 🎯 **Timeline**

**Quick Version** (30 minutes):
- Install APK on device
- Capture 4 screens using device screenshot
- Basic crop/resize in Paint/Preview
- Upload to Play Store

**Professional Version** (2 hours):
- Set up emulator with clean device
- Populate with best test data
- Capture 6 screens
- Post-process (brightness/contrast)
- Add device frames for 2-3 key shots
- Test in Play Store preview

**Choose based on urgency**: Quick version is fine for beta/internal testing. Polish for public release.

---

## 📞 **Tools & Resources**

**Image Editing**:
- [Photopea](https://www.photopea.com) - Free Photoshop alternative (web)
- [GIMP](https://www.gimp.org) - Free desktop editor
- [Figma](https://www.figma.com) - Design tool (free tier)

**Device Frames**:
- [Screener.io](https://www.screener.io) - Add device frames
- [MockUPhone](https://mockuphone.com) - Device mockups
- [Previewed](https://previewed.app) - Premium mockups

**Resize/Optimize**:
- [TinyPNG](https://tinypng.com) - Compress PNG files
- [Squoosh](https://squoosh.app) - Image compression
- ImageMagick - Command-line batch processing

**Batch Resize Command**:
```bash
# If you have ImageMagick installed
cd docs/assets/screenshots
magick mogrify -resize 1080x1920 -quality 100 *.png
```

---

## ✅ **Final Checklist**

Before uploading to Play Store:
- [ ] 4-6 screenshots captured
- [ ] All at 1080x1920 or 1080x2400
- [ ] PNG format, < 8MB each
- [ ] No debug info or placeholder text
- [ ] Real-looking data in all shots
- [ ] Consistent theme (light/dark)
- [ ] Logical flow/story
- [ ] Saved to `docs/assets/screenshots/`
- [ ] Backed up originals
- [ ] Ready to upload

---

**Time Estimate**: 30 minutes (quick) to 2 hours (polished)
**Priority**: High (required for Play Store)
**Next After Complete**: Upload AAB + Screenshots → Internal Testing

**Happy screenshotting! 📸✨**
