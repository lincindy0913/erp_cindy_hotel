/**
 * Idempotency-Key support for POST endpoints.
 *
 * Usage in route handlers:
 *   const cached = checkIdempotency(request);
 *   if (cached) return cached;
 *   // ... do work ...
 *   return commitIdempotency(request, response);
 *
 * The client sends `Idempotency-Key: <uuid>` header on POST requests.
 * If the same key is seen again within the TTL, the cached response is returned.
 */

const CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const MAX_CACHE_SIZE = 5000;

// In-memory store: key → { body, status, timestamp }
const idempotencyCache = new Map();

/**
 * Extract the Idempotency-Key header from a request.
 * @param {Request} request
 * @returns {string|null}
 */
export function getIdempotencyKey(request) {
  return request.headers.get('idempotency-key') || null;
}

/**
 * Check if a cached response exists for the given Idempotency-Key.
 * Returns a Response clone if found, or null if not.
 * @param {Request} request
 * @returns {Response|null}
 */
export function checkIdempotency(request) {
  const key = getIdempotencyKey(request);
  if (!key) return null;

  const entry = idempotencyCache.get(key);
  if (!entry) return null;

  // TTL check
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    idempotencyCache.delete(key);
    return null;
  }

  // Return cached response with header indicating it's a replay
  const { NextResponse } = require('next/server');
  const res = NextResponse.json(entry.body, { status: entry.status });
  res.headers.set('Idempotency-Replay', 'true');
  return res;
}

/**
 * Store the response for an Idempotency-Key so future replays return same result.
 * Only caches successful responses (2xx).
 * Returns the original response unchanged.
 *
 * @param {Request} request
 * @param {object} body - The JSON response body
 * @param {number} status - HTTP status code
 */
export function saveIdempotency(request, body, status) {
  const key = getIdempotencyKey(request);
  if (!key) return;

  // Only cache 2xx responses
  if (status < 200 || status >= 300) return;

  // Evict oldest entries if cache is full
  if (idempotencyCache.size >= MAX_CACHE_SIZE) {
    const firstKey = idempotencyCache.keys().next().value;
    idempotencyCache.delete(firstKey);
  }

  idempotencyCache.set(key, { body, status, timestamp: Date.now() });
}

// Periodic cleanup
if (typeof globalThis.__idempotencyCleanup === 'undefined') {
  globalThis.__idempotencyCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyCache) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        idempotencyCache.delete(key);
      }
    }
  }, 60_000);
}
