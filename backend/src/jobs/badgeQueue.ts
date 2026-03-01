/**
 * BullMQ Queue Instance for Badge Evaluation Jobs
 *
 * Creates a BullMQ Queue backed by Redis for async badge evaluation
 * after check-ins. Jobs are enqueued with a 30-second delay for
 * anti-farming and deduplication via jobId.
 *
 * Graceful degradation: If REDIS_URL is not set, exports null queue.
 * All consumers MUST check for null before using the queue.
 */

import { Queue } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import logger from '../utils/logger';

/**
 * Badge evaluation queue instance.
 * Null if REDIS_URL is not configured (app still starts, badge eval disabled).
 */
let badgeEvalQueue: Queue | null = null;

try {
  getRedisUrl();
  badgeEvalQueue = new Queue('badge-eval', {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  logger.info('[BadgeEvalQueue] Badge evaluation queue initialized');
} catch {
  logger.warn('[BadgeEvalQueue] REDIS_URL not configured. Badge evaluation queue is disabled.');
  badgeEvalQueue = null;
}

export { badgeEvalQueue };
