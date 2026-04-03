// Event-related types

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

export interface TrendingEvent {
  id: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  venueCity: string;
  venueState: string;
  rsvpCount: number;
  checkinVelocity: number;
  friendSignals: number;
  distanceKm: number;
  trendingScore: number;
  imageUrl?: string;
  lineupBands?: string[];
}
