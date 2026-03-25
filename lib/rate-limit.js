// In-memory sliding-window rate limiter
// Suitable for single-instance deployments; for multi-instance use Redis-backed limiter

class RateLimiter {
  /**
   * @param {Object} opts
   * @param {number} opts.windowMs - Time window in milliseconds (default: 60000 = 1 min)
   * @param {number} opts.maxRequests - Max requests per window (default: 10)
   */
  constructor({ windowMs = 60_000, maxRequests = 10 } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.store = new Map(); // key -> [timestamps]

    // Periodic cleanup every 5 minutes to prevent memory leak
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60_000);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Check if a key (IP/user) is rate limited.
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
   */
  check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.store.get(key);
    if (!timestamps) {
      timestamps = [];
      this.store.set(key, timestamps);
    }

    // Remove expired entries
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    const remaining = Math.max(0, this.maxRequests - timestamps.length);
    const resetMs = timestamps.length > 0 ? timestamps[0] + this.windowMs - now : 0;

    if (timestamps.length >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetMs };
    }

    timestamps.push(now);
    return { allowed: true, remaining: remaining - 1, resetMs };
  }

  _cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.store) {
      while (timestamps.length > 0 && timestamps[0] <= windowStart) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// Pre-configured limiters for different endpoints
const loginLimiter = new RateLimiter({ windowMs: 15 * 60_000, maxRequests: 10 }); // 10 attempts per 15 min
const apiWriteLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 60 });   // 60 writes per min

/**
 * Get client IP from request headers (behind proxy) or connection
 */
function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

module.exports = { RateLimiter, loginLimiter, apiWriteLimiter, getClientIp };
