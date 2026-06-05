'use client';
import { useState, useCallback } from 'react';

export function useBnbCalendar() {
  const [calYear,      setCalYear]      = useState(() => new Date().getFullYear());
  const [calMonth,     setCalMonth]     = useState(() => new Date().getMonth() + 1);
  const [calWarehouse, setCalWarehouse] = useState('');
  const [calData,      setCalData]      = useState([]);
  const [calLoading,   setCalLoading]   = useState(false);
  const [calError,     setCalError]     = useState(null);
  const [calOverflow,  setCalOverflow]  = useState(false);

  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    setCalError(null);
    try {
      const ym = `${calYear}-${String(calMonth).padStart(2, '0')}`;
      const p = new URLSearchParams({ month: ym, pageSize: '500' });
      if (calWarehouse) p.set('warehouse', calWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) { setCalError('載入訂房日曆失敗，請稍後再試'); return; }
      const json = await res.json();
      const rows = json.data ?? json;
      setCalData(rows);
      setCalOverflow(rows.length >= 500);
    } catch {
      setCalError('載入訂房日曆失敗，請稍後再試');
    } finally { setCalLoading(false); }
  }, [calYear, calMonth, calWarehouse]);

  return {
    calYear, setCalYear, calMonth, setCalMonth,
    calWarehouse, setCalWarehouse,
    calData, calLoading, calError, calOverflow,
    fetchCalendar,
  };
}
