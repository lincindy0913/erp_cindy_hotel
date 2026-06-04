'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { todayStr, parseLocalDate } from '@/lib/localDate';
import ReportTab    from './_tabs/ReportTab';
import AnnualTab    from './_tabs/AnnualTab';
import OverviewTab  from './_tabs/OverviewTab';
import MonthlyTab   from './_tabs/MonthlyTab';
import RecordsTab   from './_tabs/RecordsTab';

const TABS = [
  { key: 'overview', label: '貸款總覽' },
  { key: 'monthly', label: '本月還款' },
  { key: 'records', label: '還款記錄' },
  { key: 'report', label: '月度報表' },
  { key: 'annual', label: '年度報表' }
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
  const confirm = useConfirm();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [loans, setLoans] = useState([]);
  const [fetchError, setFetchError] = useState(null);
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

  // Annual report tab
  const [annualYear, setAnnualYear] = useState(now.getFullYear());
  const [annualData, setAnnualData] = useState([]);
  const [annualLoading, setAnnualLoading] = useState(false);
  const [showAnnualPrintModal, setShowAnnualPrintModal] = useState(false);

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

  useEffect(() => {
    if (activeTab === 'annual') fetchAnnualData();
  }, [activeTab, annualYear]);

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

  // ============ RECORD CONFIRM (核實) ============

  function openConfirmModal(record) {
    setConfirmingRecord(record);
    setConfirmForm({
      actualPrincipal: String(record.estimatedPrincipal),
      actualInterest: String(record.estimatedInterest),
      actualDebitDate: todayStr(),
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
      transactionDate: todayStr()
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
    const due = parseLocalDate(dueDate);
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
    if (!(await confirm(`確定推送「${loan.loanName}」(預估 ${formatCurrency(record.estimatedTotal)}) 至出納？`, { title: '推送確認', danger: false }))) return;

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
    if (!(await confirm(`共 ${dueRecords.length} 筆即將到期，確定全部推送出納？\n將為每筆建立付款單。`, { title: '批次推送確認', danger: false }))) return;
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
          <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm h-28 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-7 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
          </div>
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
      {fetchError && (
        <div className="max-w-7xl mx-auto px-4 pt-4 no-print-loans">
          <FetchErrorBanner message={fetchError} onRetry={fetchAll} />
        </div>
      )}
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
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-lg shadow p-1">
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
        {activeTab === 'overview' && (
          <OverviewTab
            activeLoans={activeLoans} totalBalance={totalBalance}
            thisMonthDue={thisMonthDue} monthlyYear={monthlyYear} monthlyMonth={monthlyMonth}
            overdueLoans={overdueLoans} filterWarehouse={filterWarehouse} setFilterWarehouse={setFilterWarehouse}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            filterOwnerType={filterOwnerType} setFilterOwnerType={setFilterOwnerType}
            warehouses={warehouses} isLoggedIn={isLoggedIn} openAddLoan={openAddLoan}
            filteredLoans={filteredLoans} sortedFilteredLoans={sortedFilteredLoans}
            loanOvKey={loanOvKey} loanOvDir={loanOvDir} toggleLoanOv={toggleLoanOv}
            getDueDateWarning={getDueDateWarning} openEditLoan={openEditLoan} deleteLoan={deleteLoan}
          />
        )}
        {activeTab === 'monthly' && (
          <MonthlyTab
            loans={loans} accounts={accounts}
            monthlyYear={monthlyYear} setMonthlyYear={setMonthlyYear}
            monthlyMonth={monthlyMonth} setMonthlyMonth={setMonthlyMonth}
            monthlyRecords={monthlyRecords} isLoggedIn={isLoggedIn} now={now}
            sortedMonthlyMatrixRows={sortedMonthlyMatrixRows}
            loanMonKey={loanMonKey} loanMonDir={loanMonDir} toggleLoanMon={toggleLoanMon}
            getDaysUntilDue={getDaysUntilDue} openConfirmModal={openConfirmModal}
            deleteRecord={deleteRecord} pushToCashier={pushToCashier}
            batchPushToCashier={batchPushToCashier} openBatchModal={openBatchModal}
            openTransferModal={openTransferModal}
          />
        )}
        {activeTab === 'records' && (
          <RecordsTab
            loans={loans} records={records}
            recFilterLoan={recFilterLoan} setRecFilterLoan={setRecFilterLoan}
            recFilterYear={recFilterYear} setRecFilterYear={setRecFilterYear}
            recFilterMonth={recFilterMonth} setRecFilterMonth={setRecFilterMonth}
            recFilterStatus={recFilterStatus} setRecFilterStatus={setRecFilterStatus}
            sortedLoanRecords={sortedLoanRecords}
            loanRecKey={loanRecKey} loanRecDir={loanRecDir} toggleLoanRec={toggleLoanRec}
            isLoggedIn={isLoggedIn} openConfirmModal={openConfirmModal}
            deleteRecord={deleteRecord} now={now}
          />
        )}
        {activeTab === 'report' && (
          <ReportTab
            reportYear={reportYear}
            setReportYear={setReportYear}
            reportMonth={reportMonth}
            setReportMonth={setReportMonth}
            reportData={reportData}
            setShowLoansPrintModal={setShowLoansPrintModal}
            now={now}
          />
        )}
        {activeTab === 'annual' && (
          <AnnualTab
            annualYear={annualYear}
            setAnnualYear={setAnnualYear}
            annualData={annualData}
            annualLoading={annualLoading}
            setShowAnnualPrintModal={setShowAnnualPrintModal}
            now={now}
          />
        )}
      </div>

      {/* Modals */}
      {showLoanModal && renderLoanModal()}
      {showAnnualPrintModal && renderAnnualPrintModal()}
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
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
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

  function renderAnnualPrintModal() {
    const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
    const loanMap = {};
    for (const r of annualData) {
      const lid = r.loanId;
      if (!loanMap[lid]) loanMap[lid] = { loan: r.loan, months: {} };
      loanMap[lid].months[r.recordMonth] = r;
    }
    const loanRows = Object.values(loanMap);
    function interest(r) { return r ? (r.status === '已核實' || r.status === '已預付' ? (r.actualInterest ?? r.estimatedInterest) : r.estimatedInterest) : 0; }
    function principal(r) { return r ? (r.status === '已核實' || r.status === '已預付' ? (r.actualPrincipal ?? r.estimatedPrincipal) : r.estimatedPrincipal) : 0; }
    const totalInterestByMonth = MONTHS.map(m => annualData.filter(r => r.recordMonth === m).reduce((s, r) => s + interest(r), 0));
    const grandTotalInterest = totalInterestByMonth.reduce((a, b) => a + b, 0);
    const grandTotalPrincipal = annualData.reduce((s, r) => s + principal(r), 0);

    function doPrint() {
      window.print();
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 no-print-loans">
        <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-loans" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800">{annualYear} 年度貸款利息費用報表</h3>
            <div className="flex gap-2">
              <button type="button" onClick={doPrint} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">列印</button>
              <button type="button" onClick={() => setShowAnnualPrintModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
          </div>
          <div id="loans-annual-report-print-root" className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">{annualYear} 年度貸款利息費用報表</h2>
              <p className="text-sm text-gray-500 mt-1">製表日期：{new Date().toLocaleDateString('zh-TW')}</p>
            </div>
            {/* Summary */}
            <div className="flex gap-8 mb-6 text-sm border rounded-lg p-4 bg-gray-50">
              <div><span className="text-gray-500">年度利息費用：</span><span className="font-bold text-red-600">{formatCurrency(Math.round(grandTotalInterest))}</span></div>
              <div><span className="text-gray-500">年度本金還款：</span><span className="font-bold text-indigo-600">{formatCurrency(Math.round(grandTotalPrincipal))}</span></div>
              <div><span className="text-gray-500">年度還款合計：</span><span className="font-bold">{formatCurrency(Math.round(grandTotalInterest + grandTotalPrincipal))}</span></div>
            </div>
            {/* Pivot table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-xs border-collapse border border-gray-300">
                <thead className="sticky top-0 z-10 bg-gray-100">
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1.5 text-left">貸款名稱</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-left">銀行</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-left">館別</th>
                    {MONTHS.map(m => <th key={m} className="border border-gray-300 px-2 py-1.5 text-right">{m}月</th>)}
                    <th className="border border-gray-300 px-2 py-1.5 text-right bg-red-50">年計</th>
                  </tr>
                </thead>
                <tbody>
                  {loanRows.map(({ loan, months }) => {
                    const rowInterest = MONTHS.reduce((s, m) => s + interest(months[m]), 0);
                    return (
                      <tr key={loan?.id}>
                        <td className="border border-gray-300 px-2 py-1.5">{loan?.loanName}</td>
                        <td className="border border-gray-300 px-2 py-1.5">{loan?.bankName}</td>
                        <td className="border border-gray-300 px-2 py-1.5">{loan?.warehouse || '-'}</td>
                        {MONTHS.map(m => {
                          const rec = months[m];
                          const val = interest(rec);
                          return (
                            <td key={m} className="border border-gray-300 px-2 py-1.5 text-right font-mono">
                              {!rec ? '' : rec.status === '跳過' ? '—' : formatCurrency(Math.round(val))}
                            </td>
                          );
                        })}
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-mono font-bold text-red-600 bg-red-50">{formatCurrency(Math.round(rowInterest))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td colSpan={3} className="border border-gray-300 px-2 py-1.5 text-right">月度利息合計</td>
                    {MONTHS.map((m, i) => (
                      <td key={m} className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(totalInterestByMonth[i]))}</td>
                    ))}
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-red-600 bg-red-50">{formatCurrency(Math.round(grandTotalInterest))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Per-loan summary */}
            <table className="w-full text-xs border-collapse border border-gray-300">
              <thead className="sticky top-0 z-10 bg-gray-100">
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1.5 text-left">貸款名稱</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left">銀行</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left">館別</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right">年利率</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right">年度利息費用</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right">年度本金還款</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right">年度合計</th>
                </tr>
              </thead>
              <tbody>
                {loanRows.map(({ loan, months }) => {
                  const rowInterest = Object.values(months).reduce((s, r) => s + interest(r), 0);
                  const rowPrincipal = Object.values(months).reduce((s, r) => s + principal(r), 0);
                  return (
                    <tr key={loan?.id}>
                      <td className="border border-gray-300 px-2 py-1.5">{loan?.loanName}</td>
                      <td className="border border-gray-300 px-2 py-1.5">{loan?.bankName}</td>
                      <td className="border border-gray-300 px-2 py-1.5">{loan?.warehouse || '-'}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">{loan?.annualRate != null ? `${Number(loan.annualRate).toFixed(2)}%` : '-'}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-mono font-bold text-red-600">{formatCurrency(Math.round(rowInterest))}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(rowPrincipal))}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-mono font-bold">{formatCurrency(Math.round(rowInterest + rowPrincipal))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={4} className="border border-gray-300 px-2 py-1.5 text-right">年度合計</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-red-600">{formatCurrency(Math.round(grandTotalInterest))}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(grandTotalPrincipal))}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(grandTotalInterest + grandTotalPrincipal))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <style>{`
          @media print {
            .no-print-loans, .no-print-loans * { visibility: hidden !important; }
            #loans-annual-report-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
            #loans-annual-report-print-root * { visibility: visible !important; }
          }
        `}</style>
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
                <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">貸款名稱 *</label>
                <input id="f-2"
                  type="text" value={loanForm.loanName}
                  onChange={e => setLoanForm({ ...loanForm, loanName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：台銀房貸-麗格"
                />
              </div>
              <div>
                <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">持有人類型 *</label>
                <select id="f-3" value={loanForm.ownerType} onChange={e => setLoanForm({ ...loanForm, ownerType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {OWNER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Owner Name & Warehouse */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-30" className="block text-sm font-medium text-gray-700 mb-1">持有人姓名</label>
                <input id="f-30"
                  type="text" value={loanForm.ownerName}
                  onChange={e => setLoanForm({ ...loanForm, ownerName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填"
                />
              </div>
              <div>
                <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                <select id="f-4" value={loanForm.warehouse} onChange={e => setLoanForm({ ...loanForm, warehouse: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">請選擇</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            {/* Row 3: Bank */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-31" className="block text-sm font-medium text-gray-700 mb-1">銀行名稱 *</label>
                <input id="f-31"
                  type="text" value={loanForm.bankName}
                  onChange={e => setLoanForm({ ...loanForm, bankName: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="例：台灣銀行"
                />
              </div>
              <div>
                <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">分行</label>
                <input id="f-5"
                  type="text" value={loanForm.bankBranch}
                  onChange={e => setLoanForm({ ...loanForm, bankBranch: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="選填"
                />
              </div>
            </div>

            {/* Row 4: Loan Type & Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">貸款類型</label>
                <select id="f-6" value={loanForm.loanType} onChange={e => setLoanForm({ ...loanForm, loanType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {LOAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-32" className="block text-sm font-medium text-gray-700 mb-1">貸款金額 *</label>
                <input id="f-32"
                  type="number" value={loanForm.originalAmount}
                  onChange={e => setLoanForm({ ...loanForm, originalAmount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="原始貸款金額"
                />
              </div>
            </div>

            {/* Row 5: Rate */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="f-7" className="block text-sm font-medium text-gray-700 mb-1">年利率 (%)</label>
                <input id="f-7"
                  type="number" step="0.01" value={loanForm.annualRate}
                  onChange={e => setLoanForm({ ...loanForm, annualRate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0 表示無利息"
                />
              </div>
              <div>
                <label htmlFor="f-8" className="block text-sm font-medium text-gray-700 mb-1">利率類型</label>
                <select id="f-8" value={loanForm.rateType} onChange={e => setLoanForm({ ...loanForm, rateType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {RATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-33" className="block text-sm font-medium text-gray-700 mb-1">還款日 *</label>
                <input id="f-33"
                  type="number" min="1" max="28" value={loanForm.repaymentDay}
                  onChange={e => setLoanForm({ ...loanForm, repaymentDay: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1-28"
                />
              </div>
            </div>

            {/* Row 6: Repayment Type & Dates */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="f-9" className="block text-sm font-medium text-gray-700 mb-1">還款方式 *</label>
                <select id="f-9" value={loanForm.repaymentType} onChange={e => setLoanForm({ ...loanForm, repaymentType: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-34" className="block text-sm font-medium text-gray-700 mb-1">起始日 *</label>
                <input id="f-34"
                  type="date" value={loanForm.startDate}
                  onChange={e => setLoanForm({ ...loanForm, startDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-35" className="block text-sm font-medium text-gray-700 mb-1">到期日 *</label>
                <input id="f-35"
                  type="date" value={loanForm.endDate}
                  onChange={e => setLoanForm({ ...loanForm, endDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Row 7: Deduct Account & Sort */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-10" className="block text-sm font-medium text-gray-700 mb-1">扣款帳戶 *</label>
                <select id="f-10" value={loanForm.deductAccountId} onChange={e => setLoanForm({ ...loanForm, deductAccountId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">請選擇</option>
                  {accounts.filter(a => a.isActive).map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-37" className="block text-sm font-medium text-gray-700 mb-1">排序</label>
                <input id="f-37"
                  type="number" value={loanForm.sortOrder}
                  onChange={e => setLoanForm({ ...loanForm, sortOrder: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0"
                />
              </div>
            </div>

            {/* Row 7.2: 會計科目（本金 / 利息） */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-11" className="block text-sm font-medium text-gray-700 mb-1">本金會計科目</label>
                <select id="f-11"
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
                <label htmlFor="f-38" className="block text-sm font-medium text-gray-700 mb-1">利息會計科目</label>
                <select id="f-38"
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
                    <label htmlFor="f-36" className="block text-sm font-medium text-gray-700 mb-1">貸款狀態</label>
                    <select id="f-36" value={loanForm.status} onChange={e => setLoanForm({ ...loanForm, status: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm">
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
                <label htmlFor="f-12" className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label>
                <input id="f-12"
                  type="text" value={loanForm.contactPerson}
                  onChange={e => setLoanForm({ ...loanForm, contactPerson: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-13" className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                <input id="f-13"
                  type="text" value={loanForm.contactPhone}
                  onChange={e => setLoanForm({ ...loanForm, contactPhone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Row 9: Collateral & Guarantor */}
            <div>
              <label htmlFor="f-14" className="block text-sm font-medium text-gray-700 mb-1">擔保物</label>
              <input id="f-14"
                type="text" value={loanForm.collateral}
                onChange={e => setLoanForm({ ...loanForm, collateral: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="例：土地、建物、設備等"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="f-15" className="block text-sm font-medium text-gray-700 mb-1">保證人/要保人</label>
                <input id="f-15"
                  type="text" value={loanForm.guarantor}
                  onChange={e => setLoanForm({ ...loanForm, guarantor: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-16" className="block text-sm font-medium text-gray-700 mb-1">保證人電話</label>
                <input id="f-16"
                  type="text" value={loanForm.guarantorPhone}
                  onChange={e => setLoanForm({ ...loanForm, guarantorPhone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-17" className="block text-sm font-medium text-gray-700 mb-1">保證人身分證</label>
                <input id="f-17"
                  type="text" value={loanForm.guarantorIdNo}
                  onChange={e => setLoanForm({ ...loanForm, guarantorIdNo: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Remark */}
            <div>
              <label htmlFor="f-18" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea id="f-18"
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
                <label htmlFor="f-19" className="block text-sm font-medium text-gray-700 mb-1">實際本金 *</label>
                <input id="f-19"
                  type="number" value={confirmForm.actualPrincipal}
                  onChange={e => setConfirmForm({ ...confirmForm, actualPrincipal: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-20" className="block text-sm font-medium text-gray-700 mb-1">實際利息 *</label>
                <input id="f-20"
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
                <label htmlFor="f-21" className="block text-sm font-medium text-gray-700 mb-1">實際扣款日</label>
                <input id="f-21"
                  type="date" value={confirmForm.actualDebitDate}
                  onChange={e => setConfirmForm({ ...confirmForm, actualDebitDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="f-22" className="block text-sm font-medium text-gray-700 mb-1">對帳單號</label>
                <input id="f-22"
                  type="text" value={confirmForm.statementNo}
                  onChange={e => setConfirmForm({ ...confirmForm, statementNo: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="f-23" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea id="f-23"
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
              <label htmlFor="f-24" className="block text-sm font-medium text-gray-700 mb-1">來源帳戶 *</label>
              <select id="f-24"
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
                <label htmlFor="f-25" className="block text-sm font-medium text-gray-700 mb-1">移轉金額 *</label>
                <input id="f-25"
                  type="number" value={transferForm.amount}
                  onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" min="0"
                />
              </div>
              <div>
                <label htmlFor="f-26" className="block text-sm font-medium text-gray-700 mb-1">交易日期</label>
                <input id="f-26"
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
              <label htmlFor="f-27" className="block text-sm font-medium text-gray-700 mb-1">說明</label>
              <input id="f-27"
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
