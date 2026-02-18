'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

const ACCOUNT_TYPES = ['現金', '銀行存款', '代墊款', '信用卡'];

export default function FundManagementPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState('');
  const [formData, setFormData] = useState({
    accountCode: '',
    type: '銀行存款',
    name: '',
    warehouse: '',
    openingBalance: '',
    note: ''
  });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    fetchAccounts();
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      const data = await res.json();
      if (Array.isArray(data)) {
        setWarehouses(data.map(w => w.name));
      }
    } catch (err) {
      console.error('Failed to fetch warehouses:', err);
    }
  }

  // 自動生成帳戶序號
  function generateAccountCode(type) {
    const prefix = type === '現金' ? 'P' : type === '銀行存款' ? 'B' : type === '信用卡' ? 'D' : 'E';
    const existing = accounts
      .filter(a => a.accountCode && a.accountCode.startsWith(prefix))
      .map(a => parseInt(a.accountCode.slice(1)) || 0);
    const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }

  // 當類型變更時自動更新序號
  function handleTypeChange(newType) {
    const code = generateAccountCode(newType);
    setFormData(prev => ({ ...prev, type: newType, accountCode: code }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/cashflow/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '新增失敗');
        return;
      }
      setSuccessMsg('新增成功');
      setFormData({ accountCode: '', type: '銀行存款', name: '', warehouse: '', openingBalance: '', note: '' });
      setShowAddForm(false);
      fetchAccounts();
    } catch (err) {
      setError('新增失敗');
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`確定要刪除帳戶「${name}」嗎？\n注意：如果有關聯的交易紀錄將無法刪除。`)) return;
    try {
      const res = await fetch(`/api/cashflow/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg('刪除成功');
        fetchAccounts();
      } else {
        const data = await res.json();
        alert(data.error || '刪除失敗，可能有關聯的交易紀錄');
      }
    } catch (err) {
      alert('刪除失敗');
    }
  }

  // 取得不重複的類型
  const types = [...new Set(accounts.map(a => a.type))];

  // 篩選
  const filtered = accounts.filter(a => {
    const matchSearch = !searchKeyword ||
      (a.accountCode && a.accountCode.includes(searchKeyword)) ||
      a.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      (a.warehouse && a.warehouse.includes(searchKeyword));
    const matchType = !filterType || a.type === filterType;
    return matchSearch && matchType;
  });

  // 依類型分組
  const grouped = {};
  filtered.forEach(a => {
    if (!grouped[a.type]) grouped[a.type] = [];
    grouped[a.type].push(a);
  });

  // 類型色彩
  function getTypeColor(type) {
    const colors = {
      '現金': 'bg-green-100 text-green-800',
      '銀行存款': 'bg-blue-100 text-blue-800',
      '信用卡': 'bg-purple-100 text-purple-800',
      '代墊款': 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-emerald-500" />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">資金帳戶管理</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              共 {accounts.length} 個帳戶
            </span>
            {isLoggedIn && (
              <button
                onClick={() => {
                  if (!showAddForm) {
                    const code = generateAccountCode(formData.type);
                    setFormData(prev => ({ ...prev, accountCode: code }));
                  }
                  setShowAddForm(!showAddForm);
                }}
                className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
              >
                {showAddForm ? '取消' : '＋ 新增帳戶'}
              </button>
            )}
          </div>
        </div>

        {/* 成功訊息 */}
        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
            {successMsg}
          </div>
        )}

        {/* 新增表單 */}
        {showAddForm && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">新增資金帳戶</h3>
            {error && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">帳戶序號</label>
                <input
                  type="text"
                  value={formData.accountCode}
                  onChange={(e) => setFormData(prev => ({ ...prev, accountCode: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50"
                  placeholder="自動產生"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分類 *</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                >
                  {ACCOUNT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">帳戶名稱 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="例：土格(總)"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                <select
                  value={formData.warehouse}
                  onChange={(e) => setFormData(prev => ({ ...prev, warehouse: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">未指定</option>
                  {warehouses.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">期初餘額</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.openingBalance}
                  onChange={(e) => setFormData(prev => ({ ...prev, openingBalance: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.note}
                    onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    placeholder="選填"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
                  >
                    新增
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* 搜尋與篩選 */}
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜尋序號、名稱或館別..."
            className="px-3 py-2 border rounded-lg text-sm w-64"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">全部分類</option>
            {ACCOUNT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* 表格 */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {accounts.length === 0 ? '尚無帳戶資料' : '無符合條件的資料'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-50 border-b border-emerald-100">
                    <th className="text-left px-4 py-3 font-semibold text-emerald-800 w-28">帳戶序號</th>
                    <th className="text-left px-4 py-3 font-semibold text-emerald-800 w-28">分類</th>
                    <th className="text-left px-4 py-3 font-semibold text-emerald-800">帳戶名稱</th>
                    <th className="text-left px-4 py-3 font-semibold text-emerald-800 w-24">館別</th>
                    <th className="text-right px-4 py-3 font-semibold text-emerald-800 w-32">期初餘額</th>
                    <th className="text-right px-4 py-3 font-semibold text-emerald-800 w-32">目前餘額</th>
                    <th className="text-left px-4 py-3 font-semibold text-emerald-800">備註</th>
                    {isLoggedIn && (
                      <th className="text-center px-4 py-3 font-semibold text-emerald-800 w-20">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([type, items]) => (
                    items.map((account, idx) => (
                      <tr
                        key={account.id}
                        className={`border-b border-gray-100 hover:bg-emerald-50/30 transition-colors ${
                          idx === 0 ? 'border-t-2 border-t-emerald-100' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-emerald-700 font-medium">
                          {account.accountCode || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(account.type)}`}>
                            {account.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-800 font-medium">{account.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{account.warehouse || '-'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">
                          {Number(account.openingBalance).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium">
                          <span className={Number(account.currentBalance) >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                            {Number(account.currentBalance).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{account.note || ''}</td>
                        {isLoggedIn && (
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => handleDelete(account.id, account.name)}
                              className="text-red-500 hover:text-red-700 text-xs hover:underline"
                            >
                              刪除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
