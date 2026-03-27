/**
 * BullMQ Worker for Badge Evaluation Jobs
 *
 * Processes jobs from the 'badge-eval' queue by calling
 * BadgeService.evaluateAndAward(). Each job carries a userId
 * and checkinId from the triggering check-in.
 *
 * Concurrency is set to 3 (badge evaluation is I/O-bound DB queries,
 * not rate-limited by external APIs like event sync).
 *
 * Graceful degradation: Returns null worker if REDIS_URL is not set.
 */

import { Worker, Job } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import { BadgeService } from '../services/BadgeService';
import { captureException } from '../utils/sentry';
import logger from '../utils/logger';

/**
 * Start the BullMQ worker for badge evaluation jobs.
 *
 * Returns the Worker instance for graceful shutdown, or null
 * if Redis is not available.
 */
export function startBadgeEvalWorker(): Worker | null {
  try {
    getRedisUrl();
  } catch {
    logger.warn('REDIS_URL not configured. Badge evaluation worker is disabled.');
    return null;
  }

  const worker = new Worker(
    'badge-eval',
    async (job: Job) => {
      const startTime = Date.now();
      const { userId, checkinId } = job.data;
      logger.info(`Processing badge evaluation`, { jobId: job.id, userId, checkinId });

      const badgeService = new BadgeService();
      const newBadges = await badgeService.evaluateAndAward(userId);

      const duration = Date.now() - startTime;
      logger.info(`Badge evaluation complete`, {
        jobId: job.id,
        userId,
        checkinId,
        newBadges: newBadges.length,
        durationMs: duration,
      });

      return { newBadges: newBadges.length, checkinId };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 3,
      lockDuration: 60000, // 1 min — badge evaluation involves multiple DB queries
    }
  );

  // Event listeners for monitoring
  worker.on('completed', (job: Job) => {
    logger.info(`Job completed successfully`, { jobId: job.id });
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Job failed: ${job?.id || 'unknown'}`, {
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
    captureException(err, { queue: 'badge-eval', jobId: job?.id });
  });

  worker.on('error', (err: Error) => {
    logger.error('Worker error', { error: err.message });
  });

  logger.info('Badge evaluation worker started (concurrency: 3)');

  return worker;
}

/**
 * Stop the BullMQ worker gracefully.
 *
 * Waits for the current job to complete before closing.
 */
export async function stopBadgeEvalWorker(worker: Worker): Promise<void> {
  try {
    await worker.close();
    logger.info('Badge evaluation worker stopped gracefully');
  } catch (err) {
    logger.error('Error stopping badge evaluation worker', {
      error: (err as Error).message,
    });
  }
}
