/**
 * BullMQ Queue Instance for Image Moderation Jobs
 *
 * Creates a BullMQ Queue backed by Redis for async SafeSearch image
 * scanning. Jobs are enqueued when a user reports a photo or when
 * new photos are uploaded.
 *
 * Graceful degradation: If REDIS_URL is not set, exports null queue.
 * All consumers MUST check for null before using the queue.
 *
 * Phase 9: Trust & Safety Foundation
 */

import { Queue } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import logger from '../utils/logger';

/**
 * Image moderation queue instance.
 * Null if REDIS_URL is not configured (app still starts, image scanning disabled).
 */
let moderationQueue: Queue | null = null;

try {
  getRedisUrl();
  moderationQueue = new Queue('image-moderation', {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });
  logger.info('[ModerationQueue] Image moderation queue initialized');
} catch {
  logger.warn('[ModerationQueue] REDIS_URL not configured. Image moderation queue is disabled.');
  moderationQueue = null;
}

export { moderationQueue };
