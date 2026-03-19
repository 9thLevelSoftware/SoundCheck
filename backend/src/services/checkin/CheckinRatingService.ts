/**
 * CheckinRatingService -- Rating management for check-ins
 *
 * Extracted from CheckinService as part of v1-launch tech debt cleanup.
 * Handles:
 *   - addRatings() -- per-set band ratings and venue rating
 *   - validateRating() -- rating value validation
 */

import Database from '../../config/database';
import { cache, CacheKeys } from '../../utils/cache';
import { Checkin, AddRatingsRequest } from './types';
import logger from '../../utils/logger';

export class CheckinRatingService {
  private db = Database.getInstance();

  // Callback to get check-in by ID (injected by facade to avoid circular dependency)
  private getCheckinByIdFn: (checkinId: string, userId?: string) => Promise<Checkin>;

  constructor(getCheckinByIdFn: (checkinId: string, userId?: string) => Promise<Checkin>) {
    this.getCheckinByIdFn = getCheckinByIdFn;
  }

  // ============================================
  // Per-set band ratings + venue rating
  // ============================================

  /**
   * Add ratings to an existing check-in.
   * Supports per-set band ratings and venue rating independently.
   * Ratings must be 0.5-5.0 in 0.5 steps.
   */
  async addRatings(checkinId: string, userId: string, ratings: AddRatingsRequest): Promise<Checkin> {
    try {
      // Verify checkin belongs to userId
      const checkinResult = await this.db.query(
        'SELECT user_id, event_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (checkinResult.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      if (checkinResult.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to rate this check-in');
      }

      const eventId = checkinResult.rows[0].event_id;

      // Handle venue rating
      if (ratings.venueRating !== undefined) {
        this.validateRating(ratings.venueRating);
        await this.db.query(
          'UPDATE checkins SET venue_rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [ratings.venueRating, checkinId]
        );
      }

      // Handle per-set band ratings
      if (ratings.bandRatings && ratings.bandRatings.length > 0) {
        // Validate all ratings first (fast, no I/O)
        for (const br of ratings.bandRatings) {
          this.validateRating(br.rating);
        }

        // PERF-008: Batch lineup check -- verify all bands in a single query
        // instead of N sequential queries.
        if (eventId) {
          const bandIds = ratings.bandRatings.map(br => br.bandId);
          const lineupCheck = await this.db.query(
            'SELECT band_id FROM event_lineup WHERE event_id = $1 AND band_id = ANY($2)',
            [eventId, bandIds]
          );
          const validBandIds = new Set(lineupCheck.rows.map((r: any) => r.band_id));
          for (const bandId of bandIds) {
            if (!validBandIds.has(bandId)) {
              throw new Error(`Band ${bandId} is not in the event lineup`);
            }
          }
        }

        // PERF-008: Batch UPSERT all band ratings in a single query
        // instead of N sequential UPSERTs.
        const valuesClauses: string[] = [];
        const params: any[] = [checkinId]; // $1 = checkinId
        let paramIdx = 2;
        for (const br of ratings.bandRatings) {
          valuesClauses.push(`($1, $${paramIdx}, $${paramIdx + 1})`);
          params.push(br.bandId, br.rating);
          paramIdx += 2;
        }

        await this.db.query(
          `INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
           VALUES ${valuesClauses.join(', ')}
           ON CONFLICT (checkin_id, band_id) DO UPDATE SET rating = EXCLUDED.rating`,
          params
        );

        // Update the legacy rating column to average of all band ratings for backward compat
        const avgResult = await this.db.query(
          `SELECT AVG(rating) as avg_rating FROM checkin_band_ratings WHERE checkin_id = $1`,
          [checkinId]
        );
        const avgRating = avgResult.rows[0]?.avg_rating
          ? parseFloat(avgResult.rows[0].avg_rating)
          : 0;
        await this.db.query(
          'UPDATE checkins SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [avgRating, checkinId]
        );

        // Fire-and-forget: invalidate band aggregate cache for each rated band
        for (const br of ratings.bandRatings) {
          cache.del(CacheKeys.bandAggregate(br.bandId)).catch((err) =>
            logger.debug('Warning: band aggregate cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
          );
        }
      }

      // Fire-and-forget: invalidate venue aggregate cache if venue was rated
      if (ratings.venueRating !== undefined) {
        const checkinForVenue = await this.db.query(
          'SELECT venue_id FROM checkins WHERE id = $1',
          [checkinId]
        );
        const venueId = checkinForVenue.rows[0]?.venue_id;
        if (venueId) {
          cache.del(CacheKeys.venueAggregate(venueId)).catch((err) =>
            logger.debug('Warning: venue aggregate cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
          );
        }
      }

      return this.getCheckinByIdFn(checkinId, userId);
    } catch (error) {
      logger.error('Add ratings error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Validate a rating value: must be 0.5-5.0 in 0.5 steps.
   */
  private validateRating(rating: number): void {
    if (rating < 0.5 || rating > 5.0) {
      throw new Error('Rating must be between 0.5 and 5.0');
    }
    if (rating % 0.5 !== 0) {
      throw new Error('Rating must be in 0.5 increments');
    }
  }
}
