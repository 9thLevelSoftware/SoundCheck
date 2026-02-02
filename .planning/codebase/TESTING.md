# Testing Patterns

**Analysis Date:** 2026-02-02

## Test Framework

**Runner:**
- Jest 29.5.0
- Preset: ts-jest (TypeScript support)
- Config file: Embedded in `backend/package.json`

**Assertion Library:**
- Jest built-in assertions (`expect`)
- Supertest for HTTP testing

**Run Commands:**
```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # Generate coverage report
```

**Jest Configuration** from `package.json`:
```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/src"],
  "testMatch": ["**/__tests__/**/*.test.ts"],
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts"
  ],
  "setupFilesAfterEnv": ["<rootDir>/src/__tests__/setup.ts"]
}
```

## Test File Organization

**Location:**
- Co-located with source code in `src/__tests__/` directory
- Tests live in same directory structure as source code

**Directory Structure:**
```
src/
├── __tests__/
│   ├── controllers/          # Controller tests
│   ├── services/             # Service unit and integration tests
│   ├── middleware/           # Middleware tests
│   ├── integration/          # End-to-end integration tests
│   ├── routes/               # Route handler tests
│   ├── config/               # Configuration tests
│   ├── utils/                # Utility function tests
│   ├── scripts/              # Script tests
│   ├── validation/           # Validation schema tests
│   └── setup.ts              # Global test setup
├── controllers/
├── services/
├── middleware/
└── ...
```

**Naming:**
- Unit test files: `{Component}.test.ts`
- Integration test files: `{Component}.integration.test.ts`
- Specialized tests: `{Component}.{aspect}.test.ts` (e.g., `UserService.stats.test.ts`)

## Test Structure

**Suite Organization:**
```typescript
describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      // Arrange
      const userData = { ... };

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result).toEqual({ ... });
    });

    it('should throw error for existing email', async () => {
      // Arrange
      const userData = { ... };
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow('Email already registered');
    });
  });

  describe('authenticateUser', () => {
    // More tests...
  });
});
```

**Patterns:**
- Use `describe()` for grouping related tests
- Use `it()` for individual test cases
- `beforeEach()` for test setup and cleanup
- `jest.clearAllMocks()` to reset mock state between tests
- Arrange-Act-Assert pattern

## Mocking

**Framework:** Jest built-in mocking with `jest.mock()`

**Module Mocking Pattern:**
```typescript
jest.mock('../../config/database');
jest.mock('../../utils/auth');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);
```

**Service Mocking in Controllers:**
```typescript
jest.mock('../../services/UserService');

describe('UserController', () => {
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(() => {
    mockUserService = new UserService() as jest.Mocked<UserService>;
    const userController = new UserController(mockUserService);
  });
});
```

**Middleware/Utility Mocking:**
```typescript
jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    verifyToken: jest.fn(),
    extractTokenFromHeader: jest.fn(),
    generateToken: jest.fn(),
    hashPassword: jest.fn(),
    comparePassword: jest.fn(),
  },
}));

const MockedAuthUtils = AuthUtils as jest.Mocked<typeof AuthUtils>;

// Use in tests
MockedAuthUtils.generateToken.mockReturnValue('mock-jwt-token');
```

**Database Query Mocking Pattern:**
```typescript
mockDb.query
  .mockResolvedValueOnce({ rows: [] })           // First call
  .mockResolvedValueOnce({ rows: [] })           // Second call
  .mockResolvedValueOnce({ rows: [mockUserResult] }); // Third call
```

**What to Mock:**
- Database module (always - tests should not touch DB)
- External services (APIs, auth providers)
- File system operations
- Environment-dependent modules

**What NOT to Mock:**
- Business logic functions being tested
- Data transformation utilities
- Schema validation (Zod)
- Pure functions that don't have side effects

## Fixtures and Factories

**Test Data:**
```typescript
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  isVerified: false,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockUserResult = {
  id: 'user-123',
  email: userData.email,
  username: userData.username,
  first_name: userData.firstName,
  last_name: userData.lastName,
  bio: null,
  profile_image_url: null,
  location: null,
  date_of_birth: null,
  is_verified: false,
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};
```

**Location:**
- Defined inline in test files (no separate fixture files)
- Constants at top of describe block
- Specific variations defined within test suites

## Coverage

**Requirements:** No enforced minimum (not configured in jest config)

**View Coverage:**
```bash
npm run test:coverage
```

**Coverage Output:**
- Generated to stdout
- Shows statement, branch, function, and line coverage
- No coverage threshold enforced

**Excluded from Coverage:**
- `src/**/*.d.ts` - TypeScript declarations
- `src/index.ts` - Entry point (difficult to test in isolation)

## Test Types

**Unit Tests:**
- Scope: Individual services, controllers, middleware
- Approach: Mocked all external dependencies
- Location: `src/__tests__/services/*.test.ts`, `src/__tests__/controllers/*.test.ts`
- Example: `UserService.test.ts` - tests UserService methods in isolation

**Integration Tests:**
- Scope: End-to-end flows combining multiple components
- Approach: Express app setup with mocked services
- Location: `src/__tests__/integration/*.test.ts` and `*.integration.test.ts` files
- Example: `auth.integration.test.ts` - tests registration -> login -> protected route flow

**Integration Test with Real Interactions:**
```typescript
describe('CheckinService Integration', () => {
  // Tests interaction between CheckinService, UserService, BadgeService
  // Services are instantiated with mocked Database
});

describe('ReviewService Integration', () => {
  // Tests Review creation triggering VenueService rating updates
});
```

**E2E Tests:**
- Framework: Supertest (HTTP testing via Express app)
- Not a separate test suite - integrated into controller/route tests
- Example usage:
```typescript
const response = await request(app)
  .post('/register')
  .send(userData);

expect(response.status).toBe(201);
expect(response.body.success).toBe(true);
```

## Common Patterns

**Async Testing:**
```typescript
it('should create a user successfully', async () => {
  const result = await userService.createUser(userData);
  expect(result).toEqual({ user: mockUser, token: 'mock-jwt-token' });
});

it('should throw error for existing email', async () => {
  await expect(userService.createUser(userData)).rejects.toThrow('Email already registered');
});
```

**Error Testing:**
```typescript
it('should throw error for invalid rating', async () => {
  const invalidReviewData = {
    venueId: 'venue-123',
    rating: 6, // Invalid - must be 1-5
    title: 'Test Review',
  };

  await expect(reviewService.createReview('user-123', invalidReviewData))
    .rejects.toThrow('Rating must be between 1 and 5');
});
```

**HTTP Request Testing:**
```typescript
it('should return 400 for missing required fields', async () => {
  const userData = {
    email: 'test@example.com',
    // Missing password and username
  };

  const response = await request(app)
    .post('/register')
    .send(userData);

  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
  expect(response.body.error).toBe('Validation failed');
  expect(response.body.data.details).toBeDefined();
});
```

**Middleware Testing:**
```typescript
describe('authenticateToken', () => {
  it('should authenticate with valid token', async () => {
    mockRequest.headers = { authorization: 'Bearer valid-token' };

    MockedAuthUtils.extractTokenFromHeader.mockReturnValue('valid-token');
    MockedAuthUtils.verifyToken.mockReturnValue({
      userId: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    });

    const mockFindById = jest.fn().mockResolvedValue(mockUser);
    MockedUserService.prototype.findById = mockFindById;

    await authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockRequest.user).toEqual(mockUser);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 401 for missing token', async () => {
    mockRequest.headers = {};
    MockedAuthUtils.extractTokenFromHeader.mockReturnValue(null);

    await authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(401);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
```

**Setup File:**

`src/__tests__/setup.ts`:
```typescript
// Load environment variables before running tests
import dotenv from 'dotenv';
dotenv.config();
```

This ensures environment variables are available for all tests.

## Test Examples by Component

**Service Unit Test** (`src/__tests__/services/UserService.test.ts`):
- Mocks Database and AuthUtils
- Tests individual methods in isolation
- Verifies database queries are called correctly
- Tests both success and error paths

**Controller Test** (`src/__tests__/controllers/UserController.test.ts`):
- Mocks UserService
- Uses Supertest to make HTTP requests to Express app
- Verifies response status codes and body format
- Tests validation middleware integration

**Middleware Test** (`src/__tests__/middleware/auth.test.ts`):
- Creates mock Request/Response objects
- Tests authentication flow with various token states
- Verifies next() is called on success
- Verifies correct status codes on failure

**Integration Test** (`src/__tests__/integration/auth.test.ts`):
- Sets up full Express app with controllers
- Mocks only external services (UserService)
- Tests complete user flows (register -> login -> protected route)
- Verifies token validation and user attachment to request

**Route Test** (`src/__tests__/routes/uploads.test.ts`):
- Tests file upload middleware chain
- Verifies Multer error handling
- Tests authenticated upload endpoints

**Validation Test** (`src/__tests__/validation/reviewValidation.test.ts`):
- Tests Zod schema validation
- Verifies error messages for invalid inputs
- Tests field constraints (min/max, regex patterns)

## Testing Best Practices Observed

1. **Isolated Dependencies:** All external dependencies are mocked
2. **Clear Test Names:** Test descriptions clearly state what is being tested
3. **Single Responsibility:** Each test validates one behavior
4. **Arrange-Act-Assert:** Clear test structure
5. **Reusable Mocks:** Mock data defined at suite level, reused across tests
6. **Error Path Testing:** Both success and error scenarios tested
7. **Type Safety:** Mock types properly declared with `jest.Mocked<T>`
8. **Setup/Teardown:** Consistent use of beforeEach for state reset

---

*Testing analysis: 2026-02-02*
