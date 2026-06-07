'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';

export function useDepositMatch() {
  const { showToast } = useToast();

  const [dmMonth,     setDmMonth]     = useState(() => todayStr().slice(0, 7));
  const [dmWarehouse, setDmWarehouse] = useState('');
  const [dmAccountId, setDmAccountId] = useState('');
  const [dmData,      setDmData]      = useState(null);
  const [dmLoading,   setDmLoading]   = useState(false);
  const [dmError,     setDmError]     = useState(null);
  const [dmAccounts,  setDmAccounts]  = useState([]);
  const [dmSelBnb,    setDmSelBnb]    = useState(null);
  const [dmSelLine,   setDmSelLine]   = useState(null);
  const [dmMatching,  setDmMatching]  = useState(false);
  const [dmPayType,   setDmPayType]   = useState('combined');
  const [dmMarkModal, setDmMarkModal] = useState(null);
  const [dmMarkNote,  setDmMarkNote]  = useState('');

  useEffect(() => {
    fetch('/api/cashflow/accounts')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDmAccounts(data.filter(a => a.type === '銀行存款' && a.isActive)))
      .catch(() => showToast('存簿帳戶清單載入失敗，請重新整理頁面', 'error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDepositMatch = useCallback(async () => {
    if (dmPayType !== 'all' && dmPayType !== 'combined' && !dmAccountId) {
      showToast('請先選擇存簿帳戶', 'error'); return;
    }
    setDmLoading(true);
    setDmError(null);
    try {
      const p = new URLSearchParams({ month: dmMonth, paymentType: dmPayType });
      if (dmAccountId) p.set('accountId', dmAccountId);
      if (dmWarehouse) p.set('warehouse', dmWarehouse);
      const res = await fetch(`/api/bnb/deposit-match?${p}`);
      if (!res.ok) { setDmError('載入核對資料失敗，請稍後再試'); return; }
      setDmData(await res.json());
      setDmSelBnb(null);
      setDmSelLine(null);
    } catch { setDmError('載入核對資料失敗，請稍後再試'); }
    finally { setDmLoading(false); }
  }, [dmMonth, dmAccountId, dmWarehouse, dmPayType, showToast]);

  async function handleMatch(onSuccess) {
    if (!dmSelBnb || !dmSelLine) return;
    setDmMatching(true);
    const matchedId = dmSelBnb;
    try {
      const res = await fetch('/api/bnb/deposit-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bnbId: dmSelBnb, bankLineId: dmSelLine, paymentType: dmPayType }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.message || '配對失敗', 'error'); return; }
      showToast('配對成功－已寫入訂房後五碼', 'success', onSuccess ? { onClick: () => onSuccess(matchedId), label: '→ 查看訂房' } : null);
      setDmSelBnb(null); setDmSelLine(null);
      fetchDepositMatch();
    } catch { showToast('配對失敗', 'error'); }
    finally { setDmMatching(false); }
  }

  async function handleUnmatch(bnbId) {
    const res = await fetch(`/api/bnb/deposit-match?bnbId=${bnbId}&paymentType=${dmPayType}`, { method: 'DELETE' });
    if (!res.ok) { showToast('解除配對失敗', 'error'); return; }
    showToast('已解除配對', 'success');
    fetchDepositMatch();
  }

  async function handleMark() {
    if (!dmMarkModal) return;
    const { bnbId, skipType, paymentType: modalPayType } = dmMarkModal;
    const res = await fetch('/api/bnb/deposit-match', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bnbId, paymentType: modalPayType || dmPayType, matchSkip: skipType, matchSkipNote: dmMarkNote || null }),
    });
    if (!res.ok) { showToast('標記失敗', 'error'); return; }
    showToast('已標記', 'success');
    setDmMarkModal(null);
    setDmMarkNote('');
    fetchDepositMatch();
  }

  async function handleClearMark(bnbId, paymentType) {
    const res = await fetch('/api/bnb/deposit-match', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bnbId, paymentType: paymentType || dmPayType, matchSkip: null, matchSkipNote: null }),
    });
    if (!res.ok) { showToast('清除標記失敗', 'error'); return; }
    fetchDepositMatch();
  }

  async function handleAutoMatch() {
    const suggestions = dmData?.suggestions || [];
    if (!suggestions.length) { showToast('目前沒有可自動配對的項目', 'info'); return; }
    setDmMatching(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const s of suggestions) {
        const res = await fetch('/api/bnb/deposit-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bnbId: s.bnbId, bankLineId: s.bankLineId, paymentType: dmPayType }),
        });
        if (res.ok) succeeded++; else failed++;
      }
      await fetchDepositMatch();
      if (failed > 0) {
        showToast(`配對完成：${succeeded} 筆成功，${failed} 筆失敗`, 'error');
      } else {
        const totalUnmatched = (dmData?.summary?.unmatchedBnbCount ?? 0) - succeeded;
        showToast(
          `已配對 ${succeeded} 筆${totalUnmatched > 0 ? `，仍有 ${totalUnmatched} 筆待處理` : '，全部配對完成！'}`,
          succeeded > 0 ? 'success' : 'info'
        );
        if (totalUnmatched > 0) {
          setTimeout(() => {
            document.querySelector('[data-first-unmatched]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    } catch { showToast('自動配對發生錯誤', 'error'); }
    finally { setDmMatching(false); }
  }

  // ── 流水帳 ────────────────────────────────────────────────────
  const [ledgerMonthFrom, setLedgerMonthFrom] = useState(() => todayStr().slice(0, 7));
  const [ledgerMonthTo,   setLedgerMonthTo]   = useState(() => todayStr().slice(0, 7));
  const [ledgerWarehouse, setLedgerWarehouse] = useState('');
  const [ledgerRows,      setLedgerRows]      = useState([]);
  const [ledgerLoading,   setLedgerLoading]   = useState(false);

  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const p = new URLSearchParams({ pageSize: '500' });
      if (ledgerMonthFrom) p.set('monthFrom', ledgerMonthFrom);
      if (ledgerMonthTo)   p.set('monthTo',   ledgerMonthTo);
      if (ledgerWarehouse) p.set('warehouse', ledgerWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) { showToast('載入流水帳失敗', 'error'); return; }
      const json = await res.json();
      setLedgerRows(json.data ?? json);
    } catch { showToast('載入流水帳失敗', 'error'); }
    finally { setLedgerLoading(false); }
  }, [ledgerMonthFrom, ledgerMonthTo, ledgerWarehouse, showToast]);

  // ── 存簿匯入 ──────────────────────────────────────────────────
  const [showBankImport,       setShowBankImport]       = useState(false);
  const [bankImportLines,      setBankImportLines]      = useState([]);
  const [bankImportParsing,    setBankImportParsing]    = useState(false);
  const [bankImportSubmitting, setBankImportSubmitting] = useState(false);
  const [bankImportError,      setBankImportError]      = useState(null);

  async function handleBankFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankImportParsing(true);
    setBankImportError(null);
    setBankImportLines([]);
    try {
      const XLSX = (await import('xlsx')).default;
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' });
      const lines = [];
      for (const row of rows) {
        const txDate = String(row[0] || '').trim();
        if (!txDate || !/\d{4}/.test(txDate)) continue;
        const credit  = parseFloat(String(row[2] || '0').replace(/,/g, '')) || 0;
        const debit   = parseFloat(String(row[3] || '0').replace(/,/g, '')) || 0;
        const balance = parseFloat(String(row[4] || '').replace(/,/g, '')) || null;
        lines.push({ txDate, description: String(row[1] || '').trim(), creditAmount: credit, debitAmount: debit, runningBalance: balance });
      }
      if (!lines.length) { setBankImportError('未能解析到有效交易記錄，請確認檔案格式'); return; }
      setBankImportLines(lines);
    } catch { setBankImportError('檔案解析失敗，請確認格式正確'); }
    finally { setBankImportParsing(false); }
  }

  async function submitBankImport() {
    if (!dmAccountId || !bankImportLines.length) return;
    setBankImportSubmitting(true);
    try {
      const res = await fetch(`/api/bank-reconciliation/${dmAccountId}/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: bankImportLines, month: dmMonth }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.error || '匯入失敗', 'error'); return; }
      showToast(`已匯入 ${d.imported ?? bankImportLines.length} 筆存簿明細`, 'success');
      setShowBankImport(false);
      setBankImportLines([]);
      fetchDepositMatch();
    } catch { showToast('匯入失敗', 'error'); }
    finally { setBankImportSubmitting(false); }
  }

  return {
    dmMonth,     setDmMonth,
    dmWarehouse, setDmWarehouse,
    dmAccountId, setDmAccountId,
    dmData,      setDmData,
    dmLoading,   dmError,
    dmAccounts,  setDmAccounts,
    dmSelBnb,    setDmSelBnb,
    dmSelLine,   setDmSelLine,
    dmMatching,
    dmPayType,   setDmPayType,
    dmMarkModal, setDmMarkModal,
    dmMarkNote,  setDmMarkNote,
    fetchDepositMatch,
    handleMatch,
    handleUnmatch,
    handleMark,
    handleClearMark,
    handleAutoMatch,
    ledgerMonthFrom, setLedgerMonthFrom,
    ledgerMonthTo,   setLedgerMonthTo,
    ledgerWarehouse, setLedgerWarehouse,
    ledgerRows,      ledgerLoading,
    fetchLedger,
    showBankImport,      setShowBankImport,
    bankImportLines,     setBankImportLines,
    bankImportParsing,
    bankImportSubmitting,
    bankImportError,     setBankImportError,
    handleBankFileUpload,
    submitBankImport,
  };
}
