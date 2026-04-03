/**
 * User Service -- Facade for user operations
 *
 * This service delegates to specialized sub-services:
 *   - AuthService: login, register, tokens
 *   - ProfileService: profile CRUD, preferences, user search
 *   - UserStatsService: stats aggregation
 *
 * @deprecated Use decomposed services from './user/' instead. This class is maintained
 * for backward compatibility and delegates to AuthService, ProfileService, and UserStatsService.
 */

import { User, CreateUserRequest, LoginRequest, AuthResponse } from '../types';
import { AuthService, ProfileService, UserStatsService } from './user';

export class UserService {
  private authService: AuthService;
  private profileService: ProfileService;
  private statsService: UserStatsService;

  constructor() {
    this.authService = new AuthService();
    this.profileService = new ProfileService();
    this.statsService = new UserStatsService();
  }

  /**
   * Create a new user
   * @deprecated Use AuthService.register() directly
   */
  async createUser(userData: CreateUserRequest): Promise<AuthResponse> {
    return this.authService.register(userData);
  }

  /**
   * Authenticate user login
   * @deprecated Use AuthService.authenticate() directly
   */
  async authenticateUser(loginData: LoginRequest): Promise<AuthResponse> {
    return this.authService.authenticate(loginData);
  }

  /**
   * Find user by ID
   * @deprecated Use ProfileService.findById() directly
   */
  async findById(userId: string): Promise<User | null> {
    return this.profileService.findById(userId);
  }

  /**
   * Find user by email
   * @deprecated Use AuthService.findByEmail() directly
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.authService.findByEmail(email);
  }

  /**
   * Find user by username
   * @deprecated Use ProfileService.findByUsername() or AuthService.findByUsername()
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.profileService.findByUsername(username);
  }

  /**
   * Update user profile
   * @deprecated Use ProfileService.updateProfile() directly
   */
  async updateProfile(userId: string, updateData: Partial<User>): Promise<User> {
    return this.profileService.updateProfile(userId, updateData);
  }

  /**
   * Deactivate user account.
   * Also dismisses pending reports targeting this user (CFR-DI-008).
   * @deprecated Use ProfileService.deactivateAccount() directly
   */
  async deactivateAccount(userId: string): Promise<void> {
    return this.profileService.deactivateAccount(userId);
  }

  /**
   * Search users by username or display name
   * @deprecated Use ProfileService.searchUsers() directly
   */
  async searchUsers(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    users: Array<{
      id: string;
      username: string;
      displayName: string | null;
      profileImageUrl: string | null;
      bio: string | null;
    }>;
    hasMore: boolean;
  }> {
    return this.profileService.searchUsers(query, limit, offset);
  }

  /**
   * Get user statistics
   * @deprecated Use UserStatsService.getUserStats() directly
   */
  async getUserStats(userId: string): Promise<{
    totalCheckins: number;
    badgesEarned: number;
    followersCount: number;
    followingCount: number;
    uniqueVenues: number;
    uniqueBands: number;
  }> {
    return this.statsService.getUserStats(userId);
  }
}
