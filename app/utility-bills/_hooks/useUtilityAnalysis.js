'use client';

import { useState } from 'react';

export function useUtilityAnalysis() {
  const todayRoc = String(new Date().getFullYear() - 1911);
  const [analysisFilter, setAnalysisFilter] = useState({ warehouse: '', year: todayRoc, billType: '電費' });
  const [analysisRecords, setAnalysisRecords] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('usage'); // 'usage' | 'amount'

  async function fetchAnalysisRecords() {
    if (!analysisFilter.warehouse || !analysisFilter.year) return;
    setAnalysisLoading(true);
    try {
      const params = new URLSearchParams({
        warehouse: analysisFilter.warehouse,
        year: analysisFilter.year,
        billType: analysisFilter.billType,
      });
      const res = await fetch(`/api/utility-bills?${params}`);
      const data = await res.json();
      setAnalysisRecords(Array.isArray(data) ? data : []);
    } catch {
      setAnalysisRecords([]);
    }
    setAnalysisLoading(false);
  }

  function buildPivot(records, billType, mode) {
    const labelMap = new Map();
    for (const r of records) {
      const month = r.billMonth;
      let items;
      try {
        items = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : r.summaryJson;
      } catch { items = []; }
      if (!Array.isArray(items)) items = [items].filter(Boolean);

      for (const item of items) {
        const label = billType === '電費'
          ? (item.地址 || item.電號 || '未知')
          : (item.用水地址 || '未知');

        const rawValue = mode === 'usage'
          ? (billType === '電費' ? (item.使用度數 || '0') : (item.本期實用度數 || item.用水度數 || '0'))
          : (billType === '電費' ? (item.應繳總金額 || item.電費金額 || '0') : (item.總金額 || '0'));

        const value = parseInt(String(rawValue).replace(/,/g, '')) || 0;
        if (!labelMap.has(label)) labelMap.set(label, {});
        const row = labelMap.get(label);
        row[month] = (row[month] || 0) + value;
      }
    }
    return labelMap;
  }

  return {
    analysisFilter, setAnalysisFilter,
    analysisRecords,
    analysisLoading,
    analysisMode, setAnalysisMode,
    fetchAnalysisRecords,
    buildPivot,
  };
}
