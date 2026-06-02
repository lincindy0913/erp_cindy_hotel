'use client';

import { useState, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { todayStr } from '@/lib/localDate';

export function useRentalAnalytics({ accounts = [], properties = [] } = {}) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  // ── 收入 / 營運報表 ───────────────────────────────────────────
  const [reportYear,           setReportYear]           = useState(new Date().getFullYear());
  const [reportStartDate,      setReportStartDate]      = useState('');
  const [reportEndDate,        setReportEndDate]        = useState('');
  const [reportCategoryFilter, setReportCategoryFilter] = useState('');
  const [incomeReportData,     setIncomeReportData]     = useState({ year: null, rows: [] });
  const [operatingReportData,  setOperatingReportData]  = useState({ year: null, rows: [] });
  const [reportLoading,        setReportLoading]        = useState(false);

  // ── 逾期催繳 ──────────────────────────────────────────────────
  const [overdueReportData,    setOverdueReportData]    = useState([]);
  const [overdueReportLoading, setOverdueReportLoading] = useState(false);
  const [overdueSelectedIds,   setOverdueSelectedIds]   = useState(new Set());
  const [showOverdueBatch,     setShowOverdueBatch]     = useState(false);
  const [overdueBatchForm,     setOverdueBatchForm]     = useState({ actualDate: todayStr(), accountId: '', paymentMethod: '匯款' });
  const [overdueBatchSaving,   setOverdueBatchSaving]   = useState(false);
  const overdueBatchAbortRef = useRef(false);
  const [overdueBatchProgress, setOverdueBatchProgress] = useState(null);

  // ── Quick-pay modal ────────────────────────────────────────────
  const [quickPayIncome,  setQuickPayIncome]  = useState(null);
  const [quickPayForm,    setQuickPayForm]    = useState({ actualAmount: '', actualDate: '', accountId: '', paymentMethod: '匯款' });
  const [quickPaySaving,  setQuickPaySaving]  = useState(false);

  // ── 空置率 ────────────────────────────────────────────────────
  const [vacancyYear,    setVacancyYear]    = useState(new Date().getFullYear());
  const [vacancyData,    setVacancyData]    = useState({ rows: [], avgVacancy: 0, fullyRented: 0 });
  const [vacancyLoading, setVacancyLoading] = useState(false);

  // ── 押金追蹤 ──────────────────────────────────────────────────
  const [depositFilter, setDepositFilter] = useState('all');

  // ── 租金申報 ──────────────────────────────────────────────────
  const [rentFilingYear,        setRentFilingYear]        = useState(new Date().getFullYear());
  const [rentFilingData,        setRentFilingData]        = useState({ rows: [], totals: { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 } });
  const [rentFilingLoading,     setRentFilingLoading]     = useState(false);
  const [showRentFilingModal,   setShowRentFilingModal]   = useState(false);
  const [editingRentFiling,     setEditingRentFiling]     = useState(null);
  const [rentFilingForm,        setRentFilingForm]        = useState({
    propertyId: '', contractId: '', slotIndex: 0,
    isPublicInterest: false, lesseeDisplayName: '',
    declaredMonthlyRent: '', monthsInScope: '12', declaredAnnualIncome: '', estimatedHouseTax: '',
    status: 'draft', note: '',
  });
  const [rentFilingSaving, setRentFilingSaving] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────
  function buildReportParams() {
    const params = new URLSearchParams();
    if (reportStartDate && reportEndDate) {
      if (reportStartDate > reportEndDate) {
        showToast('結束日期不可早於開始日期', 'error');
        return null;
      }
      params.set('startDate', reportStartDate);
      params.set('endDate',   reportEndDate);
    } else {
      params.set('year', reportYear);
    }
    if (reportCategoryFilter) params.set('category', reportCategoryFilter);
    return params.toString();
  }

  function resolvePaymentMethod(incomePaymentMethod, accountId) {
    if (incomePaymentMethod) return incomePaymentMethod;
    const acct = accounts.find(a => String(a.id) === String(accountId));
    if (acct?.type === '現金') return '現金';
    if (acct?.type === '銀行存款') return '匯款';
    return '匯款';
  }

  async function runChunked(items, fn, limit = 8, onProgress) {
    const results = [];
    overdueBatchAbortRef.current = false;
    for (let i = 0; i < items.length; i += limit) {
      if (overdueBatchAbortRef.current) break;
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
  async function fetchIncomeReport() {
    const qs = buildReportParams();
    if (qs === null) return;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/rentals/reports/income-by-month?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setIncomeReportData({ year: data.year, rows: data.rows || [] });
    } catch {
      setIncomeReportData({ year: reportYear, rows: [] });
    } finally {
      setReportLoading(false);
    }
  }

  async function fetchOperatingReport() {
    const qs = buildReportParams();
    if (qs === null) return;
    setReportLoading(true);
    try {
      const res = await fetch(`/api/rentals/reports/operating?${qs}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setOperatingReportData({ year: data.year, rows: data.rows || [] });
    } catch {
      setOperatingReportData({ year: reportYear, rows: [] });
    } finally {
      setReportLoading(false);
    }
  }

  async function fetchOverdueReport() {
    setOverdueReportLoading(true);
    try {
      const today = todayStr();
      const res = await fetch(`/api/rentals/income?status=pending&dueBefore=${today}`);
      const data = await res.json();
      const overdue = (Array.isArray(data) ? data : []).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      setOverdueReportData(overdue);
    } catch { setOverdueReportData([]); }
    finally { setOverdueReportLoading(false); }
  }

  async function fetchVacancyReport() {
    setVacancyLoading(true);
    try {
      const res = await fetch(`/api/rentals/reports/vacancy?year=${vacancyYear}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setVacancyData({ rows: data.rows || [], avgVacancy: data.avgVacancy || 0, fullyRented: data.fullyRented || 0 });
    } catch { setVacancyData({ rows: [], avgVacancy: 0, fullyRented: 0 }); }
    finally { setVacancyLoading(false); }
  }

  async function fetchRentFiling() {
    setRentFilingLoading(true);
    try {
      const res = await fetch(`/api/rentals/rent-filing?year=${rentFilingYear}`);
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);
      setRentFilingData({
        rows:   data.rows   || [],
        totals: data.totals || { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 },
      });
    } catch {
      setRentFilingData({ rows: [], totals: { declaredAnnual: 0, actualAnnual: 0, estimatedHouseTax: 0 } });
    } finally {
      setRentFilingLoading(false);
    }
  }

  // ── Quick pay ─────────────────────────────────────────────────
  function openQuickPay(income) {
    const prop = properties.find(p => p.id === income.propertyId);
    const defaultAccountId = String(
      income.accountId || prop?.rentCollectAccountId || prop?.rentCollectAccount?.id || ''
    );
    const expected  = Number(income.expectedAmount || 0);
    const received  = Number(income.actualAmount   || 0);
    const remaining = Math.max(0, expected - received);
    const resolvedQPAccountId = defaultAccountId === 'null' || defaultAccountId === 'undefined' ? '' : defaultAccountId;
    setQuickPayForm({
      actualAmount:  remaining > 0 ? String(remaining) : String(expected),
      actualDate:    todayStr(),
      accountId:     resolvedQPAccountId,
      paymentMethod: resolvePaymentMethod(income.paymentMethod, resolvedQPAccountId),
    });
    setQuickPayIncome(income);
  }

  async function confirmQuickPay() {
    if (!quickPayForm.actualAmount || Number(quickPayForm.actualAmount) <= 0) return showToast('請填寫實收金額', 'error');
    if (!quickPayForm.accountId) return showToast('請選擇收款帳戶', 'error');

    const actual   = Number(quickPayForm.actualAmount);
    const expected = Number(quickPayIncome?.expectedAmount || 0);
    if (expected > 0 && actual > expected * 1.5) {
      const pct = ((actual / expected - 1) * 100).toFixed(0);
      const ok = await confirm(
        `實收 NT$ ${actual.toLocaleString()} 超出應收 NT$ ${expected.toLocaleString()} 的 ${pct}%，確定繼續？`,
        { title: '金額異常警告', danger: true }
      );
      if (!ok) return;
    }
    if (expected > 0 && actual < expected * 0.1) {
      const ok = await confirm(
        `實收 NT$ ${actual.toLocaleString()} 遠低於應收 NT$ ${expected.toLocaleString()}，確定繼續？`,
        { title: '金額過小警告', danger: false }
      );
      if (!ok) return;
    }

    setQuickPaySaving(true);
    try {
      const res = await fetch(`/api/rentals/income/${quickPayIncome.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rent: quickPayForm }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || '收款失敗', 'error');
      showToast('收款成功！', 'success');
      setQuickPayIncome(null);
      fetchOverdueReport();
    } catch (e) { showToast('操作失敗: ' + e.message, 'error'); }
    finally { setQuickPaySaving(false); }
  }

  // ── Batch confirm overdue ─────────────────────────────────────
  async function batchConfirmOverdueIncomes() {
    if (!overdueBatchForm.accountId)  return showToast('請選擇收款帳戶', 'error');
    if (!overdueBatchForm.actualDate) return showToast('請填寫收款日期', 'error');
    const ids = Array.from(overdueSelectedIds);
    if (!ids.length) return;
    setOverdueBatchSaving(true);
    setOverdueBatchProgress({ done: 0, total: ids.length, failed: 0 });
    try {
      const results = await runChunked(ids, async (id) => {
        const income = overdueReportData.find(i => i.id === id);
        if (!income) throw new Error(`id=${id}`);
        const remaining = Math.max(0, Number(income.expectedAmount || 0) - Number(income.actualAmount || 0));
        const res = await fetch(`/api/rentals/income/${id}/confirm`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rent: {
            actualAmount:  String(remaining || Number(income.expectedAmount)),
            actualDate:    overdueBatchForm.actualDate,
            accountId:     overdueBatchForm.accountId,
            paymentMethod: overdueBatchForm.paymentMethod,
            matchTransferRef: '', matchBankAccountName: '', matchNote: '',
          }}),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `id=${id}`); }
      }, 8, setOverdueBatchProgress);
      const success = results.filter(r => r.status === 'fulfilled').length;
      const failed  = results.filter(r => r.status === 'rejected').length;
      const aborted = overdueBatchAbortRef.current;
      showToast(`批次收款${aborted ? '已中止：' : '完成：'}${success} 筆成功${failed > 0 ? `，${failed} 筆失敗` : ''}`, failed > 0 ? 'warning' : 'success');
      setOverdueSelectedIds(new Set());
      setShowOverdueBatch(false);
      fetchOverdueReport();
    } catch (e) { showToast('批次操作失敗: ' + e.message, 'error'); }
    finally { setOverdueBatchSaving(false); setOverdueBatchProgress(null); }
  }

  // ── Rent filing CRUD ──────────────────────────────────────────
  async function seedRentFilingYear() {
    setRentFilingLoading(true);
    try {
      const res = await fetch('/api/rentals/rent-filing/seed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: rentFilingYear }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || data.message || '建立失敗', 'error');
      showToast(`已建立 ${data.created} 筆草稿，略過 ${data.skipped} 筆已存在`, 'success');
      fetchRentFiling();
    } catch (e) { showToast('建立失敗: ' + e.message, 'error'); }
    finally { setRentFilingLoading(false); }
  }

  function openRentFilingModalForNew(propertiesRef = []) {
    setEditingRentFiling(null);
    setRentFilingForm({
      propertyId: propertiesRef[0]?.id ? String(propertiesRef[0].id) : '',
      contractId: '', slotIndex: 0,
      isPublicInterest: false, lesseeDisplayName: '',
      declaredMonthlyRent: '', monthsInScope: '12', declaredAnnualIncome: '', estimatedHouseTax: '',
      status: 'draft', note: '',
    });
    setShowRentFilingModal(true);
  }

  function openRentFilingModalForEdit(row) {
    setEditingRentFiling(row);
    setRentFilingForm({
      propertyId:           String(row.propertyId),
      contractId:           row.contractId != null ? String(row.contractId) : '',
      slotIndex:            row.slotIndex,
      isPublicInterest:     !!row.isPublicInterest,
      lesseeDisplayName:    row.lesseeDisplayName    || '',
      declaredMonthlyRent:  row.declaredMonthlyRent  != null ? String(row.declaredMonthlyRent)  : '',
      monthsInScope:        row.monthsInScope        != null ? String(row.monthsInScope)        : '12',
      declaredAnnualIncome: row.declaredAnnualIncome != null ? String(row.declaredAnnualIncome) : '',
      estimatedHouseTax:    row.estimatedHouseTax    != null ? String(row.estimatedHouseTax)    : '',
      status: row.status || 'draft',
      note:   row.note   || '',
    });
    setShowRentFilingModal(true);
  }

  function nextSlotForProperty(propertyId) {
    const pid  = parseInt(propertyId, 10);
    const same = rentFilingData.rows.filter(r => r.propertyId === pid);
    if (same.length === 0) return 0;
    return Math.max(...same.map(r => r.slotIndex)) + 1;
  }

  async function saveRentFilingFromModal() {
    if (!rentFilingForm.propertyId) { showToast('請選擇物業', 'error'); return; }
    setRentFilingSaving(true);
    try {
      if (editingRentFiling) {
        const res = await fetch(`/api/rentals/rent-filing/${editingRentFiling.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractId:           rentFilingForm.contractId || null,
            isPublicInterest:     rentFilingForm.isPublicInterest,
            lesseeDisplayName:    rentFilingForm.lesseeDisplayName || null,
            declaredMonthlyRent:  rentFilingForm.declaredMonthlyRent,
            monthsInScope:        rentFilingForm.monthsInScope,
            declaredAnnualIncome: rentFilingForm.declaredAnnualIncome,
            estimatedHouseTax:    rentFilingForm.estimatedHouseTax,
            status: rentFilingForm.status,
            note:   rentFilingForm.note,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || data.message || '儲存失敗', 'error');
        showToast('已儲存', 'success');
      } else {
        const slot = nextSlotForProperty(rentFilingForm.propertyId);
        const res = await fetch('/api/rentals/rent-filing', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId:           parseInt(rentFilingForm.propertyId, 10),
            filingYear:           rentFilingYear,
            slotIndex:            slot,
            contractId:           rentFilingForm.contractId || null,
            isPublicInterest:     rentFilingForm.isPublicInterest,
            lesseeDisplayName:    rentFilingForm.lesseeDisplayName || null,
            declaredMonthlyRent:  rentFilingForm.declaredMonthlyRent,
            monthsInScope:        rentFilingForm.monthsInScope,
            declaredAnnualIncome: rentFilingForm.declaredAnnualIncome,
            estimatedHouseTax:    rentFilingForm.estimatedHouseTax,
            status: rentFilingForm.status,
            note:   rentFilingForm.note,
          }),
        });
        const data = await res.json();
        if (!res.ok) return showToast(data.error || data.message || '建立失敗', 'error');
        showToast('已建立', 'success');
      }
      setShowRentFilingModal(false);
      fetchRentFiling();
    } catch (e) { showToast('儲存失敗: ' + e.message, 'error'); }
    finally { setRentFilingSaving(false); }
  }

  function deleteRentFilingRow(row) {
    confirm('確定刪除此筆申報列？', async () => {
      try {
        const res = await fetch(`/api/rentals/rent-filing/${row.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json();
          return showToast(data.error || '刪除失敗', 'error');
        }
        fetchRentFiling();
      } catch (e) { showToast('刪除失敗: ' + e.message, 'error'); }
    }, '刪除申報列');
  }

  return {
    // income/operating reports
    reportYear, setReportYear,
    reportStartDate, setReportStartDate,
    reportEndDate, setReportEndDate,
    reportCategoryFilter, setReportCategoryFilter,
    incomeReportData,
    operatingReportData,
    reportLoading,
    // overdue
    overdueReportData,
    overdueReportLoading,
    overdueSelectedIds, setOverdueSelectedIds,
    showOverdueBatch, setShowOverdueBatch,
    overdueBatchForm, setOverdueBatchForm,
    overdueBatchSaving,
    overdueBatchProgress,
    overdueBatchAbortRef,
    // quick pay
    quickPayIncome, setQuickPayIncome,
    quickPayForm, setQuickPayForm,
    quickPaySaving,
    // vacancy
    vacancyYear, setVacancyYear,
    vacancyData,
    vacancyLoading,
    // deposit
    depositFilter, setDepositFilter,
    // rent filing
    rentFilingYear, setRentFilingYear,
    rentFilingData,
    rentFilingLoading,
    showRentFilingModal, setShowRentFilingModal,
    editingRentFiling,
    rentFilingForm, setRentFilingForm,
    rentFilingSaving,
    // functions
    fetchIncomeReport,
    fetchOperatingReport,
    fetchOverdueReport,
    fetchVacancyReport,
    fetchRentFiling,
    openQuickPay,
    confirmQuickPay,
    batchConfirmOverdueIncomes,
    seedRentFilingYear,
    openRentFilingModalForNew,
    openRentFilingModalForEdit,
    saveRentFilingFromModal,
    deleteRentFilingRow,
  };
}
