'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';

async function apiErrorMessage(res) {
  try {
    const j = await res.json();
    return j.error?.message || j.error || j.message || `請求失敗（${res.status}）`;
  } catch {
    return `請求失敗（${res.status}）`;
  }
}

export function useRentalRoi() {
  const { showToast } = useToast();
  const [rentalRoiYear, setRentalRoiYear] = useState(() => new Date().getFullYear());
  const [rentalRoiData, setRentalRoiData] = useState(null);
  const [rentalRoiLoading, setRentalRoiLoading] = useState(false);

  const fetchRentalRoi = useCallback(async () => {
    setRentalRoiLoading(true);
    try {
      const y = Number(rentalRoiYear);
      const year = Number.isFinite(y) ? y : new Date().getFullYear();
      const res = await fetch(`/api/analytics/rental-roi?year=${year}`);
      if (!res.ok) {
        showToast(await apiErrorMessage(res), 'error');
        setRentalRoiLoading(false);
        return;
      }
      setRentalRoiData(await res.json());
    } catch (e) {
      console.error(e);
      showToast('租賃 ROI 載入失敗，請稍後再試', 'error');
    }
    setRentalRoiLoading(false);
  }, [rentalRoiYear, showToast]);

  return { rentalRoiYear, setRentalRoiYear, rentalRoiData, rentalRoiLoading, fetchRentalRoi };
}
