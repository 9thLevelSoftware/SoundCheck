// Badge-related types

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

export type BadgeType =
  | 'checkin_count'
  | 'genre_explorer'
  | 'unique_venues'
  | 'superfan'
  | 'festival_warrior'
  | 'road_warrior';

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  badge?: Badge;
  metadata?: Record<string, any>;
}
