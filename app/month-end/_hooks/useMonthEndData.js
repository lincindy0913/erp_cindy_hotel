'use client';

import { useState, useEffect } from 'react';

export function useMonthEndData() {
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [monthsData, setMonthsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthDataError, setMonthDataError] = useState(null);

  // Keep currentYear in sync (cross-year detection)
  useEffect(() => {
    const id = setInterval(() => {
      const y = new Date().getFullYear();
      setCurrentYear(prev => (prev !== y ? y : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchMonthData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  async function fetchMonthData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/month-end?year=${selectedYear}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMonthDataError(null);
      if (data.months) setMonthsData(data.months);
    } catch (error) {
      console.error('載入月結資料失敗:', error);
      setMonthDataError('月結資料載入失敗，請重試。');
    }
    setLoading(false);
  }

  return {
    currentYear,
    selectedYear,
    setSelectedYear,
    monthsData,
    loading,
    monthDataError,
    fetchMonthData,
  };
}
