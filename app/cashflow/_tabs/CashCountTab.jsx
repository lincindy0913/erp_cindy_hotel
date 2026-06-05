'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import FetchErrorBanner from '@/components/FetchErrorBanner';

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

export default function CashCountTab({ accounts, warehouses }) {
  const { showToast } = useToast();
  const [cashCounts, setCashCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countsError, setCountsError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [countDate, setCountDate] = useState(todayStr());
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
    setCountsError(null);
    try {
      const params = new URLSearchParams();
      if (filter.accountId) params.set('accountId', filter.accountId);
      if (filter.status) params.set('status', filter.status);
      const res = await fetch(`/api/cash-count?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCashCounts(data);
      } else {
        const body = await res.json().catch(() => ({}));
        setCountsError(body.error?.message || '取得現金盤點失敗');
      }
    } catch (err) {
      setCountsError('取得現金盤點失敗，請重新整理後再試。');
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
              <label htmlFor="f-33" className="block text-sm text-gray-600 mb-1">帳戶</label>
              <select id="f-33" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required>
                <option value="">選擇帳戶</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.warehouse})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-53" className="block text-sm text-gray-600 mb-1">盤點日期</label>
              <input id="f-53" type="date" value={countDate} onChange={e => setCountDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
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
              <label htmlFor="f-34" className="block text-sm text-gray-500 mb-1">備註</label>
              <input id="f-34" type="text" value={countNote} onChange={e => setCountNote(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="盤點說明..." />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !selectedAccount} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm">
              {saving ? '儲存中...' : '確認盤點'}
            </button>
          </div>
        </form>
      )}

      {countsError && <FetchErrorBanner message={countsError} onRetry={fetchCashCounts} />}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">載入中...</div>
      ) : cashCounts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">尚無盤點紀錄</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
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
