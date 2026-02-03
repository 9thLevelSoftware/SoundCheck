/**
 * BullMQ Queue Instance for Batched Push Notifications
 *
 * Creates a BullMQ Queue backed by Redis for batched push notification
 * delivery. Jobs are enqueued with a 2-minute delay for batching, using
 * jobId deduplication so only one batch job per user per window exists.
 *
 * Graceful degradation: If REDIS_URL is not set, exports null queue.
 * All consumers MUST check for null before using the queue.
 *
 * Phase 5: Social Feed & Real-time (Plan 2)
 */

import { Queue } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';

/**
 * Notification batch queue instance.
 * Null if REDIS_URL is not configured (app still starts, push notifications disabled).
 */
let notificationQueue: Queue | null = null;

try {
  getRedisUrl();
  notificationQueue = new Queue('notification-batch', {
    connection: createBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  console.log('[NotificationQueue] Notification batch queue initialized');
} catch {
  console.warn('[NotificationQueue] REDIS_URL not configured. Notification batch queue is disabled.');
  notificationQueue = null;
}

export { notificationQueue };
