import Database from '../config/database';

export interface ExportedProfile {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  location: string | null;
  dateOfBirth: string | null;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedCheckin {
  id: string;
  venueName: string | null;
  venueCity: string | null;
  bandName: string | null;
  bandGenre: string | null;
  rating: number;
  comment: string | null;
  photoUrl: string | null;
  eventDate: string | null;
  createdAt: string;
}

export interface ExportedReview {
  id: string;
  venueName: string | null;
  bandName: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  eventDate: string | null;
  imageUrls: string[] | null;
  isVerified: boolean;
  helpfulCount: number;
  createdAt: string;
}

export interface ExportedFollower {
  id: string;
  username: string;
  followedAt: string;
}

export interface ExportedWishlistItem {
  id: string;
  bandName: string;
  bandGenre: string | null;
  notifyWhenNearby: boolean;
  createdAt: string;
}

export interface ExportedBadge {
  id: string;
  name: string;
  description: string;
  badgeType: string;
  earnedAt: string;
}

export interface GDPRExport {
  format: 'GDPR_EXPORT_V1';
  exportedAt: string;
  profile: ExportedProfile;
  checkins: ExportedCheckin[];
  reviews: ExportedReview[];
  followers: ExportedFollower[];
  following: ExportedFollower[];
  wishlist: ExportedWishlistItem[];
  badges: ExportedBadge[];
}

export class DataExportService {
  private db = Database.getInstance();

  /**
   * Export all user data for GDPR compliance
   * Collects profile, checkins, reviews, followers, following, wishlist, and badges
   * Excludes sensitive fields like password_hash
   */
  async exportUserData(userId: string): Promise<GDPRExport> {
    // Get profile (excluding password_hash)
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw new Error('User not found');
    }

    // Collect all data in parallel for efficiency
    const [checkins, reviews, followers, following, wishlist, badges] = await Promise.all([
      this.getCheckins(userId),
      this.getReviews(userId),
      this.getFollowers(userId),
      this.getFollowing(userId),
      this.getWishlist(userId),
      this.getBadges(userId),
    ]);

    return {
      format: 'GDPR_EXPORT_V1',
      exportedAt: new Date().toISOString(),
      profile,
      checkins,
      reviews,
      followers,
      following,
      wishlist,
      badges,
    };
  }

  /**
   * Get user profile data (excluding password_hash)
   */
  private async getProfile(userId: string): Promise<ExportedProfile | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, created_at, updated_at
      FROM users
      WHERE id = $1
    `;

    const result = await this.db.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      bio: row.bio,
      profileImageUrl: row.profile_image_url,
      location: row.location,
      dateOfBirth: row.date_of_birth ? row.date_of_birth.toISOString() : null,
      isVerified: row.is_verified,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Get user's checkins with venue and band names
   */
  private async getCheckins(userId: string): Promise<ExportedCheckin[]> {
    const query = `
      SELECT c.id, c.rating, c.comment, c.photo_url, c.event_date, c.created_at,
             v.name as venue_name, v.city as venue_city,
             b.name as band_name, b.genre as band_genre
      FROM checkins c
      LEFT JOIN venues v ON c.venue_id = v.id
      LEFT JOIN bands b ON c.band_id = b.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      venueName: row.venue_name,
      venueCity: row.venue_city,
      bandName: row.band_name,
      bandGenre: row.band_genre,
      rating: parseFloat(row.rating) || 0,
      comment: row.comment,
      photoUrl: row.photo_url,
      eventDate: row.event_date ? row.event_date.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Get user's reviews with venue and band names
   */
  private async getReviews(userId: string): Promise<ExportedReview[]> {
    const query = `
      SELECT r.id, r.rating, r.title, r.content, r.event_date, r.image_urls,
             r.is_verified, r.helpful_count, r.created_at,
             v.name as venue_name,
             b.name as band_name
      FROM reviews r
      LEFT JOIN venues v ON r.venue_id = v.id
      LEFT JOIN bands b ON r.band_id = b.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      venueName: row.venue_name,
      bandName: row.band_name,
      rating: row.rating,
      title: row.title,
      content: row.content,
      eventDate: row.event_date ? row.event_date.toISOString() : null,
      imageUrls: row.image_urls,
      isVerified: row.is_verified,
      helpfulCount: row.helpful_count || 0,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Get list of users who follow this user
   */
  private async getFollowers(userId: string): Promise<ExportedFollower[]> {
    const query = `
      SELECT u.id, u.username, uf.created_at as followed_at
      FROM user_followers uf
      INNER JOIN users u ON u.id = uf.follower_id
      WHERE uf.following_id = $1 AND u.is_active = true
      ORDER BY uf.created_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      username: row.username,
      followedAt: row.followed_at.toISOString(),
    }));
  }

  /**
   * Get list of users this user is following
   */
  private async getFollowing(userId: string): Promise<ExportedFollower[]> {
    const query = `
      SELECT u.id, u.username, uf.created_at as followed_at
      FROM user_followers uf
      INNER JOIN users u ON u.id = uf.following_id
      WHERE uf.follower_id = $1 AND u.is_active = true
      ORDER BY uf.created_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      username: row.username,
      followedAt: row.followed_at.toISOString(),
    }));
  }

  /**
   * Get user's wishlist with band details
   */
  private async getWishlist(userId: string): Promise<ExportedWishlistItem[]> {
    const query = `
      SELECT uw.id, uw.notify_when_nearby, uw.created_at,
             b.name as band_name, b.genre as band_genre
      FROM user_wishlist uw
      INNER JOIN bands b ON b.id = uw.band_id
      WHERE uw.user_id = $1 AND b.is_active = true
      ORDER BY uw.created_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      bandName: row.band_name,
      bandGenre: row.band_genre,
      notifyWhenNearby: row.notify_when_nearby,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Get user's earned badges
   */
  private async getBadges(userId: string): Promise<ExportedBadge[]> {
    const query = `
      SELECT ub.id, ub.earned_at,
             b.name, b.description, b.badge_type
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_id = $1
      ORDER BY ub.earned_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      badgeType: row.badge_type,
      earnedAt: row.earned_at.toISOString(),
    }));
  }
}
