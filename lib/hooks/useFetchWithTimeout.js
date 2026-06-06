'use client';
import { useCallback } from 'react';

/**
 * fetch wrapper that rejects with a descriptive error after `timeoutMs`.
 * Usage:
 *   const fetchT = useFetchWithTimeout(8000);
 *   const res = await fetchT('/api/bnb?month=2026-05');
 */
export function useFetchWithTimeout(timeoutMs = 8000) {
  return useCallback((url, options) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .catch(err => {
        if (err.name === 'AbortError') {
          throw new Error(`請求逾時（超過 ${Math.round(timeoutMs / 1000)} 秒），請檢查網路後重試`);
        }
        throw err;
      })
      .finally(() => clearTimeout(timer));
  }, [timeoutMs]);
}

/**
 * Standalone fetch with timeout (no hook, use in non-React contexts).
 */
export function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .catch(err => {
      if (err.name === 'AbortError') {
        throw new Error(`請求逾時（超過 ${Math.round(timeoutMs / 1000)} 秒），請檢查網路後重試`);
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}
