'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useConfirm } from '@/context/ConfirmContext';
import { RECON_STATUS, RECON_LINE_STATUS } from '@/lib/recon-statuses';

export function useBankReconciliation() {
  const confirm = useConfirm();
  const [accounts, setAccounts]   = useState([]);
  const [accountId, setAccountId] = useState('');
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [stmts, setStmts]         = useState([]);
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [autoMatching, setAutoMatching] = useState(false);

  // 新增存摺明細的表單狀態
  const [lineForm, setLineForm]   = useState({ txDate: '', description: '', creditAmount: '', debitAmount: '', runningBalance: '', note: '' });
  const [addingLine, setAddingLine] = useState(false);
  const lineDateRef = useRef(null);

  // 補建現金流 modal
  const [buildModal, setBuildModal] = useState(null);
  const [buildCategoryId, setBuildCategoryId] = useState('');
  const [buildDesc, setBuildDesc] = useState('');
  const [buildLoading, setBuildLoading] = useState(false);
  const [categories, setCategories] = useState([]);

  // 載入現金流科目（補建用）
  useEffect(() => {
    fetch('/api/cashflow/categories')
      .then(r => r.ok ? r.json() : [])
      .then(d => setCategories(Array.isArray(d) ? d.filter(c => c.isActive) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/cashflow/accounts')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const bankAccts = Array.isArray(d) ? d.filter(a => a.type === '銀行存款' && a.isActive) : [];
        setAccounts(bankAccts);
        if (bankAccts.length) setAccountId(String(bankAccts[0].id));
      })
      .catch(e => {
        console.error('[bank-reconciliation] failed to load accounts', e);
        setError('銀行帳戶列表載入失敗，請重新整理頁面。');
      });
  }, []);

  const loadList = useCallback(async () => {
    if (!accountId) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/bank-reconciliation?accountId=${accountId}&yearMonth=${yearMonth}`);
      const data = await res.json();
      setStmts(Array.isArray(data) ? data : []);
    } catch { setError('載入失敗'); }
    setLoading(false);
  }, [accountId, yearMonth]);

  useEffect(() => { loadList(); }, [loadList]);

  async function openOrCreate() {
    if (!accountId) return;
    setError(''); setSuccess('');
    const res  = await fetch('/api/bank-reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: parseInt(accountId), yearMonth }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error?.message || '建立失敗'); return; }
    await loadDetail(data.id);
    loadList();
  }

  async function loadDetail(id) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/bank-reconciliation/${id}`);
      const data = await res.json();
      setDetail(data);
    } catch { setError('載入詳情失敗'); }
    setLoading(false);
  }

  async function updateStmt(patch) {
    if (!detail) return;
    const res  = await fetch(`/api/bank-reconciliation/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok) { setDetail(prev => ({ ...prev, ...data })); setSuccess('已更新'); loadList(); }
    else setError(data.error?.message || '更新失敗');
  }

  async function addLine() {
    if (!detail || !lineForm.txDate) return;
    setAddingLine(true);
    const res  = await fetch(`/api/bank-reconciliation/${detail.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txDate:        lineForm.txDate,
        description:   lineForm.description || null,
        creditAmount:  parseFloat(lineForm.creditAmount) || 0,
        debitAmount:   parseFloat(lineForm.debitAmount)  || 0,
        runningBalance: lineForm.runningBalance ? parseFloat(lineForm.runningBalance) : null,
        note:          lineForm.note || null,
      }),
    });
    if (res.ok) {
      setLineForm({ txDate: '', description: '', creditAmount: '', debitAmount: '', runningBalance: '', note: '' });
      setSuccess('已新增明細');
      await loadDetail(detail.id);
      setTimeout(() => lineDateRef.current?.focus(), 50);
    } else {
      const d = await res.json(); setError(d.error?.message || '新增失敗');
    }
    setAddingLine(false);
  }

  async function matchLine(lineId, txId) {
    await fetch(`/api/bank-reconciliation/${detail.id}/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchedTxId: txId, matchStatus: txId ? RECON_LINE_STATUS.MATCHED : RECON_LINE_STATUS.UNMATCHED }),
    });
    await loadDetail(detail.id);
  }

  async function approveException(lineId) {
    await fetch(`/api/bank-reconciliation/${detail.id}/lines/${lineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchStatus: RECON_LINE_STATUS.EXCEPTION }),
    });
    await loadDetail(detail.id);
  }

  async function deleteLine(lineId) {
    if (!(await confirm('確定刪除此行？', { title: '刪除確認', danger: true }))) return;
    await fetch(`/api/bank-reconciliation/${detail.id}/lines/${lineId}`, { method: 'DELETE' });
    await loadDetail(detail.id);
  }

  async function autoMatch() {
    if (!detail) return;
    setAutoMatching(true); setError(''); setSuccess('');
    const res  = await fetch(`/api/bank-reconciliation/${detail.id}/auto-match`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { setSuccess(`自動配對完成：新配對 ${data.matched} 筆，剩餘未配對 ${data.unmatchedAfter} 筆`); await loadDetail(detail.id); }
    else setError(data.error?.message || '自動配對失敗');
    setAutoMatching(false);
  }

  async function handleBuildTx() {
    if (!buildModal || !detail) return;
    setBuildLoading(true);
    const res  = await fetch(
      `/api/bank-reconciliation/${detail.id}/lines/${buildModal.line.id}/build-transaction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: buildCategoryId || undefined, description: buildDesc || undefined }),
      }
    );
    const data = await res.json();
    if (res.ok) {
      setSuccess(`補建完成：${data.transactionNo}（${data.type} ${Number(data.amount).toLocaleString('zh-TW')}）`);
      setBuildModal(null);
      await loadDetail(detail.id);
    } else {
      setError(data.error?.message || '補建失敗');
    }
    setBuildLoading(false);
  }

  function openBuildModal(line) {
    setBuildModal({ line });
    setBuildDesc(line.description || '');
    setBuildCategoryId('');
  }

  // 計算統計
  const stats = (() => {
    if (!detail) return {};
    const sysBalance = detail.closingSystemBalance ?? 0;
    const bankBalance = detail.closingBankBalance ?? null;
    const diff = bankBalance != null ? bankBalance - sysBalance : null;
    const unmatchedLines = (detail.lines || []).filter(l => l.matchStatus === RECON_LINE_STATUS.UNMATCHED).length;
    const unmatchedSysTxs = (detail.systemTransactions || []).filter(t => !t.isMatched).length;
    return { sysBalance, bankBalance, diff, unmatchedLines, unmatchedSysTxs };
  })();

  return {
    // state
    accounts, accountId, setAccountId,
    yearMonth, setYearMonth,
    stmts,
    detail, setDetail,
    loading,
    error, setError,
    success, setSuccess,
    autoMatching,
    lineForm, setLineForm,
    addingLine,
    lineDateRef,
    buildModal, setBuildModal,
    buildCategoryId, setBuildCategoryId,
    buildDesc, setBuildDesc,
    buildLoading,
    categories,
    stats,
    // handlers
    loadList,
    openOrCreate,
    loadDetail,
    updateStmt,
    addLine,
    matchLine,
    approveException,
    deleteLine,
    autoMatch,
    handleBuildTx,
    openBuildModal,
  };
}
