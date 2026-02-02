# Codebase Structure

**Analysis Date:** 2026-02-02

## Directory Layout

```
C:\Users\dasbl\AndroidStudioProjects\SoundCheck/
├── backend/                    # Node.js/Express TypeScript API
│   ├── src/
│   │   ├── index.ts           # Main application entry point
│   │   ├── config/            # Configuration (database)
│   │   ├── controllers/       # HTTP request handlers
│   │   ├── routes/            # Route definitions
│   │   ├── services/          # Business logic
│   │   ├── middleware/        # Auth, validation, rate limiting
│   │   ├── types/             # TypeScript interfaces
│   │   ├── utils/             # Utilities (logging, auth, etc.)
│   │   ├── __tests__/         # Unit and integration tests
│   │   └── scripts/           # Database scripts
│   ├── dist/                  # Compiled JavaScript output
│   ├── uploads/               # User-uploaded files
│   ├── database-schema.sql    # PostgreSQL schema
│   ├── package.json           # Dependencies
│   ├── tsconfig.json          # TypeScript config
│   └── README.md
│
├── mobile/                     # Flutter/Dart mobile app
│   ├── lib/
│   │   ├── main.dart          # App entry point
│   │   └── src/
│   │       ├── core/          # Global configuration
│   │       ├── features/      # Feature modules
│   │       └── shared/        # Shared code
│   ├── test/                  # Widget and unit tests
│   ├── android/               # Android native code
│   ├── ios/                   # iOS native code
│   ├── pubspec.yaml          # Dependencies
│   └── README.md
│
├── docs/                      # Documentation
│   ├── plans/                # Planning documents
│   └── *.md                  # Analysis reports
│
├── .planning/                # GSD planning artifacts
│   └── codebase/            # This folder
│
├── .github/                 # GitHub workflows
├── .git/                    # Git repository
├── package.json            # Monorepo root (delegates to backend)
└── README.md              # Main documentation
```

## Directory Purposes

**backend/src/**
- Purpose: All backend source code
- Contains: TypeScript source files organized by domain responsibility
- Key files: `index.ts` (server startup), `config/database.ts` (DB connection)

**backend/src/controllers/**
- Purpose: HTTP request handlers for each domain
- Contains: Class-based controllers (UserController, VenueController, etc.)
- Pattern: Each controller has methods like `register()`, `searchVenues()`, `createReview()`
- Key files: `UserController.ts`, `VenueController.ts`, `BandController.ts`, `ReviewController.ts`

**backend/src/routes/**
- Purpose: Define HTTP endpoints and wire them to controllers
- Contains: Express Router definitions for each domain
- Pattern: Each route file imports controller and middleware, defines routes
- Key files: `userRoutes.ts`, `venueRoutes.ts`, `bandRoutes.ts`, `reviewRoutes.ts`

**backend/src/services/**
- Purpose: Business logic and data access
- Contains: Service classes with database queries and external API calls
- Pattern: Each service handles one domain (UserService, VenueService, etc.)
- Key files: `UserService.ts`, `VenueService.ts`, `BadgeService.ts`, `FoursquareService.ts`, `MusicBrainzService.ts`

**backend/src/middleware/**
- Purpose: Cross-cutting concerns for requests
- Contains: Auth middleware, validation, rate limiting, upload handling
- Key files:
  - `auth.ts` - JWT verification, token extraction
  - `validate.ts` - Request body validation wrapper
  - `upload.ts` - Multer file upload configuration
  - `perUserRateLimit.ts` - Per-user rate limiting

**backend/src/types/**
- Purpose: TypeScript interfaces shared across backend
- Contains: `index.ts` with all type definitions
- Key types: `User`, `Venue`, `Band`, `Review`, `Badge`, `ApiResponse`, `CreateUserRequest`, `LoginRequest`

**backend/src/utils/**
- Purpose: Utility functions and helpers
- Contains: Logging, authentication, validation schemas, error handling, WebSocket
- Key files:
  - `logger.ts` - Structured logging with levels
  - `auth.ts` - Password hashing, JWT generation/verification
  - `validationSchemas.ts` - Joi validation schemas for all endpoints
  - `sentry.ts` - Error tracking integration
  - `redisRateLimiter.ts` - Distributed rate limiting
  - `cache.ts` - Redis caching utilities
  - `websocket.ts` - WebSocket server for real-time features
  - `dbMappers.ts` - Convert database rows to TypeScript models

**backend/src/__tests__/**
- Purpose: Test suite with unit and integration tests
- Contains: Mirror structure of src/ (config/, controllers/, services/, etc.)
- Pattern: Tests co-located with feature under `__tests__/{layer}/`

**mobile/lib/src/core/**
- Purpose: Global setup and infrastructure
- Contains:
  - `api/` - DioClient configuration, interceptors, API endpoints
  - `theme/` - Material 3 light/dark themes
  - `router/` - GoRouter configuration for navigation
  - `providers/` - Global Riverpod providers
  - `services/` - Analytics, crash reporting, local storage
- Key files:
  - `api/dio_client.dart` - Configured HTTP client
  - `api/api_config.dart` - API base URLs and constants
  - `router/app_router.dart` - Navigation routes
  - `providers/providers.dart` - Global state providers
  - `theme/app_theme.dart` - Theme definitions

**mobile/lib/src/features/**
- Purpose: Feature modules following clean architecture
- Contains: Subdirectories for each feature (auth, venues, bands, reviews, badges, profile, search, etc.)
- Structure: Each feature has:
  - `data/` - Repository implementations, API clients
  - `domain/` - Business logic entities, interfaces
  - `presentation/` - UI screens and widgets
- Key features:
  - `auth/` - Login, registration, authentication
  - `venues/` - Venue discovery, details, reviews
  - `bands/` - Band discovery, details
  - `reviews/` - Review creation, rating
  - `badges/` - Badge display, achievement system
  - `profile/` - User profile, stats
  - `search/` - Search functionality
  - `discover/` - Home page, recommendations
  - `checkins/` - Event check-ins
  - `feed/` - Activity feed
  - `notifications/` - Push notifications
  - `shows/` - Concert events

**mobile/lib/src/features/{feature}/data/**
- Purpose: Data source implementations (repositories, API clients)
- Contains: Repository classes that fetch from API or local storage
- Pattern: Implements domain interfaces
- Example files: `auth/data/auth_repository.dart`, `venues/data/venue_repository.dart`

**mobile/lib/src/features/{feature}/domain/**
- Purpose: Business logic and data models
- Contains: Entity classes (Freezed immutable models), interfaces
- Pattern: Pure Dart with no dependencies on Flutter or external packages
- Example files: `auth/domain/user.dart`, `bands/domain/band.dart`

**mobile/lib/src/features/{feature}/presentation/**
- Purpose: UI layer (screens, widgets)
- Contains: Flutter widgets and screens
- Pattern: Screens use Riverpod providers for state
- Example files: `auth/presentation/login_screen.dart`, `venues/presentation/venue_list_screen.dart`

**mobile/lib/src/shared/**
- Purpose: Reusable widgets and utilities
- Contains:
  - `widgets/` - Common UI components (buttons, cards, dialogs)
  - `utils/` - Utility functions (formatters, validators)
  - `services/` - Shared services (local storage, permissions)
- Used by: All features

## Key File Locations

**Entry Points:**
- Backend: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\index.ts` - Server startup
- Mobile: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\main.dart` - App initialization

**Configuration:**
- Backend DB: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\config\database.ts`
- Backend Env: `.env` file (not in repo, use `.env.example`)
- Mobile API: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\core\api\api_config.dart`
- Mobile Theme: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\core\theme\app_theme.dart`
- Mobile Router: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\core\router\app_router.dart`

**Core Logic:**
- User Service: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\services\UserService.ts`
- Venue Service: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\services\VenueService.ts`
- Badge Service: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\services\BadgeService.ts`
- Auth Repository (Mobile): `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\auth\data\auth_repository.dart`

**Testing:**
- Backend Unit Tests: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\__tests__\`
- Mobile Tests: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\test\`

## Naming Conventions

**Files:**
- Backend TypeScript: PascalCase for classes (`UserService.ts`), camelCase for functions/utilities
- Backend Test Files: Mirror source structure with `.test.ts` or `.spec.ts` suffix
- Mobile Dart: snake_case for all files (`auth_repository.dart`, `login_screen.dart`)
- Mobile Generated Files: `.freezed.dart`, `.g.dart` suffix

**Directories:**
- Backend: snake_case (controllers, services, middleware, utils, types)
- Mobile: snake_case (core, features, shared, data, domain, presentation)
- Features: feature_name (auth, venues, bands, reviews)

**Classes/Types:**
- Backend TypeScript: PascalCase controllers and services (UserController, UserService)
- Backend Types: PascalCase (User, Venue, Band, Review, ApiResponse)
- Mobile Dart: PascalCase for classes (AuthRepository, LoginScreen, User)
- Mobile Freezed Models: `@freezed class ClassName { ... }`

**Functions:**
- Backend: camelCase (authenticateUser, searchVenues, createReview)
- Mobile: camelCase (register, login, searchVenues)

**Database:**
- Tables: snake_case (users, venues, bands, reviews, user_badges)
- Columns: snake_case (first_name, password_hash, created_at)

## Where to Add New Code

**New Backend Feature:**
1. Create routes: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\routes\{feature}Routes.ts`
2. Create controller: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\controllers\{Feature}Controller.ts`
3. Create service: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\services\{Feature}Service.ts`
4. Add types: Update `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\types\index.ts`
5. Add validation schemas: Update `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\utils\validationSchemas.ts`
6. Mount routes in: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\index.ts` (app.use('/api/{feature}', {feature}Routes))
7. Add tests: Mirror structure in `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\__tests__\`

**New Mobile Feature:**
1. Create feature directory: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\`
2. Create domain: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\domain\{entity}.dart`
3. Create repository: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\data\{feature}_repository.dart`
4. Create screen: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\presentation\{feature}_screen.dart`
5. Create providers: Add to `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\core\providers\providers.dart` or feature-specific file
6. Add routes: Update `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\core\router\app_router.dart`
7. Add tests: Create in `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\test\`

**New Shared Utility (Backend):**
- Add to: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\utils\`
- Pattern: Export from `utils/` namespace
- Example: `src/utils/customHelper.ts` → import from `'../utils/customHelper'`

**New Reusable Widget (Mobile):**
- Add to: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\shared\widgets\`
- Pattern: Export from `shared/widgets/` namespace
- Example: `shared/widgets/custom_button.dart` → import from `'../../shared/widgets/custom_button'`

## Special Directories

**backend/uploads/**
- Purpose: Stores user-uploaded files (profile images, review images)
- Generated: Yes (created at runtime)
- Committed: No (.gitignore'd)
- Access: Requires JWT authentication via `/api/uploads` route
- Cleanup: Subject to data retention policies in `DataRetentionService.ts`

**backend/dist/**
- Purpose: Compiled JavaScript output from TypeScript
- Generated: Yes (by `npm run build`)
- Committed: No (.gitignore'd)
- When needed: Run `npm run build` before deployment

**backend/__tests__/**
- Purpose: Test suite
- Generated: No (manually written)
- Committed: Yes
- Pattern: Mirrors `src/` structure for organization

**mobile/.dart_tool/**
- Purpose: Generated Dart tool artifacts
- Generated: Yes (by Pub)
- Committed: No (.gitignore'd)

**mobile/build/**
- Purpose: Compiled app outputs
- Generated: Yes (by Flutter build)
- Committed: No (.gitignore'd)
- Platforms: android/, ios/, linux/, macos/, windows/

**mobile/test/**
- Purpose: Test suite
- Generated: No (manually written)
- Committed: Yes
- Pattern: Mirrors lib/src/features structure

**.planning/codebase/**
- Purpose: Architecture and structure documentation (THIS FOLDER)
- Generated: Yes (by `/gsd:map-codebase` command)
- Committed: Yes
- Consumed by: `/gsd:plan-phase` and `/gsd:execute-phase` commands

---

*Structure analysis: 2026-02-02*
