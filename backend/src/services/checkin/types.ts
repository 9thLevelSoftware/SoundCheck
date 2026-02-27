/**
 * Shared types for check-in services
 * Extracted from CheckinService for use by sub-services
 */

export interface BandRating {
  bandId: string;
  rating: number;
  bandName?: string;
}

export interface VibeTag {
  id: string;
  name: string;
  icon: string;
  category: string;
}

export interface Toast {
  id: string;
  checkinId: string;
  userId: string;
  createdAt: Date;
  user?: {
    id: string;
    username: string;
    profileImageUrl?: string;
  };
}

export interface Comment {
  id: string;
  checkinId: string;
  userId: string;
  content: string;
  createdAt: Date;
  user?: {
    id: string;
    username: string;
    profileImageUrl?: string;
  };
  ownerId?: string; // Check-in owner for WebSocket notifications
}

export interface Checkin {
  id: string;
  userId: string;
  venueId: string;
  bandId: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
  eventDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    username: string;
    profileImageUrl?: string;
  };
  venue?: {
    id: string;
    name: string;
    city?: string;
    state?: string;
    imageUrl?: string;
  };
  band?: {
    id: string;
    name: string;
    genre?: string;
    imageUrl?: string;
  };
  toastCount?: number;
  commentCount?: number;
  hasUserToasted?: boolean;
  vibeTags?: VibeTag[];
  // Event-model fields
  eventId?: string;
  venueRating?: number;
  reviewText?: string;
  imageUrls?: string[];
  isVerified?: boolean;
  event?: { id: string; eventDate?: Date; eventName?: string };
  bandRatings?: BandRating[];
}

export interface CreateCheckinRequest {
  userId: string;
  venueId: string;
  bandId: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
  eventDate?: Date;
  checkinLatitude?: number;
  checkinLongitude?: number;
  vibeTagIds?: string[];
  eventId?: string;
  locationLat?: number;
  locationLon?: number;
}

export interface CreateEventCheckinRequest {
  userId: string;
  eventId: string;
  locationLat?: number;
  locationLon?: number;
  comment?: string;
  vibeTagIds?: string[];
}

export interface AddRatingsRequest {
  bandRatings?: { bandId: string; rating: number }[];
  venueRating?: number;
}

export interface GetCheckinsOptions {
  venueId?: string;
  bandId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

export interface ActivityFeedOptions {
  limit?: number;
  offset?: number;
  latitude?: number;
  longitude?: number;
}

/**
 * Map database check-in row to Checkin type
 * Shared utility used by query services
 */
export function mapDbCheckinToCheckin(row: any): Checkin {
  return {
    id: row.id,
    userId: row.user_id,
    venueId: row.venue_id,
    bandId: row.band_id,
    rating: parseFloat(row.rating) || 0,
    comment: row.comment,
    photoUrl: row.photo_url,
    eventDate: row.event_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: row.username ? {
      id: row.user_id,
      username: row.username,
      profileImageUrl: row.profile_image_url,
    } : undefined,
    venue: row.venue_name ? {
      id: row.venue_id,
      name: row.venue_name,
      city: row.venue_city,
      state: row.venue_state,
      imageUrl: row.venue_image,
    } : undefined,
    band: row.band_name ? {
      id: row.band_id,
      name: row.band_name,
      genre: row.band_genre,
      imageUrl: row.band_image,
    } : undefined,
    toastCount: parseInt(row.toast_count || 0),
    commentCount: parseInt(row.comment_count || 0),
    hasUserToasted: row.has_user_toasted || false,
    // Event-model fields
    eventId: row.event_id || undefined,
    venueRating: row.venue_rating ? parseFloat(row.venue_rating) : undefined,
    reviewText: row.review_text || undefined,
    imageUrls: row.image_urls || undefined,
    isVerified: row.is_verified || false,
    event: row.event_id ? {
      id: row.event_id,
      eventDate: row.ev_event_date,
      eventName: row.ev_event_name,
    } : undefined,
  };
}
