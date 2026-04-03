// Check-in related types

// Note: FeedItem is used in check-ins and feed contexts
export interface FeedItem {
  id: string;
  checkinId: string;
  userId: string;
  username: string;
  userAvatarUrl: string | null;
  eventId: string;
  eventName: string;
  venueName: string;
  photoUrl: string | null;
  createdAt: string;
  hasBadgeEarned: boolean;
  toastCount: number;
  commentCount: number;
  hasUserToasted: boolean;
}

export interface FeedCursorResponse extends CursorPaginatedResult<FeedItem> {
  totalUnread?: number;
}

// Pagination types (used by feed and other list endpoints)
export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
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
  venueType?: import('./venue.types').VenueType;
  rating?: number;
}
