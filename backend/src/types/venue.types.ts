// Venue-related types

export interface Venue {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  websiteUrl?: string;
  phone?: string;
  email?: string;
  capacity?: number;
  venueType?: VenueType;
  imageUrl?: string;
  coverImageUrl?: string;
  averageRating: number;
  totalCheckins: number;
  isActive: boolean;
  claimedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export type VenueType =
  | 'concert_hall'
  | 'club'
  | 'arena'
  | 'outdoor'
  | 'bar'
  | 'theater'
  | 'stadium'
  | 'other';

export interface CreateVenueRequest {
  name: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  websiteUrl?: string;
  phone?: string;
  email?: string;
  capacity?: number;
  venueType?: VenueType;
  imageUrl?: string;
}

// Venue aggregate stats (Discovery)
export interface VenueAggregate {
  avgExperienceRating: number;
  totalRatings: number;
  uniqueVisitors: number;
}

export interface TopRatedVenue {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  avgRating: number;
  timesVisited: number;
}
