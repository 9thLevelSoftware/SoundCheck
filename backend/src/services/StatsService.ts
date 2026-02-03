import Database from '../config/database';
import { cache, CacheKeys } from '../utils/cache';
import { ConcertCred, GenreStat, TopRatedBand, TopRatedVenue } from '../types';

/**
 * StatsService: Computes aggregate concert cred statistics with Redis cache-aside.
 *
 * Aggregates: total shows, unique bands, unique venues, badges, followers/following,
 * genre breakdown, top-rated bands, top-rated venues.
 *
 * Cache: 10-minute TTL via cache.getOrSet(). Invalidated fire-and-forget
 * from CheckinService on create and delete.
 */

const CONCERT_CRED_TTL = 600; // 10 minutes per PRFL-08

export class StatsService {
  private db = Database.getInstance();

  /**
   * Get concert cred for a user with Redis cache-aside.
   * Returns cached result if available, otherwise computes and caches.
   */
  async getConcertCred(userId: string): Promise<ConcertCred> {
    return cache.getOrSet(
      CacheKeys.concertCred(userId),
      () => this.computeConcertCred(userId),
      CONCERT_CRED_TTL
    );
  }

  /**
   * Compute all concert cred dimensions in parallel.
   */
  private async computeConcertCred(userId: string): Promise<ConcertCred> {
    const [basic, genres, topBands, topVenues] = await Promise.all([
      this.getBasicStats(userId),
      this.getGenreBreakdown(userId),
      this.getTopRatedBands(userId),
      this.getTopRatedVenues(userId),
    ]);

    return { ...basic, genres, topBands, topVenues };
  }

  /**
   * Basic aggregate stats: total shows, unique bands, unique venues,
   * badges earned, followers count, following count.
   *
   * Uses scalar subqueries for each dimension in a single SQL call.
   * ::int cast ensures proper PostgreSQL type handling.
   */
  private async getBasicStats(userId: string): Promise<{
    totalShows: number;
    uniqueBands: number;
    uniqueVenues: number;
    badgesEarned: number;
    followersCount: number;
    followingCount: number;
  }> {
    const result = await this.db.query(
      `SELECT
        (SELECT COUNT(DISTINCT c.id)::int FROM checkins c WHERE c.user_id = $1) as total_shows,
        (SELECT COUNT(DISTINCT el.band_id)::int FROM checkins c JOIN event_lineup el ON c.event_id = el.event_id WHERE c.user_id = $1) as unique_bands,
        (SELECT COUNT(DISTINCT c.venue_id)::int FROM checkins c WHERE c.user_id = $1) as unique_venues,
        (SELECT COUNT(DISTINCT ub.badge_id)::int FROM user_badges ub WHERE ub.user_id = $1) as badges_earned,
        (SELECT COUNT(*)::int FROM user_followers WHERE following_id = $1) as followers_count,
        (SELECT COUNT(*)::int FROM user_followers WHERE follower_id = $1) as following_count
      `,
      [userId]
    );

    const row = result.rows[0];
    return {
      totalShows: row?.total_shows ?? 0,
      uniqueBands: row?.unique_bands ?? 0,
      uniqueVenues: row?.unique_venues ?? 0,
      badgesEarned: row?.badges_earned ?? 0,
      followersCount: row?.followers_count ?? 0,
      followingCount: row?.following_count ?? 0,
    };
  }

  /**
   * Genre breakdown: top genres by check-in count.
   * Joins through event_lineup to correctly handle multi-band events
   * and avoid NULL band_id issues (Pitfall 5).
   * Computes percentage from total genre-matched check-ins.
   */
  private async getGenreBreakdown(userId: string, limit: number = 5): Promise<GenreStat[]> {
    const result = await this.db.query(
      `SELECT b.genre, COUNT(DISTINCT c.id)::int as checkin_count
       FROM checkins c
       JOIN event_lineup el ON c.event_id = el.event_id
       JOIN bands b ON el.band_id = b.id
       WHERE c.user_id = $1 AND b.genre IS NOT NULL
       GROUP BY b.genre
       ORDER BY checkin_count DESC
       LIMIT $2`,
      [userId, limit]
    );

    const total = result.rows.reduce((sum: number, r: any) => sum + r.checkin_count, 0);

    return result.rows.map((r: any) => ({
      genre: r.genre,
      count: r.checkin_count,
      percentage: total > 0 ? Math.round((r.checkin_count / total) * 100) : 0,
    }));
  }

  /**
   * Top-rated bands by average band rating from checkin_band_ratings.
   * Ordered by avg_rating DESC, then times_seen DESC.
   * Uses ::numeric(3,2) for proper decimal handling.
   */
  private async getTopRatedBands(userId: string, limit: number = 5): Promise<TopRatedBand[]> {
    const result = await this.db.query(
      `SELECT b.id, b.name, b.genre, b.image_url,
              AVG(cbr.rating)::numeric(3,2) as avg_rating,
              COUNT(DISTINCT c.id)::int as times_seen
       FROM checkin_band_ratings cbr
       JOIN checkins c ON cbr.checkin_id = c.id
       JOIN bands b ON cbr.band_id = b.id
       WHERE c.user_id = $1
       GROUP BY b.id, b.name, b.genre, b.image_url
       ORDER BY avg_rating DESC, times_seen DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      genre: r.genre,
      imageUrl: r.image_url,
      avgRating: parseFloat(r.avg_rating),
      timesSeen: r.times_seen,
    }));
  }

  /**
   * Top-rated venues by average venue rating from checkins.
   * Only includes check-ins where venue_rating > 0 (rated).
   * Ordered by avg_rating DESC, then times_visited DESC.
   * Uses ::numeric(3,2) for proper decimal handling.
   */
  private async getTopRatedVenues(userId: string, limit: number = 5): Promise<TopRatedVenue[]> {
    const result = await this.db.query(
      `SELECT v.id, v.name, v.city, v.state, v.image_url,
              AVG(c.venue_rating)::numeric(3,2) as avg_rating,
              COUNT(DISTINCT c.id)::int as times_visited
       FROM checkins c
       JOIN venues v ON c.venue_id = v.id
       WHERE c.user_id = $1 AND c.venue_rating IS NOT NULL AND c.venue_rating > 0
       GROUP BY v.id, v.name, v.city, v.state, v.image_url
       ORDER BY avg_rating DESC, times_visited DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      imageUrl: r.image_url,
      avgRating: parseFloat(r.avg_rating),
      timesVisited: r.times_visited,
    }));
  }

  /**
   * Invalidate the concert cred cache for a user.
   * Called fire-and-forget from CheckinService on create/delete.
   */
  async invalidate(userId: string): Promise<void> {
    await cache.del(CacheKeys.concertCred(userId));
  }
}
