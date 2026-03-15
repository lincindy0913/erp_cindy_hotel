'use client';

import { useState, useEffect, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { useToast } from '@/context/ToastContext';

const ACCOUNT_TYPES = ['現金', '銀行存款', '代墊款', '信用卡'];
const TX_TYPES = ['收入', '支出', '移轉'];
const TABS = [
  { key: 'overview', label: '帳戶總覽' },
  { key: 'transactions', label: '交易紀錄' },
  { key: 'categories', label: '類別管理' },
  { key: 'report', label: '現金流量表' },
  { key: 'forecast', label: '資金預測' },
  { key: 'cash-count', label: '現金盤點' }
];

export default function CashFlowPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('overview');

  // Shared data
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Account form
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', type: '現金', warehouse: '', openingBalance: '' });

  // Category form
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', type: '收入', warehouse: '', accountingSubjectId: '' });
  const [accountingSubjects, setAccountingSubjects] = useState([]);

  // Transaction form
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({
    transactionDate: new Date().toISOString().split('T')[0],
    type: '支出',
    warehouse: '',
    accountId: '',
    categoryId: '',
    supplierId: '',
    paymentNo: '',
    amount: '',
    hasFee: false,
    fee: '',
    accountingSubject: '',
    paymentTerms: '',
    description: '',
    transferAccountId: ''
  });

  // Transaction filters
  const [txFilter, setTxFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    warehouse: '',
    type: '',
    accountId: '',
    sourceType: ''
  });

  // Report state
  const [reportData, setReportData] = useState(null);
  const [reportFilter, setReportFilter] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    warehouse: ''
  });

  // Forecast state
  const [summaryData, setSummaryData] = useState(null);
  const [forecastWarehouse, setForecastWarehouse] = useState('');

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchAccounts(),
      fetchCategories(),
      fetchSuppliers(),
      fetchWarehouses(),
      fetchAccountingSubjects()
    ]);
    setLoading(false);
  }

  async function fetchAccountingSubjects() {
    try {
      const res = await fetch('/api/accounting-subjects');
      const data = await res.json();
      setAccountingSubjects(Array.isArray(data) ? data : []);
    } catch { setAccountingSubjects([]); }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  async function fetchCategories() {
    try {
      const res = await fetch('/api/cashflow/categories');
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch { setCategories([]); }
  }

  async function fetchTransactions() {
    try {
      const params = new URLSearchParams();
      if (txFilter.startDate) params.append('startDate', txFilter.startDate);
      if (txFilter.endDate) params.append('endDate', txFilter.endDate);
      if (txFilter.warehouse) params.append('warehouse', txFilter.warehouse);
      if (txFilter.type) params.append('type', txFilter.type);
      if (txFilter.accountId) params.append('accountId', txFilter.accountId);
      if (txFilter.sourceType) params.append('sourceType', txFilter.sourceType);

      const res = await fetch(`/api/cashflow/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch { setTransactions([]); }
  }

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/suppliers');
      const data = await res.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch { setSuppliers([]); }
  }

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      const data = await res.json();
      setWarehouses(data && data.byName ? Object.keys(data.byName) : Object.keys(data || {}));
    } catch { setWarehouses(['麗格', '麗軒', '民宿']); }
  }

  async function fetchReport() {
    try {
      const params = new URLSearchParams(reportFilter);
      const res = await fetch(`/api/cashflow/report?${params.toString()}`);
      const data = await res.json();
      setReportData(data);
    } catch { setReportData(null); }
  }

  async function fetchSummary() {
    try {
      const params = new URLSearchParams();
      if (forecastWarehouse) params.append('warehouse', forecastWarehouse);
      params.append('days', '30');
      const res = await fetch(`/api/cashflow/summary?${params.toString()}`);
      const data = await res.json();
      setSummaryData(data);
    } catch { setSummaryData(null); }
  }

  // ==================== Account CRUD ====================
  async function handleCreateAccount(e) {
    e.preventDefault();
    if (!accountForm.name || !accountForm.warehouse) {
      showToast('請填寫帳戶名稱和館別', 'error');
      return;
    }
    try {
      const res = await fetch('/api/cashflow/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountForm)
      });
      if (res.ok) {
        setShowAccountForm(false);
        setAccountForm({ name: '', type: '現金', warehouse: '', openingBalance: '' });
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '建立失敗', 'error');
      }
    } catch { showToast('建立帳戶失敗', 'error'); }
  }

  async function handleDeleteAccount(id) {
    if (!confirm('確定要刪除此帳戶嗎？')) return;
    try {
      const res = await fetch(`/api/cashflow/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除帳戶失敗', 'error'); }
  }

  // ==================== Category CRUD ====================
  async function handleCreateCategory(e) {
    e.preventDefault();
    if (!categoryForm.name) {
      showToast('請填寫類別名稱', 'error');
      return;
    }
    try {
      const res = await fetch('/api/cashflow/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm)
      });
      if (res.ok) {
        setShowCategoryForm(false);
        setCategoryForm({ name: '', type: '收入', warehouse: '', accountingSubjectId: '' });
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error || '建立失敗', 'error');
      }
    } catch { showToast('建立類別失敗', 'error'); }
  }

  async function handleDeleteCategory(id) {
    if (!confirm('確定要刪除此類別嗎？')) return;
    try {
      const res = await fetch(`/api/cashflow/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除類別失敗', 'error'); }
  }

  // ==================== Transaction CRUD ====================
  async function handleCreateTransaction(e) {
    e.preventDefault();
    if (!txForm.accountId || !txForm.amount || !txForm.transactionDate) {
      showToast('請填寫帳戶、金額和日期', 'error');
      return;
    }
    if (txForm.type === '移轉' && !txForm.transferAccountId) {
      showToast('移轉交易必須指定目的帳戶', 'error');
      return;
    }
    try {
      const res = await fetch('/api/cashflow/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txForm)
      });
      if (res.ok) {
        setShowTxForm(false);
        setTxForm({
          transactionDate: new Date().toISOString().split('T')[0],
          type: '支出',
          warehouse: '',
          accountId: '',
          categoryId: '',
          supplierId: '',
          paymentNo: '',
          amount: '',
          hasFee: false,
          fee: '',
          accountingSubject: '',
          paymentTerms: '',
          description: '',
          transferAccountId: ''
        });
        fetchTransactions();
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '建立失敗', 'error');
      }
    } catch { showToast('建立交易失敗', 'error'); }
  }

  async function handleDeleteTransaction(id) {
    if (!confirm('確定要刪除此交易嗎？移轉交易將同時刪除配對交易。')) return;
    try {
      const res = await fetch(`/api/cashflow/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTransactions();
        fetchAccounts();
      } else {
        const err = await res.json();
        showToast(err.error || '刪除失敗', 'error');
      }
    } catch { showToast('刪除交易失敗', 'error'); }
  }

  // ==================== Helpers ====================
  function formatMoney(val) {
    const num = parseFloat(val) || 0;
    return `NT$ ${num.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getAccountName(id) {
    const acc = accounts.find(a => a.id === id);
    return acc ? `${acc.warehouse}-${acc.name}` : '未知帳戶';
  }

  function getSupplierName(id) {
    const s = suppliers.find(s => s.id === id);
    return s ? s.name : '';
  }

  // Group accounts by type
  function getAccountsByType() {
    const grouped = {};
    for (const type of ACCOUNT_TYPES) {
      grouped[type] = accounts.filter(a => a.type === type);
    }
    return grouped;
  }

  // Filter categories by type for transaction form
  function getCategoriesForType(type) {
    if (type === '移轉') return [];
    const catType = type === '收入' ? '收入' : '支出';
    return categories.filter(c => c.type === catType && c.isActive);
  }

  if (loading) {
    return (
      <div className="min-h-screen page-bg-cashflow">
        <Navigation borderColor="border-emerald-600" />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16 text-gray-500">載入中...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-bg-cashflow">
      <Navigation borderColor="border-emerald-600" />
      <NotificationBanner moduleFilter="cashflow" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">現金流管理</h2>
          {activeTab === 'transactions' && (
            <ExportButtons
              data={transactions.map(tx => ({
                ...tx,
                accountName: tx.account?.name || '-',
                categoryName: tx.category?.name || '-',
              }))}
              columns={EXPORT_CONFIGS.cashflow.columns}
              exportName={EXPORT_CONFIGS.cashflow.filename}
              title="現金交易紀錄"
              sheetName="交易紀錄"
            />
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === 'transactions') fetchTransactions();
                if (tab.key === 'forecast') fetchSummary();
              }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ==================== Tab 1: Account Overview ==================== */}
        {activeTab === 'overview' && (
          <div>
            {/* Total summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {ACCOUNT_TYPES.map(type => {
                const total = accounts.filter(a => a.type === type).reduce((s, a) => s + a.currentBalance, 0);
                return (
                  <div key={type} className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-emerald-500">
                    <div className="text-sm text-gray-500 mb-1">{type}</div>
                    <div className={`text-xl font-bold ${total >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatMoney(total)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Grand total */}
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4 mb-6 flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-700">全部帳戶總餘額</span>
              <span className={`text-2xl font-bold ${accounts.reduce((s, a) => s + a.currentBalance, 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatMoney(accounts.reduce((s, a) => s + a.currentBalance, 0))}
              </span>
            </div>

            {/* Add account button */}
            {isLoggedIn && (
              <div className="mb-4">
                <button
                  onClick={() => setShowAccountForm(!showAccountForm)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm"
                >
                  + 新增帳戶
                </button>
              </div>
            )}

            {/* Add account form */}
            {showAccountForm && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-emerald-200">
                <h3 className="text-lg font-semibold mb-4">新增資金帳戶</h3>
                <form onSubmit={handleCreateAccount}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">帳戶名稱 *</label>
                      <input
                        type="text"
                        required
                        value={accountForm.name}
                        onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                        placeholder="例：零用金、台銀帳戶"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">帳戶類型 *</label>
                      <select
                        value={accountForm.type}
                        onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                      <select
                        required
                        value={accountForm.warehouse}
                        onChange={(e) => setAccountForm({ ...accountForm, warehouse: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">選擇館別</option>
                        {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">起始金額</label>
                      <input
                        type="number"
                        step="0.01"
                        value={accountForm.openingBalance}
                        onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm">儲存</button>
                    <button type="button" onClick={() => setShowAccountForm(false)} className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
                  </div>
                </form>
              </div>
            )}

            {/* Account list grouped by type */}
            {ACCOUNT_TYPES.map(type => {
              const accs = accounts.filter(a => a.type === type);
              if (accs.length === 0) return null;
              return (
                <div key={type} className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 text-gray-700">{type}</h3>
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">帳戶名稱</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">起始金額</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">目前餘額</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">異動金額</th>
                          {isLoggedIn && <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {accs.map(acc => {
                          const diff = acc.currentBalance - acc.openingBalance;
                          return (
                            <tr key={acc.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm">{acc.warehouse}</td>
                              <td className="px-4 py-3 text-sm font-medium">{acc.name}</td>
                              <td className="px-4 py-3 text-sm text-right">{formatMoney(acc.openingBalance)}</td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${acc.currentBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {formatMoney(acc.currentBalance)}
                              </td>
                              <td className={`px-4 py-3 text-sm text-right ${diff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                              </td>
                              {isLoggedIn && (
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleDeleteAccount(acc.id)}
                                    className="text-red-600 hover:underline text-sm"
                                  >
                                    刪除
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {accounts.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                尚未建立任何帳戶，請先新增資金帳戶
              </div>
            )}
          </div>
        )}

        {/* ==================== Tab 2: Transactions ==================== */}
        {activeTab === 'transactions' && (
          <div>
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">起始日期</label>
                  <input
                    type="date"
                    value={txFilter.startDate}
                    onChange={(e) => setTxFilter({ ...txFilter, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
                  <input
                    type="date"
                    value={txFilter.endDate}
                    onChange={(e) => setTxFilter({ ...txFilter, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                  <select
                    value={txFilter.warehouse}
                    onChange={(e) => setTxFilter({ ...txFilter, warehouse: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全部</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">交易類別</label>
                  <select
                    value={txFilter.type}
                    onChange={(e) => setTxFilter({ ...txFilter, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全部</option>
                    {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="移轉入">移轉入</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">帳戶</label>
                  <select
                    value={txFilter.accountId}
                    onChange={(e) => setTxFilter({ ...txFilter, accountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全部</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.warehouse}-{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">來源</label>
                  <select
                    value={txFilter.sourceType}
                    onChange={(e) => setTxFilter({ ...txFilter, sourceType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全部</option>
                    <option value="pms_income_settlement">PMS結算</option>
                    <option value="pms_income_fee">PMS手續費</option>
                    <option value="pms_manual_commission">PMS佣金</option>
                    <option value="cashier_payment">出納付款</option>
                    <option value="loan_payment">貸款還款</option>
                    <option value="rental_income">租賃收入</option>
                    <option value="fixed_expense">固定費用</option>
                    <option value="common_expense">一般費用</option>
                    <option value="check_payment">支票</option>
                    <option value="cash_count_adjustment">盤點調整</option>
                    <option value="reversal">沖銷</option>
                    <option value="manual">手動</option>
                  </select>
                </div>
              </div>
              <button
                onClick={fetchTransactions}
                className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm"
              >
                查詢
              </button>
            </div>

            {/* Add transaction button */}
            {isLoggedIn && (
              <div className="mb-4">
                <button
                  onClick={() => setShowTxForm(!showTxForm)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm"
                >
                  + 新增交易
                </button>
              </div>
            )}

            {/* Transaction form */}
            {showTxForm && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-emerald-200">
                <h3 className="text-lg font-semibold mb-4">新增資金交易</h3>
                <form onSubmit={handleCreateTransaction}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">交易日期 *</label>
                      <input
                        type="date"
                        required
                        value={txForm.transactionDate}
                        onChange={(e) => setTxForm({ ...txForm, transactionDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">類別 *</label>
                      <select
                        required
                        value={txForm.type}
                        onChange={(e) => setTxForm({ ...txForm, type: e.target.value, categoryId: '', transferAccountId: '' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                      <select
                        value={txForm.warehouse}
                        onChange={(e) => setTxForm({ ...txForm, warehouse: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">選擇館別</option>
                        {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {txForm.type === '移轉' ? '來源帳戶' : '帳戶'} *
                      </label>
                      <select
                        required
                        value={txForm.accountId}
                        onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">選擇帳戶</option>
                        {accounts.filter(a => a.isActive).map(a => (
                          <option key={a.id} value={a.id}>{a.warehouse}-{a.name} ({a.type})</option>
                        ))}
                      </select>
                    </div>

                    {txForm.type === '移轉' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">目的帳戶 *</label>
                        <select
                          required
                          value={txForm.transferAccountId}
                          onChange={(e) => setTxForm({ ...txForm, transferAccountId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">選擇目的帳戶</option>
                          {accounts.filter(a => a.isActive && String(a.id) !== String(txForm.accountId)).map(a => (
                            <option key={a.id} value={a.id}>{a.warehouse}-{a.name} ({a.type})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {txForm.type !== '移轉' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">資金類別</label>
                        <select
                          value={txForm.categoryId}
                          onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">選擇類別</option>
                          {getCategoriesForType(txForm.type).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
                      <select
                        value={txForm.supplierId}
                        onChange={(e) => setTxForm({ ...txForm, supplierId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">無</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={txForm.amount}
                        onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">付款單號</label>
                      <input
                        type="text"
                        value={txForm.paymentNo}
                        onChange={(e) => setTxForm({ ...txForm, paymentNo: e.target.value })}
                        placeholder="關聯付款單號"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">付款條件</label>
                      <select
                        value={txForm.paymentTerms}
                        onChange={(e) => setTxForm({ ...txForm, paymentTerms: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">無</option>
                        <option value="月結">月結</option>
                        <option value="現金">現金</option>
                        <option value="支票">支票</option>
                        <option value="轉帳">轉帳</option>
                        <option value="信用卡">信用卡</option>
                        <option value="員工代付">員工代付</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">會計科目</label>
                      <input
                        type="text"
                        value={txForm.accountingSubject}
                        onChange={(e) => setTxForm({ ...txForm, accountingSubject: e.target.value })}
                        placeholder="會計科目"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-end gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="hasFee"
                          checked={txForm.hasFee}
                          onChange={(e) => setTxForm({ ...txForm, hasFee: e.target.checked, fee: e.target.checked ? txForm.fee : '' })}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor="hasFee" className="text-sm text-gray-700">有手續費</label>
                      </div>
                      {txForm.hasFee && (
                        <div className="flex-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={txForm.fee}
                            onChange={(e) => setTxForm({ ...txForm, fee: e.target.value })}
                            placeholder="手續費金額"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="col-span-2 md:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                      <input
                        type="text"
                        value={txForm.description}
                        onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                        placeholder="備註說明"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Transfer info */}
                  {txForm.type === '移轉' && txForm.accountId && txForm.transferAccountId && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm">
                      系統將自動建立 2 筆交易：
                      <strong>{getAccountName(parseInt(txForm.accountId))}</strong> 轉出 →
                      <strong>{getAccountName(parseInt(txForm.transferAccountId))}</strong> 轉入。
                      此交易不計入收入或支出。
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm">儲存</button>
                    <button type="button" onClick={() => setShowTxForm(false)} className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
                  </div>
                </form>
              </div>
            )}

            {/* Transaction list */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">交易編號</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">日期</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">類別</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">帳戶</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">分類</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">付款單號</th>
                    <th className="px-3 py-3 text-right text-sm font-medium text-gray-700">金額</th>
                    <th className="px-3 py-3 text-right text-sm font-medium text-gray-700">手續費</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">備註</th>
                    <th className="px-3 py-3 text-left text-sm font-medium text-gray-700">來源</th>
                    {isLoggedIn && <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={isLoggedIn ? 12 : 11} className="px-4 py-8 text-center text-gray-500">
                        尚無交易紀錄，請先查詢或新增交易
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, idx) => (
                      <tr key={tx.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-2 text-sm font-mono">{tx.transactionNo}</td>
                        <td className="px-3 py-2 text-sm">{tx.transactionDate}</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            tx.type === '收入' ? 'bg-green-100 text-green-800' :
                            tx.type === '支出' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm">{tx.warehouse || '-'}</td>
                        <td className="px-3 py-2 text-sm">{tx.account ? `${tx.account.name}` : '-'}</td>
                        <td className="px-3 py-2 text-sm">
                          {tx.category ? (
                            <div>
                              <div>{tx.category.name}</div>
                              {tx.category.accountingSubject && (
                                <div className="text-xs text-gray-400 font-mono">{tx.category.accountingSubject.code}</div>
                              )}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-sm font-mono">{tx.paymentNo || '-'}</td>
                        <td className={`px-3 py-2 text-sm text-right font-semibold ${
                          tx.type === '收入' || tx.type === '移轉入' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.type === '收入' || tx.type === '移轉入' ? '+' : '-'}{formatMoney(tx.amount)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right">
                          {tx.hasFee ? formatMoney(tx.fee) : '-'}
                        </td>
                        <td className="px-3 py-2 text-sm truncate max-w-[150px]" title={tx.description || ''}>
                          {tx.description || '-'}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {tx.sourceType ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              tx.sourceType.startsWith('pms_') ? 'bg-teal-100 text-teal-700' :
                              tx.sourceType === 'cashier_payment' ? 'bg-amber-100 text-amber-700' :
                              tx.sourceType.startsWith('loan_') ? 'bg-purple-100 text-purple-700' :
                              tx.sourceType.startsWith('rental_') ? 'bg-indigo-100 text-indigo-700' :
                              tx.sourceType.startsWith('fixed_') || tx.sourceType.includes('expense') ? 'bg-orange-100 text-orange-700' :
                              tx.sourceType.startsWith('check_') ? 'bg-cyan-100 text-cyan-700' :
                              tx.sourceType.startsWith('cash_count') ? 'bg-pink-100 text-pink-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {{
                                pms_income_settlement: 'PMS結算',
                                pms_income_fee: 'PMS手續費',
                                pms_manual_commission: 'PMS佣金',
                                cashier_payment: '出納付款',
                                loan_payment: '貸款還款',
                                rental_income: '租賃收入',
                                rental_deposit_in: '租賃押金收',
                                rental_deposit_out: '租賃押金退',
                                rental_maintenance: '租賃維修',
                                rental_tax: '租賃稅費',
                                fixed_expense: '固定費用',
                                common_expense: '一般費用',
                                purchase_expense: '採購費用',
                                check_payment: '支票付款',
                                check_receipt: '支票收款',
                                check_bounce: '支票退票',
                                cash_count_adjustment: '盤點調整',
                                cash_count_shortage: '盤點短缺',
                                reversal: '沖銷',
                                reconciliation_adjustment: '對帳調整',
                                manual: '手動',
                              }[tx.sourceType] || tx.sourceType}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">手動</span>
                          )}
                        </td>
                        {isLoggedIn && (
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== Tab 3: Category Management ==================== */}
        {activeTab === 'categories' && (
          <div>
            {isLoggedIn && (
              <div className="mb-4">
                <button
                  onClick={() => setShowCategoryForm(!showCategoryForm)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm"
                >
                  + 新增類別
                </button>
              </div>
            )}

            {showCategoryForm && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-emerald-200">
                <h3 className="text-lg font-semibold mb-4">新增資金類別</h3>
                <form onSubmit={handleCreateCategory}>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">類別名稱 *</label>
                      <input
                        type="text"
                        required
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                        placeholder="例：客房收入、進貨支出"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label>
                      <select
                        value={categoryForm.type}
                        onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="收入">收入</option>
                        <option value="支出">支出</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">所屬館別</label>
                      <select
                        value={categoryForm.warehouse}
                        onChange={(e) => setCategoryForm({ ...categoryForm, warehouse: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">全部（通用）</option>
                        {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        會計科目
                        <a href="/accounting-subjects" className="text-xs text-blue-600 hover:underline ml-1">（管理科目）</a>
                      </label>
                      <select
                        value={categoryForm.accountingSubjectId}
                        onChange={(e) => setCategoryForm({ ...categoryForm, accountingSubjectId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">不指定</option>
                        {accountingSubjects.map(s => (
                          <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm">儲存</button>
                    <button type="button" onClick={() => setShowCategoryForm(false)} className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
                  </div>
                </form>
              </div>
            )}

            {/* Income categories */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-green-700">收入類別</h3>
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-green-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">名稱</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">會計科目</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">所屬館別</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">交易筆數</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                      {isLoggedIn && <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {categories.filter(c => c.type === '收入').map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">
                          {c.name}
                          {c.isSystemDefault && <span className="ml-1 text-xs text-gray-400">(系統)</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {c.accountingSubject ? (
                            <span className="text-blue-700 font-mono text-xs">{c.accountingSubject.code} {c.accountingSubject.name}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">未設定</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{c.warehouse || '通用'}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium">{c._count?.transactions || 0}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {c.isActive ? '啟用' : '停用'}
                          </span>
                        </td>
                        {isLoggedIn && (
                          <td className="px-4 py-3 text-center flex gap-2 justify-center">
                            <select
                              value={c.accountingSubjectId || ''}
                              onChange={(e) => {
                                fetch(`/api/cashflow/categories/${c.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ accountingSubjectId: e.target.value || null })
                                }).then(() => fetchCategories());
                              }}
                              className="text-xs border border-gray-300 rounded px-1 py-0.5"
                            >
                              <option value="">設定科目</option>
                              {accountingSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.code} {s.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleDeleteCategory(c.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {categories.filter(c => c.type === '收入').length === 0 && (
                      <tr><td colSpan={isLoggedIn ? 6 : 5} className="px-4 py-4 text-center text-gray-500">尚無收入類別</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expense categories */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-red-700">支出類別</h3>
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-red-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">名稱</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">會計科目</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">所屬館別</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">交易筆數</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                      {isLoggedIn && <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {categories.filter(c => c.type === '支出').map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">
                          {c.name}
                          {c.isSystemDefault && <span className="ml-1 text-xs text-gray-400">(系統)</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {c.accountingSubject ? (
                            <span className="text-blue-700 font-mono text-xs">{c.accountingSubject.code} {c.accountingSubject.name}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">未設定</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{c.warehouse || '通用'}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium">{c._count?.transactions || 0}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {c.isActive ? '啟用' : '停用'}
                          </span>
                        </td>
                        {isLoggedIn && (
                          <td className="px-4 py-3 text-center flex gap-2 justify-center">
                            <select
                              value={c.accountingSubjectId || ''}
                              onChange={(e) => {
                                fetch(`/api/cashflow/categories/${c.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ accountingSubjectId: e.target.value || null })
                                }).then(() => fetchCategories());
                              }}
                              className="text-xs border border-gray-300 rounded px-1 py-0.5"
                            >
                              <option value="">設定科目</option>
                              {accountingSubjects.map(s => (
                                <option key={s.id} value={s.id}>{s.code} {s.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleDeleteCategory(c.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {categories.filter(c => c.type === '支出').length === 0 && (
                      <tr><td colSpan={isLoggedIn ? 6 : 5} className="px-4 py-4 text-center text-gray-500">尚無支出類別</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== Tab 4: Cash Flow Report ==================== */}
        {activeTab === 'report' && (
          <div>
            {/* Report filters */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">起始日期 *</label>
                  <input
                    type="date"
                    value={reportFilter.startDate}
                    onChange={(e) => setReportFilter({ ...reportFilter, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">結束日期 *</label>
                  <input
                    type="date"
                    value={reportFilter.endDate}
                    onChange={(e) => setReportFilter({ ...reportFilter, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                  <select
                    value={reportFilter.warehouse}
                    onChange={(e) => setReportFilter({ ...reportFilter, warehouse: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全部</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={fetchReport}
                className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm"
              >
                產生報表
              </button>
            </div>

            {/* Report content */}
            {reportData && (
              <div>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
                    <div className="text-sm text-gray-500 mb-1">營業收入</div>
                    <div className="text-xl font-bold text-green-700">{formatMoney(reportData.totalIncome)}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
                    <div className="text-sm text-gray-500 mb-1">營業支出</div>
                    <div className="text-xl font-bold text-red-700">{formatMoney(reportData.totalExpense)}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-500">
                    <div className="text-sm text-gray-500 mb-1">手續費合計</div>
                    <div className="text-xl font-bold text-yellow-700">{formatMoney(reportData.totalFees)}</div>
                  </div>
                  <div className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${reportData.netCashFlow >= 0 ? 'border-emerald-500' : 'border-red-500'}`}>
                    <div className="text-sm text-gray-500 mb-1">淨現金流</div>
                    <div className={`text-xl font-bold ${reportData.netCashFlow >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {formatMoney(reportData.netCashFlow)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Income by category */}
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h4 className="text-md font-semibold mb-4 text-green-700">收入明細</h4>
                    {reportData.incomeByCategory.length > 0 ? (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left text-sm font-medium text-gray-700 pb-2">類別</th>
                            <th className="text-right text-sm font-medium text-gray-700 pb-2">金額</th>
                            <th className="text-right text-sm font-medium text-gray-700 pb-2">占比</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.incomeByCategory.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-100">
                              <td className="py-2 text-sm">{item.name}</td>
                              <td className="py-2 text-sm text-right font-medium">{formatMoney(item.amount)}</td>
                              <td className="py-2 text-sm text-right text-gray-500">
                                {reportData.totalIncome > 0 ? `${((item.amount / reportData.totalIncome) * 100).toFixed(1)}%` : '-'}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold bg-green-50">
                            <td className="py-2 text-sm">合計</td>
                            <td className="py-2 text-sm text-right">{formatMoney(reportData.totalIncome)}</td>
                            <td className="py-2 text-sm text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-sm text-gray-500">此期間無收入紀錄</div>
                    )}
                  </div>

                  {/* Expense by category */}
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h4 className="text-md font-semibold mb-4 text-red-700">支出明細</h4>
                    {reportData.expenseByCategory.length > 0 ? (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left text-sm font-medium text-gray-700 pb-2">類別</th>
                            <th className="text-right text-sm font-medium text-gray-700 pb-2">金額</th>
                            <th className="text-right text-sm font-medium text-gray-700 pb-2">占比</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.expenseByCategory.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-100">
                              <td className="py-2 text-sm">{item.name}</td>
                              <td className="py-2 text-sm text-right font-medium">{formatMoney(item.amount)}</td>
                              <td className="py-2 text-sm text-right text-gray-500">
                                {reportData.totalExpense > 0 ? `${((item.amount / reportData.totalExpense) * 100).toFixed(1)}%` : '-'}
                              </td>
                            </tr>
                          ))}
                          <tr className="font-semibold bg-red-50">
                            <td className="py-2 text-sm">合計</td>
                            <td className="py-2 text-sm text-right">{formatMoney(reportData.totalExpense)}</td>
                            <td className="py-2 text-sm text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-sm text-gray-500">此期間無支出紀錄</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 text-sm text-gray-500 text-right">
                  報表期間：{reportData.period?.startDate} ~ {reportData.period?.endDate} |
                  館別：{reportData.warehouse} |
                  交易筆數：{reportData.transactionCount}
                </div>
              </div>
            )}

            {!reportData && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                請選擇日期範圍後點擊「產生報表」
              </div>
            )}
          </div>
        )}

        {/* ==================== Tab 5: Fund Forecast ==================== */}
        {activeTab === 'forecast' && (
          <div>
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="flex gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                  <select
                    value={forecastWarehouse}
                    onChange={(e) => setForecastWarehouse(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">全部</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <button
                  onClick={fetchSummary}
                  className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm"
                >
                  更新預測
                </button>
              </div>
            </div>

            {summaryData && (
              <div>
                {/* Current status */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-emerald-500">
                    <div className="text-sm text-gray-500 mb-1">目前總餘額</div>
                    <div className="text-xl font-bold text-emerald-700">{formatMoney(summaryData.grandTotal)}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
                    <div className="text-sm text-gray-500 mb-1">近30日收入</div>
                    <div className="text-xl font-bold text-green-700">{formatMoney(summaryData.periodIncome)}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
                    <div className="text-sm text-gray-500 mb-1">近30日支出</div>
                    <div className="text-xl font-bold text-red-700">{formatMoney(summaryData.periodExpense)}</div>
                  </div>
                  <div className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${summaryData.avgDailyNet >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
                    <div className="text-sm text-gray-500 mb-1">日均淨流量</div>
                    <div className={`text-xl font-bold ${summaryData.avgDailyNet >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                      {formatMoney(summaryData.avgDailyNet)}
                    </div>
                  </div>
                </div>

                {/* Balance by type */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                  <h4 className="text-md font-semibold mb-4">各類帳戶餘額</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(summaryData.totalByType || {}).map(([type, amount]) => (
                      <div key={type} className="bg-gray-50 rounded-lg p-3">
                        <div className="text-sm text-gray-500">{type}</div>
                        <div className={`text-lg font-bold ${amount >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                          {formatMoney(amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Balance by warehouse */}
                {Object.keys(summaryData.totalByWarehouse || {}).length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h4 className="text-md font-semibold mb-4">各館別餘額</h4>
                    <div className="grid grid-cols-3 gap-4">
                      {Object.entries(summaryData.totalByWarehouse || {}).map(([wh, amount]) => (
                        <div key={wh} className="bg-gray-50 rounded-lg p-3">
                          <div className="text-sm text-gray-500">{wh}</div>
                          <div className={`text-lg font-bold ${amount >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                            {formatMoney(amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Forecast table */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h4 className="text-md font-semibold mb-4">未來30日資金水位預測</h4>
                  <p className="text-sm text-gray-500 mb-4">
                    基於過去30日平均淨流量（{formatMoney(summaryData.avgDailyNet)}/日）進行線性預測
                  </p>
                  <div className="overflow-hidden">
                    {/* Visual bar chart */}
                    <div className="space-y-1 mb-6">
                      {(summaryData.forecast || []).filter((_, i) => i % 3 === 0 || i === summaryData.forecast.length - 1).map((f, idx) => {
                        const maxVal = Math.max(...summaryData.forecast.map(ff => Math.abs(ff.projectedBalance)), 1);
                        const pct = Math.min(Math.abs(f.projectedBalance) / maxVal * 100, 100);
                        const isNeg = f.projectedBalance < 0;
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-24 text-right">{f.date}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                              <div
                                className={`h-5 rounded-full ${isNeg ? 'bg-red-400' : 'bg-emerald-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium w-32 text-right ${isNeg ? 'text-red-600' : 'text-gray-700'}`}>
                              {formatMoney(f.projectedBalance)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Forecast table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">日期</th>
                            <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">預估餘額</th>
                            <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {(summaryData.forecast || []).map((f, idx) => (
                            <tr key={idx} className={f.projectedBalance < 0 ? 'bg-red-50' : ''}>
                              <td className="px-4 py-2 text-sm">{f.date}</td>
                              <td className={`px-4 py-2 text-sm text-right font-semibold ${f.projectedBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                                {formatMoney(f.projectedBalance)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {f.projectedBalance < 0 ? (
                                  <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">資金不足</span>
                                ) : f.projectedBalance < summaryData.grandTotal * 0.3 ? (
                                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">偏低</span>
                                ) : (
                                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">正常</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!summaryData && (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                請點擊「更新預測」查看資金預測
              </div>
            )}
          </div>
        )}

        {/* === Cash Count Tab (spec26) === */}
        {activeTab === 'cash-count' && (
          <CashCountTab accounts={accounts.filter(a => a.type === '現金')} warehouses={warehouses} />
        )}
      </main>
    </div>
  );
}

// Cash Count Tab Component (spec26)
function CashCountTab({ accounts, warehouses }) {
  const [cashCounts, setCashCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [denominations, setDenominations] = useState([
    { denomination: 1000, quantity: 0 },
    { denomination: 500, quantity: 0 },
    { denomination: 200, quantity: 0 },
    { denomination: 100, quantity: 0 },
    { denomination: 50, quantity: 0 },
    { denomination: 10, quantity: 0 },
    { denomination: 5, quantity: 0 },
    { denomination: 1, quantity: 0 },
  ]);
  const [countNote, setCountNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ accountId: '', status: '' });

  useEffect(() => {
    fetchCashCounts();
  }, [filter]);

  async function fetchCashCounts() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.accountId) params.set('accountId', filter.accountId);
      if (filter.status) params.set('status', filter.status);
      const res = await fetch(`/api/cash-count?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCashCounts(data);
      }
    } catch (err) {
      console.error('取得現金盤點失敗:', err);
    }
    setLoading(false);
  }

  const actualBalance = denominations.reduce((sum, d) => sum + d.denomination * d.quantity, 0);
  const selectedAccountData = accounts.find(a => a.id === parseInt(selectedAccount));
  const systemBalance = selectedAccountData ? Number(selectedAccountData.currentBalance) : 0;
  const difference = systemBalance - actualBalance;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedAccount) return showToast('請選擇帳戶', 'error');
    setSaving(true);
    try {
      const res = await fetch('/api/cash-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: parseInt(selectedAccount),
          countDate,
          countedByUserId: 1,
          details: denominations.filter(d => d.quantity > 0).map(d => ({
            denomination: d.denomination,
            quantity: d.quantity,
          })),
          note: countNote,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setDenominations(denominations.map(d => ({ ...d, quantity: 0 })));
        setCountNote('');
        fetchCashCounts();
      } else {
        const err = await res.json();
        showToast(err.error?.message || '建立失敗', 'error');
      }
    } catch (err) {
      showToast('系統錯誤', 'error');
    }
    setSaving(false);
  }

  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    approved: 'bg-blue-100 text-blue-800',
    void: 'bg-red-100 text-red-800',
  };
  const statusLabels = {
    draft: '草稿', pending: '待覆核', confirmed: '已確認', approved: '已核准', void: '已作廢',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <select
            value={filter.accountId}
            onChange={e => setFilter(f => ({ ...f, accountId: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">全部帳戶</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select
            value={filter.status}
            onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">全部狀態</option>
            <option value="pending">待覆核</option>
            <option value="confirmed">已確認</option>
            <option value="approved">已核准</option>
          </select>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
        >
          {showForm ? '取消' : '+ 新增盤點'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <h4 className="font-semibold mb-4">新增現金盤點</h4>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">帳戶</label>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">選擇帳戶</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.warehouse})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">盤點日期</label>
              <input type="date" value={countDate} onChange={e => setCountDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">系統餘額</label>
              <div className="text-lg font-bold text-gray-800 mt-1">NT$ {systemBalance.toLocaleString()}</div>
            </div>
          </div>

          <div className="mb-4">
            <h5 className="text-sm font-medium text-gray-600 mb-2">面額清點</h5>
            <div className="grid grid-cols-4 gap-3">
              {denominations.map((d, idx) => (
                <div key={d.denomination} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-16 text-right">NT${d.denomination}</span>
                  <span className="text-gray-400">x</span>
                  <input
                    type="number"
                    min="0"
                    value={d.quantity}
                    onChange={e => {
                      const newDenoms = [...denominations];
                      newDenoms[idx].quantity = parseInt(e.target.value) || 0;
                      setDenominations(newDenoms);
                    }}
                    className="w-20 border rounded px-2 py-1 text-sm text-right"
                  />
                  <span className="text-xs text-gray-400">= {(d.denomination * d.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
            <div>
              <span className="text-sm text-gray-500">實際餘額</span>
              <div className="text-lg font-bold">NT$ {actualBalance.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-sm text-gray-500">差異</span>
              <div className={`text-lg font-bold ${difference === 0 ? 'text-green-600' : difference > 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                NT$ {difference.toLocaleString()} {difference > 0 ? '(短缺)' : difference < 0 ? '(溢餘)' : '(平帳)'}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">備註</label>
              <input type="text" value={countNote} onChange={e => setCountNote(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="盤點說明..." />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !selectedAccount} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm">
              {saving ? '儲存中...' : '確認盤點'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">載入中...</div>
      ) : cashCounts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">尚無盤點紀錄</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">盤點編號</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">日期</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">帳戶</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">系統餘額</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">實際餘額</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">差異</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {cashCounts.map(cc => (
                <tr key={cc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{cc.countNo}</td>
                  <td className="px-4 py-3">{cc.countDate}</td>
                  <td className="px-4 py-3">{cc.account?.name}</td>
                  <td className="px-4 py-3 text-right">{Number(cc.systemBalance).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{Number(cc.actualBalance).toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-medium ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                    {Number(cc.difference).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusColors[cc.status] || 'bg-gray-100'}`}>
                      {statusLabels[cc.status] || cc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
