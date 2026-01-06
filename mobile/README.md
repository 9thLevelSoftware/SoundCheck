# PitPulse Flutter

A Flutter application for discovering and reviewing concert venues and bands.

## Features

- User authentication (login, register)
- Discover venues and bands
- Write and read reviews with ratings
- Earn badges based on activity
- Search and filter venues/bands
- User profiles

## Tech Stack

- **Framework:** Flutter (Material 3)
- **State Management:** flutter_riverpod
- **Navigation:** go_router
- **Networking:** dio
- **Data Models:** freezed & json_serializable
- **Secure Storage:** flutter_secure_storage

## Project Structure

```
lib/
├── src/
│   ├── core/
│   │   ├── api/          # Dio client and interceptors
│   │   ├── theme/        # AppTheme and styling
│   │   ├── router/       # GoRouter configuration
│   │   └── providers/    # Global providers
│   ├── features/
│   │   ├── auth/         # Authentication
│   │   ├── venues/       # Venue features
│   │   ├── bands/        # Band features
│   │   ├── reviews/      # Review features
│   │   ├── badges/       # Badge features
│   │   ├── profile/      # User profile
│   │   └── home/         # Home screen
│   └── shared/
│       ├── widgets/      # Reusable widgets
│       └── utils/        # Utility functions
└── main.dart
```

## Getting Started

### Prerequisites

- Flutter SDK (>=3.2.0)
- Dart SDK
- Running backend server

### Installation

1. Install dependencies:
```bash
flutter pub get
```

2. Generate code:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

3. Run the app:
```bash
flutter run
```

## Backend API

This app connects to the PitPulse backend API. Ensure the backend is running and accessible.

Default API URL: `http://localhost:3000/api`

## Code Generation

This project uses code generation for:
- Freezed (immutable models)
- JSON serialization
- Riverpod providers

Run code generation:
```bash
flutter pub run build_runner watch
```

## License

Copyright © 2024-2026 PitPulse
