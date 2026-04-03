"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file (development only)
// In production (Railway, etc.), environment variables are injected directly
// IMPORTANT: This must be done BEFORE any other imports that use env vars
if (process.env.NODE_ENV !== 'production') {
    dotenv_1.default.config();
}
// Initialize Sentry EARLY, before other imports that might throw errors
const sentry_1 = require("./utils/sentry");
(0, sentry_1.initSentry)();
// Initialize Redis for distributed rate limiting and caching
const redisRateLimiter_1 = require("./utils/redisRateLimiter");
(0, redisRateLimiter_1.initRedis)();
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const venueRoutes_1 = __importDefault(require("./routes/venueRoutes"));
const bandRoutes_1 = __importDefault(require("./routes/bandRoutes"));
const badgeRoutes_1 = __importDefault(require("./routes/badgeRoutes"));
const discoveryRoutes_1 = __importDefault(require("./routes/discoveryRoutes"));
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const checkinRoutes_1 = __importDefault(require("./routes/checkinRoutes"));
const feedRoutes_1 = __importDefault(require("./routes/feedRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const followRoutes_1 = __importDefault(require("./routes/followRoutes"));
const wishlistRoutes_1 = __importDefault(require("./routes/wishlistRoutes"));
const uploadsRoutes_1 = __importDefault(require("./routes/uploadsRoutes"));
const tokenRoutes_1 = __importDefault(require("./routes/tokenRoutes"));
const dataExportRoutes_1 = __importDefault(require("./routes/dataExportRoutes"));
const consentRoutes_1 = __importDefault(require("./routes/consentRoutes"));
const socialAuthRoutes_1 = __importDefault(require("./routes/socialAuthRoutes"));
const searchRoutes_1 = __importDefault(require("./routes/searchRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const moderationRoutes_1 = __importDefault(require("./routes/moderationRoutes"));
const passwordResetRoutes_1 = __importDefault(require("./routes/passwordResetRoutes"));
const blockRoutes_1 = __importDefault(require("./routes/blockRoutes"));
const rsvpRoutes_1 = __importDefault(require("./routes/rsvpRoutes"));
const trendingRoutes_1 = __importDefault(require("./routes/trendingRoutes"));
const onboardingRoutes_1 = __importDefault(require("./routes/onboardingRoutes"));
const shareRoutes_1 = __importDefault(require("./routes/shareRoutes"));
const claimRoutes_1 = __importDefault(require("./routes/claimRoutes"));
const wrappedRoutes_1 = __importDefault(require("./routes/wrappedRoutes"));
const subscriptionRoutes_1 = __importDefault(require("./routes/subscriptionRoutes"));
const database_1 = __importDefault(require("./config/database"));
const logger_1 = require("./utils/logger");
const websocket_1 = require("./utils/websocket");
const eventSyncWorker_1 = require("./jobs/eventSyncWorker");
const badgeWorker_1 = require("./jobs/badgeWorker");
const notificationWorker_1 = require("./jobs/notificationWorker");
const moderationWorker_1 = require("./jobs/moderationWorker");
const syncScheduler_1 = require("./jobs/syncScheduler");
const badgeQueue_1 = require("./jobs/badgeQueue");
const notificationQueue_1 = require("./jobs/notificationQueue");
const moderationQueue_1 = require("./jobs/moderationQueue");
const queue_1 = require("./jobs/queue");
const fs_1 = require("fs");
const path_1 = require("path");
const auth_1 = require("./middleware/auth");
// Read package version for health endpoint
const packageJson = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../package.json'), 'utf-8'));
const APP_VERSION = packageJson.version;
// Validate required environment variables
// DB_PASSWORD is only required if DATABASE_URL is not set (Railway provides DATABASE_URL)
const requiredEnvVars = ['JWT_SECRET'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        (0, logger_1.logError)(`FATAL: Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}
// Validate database configuration - need either DATABASE_URL or DB_PASSWORD
if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    (0, logger_1.logError)('FATAL: Missing database configuration. Set either DATABASE_URL or DB_PASSWORD');
    process.exit(1);
}
const app = (0, express_1.default)();
// Trust first proxy hop (Railway reverse proxy) so req.ip returns real client IP
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            scriptSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
}));
// CORS configuration - Allow mobile apps and web clients
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin)
            return callback(null, true);
        // In development, allow all origins
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        // In production, require explicit CORS_ORIGIN configuration
        const corsOrigin = process.env.CORS_ORIGIN;
        if (!corsOrigin) {
            (0, logger_1.logError)('CORS: CORS_ORIGIN not configured, rejecting request from:', { origin });
            return callback(new Error('CORS not configured'), false);
        }
        if (corsOrigin === '*') {
            if (process.env.NODE_ENV === 'production') {
                (0, logger_1.logError)('CORS: Wildcard origin not allowed in production');
                return callback(new Error('Wildcard CORS not allowed in production'), false);
            }
            return callback(null, true);
        }
        const allowedOrigins = corsOrigin.split(',').map((o) => o.trim());
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        // Reject unknown origins in production
        (0, logger_1.logWarn)('CORS: Rejected origin:', { origin });
        callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
};
app.use((0, cors_1.default)(corsOptions));
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Authenticated file serving for uploads (security: requires JWT)
// Note: Static serving removed to prevent unauthorized access to user uploads
app.use('/api/uploads', uploadsRoutes_1.default);
// Request logging middleware
app.use((req, res, next) => {
    (0, logger_1.logHttp)(`${req.method} ${req.path}`);
    next();
});
// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const db = database_1.default.getInstance();
        const dbHealth = await db.healthCheck();
        const poolMetrics = db.getPoolMetrics();
        const wsStats = (0, websocket_1.getWebSocketStats)();
        // Determine overall health status
        // Degraded if: DB unhealthy OR too many waiting clients (indicates pool exhaustion)
        const isPoolExhausted = poolMetrics.waitingCount > 10;
        const isDegraded = !dbHealth.healthy || isPoolExhausted;
        const status = isDegraded ? (dbHealth.healthy ? 'degraded' : 'unhealthy') : 'healthy';
        const statusCode = dbHealth.healthy ? (isDegraded ? 503 : 200) : 503;
        const response = {
            success: dbHealth.healthy,
            data: {
                status,
                timestamp: new Date().toISOString(),
                version: APP_VERSION,
                database: {
                    status: dbHealth.healthy ? 'connected' : 'disconnected',
                    error: dbHealth.error,
                    pool: poolMetrics,
                },
                websocket: {
                    enabled: process.env.ENABLE_WEBSOCKET === 'true',
                    ...wsStats,
                },
            },
        };
        res.status(statusCode).json(response);
    }
    catch (error) {
        const response = {
            success: false,
            error: 'Health check failed',
        };
        res.status(503).json(response);
    }
});
// Queue health/monitoring endpoint
app.get('/health/queues', async (req, res) => {
    try {
        const queueMetrics = await Promise.all([
            badgeQueue_1.badgeEvalQueue?.getJobCounts().then((counts) => ({ queue: 'badge-eval', ...counts })) ??
                Promise.resolve({ queue: 'badge-eval', status: 'disabled' }),
            notificationQueue_1.notificationQueue?.getJobCounts().then((counts) => ({ queue: 'notification-batch', ...counts })) ??
                Promise.resolve({ queue: 'notification-batch', status: 'disabled' }),
            moderationQueue_1.moderationQueue?.getJobCounts().then((counts) => ({ queue: 'image-moderation', ...counts })) ??
                Promise.resolve({ queue: 'image-moderation', status: 'disabled' }),
            queue_1.eventSyncQueue?.getJobCounts().then((counts) => ({ queue: 'event-sync', ...counts })) ??
                Promise.resolve({ queue: 'event-sync', status: 'disabled' }),
        ]);
        const response = {
            success: true,
            data: {
                timestamp: new Date().toISOString(),
                queues: queueMetrics,
            },
        };
        res.status(200).json(response);
    }
    catch (error) {
        const response = {
            success: false,
            error: 'Queue health check failed',
        };
        res.status(503).json(response);
    }
});
// API routes
app.use('/api/users', userRoutes_1.default);
app.use('/api/venues', venueRoutes_1.default);
app.use('/api/bands', bandRoutes_1.default);
app.use('/api/badges', badgeRoutes_1.default);
app.use('/api/discover', discoveryRoutes_1.default);
app.use('/api/events', eventRoutes_1.default);
app.use('/api/checkins', checkinRoutes_1.default);
app.use('/api/feed', feedRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/follow', followRoutes_1.default);
app.use('/api/wishlist', wishlistRoutes_1.default);
app.use('/api/tokens', tokenRoutes_1.default);
app.use('/api/users', dataExportRoutes_1.default);
app.use('/api/users/consents', consentRoutes_1.default);
app.use('/api/auth/social', socialAuthRoutes_1.default);
app.use('/api/search', searchRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
app.use('/api/admin/moderation', moderationRoutes_1.default);
app.use('/api/auth', passwordResetRoutes_1.default);
app.use('/api/blocks', blockRoutes_1.default);
app.use('/api/rsvp', rsvpRoutes_1.default);
app.use('/api/trending', trendingRoutes_1.default);
app.use('/api/onboarding', onboardingRoutes_1.default);
app.use('/api/share', shareRoutes_1.default.api);
app.use('/api/claims', claimRoutes_1.default.public);
app.use('/api/admin/claims', claimRoutes_1.default.admin);
app.use('/api/wrapped', wrappedRoutes_1.default.api);
app.use('/api/subscription', subscriptionRoutes_1.default);
// Public share landing pages (no auth, not under /api/)
app.use('/share', shareRoutes_1.default.public);
app.use('/wrapped', wrappedRoutes_1.default.public);
// Root endpoint
app.get('/', (req, res) => {
    const response = {
        success: true,
        data: {
            message: 'SoundCheck API Server',
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
        },
    };
    res.json(response);
});
// Debug: Sentry test route (admin-only) — throws intentional error for verification
app.get('/api/debug/sentry-test', auth_1.authenticateToken, (0, auth_1.requireAdmin)(), (req, res) => {
    throw new Error('Sentry test error — this is intentional');
});
// 404 handler
app.use('*', (req, res) => {
    const response = {
        success: false,
        error: `Route ${req.originalUrl} not found`,
    };
    res.status(404).json(response);
});
// Setup Sentry Express error handler - must be before other error handlers
// Uses Sentry SDK v10+ API: setupExpressErrorHandler(app)
(0, sentry_1.setupSentryForExpress)(app);
// Global error handler - catches ALL errors including async
app.use((error, req, res, next) => {
    // Determine status code
    const statusCode = error.statusCode || error.status || 500;
    // Log error with context
    (0, logger_1.logError)(`${error.message} | Path: ${req.path} | Method: ${req.method} | Status: ${statusCode}`, {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        statusCode,
        userId: req.user?.id,
    });
    // Send to Sentry for server errors (5xx)
    if (statusCode >= 500) {
        (0, sentry_1.captureException)(error, {
            path: req.path,
            method: req.method,
            statusCode,
            userId: req.user?.id,
        });
    }
    // Build response
    const response = {
        success: false,
        error: process.env.NODE_ENV === 'development'
            ? error.message
            : statusCode >= 500
                ? 'Internal server error'
                : error.message || 'Request failed',
    };
    // Include stack trace only in development
    if (process.env.NODE_ENV === 'development' && error.stack) {
        response.stack = error.stack;
    }
    res.status(statusCode).json(response);
});
// Create HTTP server
const server = (0, http_1.createServer)(app);
// BullMQ worker references (for graceful shutdown)
let syncWorker = null;
let badgeWorker = null;
let notifWorker = null;
let modWorker = null;
// Start server
const startServer = async () => {
    try {
        // Log environment info (without exposing sensitive data)
        (0, logger_1.logInfo)(`Environment: ${process.env.NODE_ENV || 'development'}`);
        (0, logger_1.logInfo)(`DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
        (0, logger_1.logInfo)(`DB_HOST present: ${!!process.env.DB_HOST}`);
        // Test database connection
        const db = database_1.default.getInstance();
        const isDbHealthy = await db.healthCheck();
        if (!isDbHealthy) {
            (0, logger_1.logError)('Database connection failed. Please check your database configuration.');
            process.exit(1);
        }
        (0, logger_1.logInfo)('Database connection established');
        // Warn about CORS configuration in production
        if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
            (0, logger_1.logWarn)('CORS_ORIGIN not set - browser-origin requests will be REJECTED. Mobile (no-origin) requests still allowed. Set CORS_ORIGIN to enable web clients.');
        }
        // Initialize WebSocket server
        (0, websocket_1.initWebSocket)(server);
        server.listen(PORT, () => {
            (0, logger_1.logInfo)(`SoundCheck API Server running on port ${PORT}`);
            (0, logger_1.logInfo)(`Health check: http://localhost:${PORT}/health`);
            (0, logger_1.logInfo)(`Environment: ${process.env.NODE_ENV || 'development'}`);
            if (process.env.NODE_ENV === 'development') {
                (0, logger_1.logInfo)(`API Documentation: http://localhost:${PORT}/`);
            }
        });
        // Start BullMQ workers and register scheduled jobs
        // Guarded by REDIS_URL -- returns null if Redis is not available
        syncWorker = (0, eventSyncWorker_1.startEventSyncWorker)();
        badgeWorker = (0, badgeWorker_1.startBadgeEvalWorker)();
        notifWorker = (0, notificationWorker_1.startNotificationWorker)();
        modWorker = (0, moderationWorker_1.startModerationWorker)();
        (0, syncScheduler_1.registerSyncJobs)().catch((err) => (0, logger_1.logError)('Failed to register sync jobs', { error: err.message || err }));
    }
    catch (error) {
        (0, logger_1.logError)('Failed to start server', { error });
        process.exit(1);
    }
};
// Handle graceful shutdown
process.on('SIGTERM', async () => {
    (0, logger_1.logInfo)('SIGTERM received, shutting down gracefully');
    if (syncWorker)
        await (0, eventSyncWorker_1.stopEventSyncWorker)(syncWorker);
    if (badgeWorker)
        await (0, badgeWorker_1.stopBadgeEvalWorker)(badgeWorker);
    if (notifWorker)
        await (0, notificationWorker_1.stopNotificationWorker)(notifWorker);
    if (modWorker)
        await (0, moderationWorker_1.stopModerationWorker)(modWorker);
    await (0, sentry_1.closeSentry)(2000); // Wait up to 2s for pending Sentry events
    await (0, redisRateLimiter_1.closeRedis)();
    websocket_1.websocket.close();
    const db = database_1.default.getInstance();
    await db.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    (0, logger_1.logInfo)('SIGINT received, shutting down gracefully');
    if (syncWorker)
        await (0, eventSyncWorker_1.stopEventSyncWorker)(syncWorker);
    if (badgeWorker)
        await (0, badgeWorker_1.stopBadgeEvalWorker)(badgeWorker);
    if (notifWorker)
        await (0, notificationWorker_1.stopNotificationWorker)(notifWorker);
    if (modWorker)
        await (0, moderationWorker_1.stopModerationWorker)(modWorker);
    await (0, sentry_1.closeSentry)(2000); // Wait up to 2s for pending Sentry events
    await (0, redisRateLimiter_1.closeRedis)();
    websocket_1.websocket.close();
    const db = database_1.default.getInstance();
    await db.close();
    process.exit(0);
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    (0, logger_1.logError)('Uncaught Exception', { error });
    (0, sentry_1.captureException)(error, { type: 'uncaughtException' });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    // INF-012: Log and report but do NOT exit the process.
    // Unhandled rejections are often transient (e.g., a failed fire-and-forget
    // cache invalidation). Exiting burns through restartPolicyMaxRetries and
    // can take the service down permanently.
    (0, logger_1.logError)('Unhandled Rejection', { reason, promise });
    if (reason instanceof Error) {
        (0, sentry_1.captureException)(reason, { type: 'unhandledRejection' });
    }
});
startServer();
//# sourceMappingURL=index.js.map