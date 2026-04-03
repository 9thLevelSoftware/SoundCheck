// API Response types and general utilities

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  retryAfter?: number; // Seconds to wait before retry (for 503/429 responses)
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
    total?: number;
  };
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
  topBands: import('./band.types').TopRatedBand[];
  topVenues: import('./venue.types').TopRatedVenue[];
}

export interface GenreStat {
  genre: string;
  count: number;
  percentage: number;
}

// Search results aggregate
export interface SearchResults {
  bands: import('./band.types').Band[];
  venues: import('./venue.types').Venue[];
  events: import('./event.types').Event[];
  users?: import('./user.types').SearchUserResult[];
}

// Express Request with user augmentation
declare module 'express' {
  interface Request {
    user?: import('./user.types').User;
  }
}
