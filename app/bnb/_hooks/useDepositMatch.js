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
      .catch(() => {});
  }, []);

  const fetchDepositMatch = useCallback(async () => {
    if (dmPayType !== 'all' && dmPayType !== 'combined' && !dmAccountId) {
      showToast('請先選擇存簿帳戶', 'error'); return;
    }
    setDmLoading(true);
    try {
      const p = new URLSearchParams({ month: dmMonth, paymentType: dmPayType });
      if (dmAccountId) p.set('accountId', dmAccountId);
      if (dmWarehouse) p.set('warehouse', dmWarehouse);
      const res = await fetch(`/api/bnb/deposit-match?${p}`);
      if (!res.ok) { showToast('載入核對資料失敗', 'error'); return; }
      setDmData(await res.json());
      setDmSelBnb(null);
      setDmSelLine(null);
    } catch { showToast('載入核對資料失敗', 'error'); }
    finally { setDmLoading(false); }
  }, [dmMonth, dmAccountId, dmWarehouse, dmPayType]);

  async function handleMatch() {
    if (!dmSelBnb || !dmSelLine) return;
    setDmMatching(true);
    try {
      const res = await fetch('/api/bnb/deposit-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bnbId: dmSelBnb, bankLineId: dmSelLine, paymentType: dmPayType }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.message || '配對失敗', 'error'); return; }
      showToast('配對成功', 'success');
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

  return {
    dmMonth,     setDmMonth,
    dmWarehouse, setDmWarehouse,
    dmAccountId, setDmAccountId,
    dmData,      setDmData,
    dmLoading,
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
  };
}
