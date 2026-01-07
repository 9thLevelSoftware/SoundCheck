import { User, CreateUserRequest, LoginRequest, AuthResponse } from '../types';
export declare class UserService {
    private db;
    /**
     * Create a new user
     */
    createUser(userData: CreateUserRequest): Promise<AuthResponse>;
    /**
     * Authenticate user login
     */
    authenticateUser(loginData: LoginRequest): Promise<AuthResponse>;
    /**
     * Find user by ID
     */
    findById(userId: string): Promise<User | null>;
    /**
     * Find user by email
     */
    findByEmail(email: string): Promise<User | null>;
    /**
     * Find user by email including password hash (for authentication)
     */
    private findByEmailWithPassword;
    /**
     * Find user by username
     */
    findByUsername(username: string): Promise<User | null>;
    /**
     * Update user profile
     */
    updateProfile(userId: string, updateData: Partial<User>): Promise<User>;
    /**
     * Deactivate user account
     */
    deactivateAccount(userId: string): Promise<void>;
    /**
     * Get user statistics
     */
    getUserStats(userId: string): Promise<{
        totalCheckins: number;
        totalReviews: number;
        badgesEarned: number;
        followersCount: number;
        followingCount: number;
        uniqueVenues: number;
        uniqueBands: number;
    }>;
}
//# sourceMappingURL=UserService.d.ts.map