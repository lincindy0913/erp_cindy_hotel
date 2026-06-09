'use client';

import { useState } from 'react';

export function useUtilityDetail({ showMessage, fetchRecords }) {
  const [detailRecords, setDetailRecords] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFilter, setDetailFilter] = useState({ warehouse: '', year: '', billType: '' });
  const [detailDeleting, setDetailDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function fetchDetailRecords() {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      if (detailFilter.warehouse) params.set('warehouse', detailFilter.warehouse);
      if (detailFilter.year) params.set('year', detailFilter.year);
      if (detailFilter.billType) params.set('billType', detailFilter.billType);
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      setDetailRecords(Array.isArray(data) ? data : []);
    } catch {
      setDetailRecords([]);
    }
    setDetailLoading(false);
  }

  async function deleteRecord(id) {
    setDetailDeleting(id);
    try {
      const res = await fetch(`/api/utility-bills/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMessage('已刪除');
        setConfirmDelete(null);
        fetchDetailRecords();
        fetchRecords();
      } else {
        const d = await res.json();
        showMessage(d.error || '刪除失敗', 'error');
      }
    } catch {
      showMessage('刪除失敗', 'error');
    }
    setDetailDeleting(null);
  }

  return {
    detailRecords,
    detailLoading,
    detailFilter, setDetailFilter,
    detailDeleting,
    confirmDelete, setConfirmDelete,
    fetchDetailRecords,
    deleteRecord,
  };
}
