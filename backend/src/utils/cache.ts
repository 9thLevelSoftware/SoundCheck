/**
 * Caching Layer
 *
 * STATUS: In-memory only (Redis disabled)
 *
 * Current implementation uses in-memory Map cache which:
 * - Doesn't persist across restarts
 * - Doesn't scale across multiple instances
 *
 * To enable Redis:
 * 1. npm install ioredis
 * 2. Set REDIS_URL environment variable
 * 3. Uncomment Redis initialization and methods
 *
 * FEATURES:
 * - In-memory caching (default, works immediately)
 * - Redis caching (optional, for distributed systems)
 * - TTL support
 * - Automatic cleanup
 * - Type-safe cache keys
 *
 * USAGE:
 * import { cache } from './utils/cache';
 *
 * // Set value with TTL
 * await cache.set('user:123', userData, 3600); // 1 hour
 *
 * // Get value
 * const user = await cache.get('user:123');
 *
 * // Delete value
 * await cache.del('user:123');
 *
 * // Clear all
 * await cache.clear();
 */

// NOTE: Uncomment when Redis is available
// import { createClient } from 'redis';
// type RedisClientType = ReturnType<typeof createClient>;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class CacheService {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  // private redis?: RedisClientType;
  private useRedis: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Start cleanup interval for in-memory cache
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Every minute

    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    if (!process.env.REDIS_URL) {
      console.log('📦 Using in-memory cache (Redis not configured)');
      return;
    }

    // NOTE: Uncomment when Redis is available
    /*
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL,
      });

      this.redis.on('error', (err) => {
        console.error('Redis error:', err);
        this.useRedis = false;
      });

      await this.redis.connect();
      this.useRedis = true;
      console.log('✅ Redis cache connected');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      console.log('📦 Falling back to in-memory cache');
      this.useRedis = false;
    }
    */
  }

  /**
   * Set value in cache with TTL (seconds)
   */
  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      /*
      await this.redis!.setEx(
        key,
        ttl,
        JSON.stringify(value)
      );
      */
    } else {
      // In-memory cache
      const expiresAt = Date.now() + ttl * 1000;
      this.memoryCache.set(key, { value, expiresAt });
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      /*
      const data = await this.redis!.get(key);
      return data ? JSON.parse(data) : null;
      */
      return null;
    } else {
      // In-memory cache
      const entry = this.memoryCache.get(key);
      if (!entry) return null;

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }

      return entry.value as T;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      // await this.redis!.del(key);
    } else {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      // return await this.redis!.exists(key) > 0;
      return false;
    } else {
      const entry = this.memoryCache.get(key);
      if (!entry) return false;

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        return false;
      }

      return true;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      // await this.redis!.flushDb();
    } else {
      this.memoryCache.clear();
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate value
    const value = await factory();

    // Store in cache
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Delete keys by pattern (in-memory only)
   */
  async delPattern(pattern: string): Promise<void> {
    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      /*
      const keys = await this.redis!.keys(pattern);
      if (keys.length > 0) {
        await this.redis!.del(keys);
      }
      */
    } else {
      const regex = new RegExp(pattern.replace('*', '.*'));
      const keysToDelete: string[] = [];

      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Cleanup expired entries (in-memory only)
   */
  private cleanupExpired(): void {
    if (this.useRedis) return;

    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.memoryCache.delete(key);
    }

    if (keysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; type: 'memory' | 'redis' } {
    return {
      size: this.memoryCache.size,
      type: this.useRedis ? 'redis' : 'memory',
    };
  }

  /**
   * Close cache connections
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.useRedis) {
      // NOTE: Uncomment when Redis is available
      // await this.redis?.quit();
    }
  }
}

// Export singleton instance
export const cache = new CacheService();

// Export cache key builders for type safety
export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  venue: (id: string) => `venue:${id}`,
  band: (id: string) => `band:${id}`,
  review: (id: string) => `review:${id}`,
  venueReviews: (venueId: string, page: number) => `venue:${venueId}:reviews:${page}`,
  bandReviews: (bandId: string, page: number) => `band:${bandId}:reviews:${page}`,
  userReviews: (userId: string) => `user:${userId}:reviews`,
  searchVenues: (query: string) => `search:venues:${query}`,
  searchBands: (query: string) => `search:bands:${query}`,
};

// Export TTL constants
export const CacheTTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
};
