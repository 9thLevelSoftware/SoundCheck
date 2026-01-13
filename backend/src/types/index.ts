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
  createdAt: string;
}

export type BadgeType = 'review_count' | 'venue_explorer' | 'music_lover' | 'event_attendance' | 'helpful_count';

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  badge?: Badge;
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

// Express Request with user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}