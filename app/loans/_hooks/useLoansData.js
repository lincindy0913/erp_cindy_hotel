'use client';

import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort } from '@/components/SortableTh';
import { todayStr, parseLocalDate } from '@/lib/localDate';

export function useLoansData() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const now = new Date();

  // ---- Shared data ----
  const [loans, setLoans] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  // ---- Overview filters ----
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOwnerType, setFilterOwnerType] = useState('');

  // ---- Monthly tab ----
  const [monthlyYear, setMonthlyYear] = useState(now.getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState(now.getMonth() + 1);
  const [monthlyRecords, setMonthlyRecords] = useState([]);

  // ---- Records tab ----
  const [records, setRecords] = useState([]);
  const [recFilterLoan, setRecFilterLoan] = useState('');
  const [recFilterYear, setRecFilterYear] = useState(now.getFullYear());
  const [recFilterMonth, setRecFilterMonth] = useState('');
  const [recFilterStatus, setRecFilterStatus] = useState('');

  // ---- Report tab ----
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportData, setReportData] = useState([]);

  // ---- Annual tab ----
  const [annualYear, setAnnualYear] = useState(now.getFullYear());
  const [annualData, setAnnualData] = useState([]);
  const [annualLoading, setAnnualLoading] = useState(false);

  // ============ DATA FETCHING ============

  async function fetchAll() {
    setLoading(true);
    setFetchError(null);
    try {
      const [loansRes, accountsRes, whRes, subjectsRes] = await Promise.all([
        fetch('/api/loans'),
        fetch('/api/cashflow/accounts'),
        fetch('/api/warehouse-departments'),
        fetch('/api/accounting-subjects')
      ]);
      if (!loansRes.ok) throw new Error(`HTTP ${loansRes.status}`);
      const loansData = await loansRes.json();
      const accountsData = await accountsRes.json();
      const whData = await whRes.json();
      const subjectsData = await subjectsRes.json();

      setLoans(Array.isArray(loansData) ? loansData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      setAccountingSubjects(Array.isArray(subjectsData) ? subjectsData : []);
      const whList = whData && whData.list ? whData.list : (Array.isArray(whData) ? whData : []);
      const buildingNames = whList.filter(w => w.type === 'building' || (!w.parentId && !w.type)).map(w => w.name);
      setWarehouses(buildingNames.length > 0 ? buildingNames : whList.filter(w => !w.parentId).map(w => w.name));
    } catch (e) {
      console.error('載入資料錯誤:', e);
      setFetchError('貸款資料載入失敗，請重新整理頁面。');
    }
    setLoading(false);
  }

  async function fetchMonthlyRecords() {
    try {
      const res = await fetch(`/api/loans/records?year=${monthlyYear}&month=${monthlyMonth}`);
      const json = await res.json();
      setMonthlyRecords(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error('載入月還款錯誤:', e);
    }
  }

  async function fetchAllRecords() {
    try {
      let url = `/api/loans/records?year=${recFilterYear}`;
      if (recFilterLoan) url += `&loanId=${recFilterLoan}`;
      if (recFilterMonth) url += `&month=${recFilterMonth}`;
      if (recFilterStatus) url += `&status=${recFilterStatus}`;
      const res = await fetch(url);
      const json = await res.json();
      setRecords(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error('載入還款記錄錯誤:', e);
    }
  }

  async function fetchReportData() {
    try {
      const res = await fetch(`/api/loans/records?year=${reportYear}&month=${reportMonth}`);
      const json = await res.json();
      setReportData(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error('載入報表錯誤:', e);
    }
  }

  async function fetchAnnualData() {
    setAnnualLoading(true);
    try {
      const res = await fetch(`/api/loans/records?year=${annualYear}`);
      const json = await res.json();
      setAnnualData(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error('載入年度報表錯誤:', e);
    }
    setAnnualLoading(false);
  }

  // ============ AUTO MONTHLY SETUP ============

  async function autoSetupMonthly() {
    try {
      await fetch('/api/loans/records/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth })
      });
      await fetch('/api/loans/records/auto-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth, daysBeforeDue: 10 })
      });
      await fetch('/api/loans/records/sync-cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth })
      });
    } catch (e) {
      console.error('自動設定月度記錄錯誤:', e);
    }
    fetchMonthlyRecords();
  }

  // ============ EFFECTS ============

  useEffect(() => { fetchAll(); }, []);

  // ============ RECORD ACTIONS ============

  async function deleteLoan(loan) {
    if (!(await confirm(`確定要刪除「${loan.loanName}」嗎？`, { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/loans/${loan.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
        return;
      }
      fetchAll();
    } catch (e) {
      showToast('刪除失敗: ' + e.message, 'error');
    }
  }

  async function deleteRecord(record) {
    const label = record.status === '已核實' ? '此操作將同時刪除相關現金交易並回沖餘額，' : '';
    if (!(await confirm(`${label}確定要刪除此還款記錄嗎？`, { title: '刪除確認', danger: true }))) return;
    try {
      const res = await fetch(`/api/loans/records/${record.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
        return;
      }
      fetchMonthlyRecords();
      fetchAllRecords();
      fetchAll();
    } catch (e) {
      showToast('刪除失敗: ' + e.message, 'error');
    }
  }

  // ============ PUSH TO CASHIER ============

  function getDaysUntilDue(dueDate) {
    if (!dueDate) return null;
    const due = parseLocalDate(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  }

  function formatCurrencyLocal(val) {
    if (val === null || val === undefined) return '-';
    return Number(val).toLocaleString('zh-TW');
  }

  async function pushToCashier(record) {
    const loan = loans.find(l => l.id === record.loanId);
    if (!loan) return;
    const acctId = record.deductAccountId || loan.deductAccountId;
    const acct = accounts.find(a => a.id === acctId);
    if (!acct) {
      showToast('找不到扣款帳戶', 'error');
      return;
    }
    if (!(await confirm(`確定推送「${loan.loanName}」(預估 ${formatCurrencyLocal(record.estimatedTotal)}) 至出納？`, { title: '推送確認', danger: false }))) return;

    try {
      const payRes = await fetch('/api/payment-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: [],
          supplierName: `${loan.bankName} — ${loan.loanName}`,
          warehouse: loan.warehouse || null,
          paymentMethod: '匯款',
          amount: record.estimatedTotal,
          discount: 0,
          netAmount: record.estimatedTotal,
          dueDate: record.dueDate,
          accountId: acctId,
          note: `貸款還款預存 — ${loan.loanCode} ${record.recordYear}/${String(record.recordMonth).padStart(2, '0')} (暫估${formatCurrencyLocal(record.estimatedTotal)})`,
          status: '待出納'
        })
      });
      if (!payRes.ok) {
        const err = await payRes.json();
        showToast(err?.error?.message || err?.error || '建立付款單失敗', 'error');
        return;
      }
      const payData = await payRes.json();
      await fetch(`/api/loans/records/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '待出納', paymentOrderId: payData.id })
      });
      showToast(`已推送至出納，出納可在「出納管理」頁面查看並執行付款`, 'success');
      fetchMonthlyRecords();
    } catch (e) {
      showToast('推送失敗: ' + e.message, 'error');
    }
  }

  async function batchPushToCashier() {
    const dueRecords = monthlyRecords.filter(r => {
      if (r.status !== '暫估') return false;
      const days = getDaysUntilDue(r.dueDate);
      return days !== null && days <= 7;
    });
    if (dueRecords.length === 0) {
      showToast('目前沒有7天內到期且未推送的記錄', 'info');
      return;
    }
    if (!(await confirm(`共 ${dueRecords.length} 筆即將到期，確定全部推送出納？\n將為每筆建立付款單。`, { title: '批次推送確認', danger: false }))) return;
    let pushed = 0;
    let failed = 0;
    for (const rec of dueRecords) {
      const loan = loans.find(l => l.id === rec.loanId);
      if (!loan) { failed++; continue; }
      const acctId = rec.deductAccountId || loan.deductAccountId;
      try {
        const payRes = await fetch('/api/payment-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceIds: [],
            supplierName: `${loan.bankName} — ${loan.loanName}`,
            warehouse: loan.warehouse || null,
            paymentMethod: '匯款',
            amount: rec.estimatedTotal,
            discount: 0,
            netAmount: rec.estimatedTotal,
            dueDate: rec.dueDate,
            accountId: acctId,
            note: `貸款還款預存 — ${loan.loanCode} ${rec.recordYear}/${String(rec.recordMonth).padStart(2, '0')}`,
            status: '待出納'
          })
        });
        if (!payRes.ok) { failed++; continue; }
        const payData = await payRes.json();
        await fetch(`/api/loans/records/${rec.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: '待出納', paymentOrderId: payData.id })
        });
        pushed++;
      } catch (_) { failed++; }
    }
    showToast(`已推送 ${pushed} 筆至出納${failed > 0 ? `，${failed} 筆失敗` : ''}`, failed > 0 ? 'warning' : 'success');
    fetchMonthlyRecords();
  }

  // ============ COMPUTED VALUES ============

  const filteredLoans = loans.filter(l => {
    if (filterWarehouse && l.warehouse !== filterWarehouse) return false;
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterOwnerType && l.ownerType !== filterOwnerType) return false;
    return true;
  });

  const { sortKey: loanOvKey, sortDir: loanOvDir, toggleSort: toggleLoanOv } = useColumnSort('loanCode', 'asc');
  const sortedFilteredLoans = useMemo(
    () =>
      sortRows(filteredLoans, loanOvKey, loanOvDir, {
        loanCode: (l) => l.loanCode || '',
        loanName: (l) => l.loanName || '',
        bankName: (l) => l.bankName || '',
        warehouse: (l) => l.warehouse || '',
        originalAmount: (l) => Number(l.originalAmount || 0),
        currentBalance: (l) => Number(l.currentBalance ?? l.loanAmount ?? 0),
        annualRate: (l) => {
          const r = l.annualRate;
          if (typeof r === 'number' && !Number.isNaN(r)) return r;
          return parseFloat(String(r).replace(/%/g, '')) || 0;
        },
        endDate: (l) => l.endDate || '',
        deductAccount: (l) => l.deductAccount?.name || '',
        status: (l) => l.status || '',
      }),
    [filteredLoans, loanOvKey, loanOvDir]
  );

  const monthlyMatrixRows = useMemo(() => {
    const active = loans.filter((l) => l.status === '使用中');
    const rm = {};
    monthlyRecords.forEach((r) => { rm[r.loanId] = r; });
    return active.map((loan) => ({ loan, rec: rm[loan.id] }));
  }, [loans, monthlyRecords]);

  const { sortKey: loanMonKey, sortDir: loanMonDir, toggleSort: toggleLoanMon } = useColumnSort('loanName', 'asc');
  const sortedMonthlyMatrixRows = useMemo(
    () =>
      sortRows(monthlyMatrixRows, loanMonKey, loanMonDir, {
        loanName: (row) => row.loan.loanName || '',
        deductAccount: (row) => row.loan.deductAccount?.name || '',
        daysLeft: (row) => {
          const rec = row.rec;
          if (!rec?.dueDate) return 999999;
          const due = parseLocalDate(rec.dueDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return Math.ceil((due - today) / 86400000);
        },
        monthStatus: (row) => row.rec?.status || '未建立',
        estimatedTotal: (row) => Number(row.rec?.estimatedTotal ?? -1),
        actualTotal: (row) => Number(row.rec?.actualTotal ?? -1),
        diffCol: (row) => {
          const rec = row.rec;
          if (!rec || (rec.status !== '已核實' && rec.status !== '已預付') || rec.actualTotal == null) return -1e15;
          return rec.estimatedTotal - rec.actualTotal;
        },
        cashFlowCol: (row) => {
          const rec = row.rec;
          if (!rec) return '';
          return [rec.preDeposit ? '1' : '0', rec.cashierTxns?.length || 0, rec.paymentTxns?.length || 0].join('-');
        },
      }),
    [monthlyMatrixRows, loanMonKey, loanMonDir]
  );

  const { sortKey: loanRecKey, sortDir: loanRecDir, toggleSort: toggleLoanRec } = useColumnSort('dueDate', 'desc');
  const sortedLoanRecords = useMemo(
    () =>
      sortRows(records, loanRecKey, loanRecDir, {
        ym: (r) => (r.recordYear || 0) * 100 + (r.recordMonth || 0),
        loanCode: (r) => r.loan?.loanCode || '',
        loanName: (r) => r.loan?.loanName || '',
        dueDate: (r) => r.dueDate || '',
        status: (r) => r.status || '',
        estimatedTotal: (r) => Number(r.estimatedTotal || 0),
        actualPrincipal: (r) => (r.actualPrincipal != null ? Number(r.actualPrincipal) : -1),
        actualInterest: (r) => (r.actualInterest != null ? Number(r.actualInterest) : -1),
        actualTotal: (r) => (r.actualTotal != null ? Number(r.actualTotal) : -1),
        confirmedAt: (r) => r.confirmedAt || '',
      }),
    [records, loanRecKey, loanRecDir]
  );

  const activeLoans = loans.filter(l => l.status === '使用中');
  const totalBalance = activeLoans.reduce((sum, l) => sum + l.currentBalance, 0);
  const thisMonthDue = monthlyRecords.filter(r => r.status === '暫估' || r.status === '待出納').length;
  const overdueLoans = activeLoans.filter(l => { const end = new Date(l.endDate); return end < now; }).length;

  function getDueDateWarning(endDate) {
    if (!endDate) return null;
    const end = new Date(endDate);
    const diffMs = end - now;
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);
    if (diffMonths < 0) return { level: 'overdue', label: '已到期', class: 'bg-red-100 text-red-800' };
    if (diffMonths <= 3) return { level: 'urgent', label: '3個月內到期', class: 'bg-orange-100 text-orange-800' };
    if (diffMonths <= 6) return { level: 'warning', label: '6個月內到期', class: 'bg-yellow-100 text-yellow-800' };
    return null;
  }

  return {
    now,
    // Shared data
    loans, setLoans,
    accounts,
    accountingSubjects,
    warehouses,
    loading,
    fetchError,
    fetchAll,
    fetchMonthlyRecords,
    // Overview filters
    filterWarehouse, setFilterWarehouse,
    filterStatus, setFilterStatus,
    filterOwnerType, setFilterOwnerType,
    // Monthly
    monthlyYear, setMonthlyYear,
    monthlyMonth, setMonthlyMonth,
    monthlyRecords, setMonthlyRecords,
    // Records
    records,
    recFilterLoan, setRecFilterLoan,
    recFilterYear, setRecFilterYear,
    recFilterMonth, setRecFilterMonth,
    recFilterStatus, setRecFilterStatus,
    // Report
    reportYear, setReportYear,
    reportMonth, setReportMonth,
    reportData,
    // Annual
    annualYear, setAnnualYear,
    annualData,
    annualLoading,
    // Actions
    deleteLoan,
    deleteRecord,
    getDaysUntilDue,
    pushToCashier,
    batchPushToCashier,
    // Expose fetch fns for tab-gated effects in page.js
    fetchAllRecords,
    fetchReportData,
    fetchAnnualData,
    autoSetupMonthly,
    // Computed
    filteredLoans,
    sortedFilteredLoans,
    loanOvKey, loanOvDir, toggleLoanOv,
    sortedMonthlyMatrixRows,
    loanMonKey, loanMonDir, toggleLoanMon,
    sortedLoanRecords,
    loanRecKey, loanRecDir, toggleLoanRec,
    activeLoans,
    totalBalance,
    thisMonthDue,
    overdueLoans,
    getDueDateWarning,
  };
}
