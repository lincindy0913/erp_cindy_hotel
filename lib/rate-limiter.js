/**
 * Rate limiter for Next.js API route handlers (Node.js runtime only).
 *
 * When REDIS_URL is set, uses a Redis sorted-set sliding window — safe for
 * multi-instance / Railway scale-out deployments.
 * When REDIS_URL is absent (or Redis is unreachable), falls back to an
 * in-memory sliding window — correct for single-instance, resets on restart.
 *
 * Usage:
 *   const limit = rateLimit({ max: 10, windowMs: 60_000, key: 'user_create' });
 *   const limited = await limit(request);
 *   if (limited) return limited; // 429 NextResponse
 *
 * DO NOT import this in middleware.js — middleware runs in Edge Runtime
 * and cannot use ioredis.  Middleware has its own in-memory limiter.
 */

import { getRedisClient } from '@/lib/redis-client';

// ── In-memory fallback ────────────────────────────────────────────────────

const memStore = new Map(); // storeKey → number[] (timestamps)

if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 15 * 60_000;
    for (const [k, ts] of memStore) {
      while (ts.length && ts[0] <= cutoff) ts.shift();
      if (!ts.length) memStore.delete(k);
    }
  }, 5 * 60_000);
  if (cleanup.unref) cleanup.unref();
}

function checkMemory(storeKey, windowMs, max) {
  const now = Date.now();
  const windowStart = now - windowMs;

  let ts = memStore.get(storeKey);
  if (!ts) { ts = []; memStore.set(storeKey, ts); }
  while (ts.length && ts[0] <= windowStart) ts.shift();

  if (ts.length >= max) {
    return { allowed: false, retryAfterMs: ts[0] + windowMs - now };
  }
  ts.push(now);
  return { allowed: true, remaining: max - ts.length };
}

// ── Redis sliding window (sorted-set) ────────────────────────────────────
// Lua script runs atomically: removes expired members, checks count,
// adds current timestamp only if under limit, sets TTL.
// Returns: [allowed (1/0), retryAfterMs or remaining]
const SLIDING_WINDOW_LUA = `
local key          = KEYS[1]
local now          = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max          = tonumber(ARGV[3])
local window_ms    = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
local count = tonumber(redis.call('ZCARD', key))

if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window_ms
  if oldest[2] then
    retry = tonumber(oldest[2]) + window_ms - now
  end
  return {0, math.max(0, retry)}
end

redis.call('ZADD', key, now, tostring(now))
redis.call('PEXPIRE', key, window_ms + 1000)
return {1, max - count - 1}
`;

async function checkRedis(redis, storeKey, windowMs, max) {
  const now = Date.now();
  const windowStart = now - windowMs;
  try {
    const result = await redis.eval(
      SLIDING_WINDOW_LUA, 1, storeKey,
      String(now), String(windowStart), String(max), String(windowMs),
    );
    const allowed = result[0] === 1;
    return allowed
      ? { allowed: true,  remaining: result[1] }
      : { allowed: false, retryAfterMs: result[1] };
  } catch (err) {
    // Redis unavailable — degrade gracefully to in-memory
    console.warn('[rate-limiter] Redis eval failed, falling back to in-memory:', err.message);
    return checkMemory(storeKey, windowMs, max);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns an async check function. Call it inside a route handler;
 * if it returns a Response, return that immediately (429).
 *
 * @param {object} opts
 * @param {number} opts.max       - Max requests per window (default 60)
 * @param {number} opts.windowMs  - Window size in ms (default 60_000)
 * @param {string} opts.key       - Limiter name prefix (default 'default')
 */
export function rateLimit({ max = 60, windowMs = 60_000, key = 'default' } = {}) {
  // Lazily resolve Redis client once per limiter instance
  let _redis = undefined; // undefined = not yet resolved

  return async function check(request) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const storeKey = `ratelimit:${key}:${ip}`;

    if (_redis === undefined) {
      _redis = await getRedisClient(); // null if no REDIS_URL
    }

    const result = _redis
      ? await checkRedis(_redis, storeKey, windowMs, max)
      : checkMemory(storeKey, windowMs, max);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.retryAfterMs ?? windowMs) / 1000);
      return new Response(
        JSON.stringify({ error: '請求過於頻繁，請稍後再試', code: 'RATE_LIMITED' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    return null; // allowed
  };
}

// Pre-configured instances for common use cases
export const loginRateLimit   = rateLimit({ max: 10, windowMs: 15 * 60_000, key: 'login' });
export const apiWriteRateLimit = rateLimit({ max: 60, windowMs: 60_000,       key: 'api_write' });
