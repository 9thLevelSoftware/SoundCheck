import Database from '../config/database';
import { TrendingEvent } from '../types';
import { BlockService } from './BlockService';
import { cache } from '../utils/cache';

interface TrendingOptions {
  radiusKm?: number;
  days?: number;
  limit?: number;
}

export class TrendingService {
  private db = Database.getInstance();
  private blockService = new BlockService();

  /**
   * Get trending events near a user, ranked by Wilson-scored composite
   * of RSVP count, check-in velocity, friend signals, and proximity decay.
   *
   * Signals:
   *   - rsvp_count: total RSVPs for the event
   *   - checkin_velocity: check-ins in the last 7 days (non-hidden)
   *   - friend_signals: distinct users who RSVP'd AND are followed by the requesting user
   *
   * Scoring:
   *   positive = (rsvp_count * 3 + checkin_velocity * 2 + friend_signals * 5)
   *   total = (rsvp_count + checkin_velocity + friend_signals + 1)
   *   wilson_result = wilson_lower_bound(positive, total)
   *   trending_score = wilson_result * (1.0 / (1.0 + distance_km / 50.0))
   */
  async getTrendingNearUser(
    userId: string,
    lat: number,
    lon: number,
    options?: TrendingOptions
  ): Promise<TrendingEvent[]> {
    const radiusKm = options?.radiusKm ?? 80;
    const days = options?.days ?? 30;
    const limit = options?.limit ?? 20;

    // Cache key: round lat/lon to 2 decimals for spatial bucketing
    const cacheKey = `trending:${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusKm}:${days}:${limit}`;
    return cache.getOrSet(cacheKey, async () => this.fetchTrending(userId, lat, lon, radiusKm, days, limit), 120); // 2 minute TTL
  }

  private async fetchTrending(
    userId: string,
    lat: number,
    lon: number,
    radiusKm: number,
    days: number,
    limit: number
  ): Promise<TrendingEvent[]> {
    const query = `
      SELECT * FROM (
        SELECT
          e.id,
          COALESCE(e.event_name, '') AS event_name,
          e.event_date,
          v.name AS venue_name,
          COALESCE(v.city, '') AS venue_city,
          COALESCE(v.state, '') AS venue_state,
          v.image_url AS venue_image,
          COALESCE(rsvp_stats.rsvp_count, 0)::int AS rsvp_count,
          COALESCE(velocity_stats.checkin_velocity, 0)::int AS checkin_velocity,
          COALESCE(friend_stats.friend_signals, 0)::int AS friend_signals,
          (6371 * acos(
            cos(radians($2)) * cos(radians(v.latitude)) *
            cos(radians(v.longitude) - radians($3)) +
            sin(radians($2)) * sin(radians(v.latitude))
          )) AS distance_km,
          wilson_lower_bound(
            (COALESCE(rsvp_stats.rsvp_count, 0) * 3
             + COALESCE(velocity_stats.checkin_velocity, 0) * 2
             + COALESCE(friend_stats.friend_signals, 0) * 5)::BIGINT,
            (COALESCE(rsvp_stats.rsvp_count, 0)
             + COALESCE(velocity_stats.checkin_velocity, 0)
             + COALESCE(friend_stats.friend_signals, 0) + 1)::BIGINT
          ) AS wilson_result,
          (
            SELECT COALESCE(array_agg(b.name ORDER BY el.set_order), ARRAY[]::text[])
            FROM event_lineup el
            JOIN bands b ON el.band_id = b.id
            WHERE el.event_id = e.id
          ) AS lineup_bands
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS rsvp_count
          FROM event_rsvps er
          WHERE er.event_id = e.id
        ) rsvp_stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS checkin_velocity
          FROM checkins c
          WHERE c.event_id = e.id
            AND c.created_at >= NOW() - INTERVAL '7 days'
            AND c.is_hidden IS NOT TRUE
            ${this.blockService.getBlockFilterSQL(userId, 'c.user_id')}
        ) velocity_stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(DISTINCT er.user_id)::int AS friend_signals
          FROM event_rsvps er
          JOIN user_followers uf ON er.user_id = uf.following_id
          WHERE er.event_id = e.id
            AND uf.follower_id = $1
            ${this.blockService.getBlockFilterSQL(userId, 'er.user_id')}
        ) friend_stats ON TRUE
        WHERE e.event_date >= CURRENT_DATE
          AND e.event_date <= CURRENT_DATE + make_interval(days => $4)
          AND e.is_cancelled = FALSE
          AND v.latitude IS NOT NULL
          AND v.longitude IS NOT NULL
          AND v.latitude BETWEEN ($2 - $5 / 111.0) AND ($2 + $5 / 111.0)
          AND v.longitude BETWEEN ($3 - $5 / (111.0 * cos(radians($2)))) AND ($3 + $5 / (111.0 * cos(radians($2))))
      ) sub
      WHERE distance_km <= $5
      ORDER BY (wilson_result * (1.0 / (1.0 + distance_km / 50.0))) DESC
      LIMIT $6
    `;

    const result = await this.db.query(query, [
      userId,
      lat,
      lon,
      days,
      radiusKm,
      limit,
    ]);

    return result.rows.map((row: any) => this.mapRowToTrendingEvent(row));
  }

  private mapRowToTrendingEvent(row: any): TrendingEvent {
    const wilsonResult = parseFloat(row.wilson_result) || 0;
    const distanceKm = parseFloat(row.distance_km) || 0;
    const trendingScore = wilsonResult * (1.0 / (1.0 + distanceKm / 50.0));

    return {
      id: row.id,
      eventName: row.event_name || 'Unnamed Event',
      eventDate: row.event_date instanceof Date
        ? row.event_date.toISOString().split('T')[0]
        : row.event_date,
      venueName: row.venue_name || 'Unknown Venue',
      venueCity: row.venue_city || '',
      venueState: row.venue_state || '',
      rsvpCount: row.rsvp_count || 0,
      checkinVelocity: row.checkin_velocity || 0,
      friendSignals: row.friend_signals || 0,
      distanceKm: Math.round(distanceKm * 10) / 10,
      trendingScore: Math.round(trendingScore * 10000) / 10000,
      imageUrl: row.venue_image || undefined,
      lineupBands: row.lineup_bands && row.lineup_bands.length > 0
        ? row.lineup_bands
        : undefined,
    };
  }
}
