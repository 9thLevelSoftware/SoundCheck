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
export declare class UserService {
    private authService;
    private profileService;
    private statsService;
    constructor();
    /**
     * Create a new user
     * @deprecated Use AuthService.register() directly
     */
    createUser(userData: CreateUserRequest): Promise<AuthResponse>;
    /**
     * Authenticate user login
     * @deprecated Use AuthService.authenticate() directly
     */
    authenticateUser(loginData: LoginRequest): Promise<AuthResponse>;
    /**
     * Find user by ID
     * @deprecated Use ProfileService.findById() directly
     */
    findById(userId: string): Promise<User | null>;
    /**
     * Find user by email
     * @deprecated Use AuthService.findByEmail() directly
     */
    findByEmail(email: string): Promise<User | null>;
    /**
     * Find user by username
     * @deprecated Use ProfileService.findByUsername() or AuthService.findByUsername()
     */
    findByUsername(username: string): Promise<User | null>;
    /**
     * Update user profile
     * @deprecated Use ProfileService.updateProfile() directly
     */
    updateProfile(userId: string, updateData: Partial<User>): Promise<User>;
    /**
     * Deactivate user account.
     * Also dismisses pending reports targeting this user (CFR-DI-008).
     * @deprecated Use ProfileService.deactivateAccount() directly
     */
    deactivateAccount(userId: string): Promise<void>;
    /**
     * Search users by username or display name
     * @deprecated Use ProfileService.searchUsers() directly
     */
    searchUsers(query: string, limit?: number, offset?: number): Promise<{
        users: Array<{
            id: string;
            username: string;
            displayName: string | null;
            profileImageUrl: string | null;
            bio: string | null;
        }>;
        hasMore: boolean;
    }>;
    /**
     * Get user statistics
     * @deprecated Use UserStatsService.getUserStats() directly
     */
    getUserStats(userId: string): Promise<{
        totalCheckins: number;
        badgesEarned: number;
        followersCount: number;
        followingCount: number;
        uniqueVenues: number;
        uniqueBands: number;
    }>;
}
//# sourceMappingURL=UserService.d.ts.map