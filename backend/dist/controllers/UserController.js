"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const UserService_1 = require("../services/UserService");
class UserController {
    constructor(userService) {
        /**
         * Register a new user
         * POST /api/users/register
         */
        this.register = async (req, res) => {
            try {
                const userData = req.body;
                const user = await this.userService.createUser(userData);
                const response = {
                    success: true,
                    data: user,
                    message: 'User registered successfully',
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Registration error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Registration failed',
                };
                res.status(400).json(response);
            }
        };
        /**
         * User login
         * POST /api/users/login
         */
        this.login = async (req, res) => {
            try {
                const loginData = req.body;
                const authResponse = await this.userService.authenticateUser(loginData);
                const response = {
                    success: true,
                    data: authResponse,
                    message: 'Login successful',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Login error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Login failed',
                };
                res.status(401).json(response);
            }
        };
        /**
         * Get current user profile
         * GET /api/users/me
         */
        this.getProfile = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'User not authenticated',
                    };
                    res.status(401).json(response);
                    return;
                }
                const user = await this.userService.findById(req.user.id);
                if (!user) {
                    const response = {
                        success: false,
                        error: 'User not found',
                    };
                    res.status(404).json(response);
                    return;
                }
                // Get user statistics
                const stats = await this.userService.getUserStats(user.id);
                const response = {
                    success: true,
                    data: {
                        ...user,
                        stats,
                    },
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get profile error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch profile',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Update user profile
         * PUT /api/users/me
         */
        this.updateProfile = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'User not authenticated',
                    };
                    res.status(401).json(response);
                    return;
                }
                const updateData = req.body;
                const updatedUser = await this.userService.updateProfile(req.user.id, updateData);
                const response = {
                    success: true,
                    data: updatedUser,
                    message: 'Profile updated successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Update profile error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update profile',
                };
                res.status(400).json(response);
            }
        };
        /**
         * Get user by username
         * GET /api/users/:username
         */
        this.getUserByUsername = async (req, res) => {
            try {
                const { username } = req.params;
                const user = await this.userService.findByUsername(username);
                if (!user) {
                    const response = {
                        success: false,
                        error: 'User not found',
                    };
                    res.status(404).json(response);
                    return;
                }
                // Get user statistics
                const stats = await this.userService.getUserStats(user.id);
                // Remove sensitive information for public profiles
                const publicProfile = {
                    id: user.id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    bio: user.bio,
                    profileImageUrl: user.profileImageUrl,
                    location: user.location,
                    isVerified: user.isVerified,
                    createdAt: user.createdAt,
                    stats,
                };
                const response = {
                    success: true,
                    data: publicProfile,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get user by username error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch user',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Deactivate user account
         * DELETE /api/users/me
         */
        this.deactivateAccount = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'User not authenticated',
                    };
                    res.status(401).json(response);
                    return;
                }
                await this.userService.deactivateAccount(req.user.id);
                const response = {
                    success: true,
                    message: 'Account deactivated successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Deactivate account error:', error);
                const response = {
                    success: false,
                    error: 'Failed to deactivate account',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Check username availability
         * GET /api/users/check-username/:username
         */
        this.checkUsername = async (req, res) => {
            try {
                const { username } = req.params;
                const existingUser = await this.userService.findByUsername(username);
                const isAvailable = !existingUser;
                const response = {
                    success: true,
                    data: {
                        username,
                        available: isAvailable,
                    },
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Check username error:', error);
                const response = {
                    success: false,
                    error: 'Failed to check username availability',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Check email availability
         * GET /api/users/check-email?email=test@example.com
         */
        this.checkEmail = async (req, res) => {
            try {
                const { email } = req.query;
                const existingUser = await this.userService.findByEmail(email);
                const isAvailable = !existingUser;
                const response = {
                    success: true,
                    data: {
                        email,
                        available: isAvailable,
                    },
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Check email error:', error);
                const response = {
                    success: false,
                    error: 'Failed to check email availability',
                };
                res.status(500).json(response);
            }
        };
        this.userService = userService ?? new UserService_1.UserService();
    }
}
exports.UserController = UserController;
//# sourceMappingURL=UserController.js.map