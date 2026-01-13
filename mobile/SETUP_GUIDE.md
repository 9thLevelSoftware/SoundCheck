# Flutter App Setup Guide

This guide will help you complete the setup and run the SoundCheck Flutter application.

## Prerequisites

1. **Flutter SDK** (version >= 3.2.0)
   - Download from: https://flutter.dev/docs/get-started/install
   - Add Flutter to your PATH
   - Run `flutter doctor` to verify installation

2. **Android Studio** or **VS Code** with Flutter extensions

3. **A device/emulator** to run the app on

## Step 1: Install Dependencies

Navigate to the flutter_app directory and install dependencies:

```bash
cd flutter_app
flutter pub get
```

This will download all the required packages specified in `pubspec.yaml`.

## Step 2: Generate Code

The app uses code generation for Freezed models and JSON serialization. Run:

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

This command will generate:
- `*.freezed.dart` files (immutable models)
- `*.g.dart` files (JSON serialization)

For development, you can watch for changes:
```bash
flutter pub run build_runner watch
```

## Step 3: Configure API Endpoint

Update the backend API URL in `lib/src/core/api/api_config.dart`:

```dart
static const String baseUrl = 'http://YOUR_BACKEND_URL/api';
```

For local development:
- **Android Emulator**: Use `http://10.0.2.2:3000/api`
- **iOS Simulator**: Use `http://localhost:3000/api`
- **Physical Device**: Use your computer's IP address (e.g., `http://192.168.1.100:3000/api`)

## Step 4: Start the Backend

Make sure the SoundCheck backend server is running:

```bash
cd ../backend
npm install
npm run dev
```

The backend should be accessible at http://localhost:3000

## Step 5: Run the Flutter App

### Using Command Line

```bash
# List available devices
flutter devices

# Run on a specific device
flutter run -d <device_id>

# Or just run (it will prompt for device selection)
flutter run
```

### Using IDE

**VS Code:**
1. Open the flutter_app folder
2. Press F5 or click "Run" → "Start Debugging"

**Android Studio:**
1. Open the flutter_app folder as a project
2. Select a device from the dropdown
3. Click the green play button

## Step 6: Test the App

1. **Login Screen**: Try registering a new user or logging in
2. **Home Screen**: View popular venues and bands
3. **Venues**: Browse and search venues
4. **Bands**: Browse and search bands
5. **Profile**: View your profile and earned badges
6. **Reviews**: Add reviews for venues and bands

## Common Issues and Solutions

### Issue: Code generation fails

**Solution**: Make sure all imports are correct and run:
```bash
flutter pub get
flutter pub run build_runner clean
flutter pub run build_runner build --delete-conflicting-outputs
```

### Issue: Cannot connect to backend

**Solution**: 
- Verify backend is running
- Check API URL in `api_config.dart`
- For Android emulator, use `10.0.2.2` instead of `localhost`
- Check firewall settings

### Issue: Build fails with dependency conflicts

**Solution**:
```bash
flutter pub cache repair
flutter clean
flutter pub get
```

### Issue: Hot reload not working

**Solution**: Stop the app and run `flutter run` again. Hot reload works best with stateless widgets.

## Development Tips

### State Management with Riverpod

The app uses Riverpod for state management. Key concepts:

```dart
// Define a provider
final myProvider = Provider<MyService>((ref) => MyService());

// Use in a ConsumerWidget
class MyWidget extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final service = ref.watch(myProvider);
    // Use service
  }
}
```

### Navigation with GoRouter

Navigation is handled by GoRouter with automatic auth redirection:

```dart
// Navigate to a route
context.push('/venues');

// Navigate with parameters
context.push('/venues/${venueId}');

// Go back
context.pop();

// Replace current route
context.go('/home');
```

### Adding New Features

1. Create domain models in `lib/src/features/[feature]/domain/`
2. Create repository in `lib/src/features/[feature]/data/`
3. Add provider in `lib/src/core/providers/providers.dart`
4. Create presentation screens in `lib/src/features/[feature]/presentation/`
5. Add routes in `lib/src/core/router/app_router.dart`

### Code Generation Watch Mode

For faster development, keep build_runner watching for changes:

```bash
flutter pub run build_runner watch
```

This will automatically regenerate code when you modify Freezed models.

## Project Structure

```
flutter_app/
├── lib/
│   ├── main.dart                 # App entry point
│   └── src/
│       ├── core/                 # Core functionality
│       │   ├── api/              # API client and config
│       │   ├── theme/            # App theme
│       │   ├── router/           # Navigation
│       │   └── providers/        # Global providers
│       ├── features/             # Feature modules
│       │   ├── auth/             # Authentication
│       │   ├── venues/           # Venues feature
│       │   ├── bands/            # Bands feature
│       │   ├── reviews/          # Reviews feature
│       │   ├── badges/           # Badges feature
│       │   ├── profile/          # User profile
│       │   └── home/             # Home screen
│       └── shared/               # Shared widgets and utilities
│           ├── widgets/          # Reusable widgets
│           └── utils/            # Utility functions
├── pubspec.yaml                  # Dependencies
├── analysis_options.yaml         # Linter rules
└── README.md                     # Project documentation
```

## Testing

### Run Tests

```bash
# Run all tests
flutter test

# Run with coverage
flutter test --coverage

# Run specific test file
flutter test test/features/auth/auth_test.dart
```

### Widget Testing

```dart
testWidgets('Login button is displayed', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(home: LoginScreen()),
    ),
  );
  
  expect(find.text('Login'), findsOneWidget);
});
```

## Building for Production

### Android

```bash
# Build APK
flutter build apk --release

# Build App Bundle (for Play Store)
flutter build appbundle --release
```

### iOS

```bash
# Build for iOS
flutter build ios --release

# Or build IPA
flutter build ipa --release
```

## Next Steps

1. Add unit tests for repositories
2. Add widget tests for screens
3. Implement search functionality
4. Add image upload for reviews
5. Implement push notifications
6. Add offline support with local database
7. Optimize for performance

## Resources

- [Flutter Documentation](https://flutter.dev/docs)
- [Riverpod Documentation](https://riverpod.dev)
- [GoRouter Documentation](https://pub.dev/packages/go_router)
- [Freezed Documentation](https://pub.dev/packages/freezed)
- [Dio Documentation](https://pub.dev/packages/dio)

## Support

For issues or questions, please refer to the project's GitHub repository or contact the development team.
