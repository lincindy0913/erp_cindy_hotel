'use client';
import { useState, useCallback } from 'react';
import { todayStr } from '@/lib/localDate';

export function useBnbAnalytics({ showToast }) {
  const thisYear = () => new Date().getFullYear().toString();

  // 入住率
  const [occYear,      setOccYear]      = useState(thisYear);
  const [occWarehouse, setOccWarehouse] = useState('');
  const [occData,      setOccData]      = useState(null);
  const [occLoading,   setOccLoading]   = useState(false);

  // 來源分析
  const [saYear,      setSaYear]      = useState(thisYear);
  const [saWarehouse, setSaWarehouse] = useState('');
  const [saData,      setSaData]      = useState(null);
  const [saLoading,   setSaLoading]   = useState(false);

  // OTA 收益分析
  const [oaYear,      setOaYear]      = useState(thisYear);
  const [oaWarehouse, setOaWarehouse] = useState('');
  const [oaData,      setOaData]      = useState(null);
  const [oaPrevData,  setOaPrevData]  = useState(null);
  const [oaCompare,   setOaCompare]   = useState(false);
  const [oaLoading,   setOaLoading]   = useState(false);

  // 收款分流
  const [psYear,      setPsYear]      = useState(thisYear);
  const [psWarehouse, setPsWarehouse] = useState('');
  const [psData,      setPsData]      = useState(null);
  const [psLoading,   setPsLoading]   = useState(false);

  // 付款稽核
  const [auditMonth,     setAuditMonth]     = useState(() => todayStr().slice(0, 7));
  const [auditWarehouse, setAuditWarehouse] = useState('');
  const [auditData,      setAuditData]      = useState([]);
  const [auditLoading,   setAuditLoading]   = useState(false);
  const [auditOverflow,  setAuditOverflow]  = useState(false);

  // 房客歷史
  const [ghSearch,   setGhSearch]   = useState('');
  const [ghData,     setGhData]     = useState([]);
  const [ghLoading,  setGhLoading]  = useState(false);
  const [ghSearched, setGhSearched] = useState(false);

  // 月彙整
  const [summaryYear,      setSummaryYear]      = useState(thisYear);
  const [summaryWarehouse, setSummaryWarehouse] = useState('');
  const [summaryMode,      setSummaryMode]      = useState('monthly');
  const [summaryRows,      setSummaryRows]      = useState([]);
  const [summaryLoading,   setSummaryLoading]   = useState(false);
  const [summaryFixedHelp, setSummaryFixedHelp] = useState(null);

  const fetchOccupancy = useCallback(async () => {
    setOccLoading(true);
    try {
      const p = new URLSearchParams({ year: occYear });
      if (occWarehouse) p.set('warehouse', occWarehouse);
      const res = await fetch(`/api/bnb/occupancy?${p}`);
      if (res.ok) setOccData(await res.json());
    } catch { showToast('載入入住率失敗', 'error'); }
    finally { setOccLoading(false); }
  }, [occYear, occWarehouse]);

  const fetchSourceAnalysis = useCallback(async () => {
    setSaLoading(true);
    try {
      const p = new URLSearchParams({ year: saYear });
      if (saWarehouse) p.set('warehouse', saWarehouse);
      const res = await fetch(`/api/bnb/source-analysis?${p}`);
      if (res.ok) setSaData(await res.json());
    } catch { showToast('載入來源分析失敗', 'error'); }
    finally { setSaLoading(false); }
  }, [saYear, saWarehouse]);

  const fetchOtaAnalytics = useCallback(async () => {
    setOaLoading(true);
    try {
      const buildUrl = (y) => {
        const p = new URLSearchParams({ year: y });
        if (oaWarehouse) p.set('warehouse', oaWarehouse);
        return `/api/bnb/ota-analytics?${p}`;
      };
      const [data, prevData] = await Promise.all([
        fetch(buildUrl(oaYear)).then(r => r.ok ? r.json() : null),
        oaCompare
          ? fetch(buildUrl(parseInt(oaYear) - 1)).then(r => r.ok ? r.json() : null)
          : Promise.resolve(null),
      ]);
      if (data) { setOaData(data); setOaPrevData(prevData); }
    } catch { showToast('載入 OTA 分析失敗', 'error'); }
    finally { setOaLoading(false); }
  }, [oaYear, oaWarehouse, oaCompare]);

  const fetchPaymentSplit = useCallback(async () => {
    setPsLoading(true);
    try {
      const p = new URLSearchParams({ year: psYear });
      if (psWarehouse) p.set('warehouse', psWarehouse);
      const res = await fetch(`/api/bnb/payment-split?${p}`);
      if (res.ok) setPsData(await res.json());
    } catch { showToast('載入收款分流失敗', 'error'); }
    finally { setPsLoading(false); }
  }, [psYear, psWarehouse]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const p = new URLSearchParams({ month: auditMonth, pageSize: '500' });
      if (auditWarehouse) p.set('warehouse', auditWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows = (json.data ?? json).filter(r => r.status !== '已刪除');
      setAuditData(rows);
      setAuditOverflow(rows.length >= 500);
    } catch { showToast('載入付款稽核失敗', 'error'); }
    finally { setAuditLoading(false); }
  }, [auditMonth, auditWarehouse]);

  const fetchGuestHistory = useCallback(async () => {
    if (!ghSearch.trim()) { showToast('請輸入姓名搜尋', 'error'); return; }
    setGhLoading(true);
    setGhSearched(true);
    try {
      const p = new URLSearchParams({ guestName: ghSearch.trim().replace(/\s+/g, ''), pageSize: '200' });
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) return;
      const json = await res.json();
      setGhData((json.data ?? json).filter(r => r.status !== '已刪除'));
    } catch { showToast('載入房客歷史失敗', 'error'); }
    finally { setGhLoading(false); }
  }, [ghSearch]);

  const fetchSummary = useCallback(async () => {
    setSummaryRows([]);
    setSummaryLoading(true);
    try {
      const p = new URLSearchParams({ year: summaryYear, mode: summaryMode });
      if (summaryWarehouse) p.set('warehouse', summaryWarehouse);
      const res = await fetch(`/api/bnb/monthly-summary?${p}`);
      if (!res.ok) { showToast('載入月彙整失敗', 'error'); setSummaryFixedHelp(null); return; }
      const data = await res.json();
      setSummaryRows(data.rows || []);
      setSummaryFixedHelp(data.fixedExpenseHelp ?? null);
    } catch { showToast('載入月彙整失敗', 'error'); setSummaryFixedHelp(null); }
    finally { setSummaryLoading(false); }
  }, [summaryYear, summaryWarehouse, summaryMode]);

  return {
    // 入住率
    occYear, setOccYear, occWarehouse, setOccWarehouse, occData, occLoading, fetchOccupancy,
    // 來源分析
    saYear, setSaYear, saWarehouse, setSaWarehouse, saData, saLoading, fetchSourceAnalysis,
    // OTA 收益分析
    oaYear, setOaYear, oaWarehouse, setOaWarehouse, oaData, oaPrevData, oaCompare, setOaCompare, oaLoading, fetchOtaAnalytics,
    // 收款分流
    psYear, setPsYear, psWarehouse, setPsWarehouse, psData, psLoading, fetchPaymentSplit,
    // 付款稽核
    auditMonth, setAuditMonth, auditWarehouse, setAuditWarehouse, auditData, auditLoading, auditOverflow, fetchAudit,
    // 房客歷史
    ghSearch, setGhSearch, ghData, ghLoading, ghSearched, fetchGuestHistory,
    // 月彙整
    summaryYear, setSummaryYear, summaryWarehouse, setSummaryWarehouse, summaryMode, setSummaryMode,
    summaryRows, summaryLoading, summaryFixedHelp, fetchSummary,
  };
}
