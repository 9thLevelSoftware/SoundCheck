"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const user_1 = require("./user");
class UserService {
    constructor() {
        this.authService = new user_1.AuthService();
        this.profileService = new user_1.ProfileService();
        this.statsService = new user_1.UserStatsService();
    }
    /**
     * Create a new user
     * @deprecated Use AuthService.register() directly
     */
    async createUser(userData) {
        return this.authService.register(userData);
    }
    /**
     * Authenticate user login
     * @deprecated Use AuthService.authenticate() directly
     */
    async authenticateUser(loginData) {
        return this.authService.authenticate(loginData);
    }
    /**
     * Find user by ID
     * @deprecated Use ProfileService.findById() directly
     */
    async findById(userId) {
        return this.profileService.findById(userId);
    }
    /**
     * Find user by email
     * @deprecated Use AuthService.findByEmail() directly
     */
    async findByEmail(email) {
        return this.authService.findByEmail(email);
    }
    /**
     * Find user by username
     * @deprecated Use ProfileService.findByUsername() or AuthService.findByUsername()
     */
    async findByUsername(username) {
        return this.profileService.findByUsername(username);
    }
    /**
     * Update user profile
     * @deprecated Use ProfileService.updateProfile() directly
     */
    async updateProfile(userId, updateData) {
        return this.profileService.updateProfile(userId, updateData);
    }
    /**
     * Deactivate user account.
     * Also dismisses pending reports targeting this user (CFR-DI-008).
     * @deprecated Use ProfileService.deactivateAccount() directly
     */
    async deactivateAccount(userId) {
        return this.profileService.deactivateAccount(userId);
    }
    /**
     * Search users by username or display name
     * @deprecated Use ProfileService.searchUsers() directly
     */
    async searchUsers(query, limit = 20, offset = 0) {
        return this.profileService.searchUsers(query, limit, offset);
    }
    /**
     * Get user statistics
     * @deprecated Use UserStatsService.getUserStats() directly
     */
    async getUserStats(userId) {
        return this.statsService.getUserStats(userId);
    }
}
exports.UserService = UserService;
//# sourceMappingURL=UserService.js.map