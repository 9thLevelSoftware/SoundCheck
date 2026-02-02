# Codebase Concerns

**Analysis Date:** 2026-02-02

## Tech Debt

**Large Service Classes:**
- Issue: CheckinService (698 lines) and ReviewService (528 lines) have multiple responsibilities and handle business logic, database queries, and WebSocket communication together
- Files: `backend/src/services/CheckinService.ts`, `backend/src/services/ReviewService.ts`
- Impact: Difficult to test, maintain, and extend. Single change affects multiple concerns. Services violate single responsibility principle.
- Fix approach: Split into smaller services: separate query/persistence layer, business logic layer, and notification layer. Consider repository pattern for database operations.

**Type Safety Issues:**
- Issue: Widespread use of `as any` type assertions, particularly in tests and middleware for accessing user context
- Files: `backend/src/controllers/CheckinController.ts`, `backend/src/middleware/perUserRateLimit.ts`, `backend/src/index.ts`, `backend/src/__tests__/utils/websocket.test.ts`
- Impact: Loss of TypeScript benefits, potential runtime errors, increased debugging difficulty
- Fix approach: Create proper typed interfaces for request context (e.g., `AuthenticatedRequest` extends `Request` with typed `user` property). Remove all `as any` and replace with proper typing.

**In-Memory Rate Limiting:**
- Issue: Simple in-memory rate limit implementation in `auth.ts` (lines 160-191) lacks persistence and doesn't work in distributed environments
- Files: `backend/src/middleware/auth.ts` (lines 162-191)
- Impact: Rate limiting is ineffective with load balancers, can cause memory leaks on long-running servers without proper cleanup
- Fix approach: The codebase already has Redis support via `redisRateLimiter.ts`. Switch all rate limiting to use Redis backend instead of in-memory Map. Ensure cleanup is called periodically.

**Fire-and-Forget Async Operations:**
- Issue: Non-blocking async calls without error handling for critical updates (e.g., rating updates, badge awards)
- Files: `backend/src/services/CheckinService.ts` (lines 125-130), `backend/src/services/ReviewService.ts` (lines 87-89)
- Impact: Failed updates silently ignored, data inconsistency not detected, users see stale ratings/badges
- Fix approach: Log errors to monitoring system (Sentry already configured), implement retry queue, or make async operations blocking for critical operations.

## Known Bugs

**Query Parameter Index Calculation Bug (Potential):**
- Issue: Dynamic parameter indexing in `CheckinService.getActivityFeed()` calculates LIMIT/OFFSET indices based on variable number of WHERE conditions
- Files: `backend/src/services/CheckinService.ts` (lines 229-231, 256)
- Trigger: Nearby filter with dynamic latitude/longitude creates condition where parameter count varies
- Workaround: Currently works but fragile - any change to condition count will break queries
- Fix: Use named parameters or parameterize LIMIT/OFFSET separately from WHERE clause

**Haversine Formula Implementation:**
- Issue: Haversine formula in `getActivityFeed()` uses 64.4km (40 mile) constant without clear documentation on why specific value chosen
- Files: `backend/src/services/CheckinService.ts` (lines 209-217)
- Cause: Magic number without justification
- Fix: Extract to configuration constant with explanation

**Delete Cascade Assumptions:**
- Issue: Checkin deletion assumes cascading deletes are configured at database level (line 417: "cascades to toasts and comments") but no verification in code
- Files: `backend/src/services/CheckinService.ts` (line 417)
- Trigger: If database schema changes to remove CASCADE constraint, orphaned records remain
- Fix: Add explicit deletes for dependent records before deleting checkin

## Security Considerations

**Unvalidated Sort/Order Parameters:**
- Risk: Sort column validation in `VenueService` is restrictive (good), but if new sortable columns are added, risk of missing validation increases
- Files: `backend/src/services/VenueService.ts` (lines 136-138)
- Current mitigation: Whitelist-based validation of sort columns and hardcoded order direction
- Recommendations: Maintain strict whitelist, add tests for sort validation, consider using enum for allowed columns

**Rate Limit Bypass Potential:**
- Risk: WebSocket connections bypass Express middleware rate limiting entirely
- Files: `backend/src/utils/websocket.ts` (lines 108-118)
- Current mitigation: WebSocket has its own rate limiting (100 messages per 10 seconds), but disconnected from per-user limits
- Recommendations: Integrate WebSocket rate limiting with per-user rate limiter in `redisRateLimiter.ts`

**Placeholder Password for Social Auth:**
- Risk: Social auth users created with `PLACEHOLDER_PASSWORD` constant that could be used for password reset exploits if social-only auth not properly enforced
- Files: `backend/src/services/SocialAuthService.ts` (lines 10, 286-288)
- Current mitigation: Auth flow validation in social auth handlers, users created through social providers only
- Recommendations: Add database constraint preventing password reset for social-only users, add logging for password reset attempts on social accounts

**Token Verification Chain Missing:**
- Risk: JWT token verification relies on single-point-of-failure validation without backup verification in sensitive operations
- Files: `backend/src/middleware/auth.ts` (lines 31-39)
- Current mitigation: UserService checks if user still exists and is active (lines 43-52)
- Recommendations: Add audit logging for failed auth attempts, implement token blacklist for logout, set reasonable token expiration (already using 7 days via config)

**Missing Input Sanitization for Search:**
- Risk: Search queries use ILIKE with percentage wildcards directly from user input, potential for ReDoS with special regex characters
- Files: `backend/src/services/VenueService.ts` (lines 108-110)
- Current mitigation: PostgreSQL parameterized queries prevent SQL injection
- Recommendations: Add input length validation (max 100 chars for search), consider using full-text search with trigram indexes for performance and safety

## Performance Bottlenecks

**Large Complex Queries with Multiple Joins:**
- Problem: `getCheckinById()` and `getActivityFeed()` use LEFT JOINs with COUNT aggregates that run for every checkin retrieved
- Files: `backend/src/services/CheckinService.ts` (lines 145-167, 233-256)
- Cause: Aggregating toast and comment counts in main query instead of separate queries or caching
- Improvement path:
  1. Separate toast/comment counts to second query, cache results (Redis with 5-min TTL)
  2. Add database indexes on `toasts(checkin_id)` and `checkin_comments(checkin_id)`
  3. Consider materialized view for activity feed with pre-computed counts

**N+1 Potential in Feed Generation:**
- Problem: Activity feed retrieves user, venue, and band objects for every row, potential for N+1 if refactored
- Files: `backend/src/services/CheckinService.ts` (lines 234-246)
- Cause: Architecture joins everything in single query (currently good), but if changed to separate queries per checkin would be N+1
- Improvement path: Maintain single query approach, consider batch loading if pagination changes

**WebSocket Memory Leaks:**
- Problem: Heartbeat mechanism pings clients but doesn't remove unresponsive clients from memory
- Files: `backend/src/utils/websocket.ts` (lines 98-101, 225-245 likely continues but not visible)
- Cause: Clients marked `isAlive = false` but never removed from `clients` Map
- Improvement path: Add cleanup logic in heartbeat to remove dead clients, implement max client limit per user, add memory monitoring

**Database Connection Pool Configuration:**
- Problem: Fixed pool size of 20 may be insufficient under load or wasteful during idle periods
- Files: `backend/src/config/database.ts` (lines 63, 83)
- Cause: Static configuration doesn't adapt to usage patterns
- Improvement path: Monitor pool utilization in production, adjust `max` based on expected concurrent requests, implement adaptive connection pooling

## Fragile Areas

**Validation Middleware:**
- Files: `backend/src/middleware/validate.ts`
- Why fragile: All validation depends on Zod schema setup in routes. If routes don't use validation middleware, endpoints become unprotected. No global validation enforcer.
- Safe modification: When adding routes, verify validation middleware is applied with appropriate schema. Add linting rule to enforce validation middleware usage.
- Test coverage: Validation tests exist in `validate.test.ts` but need to verify integration with routes

**Authentication Middleware Chain:**
- Files: `backend/src/middleware/auth.ts`, `backend/src/utils/auth.ts`
- Why fragile: Multiple authentication paths (JWT, social auth, optional auth). If optional auth is used on sensitive endpoints accidentally, security compromised. UserService instantiated fresh on every auth check (line 42).
- Safe modification: Document which endpoints use which auth strategy, create integration tests for each strategy
- Test coverage: `auth.test.ts` covers basic flows but missing edge cases (user deactivation during request, token expiration during processing)

**WebSocket Integration:**
- Files: `backend/src/utils/websocket.ts`, `backend/src/index.ts` (lines 43, 44)
- Why fragile: WebSocket is optional (disabled by default), but if enabled without proper error handling, crashes server. Hardcoded rate limits not coordinated with HTTP rate limits.
- Safe modification: Always test with `ENABLE_WEBSOCKET=true` before deployment, add e2e tests for WebSocket flows, monitor WebSocket connection errors
- Test coverage: `websocket.test.ts` exists but only tests internal message handling, not integration with HTTP server

**Database Migration Scripts:**
- Files: `backend/src/scripts/migrate.ts`, `backend/src/scripts/migrate-events-model.ts`
- Why fragile: Migration scripts appear ad-hoc and not using standard ORM migration system. Hard to track which migrations have run.
- Safe modification: Don't manually edit migration scripts. If schema needs change, create new migration file with timestamp. Implement migration tracking table.
- Test coverage: No tests for migration scripts, risk of data loss in production

## Scaling Limits

**In-Memory Client Tracking:**
- Current capacity: WebSocket clients stored in Map, limited by single Node.js process memory
- Limit: Breaks with multiple server instances (horizontal scaling). Each instance maintains separate client lists.
- Scaling path: Move client/room registry to Redis. Implement pub/sub for cross-instance messaging. Use sticky sessions with load balancer if can't use Redis.

**Rate Limiter Storage:**
- Current capacity: Redis-backed rate limiter configured, but in-memory fallback exists in auth.ts
- Limit: Mixed storage backends could cause inconsistencies at scale
- Scaling path: Consolidate all rate limiting to Redis backend, remove in-memory storage

**Database Connection Pool:**
- Current capacity: Pool size 20 connections
- Limit: With multiple server instances, total DB connections = instances × 20. If many instances, connection pool exhaustion.
- Scaling path: Use connection pooler (PgBouncer), reduce pool size per instance, monitor real usage

**Activity Feed Query Performance:**
- Current capacity: Works fine for moderate user base with Haversine formula
- Limit: Complex geographic queries on large checkin tables (698+ lines of join logic) will become slow
- Scaling path: Pre-compute activity feeds incrementally, denormalize common queries, add full-text search indexes

## Dependencies at Risk

**Unspecified Package Versions:**
- Risk: `package.json` not shown, cannot determine if dependencies are outdated or have known vulnerabilities
- Impact: `google-auth-library`, `apple-signin-auth`, `ws` may have security patches pending
- Migration plan: Run `npm audit`, update vulnerable packages, pin exact versions in lockfile

**WebSocket Library Stability:**
- Risk: `ws` npm package is for native WebSocket support, but no fallback if library fails
- Impact: WebSocket feature completely disabled if package breaks, but not detected at startup
- Migration plan: Add library health check at startup, implement Socket.IO as alternative with better compatibility

**JWT Library Reliance:**
- Risk: Single JWT library for token generation/verification, no backup approach
- Impact: If JWT library has vulnerability, all authentication breaks
- Migration plan: Add JWT validation tests, consider implementing backup JWT verification logic

## Missing Critical Features

**Audit Logging:**
- Problem: No comprehensive audit logging for critical operations (deletions, access to sensitive data, permission changes)
- Blocks: GDPR compliance, incident investigation, fraud detection
- Files: No audit logging found in user/deletion operations

**Request Rate Limiting Per Resource:**
- Problem: Rate limiting by user/IP exists, but no protection against resource exhaustion (e.g., creating 10,000 wishlists)
- Blocks: Protection against bulk operations, API abuse prevention
- Files: Check-in, review, wishlist creation endpoints lack per-resource-type rate limits

**Data Encryption:**
- Problem: Sensitive user data (email, phone, location) stored in plaintext in database
- Blocks: Compliance with data protection regulations, reduced impact if database leaked
- Files: No encryption middleware found for sensitive fields

## Test Coverage Gaps

**Integration Tests for Auth Flows:**
- What's not tested: Social auth (Google/Apple) end-to-end with real token generation
- Files: `backend/src/__tests__/integration/auth.test.ts` - only basic JWT tests
- Risk: Social auth flow could fail in production undetected
- Priority: High

**WebSocket Integration:**
- What's not tested: WebSocket messages with real checkin updates, cross-client broadcasting
- Files: `backend/src/__tests__/utils/websocket.test.ts` - only isolated message handling
- Risk: WebSocket broadcasts could fail or leak data undetected
- Priority: High

**Edge Cases in Service Logic:**
- What's not tested: Concurrent modifications (e.g., two users deleting same checkin), race conditions in vote/toast operations
- Files: CheckinService, ReviewService lack concurrent scenario tests
- Risk: Data corruption under load, incorrect state transitions
- Priority: Medium

**Database Failover Scenarios:**
- What's not tested: Connection pool exhaustion, query timeouts, database unavailability
- Files: No tests for database error scenarios
- Risk: Unhandled database errors cascade to client errors
- Priority: Medium

**Input Validation Edge Cases:**
- What's not tested: Unicode in text fields, extremely long inputs, null/undefined in optional fields
- Files: `backend/src/__tests__/validation/reviewValidation.test.ts` exists but limited coverage
- Risk: Data validation bypasses, unexpected database constraint errors
- Priority: Medium

---

*Concerns audit: 2026-02-02*
