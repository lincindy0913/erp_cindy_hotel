'use client';

import { useState, useEffect, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const ACCOUNT_TYPES = ['現金', '銀行存款', '代墊款', '信用卡'];
const TX_TYPES = ['收入', '支出', '移轉'];
const TABS = [
  { key: 'overview', label: '帳戶總覽' },
  { key: 'transactions', label: '交易紀錄' },
  { key: 'categories', label: '類別管理' },
  { key: 'report', label: '現金流量表' },
  { key: 'forecast', label: '資金預測' }
];

export default function CashFlowPage() {
  const { data: session } = useSession();
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
  const [categoryForm, setCategoryForm] = useState({ name: '', type: '收入', warehouse: '' });

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
    accountId: ''
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
      fetchWarehouses()
    ]);
    setLoading(false);
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
      setWarehouses(Object.keys(data));
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
      alert('請填寫帳戶名稱和館別');
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
        alert(err.error || '建立失敗');
      }
    } catch { alert('建立帳戶失敗'); }
  }

  async function handleDeleteAccount(id) {
    if (!confirm('確定要刪除此帳戶嗎？')) return;
    try {
      const res = await fetch(`/api/cashflow/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAccounts();
      } else {
        const err = await res.json();
        alert(err.error || '刪除失敗');
      }
    } catch { alert('刪除帳戶失敗'); }
  }

  // ==================== Category CRUD ====================
  async function handleCreateCategory(e) {
    e.preventDefault();
    if (!categoryForm.name) {
      alert('請填寫類別名稱');
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
        setCategoryForm({ name: '', type: '收入', warehouse: '' });
        fetchCategories();
      } else {
        const err = await res.json();
        alert(err.error || '建立失敗');
      }
    } catch { alert('建立類別失敗'); }
  }

  async function handleDeleteCategory(id) {
    if (!confirm('確定要刪除此類別嗎？')) return;
    try {
      const res = await fetch(`/api/cashflow/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCategories();
      } else {
        const err = await res.json();
        alert(err.error || '刪除失敗');
      }
    } catch { alert('刪除類別失敗'); }
  }

  // ==================== Transaction CRUD ====================
  async function handleCreateTransaction(e) {
    e.preventDefault();
    if (!txForm.accountId || !txForm.amount || !txForm.transactionDate) {
      alert('請填寫帳戶、金額和日期');
      return;
    }
    if (txForm.type === '移轉' && !txForm.transferAccountId) {
      alert('移轉交易必須指定目的帳戶');
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
        alert(err.error || '建立失敗');
      }
    } catch { alert('建立交易失敗'); }
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
        alert(err.error || '刪除失敗');
      }
    } catch { alert('刪除交易失敗'); }
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">現金流管理</h2>

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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
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
                    {isLoggedIn && <th className="px-3 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={isLoggedIn ? 11 : 10} className="px-4 py-8 text-center text-gray-500">
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
                        <td className="px-3 py-2 text-sm">{tx.category?.name || '-'}</td>
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
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">所屬館別</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                      {isLoggedIn && <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {categories.filter(c => c.type === '收入').map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-sm">{c.warehouse || '通用'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {c.isActive ? '啟用' : '停用'}
                          </span>
                        </td>
                        {isLoggedIn && (
                          <td className="px-4 py-3 text-center">
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
                      <tr><td colSpan={isLoggedIn ? 4 : 3} className="px-4 py-4 text-center text-gray-500">尚無收入類別</td></tr>
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
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">所屬館別</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                      {isLoggedIn && <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {categories.filter(c => c.type === '支出').map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-sm">{c.warehouse || '通用'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {c.isActive ? '啟用' : '停用'}
                          </span>
                        </td>
                        {isLoggedIn && (
                          <td className="px-4 py-3 text-center">
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
                      <tr><td colSpan={isLoggedIn ? 4 : 3} className="px-4 py-4 text-center text-gray-500">尚無支出類別</td></tr>
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
      </main>
    </div>
  );
}
