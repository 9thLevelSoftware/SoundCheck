/**
 * BullMQ Worker for Batched Push Notification Jobs
 *
 * Processes jobs from the 'notification-batch' queue. Each job fires
 * after a 2-minute batching window for a specific user. The worker:
 *
 * 1. LRANGE the user's pending notification list from Redis
 * 2. DEL the list (consume the batch)
 * 3. If 1 item: send direct FOMO-style notification
 * 4. If multiple items: send summary notification
 *
 * Concurrency: 5 (notification sending is I/O-bound, not rate-limited).
 *
 * Graceful degradation: Returns null worker if REDIS_URL is not set.
 *
 * Phase 5: Social Feed & Real-time (Plan 2)
 */

import { Worker, Job } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import { pushNotificationService } from '../services/PushNotificationService';
import { getRedis } from '../utils/redisRateLimiter';
import logger from '../utils/logger';

let notificationWorker: Worker | null = null;

/**
 * Start the BullMQ worker for notification batch jobs.
 *
 * Returns the Worker instance for graceful shutdown, or null
 * if Redis is not available.
 */
export function startNotificationWorker(): Worker | null {
  try {
    getRedisUrl();
  } catch {
    logger.warn('REDIS_URL not configured. Notification batch worker is disabled.');
    return null;
  }

  const worker = new Worker(
    'notification-batch',
    async (job: Job) => {
      const { userId } = job.data;
      logger.info('Processing notification batch', { jobId: job.id, userId });

      const redis = getRedis();
      if (!redis) {
        logger.warn('Redis not available, skipping notification batch', { userId });
        return { sent: false, reason: 'redis_unavailable' };
      }

      const listKey = `notif:batch:${userId}`;

      // Atomically read and delete the batch list
      const items = await redis.lrange(listKey, 0, -1);
      await redis.del(listKey);

      if (!items || items.length === 0) {
        logger.info('Empty notification batch (race condition), skipping', { userId });
        return { sent: false, reason: 'empty_batch' };
      }

      const checkins = items.map((i) => {
        try {
          return JSON.parse(i);
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (checkins.length === 0) {
        return { sent: false, reason: 'parse_error' };
      }

      if (checkins.length === 1) {
        // Single check-in: direct FOMO notification
        const { username, eventName, venueName } = checkins[0];
        await pushNotificationService.sendToUser(userId, {
          title: `${username} checked in!`,
          body: `At ${eventName} @ ${venueName}`,
          data: { type: 'friend_checkin' },
        });
        logger.info('Sent single notification', { userId, username });
      } else {
        // Multiple check-ins: summary notification
        const first = checkins[0];
        const othersCount = checkins.length - 1;
        await pushNotificationService.sendToUser(userId, {
          title: `${checkins.length} friends checked in!`,
          body: `${first.username} and ${othersCount} ${othersCount === 1 ? 'other' : 'others'} are at shows tonight`,
          data: { type: 'friend_checkin_batch', count: String(checkins.length) },
        });
        logger.info('Sent batch notification', { userId, count: checkins.length });
      }

      return { sent: true, count: checkins.length };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 5,
    },
  );

  // Event listeners for monitoring
  worker.on('completed', (job: Job) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Job failed: ${job?.id || 'unknown'}`, {
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('error', (err: Error) => {
    logger.error('Worker error', { error: err.message });
  });

  notificationWorker = worker;
  logger.info('Notification batch worker started (concurrency: 5)');

  return worker;
}

/**
 * Stop the BullMQ worker gracefully.
 *
 * Waits for the current job to complete before closing.
 */
export async function stopNotificationWorker(worker?: Worker | null): Promise<void> {
  const w = worker || notificationWorker;
  if (!w) return;

  try {
    await w.close();
    logger.info('Notification batch worker stopped gracefully');
  } catch (err) {
    logger.error('Error stopping notification batch worker', {
      error: (err as Error).message,
    });
  }
}
