/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Uses a sliding window per IP. Resets on server restart (acceptable for ERP).
 *
 * Usage in route handler:
 *   const limit = rateLimit({ max: 20, windowMs: 60_000 });
 *   const limited = limit(request);
 *   if (limited) return limited; // 429 response
 */

const store = new Map(); // ip+key → { count, resetAt }

export function rateLimit({ max = 60, windowMs = 60_000, key = 'default' } = {}) {
  return function check(request) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';

    const storeKey = `${ip}:${key}`;
    const now = Date.now();
    const entry = store.get(storeKey);

    if (!entry || now > entry.resetAt) {
      store.set(storeKey, { count: 1, resetAt: now + windowMs });
      return null; // allowed
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
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
        }
      );
    }

    return null; // allowed
  };
}

// Periodic cleanup to prevent memory leak (remove expired entries every 5 min)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k);
    }
  }, 5 * 60_000);
}
