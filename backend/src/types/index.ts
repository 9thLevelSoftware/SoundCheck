// TypeScript type definitions for SoundCheck backend

export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  profileImageUrl?: string;
  location?: string;
  dateOfBirth?: string;
  isVerified: boolean;
  isActive: boolean;
  isAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
  // Statistics (populated on profile requests)
  totalCheckins?: number;
  uniqueBands?: number;
  uniqueVenues?: number;
  followersCount?: number;
  followingCount?: number;
  badgesCount?: number;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  username: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

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
  createdAt: string;
  updatedAt: string;
}

export type VenueType = 'concert_hall' | 'club' | 'arena' | 'outdoor' | 'bar' | 'theater' | 'stadium' | 'other';

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

export interface Band {
  id: string;
  name: string;
  description?: string;
  genre?: string;
  formedYear?: number;
  websiteUrl?: string;
  spotifyUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  imageUrl?: string;
  hometown?: string;
  averageRating: number;
  totalCheckins: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBandRequest {
  name: string;
  description?: string;
  genre?: string;
  formedYear?: number;
  websiteUrl?: string;
  spotifyUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  imageUrl?: string;
  hometown?: string;
}

export interface Review {
  id: string;
  userId: string;
  venueId?: string;
  bandId?: string;
  rating: number;
  title?: string;
  content?: string;
  eventDate?: string;
  imageUrls?: string[];
  isVerified: boolean;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  // Populated fields
  user?: User;
  venue?: Venue;
  band?: Band;
}

export interface CreateReviewRequest {
  venueId?: string;
  bandId?: string;
  rating: number;
  title?: string;
  content?: string;
  eventDate?: string;
  imageUrls?: string[];
}

export interface Badge {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  badgeType: BadgeType;
  requirementValue?: number;
  color?: string;
  criteria?: Record<string, any>;
  createdAt: string;
}

export type BadgeType = 'checkin_count' | 'genre_explorer' | 'unique_venues' | 'superfan' | 'festival_warrior' | 'road_warrior';

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  badge?: Badge;
  metadata?: Record<string, any>;
}

export interface UserFollower {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
  follower?: User;
  following?: User;
}

export interface ReviewHelpfulness {
  id: string;
  userId: string;
  reviewId: string;
  isHelpful: boolean;
  createdAt: string;
}

// Event types (events + event_lineup tables)
export interface Event {
  id: string;
  venueId: string;
  eventDate: Date;
  eventName?: string;
  description?: string;
  doorsTime?: string;
  startTime?: string;
  endTime?: string;
  ticketUrl?: string;
  ticketPriceMin?: number;
  ticketPriceMax?: number;
  isSoldOut: boolean;
  isCancelled: boolean;
  eventType: string;
  source: string;
  status?: string;
  externalId?: string;
  createdByUserId?: string;
  isVerified: boolean;
  totalCheckins: number;
  createdAt: Date;
  updatedAt: Date;
  // Populated fields
  venue?: {
    id: string;
    name: string;
    city?: string;
    state?: string;
    imageUrl?: string;
  };
  lineup?: EventLineupEntry[];
  checkinCount?: number;
  // Backward-compat fields for mobile app
  bandId?: string;
  band?: {
    id: string;
    name: string;
    genre?: string;
    imageUrl?: string;
  };
  showDate?: Date;
}

/**
 * Request body for creating a user-submitted event.
 * Users provide venue, date, and lineup (either existing band IDs or band names to resolve).
 */
export interface CreateUserEventRequest {
  venueId: string;
  eventDate: string;
  eventName?: string;
  description?: string;
  doorsTime?: string;
  startTime?: string;
  ticketUrl?: string;
  lineup: Array<{
    bandId?: string;
    bandName?: string;
    setOrder?: number;
    isHeadliner?: boolean;
  }>;
}

export interface EventLineupEntry {
  id: string;
  bandId: string;
  setOrder: number;
  setTime?: string;
  isHeadliner: boolean;
  band?: {
    id: string;
    name: string;
    genre?: string;
    imageUrl?: string;
  };
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
    total?: number;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SearchQuery extends PaginationQuery {
  q?: string;
  city?: string;
  genre?: string;
  venueType?: VenueType;
  rating?: number;
}

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
}

// Database connection types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// Concert Cred types (Phase 6)
export interface ConcertCred {
  totalShows: number;
  uniqueBands: number;
  uniqueVenues: number;
  badgesEarned: number;
  followersCount: number;
  followingCount: number;
  genres: GenreStat[];
  topBands: TopRatedBand[];
  topVenues: TopRatedVenue[];
}

export interface GenreStat {
  genre: string;
  count: number;
  percentage: number;
}

export interface TopRatedBand {
  id: string;
  name: string;
  genre: string | null;
  imageUrl: string | null;
  avgRating: number;
  timesSeen: number;
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

// Discovery aggregate types (Phase 7)
export interface BandAggregate {
  avgPerformanceRating: number;
  totalRatings: number;
  uniqueFans: number;
}

export interface VenueAggregate {
  avgExperienceRating: number;
  totalRatings: number;
  uniqueVisitors: number;
}

// Express Request with user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}