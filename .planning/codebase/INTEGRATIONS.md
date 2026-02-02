# External Integrations

**Analysis Date:** 2026-02-02

## APIs & External Services

**Venue Discovery & Mapping:**
- Foursquare Places API - Venue search, place information, and photo data
  - SDK/Client: `axios` HTTP client
  - Endpoint: `https://places-api.foursquare.com`
  - Auth: `FOURSQUARE_API_KEY` environment variable
  - Implementation: `backend/src/services/FoursquareService.ts`
  - Usage: Search venues by location, retrieve venue details, link to Foursquare place IDs

- SetlistFM API - Band setlist and performance history data
  - SDK/Client: `axios` HTTP client
  - Endpoint: `https://api.setlist.fm/rest/1.0`
  - Auth: `SETLISTFM_API_KEY` environment variable
  - Implementation: `backend/src/services/SetlistFmService.ts`
  - Usage: Search venues and artists, retrieve setlist history by date/venue

- MusicBrainz API - Band metadata and discography information
  - SDK/Client: `axios` HTTP client
  - Endpoint: `https://musicbrainz.org/ws/2`
  - Auth: None required (user-agent header required)
  - Implementation: `backend/src/services/MusicBrainzService.ts`
  - Usage: Search for artists, retrieve band details and release information

## Data Storage

**Primary Database:**
- PostgreSQL 12+
  - Connection: `DATABASE_URL` (Railway/Heroku format) OR individual `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` variables
  - Client: `pg` 8.16.3 (node-postgres)
  - Config: `backend/src/config/database.ts`
  - SSL Support: Configurable via `DB_SSL` environment variable (default: verify with rejectUnauthorized: true)
  - Connection Pool: Max 20 clients, 30s idle timeout, 2s connection timeout
  - Schema: Defined in `backend/database-schema.sql` (users, venues, bands, check-ins, reviews, badges, events, etc.)

**Caching & Rate Limiting:**
- Redis (optional)
  - Connection: `REDIS_URL` environment variable
  - Client: `ioredis` 5.9.0
  - Fallback: In-memory rate limiting if Redis not configured
  - Purpose: Distributed rate limiting using sliding window algorithm, session caching across multiple server instances
  - Config: `backend/src/utils/redisRateLimiter.ts`

**File Storage:**
- Local filesystem only (uploaded files stored in `backend/uploads/` directory)
  - Access: Requires JWT authentication via `/api/uploads` routes
  - Multer integration: `backend/src/routes/uploadsRoutes.ts`
  - Supported: Image uploads for user profiles, band photos, venue photos

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `backend/src/utils/auth.ts`
  - Token generation: `AuthUtils.generateToken()`
  - Token verification: `AuthUtils.verifyToken()`
  - Secret: `JWT_SECRET` environment variable (minimum 32 characters)
  - Expiration: `JWT_EXPIRES_IN` environment variable (default: 7d)
  - Issuer: "soundcheck-api"
  - Audience: "soundcheck-mobile"
  - Password hashing: bcryptjs (12 salt rounds)

**Social Authentication:**
- Google Sign-In
  - SDK: `google-auth-library` 10.5.0 (backend), `google_sign_in` 7.2.0 (mobile)
  - Implementation: `backend/src/services/SocialAuthService.ts`
  - Route: `POST /api/auth/social/google`
  - Flow: Mobile client sends ID token → Server verifies with Google → Creates/links user account
  - Config: `GOOGLE_CLIENT_ID` environment variable (mobile client ID)
  - Token verification: Validates with Google's public keys, checks email_verified flag

- Apple Sign-In
  - SDK: `apple-signin-auth` 2.0.0 (backend), `sign_in_with_apple` 7.0.1 (mobile)
  - Implementation: `backend/src/services/SocialAuthService.ts`
  - Route: `POST /api/auth/social/apple`
  - Flow: Mobile client sends identity token → Server verifies token signature → Creates/links user account
  - Token verification: Validates against Apple's public keys
  - Full name: Only provided on first sign-in, stored in user profile

**Authorization:**
- JWT-based middleware
  - Implementation: `backend/src/middleware/auth.ts`
  - Protected routes require Authorization header: `Bearer <jwt_token>`
  - Rate limiting: Configurable per endpoint (e.g., 5 Google auth attempts per 15 minutes)

**Secure Storage (Mobile):**
- Flutter Secure Storage
  - Package: `flutter_secure_storage` 10.0.0
  - Usage: Stores JWT tokens and refresh tokens securely on device
  - Implementation: Uses platform-specific secure storage (Keychain on iOS, Keystore on Android)

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional)
  - SDK: `@sentry/node` 10.32.1 (backend), `sentry_flutter` 9.9.2 (mobile)
  - Config: `SENTRY_DSN` environment variable
  - Initialization: Early in startup before other imports
  - Sampling: 10% trace sample rate in production, 100% in development
  - Sensitive data scrubbing: Authorization headers, cookies, API keys removed before sending
  - Implementation: `backend/src/utils/sentry.ts`
  - Graceful shutdown: Waits up to 2s for pending events

**Logs:**
- Winston structured logging
  - Package: `winston` 3.18.3, `winston-daily-rotate-file` 5.0.0
  - Implementation: `backend/src/utils/logger.ts`
  - Development: Console output with color formatting and timestamps
  - Production: Daily-rotating file logs with JSON format
  - Levels: error, warn, info, http, debug
  - Log location: Production logs rotate daily in logs directory
  - Integration: HTTP middleware logs all requests, error handler logs all errors with context
  - Sanitization: Sensitive data sanitized before logging via `backend/src/utils/logSanitizer.ts`

**WebSocket Real-Time Monitoring:**
- Connection stats available via WebSocket server
  - Implementation: `backend/src/utils/websocket.ts`
  - Health check endpoint returns WebSocket connection count and status
  - Heartbeat mechanism detects stale connections
  - Rate limiting per WebSocket client (configurable message rate)

## CI/CD & Deployment

**Hosting:**
- Railway.app - Primary deployment platform (specified in `backend/railway.json` and `nixpacks.toml`)
- Alternative: Vercel (configuration in `backend/vercel.json`)

**Build Pipeline:**
- Nixpacks - Build configuration in `nixpacks.toml`
  - Node.js 20 environment
  - Install phase: `npm ci --production=false` in backend directory
  - Build phase: TypeScript compilation with `npm run build`
  - Start command: `node dist/index.js` in backend directory

**Database Migrations:**
- Custom migration scripts
  - `backend/src/scripts/migrate.ts` - Main migration runner
  - `backend/src/scripts/migrate-events-model.ts` - Events table migration
  - Executed with: `npm run migrate` or `npm run migrate:events`
  - Format: SQL migrations run with `ts-node`

**Data Seeding:**
- Seed scripts for development
  - `backend/src/scripts/seed.ts` - Development seed data
  - Executed with: `npm run seed` or `npm run seed:dev` (development environment)
  - Purpose: Populate test venues, bands, users for development

**Retention Jobs:**
- Automated data retention management
  - `backend/src/scripts/retentionJob.ts` - Archive/delete old data
  - Executed with: `npm run retention-job`

## Environment Configuration

**Required Environment Variables:**
- `JWT_SECRET` - JWT signing secret (minimum 32 characters)
- `DATABASE_URL` OR (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) - Database connection
- `NODE_ENV` - Execution environment (development|production, default: development)
- `PORT` - Server port (default: 3000)
- `ENABLE_WEBSOCKET` - Enable WebSocket server (true|false, default: false)

**Optional Environment Variables:**
- `SENTRY_DSN` - Sentry error tracking endpoint
- `REDIS_URL` - Redis connection string (falls back to in-memory rate limiting)
- `FOURSQUARE_API_KEY` - Foursquare Places API key
- `SETLISTFM_API_KEY` - SetlistFM API key
- `GOOGLE_CLIENT_ID` - Google OAuth2 client ID (mobile app)
- `CORS_ORIGIN` - CORS allowed origins (comma-separated, default: allow all in dev, require explicit in prod)
- `DB_SSL` - Database SSL mode (default: verify with rejectUnauthorized: true, options: false, no-verify, default)
- `JWT_EXPIRES_IN` - JWT expiration time (default: 7d, format: e.g., "24h", "7d")

**Secrets Location:**
- Development: `backend/.env` file (git-ignored)
- Production: Environment variables injected by Railway.app
- Example template: `backend/.env.example` documents all available variables

## Webhooks & Callbacks

**Incoming:**
- Not implemented - API is REST/WebSocket based

**Outgoing:**
- Not implemented - No external webhook callbacks configured

**WebSocket Events (Real-Time):**
- Implementation: `backend/src/utils/websocket.ts`
- Features: Real-time event notifications, live check-in updates, typing indicators, online status
- Client authentication: JWT token validation on WebSocket connection
- Room-based messaging: Users can join rooms for venue-specific updates (e.g., `venue:123`)
- Rate limiting: Per-client message rate limiting to prevent abuse
- Graceful shutdown: Closes all connections on server shutdown

---

*Integration audit: 2026-02-02*
