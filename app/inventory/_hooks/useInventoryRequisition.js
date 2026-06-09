'use client';

import { useState, useMemo } from 'react';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';

export function useInventoryRequisition({ warehouse, products, showToast, fetchInventory }) {
  const [requisitions, setRequisitions] = useState([]);
  const [requisitionLoading, setRequisitionLoading] = useState(false);
  const [reqForm, setReqForm] = useState({ warehouse: '', department: '', productId: '', productName: '', quantity: '', note: '' });
  const [reqSubmitting, setReqSubmitting] = useState(false);

  const { sortKey: reqKey, sortDir: reqDir, toggleSort: reqT } = useColumnSort('requisitionDate', 'desc');
  const sortedRequisitions = useMemo(
    () =>
      sortRows(requisitions, reqKey, reqDir, {
        requisitionNo: (r) => r.requisitionNo || '',
        warehouse: (r) => r.warehouse || '',
        department: (r) => r.department || '',
        productName: (r) => r.product?.name || '',
        quantity: (r) => Number(r.quantity || 0),
        requisitionDate: (r) => r.requisitionDate || '',
      }),
    [requisitions, reqKey, reqDir]
  );

  async function fetchRequisitions(wh) {
    setRequisitionLoading(true);
    try {
      const url = wh ? `/api/inventory/requisitions?warehouse=${encodeURIComponent(wh)}` : '/api/inventory/requisitions';
      const res = await fetch(url);
      const data = res.ok ? await res.json() : [];
      setRequisitions(Array.isArray(data) ? data : []);
    } catch { setRequisitions([]); }
    setRequisitionLoading(false);
  }

  async function submitRequisition() {
    if (!reqForm.warehouse || !reqForm.productId || !reqForm.quantity || Number(reqForm.quantity) < 1) {
      showToast('請填寫倉庫、產品、數量', 'error');
      return;
    }
    setReqSubmitting(true);
    try {
      const res = await fetch('/api/inventory/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: reqForm.warehouse,
          department: reqForm.department || undefined,
          productId: Number(reqForm.productId),
          quantity: Number(reqForm.quantity),
          requisitionDate: todayStr(),
          note: reqForm.note || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setReqForm(prev => ({ ...prev, productId: '', productName: '', quantity: '', note: '' }));
        showToast('領用單已建立');
        fetchRequisitions(warehouse);
        fetchInventory(warehouse);
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setReqSubmitting(false);
  }

  // Sync warehouse into form when it changes
  function syncWarehouse(wh) {
    setReqForm(prev => ({ ...prev, warehouse: wh, department: '' }));
  }

  return {
    requisitions,
    requisitionLoading,
    reqForm,
    setReqForm,
    reqSubmitting,
    sortedRequisitions,
    reqKey,
    reqDir,
    reqT,
    fetchRequisitions,
    submitRequisition,
    syncWarehouse,
  };
}
