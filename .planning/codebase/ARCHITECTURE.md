# Architecture

**Analysis Date:** 2026-02-02

## Pattern Overview

**Overall:** Monorepo with layered backend API and clean architecture mobile app

**Key Characteristics:**
- Monorepo structure: `/backend` (Node.js/Express) and `/mobile` (Flutter)
- Backend follows MVC + service layer pattern
- Mobile follows clean architecture: data/domain/presentation layers
- Full-stack authentication via JWT tokens
- WebSocket support for real-time features
- Rate limiting and security middleware on all endpoints

## Layers

**Backend Request Flow:**

1. **Middleware Layer** (`/backend/src/middleware/`)
   - Purpose: Authentication, validation, rate limiting, error handling
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\middleware\`
   - Contains: `auth.ts`, `validate.ts`, `upload.ts`, `perUserRateLimit.ts`
   - Depends on: Express, JWT utilities
   - Used by: All route handlers

2. **Routes Layer** (`/backend/src/routes/`)
   - Purpose: Map HTTP endpoints to controllers
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\routes\`
   - Contains: `userRoutes.ts`, `venueRoutes.ts`, `bandRoutes.ts`, `reviewRoutes.ts`, `badgeRoutes.ts`, `eventRoutes.ts`, `checkinRoutes.ts`, `notificationRoutes.ts`, `followRoutes.ts`, `wishlistRoutes.ts`, `socialAuthRoutes.ts`, `searchRoutes.ts`, etc.
   - Depends on: Controllers, middleware
   - Used by: Express app in `index.ts`

3. **Controllers Layer** (`/backend/src/controllers/`)
   - Purpose: Handle HTTP requests/responses, request validation, call services
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\controllers\`
   - Contains: `UserController.ts`, `VenueController.ts`, `BandController.ts`, `ReviewController.ts`, `BadgeController.ts`, `EventController.ts`, `CheckinController.ts`, `NotificationController.ts`, `FollowController.ts`, `WishlistController.ts`, etc.
   - Depends on: Services, types
   - Used by: Routes layer

4. **Services Layer** (`/backend/src/services/`)
   - Purpose: Business logic, data access orchestration, external API integration
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\services\`
   - Contains: `UserService.ts`, `VenueService.ts`, `BandService.ts`, `ReviewService.ts`, `BadgeService.ts`, `EventService.ts`, `CheckinService.ts`, `NotificationService.ts`, `FollowService.ts`, `WishlistService.ts`, `FoursquareService.ts`, `MusicBrainzService.ts`, `SetlistFmService.ts`, `SocialAuthService.ts`, `DataExportService.ts`, `DataRetentionService.ts`
   - Depends on: Database, utilities
   - Used by: Controllers

5. **Database Layer** (`/backend/src/config/database.ts`)
   - Purpose: PostgreSQL connection pooling and query execution
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\config\database.ts`
   - Contains: Database singleton, connection configuration
   - Depends on: pg (PostgreSQL client), environment variables
   - Used by: Services

6. **Types Layer** (`/backend/src/types/index.ts`)
   - Purpose: TypeScript interfaces and types shared across layers
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\types\index.ts`
   - Contains: `User`, `Venue`, `Band`, `Review`, `Badge`, `ApiResponse` and related interfaces
   - Depends on: None (pure types)
   - Used by: All other layers

7. **Utilities Layer** (`/backend/src/utils/`)
   - Purpose: Cross-cutting concerns: logging, error handling, authentication, validation, caching
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\utils\`
   - Contains: `logger.ts`, `auth.ts`, `errors.ts`, `validationSchemas.ts`, `sentry.ts`, `redisRateLimiter.ts`, `cache.ts`, `websocket.ts`, `dbMappers.ts`, `asyncHandler.ts`, `logSanitizer.ts`
   - Depends on: External libraries (Sentry, Redis, Joi)
   - Used by: All layers

## Mobile Architecture Layers

**Flutter Clean Architecture:**

1. **Presentation Layer** (`/mobile/lib/src/features/*/presentation/`)
   - Purpose: UI widgets, screens, state management via Riverpod
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\presentation\`
   - Examples: `auth/presentation/login_screen.dart`, `venues/presentation/venue_list_screen.dart`
   - Depends on: Domain, Riverpod providers
   - Used by: GoRouter navigation

2. **Domain Layer** (`/mobile/lib/src/features/*/domain/`)
   - Purpose: Business logic entities, use cases, interfaces
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\domain\`
   - Examples: `auth/domain/user.dart`, `bands/domain/band.dart`
   - Depends on: None (independent of implementation)
   - Used by: Presentation, Data layers

3. **Data Layer** (`/mobile/lib/src/features/*/data/`)
   - Purpose: Repository implementations, data sources (API calls, local storage)
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\features\{feature}\data\`
   - Examples: `auth/data/auth_repository.dart`, `venues/data/venue_repository.dart`
   - Depends on: Domain, DioClient
   - Used by: Domain

4. **Core Layer** (`/mobile/lib/src/core/`)
   - Purpose: Global setup, configuration, providers
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\core\`
   - Contains:
     - `api/` - DioClient, API configuration
     - `theme/` - AppTheme, theme provider
     - `router/` - GoRouter configuration
     - `providers/` - Global Riverpod providers
     - `services/` - Analytics, crash reporting
   - Depends on: Riverpod, Dio
   - Used by: All features

5. **Shared Layer** (`/mobile/lib/src/shared/`)
   - Purpose: Reusable widgets, utilities
   - Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\src\shared\`
   - Contains: `widgets/`, `utils/`, `services/`
   - Depends on: Flutter, Riverpod
   - Used by: All features

## Data Flow

**User Authentication Flow:**

1. User enters credentials on `login_screen.dart`
2. Form validation triggers `AuthRepository.login()` in data layer
3. `DioClient` sends HTTP POST to `/api/users/login`
4. Backend `UserController.login()` receives request
5. `UserService.authenticateUser()` executes business logic: hash check, DB query
6. `UserService` generates JWT token via `AuthUtils.generateToken()`
7. Response returned with user object + token in `{success, data, message}` format
8. Mobile app extracts token from `response.data['data']`
9. Token stored in `FlutterSecureStorage` under `ApiConfig.tokenKey`
10. User object stored as JSON in secure storage
11. Riverpod state updated, UI reflects authenticated state

**Venue Search Flow:**

1. User types in search on `discover_screen.dart`
2. Riverpod provider triggers `VenueRepository.searchVenues(query, filters)`
3. `DioClient` adds JWT token to Authorization header
4. HTTP GET to `/api/venues?q={query}&city={city}&rating={rating}&page={page}`
5. Backend `VenueController.searchVenues()` receives and validates
6. `VenueService.searchVenues()` executes SQL query with pagination
7. Returns array of venues with ratings, reviews, user stats
8. Cached in Redis (10-minute TTL) for repeated searches
9. Response mapped to Flutter `Venue` models via `Freezed`
10. UI displays paginated results with infinite scroll

## State Management

**Backend:**
- Request-response stateless pattern
- Database (PostgreSQL) as single source of truth
- Redis for distributed rate limiting and short-term caching
- WebSocket for real-time notifications

**Mobile:**
- Riverpod for state management
- Global providers in `core/providers/providers.dart`
- Feature-specific providers in each feature
- Local state in presentation widgets via `useState`
- JWT token persisted in `FlutterSecureStorage`
- User profile cached in Riverpod state

## Key Abstractions

**ApiResponse Wrapper:**
- Purpose: Standardized response format across all endpoints
- Location: Backend: `src/types/index.ts`, Mobile: parsed in repositories
- Pattern: `{success: boolean, data?: T, message?: string, error?: string}`
- Example response:
  ```json
  {
    "success": true,
    "data": {
      "user": {...},
      "token": "eyJhbGc..."
    },
    "message": "Login successful"
  }
  ```

**Service Layer Pattern:**
- Purpose: Isolate business logic from HTTP concerns
- Examples:
  - `UserService.createUser()` - handles registration logic, password hashing
  - `VenueService.searchVenues()` - handles search, filtering, pagination
  - `BadgeService.checkAndAwardBadges()` - handles badge logic
- Pattern: Services call database singleton and external APIs

**Repository Pattern (Mobile):**
- Purpose: Abstract data sources from domain/presentation
- Examples:
  - `AuthRepository` - delegates to `DioClient` + `FlutterSecureStorage`
  - `VenueRepository` - delegates to `DioClient`
- Pattern: Repository methods catch exceptions and rethrow domain exceptions

**Middleware Chain (Backend):**
- Purpose: Apply cross-cutting concerns in order
- Order in `index.ts`:
  1. Security: Helmet, CORS
  2. Body parsing: `express.json()`, `express.urlencoded()`
  3. Request logging
  4. Route-specific: authentication, validation, rate limiting
  5. Global error handler

## Entry Points

**Backend:**
- Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\index.ts`
- Triggers: Server startup via `npm start` or `npm run dev`
- Responsibilities:
  - Initialize environment variables (Sentry, Redis)
  - Configure security middleware
  - Mount all route handlers
  - Start HTTP server on port 3000 (or $PORT env var)
  - Setup graceful shutdown handlers
  - Health check endpoint at `/health`
  - Root info endpoint at `/`

**Mobile:**
- Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\mobile\lib\main.dart`
- Triggers: App launch via `flutter run`
- Responsibilities:
  - Initialize crash reporting (Sentry)
  - Initialize analytics (Firebase)
  - Setup error handlers for uncaught exceptions
  - Create ProviderScope for Riverpod
  - Configure MaterialApp with GoRouter
  - Apply theme provider

## Error Handling

**Strategy:** Layered error handling with specific exception types

**Backend Patterns:**

1. **Service Layer Errors** (`services/*.ts`):
   - Throw descriptive `Error` objects with business-level messages
   - Example: `throw new Error('Username already taken')`
   - Caught by controller, passed to response

2. **Controller Error Handling** (`controllers/*.ts`):
   - Wrap service calls in try-catch
   - Return `ApiResponse` with `success: false` and error message
   - Example:
     ```typescript
     try {
       const result = await this.userService.createUser(userData);
       res.status(201).json({ success: true, data: result });
     } catch (error) {
       res.status(400).json({
         success: false,
         error: error instanceof Error ? error.message : 'Failed'
       });
     }
     ```

3. **Global Error Handler** (in `index.ts`):
   - Catches all unhandled errors from routes
   - Logs to logger + Sentry (for 5xx errors)
   - Returns sanitized response (hides stack traces in production)
   - Example: `app.use((error, req, res, next) => { ... })`

4. **Async Handler Pattern** (`utils/asyncHandler.ts`):
   - Wrapper for route handlers to catch async errors
   - Prevents unhandled promise rejections

**Mobile Patterns:**

1. **Repository Error Handling** (`features/*/data/`):
   - Catch DioException and rethrow as domain-specific exceptions
   - Example: `catch (e) { rethrow; }` or wrap in domain exception

2. **Riverpod Error States:**
   - Providers can return `AsyncValue.error()`
   - UI checks for error state: `ref.watch(provider).whenError((error, stack) => ...)`

3. **Crash Reporting:**
   - Uncaught exceptions sent to Sentry via `CrashReportingService.captureException()`
   - Flutter framework errors also captured

## Cross-Cutting Concerns

**Logging:**
- Backend: `utils/logger.ts` provides structured logging
  - Levels: `logInfo()`, `logError()`, `logWarn()`, `logHttp()`
  - HTTP requests logged with method/path
  - Errors logged with stack trace
  - Sentry integration for error tracking
- Mobile: Firebase Analytics + Sentry

**Validation:**
- Backend: `middleware/validate.ts` + `utils/validationSchemas.ts`
  - Joi schemas for request validation
  - Applied via middleware before controller execution
  - Examples: `createUserSchema`, `loginUserSchema`, `updateProfileSchema`
- Mobile: Client-side validation in presentation layer
  - Form validation before submission
  - Dio interceptor validates response structure

**Authentication:**
- Backend:
  - JWT generation: `AuthUtils.generateToken()` in `utils/auth.ts`
  - JWT verification: `authenticateToken` middleware in `middleware/auth.ts`
  - Token includes: `userId`, `email`, `username`
  - Expiry: 7 days (configurable)
- Mobile:
  - Token stored in `FlutterSecureStorage`
  - Added to all requests via Dio interceptor
  - Cleared on logout
  - Checked before accessing protected features

**Rate Limiting:**
- Backend: `utils/redisRateLimiter.ts` + Redis
  - Auth endpoints: 5 requests per 15 minutes
  - General endpoints: 30 requests per 15 minutes
  - Badge checking: 10 requests per 15 minutes
  - Per-IP or per-user (via JWT)
  - Applied via `rateLimit()` middleware

**WebSocket (Real-time):**
- Backend: `utils/websocket.ts`
  - Enabled via `ENABLE_WEBSOCKET=true` env var
  - Used for notifications, live updates
  - Connection stats exposed at `/health`
- Location: `C:\Users\dasbl\AndroidStudioProjects\SoundCheck\backend\src\utils\websocket.ts`

---

*Architecture analysis: 2026-02-02*
