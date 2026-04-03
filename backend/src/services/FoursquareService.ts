import axios, { AxiosInstance } from 'axios';
import Database from '../config/database';
import { sanitizeForLogging } from '../utils/logSanitizer';
import logger from '../utils/logger';

interface FoursquareVenueResult {
  fsq_id: string;
  name: string;
  location: {
    address?: string;
    locality?: string; // city
    region?: string; // state
    postcode?: string;
    country?: string;
  };
  geocodes?: {
    main: {
      latitude: number;
      longitude: number;
    };
  };
  categories?: Array<{
    id: number;
    name: string;
  }>;
  photos?: Array<{
    id: string;
    prefix: string;
    suffix: string;
    width: number;
    height: number;
  }>;
  distance?: number;
}

interface FoursquareSearchResponse {
  results: FoursquareVenueResult[];
}

export class FoursquareService {
  private client: AxiosInstance;
  private db = Database.getInstance();
  private apiKey: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.FOURSQUARE_API_KEY || '';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('FOURSQUARE_API_KEY not configured - Foursquare integration disabled');
      // Create a dummy client to prevent errors
      this.client = axios.create({
        baseURL: 'https://places-api.foursquare.com',
      });
      return;
    }

    this.client = axios.create({
      baseURL: 'https://places-api.foursquare.com',
      headers: {
        Authorization: `Bearer ${this.apiKey}`, // New format requires Bearer prefix
        Accept: 'application/json',
        'X-Places-Api-Version': '2025-11-14', // API version in YYYY-MM-DD format (today's date)
      },
    });
  }

  /**
   * Search for venues by name and location
   */
  async searchVenues(
    query: string,
    location?: { lat: number; lng: number },
    limit: number = 20
  ): Promise<FoursquareVenueResult[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const params: any = {
        query,
        limit,
        categories: '10000,17000', // Arts & Entertainment, Music Venues
      };

      // Add location if provided
      if (location) {
        params.ll = `${location.lat},${location.lng}`;
      }

      const response = await this.client.get<FoursquareSearchResponse>('/places/search', {
        params,
      });

      return response.data.results || [];
    } catch (error: any) {
      logger.warn('Foursquare search error', {
        error: error.message || String(error),
        ...(error.response
          ? {
              status: error.response.status,
              data: error.response.data,
              config: sanitizeForLogging({
                baseURL: error.config.baseURL,
                url: error.config.url,
                params: error.config.params,
                headers: error.config.headers,
              }),
            }
          : {}),
      });
      throw new Error('Failed to search venues from Foursquare', { cause: error });
    }
  }

  /**
   * Get detailed venue information by Foursquare Place ID
   */
  async getVenueDetails(placeId: string): Promise<FoursquareVenueResult> {
    if (!this.enabled) {
      throw new Error('Foursquare integration is disabled');
    }

    try {
      const response = await this.client.get<FoursquareVenueResult>(`/places/${placeId}`, {
        params: {
          fields: 'fsq_id,name,location,geocodes,categories,photos',
        },
      });

      return response.data;
    } catch (error: any) {
      logger.warn('Foursquare getVenueDetails error', {
        error: error.message || 'Unknown error',
        ...(error.config
          ? {
              config: sanitizeForLogging({
                baseURL: error.config.baseURL,
                url: error.config.url,
                params: error.config.params,
                headers: error.config.headers,
              }),
            }
          : {}),
      });
      throw new Error('Failed to get venue details from Foursquare', { cause: error });
    }
  }

  /**
   * Import a venue from Foursquare to our database
   * Returns the venue if already exists or creates new one
   */
  async importVenue(placeId: string): Promise<any> {
    if (!this.enabled) {
      throw new Error('Foursquare integration is disabled');
    }

    try {
      // Check if venue already exists
      const existingVenue = await this.db.query(
        'SELECT * FROM venues WHERE foursquare_place_id = $1',
        [placeId]
      );

      if (existingVenue.rows.length > 0) {
        return {
          ...this.mapDbVenueToVenue(existingVenue.rows[0]),
          alreadyExists: true,
        };
      }

      // Fetch venue details from Foursquare
      const venueData = await this.getVenueDetails(placeId);

      // Determine venue type based on categories
      let venueType = 'club'; // default
      if (venueData.categories && venueData.categories.length > 0) {
        const categoryName = venueData.categories[0].name.toLowerCase();
        if (categoryName.includes('arena') || categoryName.includes('stadium')) {
          venueType = 'arena';
        } else if (categoryName.includes('concert') || categoryName.includes('theater')) {
          venueType = 'concert_hall';
        } else if (categoryName.includes('outdoor') || categoryName.includes('amphitheater')) {
          venueType = 'outdoor';
        } else if (categoryName.includes('bar') || categoryName.includes('club')) {
          venueType = 'club';
        }
      }

      // Get photo URL if available
      let imageUrl = null;
      if (venueData.photos && venueData.photos.length > 0) {
        const photo = venueData.photos[0];
        imageUrl = `${photo.prefix}original${photo.suffix}`;
      }

      // Insert venue into database
      const insertQuery = `
        INSERT INTO venues (
          name, address, city, state, country, postal_code,
          latitude, longitude, venue_type, image_url,
          foursquare_place_id, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const values = [
        venueData.name,
        venueData.location?.address || null,
        venueData.location?.locality || null,
        venueData.location?.region || null,
        venueData.location?.country || null,
        venueData.location?.postcode || null,
        venueData.geocodes?.main?.latitude || null,
        venueData.geocodes?.main?.longitude || null,
        venueType,
        imageUrl,
        placeId,
        'foursquare',
      ];

      const result = await this.db.query(insertQuery, values);

      return {
        ...this.mapDbVenueToVenue(result.rows[0]),
        alreadyExists: false,
      };
    } catch (error: any) {
      logger.warn('Foursquare importVenue error', {
        error: error.message || 'Unknown error',
        ...(error.config
          ? {
              config: sanitizeForLogging({
                baseURL: error.config.baseURL,
                url: error.config.url,
                params: error.config.params,
                headers: error.config.headers,
              }),
            }
          : {}),
      });
      throw error;
    }
  }

  /**
   * Search for nearby venues
   */
  async searchNearbyVenues(
    lat: number,
    lng: number,
    radius: number = 5000, // meters
    limit: number = 20
  ): Promise<FoursquareVenueResult[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.client.get<FoursquareSearchResponse>('/places/nearby', {
        params: {
          ll: `${lat},${lng}`,
          radius,
          limit,
          categories: '10000,17000', // Arts & Entertainment, Music Venues
        },
      });

      return response.data.results || [];
    } catch (error: any) {
      logger.warn('Foursquare searchNearbyVenues error', {
        error: error.message || 'Unknown error',
        ...(error.config
          ? {
              config: sanitizeForLogging({
                baseURL: error.config.baseURL,
                url: error.config.url,
                params: error.config.params,
                headers: error.config.headers,
              }),
            }
          : {}),
      });
      throw new Error('Failed to search nearby venues', { cause: error });
    }
  }

  /**
   * Map database venue row to Venue type
   */
  private mapDbVenueToVenue(row: any): any {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      address: row.address,
      city: row.city,
      state: row.state,
      country: row.country,
      postalCode: row.postal_code,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      websiteUrl: row.website_url,
      phone: row.phone,
      email: row.email,
      capacity: row.capacity,
      venueType: row.venue_type,
      imageUrl: row.image_url,
      averageRating: parseFloat(row.average_rating || 0),
      totalRatings: parseInt(row.total_checkins || 0),
      isActive: row.is_active,
      foursquarePlaceId: row.foursquare_place_id,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
