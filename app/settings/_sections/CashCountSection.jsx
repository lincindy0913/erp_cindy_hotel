'use client';

import { useState, useEffect } from 'react';

export default function CashCountSection({ showToast }) {
  const [ccAccounts, setCcAccounts] = useState([]);
  const [ccConfigs, setCcConfigs] = useState([]);
  const [ccLoading, setCcLoading] = useState(true);

  useEffect(() => {
    fetchCcData();
  }, []);

  async function fetchCcData() {
    setCcLoading(true);
    try {
      const [accRes, confRes] = await Promise.all([
        fetch('/api/cashflow/accounts'),
        fetch('/api/cash-count/config'),
      ]);
      if (accRes.ok) {
        const data = await accRes.json();
        const accountList = data.data || data || [];
        setCcAccounts(accountList.filter(acc => acc.type === '現金'));
      }
      if (confRes.ok) {
        const data = await confRes.json();
        setCcConfigs(Array.isArray(data) ? data : data.data || []);
      }
    } catch { /* ignore */ }
    setCcLoading(false);
  }

  async function saveConfig(accountId, field, value) {
    try {
      const res = await fetch('/api/cash-count/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, [field]: value }),
      });
      if (res.ok) {
        await fetchCcData();
        showToast('盤點設定已更新');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((typeof data?.error === 'string' ? data.error : data?.error?.message) || '更新失敗', 'error');
      }
    } catch {
      showToast('更新失敗', 'error');
    }
  }

  if (ccLoading) return <div className="text-center py-8 text-gray-500">載入盤點設定中...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-2">盤點頻率與容差設定</h3>
        <p className="text-sm text-gray-500 mb-4">設定各現金帳戶的盤點頻率與允許差異金額</p>
        {ccAccounts.length === 0 ? (
          <div className="text-center py-8 text-gray-400">尚無現金帳戶，請先至現金流管理建立帳戶</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">帳戶</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">館別</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">盤點頻率</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">容差金額</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">需雙人覆核</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ccAccounts.map(acc => {
                const conf = ccConfigs.find(c => c.accountId === acc.id) || {};
                return (
                  <tr key={acc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{acc.name}</td>
                    <td className="px-4 py-3 text-gray-500">{acc.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <select value={conf.countFrequency || 'daily'} onChange={e => saveConfig(acc.id, 'countFrequency', e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="daily">每日</option>
                        <option value="weekly">每週</option>
                        <option value="monthly">每月</option>
                        <option value="on_demand">按需</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input type="number" defaultValue={conf.shortageThreshold || 5000} onBlur={e => saveConfig(acc.id, 'shortageThreshold', Number(e.target.value))} className="w-24 px-2 py-1 border rounded text-xs text-center" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" checked={conf.requireDualReview !== false} onChange={e => saveConfig(acc.id, 'requireDualReview', e.target.checked)} className="rounded" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">提示：盤點作業入口在「現金流管理 → 現金盤點」頁籤中執行</p>
      </div>
    </div>
  );
}
