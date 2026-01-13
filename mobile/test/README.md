# SoundCheck Flutter Tests

This directory contains comprehensive tests for the SoundCheck Flutter application.

## Test Structure

The test directory mirrors the `lib/src` structure for easy navigation:

```
test/
├── src/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── data/          # Repository unit tests
│   │   │   └── presentation/  # Screen widget tests
│   │   ├── venues/
│   │   ├── bands/
│   │   ├── reviews/
│   │   ├── badges/
│   │   └── profile/
│   ├── shared/
│   │   ├── widgets/           # Reusable widget tests
│   │   └── utils/             # Utility function tests
│   └── core/
│       ├── api/               # API client tests
│       └── router/            # Router tests
```

## Running Tests

### Run all tests
```bash
flutter test
```

### Run tests with coverage
```bash
flutter test --coverage
```

### Run specific test file
```bash
flutter test test/src/shared/utils/validators_test.dart
```

### Run tests in watch mode (requires extra packages)
```bash
flutter test --watch
```

## Test Types

### 1. Unit Tests
Tests for business logic, utilities, and data transformations.
- `validators_test.dart` - Form validation logic
- `date_formatter_test.dart` - Date formatting utilities

### 2. Widget Tests
Tests for individual widgets and their behavior.
- `star_rating_test.dart` - Star rating component
- `venue_card_test.dart` - Venue card display
- `band_card_test.dart` - Band card display
- `login_screen_test.dart` - Login screen UI and validation

### 3. Integration Tests
Tests for complete user flows (to be added).
- Authentication flow
- Venue browsing flow
- Review submission flow

## Writing New Tests

### Unit Test Example
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/utils/validators.dart';

void main() {
  group('Validators', () {
    test('validates email correctly', () {
      expect(Validators.email('test@example.com'), null);
      expect(Validators.email('invalid'), isNotNull);
    });
  });
}
```

### Widget Test Example
```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:soundcheck_flutter/src/shared/widgets/star_rating.dart';

void main() {
  testWidgets('displays correct number of stars', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: StarRating(rating: 4.0),
        ),
      ),
    );
    
    expect(find.byIcon(Icons.star), findsNWidgets(4));
  });
}
```

## Test Coverage Goals

- **Unit Tests**: 90%+ coverage for utilities and business logic
- **Widget Tests**: All reusable components tested
- **Integration Tests**: Critical user flows covered

## Best Practices

1. **Test Naming**: Use descriptive names that explain what is being tested
2. **Test Organization**: Group related tests using `group()`
3. **Test Independence**: Each test should be independent and not rely on others
4. **Mock Dependencies**: Use `mockito` for mocking external dependencies
5. **Arrange-Act-Assert**: Follow the AAA pattern in tests
   - Arrange: Set up test data and conditions
   - Act: Execute the code being tested
   - Assert: Verify the expected outcome

## Mocking

For tests that require mocking (repositories, API clients), use `mockito`:

```dart
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

@GenerateMocks([AuthRepository])
void main() {
  late MockAuthRepository mockRepo;
  
  setUp(() {
    mockRepo = MockAuthRepository();
  });
  
  test('login succeeds with valid credentials', () async {
    when(mockRepo.login(any)).thenAnswer((_) async => mockUser);
    // Test implementation
  });
}
```

## Continuous Integration

Tests are automatically run on:
- Every pull request
- Every push to main branch
- Before deployment

## Troubleshooting

### Tests fail locally but pass in CI
- Ensure Flutter SDK version matches CI
- Check for timezone-dependent tests
- Verify test dependencies are up to date

### Widget tests timeout
- Increase timeout: `testWidgets('name', timeout: Timeout(Duration(seconds: 10)))`
- Check for missing `await tester.pump()` calls

### Coverage not generated
- Ensure lcov is installed
- Run: `flutter test --coverage`
- View: `genhtml coverage/lcov.info -o coverage/html`
