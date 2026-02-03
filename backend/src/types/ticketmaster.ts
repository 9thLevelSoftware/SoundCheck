/**
 * TypeScript interfaces for Ticketmaster Discovery API v2 responses.
 *
 * These types model the HAL+JSON response format from the Ticketmaster
 * Discovery API. Only fields we actually use are typed -- the API returns
 * many more fields that we ignore.
 *
 * @see https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

// ─── Raw Ticketmaster API Response Types ──────────────────────────────

export interface TicketmasterVenue {
  id: string;
  name: string;
  url?: string;
  address?: { line1: string };
  city?: { name: string };
  state?: { name: string; stateCode: string };
  country?: { countryCode: string };
  postalCode?: string;
  location?: { latitude: string; longitude: string };
  timezone?: string;
}

export interface TicketmasterAttraction {
  id: string;
  name: string;
  classifications?: Array<{
    genre?: { id: string; name: string };
    subGenre?: { id: string; name: string };
  }>;
  images?: Array<{
    url: string;
    ratio?: string;
    width?: number;
    height?: number;
  }>;
}

export interface TicketmasterEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: {
      localDate: string;       // "2026-03-15"
      localTime?: string;      // "19:30:00"
      dateTime?: string;       // ISO 8601 UTC
    };
    status: {
      code: 'onsale' | 'offsale' | 'canceled' | 'postponed' | 'rescheduled';
    };
    timezone?: string;         // IANA timezone
  };
  priceRanges?: Array<{
    min: number;
    max: number;
    currency: string;
    type: string;
  }>;
  _embedded?: {
    venues?: TicketmasterVenue[];
    attractions?: TicketmasterAttraction[];
  };
}

export interface TicketmasterSearchResponse {
  _embedded?: {
    events?: TicketmasterEvent[];
  };
  _links?: {
    self: { href: string };
    next?: { href: string };
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;              // zero-indexed page number
  };
}

// ─── Normalized Internal Types ────────────────────────────────────────

/**
 * Flattened, normalized event after parsing TM response.
 * This is the internal representation used by the sync pipeline.
 */
export interface NormalizedEvent {
  externalId: string;
  name: string;
  date: string;                 // "YYYY-MM-DD"
  startTime: string | null;     // "HH:MM:SS" or null
  status: 'active' | 'cancelled' | 'postponed' | 'rescheduled';
  ticketUrl: string;
  priceMin: number | null;
  priceMax: number | null;
  venue: {
    externalId: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
    lat: number | null;
    lon: number | null;
    timezone: string | null;
  };
  attractions: Array<{
    externalId: string;
    name: string;
    genre: string | null;
    imageUrl: string | null;
  }>;
}

// ─── Search Parameters ────────────────────────────────────────────────

export interface TicketmasterSearchParams {
  latlong: string;              // "lat,lon"
  radius: number;               // miles
  startDateTime: string;        // ISO 8601 with Z suffix
  endDateTime: string;          // ISO 8601 with Z suffix
  size?: number;                // max 200 (default 200)
  page?: number;                // zero-indexed (default 0)
}
