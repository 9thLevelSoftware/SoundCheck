// Band-related types

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
  claimedByUserId?: string;
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

// Band aggregate stats (Discovery)
export interface BandAggregate {
  avgPerformanceRating: number;
  totalRatings: number;
  uniqueFans: number;
}

export interface TopRatedBand {
  id: string;
  name: string;
  genre: string | null;
  imageUrl: string | null;
  avgRating: number;
  timesSeen: number;
}
