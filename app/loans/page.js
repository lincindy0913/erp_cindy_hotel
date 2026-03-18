'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';

const TABS = [
  { key: 'overview', label: '貸款總覽' },
  { key: 'monthly', label: '本月還款' },
  { key: 'records', label: '還款記錄' },
  { key: 'report', label: '月度報表' }
];

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '待出納': 'bg-orange-100 text-orange-800 border-orange-300',
  '已預付': 'bg-blue-100 text-blue-800 border-blue-300',
  '已核實': 'bg-green-100 text-green-800 border-green-300',
  '跳過': 'bg-gray-100 text-gray-600 border-gray-300',
  '已結清': 'bg-blue-100 text-blue-800 border-blue-300'
};

const LOAN_STATUS_BADGES = {
  '使用中': 'bg-green-100 text-green-800',
  '已結清': 'bg-blue-100 text-blue-800',
  '已停用': 'bg-gray-100 text-gray-600'
};

const OWNER_TYPES = ['公司', '個人'];
const RATE_TYPES = ['固定利率', '浮動利率'];
const REPAYMENT_TYPES = ['本息攤還', '本金攤還', '到期還本', '按月付息'];
const LOAN_TYPES = ['一般貸款', '房屋貸款', '設備貸款', '週轉金', '其他'];
const LOAN_STATUSES = ['使用中', '已結清', '已停用'];

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

function formatDate(d) {
  if (!d) return '-';
  return d;
}

export default function LoansPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [loans, setLoans] = useState([]);
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountingSubjects, setAccountingSubjects] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loanSaving, setLoanSaving] = useState(false);

  // Filters
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOwnerType, setFilterOwnerType] = useState('');

  // Monthly tab
  const now = new Date();
  const [monthlyYear, setMonthlyYear] = useState(now.getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState(now.getMonth() + 1);
  const [monthlyRecords, setMonthlyRecords] = useState([]);

  // Records tab filters
  const [recFilterLoan, setRecFilterLoan] = useState('');
  const [recFilterYear, setRecFilterYear] = useState(now.getFullYear());
  const [recFilterMonth, setRecFilterMonth] = useState('');
  const [recFilterStatus, setRecFilterStatus] = useState('');

  // Report tab
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportData, setReportData] = useState([]);

  // Modal states
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingRecord, setConfirmingRecord] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchLoanIds, setBatchLoanIds] = useState([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    sourceAccountId: '', amount: '', description: '', transactionDate: ''
  });
  const [transferTargetAccount, setTransferTargetAccount] = useState(null);
  const [transfering, setTransfering] = useState(false);
  const [showLoansPrintModal, setShowLoansPrintModal] = useState(false);

  // Loan form
  const [loanForm, setLoanForm] = useState({
    loanName: '', ownerType: '公司', ownerName: '', warehouse: '',
    bankName: '', bankBranch: '', loanType: '一般貸款',
    originalAmount: '', annualRate: '', rateType: '固定利率',
    repaymentType: '本息攤還', repaymentDay: '20',
    startDate: '', endDate: '', deductAccountId: '',
    principalSubjectId: '', interestSubjectId: '',
    contactPerson: '', contactPhone: '', remark: '', sortOrder: '0',
    collateral: '', guarantor: '', guarantorPhone: '', guarantorIdNo: '',
    status: '使用中'
  });

  // Confirm form
  const [confirmForm, setConfirmForm] = useState({
    actualPrincipal: '', actualInterest: '', actualDebitDate: '', statementNo: '', note: ''
  });

  // ============ DATA FETCHING ============

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (activeTab === 'monthly') {
      if (loans.length === 0) fetchAll();
      autoSetupMonthly();
    }
  }, [activeTab, monthlyYear, monthlyMonth]);

  useEffect(() => {
    if (activeTab === 'records') fetchAllRecords();
  }, [activeTab, recFilterLoan, recFilterYear, recFilterMonth, recFilterStatus]);

  useEffect(() => {
    if (activeTab === 'report') fetchReportData();
  }, [activeTab, reportYear, reportMonth]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [loansRes, accountsRes, whRes, subjectsRes] = await Promise.all([
        fetch('/api/loans'),
        fetch('/api/cashflow/accounts'),
        fetch('/api/warehouse-departments'),
        fetch('/api/accounting-subjects')
      ]);
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
    }
    setLoading(false);
  }

  async function fetchMonthlyRecords() {
    try {
      const res = await fetch(`/api/loans/records?year=${monthlyYear}&month=${monthlyMonth}`);
      const data = await res.json();
      setMonthlyRecords(Array.isArray(data) ? data : []);
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
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('載入還款記錄錯誤:', e);
    }
  }

  async function fetchReportData() {
    try {
      const res = await fetch(`/api/loans/records?year=${reportYear}&month=${reportMonth}`);
      const data = await res.json();
      setReportData(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('載入報表錯誤:', e);
    }
  }

  // ============ AUTO MONTHLY SETUP ============

  async function autoSetupMonthly() {
    try {
      // 1. Auto-generate records for current month (if not already existing)
      await fetch('/api/loans/records/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth })
      });

      // 2. Auto-push records due within 10 days to cashier
      await fetch('/api/loans/records/auto-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth, daysBeforeDue: 10 })
      });

      // 3. Sync cashier execution status back
      await fetch('/api/loans/records/sync-cashier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth })
      });
    } catch (e) {
      console.error('自動設定月度記錄錯誤:', e);
    }

    // Finally, fetch the updated records
    fetchMonthlyRecords();
  }

  // ============ LOAN CRUD ============

  function openAddLoan() {
    setEditingLoan(null);
    setLoanForm({
      loanName: '', ownerType: '公司', ownerName: '', warehouse: '',
      bankName: '', bankBranch: '', loanType: '一般貸款',
      originalAmount: '', annualRate: '', rateType: '固定利率',
      repaymentType: '本息攤還', repaymentDay: '20',
      startDate: '', endDate: '', deductAccountId: '',
      principalSubjectId: '', interestSubjectId: '',
      contactPerson: '', contactPhone: '', remark: '', sortOrder: '0',
      collateral: '', guarantor: '', guarantorPhone: '', guarantorIdNo: '',
      status: '使用中'
    });
    setShowLoanModal(true);
  }

  function openEditLoan(loan) {
    setEditingLoan(loan);
    setLoanForm({
      loanName: loan.loanName, ownerType: loan.ownerType, ownerName: loan.ownerName || '',
      warehouse: loan.warehouse || '', bankName: loan.bankName, bankBranch: loan.bankBranch || '',
      loanType: loan.loanType, originalAmount: String(loan.originalAmount),
      annualRate: String(loan.annualRate), rateType: loan.rateType,
      repaymentType: loan.repaymentType, repaymentDay: String(loan.repaymentDay),
      startDate: loan.startDate, endDate: loan.endDate,
      deductAccountId: String(loan.deductAccountId),
      principalSubjectId: loan.principalSubjectId ? String(loan.principalSubjectId) : '',
      interestSubjectId: loan.interestSubjectId ? String(loan.interestSubjectId) : '',
      contactPerson: loan.contactPerson || '', contactPhone: loan.contactPhone || '',
      collateral: loan.collateral || '', guarantor: loan.guarantor || '',
      guarantorPhone: loan.guarantorPhone || '', guarantorIdNo: loan.guarantorIdNo || '',
      remark: loan.remark || '', sortOrder: String(loan.sortOrder),
      status: loan.status || '使用中'
    });
    setShowLoanModal(true);
  }

  async function saveLoan() {
    const missing = [];
    if (!loanForm.loanName) missing.push('貸款名稱');
    if (!loanForm.bankName) missing.push('銀行名稱');
    if (!loanForm.originalAmount) missing.push('貸款金額');
    if (!loanForm.startDate) missing.push('起始日');
    if (!loanForm.endDate) missing.push('到期日');
    if (!loanForm.deductAccountId) missing.push('扣款帳戶');
    if (missing.length > 0) {
      showToast(`請填寫必填欄位：${missing.join('、')}`, 'error');
      return;
    }
    setLoanSaving(true);
    try {
      const url = editingLoan ? `/api/loans/${editingLoan.id}` : '/api/loans';
      const method = editingLoan ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanForm)
      });
      if (!res.ok) {
        const err = await res.json();
        const msg = err?.error?.message || (typeof err?.error === 'string' ? err.error : '儲存失敗');
        showToast(msg, 'error');
        return;
      }
      setShowLoanModal(false);
      fetchAll();
    } catch (e) {
      showToast('儲存失敗: ' + (e.message || '請稍後再試'), 'error');
    } finally {
      setLoanSaving(false);
    }
  }

  async function deleteLoan(loan) {
    if (!confirm(`確定要刪除「${loan.loanName}」嗎？`)) return;
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

  // ============ RECORD CONFIRM (核實) ============

  function openConfirmModal(record) {
    setConfirmingRecord(record);
    setConfirmForm({
      actualPrincipal: String(record.estimatedPrincipal),
      actualInterest: String(record.estimatedInterest),
      actualDebitDate: new Date().toISOString().split('T')[0],
      statementNo: '',
      note: record.note || ''
    });
    setShowConfirmModal(true);
  }

  async function confirmPayment() {
    if (!confirmForm.actualPrincipal || !confirmForm.actualInterest) {
      showToast('請填寫實際本金和利息', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/loans/records/${confirmingRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualPrincipal: parseFloat(confirmForm.actualPrincipal),
          actualInterest: parseFloat(confirmForm.actualInterest),
          actualDebitDate: confirmForm.actualDebitDate,
          statementNo: confirmForm.statementNo,
          note: confirmForm.note
        })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || '核實失敗', 'error');
        return;
      }
      setShowConfirmModal(false);
      fetchMonthlyRecords();
      fetchAll();
    } catch (e) {
      showToast('核實失敗: ' + e.message, 'error');
    }
  }

  async function deleteRecord(record) {
    const label = record.status === '已核實' ? '此操作將同時刪除相關現金交易並回沖餘額，' : '';
    if (!confirm(`${label}確定要刪除此還款記錄嗎？`)) return;
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

  // ============ BATCH CREATE ============

  function openBatchModal() {
    const activeLoans = loans.filter(l => l.status === '使用中');
    setBatchLoanIds(activeLoans.map(l => l.id));
    setShowBatchModal(true);
  }

  function toggleBatchLoan(id) {
    setBatchLoanIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function executeBatch() {
    if (batchLoanIds.length === 0) {
      showToast('請至少選擇一筆貸款', 'error');
      return;
    }
    try {
      const res = await fetch('/api/loans/records/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth, loanIds: batchLoanIds, autoPush: true })
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || '批次建立失敗', 'error');
        return;
      }
      showToast(result.message || `成功建立 ${result.created} 筆，跳過 ${result.skipped} 筆`, 'success');
      setShowBatchModal(false);
      fetchMonthlyRecords();
    } catch (e) {
      showToast('批次建立失敗: ' + e.message, 'error');
    }
  }

  // ============ QUICK TRANSFER (預存款) ============

  function openTransferModal(targetAcct, suggestedAmount) {
    setTransferTargetAccount(targetAcct);
    setTransferForm({
      sourceAccountId: '',
      amount: String(Math.max(0, Math.ceil(suggestedAmount))),
      description: `貸款扣款預存 → ${targetAcct.name}`,
      transactionDate: new Date().toISOString().split('T')[0]
    });
    setShowTransferModal(true);
  }

  async function executeTransfer() {
    if (!transferForm.sourceAccountId || !transferForm.amount || !transferTargetAccount) {
      showToast('請填寫來源帳戶和金額', 'error');
      return;
    }
    if (parseInt(transferForm.sourceAccountId) === transferTargetAccount.id) {
      showToast('來源帳戶與目的帳戶不可相同', 'error');
      return;
    }
    const amount = parseFloat(transferForm.amount);
    if (amount <= 0) {
      showToast('金額必須大於零', 'error');
      return;
    }
    setTransfering(true);
    try {
      const res = await fetch('/api/cashflow/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionDate: transferForm.transactionDate,
          type: '移轉',
          accountId: parseInt(transferForm.sourceAccountId),
          transferAccountId: transferTargetAccount.id,
          amount,
          description: transferForm.description,
          sourceType: transferForm._sourceType || 'loan_predeposit',
          sourceRecordId: transferForm._sourceRecordId || null,
          hasFee: false
        })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err?.error?.message || err?.error || '移轉失敗', 'error');
        return;
      }
      showToast(`已成功移轉 ${formatCurrency(amount)} 至 ${transferTargetAccount.name}`, 'success');
      setShowTransferModal(false);
      // If linked to a record, update status to 已預付
      if (transferForm._recordId) {
        try {
          await fetch(`/api/loans/records/${transferForm._recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: '已預付' })
          });
        } catch (_) { /* ignore */ }
      }
      fetchAll();
      fetchMonthlyRecords();
    } catch (e) {
      showToast('移轉失敗: ' + e.message, 'error');
    } finally {
      setTransfering(false);
    }
  }

  // ============ PUSH TO CASHIER (推送出納) ============

  function getDaysUntilDue(dueDate) {
    if (!dueDate) return null;
    const due = new Date(dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
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
    if (!confirm(`確定推送「${loan.loanName}」(預估 ${formatCurrency(record.estimatedTotal)}) 至出納？`)) return;

    try {
      // 1. Create PaymentOrder so cashier can see it
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
          note: `貸款還款預存 — ${loan.loanCode} ${record.recordYear}/${String(record.recordMonth).padStart(2, '0')} (暫估${formatCurrency(record.estimatedTotal)})`,
          status: '待出納'
        })
      });
      if (!payRes.ok) {
        const err = await payRes.json();
        showToast(err?.error?.message || err?.error || '建立付款單失敗', 'error');
        return;
      }

      const payData = await payRes.json();

      // 2. Update loan record status to 待出納, link paymentOrderId
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
    if (!confirm(`共 ${dueRecords.length} 筆即將到期，確定全部推送出納？\n將為每筆建立付款單。`)) return;
    let pushed = 0;
    let failed = 0;
    for (const rec of dueRecords) {
      const loan = loans.find(l => l.id === rec.loanId);
      if (!loan) { failed++; continue; }
      const acctId = rec.deductAccountId || loan.deductAccountId;
      try {
        // Create PaymentOrder
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

        // Update record status and link paymentOrderId
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
    monthlyRecords.forEach((r) => {
      rm[r.loanId] = r;
    });
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
          const due = new Date(rec.dueDate + 'T00:00:00');
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
  const overdueLoans = activeLoans.filter(l => {
    const end = new Date(l.endDate);
    return end < now;
  }).length;

  // Due date warning calculation
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

  // ============ RENDER ============

  if (loading) {
    return (
      <div className="min-h-screen page-bg-loans">
        <Navigation borderColor="border-indigo-500" />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-20 text-gray-500">載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-loans">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print-loans, .no-print-loans * { visibility: hidden !important; }
          #loans-monthly-report-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #loans-monthly-report-print-root * { visibility: visible !important; }
        }
      `}} />
      <div className="no-print-loans"><Navigation borderColor="border-indigo-500" /><NotificationBanner moduleFilter="loans" /></div>
      <div className="max-w-7xl mx-auto px-4 py-6 no-print-loans">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">貸款利息管理</h2>
            <p className="text-sm text-gray-500 mt-1">管理公司與個人貸款、月還款追蹤與核實</p>
          </div>
          <ExportButtons
            data={filteredLoans.map(l => ({
              ...l,
              balance: l.currentBalance ?? l.loanAmount,
            }))}
            columns={EXPORT_CONFIGS.loans.columns}
            exportName={EXPORT_CONFIGS.loans.filename}
            title="貸款利息管理"
            sheetName="貸款清單"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg shadow p-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'monthly' && renderMonthlyTab()}
        {activeTab === 'records' && renderRecordsTab()}
        {activeTab === 'report' && renderReportTab()}
      </div>

      {/* Modals */}
      {showLoanModal && renderLoanModal()}
      {showConfirmModal && renderConfirmModal()}
      {showBatchModal && renderBatchModal()}
      {showTransferModal && renderTransferModal()}

      {/* 每月貸款支出報表列印 Modal */}
      {showLoansPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print-loans" onClick={() => setShowLoansPrintModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-loans" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">{reportYear}年{reportMonth}月 貸款支出報表</h3>
              <button type="button" onClick={() => setShowLoansPrintModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-500 mb-4">列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">貸款</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">銀行</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">館別</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">原本貸款金額</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">剩餘還本金額</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">目前利率</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">備註</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">狀態</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">暫估本金</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">暫估利息</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">暫估合計</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">實際本金</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">實際利息</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">實際合計</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportData.length === 0 ? (
                      <tr><td colSpan={14} className="text-center py-8 text-gray-400">此月份暫無還款資料</td></tr>
                    ) : reportData.map(rec => (
                      <tr key={rec.id}>
                        <td className="px-3 py-2"><div className="font-medium">{rec.loan?.loanName}</div><div className="text-xs text-gray-400">{rec.loan?.loanCode}</div></td>
                        <td className="px-3 py-2 text-gray-700">{rec.loan?.bankName}</td>
                        <td className="px-3 py-2 text-gray-700">{rec.loan?.warehouse || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.loan?.originalAmount)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.loan?.currentBalance)}</td>
                        <td className="px-3 py-2 text-right">{rec.loan?.annualRate != null ? `${Number(rec.loan.annualRate * 100).toFixed(2)}%` : '-'}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate" title={rec.loan?.remark || ''}>{rec.loan?.remark || '－'}</td>
                        <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>{rec.status}</span></td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.estimatedPrincipal)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.estimatedInterest)}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium">{formatCurrency(rec.estimatedTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-green-700">{rec.actualPrincipal != null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                        <td className="px-3 py-2 text-right font-mono text-green-700">{rec.actualInterest != null ? formatCurrency(rec.actualInterest) : '-'}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-green-700">{rec.actualTotal != null ? formatCurrency(rec.actualTotal) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {reportData.length > 0 && (() => {
                    const totalEstPrincipal = reportData.reduce((s, r) => s + (r.estimatedPrincipal || 0), 0);
                    const totalEstInterest = reportData.reduce((s, r) => s + (r.estimatedInterest || 0), 0);
                    const totalEstTotal = reportData.reduce((s, r) => s + (r.estimatedTotal || 0), 0);
                    const confirmedRecords = reportData.filter(r => r.status === '已核實');
                    const totalActPrincipal = confirmedRecords.reduce((s, r) => s + (r.actualPrincipal || 0), 0);
                    const totalActInterest = confirmedRecords.reduce((s, r) => s + (r.actualInterest || 0), 0);
                    const totalActTotal = confirmedRecords.reduce((s, r) => s + (r.actualTotal || 0), 0);
                    return (
                      <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                        <tr className="font-bold">
                          <td colSpan={8} className="px-3 py-2 text-right text-gray-700">月度合計</td>
                          <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstPrincipal)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstInterest)}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstTotal)}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalActPrincipal)}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalActInterest)}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalActTotal)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setShowLoansPrintModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
                <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">列印</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 列印時只顯示此區塊 */}
      {showLoansPrintModal && (
        <div id="loans-monthly-report-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
          <h1 className="text-xl font-bold text-gray-800 mb-2">{reportYear}年{reportMonth}月 貸款支出報表</h1>
          <p className="text-sm text-gray-500 mb-4">列印日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
          <table className="w-full text-sm border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left px-3 py-2 border border-gray-300 font-medium">貸款</th>
                <th className="text-left px-3 py-2 border border-gray-300 font-medium">銀行</th>
                <th className="text-left px-3 py-2 border border-gray-300 font-medium">館別</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">原本貸款金額</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">剩餘還本金額</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">目前利率</th>
                <th className="text-left px-3 py-2 border border-gray-300 font-medium">備註</th>
                <th className="text-center px-3 py-2 border border-gray-300 font-medium">狀態</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">暫估本金</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">暫估利息</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">暫估合計</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">實際本金</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">實際利息</th>
                <th className="text-right px-3 py-2 border border-gray-300 font-medium">實際合計</th>
              </tr>
            </thead>
            <tbody>
              {reportData.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-8 text-gray-400 border border-gray-300">此月份暫無還款資料</td></tr>
              ) : reportData.map(rec => (
                <tr key={rec.id}>
                  <td className="px-3 py-2 border border-gray-300"><div className="font-medium">{rec.loan?.loanName}</div><div className="text-xs text-gray-400">{rec.loan?.loanCode}</div></td>
                  <td className="px-3 py-2 border border-gray-300">{rec.loan?.bankName}</td>
                  <td className="px-3 py-2 border border-gray-300">{rec.loan?.warehouse || '-'}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.loan?.originalAmount)}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.loan?.currentBalance)}</td>
                  <td className="px-3 py-2 text-right border border-gray-300">{rec.loan?.annualRate != null ? `${Number(rec.loan.annualRate * 100).toFixed(2)}%` : '-'}</td>
                  <td className="px-3 py-2 border border-gray-300 text-gray-600">{rec.loan?.remark || '－'}</td>
                  <td className="px-3 py-2 text-center border border-gray-300">{rec.status}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.estimatedPrincipal)}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.estimatedInterest)}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.estimatedTotal)}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{rec.actualPrincipal != null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{rec.actualInterest != null ? formatCurrency(rec.actualInterest) : '-'}</td>
                  <td className="px-3 py-2 text-right border border-gray-300 font-mono">{rec.actualTotal != null ? formatCurrency(rec.actualTotal) : '-'}</td>
                </tr>
              ))}
            </tbody>
            {reportData.length > 0 && (() => {
              const totalEstPrincipal = reportData.reduce((s, r) => s + (r.estimatedPrincipal || 0), 0);
              const totalEstInterest = reportData.reduce((s, r) => s + (r.estimatedInterest || 0), 0);
              const totalEstTotal = reportData.reduce((s, r) => s + (r.estimatedTotal || 0), 0);
              const confirmedRecords = reportData.filter(r => r.status === '已核實');
              const totalActPrincipal = confirmedRecords.reduce((s, r) => s + (r.actualPrincipal || 0), 0);
              const totalActInterest = confirmedRecords.reduce((s, r) => s + (r.actualInterest || 0), 0);
              const totalActTotal = confirmedRecords.reduce((s, r) => s + (r.actualTotal || 0), 0);
              return (
                <tfoot>
                  <tr className="font-bold bg-indigo-50">
                    <td colSpan={8} className="px-3 py-2 text-right border border-gray-300 text-gray-700">月度合計</td>
                    <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalEstPrincipal)}</td>
                    <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalEstInterest)}</td>
                    <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalEstTotal)}</td>
                    <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalActPrincipal)}</td>
                    <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalActInterest)}</td>
                    <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalActTotal)}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}
    </div>
  );

  // ============ TAB: OVERVIEW ============

  function renderOverviewTab() {
    return (
      <div>
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-indigo-500">
            <p className="text-sm text-gray-500">貸款總數</p>
            <p className="text-2xl font-bold text-indigo-700">{activeLoans.length}</p>
            <p className="text-xs text-gray-400 mt-1">使用中</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">貸款餘額合計</p>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalBalance)}</p>
            <p className="text-xs text-gray-400 mt-1">所有使用中貸款</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">本月待核實</p>
            <p className="text-2xl font-bold text-yellow-700">{thisMonthDue}</p>
            <p className="text-xs text-gray-400 mt-1">{monthlyYear}/{monthlyMonth}月暫估</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-red-500">
            <p className="text-sm text-gray-500">已到期貸款</p>
            <p className="text-2xl font-bold text-red-700">{overdueLoans}</p>
            <p className="text-xs text-gray-400 mt-1">需關注</p>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
          <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">全部館別</option>
            {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">全部狀態</option>
            <option value="使用中">使用中</option>
            <option value="已結清">已結清</option>
            <option value="已停用">已停用</option>
          </select>
          <select value={filterOwnerType} onChange={e => setFilterOwnerType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">全部類型</option>
            {OWNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex-1" />
          {isLoggedIn && (
            <button onClick={openAddLoan} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
              + 新增貸款
            </button>
          )}
        </div>

        {/* Loans Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <SortableTh label="貸款編號" colKey="loanCode" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                  <SortableTh label="貸款名稱" colKey="loanName" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                  <SortableTh label="銀行" colKey="bankName" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                  <SortableTh label="館別" colKey="warehouse" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" />
                  <SortableTh label="原始金額" colKey="originalAmount" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="right" />
                  <SortableTh label="目前餘額" colKey="currentBalance" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="right" />
                  <SortableTh label="年利率" colKey="annualRate" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                  <SortableTh label="到期日" colKey="endDate" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                  <SortableTh label="扣款帳戶" colKey="deductAccount" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                  <SortableTh label="狀態" colKey="status" sortKey={loanOvKey} sortDir={loanOvDir} onSort={toggleLoanOv} className="px-4 py-3" align="center" />
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLoans.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-400">暫無貸款資料</td>
                  </tr>
                ) : sortedFilteredLoans.map(loan => {
                  const warning = getDueDateWarning(loan.endDate);
                  return (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600">{loan.loanCode}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{loan.loanName}</div>
                        <div className="text-xs text-gray-400">{loan.ownerType}{loan.ownerName ? ` - ${loan.ownerName}` : ''}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{loan.bankName}</td>
                      <td className="px-4 py-3 text-gray-700">{loan.warehouse || '-'}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(loan.originalAmount)}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(loan.currentBalance)}</td>
                      <td className="px-4 py-3 text-center">{loan.annualRate}%</td>
                      <td className="px-4 py-3 text-center">
                        <div>{formatDate(loan.endDate)}</div>
                        {warning && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs ${warning.class}`}>
                            {warning.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">{loan.deductAccount?.name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${LOAN_STATUS_BADGES[loan.status] || 'bg-gray-100'}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLoggedIn && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => openEditLoan(loan)} className="text-indigo-600 hover:text-indigo-800 text-xs px-2 py-1 rounded hover:bg-indigo-50">
                              編輯
                            </button>
                            <button onClick={() => deleteLoan(loan)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                              刪除
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============ TAB: MONTHLY ============

  function renderMonthlyTab() {
    const activeLoansForMonth = loans.filter(l => l.status === '使用中');
    const recordMap = {};
    monthlyRecords.forEach(r => { recordMap[r.loanId] = r; });

    // ---- Account Summary: group by deductAccountId ----
    const acctMap = {};
    for (const loan of activeLoansForMonth) {
      const acctId = loan.deductAccountId;
      if (!acctMap[acctId]) {
        const acct = accounts.find(a => a.id === acctId);
        acctMap[acctId] = {
          account: acct || { id: acctId, name: loan.deductAccount?.name || `帳戶#${acctId}`, currentBalance: 0 },
          loanCount: 0,
          estimatedTotal: 0,
          confirmedTotal: 0,
          pendingTotal: 0,
        };
      }
      acctMap[acctId].loanCount++;
      const rec = recordMap[loan.id];
      if (rec) {
        acctMap[acctId].estimatedTotal += rec.estimatedTotal || 0;
        if (rec.status === '已核實') {
          acctMap[acctId].confirmedTotal += rec.actualTotal || 0;
        } else {
          acctMap[acctId].pendingTotal += rec.estimatedTotal || 0;
        }
      }
    }
    const acctSummaries = Object.values(acctMap).sort((a, b) => b.pendingTotal - a.pendingTotal);

    return (
      <div>
        {/* Workflow Guide */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-indigo-800 mb-2">貸款還款流程（3步驟）：</p>
          <ol className="text-xs text-indigo-700 space-y-1 list-decimal list-inside">
            <li><b>批次建立並推送出納</b> — 系統自動計算暫估金額，直接建立付款單送出納</li>
            <li><b>出納付款</b> — 出納在「出納管理」執行付款 → 狀態自動變為「已預付」，金額同步回來</li>
            <li><b>核實回填</b> — 收到銀行利息單後，點「核實」填入實際金額 → 帳戶餘額與貸款餘額同步更新</li>
          </ol>
          <div className="mt-2 flex items-center gap-2 text-xs text-indigo-600">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-400"></span>暫估
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400 ml-2"></span>待出納
            <span className="inline-block w-2 h-2 rounded-full bg-blue-400 ml-2"></span>已預付
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 ml-2"></span>已核實
          </div>
        </div>

        {/* Month Selector & Actions */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
          <label className="text-sm font-medium text-gray-600">年月:</label>
          <select value={monthlyYear} onChange={e => setMonthlyYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={monthlyMonth} onChange={e => setMonthlyMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <div className="flex-1" />
          {isLoggedIn && (() => {
            const dueCount = monthlyRecords.filter(r => r.status === '暫估' && getDaysUntilDue(r.dueDate) !== null && getDaysUntilDue(r.dueDate) <= 7).length;
            return (
              <div className="flex gap-2">
                {dueCount > 0 && (
                  <button onClick={batchPushToCashier} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-700 transition-colors animate-pulse">
                    批次推送出納 ({dueCount}筆即將到期)
                  </button>
                )}
                <button onClick={openBatchModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
                  批次建立並推送出納
                </button>
              </div>
            );
          })()}
        </div>

        {/* ====== ACCOUNT FUND SUMMARY ====== */}
        {acctSummaries.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">帳戶資金彙總 — {monthlyYear}年{monthlyMonth}月</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {acctSummaries.map(s => {
                const balance = Number(s.account.currentBalance || 0);
                const shortage = s.pendingTotal - balance;
                const isInsufficient = s.pendingTotal > 0 && shortage > 0;
                const isOk = s.pendingTotal > 0 && shortage <= 0;
                return (
                  <div key={s.account.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${isInsufficient ? 'border-red-500' : isOk ? 'border-green-500' : 'border-gray-300'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{s.account.name}</p>
                        <p className="text-xs text-gray-400">{s.loanCount} 筆貸款</p>
                      </div>
                      {isInsufficient && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300 animate-pulse">
                          餘額不足
                        </span>
                      )}
                      {isOk && s.pendingTotal > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">
                          餘額充足
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">帳戶餘額</span>
                        <span className="font-mono font-bold text-gray-800">{formatCurrency(balance)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">本月待扣 (未核實)</span>
                        <span className="font-mono font-medium text-yellow-700">{formatCurrency(s.pendingTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">已核實扣款</span>
                        <span className="font-mono text-green-700">{formatCurrency(s.confirmedTotal)}</span>
                      </div>
                      <div className="border-t pt-1 flex justify-between">
                        <span className="text-gray-500 font-medium">差額 (餘額 - 待扣)</span>
                        <span className={`font-mono font-bold ${shortage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {shortage > 0 ? `-${formatCurrency(shortage)}` : `+${formatCurrency(Math.abs(shortage))}`}
                        </span>
                      </div>
                    </div>
                    {isLoggedIn && isInsufficient && (
                      <button
                        onClick={() => openTransferModal(s.account, shortage)}
                        className="mt-3 w-full bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                      >
                        快速預存 {formatCurrency(Math.ceil(shortage))}
                      </button>
                    )}
                    {isLoggedIn && !isInsufficient && s.pendingTotal > 0 && (
                      <button
                        onClick={() => openTransferModal(s.account, 0)}
                        className="mt-3 w-full border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                      >
                        追加預存
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {acctSummaries.some(s => s.pendingTotal > 0 && (s.pendingTotal - Number(s.account.currentBalance || 0)) > 0) && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <span className="text-red-500 text-lg leading-none">!</span>
                <div className="text-xs text-red-700">
                  <b>注意：</b>有帳戶餘額不足以支付本月預估貸款扣款。請盡速從其他帳戶移轉資金，避免銀行扣款失敗。
                  點擊上方「快速預存」按鈕可直接移轉。
                </div>
              </div>
            )}
          </div>
        )}

        {/* Monthly Matrix */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <SortableTh label="貸款名稱" colKey="loanName" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" />
                  <SortableTh label="扣款帳戶" colKey="deductAccount" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" />
                  <SortableTh label="繳款倒數" colKey="daysLeft" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="center" />
                  <SortableTh label="狀態" colKey="monthStatus" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="center" />
                  <SortableTh label="暫估合計" colKey="estimatedTotal" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="right" />
                  <SortableTh label="實際合計" colKey="actualTotal" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="right" />
                  <SortableTh label="差異" colKey="diffCol" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="right" />
                  <SortableTh label="現金流狀態" colKey="cashFlowCol" sortKey={loanMonKey} sortDir={loanMonDir} onSort={toggleLoanMon} className="px-3 py-3" align="center" />
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeLoansForMonth.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                      暫無使用中的貸款，請先在「貸款總覽」新增貸款
                    </td>
                  </tr>
                ) : sortedMonthlyMatrixRows.map(({ loan, rec }) => {
                  const diff = rec && (rec.status === '已核實' || rec.status === '已預付') && rec.actualTotal != null
                    ? rec.estimatedTotal - rec.actualTotal : null;
                  const daysLeft = rec ? getDaysUntilDue(rec.dueDate) : null;
                  const dueColor = daysLeft === null ? '' : daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft <= 3 ? 'text-red-600 font-bold animate-pulse' : daysLeft <= 7 ? 'text-orange-600 font-bold' : 'text-gray-600';
                  const dueLabel = daysLeft === null ? '-' : daysLeft < 0 ? `已逾期${Math.abs(daysLeft)}天` : daysLeft === 0 ? '今日到期' : `${daysLeft}天`;

                  return (
                    <tr key={loan.id} className={`hover:bg-gray-50 ${daysLeft !== null && daysLeft <= 3 && rec?.status === '暫估' ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-3">
                        <div className="font-medium text-sm">{loan.loanName}</div>
                        <div className="text-xs text-gray-400">{loan.loanCode} | {loan.bankName}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">{loan.deductAccount?.name || '-'}</td>
                      <td className="px-3 py-3 text-center">
                        {rec ? (
                          <div>
                            <div className={`text-sm ${dueColor}`}>{dueLabel}</div>
                            <div className="text-xs text-gray-400">{formatDate(rec.dueDate)}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">每月{loan.repaymentDay}日</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {rec ? (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                            {rec.status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">未建立</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm">
                        {rec ? (
                          <div>
                            <div>{formatCurrency(rec.estimatedTotal)}</div>
                            <div className="text-xs text-gray-400">本{formatCurrency(rec.estimatedPrincipal)} 息{formatCurrency(rec.estimatedInterest)}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm text-green-700">
                        {rec?.actualTotal != null ? (
                          <div>
                            <div>{formatCurrency(rec.actualTotal)}</div>
                            <div className="text-xs text-gray-500">本{formatCurrency(rec.actualPrincipal)} 息{formatCurrency(rec.actualInterest)}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {diff != null ? (
                          <span className={diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}>
                            {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {rec ? (
                          <div className="space-y-1">
                            {rec.preDeposit && (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                                <span>預付</span>
                                <span className="font-mono">{formatCurrency(rec.preDeposit.amount)}</span>
                              </div>
                            )}
                            {rec.cashierTxns && rec.cashierTxns.length > 0 && (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span>已付款</span>
                                <span className="font-mono">{formatCurrency(rec.cashierTxns.reduce((s, t) => s + t.amount, 0))}</span>
                              </div>
                            )}
                            {(rec.status === '已預付' || rec.status === '已核實') && rec.actualTotal != null && rec.actualTotal > rec.estimatedTotal && (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <span>已預付</span>
                                <span className="font-mono">{formatCurrency(Math.round((rec.actualTotal - rec.estimatedTotal) * 100) / 100)}</span>
                              </div>
                            )}
                            {rec.paymentTxns && rec.paymentTxns.length > 0 && (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                                <span>扣款</span>
                                <span className="font-mono">{formatCurrency(rec.paymentTxns.reduce((s, t) => s + t.amount, 0))}</span>
                              </div>
                            )}
                            {!rec.preDeposit && (!rec.cashierTxns || rec.cashierTxns.length === 0) && (!rec.paymentTxns || rec.paymentTxns.length === 0) && rec.actualTotal == null && (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {isLoggedIn && (
                          <div className="flex flex-col gap-1 items-center">
                            {rec && rec.status === '暫估' && (
                              <>
                                <button onClick={() => pushToCashier(rec)} className="bg-orange-500 text-white px-2 py-1 rounded text-xs hover:bg-orange-600 w-full">
                                  推送出納
                                </button>
                                <div className="flex gap-1">
                                  <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                                    核實
                                  </button>
                                  <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-1 py-1 rounded hover:bg-red-50">
                                    刪除
                                  </button>
                                </div>
                              </>
                            )}
                            {rec && rec.status === '待出納' && (
                              <div className="text-xs text-orange-600 font-medium">
                                等待出納付款中...
                              </div>
                            )}
                            {rec && rec.status === '已預付' && (
                              <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 w-full">
                                核實（利息單已到）
                              </button>
                            )}
                            {rec && rec.status === '已核實' && (
                              <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                                沖銷
                              </button>
                            )}
                            {!rec && (
                              <span className="text-gray-400 text-xs">請先批次建立並推送</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {monthlyRecords.length > 0 && (() => {
                const totalEstT = monthlyRecords.reduce((s, r) => s + r.estimatedTotal, 0);
                const confirmedRecs = monthlyRecords.filter(r => r.actualTotal != null);
                const totalActT = confirmedRecs.reduce((s, r) => s + (r.actualTotal || 0), 0);
                const totalPreDeposit = monthlyRecords.reduce((s, r) => s + (r.preDeposit ? r.preDeposit.amount : 0), 0);
                const totalExtraPrepaid = confirmedRecs.reduce((s, r) => {
                  const extra = r.actualTotal != null && r.actualTotal > r.estimatedTotal ? Math.round((r.actualTotal - r.estimatedTotal) * 100) / 100 : 0;
                  return s + extra;
                }, 0);
                const statusCounts = {};
                monthlyRecords.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
                return (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr className="font-medium">
                      <td colSpan={2} className="px-3 py-3 text-right text-gray-600">
                        <div className="flex gap-2 justify-end text-xs">
                          {Object.entries(statusCounts).map(([st, cnt]) => (
                            <span key={st} className={`px-2 py-0.5 rounded border ${STATUS_BADGES[st] || 'bg-gray-100'}`}>{st}: {cnt}</span>
                          ))}
                        </div>
                      </td>
                      <td colSpan={2} className="px-3 py-3 text-right text-gray-600 text-sm">合計 ({monthlyRecords.length}筆):</td>
                      <td className="px-3 py-3 text-right font-mono">{formatCurrency(totalEstT)}</td>
                      <td className="px-3 py-3 text-right font-mono text-green-700">{formatCurrency(totalActT)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs">
                        {confirmedRecs.length > 0 ? (
                          <span className={totalEstT - totalActT > 0 ? 'text-orange-600' : 'text-red-600'}>
                            {totalEstT - totalActT > 0 ? '+' : ''}{formatCurrency(totalEstT - totalActT)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs">
                        <div className="space-y-1">
                          {totalPreDeposit > 0 && (
                            <div className="text-blue-600 font-mono">預付: {formatCurrency(totalPreDeposit)}</div>
                          )}
                          {totalExtraPrepaid > 0 && (
                            <div className="text-indigo-600 font-mono">已預付: {formatCurrency(totalExtraPrepaid)}</div>
                          )}
                        </div>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============ TAB: RECORDS ============

  function renderRecordsTab() {
    return (
      <div>
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
          <select value={recFilterLoan} onChange={e => setRecFilterLoan(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">全部貸款</option>
            {loans.map(l => <option key={l.id} value={l.id}>{l.loanName}</option>)}
          </select>
          <select value={recFilterYear} onChange={e => setRecFilterYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select value={recFilterMonth} onChange={e => setRecFilterMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">全部月份</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <select value={recFilterStatus} onChange={e => setRecFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">全部狀態</option>
            <option value="暫估">暫估</option>
            <option value="已核實">已核實</option>
            <option value="跳過">跳過</option>
          </select>
        </div>

        {/* Records Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <SortableTh label="年/月" colKey="ym" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" />
                  <SortableTh label="貸款編號" colKey="loanCode" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" />
                  <SortableTh label="貸款名稱" colKey="loanName" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" />
                  <SortableTh label="還款日" colKey="dueDate" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="center" />
                  <SortableTh label="狀態" colKey="status" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="center" />
                  <SortableTh label="暫估合計" colKey="estimatedTotal" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                  <SortableTh label="實際本金" colKey="actualPrincipal" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                  <SortableTh label="實際利息" colKey="actualInterest" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                  <SortableTh label="實際合計" colKey="actualTotal" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                  <SortableTh label="核實日期" colKey="confirmedAt" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="center" />
                  <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-400">暫無還款記錄</td>
                  </tr>
                ) : sortedLoanRecords.map(rec => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{rec.recordYear}/{String(rec.recordMonth).padStart(2, '0')}</td>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600">{rec.loan?.loanCode}</td>
                    <td className="px-4 py-3">{rec.loan?.loanName}</td>
                    <td className="px-4 py-3 text-center">{formatDate(rec.dueDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(rec.estimatedTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualPrincipal !== null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualInterest !== null ? formatCurrency(rec.actualInterest) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-green-700">{rec.actualTotal !== null ? formatCurrency(rec.actualTotal) : '-'}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500">{rec.confirmedAt ? rec.confirmedAt.split('T')[0] : '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {isLoggedIn && (
                        <div className="flex gap-1 justify-center">
                          {rec.status === '暫估' && (
                            <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                              核實
                            </button>
                          )}
                          <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                            刪除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============ TAB: REPORT ============

  function renderReportTab() {
    // Group report data by loan
    const byLoan = {};
    reportData.forEach(r => {
      if (!byLoan[r.loanId]) {
        byLoan[r.loanId] = {
          loan: r.loan,
          records: []
        };
      }
      byLoan[r.loanId].records.push(r);
    });

    const totalEstPrincipal = reportData.reduce((s, r) => s + r.estimatedPrincipal, 0);
    const totalEstInterest = reportData.reduce((s, r) => s + r.estimatedInterest, 0);
    const totalEstTotal = reportData.reduce((s, r) => s + r.estimatedTotal, 0);
    const confirmedRecords = reportData.filter(r => r.status === '已核實');
    const totalActPrincipal = confirmedRecords.reduce((s, r) => s + (r.actualPrincipal || 0), 0);
    const totalActInterest = confirmedRecords.reduce((s, r) => s + (r.actualInterest || 0), 0);
    const totalActTotal = confirmedRecords.reduce((s, r) => s + (r.actualTotal || 0), 0);

    return (
      <div>
        {/* Month Selector + Print */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
          <label className="text-sm font-medium text-gray-600">報表月份:</label>
          <select value={reportYear} onChange={e => setReportYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowLoansPrintModal(true)}
            className="ml-auto px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
          >
            列印每月貸款支出報表
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-500 mb-1">暫估合計</p>
            <p className="text-xl font-bold text-yellow-700">{formatCurrency(totalEstTotal)}</p>
            <div className="text-xs text-gray-400 mt-1">本金 {formatCurrency(totalEstPrincipal)} / 利息 {formatCurrency(totalEstInterest)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-500 mb-1">實際合計</p>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalActTotal)}</p>
            <div className="text-xs text-gray-400 mt-1">本金 {formatCurrency(totalActPrincipal)} / 利息 {formatCurrency(totalActInterest)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-500 mb-1">差異 (暫估 - 實際)</p>
            <p className={`text-xl font-bold ${totalEstTotal - totalActTotal > 0 ? 'text-orange-600' : 'text-blue-600'}`}>
              {formatCurrency(totalEstTotal - totalActTotal)}
            </p>
            <div className="text-xs text-gray-400 mt-1">
              已核實 {confirmedRecords.length} / {reportData.length} 筆
            </div>
          </div>
        </div>

        {/* Report Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-medium text-gray-700">{reportYear}年{reportMonth}月 貸款還款明細</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">銀行</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">館別</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估本金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估利息</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估合計</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際本金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際利息</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-gray-400">此月份暫無還款資料</td>
                  </tr>
                ) : reportData.map(rec => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{rec.loan?.loanName}</div>
                      <div className="text-xs text-gray-400">{rec.loan?.loanCode}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{rec.loan?.bankName}</td>
                    <td className="px-4 py-3 text-gray-700">{rec.loan?.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(rec.estimatedPrincipal)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(rec.estimatedInterest)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(rec.estimatedTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualPrincipal !== null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualInterest !== null ? formatCurrency(rec.actualInterest) : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-green-700">{rec.actualTotal !== null ? formatCurrency(rec.actualTotal) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              {reportData.length > 0 && (
                <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                  <tr className="font-bold">
                    <td colSpan={4} className="px-4 py-3 text-right text-gray-700">月度合計:</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstPrincipal)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstInterest)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActPrincipal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActInterest)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============ MODAL: ADD/EDIT LOAN ============

  function renderLoanModal() {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                {editingLoan ? '編輯貸款' : '新增貸款'}
              </h3>
              <button onClick={() => setShowLoanModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {/* Row 1: Name & Owner */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">貸款名稱 *</label>
                <input
                  type="text" value={loanForm.loanName}
                  onChange={e => setLoanForm({ ...loanForm, loanName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：台銀房貸-麗格"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">持有人類型 *</label>
                <select value={loanForm.ownerType} onChange={e => setLoanForm({ ...loanForm, ownerType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {OWNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Owner Name & Warehouse */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">持有人姓名</label>
                <input
                  type="text" value={loanForm.ownerName}
                  onChange={e => setLoanForm({ ...loanForm, ownerName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                <select value={loanForm.warehouse} onChange={e => setLoanForm({ ...loanForm, warehouse: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">請選擇</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            {/* Row 3: Bank */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">銀行名稱 *</label>
                <input
                  type="text" value={loanForm.bankName}
                  onChange={e => setLoanForm({ ...loanForm, bankName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：台灣銀行"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分行</label>
                <input
                  type="text" value={loanForm.bankBranch}
                  onChange={e => setLoanForm({ ...loanForm, bankBranch: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填"
                />
              </div>
            </div>

            {/* Row 4: Loan Type & Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">貸款類型</label>
                <select value={loanForm.loanType} onChange={e => setLoanForm({ ...loanForm, loanType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {LOAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">貸款金額 *</label>
                <input
                  type="number" value={loanForm.originalAmount}
                  onChange={e => setLoanForm({ ...loanForm, originalAmount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="原始貸款金額"
                />
              </div>
            </div>

            {/* Row 5: Rate */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">年利率 (%)</label>
                <input
                  type="number" step="0.01" value={loanForm.annualRate}
                  onChange={e => setLoanForm({ ...loanForm, annualRate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0 表示無利息"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">利率類型</label>
                <select value={loanForm.rateType} onChange={e => setLoanForm({ ...loanForm, rateType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {RATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">還款日 *</label>
                <input
                  type="number" min="1" max="28" value={loanForm.repaymentDay}
                  onChange={e => setLoanForm({ ...loanForm, repaymentDay: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1-28"
                />
              </div>
            </div>

            {/* Row 6: Repayment Type & Dates */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">還款方式 *</label>
                <select value={loanForm.repaymentType} onChange={e => setLoanForm({ ...loanForm, repaymentType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">起始日 *</label>
                <input
                  type="date" value={loanForm.startDate}
                  onChange={e => setLoanForm({ ...loanForm, startDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">到期日 *</label>
                <input
                  type="date" value={loanForm.endDate}
                  onChange={e => setLoanForm({ ...loanForm, endDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Row 7: Deduct Account & Sort */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">扣款帳戶 *</label>
                <select value={loanForm.deductAccountId} onChange={e => setLoanForm({ ...loanForm, deductAccountId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">請選擇</option>
                  {accounts.filter(a => a.isActive).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
                <input
                  type="number" value={loanForm.sortOrder}
                  onChange={e => setLoanForm({ ...loanForm, sortOrder: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0"
                />
              </div>
            </div>

            {/* Row 7.2: 會計科目（本金 / 利息） */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">本金會計科目</label>
                <select
                  value={loanForm.principalSubjectId}
                  onChange={e => setLoanForm({ ...loanForm, principalSubjectId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">請選擇（選填）</option>
                  {accountingSubjects.map(s => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">利息會計科目</label>
                <select
                  value={loanForm.interestSubjectId}
                  onChange={e => setLoanForm({ ...loanForm, interestSubjectId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">請選擇（選填）</option>
                  {accountingSubjects.map(s => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 7.5: Status (edit mode) */}
            {editingLoan && (
              <div className="border-t pt-4 mt-2">
                <h4 className="text-sm font-bold text-gray-700 mb-3">貸款狀態管理</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">貸款狀態</label>
                    <select value={loanForm.status} onChange={e => setLoanForm({ ...loanForm, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                      {LOAN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    {loanForm.status === '已結清' && (
                      <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">
                        設為「已結清」後，此貸款將不會出現在本月還款的批次建立中。
                      </p>
                    )}
                    {loanForm.status === '已停用' && (
                      <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                        設為「已停用」後，此貸款將不會出現在本月還款中。
                      </p>
                    )}
                  </div>
                </div>
                {loanForm.status === '已結清' && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800">
                      <b>借新還舊：</b>若此貸款已由新貸款取代，請先將此貸款設為「已結清」，
                      再新增一筆新貸款。新貸款的「貸款金額」填入新借入金額，備註欄可註明「借新還舊，原貸款：{editingLoan.loanCode}」。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Row 8: Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
                <input
                  type="text" value={loanForm.contactPerson}
                  onChange={e => setLoanForm({ ...loanForm, contactPerson: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                <input
                  type="text" value={loanForm.contactPhone}
                  onChange={e => setLoanForm({ ...loanForm, contactPhone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Row 9: Collateral & Guarantor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">擔保物</label>
              <input
                type="text" value={loanForm.collateral}
                onChange={e => setLoanForm({ ...loanForm, collateral: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="例：土地、建物、設備等"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">保證人/要保人</label>
                <input
                  type="text" value={loanForm.guarantor}
                  onChange={e => setLoanForm({ ...loanForm, guarantor: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">保證人電話</label>
                <input
                  type="text" value={loanForm.guarantorPhone}
                  onChange={e => setLoanForm({ ...loanForm, guarantorPhone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">保證人身分證</label>
                <input
                  type="text" value={loanForm.guarantorIdNo}
                  onChange={e => setLoanForm({ ...loanForm, guarantorIdNo: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Remark */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea
                value={loanForm.remark}
                onChange={e => setLoanForm({ ...loanForm, remark: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" rows={3}
              />
            </div>
          </div>
          <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-end gap-3">
            <button onClick={() => setShowLoanModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm" disabled={loanSaving}>
              取消
            </button>
            <button onClick={saveLoan} disabled={loanSaving} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loanSaving ? '儲存中…' : (editingLoan ? '更新' : '新增')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ MODAL: CONFIRM PAYMENT ============

  function renderConfirmModal() {
    const actualTotal = (parseFloat(confirmForm.actualPrincipal) || 0) + (parseFloat(confirmForm.actualInterest) || 0);
    const estTotal = confirmingRecord ? confirmingRecord.estimatedTotal : 0;
    const diff = estTotal - actualTotal;

    // Find the deduction account and check balance
    const deductAcctId = confirmingRecord?.deductAccountId || confirmingRecord?.loan?.deductAccountId;
    const deductAcct = accounts.find(a => a.id === deductAcctId);
    const acctBalance = deductAcct ? Number(deductAcct.currentBalance || 0) : 0;
    const balanceAfter = acctBalance - actualTotal;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">核實還款</h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            {confirmingRecord && (
              <p className="text-sm text-gray-500 mt-1">
                {confirmingRecord.loan?.loanName} - {confirmingRecord.recordYear}/{String(confirmingRecord.recordMonth).padStart(2, '0')}
              </p>
            )}
          </div>
          <div className="p-6 space-y-4">
            {/* Show estimated for reference */}
            {confirmingRecord && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-500 font-medium">暫估參考:</p>
                <div className="flex gap-4 mt-1">
                  <span>本金: <b>{formatCurrency(confirmingRecord.estimatedPrincipal)}</b></span>
                  <span>利息: <b>{formatCurrency(confirmingRecord.estimatedInterest)}</b></span>
                  <span>合計: <b>{formatCurrency(confirmingRecord.estimatedTotal)}</b></span>
                </div>
              </div>
            )}

            {/* Account balance info */}
            {deductAcct && (
              <div className={`rounded-lg p-3 text-sm ${balanceAfter < 0 ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
                <div className="flex items-center justify-between">
                  <span className={balanceAfter < 0 ? 'text-red-700 font-medium' : 'text-blue-700 font-medium'}>
                    扣款帳戶: {deductAcct.name}
                  </span>
                  {balanceAfter < 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300">
                      餘額不足
                    </span>
                  )}
                </div>
                <div className="flex gap-4 mt-1 text-xs">
                  <span>目前餘額: <b className="font-mono">{formatCurrency(acctBalance)}</b></span>
                  <span>核實後餘額: <b className={`font-mono ${balanceAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(balanceAfter)}</b></span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">實際本金 *</label>
                <input
                  type="number" value={confirmForm.actualPrincipal}
                  onChange={e => setConfirmForm({ ...confirmForm, actualPrincipal: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">實際利息 *</label>
                <input
                  type="number" value={confirmForm.actualInterest}
                  onChange={e => setConfirmForm({ ...confirmForm, actualInterest: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Actual total + difference display */}
            <div className="rounded-lg p-3 bg-indigo-50 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600">實際合計: </span>
                <span className="text-lg font-bold text-indigo-700">{formatCurrency(actualTotal)}</span>
              </div>
              {actualTotal > 0 && (
                <div className="text-right">
                  <span className="text-xs text-gray-500">暫估差異: </span>
                  <span className={`text-sm font-bold ${diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                  </span>
                  {diff !== 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {diff > 0 ? '實際 < 暫估，帳戶留有餘額' : '實際 > 暫估，超出預期'}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">實際扣款日</label>
                <input
                  type="date" value={confirmForm.actualDebitDate}
                  onChange={e => setConfirmForm({ ...confirmForm, actualDebitDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">對帳單號</label>
                <input
                  type="text" value={confirmForm.statementNo}
                  onChange={e => setConfirmForm({ ...confirmForm, statementNo: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea
                value={confirmForm.note}
                onChange={e => setConfirmForm({ ...confirmForm, note: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
              />
            </div>
          </div>
          <div className="bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-end gap-3">
            <button onClick={() => setShowConfirmModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
              取消
            </button>
            <button onClick={confirmPayment} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors">
              確認核實
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ MODAL: BATCH CREATE ============

  function renderBatchModal() {
    const activeLoansForBatch = loans.filter(l => l.status === '使用中');
    const allSelected = activeLoansForBatch.length > 0 && activeLoansForBatch.every(l => batchLoanIds.includes(l.id));

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">批次建立並推送出納</h3>
              <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              為 {monthlyYear}年{monthlyMonth}月 批次建立暫估記錄並自動推送至出納
            </p>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) {
                      setBatchLoanIds([]);
                    } else {
                      setBatchLoanIds(activeLoansForBatch.map(l => l.id));
                    }
                  }}
                  className="rounded"
                />
                <span className="font-medium">全選 ({activeLoansForBatch.length} 筆)</span>
              </label>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {activeLoansForBatch.map(loan => (
                <label key={loan.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchLoanIds.includes(loan.id)}
                    onChange={() => toggleBatchLoan(loan.id)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{loan.loanName}</div>
                    <div className="text-xs text-gray-400">{loan.loanCode} | {loan.bankName} | 餘額: {formatCurrency(loan.currentBalance)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-between items-center">
            <span className="text-sm text-gray-500">已選 {batchLoanIds.length} 筆</span>
            <div className="flex gap-3">
              <button onClick={() => setShowBatchModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
                取消
              </button>
              <button onClick={executeBatch} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
                建立並推送出納
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ MODAL: QUICK TRANSFER (預存款) ============

  function renderTransferModal() {
    const sourceAcct = accounts.find(a => a.id === parseInt(transferForm.sourceAccountId));
    const sourceBalance = sourceAcct ? Number(sourceAcct.currentBalance || 0) : 0;
    const transferAmt = parseFloat(transferForm.amount) || 0;
    const sourceAfter = sourceBalance - transferAmt;
    const targetBalance = transferTargetAccount ? Number(transferTargetAccount.currentBalance || 0) : 0;
    const targetAfter = targetBalance + transferAmt;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">快速預存款</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            {transferTargetAccount && (
              <p className="text-sm text-gray-500 mt-1">
                移轉資金至：<b>{transferTargetAccount.name}</b>（目前餘額: {formatCurrency(targetBalance)}）
              </p>
            )}
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">來源帳戶 *</label>
              <select
                value={transferForm.sourceAccountId}
                onChange={e => setTransferForm({ ...transferForm, sourceAccountId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">請選擇來源帳戶</option>
                {accounts.filter(a => a.isActive && a.id !== transferTargetAccount?.id).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type}) — 餘額: {formatCurrency(Number(a.currentBalance || 0))}
                  </option>
                ))}
              </select>
            </div>

            {sourceAcct && (
              <div className={`rounded-lg p-3 text-xs ${sourceAfter < 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                <div className="flex justify-between">
                  <span className="text-gray-500">來源帳戶餘額</span>
                  <span className="font-mono font-bold">{formatCurrency(sourceBalance)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">移轉後餘額</span>
                  <span className={`font-mono font-bold ${sourceAfter < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(sourceAfter)}
                  </span>
                </div>
                {sourceAfter < 0 && (
                  <p className="text-red-600 font-medium mt-1">來源帳戶餘額不足</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">移轉金額 *</label>
                <input
                  type="number" value={transferForm.amount}
                  onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">交易日期</label>
                <input
                  type="date" value={transferForm.transactionDate}
                  onChange={e => setTransferForm({ ...transferForm, transactionDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {transferAmt > 0 && transferTargetAccount && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">目的帳戶移轉後餘額</span>
                  <span className="font-mono font-bold text-green-700">{formatCurrency(targetAfter)}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
              <input
                type="text" value={transferForm.description}
                onChange={e => setTransferForm({ ...transferForm, description: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="bg-gray-50 border-t px-6 py-4 rounded-b-2xl flex justify-end gap-3">
            <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
              取消
            </button>
            <button
              onClick={executeTransfer}
              disabled={transfering}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {transfering ? '處理中...' : '確認移轉'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
