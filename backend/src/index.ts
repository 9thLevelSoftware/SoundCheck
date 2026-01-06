import dotenv from 'dotenv';

// Load environment variables from .env file (development only)
// In production (Railway, etc.), environment variables are injected directly
// IMPORTANT: This must be done BEFORE any other imports that use env vars
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import userRoutes from './routes/userRoutes';
import venueRoutes from './routes/venueRoutes';
import bandRoutes from './routes/bandRoutes';
import reviewRoutes from './routes/reviewRoutes';
import badgeRoutes from './routes/badgeRoutes';
import discoveryRoutes from './routes/discoveryRoutes';
import eventRoutes from './routes/eventRoutes';
import checkinRoutes from './routes/checkinRoutes';
import feedRoutes from './routes/feedRoutes';
import notificationRoutes from './routes/notificationRoutes';
import Database from './config/database';
import { ApiResponse } from './types';
import logger, { logHttp, logInfo, logError, logWarn } from './utils/logger';

// Validate required environment variables
// DB_PASSWORD is only required if DATABASE_URL is not set (Railway provides DATABASE_URL)
const requiredEnvVars = ['JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Validate database configuration - need either DATABASE_URL or DB_PASSWORD
if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
  console.error('FATAL: Missing database configuration. Set either DATABASE_URL or DB_PASSWORD');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
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
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // In production, require explicit CORS_ORIGIN configuration
    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin) {
      logError('CORS: CORS_ORIGIN not configured, rejecting request from:', { origin });
      return callback(new Error('CORS not configured'), false);
    }
    if (corsOrigin === '*') {
      if (process.env.NODE_ENV === 'production') {
        logError('CORS: Wildcard origin not allowed in production');
        return callback(new Error('Wildcard CORS not allowed in production'), false);
      }
      return callback(null, true);
    }

    const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject unknown origins in production
    logWarn('CORS: Rejected origin:', { origin });
    callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// Request logging middleware
app.use((req, res, next) => {
  logHttp(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const db = Database.getInstance();
    const isDbHealthy = await db.healthCheck();
    
    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: isDbHealthy ? 'connected' : 'disconnected',
      },
    };
    
    res.status(200).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Health check failed',
    };
    res.status(503).json(response);
  }
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/bands', bandRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/discover', discoveryRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/notifications', notificationRoutes);

// Root endpoint
app.get('/', (req, res) => {
  const response: ApiResponse = {
    success: true,
    data: {
      message: 'PitPulse API Server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
  };
  res.json(response);
});

// 404 handler
app.use('*', (req, res) => {
  const response: ApiResponse = {
    success: false,
    error: `Route ${req.originalUrl} not found`,
  };
  res.status(404).json(response);
});

// Global error handler - catches ALL errors including async
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Determine status code
  const statusCode = error.statusCode || error.status || 500;

  // Log error with context
  logError(`${error.message} | Path: ${req.path} | Method: ${req.method} | Status: ${statusCode}`, {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    statusCode,
    userId: (req as any).user?.id,
  });

  // Build response
  const response: ApiResponse = {
    success: false,
    error: process.env.NODE_ENV === 'development'
      ? error.message
      : statusCode >= 500
        ? 'Internal server error'
        : error.message || 'Request failed',
  };

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    (response as any).stack = error.stack;
  }

  res.status(statusCode).json(response);
});

// Start server
const startServer = async () => {
  try {
    // Log environment info (without exposing sensitive data)
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
    logInfo(`DB_HOST present: ${!!process.env.DB_HOST}`);

    // Test database connection
    const db = Database.getInstance();
    const isDbHealthy = await db.healthCheck();

    if (!isDbHealthy) {
      logError('Database connection failed. Please check your database configuration.');
      process.exit(1);
    }

    logInfo('Database connection established');

    // Warn about CORS configuration in production
    if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
      logWarn('CORS_ORIGIN not set - CORS will allow all origins. Set CORS_ORIGIN for web clients.');
    }

    app.listen(PORT, () => {
      logInfo(`PitPulse API Server running on port ${PORT}`);
      logInfo(`Health check: http://localhost:${PORT}/health`);
      logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);

      if (process.env.NODE_ENV === 'development') {
        logInfo(`API Documentation: http://localhost:${PORT}/`);
      }
    });

  } catch (error) {
    logError('Failed to start server', { error });
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logInfo('SIGTERM received, shutting down gracefully');
  const db = Database.getInstance();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logInfo('SIGINT received, shutting down gracefully');
  const db = Database.getInstance();
  await db.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

startServer();
