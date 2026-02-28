import Database from '../config/database';

export interface WrappedStats {
  year: number;
  totalShows: number;
  uniqueBands: number;
  uniqueVenues: number;
  topGenre: string | null;
  topGenrePercentage: number;
  homeVenueName: string | null;
  homeVenueId: string | null;
  homeVenueVisits: number;
  topArtistName: string | null;
  topArtistId: string | null;
  topArtistTimesSeen: number;
  meetsThreshold: boolean;
}

export interface WrappedDetailStats extends WrappedStats {
  monthlyBreakdown: MonthlyActivity[];
  genreEvolution: GenreMonth[];
  friendOverlap: FriendOverlapEntry[];
  topRatedSets: TopRatedSetEntry[];
}

export interface MonthlyActivity {
  month: number;
  showCount: number;
}

export interface GenreMonth {
  month: number;
  genre: string;
  count: number;
}

export interface FriendOverlapEntry {
  friendId: string;
  friendUsername: string;
  friendProfileImageUrl: string | null;
  sharedShows: number;
}

export interface TopRatedSetEntry {
  bandName: string;
  bandId: string;
  venueName: string;
  eventDate: string;
  rating: number;
}

export class WrappedService {
  private db = Database.getInstance();

  /**
   * Compute basic Wrapped stats for a user and year (free tier).
   */
  async getWrappedStats(userId: string, year: number): Promise<WrappedStats> {
    const [basicCounts, topGenre, homeVenue, topArtist] = await Promise.all([
      this.getBasicCounts(userId, year),
      this.getTopGenre(userId, year),
      this.getHomeVenue(userId, year),
      this.getTopArtist(userId, year),
    ]);

    const totalShows = basicCounts.totalShows;

    return {
      year,
      totalShows,
      uniqueBands: basicCounts.uniqueBands,
      uniqueVenues: basicCounts.uniqueVenues,
      topGenre: topGenre.genre,
      topGenrePercentage: topGenre.percentage,
      homeVenueName: homeVenue.name,
      homeVenueId: homeVenue.id,
      homeVenueVisits: homeVenue.visits,
      topArtistName: topArtist.name,
      topArtistId: topArtist.id,
      topArtistTimesSeen: topArtist.timesSeen,
      meetsThreshold: totalShows >= 3,
    };
  }

  /**
   * Compute premium-only Wrapped detail stats for a user and year.
   */
  async getWrappedDetailStats(userId: string, year: number): Promise<WrappedDetailStats> {
    const [basicStats, monthlyBreakdown, genreEvolution, friendOverlap, topRatedSets] =
      await Promise.all([
        this.getWrappedStats(userId, year),
        this.getMonthlyBreakdown(userId, year),
        this.getGenreEvolution(userId, year),
        this.getFriendOverlap(userId, year),
        this.getTopRatedSets(userId, year),
      ]);

    return {
      ...basicStats,
      monthlyBreakdown,
      genreEvolution,
      friendOverlap,
      topRatedSets,
    };
  }

  private async getBasicCounts(
    userId: string,
    year: number
  ): Promise<{ totalShows: number; uniqueBands: number; uniqueVenues: number }> {
    const result = await this.db.query(
      `SELECT
        (SELECT COUNT(DISTINCT c.id)::int FROM checkins c
         WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
           AND EXTRACT(YEAR FROM c.created_at) = $2) as total_shows,
        (SELECT COUNT(DISTINCT el.band_id)::int FROM checkins c
         JOIN event_lineup el ON c.event_id = el.event_id
         WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
           AND EXTRACT(YEAR FROM c.created_at) = $2) as unique_bands,
        (SELECT COUNT(DISTINCT c.venue_id)::int FROM checkins c
         WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
           AND EXTRACT(YEAR FROM c.created_at) = $2) as unique_venues`,
      [userId, year]
    );
    const row = result.rows[0];
    return {
      totalShows: row.total_shows || 0,
      uniqueBands: row.unique_bands || 0,
      uniqueVenues: row.unique_venues || 0,
    };
  }

  private async getTopGenre(
    userId: string,
    year: number
  ): Promise<{ genre: string | null; percentage: number }> {
    const result = await this.db.query(
      `WITH genre_counts AS (
        SELECT b.genre, COUNT(DISTINCT c.id)::int as cnt
        FROM checkins c
        JOIN event_lineup el ON c.event_id = el.event_id
        JOIN bands b ON el.band_id = b.id
        WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
          AND b.genre IS NOT NULL
          AND EXTRACT(YEAR FROM c.created_at) = $2
        GROUP BY b.genre
        ORDER BY cnt DESC
        LIMIT 1
      ), total AS (
        SELECT COUNT(DISTINCT c.id)::int as cnt
        FROM checkins c
        JOIN event_lineup el ON c.event_id = el.event_id
        JOIN bands b ON el.band_id = b.id
        WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
          AND b.genre IS NOT NULL
          AND EXTRACT(YEAR FROM c.created_at) = $2
      )
      SELECT gc.genre, gc.cnt,
        CASE WHEN t.cnt > 0 THEN ROUND((gc.cnt::numeric / t.cnt) * 100)::int ELSE 0 END as percentage
      FROM genre_counts gc, total t`,
      [userId, year]
    );

    if (result.rows.length === 0) {
      return { genre: null, percentage: 0 };
    }
    return {
      genre: result.rows[0].genre,
      percentage: result.rows[0].percentage || 0,
    };
  }

  private async getHomeVenue(
    userId: string,
    year: number
  ): Promise<{ id: string | null; name: string | null; visits: number }> {
    const result = await this.db.query(
      `SELECT v.id, v.name, COUNT(DISTINCT c.id)::int as visits
       FROM checkins c JOIN venues v ON c.venue_id = v.id
       WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c.created_at) = $2
       GROUP BY v.id, v.name
       ORDER BY visits DESC LIMIT 1`,
      [userId, year]
    );

    if (result.rows.length === 0) {
      return { id: null, name: null, visits: 0 };
    }
    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      visits: result.rows[0].visits,
    };
  }

  private async getTopArtist(
    userId: string,
    year: number
  ): Promise<{ id: string | null; name: string | null; timesSeen: number }> {
    const result = await this.db.query(
      `SELECT b.id, b.name, COUNT(DISTINCT c.id)::int as times_seen
       FROM checkins c
       JOIN event_lineup el ON c.event_id = el.event_id
       JOIN bands b ON el.band_id = b.id
       WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c.created_at) = $2
       GROUP BY b.id, b.name
       ORDER BY times_seen DESC LIMIT 1`,
      [userId, year]
    );

    if (result.rows.length === 0) {
      return { id: null, name: null, timesSeen: 0 };
    }
    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      timesSeen: result.rows[0].times_seen,
    };
  }

  private async getMonthlyBreakdown(userId: string, year: number): Promise<MonthlyActivity[]> {
    const result = await this.db.query(
      `SELECT EXTRACT(MONTH FROM c.created_at)::int as month, COUNT(DISTINCT c.id)::int as show_count
       FROM checkins c WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c.created_at) = $2
       GROUP BY month ORDER BY month`,
      [userId, year]
    );

    // Fill in zero-count months for a full 1-12 array
    const monthMap = new Map<number, number>();
    for (const row of result.rows) {
      monthMap.set(row.month, row.show_count);
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      showCount: monthMap.get(i + 1) || 0,
    }));
  }

  private async getGenreEvolution(userId: string, year: number): Promise<GenreMonth[]> {
    const result = await this.db.query(
      `SELECT EXTRACT(MONTH FROM c.created_at)::int as month, b.genre, COUNT(DISTINCT c.id)::int as count
       FROM checkins c
       JOIN event_lineup el ON c.event_id = el.event_id
       JOIN bands b ON el.band_id = b.id
       WHERE c.user_id = $1 AND b.genre IS NOT NULL AND c.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c.created_at) = $2
       GROUP BY month, b.genre ORDER BY month, count DESC`,
      [userId, year]
    );

    return result.rows.map((row: any) => ({
      month: row.month,
      genre: row.genre,
      count: row.count,
    }));
  }

  private async getFriendOverlap(userId: string, year: number): Promise<FriendOverlapEntry[]> {
    const result = await this.db.query(
      `SELECT f_user.id as friend_id, f_user.username as friend_username,
              f_user.profile_image_url as friend_profile_image_url,
              COUNT(DISTINCT c2.event_id)::int as shared_shows
       FROM checkins c1
       JOIN checkins c2 ON c1.event_id = c2.event_id AND c1.user_id != c2.user_id
       JOIN user_followers uf ON uf.follower_id = $1 AND uf.following_id = c2.user_id
       JOIN users f_user ON f_user.id = c2.user_id
       WHERE c1.user_id = $1 AND c1.is_hidden IS NOT TRUE AND c2.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c1.created_at) = $2
         AND EXTRACT(YEAR FROM c2.created_at) = $2
       GROUP BY f_user.id, f_user.username, f_user.profile_image_url
       ORDER BY shared_shows DESC LIMIT 10`,
      [userId, year]
    );

    return result.rows.map((row: any) => ({
      friendId: row.friend_id,
      friendUsername: row.friend_username,
      friendProfileImageUrl: row.friend_profile_image_url || null,
      sharedShows: row.shared_shows,
    }));
  }

  private async getTopRatedSets(userId: string, year: number): Promise<TopRatedSetEntry[]> {
    const result = await this.db.query(
      `SELECT b.name as band_name, b.id as band_id, v.name as venue_name,
              e.event_date::text as event_date, cbr.rating
       FROM checkin_band_ratings cbr
       JOIN checkins c ON cbr.checkin_id = c.id
       JOIN bands b ON cbr.band_id = b.id
       JOIN events e ON c.event_id = e.id
       JOIN venues v ON c.venue_id = v.id
       WHERE c.user_id = $1 AND c.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c.created_at) = $2
       ORDER BY cbr.rating DESC, e.event_date DESC LIMIT 10`,
      [userId, year]
    );

    return result.rows.map((row: any) => ({
      bandName: row.band_name,
      bandId: row.band_id,
      venueName: row.venue_name,
      eventDate: row.event_date,
      rating: parseFloat(row.rating),
    }));
  }
}
