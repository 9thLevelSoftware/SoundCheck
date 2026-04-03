import axios, { AxiosInstance } from 'axios';
import Database from '../config/database';
import { getCache, setCache } from '../utils/cache';
import logger from '../utils/logger';

// Cache TTL constants (in seconds)
const CACHE_TTL = {
  ARTIST_SEARCH: 86400, // 24 hours
  ARTIST_DETAILS: 86400, // 24 hours
  GENRE_SEARCH: 21600, // 6 hours
};

// Cache key builders
const CacheKeys = {
  musicBrainzArtistSearch: (name: string) => `mb:artist:search:${normalizeCacheKey(name)}`,
  musicBrainzArtistDetails: (mbid: string) => `mb:artist:${mbid}`,
  musicBrainzGenreSearch: (genre: string) => `mb:genre:${normalizeCacheKey(genre)}`,
};

// Normalize strings for consistent cache keys
function normalizeCacheKey(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

interface MusicBrainzArtist {
  id: string; // MusicBrainz ID (MBID)
  name: string;
  disambiguation?: string;
  type?: string; // "Group", "Person", etc.
  'type-id'?: string;
  score?: number; // Search relevance score
  country?: string;
  'life-span'?: {
    begin?: string; // Formation year
    end?: string;
    ended?: boolean;
  };
  tags?: Array<{
    count: number;
    name: string;
  }>;
  area?: {
    name: string; // Hometown/origin
  };
}

interface MusicBrainzSearchResponse {
  created: string;
  count: number;
  offset: number;
  artists: MusicBrainzArtist[];
}

export class MusicBrainzService {
  private client: AxiosInstance;
  private db = Database.getInstance();
  private userAgent: string;
  private lastRequestTime: number = 0;
  private REQUEST_DELAY = 1000; // 1 second between requests (MusicBrainz requirement)

  constructor() {
    this.userAgent = process.env.MUSICBRAINZ_USER_AGENT || 'SoundCheck/1.0';

    this.client = axios.create({
      baseURL: 'https://musicbrainz.org/ws/2',
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    });
  }

  /**
   * Rate limit helper - ensures 1 request per second
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.REQUEST_DELAY) {
      const waitTime = this.REQUEST_DELAY - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Search for artists/bands by name
   */
  async searchArtists(query: string, limit: number = 20): Promise<MusicBrainzArtist[]> {
    // Try cache first
    const cacheKey = CacheKeys.musicBrainzArtistSearch(query);
    try {
      const cached = await getCache<MusicBrainzArtist[]>(cacheKey);
      if (cached) {
        logger.debug('MusicBrainz artist search cache hit', { query });
        return cached;
      }
    } catch (cacheError) {
      logger.warn('Cache read failed for artist search, proceeding with API call', { cacheError });
    }

    try {
      await this.respectRateLimit();

      const response = await this.client.get<MusicBrainzSearchResponse>('/artist', {
        params: {
          query,
          limit,
          fmt: 'json',
        },
      });

      const results = response.data.artists || [];

      // Cache the results
      try {
        await setCache(cacheKey, results, CACHE_TTL.ARTIST_SEARCH);
      } catch (cacheError) {
        logger.warn('Cache write failed for artist search', { cacheError });
      }

      return results;
    } catch (error) {
      logger.warn('MusicBrainz search error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error('Failed to search artists from MusicBrainz', { cause: error });
    }
  }

  /**
   * Get detailed artist information by MusicBrainz ID
   */
  async getArtistDetails(mbid: string): Promise<MusicBrainzArtist> {
    // Try cache first
    const cacheKey = CacheKeys.musicBrainzArtistDetails(mbid);
    try {
      const cached = await getCache<MusicBrainzArtist>(cacheKey);
      if (cached) {
        logger.debug('MusicBrainz artist details cache hit', { mbid });
        return cached;
      }
    } catch (cacheError) {
      logger.warn('Cache read failed for artist details, proceeding with API call', { cacheError });
    }

    try {
      await this.respectRateLimit();

      const response = await this.client.get<MusicBrainzArtist>(`/artist/${mbid}`, {
        params: {
          inc: 'tags+ratings', // Include tags and ratings
          fmt: 'json',
        },
      });

      const result = response.data;

      // Cache the result
      try {
        await setCache(cacheKey, result, CACHE_TTL.ARTIST_DETAILS);
      } catch (cacheError) {
        logger.warn('Cache write failed for artist details', { cacheError });
      }

      return result;
    } catch (error) {
      logger.warn('MusicBrainz details error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error('Failed to get artist details from MusicBrainz', { cause: error });
    }
  }

  /**
   * Import a band from MusicBrainz to our database
   * Returns the band if already exists or creates new one
   */
  async importBand(mbid: string): Promise<any> {
    try {
      // Check if band already exists
      const existingBand = await this.db.query('SELECT * FROM bands WHERE musicbrainz_id = $1', [
        mbid,
      ]);

      if (existingBand.rows.length > 0) {
        return {
          ...this.mapDbBandToBand(existingBand.rows[0]),
          alreadyExists: true,
        };
      }

      // Fetch band details from MusicBrainz
      const artistData = await this.getArtistDetails(mbid);

      // Extract genre from tags (top tag)
      let genre = 'Unknown';
      if (artistData.tags && artistData.tags.length > 0) {
        // Sort tags by count and take the top one
        const sortedTags = [...artistData.tags].sort((a, b) => b.count - a.count);
        genre = sortedTags[0].name;
        // Capitalize first letter
        genre = genre.charAt(0).toUpperCase() + genre.slice(1);
      }

      // Extract formed year from life-span
      let formedYear = null;
      if (artistData['life-span']?.begin) {
        const yearMatch = artistData['life-span'].begin.match(/^\d{4}/);
        if (yearMatch) {
          formedYear = parseInt(yearMatch[0]);
        }
      }

      // Get hometown from area
      let hometown = null;
      if (artistData.area?.name) {
        hometown = artistData.area.name;
        if (artistData.country) {
          hometown = `${hometown}, ${artistData.country}`;
        }
      } else if (artistData.country) {
        hometown = artistData.country;
      }

      // Create description from disambiguation
      let description = `${artistData.name} is a ${artistData.type || 'musical artist'}`;
      if (artistData.disambiguation) {
        description += ` (${artistData.disambiguation})`;
      }
      if (genre !== 'Unknown') {
        description += ` in the ${genre} genre`;
      }
      description += '.';

      // Insert band into database
      const insertQuery = `
        INSERT INTO bands (
          name, description, genre, formed_year, hometown,
          musicbrainz_id, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        artistData.name,
        description,
        genre,
        formedYear,
        hometown,
        mbid,
        'musicbrainz',
      ];

      const result = await this.db.query(insertQuery, values);

      return {
        ...this.mapDbBandToBand(result.rows[0]),
        alreadyExists: false,
      };
    } catch (error) {
      logger.warn('MusicBrainz import error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Search for artists by genre
   */
  async searchByGenre(genre: string, limit: number = 20): Promise<MusicBrainzArtist[]> {
    // Try cache first
    const cacheKey = CacheKeys.musicBrainzGenreSearch(genre);
    try {
      const cached = await getCache<MusicBrainzArtist[]>(cacheKey);
      if (cached) {
        logger.debug('MusicBrainz genre search cache hit', { genre });
        return cached;
      }
    } catch (cacheError) {
      logger.warn('Cache read failed for genre search, proceeding with API call', { cacheError });
    }

    try {
      await this.respectRateLimit();

      const response = await this.client.get<MusicBrainzSearchResponse>('/artist', {
        params: {
          query: `tag:${genre}`,
          limit,
          fmt: 'json',
        },
      });

      const results = response.data.artists || [];

      // Cache the results
      try {
        await setCache(cacheKey, results, CACHE_TTL.GENRE_SEARCH);
      } catch (cacheError) {
        logger.warn('Cache write failed for genre search', { cacheError });
      }

      return results;
    } catch (error) {
      logger.warn('MusicBrainz genre search error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error('Failed to search artists by genre', { cause: error });
    }
  }

  /**
   * Map database band row to Band type
   */
  private mapDbBandToBand(row: any): any {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      genre: row.genre,
      formedYear: row.formed_year,
      websiteUrl: row.website_url,
      spotifyUrl: row.spotify_url,
      instagramUrl: row.instagram_url,
      facebookUrl: row.facebook_url,
      imageUrl: row.image_url,
      hometown: row.hometown,
      averageRating: parseFloat(row.average_rating || 0),
      totalRatings: parseInt(row.total_checkins || 0),
      isActive: row.is_active,
      musicbrainzId: row.musicbrainz_id,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
