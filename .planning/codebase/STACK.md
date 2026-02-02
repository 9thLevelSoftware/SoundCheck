# Technology Stack

**Analysis Date:** 2026-02-02

## Languages

**Primary:**
- TypeScript 5.9.2 - Backend API server and types
- Dart 3.2+ - Flutter mobile app (iOS/Android)

**Secondary:**
- SQL (PostgreSQL) - Database schema and queries
- JavaScript/JSON - Configuration and package definitions

## Runtime

**Environment:**
- Node.js 20 - Backend runtime (specified in `nixpacks.toml`)
- Flutter SDK 3.2+ - Mobile app framework

**Package Manager:**
- npm 10+ - Node package management
- Pub - Dart/Flutter package management
- Lockfiles: `package-lock.json` (backend), `pubspec.lock` (mobile)

## Frameworks

**Backend:**
- Express.js 4.21.2 - HTTP API server
- TypeScript 5.9.2 - Type-safe development

**Mobile:**
- Flutter 3.2+ - Cross-platform mobile framework
- Go Router 17.0.1 - Navigation and routing
- Flutter Riverpod 3.1.0 - State management

**Testing:**
- Jest 29.5.0 - Backend unit and integration testing
- ts-jest 29.1.0 - TypeScript support for Jest
- Supertest 6.3.0 - HTTP assertion library
- Flutter Test - Built-in Flutter testing framework

**Build/Dev:**
- Node TypeScript compiler - Backend compilation to ES2020
- Flutter build tools - Mobile app compilation
- Nodemon 3.1.10 - Development hot reload
- ts-node 10.9.2 - TypeScript execution without compilation

## Key Dependencies

**Critical:**
- `pg` 8.16.3 - PostgreSQL client for database access
- `jsonwebtoken` 9.0.2 - JWT token generation and verification
- `bcryptjs` 3.0.2 - Password hashing and comparison
- `google-auth-library` 10.5.0 - Google OAuth2 token verification
- `apple-signin-auth` 2.0.0 - Apple Sign-In token verification
- `axios` 1.13.2 - HTTP client for external API calls
- `zod` 3.25.76 - Runtime schema validation

**Infrastructure:**
- `ioredis` 5.9.0 - Redis client for distributed rate limiting and caching
- `@sentry/node` 10.32.1 - Error tracking and performance monitoring
- `winston` 3.18.3 - Structured logging with daily rotation
- `winston-daily-rotate-file` 5.0.0 - Log file rotation utility
- `helmet` 8.1.0 - Security headers middleware
- `cors` 2.8.5 - Cross-Origin Resource Sharing middleware
- `ws` 8.19.0 - WebSocket server for real-time features
- `multer` 2.0.2 - File upload handling and multipart parsing
- `dotenv` 17.2.1 - Environment variable management

**Mobile Client:**
- `dio` 5.4.3+1 - HTTP client with interceptors
- `web_socket_channel` 3.0.1 - WebSocket support
- `flutter_riverpod` 3.1.0 - State management
- `go_router` 17.0.1 - Navigation routing
- `freezed_annotation` 3.1.0 - Data model generation
- `json_annotation` 4.9.0 - JSON serialization
- `flutter_secure_storage` 10.0.0 - Secure credential storage
- `google_sign_in` 7.2.0 - Google Sign-In integration
- `sign_in_with_apple` 7.0.1 - Apple Sign-In integration
- `sentry_flutter` 9.9.2 - Error tracking for mobile
- `firebase_analytics` 12.1.0 - Analytics tracking
- `geolocator` 14.0.2 - Location services
- `cached_network_image` 3.4.0 - Image caching

## Configuration

**Environment:**
- Development: Variables loaded from `backend/.env` via dotenv
- Production: Variables injected directly (Railway deployment)
- Required vars: `JWT_SECRET` (minimum 32 characters), `DATABASE_URL` or individual DB credentials
- Optional vars: `SENTRY_DSN`, `REDIS_URL`, `FOURSQUARE_API_KEY`, `SETLISTFM_API_KEY`, `GOOGLE_CLIENT_ID`

**Build:**
- `backend/tsconfig.json` - TypeScript compilation configuration (ES2020 target, strict mode enabled)
- `backend/jest.config.json` - Test configuration with ts-jest preset
- `backend/.railwayignore` - Railway deployment exclusions
- `backend/.vercelignore` - Vercel deployment exclusions
- `nixpacks.toml` - Nixpacks build configuration specifying Node 20
- `mobile/pubspec.yaml` - Flutter app configuration
- `mobile/build.yaml` - Flutter build configuration
- `mobile/analysis_options.yaml` - Dart linting rules

## Platform Requirements

**Development:**
- Node.js 20+
- npm 10+
- PostgreSQL 12+
- Redis (optional, defaults to in-memory for distributed rate limiting)
- Flutter SDK 3.2+
- Dart 3.2+
- Android SDK (for mobile app development)
- Xcode (for iOS development)

**Production:**
- Railway.app hosting (specified in deployment files)
- PostgreSQL database service
- Redis service (optional)
- Node.js 20 runtime

**Database:**
- PostgreSQL 12+
- UUID extension support
- Supports SSL connections with configurable verification

---

*Stack analysis: 2026-02-02*
