'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Check if the accounting period for a given date is locked.
 * Uses /api/month-end/check-lock with debounce to avoid hammering the API.
 *
 * @param {string} dateStr   - YYYY-MM-DD
 * @param {string} warehouse - optional warehouse filter
 * @returns {{ locked: boolean, status: string|null, loading: boolean }}
 */
export function usePeriodCheck(dateStr, warehouse) {
  const [locked,  setLocked]  = useState(false);
  const [status,  setStatus]  = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!dateStr || dateStr.length < 7) { setLocked(false); setStatus(null); return; }
    const parts = dateStr.split('-');
    const year  = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    if (!year || !month) { setLocked(false); setStatus(null); return; }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ year: String(year), month: String(month) });
        if (warehouse) p.set('warehouse', warehouse);
        const res = await fetch(`/api/month-end/check-lock?${p}`);
        if (!res.ok) { setLocked(false); setStatus(null); return; }
        const data = await res.json();
        setLocked(!!data.locked);
        setStatus(data.status || null);
      } catch { setLocked(false); setStatus(null); }
      finally { setLoading(false); }
    }, 400);

    return () => clearTimeout(timerRef.current);
  }, [dateStr, warehouse]);

  return { locked, status, loading };
}
