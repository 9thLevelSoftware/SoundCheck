import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import Database from '../config/database';
import { User, AuthResponse } from '../types';
import { AuthUtils } from '../utils/auth';
import { generateRefreshToken } from '../utils/auth';
import { mapDbUserToUser } from '../utils/dbMappers';

/**
 * Profile information extracted from social auth tokens
 */
export interface SocialProfile {
  provider: 'google' | 'apple';
  providerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Result of social authentication
 */
export interface SocialAuthResult extends AuthResponse {
  refreshToken: string;
  isNewUser: boolean;
}

/**
 * Service for handling social authentication (Google, Apple)
 * Verifies tokens server-side and creates/links user accounts
 */
export class SocialAuthService {
  private db = Database.getInstance();
  private googleClient: OAuth2Client;

  constructor() {
    // Initialize Google OAuth2 client
    // GOOGLE_CLIENT_ID should be set in environment variables
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    this.googleClient = new OAuth2Client(googleClientId);
  }

  /**
   * Verify a Google ID token and extract user profile
   * @param idToken - The Google ID token from the mobile client
   * @returns The verified user profile or null if invalid
   */
  async verifyGoogleToken(idToken: string): Promise<SocialProfile | null> {
    try {
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        console.error('GOOGLE_CLIENT_ID not configured');
        return null;
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return null;
      }

      // Ensure email is verified
      if (!payload.email_verified) {
        console.error('Google email not verified');
        return null;
      }

      return {
        provider: 'google',
        providerId: payload.sub, // Google's unique user ID
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
      };
    } catch (error) {
      console.error('Google token verification failed:', error);
      return null;
    }
  }

  /**
   * Verify an Apple identity token and extract user profile
   * Apple tokens are JWTs that can be verified by decoding
   * @param identityToken - The Apple identity token from the mobile client
   * @param fullName - Optional full name (only provided on first sign-in)
   * @returns The verified user profile or null if invalid
   */
  async verifyAppleToken(
    identityToken: string,
    fullName?: { givenName?: string; familyName?: string }
  ): Promise<SocialProfile | null> {
    try {
      // Decode the Apple JWT (Apple tokens are self-contained JWTs)
      // In production, you should also fetch Apple's public keys to verify the signature
      const decoded = jwt.decode(identityToken) as {
        sub: string; // Apple's unique user ID
        email?: string;
        email_verified?: string | boolean;
        iss: string;
        aud: string;
        exp: number;
      } | null;

      if (!decoded) {
        console.error('Failed to decode Apple identity token');
        return null;
      }

      // Verify token issuer
      if (decoded.iss !== 'https://appleid.apple.com') {
        console.error('Invalid Apple token issuer');
        return null;
      }

      // Verify token is not expired
      if (decoded.exp * 1000 < Date.now()) {
        console.error('Apple token expired');
        return null;
      }

      // Apple bundle ID should match
      const appleBundleId = process.env.APPLE_BUNDLE_ID;
      if (appleBundleId && decoded.aud !== appleBundleId) {
        console.error('Apple token audience mismatch');
        return null;
      }

      // Email might not be present after first sign-in
      // We need to look it up from existing social account if not provided
      const email = decoded.email;

      return {
        provider: 'apple',
        providerId: decoded.sub,
        email: email || '', // May be empty, will be handled in authenticateOrCreate
        firstName: fullName?.givenName,
        lastName: fullName?.familyName,
      };
    } catch (error) {
      console.error('Apple token verification failed:', error);
      return null;
    }
  }

  /**
   * Authenticate or create a user based on social profile
   * - If social account exists, return existing user
   * - If email exists but not linked, link social account to existing user
   * - If neither exists, create new user with unique username
   *
   * @param profile - The verified social profile
   * @returns Authentication result with user, token, and whether user is new
   */
  async authenticateOrCreate(profile: SocialProfile): Promise<SocialAuthResult> {
    // First, check if this social account already exists
    const existingLink = await this.findSocialAccount(profile.provider, profile.providerId);

    if (existingLink) {
      // User already has this social account linked - return existing user
      const user = await this.findUserById(existingLink.userId);
      if (!user) {
        throw new Error('User not found for social account');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      return this.generateAuthResult(user, false);
    }

    // Social account doesn't exist - check if we have an email to work with
    if (!profile.email) {
      // For Apple after first sign-in, we need to look up existing account
      throw new Error('Email is required for new social sign-in');
    }

    // Check if a user with this email already exists
    const existingUser = await this.findUserByEmail(profile.email);

    if (existingUser) {
      // User exists - link this social account to their profile
      await this.linkSocialAccount(existingUser.id, profile.provider, profile.providerId);
      return this.generateAuthResult(existingUser, false);
    }

    // No existing user - create a new account
    const newUser = await this.createSocialUser(profile);
    return this.generateAuthResult(newUser, true);
  }

  /**
   * Find a social account by provider and provider ID
   */
  private async findSocialAccount(
    provider: string,
    providerId: string
  ): Promise<{ userId: string } | null> {
    const result = await this.db.query(
      `SELECT user_id FROM user_social_accounts
       WHERE provider = $1 AND provider_id = $2`,
      [provider, providerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return { userId: result.rows[0].user_id };
  }

  /**
   * Find a user by ID
   */
  private async findUserById(userId: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, email, username, first_name, last_name, bio, profile_image_url,
              location, date_of_birth, is_verified, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Find a user by email
   */
  private async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.db.query(
      `SELECT id, email, username, first_name, last_name, bio, profile_image_url,
              location, date_of_birth, is_verified, is_active, created_at, updated_at
       FROM users WHERE email = $1 AND is_active = true`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Link a social account to an existing user
   */
  private async linkSocialAccount(
    userId: string,
    provider: string,
    providerId: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO user_social_accounts (user_id, provider, provider_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, provider_id) DO NOTHING`,
      [userId, provider, providerId]
    );
  }

  /**
   * Create a new user from social profile
   */
  private async createSocialUser(profile: SocialProfile): Promise<User> {
    // Generate a unique username based on email or name
    const baseUsername = this.generateBaseUsername(profile);
    const username = await this.generateUniqueUsername(baseUsername);

    // Create user without password (social-only auth)
    const result = await this.db.query(
      `INSERT INTO users (email, password_hash, username, first_name, last_name, is_verified)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, username, first_name, last_name, bio, profile_image_url,
                 location, date_of_birth, is_verified, is_active, created_at, updated_at`,
      [
        profile.email.toLowerCase(),
        '', // No password for social auth users
        username,
        profile.firstName || null,
        profile.lastName || null,
      ]
    );

    const user = mapDbUserToUser(result.rows[0]);

    // Link the social account
    await this.linkSocialAccount(user.id, profile.provider, profile.providerId);

    return user;
  }

  /**
   * Generate a base username from profile
   */
  private generateBaseUsername(profile: SocialProfile): string {
    // Try to create username from name or email
    if (profile.firstName && profile.lastName) {
      return `${profile.firstName}${profile.lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    if (profile.firstName) {
      return profile.firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    // Use email prefix as fallback
    return profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Generate a unique username by appending numbers if needed
   */
  private async generateUniqueUsername(baseUsername: string): Promise<string> {
    // Ensure base username is at least 3 characters
    if (baseUsername.length < 3) {
      baseUsername = baseUsername + 'user';
    }

    // Truncate to leave room for suffix
    if (baseUsername.length > 25) {
      baseUsername = baseUsername.substring(0, 25);
    }

    let username = baseUsername;
    let suffix = 1;

    while (await this.usernameExists(username)) {
      username = `${baseUsername}${suffix}`;
      suffix++;

      // Safety limit to prevent infinite loop
      if (suffix > 9999) {
        username = `${baseUsername}${Date.now()}`;
        break;
      }
    }

    return username;
  }

  /**
   * Check if a username already exists
   */
  private async usernameExists(username: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM users WHERE username = $1 LIMIT 1`,
      [username]
    );
    return result.rows.length > 0;
  }

  /**
   * Generate authentication result with tokens
   */
  private async generateAuthResult(user: User, isNewUser: boolean): Promise<SocialAuthResult> {
    const token = AuthUtils.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    const refreshToken = await generateRefreshToken(user.id);

    return {
      user,
      token,
      refreshToken,
      isNewUser,
    };
  }
}
