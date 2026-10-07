// User-related types

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
  isPremium?: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Server-only instant of the last password change or account deletion.
   * Access tokens issued before this second are rejected. Never send to clients.
   */
  credentialsChangedAt?: string;
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
  refreshToken: string;
}

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string;
  profileImageUrl: string | null;
  bio: string | null;
  totalCheckins: number;
  isVerified: boolean;
}

export type PublicUser = Omit<
  User,
  'email' | 'dateOfBirth' | 'isAdmin' | 'isPremium' | 'credentialsChangedAt'
>;

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  /** Issued-at, in seconds, added by jsonwebtoken. */
  iat?: number;
}

// User following
export interface UserFollower {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
  follower?: User;
  following?: User;
}

// User block
export interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

// Password reset
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}
