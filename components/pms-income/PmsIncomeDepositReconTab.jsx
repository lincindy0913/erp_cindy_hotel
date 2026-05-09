'use client';
import { useState, useEffect, useCallback } from 'react';

function fmt(n) {
  if (n == null || n === '' || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}

export default function PmsIncomeDepositReconTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '500' });
      if (warehouse) params.set('warehouse', warehouse);
      if (month) params.set('month', month);
      // show rows where depositIn > 0 or depositOut > 0
      const res = await fetch(`/api/pms-income/reservations?${params}`);
      if (res.ok) {
        const all = await res.json();
        setRows(all.filter(r => r.depositIn > 0 || r.depositOut > 0));
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse, month]);

  useEffect(() => { load(); }, [load]);

  const totalIn = rows.reduce((s, r) => s + (r.depositIn || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.depositOut || 0), 0);
  const net = totalIn - totalOut;

  async function setStatus(id, depositStatus) {
    const res = await fetch(`/api/pms-income/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded px-2 py-1 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <input type="month" className="border rounded px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">收訂金合計</div>
          <div className="text-lg font-semibold text-green-600">{totalIn.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">沖訂金合計</div>
          <div className="text-lg font-semibold text-red-600">{totalOut.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">預收款淨額</div>
          <div className={`text-lg font-semibold ${net >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{net.toLocaleString('zh-TW')}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400">本月無訂金記錄</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left">公司</th>
                <th className="px-3 py-2 text-right">收訂金</th>
                <th className="px-3 py-2 text-right">沖訂金</th>
                <th className="px-3 py-2 text-right">淨額</th>
                <th className="px-3 py-2 text-center">狀態</th>
                <th className="px-3 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => {
                const netAmt = (r.depositIn || 0) - (r.depositOut || 0);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{r.businessDate}</td>
                    <td className="px-3 py-2">{r.guestName || '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.companyName || '-'}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt(r.depositIn)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(r.depositOut)}</td>
                    <td className="px-3 py-2 text-right font-medium">{netAmt !== 0 ? netAmt.toLocaleString('zh-TW') : '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        r.depositStatus === '已核對' ? 'bg-green-100 text-green-700' :
                        r.depositStatus === '差異' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {r.depositStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.depositStatus !== '已核對' ? (
                        <button
                          onClick={() => setStatus(r.id, '已核對')}
                          className="text-xs text-green-600 hover:underline"
                        >
                          確認核對
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(r.id, '待確認')}
                          className="text-xs text-gray-400 hover:underline"
                        >
                          取消確認
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
