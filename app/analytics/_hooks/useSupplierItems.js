'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr, localDateStr } from '@/lib/localDate';

async function apiErrorMessage(res) {
  try {
    const j = await res.json();
    return j.error?.message || j.error || j.message || `請求失敗（${res.status}）`;
  } catch {
    return `請求失敗（${res.status}）`;
  }
}

export function useSupplierItems() {
  const { showToast } = useToast();

  const [spItems, setSpItems] = useState(null);
  const [spItemsLoading, setSpItemsLoading] = useState(false);
  const [spItemsStart, setSpItemsStart] = useState(() => {
    const d = new Date(); d.setDate(1); return localDateStr(d);
  });
  const [spItemsEnd, setSpItemsEnd] = useState(() => todayStr());
  const [spItemsWarehouse, setSpItemsWarehouse] = useState('');
  const [spItemsSupplierId, setSpItemsSupplierId] = useState('');

  const fetchSpItems = useCallback(async () => {
    setSpItemsLoading(true); setSpItems(null);
    try {
      const p = new URLSearchParams({ startDate: spItemsStart, endDate: spItemsEnd });
      if (spItemsSupplierId) p.set('supplierId', spItemsSupplierId);
      if (spItemsWarehouse.trim()) p.set('warehouse', spItemsWarehouse.trim());
      const res = await fetch(`/api/analytics/supplier-purchase-items?${p}`);
      if (res.ok) setSpItems(await res.json());
      else showToast(await apiErrorMessage(res), 'error');
    } catch (e) { console.error(e); showToast('廠商品項查詢失敗，請稍後再試', 'error'); }
    setSpItemsLoading(false);
  }, [spItemsStart, spItemsEnd, spItemsSupplierId, spItemsWarehouse, showToast]);

  return {
    spItems, spItemsLoading,
    spItemsStart, setSpItemsStart,
    spItemsEnd, setSpItemsEnd,
    spItemsWarehouse, setSpItemsWarehouse,
    spItemsSupplierId, setSpItemsSupplierId,
    fetchSpItems,
  };
}
