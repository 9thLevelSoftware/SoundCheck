/**
 * BullMQ Worker for Event Sync Jobs
 *
 * Processes jobs from the 'event-sync' queue by calling EventSyncService.
 * Handles three job types:
 *   - 'scheduled-sync': Regular 4-hour sync of all regions
 *   - 'check-cancellations': Daily cancellation/rescheduling check
 *   - 'region-sync': On-demand sync of a single region
 *
 * Concurrency is set to 1 to simplify rate limiting against the
 * Ticketmaster API (TicketmasterAdapter handles per-second limits).
 *
 * Graceful degradation: Returns null worker if REDIS_URL is not set.
 */

import { Worker, Job } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import { EventSyncService } from '../services/EventSyncService';
import logger from '../utils/logger';

/**
 * Start the BullMQ worker for event sync jobs.
 *
 * Returns the Worker instance for graceful shutdown, or null
 * if Redis is not available.
 */
export function startEventSyncWorker(): Worker | null {
  try {
    getRedisUrl();
  } catch {
    logger.warn('REDIS_URL not configured. Event sync worker is disabled.');
    return null;
  }

  const worker = new Worker(
    'event-sync',
    async (job: Job) => {
      const startTime = Date.now();
      logger.info(`Processing job: ${job.name}`, { jobId: job.id });

      const syncService = new EventSyncService();

      if (job.name === 'scheduled-sync') {
        await syncService.runSync();
      } else if (job.name === 'check-cancellations') {
        // Same flow -- TM API returns current status which triggers
        // status change detection in EventSyncService
        await syncService.runSync();
      } else if (job.name === 'region-sync') {
        const regionId = job.data?.regionId;
        await syncService.runSync(regionId);
      } else {
        logger.warn(`Unknown job name: ${job.name}`, { jobId: job.id });
      }

      const duration = Date.now() - startTime;
      logger.info(`Job completed: ${job.name}`, { jobId: job.id, durationMs: duration });
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  // Event listeners for monitoring
  worker.on('completed', (job: Job) => {
    logger.info(`Job completed successfully: ${job.name}`, { jobId: job.id });
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Job failed: ${job?.name || 'unknown'}`, {
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('error', (err: Error) => {
    logger.error('Worker error', { error: err.message });
  });

  logger.info('Event sync worker started (concurrency: 1)');

  return worker;
}

/**
 * Stop the BullMQ worker gracefully.
 *
 * Waits for the current job to complete before closing.
 */
export async function stopEventSyncWorker(worker: Worker): Promise<void> {
  try {
    await worker.close();
    logger.info('Event sync worker stopped gracefully');
  } catch (err) {
    logger.error('Error stopping event sync worker', {
      error: (err as Error).message,
    });
  }
}
