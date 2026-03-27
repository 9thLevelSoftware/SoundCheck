import { DataRetentionService } from '../services/DataRetentionService';
import Database from '../config/database';
import * as dotenv from 'dotenv';
import logger from '../utils/logger';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Data retention job for scheduled cleanup of user data.
 *
 * This script should be run as a cron job (e.g., daily) to:
 * 1. Process pending account deletions (30-day grace period)
 * 2. Clean up old consent records (2+ years)
 * 3. Clean up old notifications (90+ days)
 * 4. Clean up expired refresh tokens (7+ days past expiration)
 */
async function runRetentionJob(): Promise<void> {
  logger.info('Starting data retention job...');

  const db = Database.getInstance();

  try {
    const retentionService = new DataRetentionService();

    // 1. Process pending account deletions
    logger.info('Processing pending account deletions...');
    const deletionResult = await retentionService.processPendingDeletions();
    logger.info('Account deletions processed', {
      processed: deletionResult.processed,
      succeeded: deletionResult.succeeded,
      failed: deletionResult.failed,
    });
    if (deletionResult.errors.length > 0) {
      deletionResult.errors.forEach((err) => {
        logger.error(`Account deletion error for user ${err.userId}`, {
          userId: err.userId,
          error: err.error,
        });
      });
    }

    // 2. Clean up old consent records (keep 2 years for audit compliance)
    logger.info('Cleaning up old consent records...');
    const consentResult = await db.query(
      `DELETE FROM user_consents
       WHERE recorded_at < NOW() - INTERVAL '2 years'
       RETURNING id`
    );
    logger.info(`Cleaned up ${consentResult.rowCount || 0} old consent records`);

    // 3. Clean up old notifications (keep 90 days)
    logger.info('Cleaning up old notifications...');
    const notifResult = await db.query(
      `DELETE FROM notifications
       WHERE created_at < NOW() - INTERVAL '90 days'
       RETURNING id`
    );
    logger.info(`Cleaned up ${notifResult.rowCount || 0} old notifications`);

    // 4. Clean up expired refresh tokens (7 days past expiration)
    logger.info('Cleaning up expired refresh tokens...');
    const tokenResult = await db.query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days'
       RETURNING id`
    );
    logger.info(`Cleaned up ${tokenResult.rowCount || 0} expired refresh tokens`);

    logger.info('Data retention job completed successfully');
  } catch (error) {
    logger.error('Data retention job failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runRetentionJob()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('Retention job fatal error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    });
}

export { runRetentionJob };
