import Database from '../config/database';
import { Band } from '../types';

export interface WishlistItem {
  id: string;
  userId: string;
  bandId: string;
  notifyWhenNearby: boolean;
  createdAt: string;
  band?: Band;
}

export interface WishlistResult {
  success: boolean;
  isWishlisted: boolean;
  wishlistItem?: WishlistItem;
}

export interface WishlistListResult {
  items: WishlistItem[];
  total: number;
  page: number;
  limit: number;
}

export class WishlistService {
  private db = Database.getInstance();

  /**
   * Add a band to wishlist
   */
  async addToWishlist(
    userId: string,
    bandId: string,
    notifyWhenNearby: boolean = true
  ): Promise<WishlistResult> {
    // Check if already wishlisted
    const existingItem = await this.isWishlisted(userId, bandId);
    if (existingItem) {
      return { success: true, isWishlisted: true, wishlistItem: existingItem };
    }

    // Verify band exists and is active
    const bandCheckQuery = `
      SELECT id FROM bands WHERE id = $1 AND is_active = true
    `;
    const bandResult = await this.db.query(bandCheckQuery, [bandId]);
    if (bandResult.rows.length === 0) {
      throw new Error('Band not found');
    }

    // Create wishlist entry
    const query = `
      INSERT INTO user_wishlist (user_id, band_id, notify_when_nearby)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, band_id) DO NOTHING
      RETURNING id, user_id, band_id, notify_when_nearby, created_at
    `;

    const result = await this.db.query(query, [userId, bandId, notifyWhenNearby]);

    if (result.rows.length === 0) {
      // Already exists due to race condition, fetch it
      const existing = await this.isWishlisted(userId, bandId);
      return { success: true, isWishlisted: true, wishlistItem: existing || undefined };
    }

    const item = this.mapRowToWishlistItem(result.rows[0]);
    return { success: true, isWishlisted: true, wishlistItem: item };
  }

  /**
   * Remove a band from wishlist by wishlist item ID
   */
  async removeFromWishlistById(userId: string, wishlistId: string): Promise<WishlistResult> {
    const query = `
      DELETE FROM user_wishlist
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    await this.db.query(query, [wishlistId, userId]);

    return {
      success: true,
      isWishlisted: false,
    };
  }

  /**
   * Remove a band from wishlist by band ID
   */
  async removeFromWishlistByBandId(userId: string, bandId: string): Promise<WishlistResult> {
    const query = `
      DELETE FROM user_wishlist
      WHERE user_id = $1 AND band_id = $2
      RETURNING id
    `;

    await this.db.query(query, [userId, bandId]);

    return {
      success: true,
      isWishlisted: false,
    };
  }

  /**
   * Check if a band is wishlisted by the user
   */
  async isWishlisted(userId: string, bandId: string): Promise<WishlistItem | null> {
    const query = `
      SELECT id, user_id, band_id, notify_when_nearby, created_at
      FROM user_wishlist
      WHERE user_id = $1 AND band_id = $2
    `;

    const result = await this.db.query(query, [userId, bandId]);
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWishlistItem(result.rows[0]);
  }

  /**
   * Get the user's wishlist with band details
   */
  async getWishlist(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<WishlistListResult> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_wishlist uw
      INNER JOIN bands b ON b.id = uw.band_id
      WHERE uw.user_id = $1 AND b.is_active = true
    `;
    const countResult = await this.db.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Get wishlist items with band details
    const query = `
      SELECT
        uw.id, uw.user_id, uw.band_id, uw.notify_when_nearby, uw.created_at,
        b.id as b_id, b.name as b_name, b.description as b_description,
        b.genre as b_genre, b.formed_year as b_formed_year,
        b.website_url as b_website_url, b.spotify_url as b_spotify_url,
        b.instagram_url as b_instagram_url, b.facebook_url as b_facebook_url,
        b.image_url as b_image_url, b.hometown as b_hometown,
        b.average_rating as b_average_rating, b.total_checkins as b_total_checkins,
        b.is_active as b_is_active, b.created_at as b_created_at, b.updated_at as b_updated_at
      FROM user_wishlist uw
      INNER JOIN bands b ON b.id = uw.band_id
      WHERE uw.user_id = $1 AND b.is_active = true
      ORDER BY uw.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(query, [userId, limit, offset]);
    const items = result.rows.map((row: any) => this.mapRowToWishlistItemWithBand(row));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Update notification preference for a wishlist item
   */
  async updateNotificationPreference(
    userId: string,
    bandId: string,
    notifyWhenNearby: boolean
  ): Promise<WishlistItem | null> {
    const query = `
      UPDATE user_wishlist
      SET notify_when_nearby = $3
      WHERE user_id = $1 AND band_id = $2
      RETURNING id, user_id, band_id, notify_when_nearby, created_at
    `;

    const result = await this.db.query(query, [userId, bandId, notifyWhenNearby]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToWishlistItem(result.rows[0]);
  }

  /**
   * Get wishlist count for a user
   */
  async getWishlistCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*) as total
      FROM user_wishlist uw
      INNER JOIN bands b ON b.id = uw.band_id
      WHERE uw.user_id = $1 AND b.is_active = true
    `;

    const result = await this.db.query(query, [userId]);
    return parseInt(result.rows[0].total) || 0;
  }

  /**
   * Map a database row to a WishlistItem
   */
  private mapRowToWishlistItem(row: any): WishlistItem {
    return {
      id: row.id,
      userId: row.user_id,
      bandId: row.band_id,
      notifyWhenNearby: row.notify_when_nearby,
      createdAt: row.created_at,
    };
  }

  /**
   * Map a database row (with joined band data) to a WishlistItem with band details
   */
  private mapRowToWishlistItemWithBand(row: any): WishlistItem {
    return {
      id: row.id,
      userId: row.user_id,
      bandId: row.band_id,
      notifyWhenNearby: row.notify_when_nearby,
      createdAt: row.created_at,
      band: {
        id: row.b_id,
        name: row.b_name,
        description: row.b_description || undefined,
        genre: row.b_genre || undefined,
        formedYear: row.b_formed_year || undefined,
        websiteUrl: row.b_website_url || undefined,
        spotifyUrl: row.b_spotify_url || undefined,
        instagramUrl: row.b_instagram_url || undefined,
        facebookUrl: row.b_facebook_url || undefined,
        imageUrl: row.b_image_url || undefined,
        hometown: row.b_hometown || undefined,
        averageRating: parseFloat(row.b_average_rating) || 0,
        totalCheckins: parseInt(row.b_total_checkins) || 0,
        isActive: row.b_is_active,
        createdAt: row.b_created_at,
        updatedAt: row.b_updated_at,
      },
    };
  }
}
