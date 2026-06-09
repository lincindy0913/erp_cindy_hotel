'use client';

import { useState } from 'react';

export function useUtilityList({ showMessage, onAfterSaveEdit }) {
  const [records, setRecords] = useState([]);
  const [listFilter, setListFilter] = useState({ warehouse: '', year: '', month: '', billType: '' });
  const [listLoading, setListLoading] = useState(false);
  const [recordsError, setRecordsError] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [editSummary, setEditSummary] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function fetchRecords() {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (listFilter.warehouse) params.set('warehouse', listFilter.warehouse);
      if (listFilter.year) params.set('year', listFilter.year);
      if (listFilter.month) params.set('month', listFilter.month);
      if (listFilter.billType) params.set('billType', listFilter.billType);
      const res = await fetch(`/api/utility-bills?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecordsError(null);
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[fetchRecords]', e);
      setRecordsError('水電費記錄載入失敗，請重試。');
      setRecords([]);
    }
    setListLoading(false);
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/utility-bills/${editRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryJson: editSummary }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('已更新');
        setEditRecord(null);
        setEditSummary(null);
        fetchRecords();
        if (onAfterSaveEdit) onAfterSaveEdit();
      } else {
        showMessage(data.error || '更新失敗', 'error');
      }
    } catch {
      showMessage('更新失敗', 'error');
    }
    setSavingEdit(false);
  }

  function openEdit(r) {
    try {
      const sum = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : (r.summaryJson || {});
      setEditRecord(r);
      if (Array.isArray(sum)) {
        setEditSummary(sum);
      } else {
        setEditSummary(typeof sum === 'object' && sum !== null ? { ...sum } : {});
      }
    } catch {
      setEditRecord(r);
      setEditSummary({});
    }
  }

  function closeEdit() {
    setEditRecord(null);
    setEditSummary(null);
  }

  return {
    records, setRecords,
    listFilter, setListFilter,
    listLoading,
    recordsError,
    editRecord, setEditRecord,
    editSummary, setEditSummary,
    savingEdit,
    fetchRecords,
    saveEdit,
    openEdit,
    closeEdit,
  };
}
