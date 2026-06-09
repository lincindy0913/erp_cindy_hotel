'use client';

import { useState, useEffect } from 'react';

export function useMonthEndChecklist({ selectedYear }) {
  const [checklistData, setChecklistData] = useState(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistMonth, setChecklistMonth] = useState(new Date().getMonth() + 1);

  // Manual confirmation state (persisted to DB)
  const [manualConfirmed, setManualConfirmed] = useState({});
  const [manualConfirmLoading, setManualConfirmLoading] = useState(false);

  // Load manual confirmations whenever year/month changes
  useEffect(() => {
    let cancelled = false;
    setManualConfirmed({});
    fetch(`/api/month-end/manual-check?year=${selectedYear}&month=${checklistMonth}`)
      .then(r => (r.ok ? r.json() : {}))
      .then(d => { if (!cancelled) setManualConfirmed(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedYear, checklistMonth]);

  // Reload checklist whenever year or month changes
  useEffect(() => {
    fetchChecklist(checklistMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, checklistMonth]);

  async function fetchChecklist(month = checklistMonth) {
    setChecklistLoading(true);
    try {
      const res = await fetch(
        `/api/month-end/checklist?year=${selectedYear}&month=${month}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChecklistData(await res.json());
    } catch (error) {
      console.error('載入清單失敗:', error);
    }
    setChecklistLoading(false);
  }

  async function toggleManualConfirm(itemKey) {
    const next = { ...manualConfirmed, [itemKey]: !manualConfirmed[itemKey] };
    setManualConfirmed(next); // optimistic
    setManualConfirmLoading(true);
    try {
      await fetch('/api/month-end/manual-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedYear,
          month: checklistMonth,
          key: itemKey,
          value: next[itemKey],
        }),
      });
    } catch {
      setManualConfirmed(prev => ({ ...prev, [itemKey]: !next[itemKey] })); // rollback
    } finally {
      setManualConfirmLoading(false);
    }
  }

  return {
    checklistData,
    checklistLoading,
    checklistMonth,
    setChecklistMonth,
    manualConfirmed,
    manualConfirmLoading,
    fetchChecklist,
    toggleManualConfirm,
  };
}
