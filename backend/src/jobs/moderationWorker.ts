/**
 * BullMQ Worker for Image Moderation Jobs
 *
 * Processes jobs from the 'image-moderation' queue by calling
 * ImageModerationService.scanImage(). If the image is flagged,
 * auto-hides the content and creates a moderation queue item
 * for admin review.
 *
 * Concurrency is set to 2 (Cloud Vision API calls are I/O-bound
 * but rate-limited; conservative concurrency to avoid quota issues).
 *
 * Graceful degradation: Returns null worker if REDIS_URL is not set.
 *
 * Phase 9: Trust & Safety Foundation
 */

import { Worker, Job } from 'bullmq';
import { createBullMQConnection, getRedisUrl } from '../config/redis';
import { ImageModerationService } from '../services/ImageModerationService';
import { ModerationService } from '../services/ModerationService';
import { ContentType } from '../types';
import logger from '../utils/logger';

interface ModerationJobData {
  contentType: ContentType;
  contentId: string;
  imageUrl: string;
  userId: string;
}

/**
 * Start the BullMQ worker for image moderation jobs.
 *
 * Returns the Worker instance for graceful shutdown, or null
 * if Redis is not available.
 */
export function startModerationWorker(): Worker | null {
  try {
    getRedisUrl();
  } catch {
    logger.warn('REDIS_URL not configured. Image moderation worker is disabled.');
    return null;
  }

  const worker = new Worker(
    'image-moderation',
    async (job: Job<ModerationJobData>) => {
      const startTime = Date.now();
      const { contentType, contentId, imageUrl, userId } = job.data;
      logger.info(`Processing image moderation`, {
        jobId: job.id,
        contentType,
        contentId,
        imageUrl,
      });

      const imageMod = new ImageModerationService();
      const moderationService = new ModerationService();

      const result = await imageMod.scanImage(imageUrl);

      if (result.isFlagged) {
        logger.warn(`Image flagged by SafeSearch`, {
          jobId: job.id,
          contentId,
          flagReasons: result.flagReasons,
        });

        // Auto-hide the flagged content
        await moderationService.autoHideContent(contentType, contentId);

        // Create a moderation queue item for admin review
        await moderationService.createModerationItem({
          contentType,
          contentId,
          source: 'auto_safesearch',
          safesearchResults: result.annotations,
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`Image moderation complete`, {
        jobId: job.id,
        contentId,
        isFlagged: result.isFlagged,
        durationMs: duration,
      });

      return { isFlagged: result.isFlagged, contentId };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 2,
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
  });

  worker.on('error', (err: Error) => {
    logger.error('Worker error', { error: err.message });
  });

  logger.info('Image moderation worker started (concurrency: 2)');

  return worker;
}

/**
 * Stop the BullMQ worker gracefully.
 *
 * Waits for the current job to complete before closing.
 */
export async function stopModerationWorker(worker: Worker): Promise<void> {
  try {
    await worker.close();
    logger.info('Image moderation worker stopped gracefully');
  } catch (err) {
    logger.error('Error stopping image moderation worker', {
      error: (err as Error).message,
    });
  }
}
