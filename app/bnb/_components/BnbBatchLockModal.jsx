'use client';

import { useState } from 'react';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

export default function BnbBatchLockModal({ warehouseList, onClose, showToast }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [selectedWh, setSelectedWh] = useState(new Set(warehouseList));
  const [selectedMonths, setSelectedMonths] = useState(new Set(MONTHS));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // [{ month, warehouse, ok, msg }]

  function toggleWh(w) {
    setSelectedWh(prev => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  }
  function toggleMonth(m) {
    setSelectedMonths(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  }

  async function runBatchLock() {
    if (selectedWh.size === 0 || selectedMonths.size === 0) {
      showToast('請至少選擇一個館別和月份', 'error'); return;
    }
    const targets = [];
    for (const m of [...selectedMonths].sort()) {
      for (const w of [...selectedWh]) {
        targets.push({ month: `${year}-${m}`, warehouse: w });
      }
    }
    if (!window.confirm(`確定要批次鎖帳 ${targets.length} 個月份？此操作無法一鍵還原。`)) return;

    setRunning(true);
    setResults(null);
    const res = [];
    for (const { month, warehouse } of targets) {
      try {
        const r = await fetch('/api/bnb/lock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, warehouse, reason: `批次鎖帳 ${year} 年` }),
        });
        const data = await r.json().catch(() => ({}));
        res.push({ month, warehouse, ok: r.ok, msg: r.ok ? '已鎖' : (data.error || '失敗') });
      } catch (e) {
        res.push({ month, warehouse, ok: false, msg: e.message });
      }
    }
    setResults(res);
    setRunning(false);
    const failed = res.filter(r => !r.ok).length;
    showToast(failed === 0 ? `全部 ${res.length} 個月份鎖帳完成` : `${res.length - failed} 成功，${failed} 失敗`, failed === 0 ? 'success' : 'error');
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">批次鎖帳</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {!results ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年度</label>
              <select value={year} onChange={e => setYear(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-32">
                {[0, 1, 2].map(d => {
                  const y = String(now.getFullYear() - d);
                  return <option key={y} value={y}>{y} 年</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
              <div className="flex flex-wrap gap-2">
                {warehouseList.map(w => (
                  <label key={w} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input type="checkbox" checked={selectedWh.has(w)} onChange={() => toggleWh(w)} className="rounded" />
                    {w}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">月份</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedMonths(new Set(MONTHS))}
                    className="text-xs text-indigo-600 hover:underline">全選</button>
                  <button type="button" onClick={() => setSelectedMonths(new Set())}
                    className="text-xs text-gray-500 hover:underline">清除</button>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {MONTHS.map(m => (
                  <label key={m} className={`flex items-center justify-center gap-1 cursor-pointer text-xs border rounded py-1.5 transition-colors ${selectedMonths.has(m) ? 'bg-indigo-100 border-indigo-400 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={selectedMonths.has(m)} onChange={() => toggleMonth(m)} className="sr-only" />
                    {parseInt(m)} 月
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-xs text-gray-500">
                共 {selectedMonths.size} 個月 × {selectedWh.size} 個館別 = {selectedMonths.size * selectedWh.size} 次鎖帳
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
                <button onClick={runBatchLock} disabled={running}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {running ? '鎖帳中…' : '開始批次鎖帳'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-700 mb-3">
              完成：{results.filter(r => r.ok).length} 成功 / {results.filter(r => !r.ok).length} 失敗
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1 text-xs">
              {results.map((r, i) => (
                <div key={i} className={`flex justify-between px-2 py-1 rounded ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <span>{r.month} {r.warehouse}</span>
                  <span>{r.msg}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900">關閉</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
