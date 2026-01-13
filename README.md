# 🎵 SoundCheck

A full-stack mobile application for discovering and reviewing concert venues and bands, built with Flutter and Node.js.

## 📱 Overview

**SoundCheck** is a cross-platform mobile application that allows music enthusiasts to:
- Discover concert venues and bands
- Write and read reviews with ratings
- Earn badges based on activity
- Search and filter venues/bands by various criteria
- Build a profile and track activity

## 🏗️ Repository Structure

This is a monorepo containing both the backend API and the Flutter mobile application:

```
SoundCheckMobile/
├── backend/          # Node.js/Express/TypeScript API server
│   ├── src/         # Source code
│   ├── database-schema.sql
│   └── README.md    # Backend-specific documentation
│
├── mobile/          # Flutter mobile application
│   ├── lib/        # Dart source code
│   ├── test/       # Unit and widget tests
│   └── README.md   # Mobile app-specific documentation
│
└── README.md       # This file
```

## 🚀 Tech Stack

### Backend
- **Framework:** Express.js with TypeScript
- **Database:** PostgreSQL
- **Authentication:** JWT
- **Security:** Helmet, CORS, rate limiting
- **Deployment:** Railway / Vercel

### Mobile Application
- **Framework:** Flutter (Material 3)
- **State Management:** Riverpod
- **Navigation:** GoRouter
- **Networking:** Dio
- **Data Models:** Freezed & JSON serializable
- **Secure Storage:** flutter_secure_storage

## 📋 Getting Started

### Prerequisites

- **Backend:**
  - Node.js 18.x or later
  - PostgreSQL 12.x or later
  - npm 9.x or later

- **Mobile:**
  - Flutter SDK (>=3.2.0)
  - Dart SDK
  - iOS/Android development environment

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/DasBluEyedDevil/SoundCheckMobile.git
   cd SoundCheckMobile
   ```

2. **Set up and run the backend:**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   createdb soundcheck
   psql -d soundcheck -f database-schema.sql
   npm run dev
   ```
   
   See [backend/README.md](backend/README.md) for detailed backend setup instructions.

3. **Set up and run the mobile app:**
   ```bash
   cd mobile
   flutter pub get
   flutter pub run build_runner build --delete-conflicting-outputs
   flutter run
   ```
   
   See [mobile/README.md](mobile/README.md) for detailed mobile app setup instructions.

## 📚 Documentation

- **[PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md)** - Complete project overview, features, and API documentation
- **[backend/README.md](backend/README.md)** - Backend API setup and documentation
- **[mobile/README.md](mobile/README.md)** - Mobile app setup and documentation
- **[DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** - Deployment instructions
- **[PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)** - Privacy policy

## 🔑 Key Features

### User Features
- User registration and authentication
- Profile management with stats
- Review creation and management
- Badge earning system
- Search and discovery

### Venue & Band Features
- Comprehensive venue listings
- Band information and discovery
- Rating system (1-5 stars)
- Image support
- Location-based search

### Gamification
- Activity-based badges
- Review milestones
- User statistics tracking

## 🔒 Security

- JWT-based authentication
- Secure password hashing
- Rate limiting
- Input validation
- CORS protection
- Secure storage for tokens

## 🤝 Contributing

This is a personal project, but suggestions and feedback are welcome. Please open an issue to discuss potential changes.

## 📄 License

Copyright © 2024-2026 SoundCheck. All rights reserved.

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

**Built with ❤️ by DasBluEyedDevil**
