# Android Release Keystore Setup

This guide explains how to create and configure a release keystore for signing your Flutter Android app for production release to the Google Play Store.

## What is a Keystore?

A keystore is a binary file that contains your private key(s) used to sign your Android app. The same keystore must be used for all updates to your app - if you lose it, you cannot update your app on the Play Store.

## Step 1: Generate Release Keystore

Run this command in your terminal from the project root:

```bash
keytool -genkey -v -keystore mobile/android/app/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias soundcheck
```

You'll be prompted for:
- **Keystore password**: Choose a strong password (you'll need this for every release)
- **Key password**: Choose a strong password (can be the same as keystore password)
- **Your name**: Your name or company name
- **Organizational unit**: Your team/department (or press Enter to skip)
- **Organization**: Your company name (or press Enter to skip)
- **City/Locality**: Your city
- **State/Province**: Your state/province
- **Country code**: Two-letter country code (e.g., US, UK, CA)

**CRITICAL**: Save these passwords securely! Store them in a password manager. If you lose them, you cannot update your app on the Play Store.

## Step 2: Create key.properties File

Create a file at `mobile/android/key.properties` with the following content:

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=soundcheck
storeFile=upload-keystore.jks
```

Replace `YOUR_KEYSTORE_PASSWORD` and `YOUR_KEY_PASSWORD` with the passwords you chose in Step 1.

**IMPORTANT**: This file is already in `.gitignore` and will not be committed to Git. Never commit your keystore or passwords to version control!

## Step 3: Verify Keystore Creation

Check that the keystore was created:

```bash
# On Windows
dir mobile\android\app\upload-keystore.jks

# On macOS/Linux
ls -l mobile/android/app/upload-keystore.jks
```

You can also verify the keystore contents (without exposing the private key):

```bash
keytool -list -v -keystore mobile/android/app/upload-keystore.jks
```

## Step 4: Backup Your Keystore

**CRITICAL**: Backup your keystore file and passwords immediately!

1. Copy `mobile/android/app/upload-keystore.jks` to a secure location
2. Store in multiple places:
   - Encrypted external drive
   - Password-protected cloud storage (Dropbox, Google Drive, etc.)
   - Company secret management system (if applicable)

3. Document your passwords securely:
   - Password manager (1Password, LastPass, Bitwarden, etc.)
   - Encrypted document in secure storage

**If you lose your keystore, you cannot update your app. You would need to publish a completely new app with a new package name.**

## Step 5: Build and Test

The keystore is now configured in `build.gradle.kts`. To build a release APK:

```bash
cd mobile
flutter build apk --release
```

To build a release App Bundle (AAB) for Play Store:

```bash
cd mobile
flutter build appbundle --release
```

The signed files will be in:
- APK: `mobile/build/app/outputs/flutter-apk/app-release.apk`
- AAB: `mobile/build/app/outputs/bundle/release/app-release.aab`

## Play Store Upload Key vs App Signing Key

Google Play uses two keys:

1. **Upload Key** (what you create here): Used to upload your app to Play Store
2. **App Signing Key**: Managed by Google Play App Signing (recommended)

When you first upload your app to Play Store, enable "Google Play App Signing". This allows:
- Google to manage the final app signing key
- You to reset your upload key if lost (but only if enrolled in Play App Signing)
- Enhanced security

## Troubleshooting

### "keytool: command not found"

The `keytool` command comes with Java. Install Java JDK if not already installed:
- Windows: Download from [Oracle](https://www.oracle.com/java/technologies/downloads/) or use Android Studio's bundled JDK
- macOS: `brew install openjdk`
- Linux: `sudo apt-get install openjdk-11-jdk`

Or use the keytool from Android Studio:

```bash
# Windows
"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkey ...

# macOS
/Applications/Android\ Studio.app/Contents/jbr/Contents/Home/bin/keytool -genkey ...
```

### Build fails with "key.properties not found"

Make sure `mobile/android/key.properties` exists with the correct content and paths.

### Build fails with "Keystore was tampered with, or password was incorrect"

Double-check your passwords in `key.properties`.

## Security Checklist

- [ ] Keystore file created
- [ ] Keystore backed up in secure location
- [ ] Passwords saved in password manager
- [ ] `key.properties` created (not committed to Git)
- [ ] `.gitignore` includes `key.properties` and `*.jks`
- [ ] Release build tested successfully

## References

- [Flutter App Signing Documentation](https://docs.flutter.dev/deployment/android#signing-the-app)
- [Android App Signing](https://developer.android.com/studio/publish/app-signing)
- [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)
