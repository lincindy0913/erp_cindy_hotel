/**
 * Lightweight in-memory TTL cache for server-side route handlers.
 * Uses globalThis to survive Next.js hot-reload in development.
 *
 * Usage:
 *   import { getCached, setCached, invalidateCacheByPrefix } from '@/lib/server-cache';
 *
 *   const data = getCached('my-key');
 *   if (!data) {
 *     const fresh = await computeExpensiveData();
 *     setCached('my-key', fresh, 5 * 60_000); // 5-minute TTL
 *     return fresh;
 *   }
 *   return data;
 */

// Attach to globalThis so the Map survives hot-reload in dev
if (!globalThis.__serverCache) {
  globalThis.__serverCache = new Map(); // key → { data, expiresAt, cachedAt }
}
const store = globalThis.__serverCache;

/**
 * Get a cached value. Returns null on miss or expiry.
 * @param {string} key
 * @returns {{ data: any, cachedAt: number } | null}
 */
export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

/**
 * Store a value with a TTL.
 * @param {string} key
 * @param {any} data
 * @param {number} ttlMs  milliseconds until expiry
 */
export function setCached(key, data, ttlMs) {
  const entry = { data, expiresAt: Date.now() + ttlMs, cachedAt: Date.now() };
  store.set(key, entry);
  return entry;
}

/**
 * Delete all cache entries whose key starts with prefix.
 * @param {string} prefix
 */
export function invalidateCacheByPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Delete a single cache entry.
 * @param {string} key
 */
export function invalidateCache(key) {
  store.delete(key);
}

// Periodic cleanup — runs once per server process
if (!globalThis.__serverCacheCleanup) {
  globalThis.__serverCacheCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key);
    }
  }, 60_000);
}
