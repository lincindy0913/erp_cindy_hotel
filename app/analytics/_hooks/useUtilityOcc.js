'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';

export function useUtilityOcc() {
  const { showToast } = useToast();
  const [utilOccWarehouse, setUtilOccWarehouse] = useState('');
  const [utilOccRocYear, setUtilOccRocYear] = useState(() => String(new Date().getFullYear() - 1911));
  const [utilOccData, setUtilOccData] = useState(null);
  const [utilOccLoading, setUtilOccLoading] = useState(false);

  const fetchUtilityOccupancy = useCallback(async () => {
    if (!utilOccWarehouse.trim()) {
      showToast('請選擇館別', 'error');
      return;
    }
    const y = parseInt(utilOccRocYear, 10);
    if (!Number.isFinite(y) || y < 1) {
      showToast('請輸入有效民國年', 'error');
      return;
    }
    setUtilOccLoading(true);
    setUtilOccData(null);
    try {
      const p = new URLSearchParams({ warehouse: utilOccWarehouse.trim(), rocYear: String(y) });
      const res = await fetch(`/api/analytics/utility-occupancy?${p}`);
      if (res.ok) setUtilOccData(await res.json());
      else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || '查詢失敗', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('查詢失敗', 'error');
    }
    setUtilOccLoading(false);
  }, [utilOccWarehouse, utilOccRocYear, showToast]);

  return {
    utilOccWarehouse, setUtilOccWarehouse,
    utilOccRocYear, setUtilOccRocYear,
    utilOccData, utilOccLoading,
    fetchUtilityOccupancy,
  };
}
