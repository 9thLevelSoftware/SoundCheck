import Database from '../config/database';
import { cache, CacheKeys } from '../utils/cache';
import { BandAggregate, VenueAggregate } from '../types';

/**
 * DiscoveryService: Computes aggregate ratings for bands and venues
 * from check-in data with Redis cache-aside.
 *
 * CRITICAL: Aggregates are computed from checkin_band_ratings (bands)
 * and checkins.venue_rating (venues), NOT from bands.average_rating
 * or venues.average_rating (those use the old reviews table).
 *
 * Cache: 10-minute (600s) TTL via cache.getOrSet().
 * Invalidated fire-and-forget from CheckinService on rating changes.
 *
 * Phase 7: Discovery & Recommendations (Plan 1)
 */

const AGGREGATE_TTL = 600; // 10 minutes

export class DiscoveryService {
  private db = Database.getInstance();

  /**
   * Get aggregate performance rating for a band.
   * Computed from checkin_band_ratings table (per-set band ratings).
   * Returns zeros if no ratings exist.
   */
  async getBandAggregateRating(bandId: string): Promise<BandAggregate> {
    return cache.getOrSet(
      CacheKeys.bandAggregate(bandId),
      () => this.computeBandAggregate(bandId),
      AGGREGATE_TTL
    );
  }

  /**
   * Get aggregate experience rating for a venue.
   * Computed from checkins.venue_rating (not venues.average_rating).
   * Returns zeros if no ratings exist.
   */
  async getVenueAggregateRating(venueId: string): Promise<VenueAggregate> {
    return cache.getOrSet(
      CacheKeys.venueAggregate(venueId),
      () => this.computeVenueAggregate(venueId),
      AGGREGATE_TTL
    );
  }

  /**
   * Compute band aggregate from checkin_band_ratings.
   * - avgPerformanceRating: average of all ratings for this band
   * - totalRatings: count of distinct ratings
   * - uniqueFans: count of distinct users who rated this band
   */
  private async computeBandAggregate(bandId: string): Promise<BandAggregate> {
    try {
      const result = await this.db.query(
        `SELECT
          COALESCE(AVG(cbr.rating)::numeric(3,2), 0) as avg_rating,
          COUNT(DISTINCT cbr.id)::int as total_ratings,
          COUNT(DISTINCT c.user_id)::int as unique_fans
        FROM checkin_band_ratings cbr
        JOIN checkins c ON cbr.checkin_id = c.id
        WHERE cbr.band_id = $1`,
        [bandId]
      );

      const row = result.rows[0];
      return {
        avgPerformanceRating: parseFloat(row?.avg_rating) || 0,
        totalRatings: row?.total_ratings ?? 0,
        uniqueFans: row?.unique_fans ?? 0,
      };
    } catch (error) {
      console.error('Compute band aggregate error:', error);
      return { avgPerformanceRating: 0, totalRatings: 0, uniqueFans: 0 };
    }
  }

  /**
   * Compute venue aggregate from checkins.venue_rating.
   * - avgExperienceRating: average of all venue ratings
   * - totalRatings: count of distinct rated check-ins
   * - uniqueVisitors: count of distinct users who rated this venue
   */
  private async computeVenueAggregate(venueId: string): Promise<VenueAggregate> {
    try {
      const result = await this.db.query(
        `SELECT
          COALESCE(AVG(c.venue_rating)::numeric(3,2), 0) as avg_rating,
          COUNT(DISTINCT c.id)::int as total_ratings,
          COUNT(DISTINCT c.user_id)::int as unique_visitors
        FROM checkins c
        WHERE c.venue_id = $1 AND c.venue_rating IS NOT NULL AND c.venue_rating > 0`,
        [venueId]
      );

      const row = result.rows[0];
      return {
        avgExperienceRating: parseFloat(row?.avg_rating) || 0,
        totalRatings: row?.total_ratings ?? 0,
        uniqueVisitors: row?.unique_visitors ?? 0,
      };
    } catch (error) {
      console.error('Compute venue aggregate error:', error);
      return { avgExperienceRating: 0, totalRatings: 0, uniqueVisitors: 0 };
    }
  }
}
