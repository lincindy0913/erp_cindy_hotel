'use client';

import { useState, useEffect } from 'react';

export function useAnalyticsShared() {
  const [warehouses, setWarehouses] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [suppliersFullList, setSuppliersFullList] = useState([]);

  useEffect(() => {
    fetch('/api/warehouse-departments')
      .then(r => r.json())
      .then(data => {
        if (data?.list) setWarehouses(data.list.filter(w => w.type === 'building').map(w => w.name));
      })
      .catch(() => {});
    fetch('/api/suppliers?all=true')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        const sorted = list.filter(s => s.id && s.name).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        setSuppliersList(sorted.map(s => s.name));
        setSuppliersFullList(sorted.map(s => ({ id: s.id, name: s.name })));
      })
      .catch(() => {});
  }, []);

  return { warehouses, suppliersList, suppliersFullList };
}
