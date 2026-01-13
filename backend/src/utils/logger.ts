import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

/**
 * Production-grade logger with:
 * - Console output in development
 * - File rotation in production
 * - Separate error log file
 * - Structured JSON logging
 * - Timestamp on all logs
 */

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define transports
const transports: winston.transport[] = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
        )
      ),
    })
  );
}

// File transport for production
if (process.env.NODE_ENV === 'production') {
  // General logs with rotation
  transports.push(
    new DailyRotateFile({
      dirname: path.join(__dirname, '../../logs'),
      filename: 'soundcheck-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d', // Keep logs for 14 days
      format,
    })
  );

  // Error logs separately
  transports.push(
    new DailyRotateFile({
      dirname: path.join(__dirname, '../../logs'),
      filename: 'soundcheck-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d', // Keep error logs for 30 days
      level: 'error',
      format,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels,
  format,
  transports,
  exitOnError: false,
});

// Export logger
export default logger;

// Export convenience methods
export const logError = (message: string, meta?: any) => {
  logger.error(message, meta);
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logHttp = (message: string, meta?: any) => {
  logger.http(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};
