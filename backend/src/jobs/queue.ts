/**
 * BullMQ Queue Instance for Event Sync Jobs
 *
 * Creates a BullMQ Queue backed by Redis for persistent, retry-capable
 * job scheduling. The queue uses exponential backoff for failed jobs
 * and retains the last 100 completed / 200 failed jobs for debugging.
 *
 * Graceful degradation: If REDIS_URL is not set, exports null queue.
 * All consumers MUST check for null before using the queue.
 *
 * IMPORTANT: BullMQ requires its own Redis connection with
 * maxRetriesPerRequest: null (uses blocking commands).
 */

import { Queue } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import logger from '../utils/logger';

/**
 * Event sync queue instance.
 * Null if REDIS_URL is not configured (app still starts, sync disabled).
 */
let eventSyncQueue: Queue | null = null;

try {
  // Guard: Only create queue if Redis is available
  getRedisUrl();

  eventSyncQueue = new Queue('event-sync', {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
    // Dead letter queue configuration
    streams: {
      events: { maxLen: 1000 },
    },
  });

  logger.info('Event sync queue initialized');
} catch (err) {
  logger.warn(
    'REDIS_URL not configured. Event sync queue is disabled. ' +
      'The app will run normally without background event sync.'
  );
  eventSyncQueue = null;
}

export { eventSyncQueue };
