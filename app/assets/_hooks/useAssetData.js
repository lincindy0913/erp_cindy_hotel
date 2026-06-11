'use client';

import { useState, useCallback, useEffect } from 'react';
import { todayStr } from '@/lib/localDate';

export function useAssetData() {

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const [properties, setProperties] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [incomeError, setIncomeError] = useState(null);
  const [currentMonthIncomeMap, setCurrentMonthIncomeMap] = useState(new Map());
  const [accounts, setAccounts] = useState([]);

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [activeRange, setActiveRange] = useState(null);

  const loadProperties = useCallback(async () => {
    const res = await fetch('/api/rentals/properties');
    if (!res.ok) throw new Error(`物業載入失敗（${res.status}）`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    setProperties(arr);
    return arr;
  }, []);

  const loadYearData = useCallback(async (y, sd, ed) => {
    const opUrl = (sd && ed)
      ? `/api/rentals/reports/operating?startDate=${sd}&endDate=${ed}`
      : `/api/rentals/reports/operating?year=${y}`;
    const repRes = await fetch(opUrl);
    if (!repRes.ok) throw new Error(`營運報表載入失敗（${repRes.status}）`);
    const repData = await repRes.json();
    setReportData(repData.rows ? repData.rows : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [, , acctData, incomeData] = await Promise.all([
          loadProperties(),
          loadYearData(year),
          fetch('/api/cashflow/accounts').then(r => r.ok ? r.json() : null),
          fetch(`/api/rentals/income?year=${curYear}&month=${curMonth}`).then(r => r.ok ? r.json() : null),
        ]);
        if (!cancelled) {
          setLoading(false);
          if (Array.isArray(acctData)) setAccounts(acctData);
          else if (acctData === null) setReportError('收款帳戶載入失敗，部分功能受限');
          if (Array.isArray(incomeData)) {
            const today = todayStr();
            const map = new Map();
            incomeData.forEach(i => {
              const existing = map.get(i.propertyId);
              if (!existing || i.status === 'completed' || (i.status === 'partial' && existing.status === 'pending')) {
                map.set(i.propertyId, { ...i, isOverdue: i.status === 'pending' && i.dueDate < today });
              }
            });
            setCurrentMonthIncomeMap(map);
          } else if (incomeData === null) {
            setIncomeError('本月收款狀態載入失敗');
          }
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setLoadError('資產資料載入失敗，請稍後再試');
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProperties, loadYearData, year]);

  return {
    currentYear,
    year, setYear,
    properties, setProperties,
    reportData,
    loading, setLoading,
    loadError,
    reportError, setReportError,
    incomeError, setIncomeError,
    currentMonthIncomeMap,
    accounts,
    dateStart, setDateStart,
    dateEnd, setDateEnd,
    activeRange, setActiveRange,
    loadProperties,
    loadYearData,
  };
}
