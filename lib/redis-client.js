/**
 * Singleton Redis client for Node.js API routes.
 *
 * Returns null when REDIS_URL is not configured — callers must handle graceful
 * fallback to in-memory behaviour.
 *
 * NOT usable in Next.js middleware (Edge Runtime); ioredis requires Node.js TCP APIs.
 * For Edge-compatible Redis, consider @upstash/redis with UPSTASH_REDIS_REST_URL.
 *
 * Railway setup:
 *   1. Add a Redis service in your Railway project
 *   2. Set REDIS_URL in the Next.js service environment (Railway injects it automatically
 *      if you reference the Redis service variable)
 */

let _client = null;
let _attempted = false;

export async function getRedisClient() {
  if (_attempted) return _client;
  _attempted = true;

  if (!process.env.REDIS_URL) return null;

  try {
    const { default: Redis } = await import('ioredis');
    _client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: false,
      connectTimeout: 3000,
    });
    _client.on('error', (err) => {
      // Non-fatal — rate limiters fall back to in-memory on error
      console.warn('[redis-client] connection error (rate limiting will use in-memory):', err.message);
    });
    return _client;
  } catch (err) {
    console.warn('[redis-client] failed to initialize:', err.message);
    return null;
  }
}
