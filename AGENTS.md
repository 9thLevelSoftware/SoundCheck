# AGENTS.md - SoundCheck Repository Guide

This document provides essential information for autonomous agents working on the SoundCheck codebase.

## Repository Overview

SoundCheck is a monorepo containing:
- **backend/**: Node.js/Express/TypeScript API server (deployed to Railway)
- **mobile/**: Flutter mobile application for iOS and Android

## Quick Start

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with local configuration (see .env.example for required variables)
npm run dev
```

### Mobile
```bash
cd mobile
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
flutter run
```

## Build Commands

### Backend
| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Start development server with hot reload (nodemon) |
| `npm start` | Run production build from `dist/index.js` |

### Mobile
| Command | Description |
|---------|-------------|
| `make build-runner` | Generate code with build_runner (freezed, json_serializable) |
| `flutter build apk` | Build Android APK |
| `flutter build ios` | Build iOS app |
| `make build-apk` | Build release APK via Makefile |

## Test Commands

### Backend
| Command | Description |
|---------|-------------|
| `npm test` | Run all unit tests with Jest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

Test location: `backend/src/__tests__/`

### Mobile
| Command | Description |
|---------|-------------|
| `flutter test` | Run all unit/widget tests |
| `make test` | Run tests via Makefile |
| `make test-coverage` | Run tests with coverage |

Test location: `mobile/test/`

## Lint & Format Commands

### Backend
| Command | Description |
|---------|-------------|
| `npx eslint . --ext .ts` | Run ESLint |
| `npx tsc --noEmit` | Type check without emitting files |

ESLint is run in CI but no formatter (Prettier) is currently configured.

### Mobile
| Command | Description |
|---------|-------------|
| `flutter analyze` | Run Dart analyzer |
| `dart format lib/ test/` | Format Dart code |
| `dart fix --apply` | Auto-fix lint issues |

Analysis options: `mobile/analysis_options.yaml`

## Database Commands

### Backend
| Command | Description |
|---------|-------------|
| `npm run migrate:up` | Run pending migrations |
| `npm run migrate:down` | Rollback last migration |
| `npm run migrate:create` | Create new migration file |
| `npm run seed` | Seed database with dev data |

Schema: `backend/database-schema.sql`
Migrations: `backend/migrations/`

## Environment Variables

### Backend Required
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT signing (64+ chars)
- `REDIS_URL` - Redis connection for caching/jobs
- `SENTRY_DSN` - Error tracking (production)
- `FIREBASE_SERVICE_ACCOUNT_JSON` - Push notifications
- `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` - R2 storage

See `backend/.env.example` for complete list.

### Mobile Required
- `API_BASE_URL` - Backend API URL (e.g., `http://10.0.2.2:3000/api` for Android emulator)

See `mobile/.env.example` for details.

## Project Structure

### Backend (`backend/src/`)
- `controllers/` - Express route handlers
- `services/` - Business logic layer
- `routes/` - API route definitions
- `middleware/` - Auth, validation, rate limiting
- `utils/` - Helpers (logger, sentry, cache, etc.)
- `types/` - TypeScript type definitions
- `config/` - Database, Redis configuration
- `jobs/` - BullMQ queue workers
- `__tests__/` - Unit and integration tests

### Mobile (`mobile/lib/src/`)
- `core/` - App-wide utilities, providers, router, theme
- `features/` - Feature-based architecture
  - `auth/` - Authentication (login, register, social)
  - `checkins/` - Check-in creation, details
  - `venues/` - Venue discovery and details
  - `bands/` - Band discovery and details
  - `feed/` - Activity feed
  - `profile/` - User profile and settings
  - etc.
- `shared/` - Reusable widgets and utilities

Each feature folder contains: `data/`, `domain/`, `presentation/`

## Coding Conventions

### TypeScript (Backend)
- **Strict mode**: Enabled in `tsconfig.json`
- **Naming**:
  - `camelCase` for variables, functions, methods
  - `PascalCase` for classes, types, interfaces
  - `UPPER_SNAKE_CASE` for constants
- **Imports**: Group by external → internal, use absolute imports from `src/`
- **Error handling**: Use `AppError` class for known errors, catch and log with winston
- **Async**: Always use async/await, never raw Promises
- **Validation**: Use Zod schemas for request validation
- **Logging**: Use `logger` from `utils/logger.ts`, never `console.log`

### Dart (Mobile)
- **Null safety**: Sound null safety enabled
- **Naming**:
  - `camelCase` for variables, functions
  - `PascalCase` for classes, widgets, enums
  - `snake_case` for file names
- **State management**: Riverpod with code generation (`riverpod_generator`)
- **Models**: Use Freezed for immutable models with `json_serializable`
- **Widgets**: Prefer `const` constructors, use `ConsumerWidget` or `ConsumerStatefulWidget`
- **Navigation**: GoRouter in `core/router/app_router.dart`
- **Theme**: Use `Theme.of(context)` for colors, never hardcode

## CI/CD

- **Platform**: GitHub Actions
- **Workflow**: `.github/workflows/ci.yml`
- **Jobs**:
  1. `backend-lint-and-test`: ESLint, tsc, build, Jest tests
  2. `mobile-analyze-and-test`: Flutter analyze, tests
  3. `secret-scan`: Gitleaks secret detection
- **Deployment**: Railway auto-deploys on push to master

## Common Tasks

### Adding a new API endpoint
1. Create/update types in `types/index.ts`
2. Create service method in appropriate `services/` file
3. Create controller in `controllers/`
4. Define route in `routes/`
5. Add tests in `__tests__/`

### Adding a new mobile feature
1. Create feature folder under `lib/src/features/`
2. Define domain models with Freezed in `domain/`
3. Create repository in `data/`
4. Create Riverpod providers in `presentation/providers/`
5. Build UI in `presentation/` screens/widgets
6. Add route in `core/router/app_router.dart`
7. Add tests in `test/`

### Running migrations in production
Railway runs migrations automatically on deploy via `railway.toml`:
```
startCommand = "cd backend && npm run migrate:up && npm start"
```

## Security Notes

- Never commit `.env` files (gitignored)
- Never log sensitive data (passwords, tokens, API keys)
- Use `logSanitizer.ts` utilities for logging external API responses
- Secrets in CI: Use GitHub Actions secrets (`secrets.*`)
- Production secrets: Configure in Railway dashboard

## Key Files to Know

- `backend/src/index.ts` - Express app entry point
- `backend/src/config/database.ts` - PostgreSQL connection pool
- `backend/src/utils/logger.ts` - Winston logger configuration
- `backend/src/utils/sentry.ts` - Sentry error tracking setup
- `mobile/lib/main.dart` - Flutter app entry point
- `mobile/lib/src/core/router/app_router.dart` - Navigation routes
- `mobile/lib/src/core/providers/providers.dart` - Global Riverpod providers
