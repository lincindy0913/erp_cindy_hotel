'use client';

import { useState, useCallback } from 'react';
import { DEFAULT_WAREHOUSE } from '../_constants';

export function useBnbDeclList() {
  const [dlYear,      setDlYear]      = useState(() => new Date().getFullYear().toString());
  const [dlWarehouse, setDlWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [dlRows,      setDlRows]      = useState([]);
  const [dlLoading,   setDlLoading]   = useState(false);
  const [dlError,     setDlError]     = useState(null);

  const fetchDeclList = useCallback(async () => {
    setDlLoading(true);
    setDlError(null);
    try {
      const res = await fetch(`/api/bnb/declaration-list?year=${dlYear}&warehouse=${encodeURIComponent(dlWarehouse)}`);
      if (!res.ok) { setDlError('載入年度申報總覽失敗，請稍後再試'); return; }
      const data = await res.json();
      setDlRows(data.rows || []);
    } catch { setDlError('載入年度申報總覽失敗'); }
    finally { setDlLoading(false); }
  }, [dlYear, dlWarehouse]);

  return { dlYear, setDlYear, dlWarehouse, setDlWarehouse, dlRows, dlLoading, dlError, fetchDeclList };
}
