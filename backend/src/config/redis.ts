/**
 * Shared Redis connection factory
 *
 * Provides BullMQ-compatible IORedis connections. BullMQ requires
 * maxRetriesPerRequest: null (uses blocking commands like BRPOPLPUSH).
 * This is SEPARATE from the rate limiter's Redis connection which
 * uses maxRetriesPerRequest: 3.
 */

import IORedis from 'ioredis';

/**
 * Get the Redis URL from environment or throw with a clear message.
 */
export function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error(
      'REDIS_URL environment variable is required for job queue. ' +
      'Set it to your Redis instance URL (e.g. redis://localhost:6379).'
    );
  }
  return redisUrl;
}

/**
 * Create a new IORedis connection configured for BullMQ.
 *
 * BullMQ requires:
 * - maxRetriesPerRequest: null (blocking commands need infinite retries)
 * - enableReadyCheck: false (avoids race conditions on reconnect)
 *
 * Each BullMQ Queue and Worker needs its own connection instance.
 * Do NOT share this connection with the rate limiter.
 */
export function createBullMQConnection(): IORedis {
  const redisUrl = getRedisUrl();

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });
}

/**
 * Create a DEDICATED IORedis connection for Pub/Sub subscriber mode.
 *
 * Once a connection enters subscriber mode (via .subscribe()), it can ONLY
 * run subscribe/unsubscribe/psubscribe/punsubscribe commands. This is why
 * a separate connection is required -- reusing the cache or rate-limiter
 * connection would break regular get/set commands.
 *
 * Uses the same config as BullMQ connections (maxRetriesPerRequest: null,
 * enableReadyCheck: false) for resilient reconnection.
 */
export function createPubSubConnection(): IORedis {
  const redisUrl = getRedisUrl();

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });
}
