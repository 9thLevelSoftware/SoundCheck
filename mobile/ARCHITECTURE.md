# SoundCheck Flutter App Architecture

## Overview

The SoundCheck Flutter app follows a **feature-driven architecture** with clean separation of concerns. It uses modern Flutter patterns and best practices for maintainability, testability, and scalability.

## Tech Stack

- **Framework**: Flutter 3.x with Material 3
- **State Management**: flutter_riverpod (Provider pattern)
- **Navigation**: go_router (declarative routing)
- **Networking**: dio (HTTP client)
- **Code Generation**: freezed, json_serializable
- **Secure Storage**: flutter_secure_storage (JWT tokens)

## Architecture Layers

### 1. Presentation Layer (`presentation/`)

**Responsibility**: UI components and user interaction

**Components**:
- **Screens**: Full-page views (e.g., `login_screen.dart`, `home_screen.dart`)
- **Widgets**: Reusable UI components (e.g., `VenueCard`, `StarRating`)
- **View Models**: State notifiers for complex state management

**Key Principles**:
- Screens are `ConsumerWidget` or `ConsumerStatefulWidget` to access Riverpod
- UI is declarative and reactive to state changes
- No business logic in presentation layer

**Example**:
```dart
class LoginScreen extends ConsumerStatefulWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);
    // Build UI based on state
  }
}
```

### 2. Domain Layer (`domain/`)

**Responsibility**: Business entities and models

**Components**:
- **Models**: Immutable data classes using `freezed`
- **Entities**: Core business objects (User, Venue, Band, Review, Badge)

**Key Principles**:
- All models are immutable (`@freezed`)
- JSON serialization is auto-generated (`json_serializable`)
- Models represent the contract between frontend and backend

**Example**:
```dart
@freezed
class Venue with _$Venue {
  const factory Venue({
    required String id,
    required String name,
    // ... other fields
  }) = _Venue;

  factory Venue.fromJson(Map<String, dynamic> json) => _$VenueFromJson(json);
}
```

### 3. Data Layer (`data/`)

**Responsibility**: Data access and API communication

**Components**:
- **Repositories**: Abstract data operations from the API
- **API Clients**: HTTP communication layer (Dio)

**Key Principles**:
- Repositories provide clean interface for data access
- All API calls go through repositories
- Error handling at repository level
- Caching strategies can be implemented here

**Example**:
```dart
class VenueRepository {
  final DioClient _dioClient;

  Future<List<Venue>> getVenues({...filters}) async {
    final response = await _dioClient.get('/venues', ...);
    return response.data.map((json) => Venue.fromJson(json)).toList();
  }
}
```

### 4. Core Layer (`core/`)

**Responsibility**: Shared infrastructure and utilities

**Components**:
- **API**: Dio client, interceptors, API configuration
- **Theme**: App theme, colors, text styles
- **Router**: Navigation configuration
- **Providers**: Global Riverpod providers

**Key Principles**:
- Core services are singleton-like (provided by Riverpod)
- Configuration is centralized
- Interceptors handle cross-cutting concerns (auth, logging)

## State Management with Riverpod

### Provider Types

1. **Provider**: Read-only, computed values
```dart
final userNameProvider = Provider<String>((ref) {
  final user = ref.watch(authStateProvider).value;
  return user?.username ?? 'Guest';
});
```

2. **StateNotifierProvider**: Mutable state with logic
```dart
final authStateProvider = StateNotifierProvider<AuthStateNotifier, AsyncValue<User?>>((ref) {
  return AuthStateNotifier(ref.read(authRepositoryProvider));
});
```

3. **FutureProvider**: Async data fetching
```dart
final popularVenuesProvider = FutureProvider<List<Venue>>((ref) async {
  final repository = ref.watch(venueRepositoryProvider);
  return repository.getPopularVenues();
});
```

4. **StreamProvider**: Real-time data streams
```dart
final notificationsProvider = StreamProvider<List<Notification>>((ref) {
  return notificationService.watchNotifications();
});
```

### Provider Lifecycle

- **autoDispose**: Automatically dispose when no longer used
- **family**: Parameterized providers (e.g., `venueDetailProvider(id)`)
- **ref.invalidate()**: Force refresh provider data
- **ref.refresh()**: Refresh and return new value

## Navigation with GoRouter

### Route Configuration

Routes are defined declaratively in `app_router.dart`:

```dart
GoRouter(
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/venues/:id',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        return VenueDetailScreen(venueId: id);
      },
    ),
  ],
  redirect: (context, state) {
    // Auth-based redirects
  },
);
```

### Navigation Methods

- `context.push('/route')`: Push new route
- `context.go('/route')`: Replace entire stack
- `context.pop()`: Go back
- `context.pushReplacement('/route')`: Replace current route

### Auth-Based Redirects

The router automatically redirects based on authentication state:
- Unauthenticated → `/login`
- Authenticated at `/login` → `/home`
- Loading state → `/splash`

## Data Flow

```
User Action → Presentation Layer
             ↓
     StateNotifier (via Riverpod)
             ↓
         Repository
             ↓
       DioClient (with Interceptors)
             ↓
         Backend API
             ↓
      JSON Response
             ↓
    Freezed Model (fromJson)
             ↓
    Updated State (Riverpod)
             ↓
   UI Rebuild (Consumer)
```

## Authentication Flow

1. **Login/Register**: User enters credentials
2. **API Call**: Repository sends request to backend
3. **Token Storage**: JWT token saved in secure storage
4. **Interceptor**: Token automatically added to future requests
5. **State Update**: Auth state notifies all listeners
6. **Router Redirect**: Automatic navigation to home screen

## Error Handling

### Network Errors

Handled at repository level with try-catch:

```dart
try {
  final response = await _dioClient.get('/venues');
  return parseVenues(response.data);
} on DioException catch (e) {
  if (e.response?.statusCode == 401) {
    throw UnauthorizedException();
  }
  throw NetworkException(e.message);
} catch (e) {
  throw UnexpectedException(e.toString());
}
```

### UI Error States

AsyncValue provides built-in error handling:

```dart
venuesAsync.when(
  data: (venues) => VenuesList(venues),
  loading: () => CircularProgressIndicator(),
  error: (error, stack) => ErrorWidget(error),
);
```

## Code Generation

### Freezed Models

Generate immutable models with:
```bash
flutter pub run build_runner build
```

This creates:
- `*.freezed.dart`: Immutable classes with copyWith, equality
- `*.g.dart`: JSON serialization methods

### When to Regenerate

- After adding/modifying `@freezed` classes
- After changing JSON fields
- When imports break (run with `--delete-conflicting-outputs`)

## Testing Strategy

### Unit Tests
- Test repositories with mock Dio client
- Test state notifiers with mock repositories
- Test utilities and validators

### Widget Tests
- Test individual widgets in isolation
- Test screen behavior with mock providers
- Test navigation flows

### Integration Tests
- Test complete user flows
- Test API integration (with test backend)
- Test state management across screens

## Security Considerations

1. **JWT Storage**: Tokens stored in `flutter_secure_storage`
2. **HTTPS**: All API calls use HTTPS in production
3. **Auth Interceptor**: Automatic token injection
4. **Token Expiry**: 401 responses clear tokens
5. **Input Validation**: All forms validated before submission

## Performance Optimizations

1. **Provider autoDispose**: Free unused resources
2. **ListView.builder**: Lazy loading for lists
3. **Cached Images**: Network images cached automatically
4. **Code Splitting**: Features loaded on-demand
5. **Build Optimization**: Use `const` constructors

## Folder Structure

```
lib/
├── main.dart                     # App entry point
└── src/
    ├── core/                     # Core infrastructure
    │   ├── api/                  # HTTP client
    │   │   ├── dio_client.dart
    │   │   └── api_config.dart
    │   ├── theme/                # App styling
    │   │   └── app_theme.dart
    │   ├── router/               # Navigation
    │   │   └── app_router.dart
    │   └── providers/            # Global providers
    │       └── providers.dart
    │
    ├── features/                 # Feature modules
    │   ├── auth/                 # Authentication
    │   │   ├── data/             # Auth repository
    │   │   ├── domain/           # User model
    │   │   └── presentation/     # Login/Register screens
    │   ├── venues/               # Venues feature
    │   ├── bands/                # Bands feature
    │   ├── reviews/              # Reviews feature
    │   ├── badges/               # Badges feature
    │   ├── profile/              # User profile
    │   └── home/                 # Home screen
    │
    └── shared/                   # Shared code
        ├── widgets/              # Reusable widgets
        │   ├── venue_card.dart
        │   ├── band_card.dart
        │   └── star_rating.dart
        └── utils/                # Utilities
            ├── validators.dart
            └── date_formatter.dart
```

## Adding New Features

1. **Create Feature Folder**: `lib/src/features/my_feature/`
2. **Add Domain Models**: Create models with `@freezed`
3. **Create Repository**: Implement data layer
4. **Add Providers**: Register in `providers.dart`
5. **Build UI**: Create presentation screens
6. **Add Routes**: Register in `app_router.dart`
7. **Generate Code**: Run `build_runner`
8. **Test**: Write unit and widget tests

## Best Practices

1. **Use const constructors** whenever possible
2. **Dispose controllers** in StatefulWidgets
3. **Use FutureProvider** for one-time data fetching
4. **Use StateNotifierProvider** for mutable state
5. **Keep widgets small** and composable
6. **Separate business logic** from UI
7. **Write tests** for critical paths
8. **Use named parameters** for clarity
9. **Follow Dart/Flutter style guide**
10. **Document complex logic** with comments

## Resources

- [Riverpod Best Practices](https://riverpod.dev/docs/concepts/reading)
- [Flutter Architecture Guidelines](https://flutter.dev/docs/development/data-and-backend/state-mgmt/options)
- [Freezed Documentation](https://pub.dev/packages/freezed)
- [GoRouter Guide](https://pub.dev/packages/go_router)
