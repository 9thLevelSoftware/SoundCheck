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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const venueRoutes_1 = __importDefault(require("./routes/venueRoutes"));
const bandRoutes_1 = __importDefault(require("./routes/bandRoutes"));
const reviewRoutes_1 = __importDefault(require("./routes/reviewRoutes"));
const badgeRoutes_1 = __importDefault(require("./routes/badgeRoutes"));
const discoveryRoutes_1 = __importDefault(require("./routes/discoveryRoutes"));
const eventRoutes_1 = __importDefault(require("./routes/eventRoutes"));
const checkinRoutes_1 = __importDefault(require("./routes/checkinRoutes"));
const feedRoutes_1 = __importDefault(require("./routes/feedRoutes"));
const database_1 = __importDefault(require("./config/database"));
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Security middleware
app.use((0, helmet_1.default)());
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
        if (!corsOrigin || corsOrigin === '*') {
            // Log warning but allow - mobile apps have no origin
            (0, logger_1.logWarn)('CORS: No CORS_ORIGIN set, allowing request from:', { origin });
            return callback(null, true);
        }
        const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
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
// Request logging middleware
app.use((req, res, next) => {
    (0, logger_1.logHttp)(`${req.method} ${req.path}`);
    next();
});
// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const db = database_1.default.getInstance();
        const isDbHealthy = await db.healthCheck();
        const response = {
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                database: isDbHealthy ? 'connected' : 'disconnected',
            },
        };
        res.status(200).json(response);
    }
    catch (error) {
        const response = {
            success: false,
            error: 'Health check failed',
        };
        res.status(503).json(response);
    }
});
// API routes
app.use('/api/users', userRoutes_1.default);
app.use('/api/venues', venueRoutes_1.default);
app.use('/api/bands', bandRoutes_1.default);
app.use('/api/reviews', reviewRoutes_1.default);
app.use('/api/badges', badgeRoutes_1.default);
app.use('/api/discover', discoveryRoutes_1.default);
app.use('/api/events', eventRoutes_1.default);
app.use('/api/checkins', checkinRoutes_1.default);
app.use('/api/feed', feedRoutes_1.default);
// Root endpoint
app.get('/', (req, res) => {
    const response = {
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
    const response = {
        success: false,
        error: `Route ${req.originalUrl} not found`,
    };
    res.status(404).json(response);
});
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
            (0, logger_1.logWarn)('CORS_ORIGIN not set - CORS will allow all origins. Set CORS_ORIGIN for web clients.');
        }
        app.listen(PORT, () => {
            (0, logger_1.logInfo)(`PitPulse API Server running on port ${PORT}`);
            (0, logger_1.logInfo)(`Health check: http://localhost:${PORT}/health`);
            (0, logger_1.logInfo)(`Environment: ${process.env.NODE_ENV || 'development'}`);
            if (process.env.NODE_ENV === 'development') {
                (0, logger_1.logInfo)(`API Documentation: http://localhost:${PORT}/`);
            }
        });
    }
    catch (error) {
        (0, logger_1.logError)('Failed to start server', { error });
        process.exit(1);
    }
};
// Handle graceful shutdown
process.on('SIGTERM', async () => {
    (0, logger_1.logInfo)('SIGTERM received, shutting down gracefully');
    const db = database_1.default.getInstance();
    await db.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    (0, logger_1.logInfo)('SIGINT received, shutting down gracefully');
    const db = database_1.default.getInstance();
    await db.close();
    process.exit(0);
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    (0, logger_1.logError)('Uncaught Exception', { error });
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    (0, logger_1.logError)('Unhandled Rejection', { reason, promise });
    process.exit(1);
});
startServer();
//# sourceMappingURL=index.js.map