'use client';

import { useState, useEffect } from 'react';

const WAREHOUSE_OPTIONS_FALLBACK = [
  { value: '', label: '請選擇館別' },
  { value: '麗格', label: '麗格' },
  { value: '麗軒', label: '麗軒' },
  { value: '民宿', label: '民宿' },
  { value: '國股段', label: '國股段' },
];

export function useUtilityWarehouse({ session, setAnalysisFilter }) {
  const [WAREHOUSE_OPTIONS, setWarehouseOptions] = useState(WAREHOUSE_OPTIONS_FALLBACK);

  useEffect(() => {
    if (!session) return;
    fetch('/api/warehouse-departments')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        const list = Array.isArray(data?.list) ? data.list : [];
        const all = list.filter(w => w.type === 'building').map(w => w.name);
        if (all.length > 0) {
          setWarehouseOptions([{ value: '', label: '請選擇館別' }, ...all.map(n => ({ value: n, label: n }))]);
          setAnalysisFilter(f => f.warehouse ? f : { ...f, warehouse: all[0] });
        } else {
          const fallback = WAREHOUSE_OPTIONS_FALLBACK.filter(o => o.value).map(o => o.value);
          setAnalysisFilter(f => f.warehouse ? f : { ...f, warehouse: fallback[0] || '' });
        }
      })
      .catch(() => {
        const fallback = WAREHOUSE_OPTIONS_FALLBACK.filter(o => o.value).map(o => o.value);
        setAnalysisFilter(f => f.warehouse ? f : { ...f, warehouse: fallback[0] || '' });
      });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  return { WAREHOUSE_OPTIONS, WAREHOUSE_OPTIONS_FALLBACK };
}
