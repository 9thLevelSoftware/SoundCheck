import dotenv from 'dotenv';

// Load environment variables from .env file (development only)
// In production (Railway, etc.), environment variables are injected directly
// IMPORTANT: This must be done BEFORE any other imports that use env vars
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Initialize Sentry EARLY, before other imports that might throw errors
import {
  initSentry,
  setupSentryForExpress,
  closeSentry,
  captureException as sentryCaptureException,
} from './utils/sentry';
initSentry();

// Initialize Redis for distributed rate limiting and caching
import { initRedis, closeRedis, getRedis } from './utils/redisRateLimiter';
initRedis();

import express from 'express';
import { createServer } from 'http';
import { closeHttpServer, shutdownWithBudget } from './utils/shutdown';
import cors from 'cors';
import helmet from 'helmet';
import { corsOptions } from './config/cors';
import userRoutes from './routes/userRoutes';
import venueRoutes from './routes/venueRoutes';
import bandRoutes from './routes/bandRoutes';
import badgeRoutes from './routes/badgeRoutes';
import discoveryRoutes from './routes/discoveryRoutes';
import eventRoutes from './routes/eventRoutes';
import checkinRoutes from './routes/checkinRoutes';
import feedRoutes from './routes/feedRoutes';
import notificationRoutes from './routes/notificationRoutes';
import followRoutes from './routes/followRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import uploadsRoutes from './routes/uploadsRoutes';
import tokenRoutes from './routes/tokenRoutes';
import dataExportRoutes from './routes/dataExportRoutes';
import consentRoutes from './routes/consentRoutes';
import socialAuthRoutes from './routes/socialAuthRoutes';
import searchRoutes from './routes/searchRoutes';
import reportRoutes from './routes/reportRoutes';
import moderationRoutes from './routes/moderationRoutes';
import passwordResetRoutes from './routes/passwordResetRoutes';
import blockRoutes from './routes/blockRoutes';
import rsvpRoutes from './routes/rsvpRoutes';
import trendingRoutes from './routes/trendingRoutes';
import onboardingRoutes from './routes/onboardingRoutes';
import shareRoutes from './routes/shareRoutes';
import claimRoutes from './routes/claimRoutes';
import wrappedRoutes from './routes/wrappedRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import adminRoutes from './routes/adminRoutes';
import Database from './config/database';
import { ApiResponse } from './types';
import { logHttp, logInfo, logError, logWarn } from './utils/logger';
import { resolveOverallHealth, revenueCatWebhookHealth } from './utils/healthStatus';
import { initWebSocket, websocket, getWebSocketStats } from './utils/websocket';
import { startEventSyncWorker, stopEventSyncWorker } from './jobs/eventSyncWorker';
import { startBadgeEvalWorker, stopBadgeEvalWorker } from './jobs/badgeWorker';
import { startNotificationWorker, stopNotificationWorker } from './jobs/notificationWorker';
import { startModerationWorker, stopModerationWorker } from './jobs/moderationWorker';
import { registerSyncJobs } from './jobs/syncScheduler';
import { badgeEvalQueue } from './jobs/badgeQueue';
import { notificationQueue } from './jobs/notificationQueue';
import { moderationQueue } from './jobs/moderationQueue';
import { eventSyncQueue } from './jobs/queue';
import { Worker } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import { authenticateToken, requireAdmin } from './middleware/auth';
import { buildErrorResponseForStatus } from './middleware/validate';
import { startRuntime } from './startup';

// Read package version for health endpoint
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const APP_VERSION = packageJson.version;

type FeatureHealth = {
  status: 'healthy' | 'degraded' | 'disabled';
  redisBacked?: boolean;
  error?: string;
};

type QueueHealth = {
  queue: string;
  status: 'healthy' | 'degraded' | 'disabled';
  error?: string;
} & Record<string, unknown>;

type QueueHealthSource = {
  getJobCounts: () => Promise<Record<string, number>>;
};

const HEALTH_CHECK_TIMEOUT_MS = 5000;

async function withHealthTimeout<T>(operation: Promise<T>, name: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${name} health check timeout`)),
          HEALTH_CHECK_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function getQueueHealth(queue: QueueHealthSource | null, name: string): Promise<QueueHealth> {
  if (!queue) {
    return { queue: name, status: 'disabled' };
  }

  try {
    const counts = await withHealthTimeout(queue.getJobCounts(), name);
    return { queue: name, status: 'healthy', ...counts };
  } catch (error) {
    return {
      queue: name,
      status: 'degraded',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Validate required environment variables
// DB_PASSWORD is only required if DATABASE_URL is not set (Railway provides DATABASE_URL)
const requiredEnvVars = ['JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logError(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Validate database configuration - need either DATABASE_URL or DB_PASSWORD
if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
  logError('FATAL: Missing database configuration. Set either DATABASE_URL or DB_PASSWORD');
  process.exit(1);
}

const app = express();
// Trust first proxy hop (Railway reverse proxy) so req.ip returns real client IP
app.set('trust proxy', 1);
const rawPort = process.env.PORT || '3000';
const parsedPort = parseInt(rawPort, 10);
if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  logError(`FATAL: Invalid PORT "${rawPort}" — must be 1–65535`);
  process.exit(1);
}
const PORT = parsedPort;

// Security middleware
app.use(
  helmet({
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
  })
);

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Authenticated file serving for uploads (security: requires JWT)
// Note: Static serving removed to prevent unauthorized access to user uploads
app.use('/api/uploads', uploadsRoutes);

// Request logging middleware
app.use((req, res, next) => {
  logHttp(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const db = Database.getInstance();
    const dbHealth = await db.healthCheck();
    const poolMetrics = db.getPoolMetrics();
    const wsStats = getWebSocketStats();

    // Check Redis connectivity with 5-second timeout
    let redisHealth: { healthy: boolean; error?: string } = { healthy: false };
    try {
      const redis = getRedis();
      if (redis) {
        await Promise.race([
          redis.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis ping timeout')), 5000)
          ),
        ]);
        redisHealth = { healthy: true };
      } else {
        redisHealth = { healthy: false, error: 'Redis client not initialized' };
      }
    } catch (error) {
      redisHealth = {
        healthy: false,
        error: error instanceof Error ? error.message : 'Redis connection failed',
      };
    }

    // Check push notification service
    const pushNotificationHealth = {
      enabled: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? true : false,
      firebaseConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    };

    const queueMetrics = await Promise.all([
      getQueueHealth(badgeEvalQueue, 'badge-eval'),
      getQueueHealth(notificationQueue, 'notification-batch'),
      getQueueHealth(moderationQueue, 'image-moderation'),
      getQueueHealth(eventSyncQueue, 'event-sync'),
    ]);
    const queuesHealthy = queueMetrics.every(
      (queue) => queue.status === 'healthy' || queue.status === 'disabled'
    );
    const redisFeatureHealth: Record<string, FeatureHealth> = {
      cache: {
        status: redisHealth.healthy ? 'healthy' : 'degraded',
        redisBacked: redisHealth.healthy,
        error: redisHealth.error,
      },
      rateLimiting: {
        status: redisHealth.healthy ? 'healthy' : 'degraded',
        redisBacked: redisHealth.healthy,
        error: redisHealth.error,
      },
      pubSubRealtimeDelivery: {
        status:
          process.env.ENABLE_WEBSOCKET === 'true'
            ? redisHealth.healthy
              ? 'healthy'
              : 'degraded'
            : 'disabled',
        redisBacked: redisHealth.healthy,
        error: process.env.ENABLE_WEBSOCKET === 'true' ? redisHealth.error : undefined,
      },
      bullMqQueues: {
        status: queuesHealthy ? 'healthy' : 'degraded',
        redisBacked: queueMetrics.some((queue) => queue.status !== 'disabled'),
      },
      notificationBatching: {
        status: notificationQueue ? (redisHealth.healthy ? 'healthy' : 'degraded') : 'disabled',
        redisBacked: !!notificationQueue && redisHealth.healthy,
        error: notificationQueue ? redisHealth.error : undefined,
      },
    };
    const redisFeaturesHealthy = Object.values(redisFeatureHealth).every(
      (feature) => feature.status === 'healthy' || feature.status === 'disabled'
    );

    // B-INF-4: 503 only when Postgres is down; Redis down or webhook auth
    // missing → 200 with degraded status so the process is not restart-looped.
    const isPoolExhausted = poolMetrics.waitingCount > 10;
    const webhookAuth = revenueCatWebhookHealth();
    const overallHealth = resolveOverallHealth({
      databaseHealthy: dbHealth.healthy,
      redisFeaturesHealthy,
      poolExhausted: isPoolExhausted,
      webhookConfigured: webhookAuth.configured,
    });
    const status = overallHealth.status;
    const statusCode = overallHealth.httpStatus;

    const response: ApiResponse = {
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
        redis: {
          status: redisHealth.healthy ? 'connected' : 'disconnected',
          error: redisHealth.error,
        },
        redisBackedFeatures: redisFeatureHealth,
        queues: queueMetrics,
        pushNotifications: pushNotificationHealth,
        subscriptions: {
          webhookAuth,
        },
        websocket: {
          enabled: process.env.ENABLE_WEBSOCKET === 'true',
          ...wsStats,
        },
      },
    };

    res.status(statusCode).json(response);
  } catch (_error) {
    const response: ApiResponse = {
      success: false,
      error: 'Health check failed',
    };
    res.status(503).json(response);
  }
});

// Queue health/monitoring endpoint
app.get('/health/queues', async (req, res) => {
  const queueMetrics = await Promise.all([
    getQueueHealth(badgeEvalQueue, 'badge-eval'),
    getQueueHealth(notificationQueue, 'notification-batch'),
    getQueueHealth(moderationQueue, 'image-moderation'),
    getQueueHealth(eventSyncQueue, 'event-sync'),
  ]);
  const status = queueMetrics.some((queue) => queue.status === 'degraded') ? 'degraded' : 'healthy';

  const response: ApiResponse = {
    success: true,
    data: {
      status,
      timestamp: new Date().toISOString(),
      queues: queueMetrics,
    },
  };

  res.status(200).json(response);
});

// API routes
// Export and consent paths must be registered before userRoutes. That router
// ends with GET /:username, which would otherwise treat "export" and "consents" as usernames.
app.use('/api/users', dataExportRoutes);
app.use('/api/users/consents', consentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/bands', bandRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/discover', discoveryRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/auth/social', socialAuthRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin/moderation', moderationRoutes);
app.use('/api/auth', passwordResetRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/rsvp', rsvpRoutes);
app.use('/api/trending', trendingRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/share', shareRoutes.api);
app.use('/api/claims', claimRoutes.public);
app.use('/api/admin/claims', claimRoutes.admin);
app.use('/api/wrapped', wrappedRoutes.api);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);

// Public share landing pages (no auth, not under /api/)
app.use('/share', shareRoutes.public);
app.use('/wrapped', wrappedRoutes.public);

// Root endpoint
app.get('/', (req, res) => {
  const response: ApiResponse = {
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
app.get(
  '/api/debug/sentry-test',
  authenticateToken,
  requireAdmin(),
  (_req: express.Request, _res: express.Response) => {
    throw new Error('Sentry test error — this is intentional');
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json(buildErrorResponseForStatus(404, `Route ${req.originalUrl} not found`));
});

// Setup Sentry Express error handler - must be before other error handlers
// Uses Sentry SDK v10+ API: setupExpressErrorHandler(app)
setupSentryForExpress(app);

// Global error handler - catches ALL errors including async
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Determine status code
  const rawStatusCode = error.statusCode || error.status || 500;
  const statusCode = rawStatusCode >= 400 && rawStatusCode <= 599 ? rawStatusCode : 500;

  // Log error with context
  logError(`${error.message} | Path: ${req.path} | Method: ${req.method} | Status: ${statusCode}`, {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    statusCode,
    userId: req.user?.id,
  });

  // Send to Sentry for server errors (5xx)
  if (statusCode >= 500) {
    sentryCaptureException(error, {
      path: req.path,
      method: req.method,
      statusCode,
      userId: req.user?.id,
    });
  }

  // Build response
  const message =
    process.env.NODE_ENV === 'development'
      ? error.message
      : statusCode >= 500
        ? 'Internal server error'
        : error.message || 'Request failed';
  const response: ApiResponse = buildErrorResponseForStatus(statusCode, message, error.details);

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    (response as any).stack = error.stack;
  }

  res.status(statusCode).json(response);
});

// Create HTTP server
const server = createServer(app);

// BullMQ worker references (for graceful shutdown)
let syncWorker: Worker | null = null;
let badgeWorker: Worker | null = null;
let notifWorker: Worker | null = null;
let modWorker: Worker | null = null;

// Start server
const startServer = async () => {
  try {
    // Log environment info (without exposing sensitive data)
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
    logInfo(`DB_HOST present: ${!!process.env.DB_HOST}`);

    // Test database connection
    const db = Database.getInstance();
    const healthResult = await db.healthCheck();

    if (healthResult.healthy) {
      logInfo('Database connection established');
    }

    // Warn about CORS configuration in production
    if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
      logWarn(
        'CORS_ORIGIN not set - browser-origin requests will be REJECTED. Mobile (no-origin) requests still allowed. Set CORS_ORIGIN to enable web clients.'
      );
    }

    const runtimeResult = startRuntime(healthResult, {
      initWebSocket: () => initWebSocket(server),
      listen: () => {
        server.listen(PORT, () => {
          logInfo(`SoundCheck API Server running on port ${PORT}`);
          logInfo(`Health check: http://localhost:${PORT}/health`);
          logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);

          if (process.env.NODE_ENV === 'development') {
            logInfo(`API Documentation: http://localhost:${PORT}/`);
          }
        });
      },
      startEventSyncWorker,
      startBadgeEvalWorker,
      startNotificationWorker,
      startModerationWorker,
      registerSyncJobs: () => {
        registerSyncJobs().catch((err) =>
          logError('Failed to register sync jobs', { error: err.message || err })
        );
      },
    });

    if (!runtimeResult.started) {
      logError('Database connection failed. Please check your database configuration.', {
        error: runtimeResult.error,
      });
      process.exit(1);
    }

    syncWorker = runtimeResult.workers.sync;
    badgeWorker = runtimeResult.workers.badge;
    notifWorker = runtimeResult.workers.notification;
    modWorker = runtimeResult.workers.moderation;
  } catch (error) {
    logError('Failed to start server', { error });
    process.exit(1);
  }
};

async function closeRuntimeResources(): Promise<void> {
  if (syncWorker) await stopEventSyncWorker(syncWorker);
  if (badgeWorker) await stopBadgeEvalWorker(badgeWorker);
  if (notifWorker) await stopNotificationWorker(notifWorker);
  if (modWorker) await stopModerationWorker(modWorker);
  await closeSentry(2000);
  await closeRedis();
  websocket.close();
  const db = Database.getInstance();
  await db.close();
}

function beginShutdown(signal: 'SIGTERM' | 'SIGINT'): void {
  logInfo(`${signal} received, shutting down gracefully`);
  void shutdownWithBudget(signal, {
    closeServer: async () => {
      await closeHttpServer(server);
      logInfo('HTTP server closed');
    },
    closeResources: closeRuntimeResources,
    exit: (code) => process.exit(code),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (timer) => {
      clearTimeout(timer);
    },
    log: (message) => logInfo(message),
  });
}

process.on('SIGTERM', () => beginShutdown('SIGTERM'));
process.on('SIGINT', () => beginShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception', { error });
  sentryCaptureException(error, { type: 'uncaughtException' });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // INF-012: Log and report but do NOT exit the process.
  // Unhandled rejections are often transient (e.g., a failed fire-and-forget
  // cache invalidation). Exiting burns through restartPolicyMaxRetries and
  // can take the service down permanently.
  logError('Unhandled Rejection', { reason, promise });
  if (reason instanceof Error) {
    sentryCaptureException(reason, { type: 'unhandledRejection' });
  }
});

startServer();
