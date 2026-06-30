'use client';

import { useState, useMemo, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr } from '@/lib/localDate';
import { openPrintWindow } from '@/lib/printWindow';
import { INCOME_STATUSES } from '../_lib/rentalHelpers';

function fmt(n) { return Number(n || 0).toLocaleString('zh-TW'); }

export function useRentalIncomes({ initialIncomeFilter, accounts = [], properties = [], onAfterConfirm } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // ── 收租工作台 ────────────────────────────────────────────────
  const [incomes,          setIncomes]          = useState([]);
  const [incomesError,     setIncomesError]     = useState(null);
  const [incomesHasMore,   setIncomesHasMore]   = useState(false);
  const [cashierUtilityMap,setCashierUtilityMap]= useState({});
  const { sortKey: rentIncKey, sortDir: rentIncDir, toggleSort: rentIncToggle } = useColumnSort('contractSortOrder', 'asc');
  const [incomeFilter, setIncomeFilter] = useState(initialIncomeFilter || {
    year: new Date().getFullYear(), month: '', status: '', propertySearch: '', category: '', unlinked: false,
  });

  const sortedIncomes = useMemo(() => {
    const kw  = (incomeFilter.propertySearch || '').trim();
    const cat = (incomeFilter.category || '').trim();
    const filtered = incomes.filter(i => {
      if (kw && !(i.propertyName || '').includes(kw) && !(i.buildingName || '').includes(kw) && !(i.tenantName || '').includes(kw)) return false;
      if (cat && (i.contractCategory || '') !== cat) return false;
      // #2 本月未入帳：已收款但無 cashTransactionId（尚未連結現金流）
      if (incomeFilter.unlinked && !((i.status === 'completed' || i.status === 'partial') && !i.cashTransactionId)) return false;
      return true;
    });
    return sortRows(filtered, rentIncKey, rentIncDir, {
      contractSortOrder: (i) => i.contractSortOrder ?? 9999,
      contractCategory:  (i) => i.contractCategory || '',
      propertyName:      (i) => i.propertyName || '',
      tenantName:        (i) => i.tenantName || '',
      expectedAmount:    (i) => Number(i.expectedAmount || 0),
      actualAmount:      (i) => Number(i.actualAmount || 0),
      remaining:         (i) => Number(i.expectedAmount || 0) - Number(i.actualAmount || 0),
      dueDate:           (i) => i.dueDate || '',
      status:            (i) => (i.status === 'pending' && i.dueDate && new Date(i.dueDate) < new Date(todayStr()) ? 'overdue' : i.status || ''),
      payCount:          (i) => (i.payments?.length || (i.actualAmount != null && i.actualAmount > 0 ? 1 : 0)),
    });
  }, [incomes, rentIncKey, rentIncDir, incomeFilter.propertySearch, incomeFilter.category]);

  // ── Inline payment form ───────────────────────────────────────
  const [payingIncomeId,     setPayingIncomeId]     = useState(null);
  const [incomeFormMode,     setIncomeFormMode]     = useState('confirm');
  const [incomePayForm,      setIncomePayForm]      = useState({
    actualAmount: '', actualDate: todayStr(), accountId: '', paymentMethod: '現金',
    matchTransferRef: '', matchBankAccountName: '', matchNote: '',
  });
  const [incomeUtilityForm, setIncomeUtilityForm] = useState({ expectedAmount: '', actualAmount: '' });
  const [incomePaymentSaving, setIncomePaymentSaving] = useState(false);

  // ── Per-payment editing ───────────────────────────────────────
  const [editingPaymentId,     setEditingPaymentId]     = useState(null);
  const [editingPaymentForm,   setEditingPaymentForm]   = useState({
    amount: '', paymentDate: '', accountId: '', paymentMethod: '',
    matchTransferRef: '', matchBankAccountName: '', matchNote: '',
  });
  const [editingPaymentSaving, setEditingPaymentSaving] = useState(false);

  // ── Batch cashier operations ──────────────────────────────────
  const [selectedIncomeIds, setSelectedIncomeIds] = useState(new Set());
  const [showBatchPay,      setShowBatchPay]      = useState(false);
  const [batchPayForm,      setBatchPayForm]      = useState({ actualDate: todayStr(), accountId: '', paymentMethod: '匯款' });
  const [batchSaving,       setBatchSaving]       = useState(false);
  const [batchProgress,     setBatchProgress]     = useState(null);
  const batchAbortRef = useRef(false);
  const [batchLockSaving, setBatchLockSaving] = useState(false);

  // ── Payment records tab ───────────────────────────────────────
  const { sortKey: paymentSortKey, sortDir: paymentSortDir, toggleSort: paymentToggleSort } = useColumnSort('paymentDate', 'desc');
  const [paymentRecords,           setPaymentRecords]           = useState([]);
  const [paymentRecordsPagination, setPaymentRecordsPagination] = useState({ page: 1, totalCount: 0, totalPages: 1 });
  const [paymentFilter,            setPaymentFilter]            = useState({ year: new Date().getFullYear(), month: '', propertyId: '', accountId: '', paymentMethod: '' });
  const [paymentLoading,           setPaymentLoading]           = useState(false);

  // ── Helpers ───────────────────────────────────────────────────
  function resolvePaymentMethod(incomePaymentMethod, accountId) {
    if (incomePaymentMethod) return incomePaymentMethod;
    const acct = accounts.find(a => String(a.id) === String(accountId));
    if (acct?.type === '現金') return '現金';
    if (acct?.type === '銀行存款') return '匯款';
    return '匯款';
  }

  async function runChunked(items, fn, limit = 8, onProgress) {
    const results = [];
    batchAbortRef.current = false;
    for (let i = 0; i < items.length; i += limit) {
      if (batchAbortRef.current) break;
      const settled = await Promise.allSettled(items.slice(i, i + limit).map(fn));
      results.push(...settled);
      onProgress?.({
        done:   Math.min(results.length, items.length),
        total:  items.length,
        failed: results.filter(r => r.status === 'rejected').length,
      });
    }
    return results;
  }

  // ── Fetch ─────────────────────────────────────────────────────
  async function fetchIncomes(filterOverride) {
    try {
      const f = filterOverride || incomeFilter;
      const params = new URLSearchParams();
      if (f.year)  params.set('year',  f.year);
      if (f.month) params.set('month', f.month);
      if (f.status) params.set('status', f.status);
      const uParams = new URLSearchParams();
      if (f.year)  uParams.set('year',  f.year);
      if (f.month) uParams.set('month', f.month);
      const [incRes, utiRes] = await Promise.all([
        fetch(`/api/rentals/income?${params}`),
        fetch(`/api/rentals/utility-income?${uParams}`),
      ]);
      if (!incRes.ok) throw new Error(`HTTP ${incRes.status}`);
      const incData = await incRes.json();
      setIncomesError(null);
      setIncomes(Array.isArray(incData) ? incData : []);
      setIncomesHasMore(incRes.headers.get('X-Has-More') === 'true');
      if (utiRes.ok) {
        const utiData = await utiRes.json();
        const map = {};
        (Array.isArray(utiData) ? utiData : []).forEach(u => { map[u.propertyId] = u; });
        setCashierUtilityMap(map);
      }
    } catch (e) {
      console.error('[fetchIncomes]', e);
      setIncomesError('收租資料載入失敗，請重試。');
      setIncomes([]);
    }
  }

  async function fetchPaymentRecords(pageNum = 1) {
    setPaymentLoading(true);
    try {
      const params = new URLSearchParams();
      if (paymentFilter.year)          params.set('year',          paymentFilter.year);
      if (paymentFilter.month)         params.set('month',         paymentFilter.month);
      if (paymentFilter.propertyId)    params.set('propertyId',    paymentFilter.propertyId);
      if (paymentFilter.accountId)     params.set('accountId',     paymentFilter.accountId);
      if (paymentFilter.paymentMethod) params.set('paymentMethod', paymentFilter.paymentMethod);
      params.set('page',  pageNum);
      params.set('limit', '100');
      const res = await fetch(`/api/rentals/payments?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPaymentRecords(data.data || []);
      setPaymentRecordsPagination(data.pagination || { page: 1, totalCount: 0, totalPages: 1 });
    } catch (e) {
      console.error('[fetchPaymentRecords]', e);
      setPaymentRecords([]);
    }
    finally { setPaymentLoading(false); }
  }

  // ── Income payment actions ────────────────────────────────────
  function openIncomePayment(income) {
    setIncomeFormMode('confirm');
    setPayingIncomeId(income.id);
    const expected = Number(income.expectedAmount || 0);
    const received = Number(income.actualAmount   || 0);
    const remaining = Math.max(0, expected - received);
    const propertyData = properties.find(p => p.id === income.propertyId);
    const defaultAccountId = String(
      income.accountId ||
      income.contract?.rentAccountId ||
      income.rentCollectAccountId ||
      propertyData?.rentCollectAccountId ||
      propertyData?.rentCollectAccount?.id ||
      ''
    );
    const resolvedAccountId = defaultAccountId === 'null' || defaultAccountId === 'undefined' ? '' : defaultAccountId;
    setIncomePayForm({
      actualAmount:         remaining > 0 ? String(remaining) : String(expected),
      actualDate:           todayStr(),
      accountId:            resolvedAccountId,
      paymentMethod:        resolvePaymentMethod(income.paymentMethod, resolvedAccountId),
      matchTransferRef:     '',
      matchBankAccountName: income.matchBankAccountName || '',
      matchNote:            '',
    });
    if (income.collectUtilityFee) {
      const existingUtility = cashierUtilityMap[income.propertyId];
      setIncomeUtilityForm({
        expectedAmount: existingUtility ? String(existingUtility.expectedAmount) : '',
        actualAmount: '',
      });
    } else {
      setIncomeUtilityForm({ expectedAmount: '', actualAmount: '' });
    }
  }

  function openIncomeEdit(income) {
    setIncomeFormMode('edit');
    setPayingIncomeId(income.id);
    setIncomePayForm({
      actualAmount:         String(income.actualAmount ?? ''),
      actualDate:           income.actualDate || todayStr(),
      accountId:            income.accountId || '',
      paymentMethod:        resolvePaymentMethod(income.paymentMethod, income.accountId || ''),
      matchTransferRef:     income.matchTransferRef || '',
      matchBankAccountName: income.matchBankAccountName || '',
      matchNote:            income.matchNote || '',
    });
  }

  async function confirmIncomePayment() {
    if (!incomePayForm.actualAmount || Number(incomePayForm.actualAmount) <= 0) {
      return showToast('請填寫實收金額', 'error');
    }
    if (!incomePayForm.accountId) return showToast('請選擇收款帳戶', 'error');
    setIncomePaymentSaving(true);
    try {
      let res;
      if (incomeFormMode === 'edit') {
        res = await fetch(`/api/rentals/income/${payingIncomeId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(incomePayForm),
        });
      } else {
        const currentIncome = incomes.find(i => i.id === payingIncomeId);
        const hasUtility = currentIncome?.collectUtilityFee;
        const utilityPayload = hasUtility && (incomeUtilityForm.expectedAmount || incomeUtilityForm.actualAmount)
          ? { expectedAmount: incomeUtilityForm.expectedAmount || '', actualAmount: incomeUtilityForm.actualAmount || '' }
          : null;
        res = await fetch(`/api/rentals/income/${payingIncomeId}/confirm`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rent: incomePayForm, utility: utilityPayload }),
        });
      }
      const data = await res.json();
      if (!res.ok) return showToast(data.error || (incomeFormMode === 'edit' ? '更新失敗' : '確認失敗'), 'error');
      showToast(
        incomeFormMode === 'edit'
          ? '已更新收款資料'
          : `已確認收款 (${data.status === 'partial' ? '部分收款' : '全額收款'})`,
        'success'
      );
      setPayingIncomeId(null);
      fetchIncomes();
      onAfterConfirm?.();
    } catch (err) { showToast(incomeFormMode === 'edit' ? '更新失敗: ' + err.message : '確認失敗: ' + err.message, 'error'); }
    finally { setIncomePaymentSaving(false); }
  }

  function voidIncomePayment(incomeId) {
    confirm('確定要作廢此筆收款？金流將沖銷，收租紀錄恢復為待收。', async () => {
      try {
        const res = await fetch(`/api/rentals/income/${incomeId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '作廢失敗', 'error');
        setPayingIncomeId(null);
        fetchIncomes();
        onAfterConfirm?.();
      } catch (err) { showToast('作廢失敗: ' + err.message, 'error'); }
    }, '作廢收款');
  }

  function exportIncomeCSV() {
    const today = todayStr();
    const rows = [
      ['資產編號', '物業', '棟別', '租客', '年', '月', '分類', '應收', '已收', '欠款', '到期日', '狀態', '備註'],
      ...sortedIncomes.map(i => {
        const expected  = Number(i.expectedAmount || 0);
        const actual    = Number(i.actualAmount   || 0);
        const remaining = Math.max(0, expected - actual);
        const isOvd = i.status === 'pending' && i.dueDate < today;
        const statusLabel = isOvd ? '逾期' : (INCOME_STATUSES.find(s => s.value === i.status)?.label || i.status);
        return [i.contractSortOrder ?? '', i.propertyName || '', i.buildingName || '', i.tenantName || '',
          i.incomeYear || '', i.incomeMonth || '', i.contractCategory || '',
          expected, actual, remaining, i.dueDate || '', statusLabel, i.note || ''];
      }),
    ];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ym = `${incomeFilter.year || ''}${incomeFilter.month ? '_' + incomeFilter.month + '月' : ''}`;
    a.download = `收租工作台${ym ? '_' + ym : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateMonthlyIncome() {
    const genYear  = Number(incomeFilter.year  || new Date().getFullYear());
    const genMonth = Number(incomeFilter.month || (new Date().getMonth() + 1));
    const existing = incomes.filter(i => Number(i.incomeYear) === genYear && Number(i.incomeMonth) === genMonth);
    const msg = existing.length > 0
      ? `⚠️ ${genYear}/${genMonth} 已有 ${existing.length} 筆租金紀錄。\n重複產生可能造成多計，確定繼續？`
      : `確定產生 ${genYear}/${genMonth} 月份租金紀錄？`;
    confirm(msg, async () => {
      try {
        const res = await fetch('/api/rentals/income', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: genYear, month: genMonth }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || '產生失敗', 'error');
        showToast(`已產生 ${data.created} 筆，跳過 ${data.skipped} 筆`, 'success');
        fetchIncomes();
      } catch (err) { showToast('產生失敗: ' + err.message, 'error'); }
    }, existing.length > 0 ? '⚠️ 注意：已有資料' : '產生月份租金', existing.length > 0);
  }

  function printIncomes() {
    const y = incomeFilter.year  || new Date().getFullYear();
    const m = incomeFilter.month ? String(incomeFilter.month).padStart(2, '0') : '全月';
    openPrintWindow(
      `租金收入明細　${y}/${m}`,
      ['序號', '資產編號', '物業', '分類', '租客', '應收金額', '實收金額', '到期日', '狀態'],
      sortedIncomes.map((i, idx) => [
        idx + 1,
        i.contractSortOrder ?? '—',
        i.propertyName,
        i.contractCategory || '—',
        i.tenantName,
        `NT$ ${fmt(i.expectedAmount)}`,
        `NT$ ${fmt(i.actualAmount || 0)}`,
        i.dueDate || '—',
        i.status === 'completed' ? '已收' : i.status === 'partial' ? '部分收' : '待收',
      ])
    );
  }

  // ── Per-payment editing ───────────────────────────────────────
  function openPaymentEdit(payment) {
    setEditingPaymentId(payment.id);
    setEditingPaymentForm({
      amount:               String(payment.amount),
      paymentDate:          payment.paymentDate || '',
      accountId:            String(payment.accountId || ''),
      paymentMethod:        payment.paymentMethod || '匯款',
      matchTransferRef:     payment.matchTransferRef || '',
      matchBankAccountName: payment.matchBankAccountName || '',
      matchNote:            payment.matchNote || '',
    });
  }

  async function savePaymentEdit() {
    if (!editingPaymentForm.amount || Number(editingPaymentForm.amount) <= 0) return showToast('請填寫金額', 'error');
    if (!editingPaymentForm.accountId) return showToast('請選擇收款帳戶', 'error');
    setEditingPaymentSaving(true);
    try {
      const res = await fetch(`/api/rentals/payments/${editingPaymentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPaymentForm),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '更新失敗', 'error');
      showToast('收款已更新', 'success');
      setEditingPaymentId(null);
      fetchIncomes();
      fetchPaymentRecords(paymentRecordsPagination.page);
      onAfterConfirm?.();
    } catch (e) { showToast('更新失敗: ' + e.message, 'error'); }
    finally { setEditingPaymentSaving(false); }
  }

  async function deletePaymentRecord(paymentId) {
    try {
      const res = await fetch(`/api/rentals/payments/${paymentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '刪除失敗', 'error');
      showToast('付款記錄已刪除', 'success');
      fetchIncomes();
      fetchPaymentRecords(paymentRecordsPagination.page);
      onAfterConfirm?.();
    } catch (e) { showToast('刪除失敗: ' + e.message, 'error'); }
  }

  async function toggleIncomeLock(incomeId) {
    try {
      const res = await fetch(`/api/rentals/income/${incomeId}/lock`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '操作失敗', 'error');
      showToast(data.isLocked ? '已鎖帳' : '已解鎖', 'success');
      fetchIncomes();
      fetchPaymentRecords(paymentRecordsPagination.page);
    } catch (e) { showToast('操作失敗: ' + e.message, 'error'); }
  }

  // ── Batch ops ─────────────────────────────────────────────────
  async function batchConfirmIncomes() {
    if (!batchPayForm.accountId) return showToast('請選擇收款帳戶', 'error');
    const ids = Array.from(selectedIncomeIds);
    if (ids.length === 0) return;
    setBatchSaving(true);
    setBatchProgress({ done: 0, total: ids.length, failed: 0 });
    try {
      const results = await runChunked(ids, async (id) => {
        const income = incomes.find(i => i.id === id);
        if (!income) throw new Error(`id=${id}`);
        const res = await fetch(`/api/rentals/income/${id}/confirm`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rent: {
            actualAmount:  String(Number(income.expectedAmount) - Number(income.actualAmount || 0)),
            actualDate:    batchPayForm.actualDate,
            accountId:     batchPayForm.accountId,
            paymentMethod: batchPayForm.paymentMethod,
            matchTransferRef: '', matchBankAccountName: '', matchNote: '',
          }}),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `id=${id}`); }
      }, 8, setBatchProgress);
      const success = results.filter(r => r.status === 'fulfilled').length;
      const failed  = results.filter(r => r.status === 'rejected').length;
      const aborted = batchAbortRef.current;
      showToast(`批次確認${aborted ? '已中止：' : '完成：'}${success} 筆成功${failed > 0 ? `，${failed} 筆失敗` : ''}`, failed > 0 ? 'warning' : 'success');
      setSelectedIncomeIds(new Set());
      setShowBatchPay(false);
      fetchIncomes();
      onAfterConfirm?.();
    } catch (e) { showToast('批次操作失敗: ' + e.message, 'error'); }
    finally { setBatchSaving(false); setBatchProgress(null); }
  }

  async function batchLockIncomes() {
    const ids = Array.from(selectedIncomeIds).filter(id => {
      const inc = incomes.find(i => i.id === id);
      return inc && !inc.isLocked;
    });
    if (ids.length === 0) return showToast('沒有可鎖帳的紀錄', 'error');
    setBatchLockSaving(true);
    try {
      const res = await fetch('/api/rentals/income/batch-lock', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(d.error || '批次鎖帳失敗', 'error');
      showToast(`已鎖帳 ${d.locked} 筆`, 'success');
      setSelectedIncomeIds(new Set());
      fetchIncomes();
    } catch (e) { showToast('批次鎖帳失敗: ' + e.message, 'error'); }
    finally { setBatchLockSaving(false); }
  }

  return {
    // incomes
    incomes, setIncomes, incomesError,
    incomesHasMore,
    cashierUtilityMap, setCashierUtilityMap,
    rentIncKey, rentIncDir, rentIncToggle,
    incomeFilter, setIncomeFilter,
    sortedIncomes,
    // inline payment
    payingIncomeId, setPayingIncomeId,
    incomeFormMode, setIncomeFormMode,
    incomePayForm, setIncomePayForm,
    incomeUtilityForm, setIncomeUtilityForm,
    incomePaymentSaving,
    // per-payment editing
    editingPaymentId, setEditingPaymentId,
    editingPaymentForm, setEditingPaymentForm,
    editingPaymentSaving,
    // batch ops
    selectedIncomeIds, setSelectedIncomeIds,
    showBatchPay, setShowBatchPay,
    batchPayForm, setBatchPayForm,
    batchSaving,
    batchProgress, setBatchProgress,
    batchAbortRef,
    batchLockSaving,
    // payment records
    paymentSortKey, paymentSortDir, paymentToggleSort,
    paymentRecords,
    paymentRecordsPagination,
    paymentFilter, setPaymentFilter,
    paymentLoading,
    // functions
    fetchIncomes,
    fetchPaymentRecords,
    resolvePaymentMethod,
    openIncomePayment,
    openIncomeEdit,
    confirmIncomePayment,
    voidIncomePayment,
    exportIncomeCSV,
    generateMonthlyIncome,
    printIncomes,
    openPaymentEdit,
    savePaymentEdit,
    deletePaymentRecord,
    toggleIncomeLock,
    batchConfirmIncomes,
    batchLockIncomes,
  };
}
