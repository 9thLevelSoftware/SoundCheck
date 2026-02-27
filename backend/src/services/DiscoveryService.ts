import Database from '../config/database';
import { cache, CacheKeys } from '../utils/cache';
import { BandAggregate, VenueAggregate, Event } from '../types';
import { EventService } from './EventService';
import { BlockService } from './BlockService';

/**
 * DiscoveryService: Computes aggregate ratings for bands and venues
 * from check-in data with Redis cache-aside. Also provides personalized
 * event recommendations using genre affinity, friend attendance, and
 * trending signals.
 *
 * CRITICAL: Aggregates are computed from checkin_band_ratings (bands)
 * and checkins.venue_rating (venues), NOT from bands.average_rating
 * or venues.average_rating (those use the old reviews table).
 *
 * Cache: 10-minute (600s) TTL via cache.getOrSet().
 * Invalidated fire-and-forget from CheckinService on rating changes.
 *
 * Phase 7: Discovery & Recommendations (Plans 1 + 3)
 */

const AGGREGATE_TTL = 600; // 10 minutes
const RECOMMENDATION_TTL = 600; // 10 minutes

export class DiscoveryService {
  private db = Database.getInstance();
  private eventService = new EventService();
  private blockService = new BlockService();

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

  // ============================================
  // Personalized Recommendations (Plan 3)
  // ============================================

  /**
   * Get personalized event recommendations for a user.
   *
   * Scoring weights:
   *   - Genre affinity: 3x (user's top 5 genres by check-in count)
   *   - Friend attendance: 5x (friends already checked in to upcoming events)
   *   - Trending: 1x (recent check-in count in last 7 days)
   *
   * Already-attended events are excluded.
   * Cold start: if personalized query returns empty (new user), falls back
   * to trending events (location-aware if lat/lon provided, global otherwise).
   *
   * Cached 600s per user, invalidated on check-in create/delete.
   */
  async getRecommendedEvents(
    userId: string,
    lat?: number,
    lon?: number,
    radiusKm?: number,
    limit: number = 20
  ): Promise<Event[]> {
    return cache.getOrSet(
      CacheKeys.recommendations(userId),
      () => this.computeRecommendations(userId, lat, lon, radiusKm, limit),
      RECOMMENDATION_TTL
    );
  }

  /**
   * Compute personalized recommendations using three CTEs with weighted scoring.
   */
  private async computeRecommendations(
    userId: string,
    lat?: number,
    lon?: number,
    radiusKm?: number,
    limit: number = 20
  ): Promise<Event[]> {
    try {
      // Build optional Haversine distance filter
      let distanceFilter = '';
      let distanceSelect = '';
      const params: any[] = [userId, limit];

      if (lat !== undefined && lon !== undefined && radiusKm) {
        const latParam = params.length + 1;
        const lonParam = params.length + 2;
        const radiusParam = params.length + 3;
        params.push(lat, lon, radiusKm);

        distanceSelect = `,
          (6371 * acos(
            cos(radians($${latParam})) * cos(radians(v.latitude)) *
            cos(radians(v.longitude) - radians($${lonParam})) +
            sin(radians($${latParam})) * sin(radians(v.latitude))
          )) AS distance_km`;

        distanceFilter = `
          AND v.latitude IS NOT NULL
          AND v.longitude IS NOT NULL
          AND (6371 * acos(
            cos(radians($${latParam})) * cos(radians(v.latitude)) *
            cos(radians(v.longitude) - radians($${lonParam})) +
            sin(radians($${latParam})) * sin(radians(v.latitude))
          )) <= $${radiusParam}`;
      }

      const query = `
        WITH user_genres AS (
          -- User's top 5 genres by check-in count
          SELECT b.genre, COUNT(DISTINCT c.id) as genre_count
          FROM checkins c
          JOIN event_lineup el ON c.event_id = el.event_id
          JOIN bands b ON el.band_id = b.id
          WHERE c.user_id = $1 AND b.genre IS NOT NULL
            AND (c.is_hidden IS NOT TRUE)
          GROUP BY b.genre
          ORDER BY genre_count DESC
          LIMIT 5
        ),
        friend_checkins AS (
          -- Friends checked into upcoming events (excluding blocked users)
          SELECT c.event_id, COUNT(DISTINCT c.user_id) as friend_count
          FROM checkins c
          JOIN user_followers uf ON c.user_id = uf.following_id
          WHERE uf.follower_id = $1
            AND c.event_id IN (
              SELECT id FROM events WHERE event_date >= CURRENT_DATE AND is_cancelled = FALSE
            )
            AND (c.is_hidden IS NOT TRUE)
            AND NOT EXISTS (
              SELECT 1 FROM user_blocks
              WHERE (blocker_id = $1 AND blocked_id = c.user_id)
                 OR (blocker_id = c.user_id AND blocked_id = $1)
            )
          GROUP BY c.event_id
        ),
        recent_trending AS (
          -- Recent check-in counts per event (last 7 days)
          SELECT event_id, COUNT(*) as checkin_count
          FROM checkins
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND (is_hidden IS NOT TRUE)
          GROUP BY event_id
        )
        SELECT e.*, v.id as v_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id AND c.is_hidden IS NOT TRUE) as checkin_count,
          COALESCE(MAX(ug.genre_count), 0) * 3.0 as genre_score,
          COALESCE(fc.friend_count, 0) * 5.0 as friend_score,
          COALESCE(rt.checkin_count, 0) * 1.0 as trending_score,
          (COALESCE(MAX(ug.genre_count), 0) * 3.0 +
           COALESCE(fc.friend_count, 0) * 5.0 +
           COALESCE(rt.checkin_count, 0) * 1.0) as total_score
          ${distanceSelect}
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        LEFT JOIN event_lineup el ON e.id = el.event_id
        LEFT JOIN bands b ON el.band_id = b.id
        LEFT JOIN user_genres ug ON b.genre = ug.genre
        LEFT JOIN friend_checkins fc ON e.id = fc.event_id
        LEFT JOIN recent_trending rt ON e.id = rt.event_id
        WHERE e.event_date >= CURRENT_DATE
          AND e.is_cancelled = FALSE
          AND e.id NOT IN (SELECT event_id FROM checkins WHERE user_id = $1 AND event_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM user_blocks
            WHERE (blocker_id = $1 AND blocked_id = e.created_by_user_id)
               OR (blocker_id = e.created_by_user_id AND blocked_id = $1)
          )
          ${distanceFilter}
        GROUP BY e.id, v.id, v.name, v.city, v.state, v.image_url, fc.friend_count, rt.checkin_count
        HAVING (COALESCE(MAX(ug.genre_count), 0) * 3.0 +
                COALESCE(fc.friend_count, 0) * 5.0 +
                COALESCE(rt.checkin_count, 0) * 1.0) > 0
        ORDER BY total_score DESC
        LIMIT $2
      `;

      const result = await this.db.query(query, params);

      // If we got results, hydrate with lineup data
      if (result.rows.length > 0) {
        return this.eventService.mapDbEventsWithHeadliner(result.rows);
      }

      // Cold start fallback: no personalized results (new user with no history/friends)
      // Fall back to trending events
      if (lat !== undefined && lon !== undefined) {
        return this.eventService.getTrendingNearby(lat, lon, radiusKm || 50, 7, limit);
      }
      return this.eventService.getTrendingEvents(limit);
    } catch (error) {
      console.error('Compute recommendations error:', error);
      return [];
    }
  }

  // ============================================
  // Aggregate Ratings (Plan 1)
  // ============================================

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
        WHERE cbr.band_id = $1
          AND (c.is_hidden IS NOT TRUE)`,
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
        WHERE c.venue_id = $1 AND c.venue_rating IS NOT NULL AND c.venue_rating > 0
          AND (c.is_hidden IS NOT TRUE)`,
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
