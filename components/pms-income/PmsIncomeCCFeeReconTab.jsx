'use client';
import { useState, useEffect, useCallback } from 'react';

function fmt(n) {
  if (n == null || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}
function fmtPct(n) {
  if (n == null) return '-';
  return (Number(n) * 100).toFixed(2) + '%';
}

export default function PmsIncomeCCFeeReconTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [feeRate, setFeeRate] = useState('0.02');
  const [settleDate, setSettleDate] = useState('');
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (warehouse) params.set('warehouse', warehouse);
      if (month) params.set('month', month);
      const res = await fetch(`/api/pms-income/cc-fee-recon?${params}`);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [warehouse, month]);

  useEffect(() => { load(); }, [load]);

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  };

  const toggle = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const totalCC = rows.reduce((s, r) => s + r.creditCard, 0);
  const totalFee = rows.reduce((s, r) => s + (r.ccFeeAmount || 0), 0);
  const reconCount = rows.filter(r => r.creditCardStatus === '已核對').length;

  async function runRecon() {
    if (selectedIds.size === 0) { setMsg('請勾選要核對的訂單'); return; }
    const rate = parseFloat(feeRate);
    if (isNaN(rate) || rate <= 0 || rate > 0.1) { setMsg('手續費率請輸入合理值（例如 0.02 表示 2%）'); return; }
    if (!settleDate) { setMsg('請選擇結帳日期'); return; }
    setRunning(true);
    setMsg('');
    try {
      const res = await fetch('/api/pms-income/cc-fee-recon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse,
          date: settleDate,
          feeRate: rate,
          reservationIds: [...selectedIds],
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg(`完成核對 ${json.count} 筆`);
        load();
      } else {
        setMsg(json.message || '核對失敗');
      }
    } catch {
      setMsg('網路錯誤');
    } finally {
      setRunning(false);
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

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">信用卡收入合計</div>
          <div className="text-lg font-semibold">{totalCC.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">已提列手續費</div>
          <div className="text-lg font-semibold text-red-600">{totalFee.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">已核對筆數</div>
          <div className="text-lg font-semibold text-green-600">{reconCount} / {rows.length}</div>
        </div>
      </div>

      {/* Batch recon panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-600 mb-1">手續費率（小數）</label>
          <input type="number" step="0.001" min="0" max="0.1" className="border rounded px-2 py-1 text-sm w-24"
            value={feeRate} onChange={e => setFeeRate(e.target.value)} placeholder="0.02" />
          <span className="ml-1 text-xs text-gray-500">= {(parseFloat(feeRate || 0) * 100).toFixed(2)}%</span>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">結帳日期</label>
          <input type="date" className="border rounded px-2 py-1 text-sm" value={settleDate} onChange={e => setSettleDate(e.target.value)} />
        </div>
        <div className="text-xs text-gray-500">已勾選 {selectedIds.size} 筆</div>
        <button
          onClick={runRecon}
          disabled={running || selectedIds.size === 0}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? '核對中...' : '批次核對信用卡手續費'}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith('完成') ? 'text-green-600' : 'text-red-600'}`}>{msg}</span>}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400">本月無信用卡收入記錄</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2">
                  <input type="checkbox" checked={selectedIds.size === rows.length && rows.length > 0} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-right">信用卡</th>
                <th className="px-3 py-2 text-right">費率</th>
                <th className="px-3 py-2 text-right">手續費</th>
                <th className="px-3 py-2 text-right">淨額</th>
                <th className="px-3 py-2 text-center">狀態</th>
                <th className="px-3 py-2 text-left">結帳日</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-gray-50 ${selectedIds.has(r.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2">{r.businessDate}</td>
                  <td className="px-3 py-2">{r.guestName || '-'}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(r.creditCard)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmtPct(r.ccFeeRate)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(r.ccFeeAmount)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.ccNetAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.creditCardStatus === '已核對' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.creditCardStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.ccSettleDate || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
