/**
 * Sync Job Scheduler
 *
 * Registers repeatable BullMQ jobs for automatic event syncing:
 *   - 'scheduled-sync': Every 4 hours (main sync)
 *   - 'check-cancellations': Daily at 6 AM UTC (cancellation check)
 *
 * Repeatable jobs are idempotent -- calling registerSyncJobs() multiple
 * times (e.g., on server restart) will NOT create duplicate jobs.
 * BullMQ deduplicates by the repeat pattern + jobId combination.
 *
 * Also provides triggerManualSync() for on-demand testing.
 */

import { eventSyncQueue } from './queue';
import logger from '../utils/logger';

/**
 * Register repeatable sync jobs in the BullMQ queue.
 *
 * Safe to call on every server startup -- BullMQ deduplicates
 * repeatable jobs by jobId, so no duplicate schedules are created.
 */
export async function registerSyncJobs(): Promise<void> {
  if (!eventSyncQueue) {
    logger.warn('Event sync queue not available. Scheduled sync jobs are disabled.');
    return;
  }

  try {
    // Main sync: every 4 hours
    await eventSyncQueue.add(
      'scheduled-sync',
      {},
      {
        repeat: {
          pattern: '0 */4 * * *', // At minute 0, every 4 hours
        },
        jobId: 'scheduled-event-sync',
      }
    );

    // Cancellation check: daily at 6 AM UTC
    await eventSyncQueue.add(
      'check-cancellations',
      {},
      {
        repeat: {
          pattern: '0 6 * * *', // At 6:00 AM UTC daily
        },
        jobId: 'daily-cancellation-check',
      }
    );

    logger.info(
      'Registered sync jobs: scheduled-sync (every 4h), check-cancellations (daily 6AM UTC)'
    );
  } catch (err) {
    logger.error('Failed to register sync jobs', {
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Trigger a manual sync job (for testing or admin use).
 *
 * Optionally specify a regionId to sync a single region.
 * Returns the job ID for tracking.
 */
export async function triggerManualSync(regionId?: string): Promise<string | null> {
  if (!eventSyncQueue) {
    logger.warn('Event sync queue not available. Cannot trigger manual sync.');
    return null;
  }

  try {
    const job = await eventSyncQueue.add(
      'region-sync',
      { regionId: regionId || null },
      {
        // No repeat -- one-off job
        priority: 1, // Higher priority than scheduled syncs
      }
    );

    logger.info('Manual sync triggered', { jobId: job.id, regionId });
    return job.id || null;
  } catch (err) {
    logger.error('Failed to trigger manual sync', {
      error: (err as Error).message,
    });
    return null;
  }
}
