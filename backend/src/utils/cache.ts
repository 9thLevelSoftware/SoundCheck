/**
 * Caching Layer
 *
 * Provides caching with Redis backend (preferred) or in-memory fallback.
 *
 * FEATURES:
 * - Redis caching for distributed systems (when REDIS_URL is set)
 * - In-memory fallback (automatic when Redis unavailable)
 * - TTL support
 * - Automatic cleanup
 * - Type-safe cache keys
 *
 * USAGE:
 * import { cache, getCache, setCache, deleteCache } from './utils/cache';
 *
 * // Using standalone functions
 * await setCache('user:123', userData, 3600); // 1 hour TTL
 * const user = await getCache('user:123');
 * await deleteCache('user:123');
 *
 * // Using cache service
 * await cache.set('user:123', userData, 3600);
 * const user = await cache.get('user:123');
 */

import { getRedis } from './redisRateLimiter';

// In-memory fallback cache
const memoryCache = new Map<string, { value: any; expiresAt: number }>();

/**
 * Get value from cache (Redis or memory fallback)
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();

  if (redis) {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      // Fall through to memory cache
    }
  }

  // Memory fallback
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Set value in cache with TTL (Redis or memory fallback)
 */
export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return;
    } catch (error) {
      console.error('Redis setex error:', error);
      // Fall through to memory cache
    }
  }

  // Memory fallback
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete value from cache
 */
export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch (error) {
      console.error('Redis del error:', error);
      // Fall through to memory cache
    }
  }

  memoryCache.delete(key);
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Cache service class with extended functionality
 */
class CacheService {
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Start cleanup interval for in-memory cache
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Every minute
  }

  /**
   * Set value in cache with TTL (seconds)
   */
  async set<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
    await setCache(key, value, ttl);
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    return getCache<T>(key);
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    await deleteCache(key);
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const redis = getRedis();

    if (redis) {
      try {
        return (await redis.exists(key)) > 0;
      } catch (error) {
        console.error('Redis exists error:', error);
        // Fall through to memory cache
      }
    }

    const entry = memoryCache.get(key);
    if (!entry) return false;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    const redis = getRedis();

    if (redis) {
      try {
        await redis.flushdb();
        return;
      } catch (error) {
        console.error('Redis flushdb error:', error);
      }
    }

    memoryCache.clear();
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
   * Delete keys by pattern
   */
  async delPattern(pattern: string): Promise<void> {
    const redis = getRedis();

    if (redis) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        return;
      } catch (error) {
        console.error('Redis del pattern error:', error);
      }
    }

    // Memory fallback
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete: string[] = [];

    Array.from(memoryCache.keys()).forEach((key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      memoryCache.delete(key);
    });
  }

  /**
   * Cleanup expired entries (in-memory only)
   */
  private cleanupExpired(): void {
    const redis = getRedis();
    if (redis) return; // Redis handles its own expiration

    const now = Date.now();
    const keysToDelete: string[] = [];

    Array.from(memoryCache.entries()).forEach(([key, entry]) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      memoryCache.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; type: 'memory' | 'redis' } {
    const redis = getRedis();
    return {
      size: memoryCache.size,
      type: redis ? 'redis' : 'memory',
    };
  }

  /**
   * Close cache connections
   */
  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
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
  concertCred: (userId: string) => `stats:concert-cred:${userId}`,
  bandAggregate: (bandId: string) => `band:aggregate:${bandId}`,
  venueAggregate: (venueId: string) => `venue:aggregate:${venueId}`,
  nearbyEvents: (lat: number, lon: number, radius: number) => `events:nearby:${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}`,
  trendingEvents: (lat: number, lon: number) => `events:trending:${lat.toFixed(2)}:${lon.toFixed(2)}`,
  genreEvents: (genre: string) => `events:genre:${genre.toLowerCase()}`,
  recommendations: (userId: string) => `events:recs:${userId}`,
};

// Export TTL constants
export const CacheTTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
};
