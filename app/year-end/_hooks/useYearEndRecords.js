'use client';

import { useState, useEffect } from 'react';

export function useYearEndRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(null);

  // Expanded detail
  const [expandedId, setExpandedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('inventory');

  // Statement viewer modal
  const [statementModal, setStatementModal] = useState(null); // { loading, data }

  useEffect(() => {
    fetchRecords();
  }, []);

  async function fetchRecords() {
    setLoading(true);
    try {
      const res = await fetch('/api/year-end');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRecordsError(null);
      if (data.records) setRecords(data.records);
    } catch (error) {
      console.error('載入年度結轉記錄失敗:', error);
      setRecordsError('年結歷史記錄載入失敗，請重試。');
    }
    setLoading(false);
  }

  async function handleToggleDetail(record) {
    if (expandedId === record.id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }
    setExpandedId(record.id);
    setDetailData(null);
    setDetailLoading(true);
    setDetailTab('inventory');
    try {
      const res = await fetch(`/api/year-end/${record.id}`);
      const data = await res.json();
      setDetailData(data);
    } catch (error) {
      console.error('載入詳情失敗:', error);
    }
    setDetailLoading(false);
  }

  async function handleViewStatement(statementId) {
    setStatementModal({ loading: true, data: null });
    try {
      const res = await fetch(`/api/year-end/reports/${statementId}`);
      const data = await res.json();
      setStatementModal({ loading: false, data });
    } catch {
      setStatementModal({ loading: false, data: null });
    }
  }

  return {
    records,
    loading,
    recordsError,
    fetchRecords,
    expandedId,
    detailData,
    detailLoading,
    detailTab,
    setDetailTab,
    statementModal,
    setStatementModal,
    handleToggleDetail,
    handleViewStatement,
  };
}
