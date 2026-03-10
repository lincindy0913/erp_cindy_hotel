'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

const TABS = [
  { key: 'overview', label: '貸款總覽' },
  { key: 'monthly', label: '本月還款' },
  { key: 'records', label: '還款記錄' },
  { key: 'report', label: '月度報表' }
];

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
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
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('overview');

  // Data states
  const [loans, setLoans] = useState([]);
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Loan form
  const [loanForm, setLoanForm] = useState({
    loanName: '', ownerType: '公司', ownerName: '', warehouse: '',
    bankName: '', bankBranch: '', loanType: '一般貸款',
    originalAmount: '', annualRate: '', rateType: '固定利率',
    repaymentType: '本息攤還', repaymentDay: '20',
    startDate: '', endDate: '', deductAccountId: '',
    contactPerson: '', contactPhone: '', remark: '', sortOrder: '0',
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
      fetchMonthlyRecords();
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
      const [loansRes, accountsRes, whRes] = await Promise.all([
        fetch('/api/loans'),
        fetch('/api/cashflow/accounts'),
        fetch('/api/warehouse-departments')
      ]);
      const loansData = await loansRes.json();
      const accountsData = await accountsRes.json();
      const whData = await whRes.json();

      setLoans(Array.isArray(loansData) ? loansData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
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

  // ============ LOAN CRUD ============

  function openAddLoan() {
    setEditingLoan(null);
    setLoanForm({
      loanName: '', ownerType: '公司', ownerName: '', warehouse: '',
      bankName: '', bankBranch: '', loanType: '一般貸款',
      originalAmount: '', annualRate: '', rateType: '固定利率',
      repaymentType: '本息攤還', repaymentDay: '20',
      startDate: '', endDate: '', deductAccountId: '',
      contactPerson: '', contactPhone: '', remark: '', sortOrder: '0',
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
      contactPerson: loan.contactPerson || '', contactPhone: loan.contactPhone || '',
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
      alert(`請填寫必填欄位：${missing.join('、')}`);
      return;
    }
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
        alert(msg);
        return;
      }
      setShowLoanModal(false);
      fetchAll();
    } catch (e) {
      alert('儲存失敗: ' + (e.message || '請稍後再試'));
    }
  }

  async function deleteLoan(loan) {
    if (!confirm(`確定要刪除「${loan.loanName}」嗎？`)) return;
    try {
      const res = await fetch(`/api/loans/${loan.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '刪除失敗');
        return;
      }
      fetchAll();
    } catch (e) {
      alert('刪除失敗: ' + e.message);
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
      alert('請填寫實際本金和利息');
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
        alert(err.error || '核實失敗');
        return;
      }
      setShowConfirmModal(false);
      fetchMonthlyRecords();
      fetchAll();
    } catch (e) {
      alert('核實失敗: ' + e.message);
    }
  }

  async function deleteRecord(record) {
    const label = record.status === '已核實' ? '此操作將同時刪除相關現金交易並回沖餘額，' : '';
    if (!confirm(`${label}確定要刪除此還款記錄嗎？`)) return;
    try {
      const res = await fetch(`/api/loans/records/${record.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '刪除失敗');
        return;
      }
      fetchMonthlyRecords();
      fetchAllRecords();
      fetchAll();
    } catch (e) {
      alert('刪除失敗: ' + e.message);
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
      alert('請至少選擇一筆貸款');
      return;
    }
    try {
      const res = await fetch('/api/loans/records/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: monthlyYear, month: monthlyMonth, loanIds: batchLoanIds })
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || '批次建立失敗');
        return;
      }
      alert(`成功建立 ${result.created} 筆，跳過 ${result.skipped} 筆`);
      setShowBatchModal(false);
      fetchMonthlyRecords();
    } catch (e) {
      alert('批次建立失敗: ' + e.message);
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
      alert('請填寫來源帳戶和金額');
      return;
    }
    if (parseInt(transferForm.sourceAccountId) === transferTargetAccount.id) {
      alert('來源帳戶與目的帳戶不可相同');
      return;
    }
    const amount = parseFloat(transferForm.amount);
    if (amount <= 0) {
      alert('金額必須大於零');
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
          sourceType: 'loan_predeposit',
          hasFee: false
        })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err?.error?.message || err?.error || '移轉失敗');
        return;
      }
      alert(`已成功移轉 ${formatCurrency(amount)} 至 ${transferTargetAccount.name}`);
      setShowTransferModal(false);
      fetchAll(); // refresh account balances
    } catch (e) {
      alert('移轉失敗: ' + e.message);
    } finally {
      setTransfering(false);
    }
  }

  // ============ COMPUTED VALUES ============

  const filteredLoans = loans.filter(l => {
    if (filterWarehouse && l.warehouse !== filterWarehouse) return false;
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterOwnerType && l.ownerType !== filterOwnerType) return false;
    return true;
  });

  const activeLoans = loans.filter(l => l.status === '使用中');
  const totalBalance = activeLoans.reduce((sum, l) => sum + l.currentBalance, 0);
  const thisMonthDue = monthlyRecords.filter(r => r.status === '暫估').length;
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
      <Navigation borderColor="border-indigo-500" />
      <NotificationBanner moduleFilter="loans" />
      <div className="max-w-7xl mx-auto px-4 py-6">
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款編號</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">銀行</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">館別</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">原始金額</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">目前餘額</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">年利率</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">到期日</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">扣款帳戶</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLoans.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-400">暫無貸款資料</td>
                  </tr>
                ) : filteredLoans.map(loan => {
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
          <p className="text-sm font-medium text-indigo-800 mb-2">貸款還款流程：</p>
          <ol className="text-xs text-indigo-700 space-y-1 list-decimal list-inside">
            <li><b>批次建立暫估</b> — 系統自動計算每筆貸款本月預估的本金和利息</li>
            <li><b>出納預存款</b> — 下方「帳戶資金彙總」可直接快速移轉資金至扣款帳戶</li>
            <li><b>等待利息單</b> — 銀行扣款後取得正式利息單</li>
            <li><b>核實回填</b> — 點「核實」填入實際本金與利息 → 系統自動建立現金流支出 → 帳戶餘額與貸款餘額同步更新</li>
          </ol>
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
          {isLoggedIn && (
            <button onClick={openBatchModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
              批次建立暫估
            </button>
          )}
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款編號</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款名稱</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">扣款帳戶</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">還款日</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估本金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估利息</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估合計</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際本金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際利息</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際合計</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">差異</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeLoansForMonth.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-8 text-gray-400">
                      暫無使用中的貸款，請先在「貸款總覽」新增貸款
                    </td>
                  </tr>
                ) : activeLoansForMonth.map(loan => {
                  const rec = recordMap[loan.id];
                  const diff = rec && rec.status === '已核實' && rec.actualTotal != null
                    ? rec.estimatedTotal - rec.actualTotal : null;
                  return (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-600">{loan.loanCode}</td>
                      <td className="px-4 py-3 font-medium">{loan.loanName}</td>
                      <td className="px-4 py-3 text-xs">{loan.deductAccount?.name || '-'}</td>
                      <td className="px-4 py-3 text-center">{rec ? formatDate(rec.dueDate) : `每月${loan.repaymentDay}日`}</td>
                      <td className="px-4 py-3 text-center">
                        {rec ? (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                            {rec.status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">未建立</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{rec ? formatCurrency(rec.estimatedPrincipal) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono">{rec ? formatCurrency(rec.estimatedInterest) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium">{rec ? formatCurrency(rec.estimatedTotal) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">{rec?.actualPrincipal != null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">{rec?.actualInterest != null ? formatCurrency(rec.actualInterest) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-green-700">{rec?.actualTotal != null ? formatCurrency(rec.actualTotal) : '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {diff != null ? (
                          <span className={diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}>
                            {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isLoggedIn && (
                          <div className="flex gap-1 justify-center">
                            {rec && rec.status === '暫估' && (
                              <>
                                <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                                  核實
                                </button>
                                <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                                  刪除
                                </button>
                              </>
                            )}
                            {rec && rec.status === '已核實' && (
                              <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                                沖銷
                              </button>
                            )}
                            {!rec && (
                              <span className="text-gray-400 text-xs">請先批次建立</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {monthlyRecords.length > 0 && (() => {
                const totalEstP = monthlyRecords.reduce((s, r) => s + r.estimatedPrincipal, 0);
                const totalEstI = monthlyRecords.reduce((s, r) => s + r.estimatedInterest, 0);
                const totalEstT = monthlyRecords.reduce((s, r) => s + r.estimatedTotal, 0);
                const confirmedRecs = monthlyRecords.filter(r => r.actualTotal != null);
                const totalActP = confirmedRecs.reduce((s, r) => s + (r.actualPrincipal || 0), 0);
                const totalActI = confirmedRecs.reduce((s, r) => s + (r.actualInterest || 0), 0);
                const totalActT = confirmedRecs.reduce((s, r) => s + (r.actualTotal || 0), 0);
                const totalDiff = confirmedRecs.reduce((s, r) => s + (r.estimatedTotal - (r.actualTotal || 0)), 0);
                return (
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr className="font-medium">
                      <td colSpan={5} className="px-4 py-3 text-right text-gray-600">合計:</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstP)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstI)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstT)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActP)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActI)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActT)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {confirmedRecs.length > 0 ? (
                          <span className={totalDiff > 0 ? 'text-orange-600' : totalDiff < 0 ? 'text-red-600' : 'text-gray-400'}>
                            {totalDiff > 0 ? '+' : ''}{formatCurrency(totalDiff)}
                          </span>
                        ) : '-'}
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600">年/月</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款編號</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">貸款名稱</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">還款日</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">暫估合計</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際本金</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際利息</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">實際合計</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">核實日期</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-gray-400">暫無還款記錄</td>
                  </tr>
                ) : records.map(rec => (
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
        {/* Month Selector */}
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
            <button onClick={() => setShowLoanModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
              取消
            </button>
            <button onClick={saveLoan} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors">
              {editingLoan ? '更新' : '新增'}
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
              <h3 className="text-lg font-bold text-gray-800">批次建立暫估</h3>
              <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              為 {monthlyYear}年{monthlyMonth}月 批次建立暫估記錄
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
                建立暫估
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
