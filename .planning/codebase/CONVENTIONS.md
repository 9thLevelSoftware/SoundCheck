# Coding Conventions

**Analysis Date:** 2026-02-02

## Naming Patterns

**Files:**
- Controllers: PascalCase with "Controller" suffix (e.g., `UserController.ts`, `ReviewController.ts`)
- Services: PascalCase with "Service" suffix (e.g., `UserService.ts`, `ReviewService.ts`)
- Middleware: camelCase descriptive names (e.g., `auth.ts`, `validate.ts`, `upload.ts`)
- Routes: camelCase with "Routes" suffix (e.g., `userRoutes.ts`, `bandRoutes.ts`)
- Types/Interfaces: Stored in `src/types/index.ts` as centralized definitions
- Utilities: camelCase with descriptive purpose (e.g., `validationSchemas.ts`, `dbMappers.ts`)
- Test files: Match source file name with `.test.ts` or `.integration.test.ts` suffix

**Functions:**
- Async functions: camelCase, descriptor-first (e.g., `createUser`, `getVenueById`, `validateEmail`)
- Arrow functions: Used in route definitions and middleware (e.g., `register = async (req, res)`)
- Handlers: Suffixed with "Handler" or context (e.g., `handleMulterError`)

**Variables:**
- Constants: UPPER_SNAKE_CASE for module-level constants (e.g., `JWT_SECRET`, `CORS_ORIGIN`)
- Regular variables: camelCase (e.g., `userId`, `reviewData`, `mockUserService`)
- Database columns: snake_case (e.g., `user_id`, `first_name`, `created_at`)
- Mapped objects: camelCase after conversion from DB (e.g., `firstName`, `isVerified`)

**Types:**
- Interfaces: PascalCase (e.g., `User`, `AuthResponse`, `ApiResponse`)
- Type unions: PascalCase (e.g., `VenueType = 'concert_hall' | 'club' | ...`)
- Custom error classes: PascalCase with "Error" suffix (e.g., `BadRequestError`, `UnauthorizedError`)

## Code Style

**Formatting:**
- TypeScript strict mode enabled (all files compiled with strict: true)
- Target: ES2020
- Module system: CommonJS (es6 module imports transpiled to require)
- Line endings: LF (Unix style)
- No explicit formatting tool configured (ESLint/Prettier not found)

**Linting:**
- No ESLint or Prettier configuration detected
- TypeScript compiler serves as primary type safety tool
- Manual code review required for consistent formatting

## Import Organization

**Order:**
1. External dependencies (express, database modules, etc.)
2. Internal absolute imports (config, types, middleware)
3. Internal relative imports (services, utils, controllers)

**Example from `src/index.ts`:**
```typescript
import dotenv from 'dotenv';
import { initSentry, setupSentryForExpress } from './utils/sentry';
import express from 'express';
import userRoutes from './routes/userRoutes';
import Database from './config/database';
import { ApiResponse } from './types';
```

**Path Aliases:**
- No path aliases configured in tsconfig
- All imports use relative or absolute paths from project root
- Import paths consistently from `src/` in source files

**Barrel Files:**
- `src/types/index.ts` exports all type definitions centrally
- No other barrel files detected

## Error Handling

**Pattern:** Custom error classes hierarchy

- **Base class:** `AppError` extends Error with `statusCode` and `internalMessage` properties
- **Specific errors:**
  - `BadRequestError` (400)
  - `UnauthorizedError` (401)
  - `ForbiddenError` (403)
  - `NotFoundError` (404)
  - `ConflictError` (409)
  - `ValidationError` (422) with `validationErrors` property
  - `RateLimitError` (429)
  - `InternalServerError` (500)
  - `ServiceUnavailableError` (503)

**Usage in Services:**
```typescript
if (emailExists) {
  throw new Error('Email already registered');
}
if (rating < 1 || rating > 5) {
  throw new Error('Rating must be between 1 and 5');
}
```

**Usage in Controllers:**
```typescript
catch (error) {
  const response: ApiResponse = {
    success: false,
    error: error instanceof Error ? error.message : 'Registration failed',
  };
  res.status(400).json(response);
}
```

**Global Error Handler** at `src/index.ts` (lines 220-260):
- Catches all errors from async handlers
- Logs to Sentry for 5xx errors
- Returns user-friendly messages in production
- Includes stack traces only in development

## Logging

**Framework:** Winston with daily log rotation

**Configuration:**
- Console output in development
- File rotation in production (14-day retention for general logs, 30-day for errors)
- Separate error log file (`soundcheck-error-%DATE%.log`)
- Timestamp on all logs (format: `YYYY-MM-DD HH:mm:ss`)

**Log Levels:**
- error (0)
- warn (1)
- info (2)
- http (3)
- debug (4)

**Functions exported from `src/utils/logger.ts`:**
- `logger` (default export) - Winston instance
- `logHttp()` - HTTP request logging
- `logInfo()` - General information
- `logError()` - Error logging with context
- `logWarn()` - Warning logging

**Usage Pattern:**
```typescript
import { logError, logInfo, logWarn } from './utils/logger';

logInfo(`Server running on port ${PORT}`);
logError('Database connection failed', { error, statusCode: 500 });
logWarn('CORS: Rejected origin:', { origin });
```

## Comments

**When to Comment:**
- Complex business logic (e.g., validation rules in `ReviewService`)
- Security-related decisions (e.g., CORS configuration)
- Environment-dependent behavior
- TODO or FIXME notes (not found in codebase)

**JSDoc/TSDoc:**
- Used extensively for function documentation
- Method signatures documented with @param and description
- Example from `UserService`:
```typescript
/**
 * Create a new user
 */
async createUser(userData: CreateUserRequest): Promise<AuthResponse> { ... }

/**
 * Authenticate user login
 */
async authenticateUser(loginData: LoginRequest): Promise<AuthResponse> { ... }
```

**Code Comments:**
- Inline comments explain business logic
- Database column mappings documented
- Sentry initialization documented with special comments about execution order

## Function Design

**Size:** Functions typically 20-80 lines, kept focused on single responsibility

**Parameters:**
- Use typed objects over multiple parameters (e.g., `CreateUserRequest` instead of `email, password, username`)
- Spread operator used for optional params in error constructors
- Default parameters used in error classes: `message: string = 'Default message'`

**Return Values:**
- Services return domain types (`User`, `Review`, `Venue`) or mapped objects
- Controllers return `Promise<void>` with JSON responses via `res.json()`
- Middleware returns `void` or calls `next()`

**Async/Await:**
- All I/O operations use async/await
- Error handling with try/catch blocks
- No unhandled promise rejections (global handlers in `src/index.ts`)

**Example from `UserService.createUser()`:**
```typescript
async createUser(userData: CreateUserRequest): Promise<AuthResponse> {
  const { email: rawEmail, password, username, firstName, lastName } = userData;
  const email = rawEmail.toLowerCase();

  // Validation
  const emailExists = await this.findByEmail(email);
  if (emailExists) {
    throw new Error('Email already registered');
  }

  // Database operation
  const passwordHash = await AuthUtils.hashPassword(password);
  const result = await this.db.query(query, values);
  const user = mapDbUserToUser(result.rows[0]);

  // Token generation
  const token = AuthUtils.generateToken({ userId: user.id, email: user.email, username: user.username });

  return { user, token };
}
```

## Module Design

**Exports:**
- Services exported as classes: `export class UserService { ... }`
- Controllers exported as classes: `export class UserController { ... }`
- Middleware exported as named functions: `export const authenticateToken = ...`
- Utils exported as class static methods or named functions

**Instantiation Pattern:**
- Controllers instantiate services in constructor
- Services instantiate Database singleton via `Database.getInstance()`
- Dependency injection supported via constructor parameters (used in tests)

**Example from `UserController`:**
```typescript
export class UserController {
  private userService: UserService;

  constructor(userService?: UserService) {
    this.userService = userService ?? new UserService();
  }
}
```

## Class Design

**Sealed/Final Pattern:**
- Recent commit (e58ad99) refactored classes to sealed for immutability and performance
- Classes use `sealed class` where applicable

**Method Binding:**
- Arrow function methods in controllers to preserve `this` context
- Example from `UserController.register`:
```typescript
register = async (req: Request, res: Response): Promise<void> => { ... }
```

**Static Methods:**
- Used in utility classes (e.g., `AuthUtils.generateToken()`, `AuthUtils.hashPassword()`)
- Avoids instantiation for pure utility functions

## API Response Format

**Standard Structure:**
```typescript
export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}
```

**Success Response:**
```typescript
const response: ApiResponse = {
  success: true,
  data: authResponse,
  message: 'User registered successfully',
};
res.status(201).json(response);
```

**Error Response:**
```typescript
const response: ApiResponse = {
  success: false,
  error: error instanceof Error ? error.message : 'Request failed',
};
res.status(400).json(response);
```

## Validation

**Framework:** Zod for schema-based validation

**Pattern:** Schemas defined in `src/utils/validationSchemas.ts`

**Example:**
```typescript
export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/(?=.*[A-Z])/, 'Password must contain at least one uppercase letter'),
    username: z.string()
      .min(3, 'Username must be at least 3 characters')
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, dots, hyphens, and underscores'),
  }),
});
```

**Middleware Usage:**
```typescript
router.post('/register', authRateLimit, validate(createUserSchema), userController.register);
```

**Validation Middleware** at `src/middleware/validate.ts`:
- Validates request body, query, and params
- Returns 400 with detailed error messages on validation failure
- Zod error formatting: `${path.join('.')}: ${message}`

---

*Convention analysis: 2026-02-02*
