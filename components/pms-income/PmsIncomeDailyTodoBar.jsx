'use client';

import { useState, useEffect } from 'react';

const CHIPS = [
  { key: 'ccPending',      label: (n, d) => `信用卡未核對 ${n} 筆`, tab: 'creditCardStatement', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200' },
  {
    key: 'depositPending',
    label: (n, d) => `訂金待入帳 ${n} 筆${d?.depositOldestDays > 7 ? `（最舊 ${d.depositOldestDays} 天）` : ''}`,
    tab: 'depositRecon',
    color: (n, d) => d?.depositOldestDays > 7
      ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300'
      : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200',
  },
  { key: 'depositOverdue', label: (n, d) => `訂金逾期 ${n} 筆`,     tab: 'depositRecon',        color: () => 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200' },
  { key: 'noInvoice',      label: (n, d) => `退房逾3天未開發票 ${n} 筆`, tab: 'invoiceQuery',    color: () => 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200' },
  { key: 'apPending',      label: (n, d) => `廠商應付未結 ${n} 筆`, tab: 'vendorBilling',       color: () => 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' },
];

export default function PmsIncomeDailyTodoBar({ WAREHOUSES = [], setActiveTab }) {
  const [warehouse, setWarehouse] = useState('');
  const [data,      setData]      = useState(null);

  useEffect(() => {
    setWarehouse(prev => prev || WAREHOUSES[0] || '');
  }, [WAREHOUSES]);

  useEffect(() => {
    if (!warehouse) return;
    fetch(`/api/pms-income/daily-todo?warehouse=${encodeURIComponent(warehouse)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {});
  }, [warehouse]);

  if (!data) return null;

  const activeChips = CHIPS.filter(c => (data[c.key] || 0) > 0);
  const allClear    = activeChips.length === 0;

  return (
    <div className={`mb-4 px-4 py-2.5 rounded-lg border flex flex-wrap items-center gap-2 text-xs
      ${allClear
        ? 'bg-green-50 border-green-200'
        : 'bg-amber-50 border-amber-200'}`}>

      {allClear ? (
        <>
          <span className="text-green-600 font-semibold">✓ {data.yearMonth} 本月所有項目已處理完成</span>
        </>
      ) : (
        <>
          <span className="font-semibold text-amber-800 shrink-0">⚠ {data.yearMonth} 待辦</span>
          {activeChips.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveTab(c.tab)}
              className={`px-2.5 py-1 rounded-full border font-medium transition-colors cursor-pointer ${typeof c.color === 'function' ? c.color(data[c.key], data) : c.color}`}
            >
              {c.label(data[c.key], data)}
            </button>
          ))}
        </>
      )}

      <div className="ml-auto shrink-0">
        <select
          value={warehouse}
          onChange={e => setWarehouse(e.target.value)}
          className="text-xs border rounded px-2 py-0.5 text-gray-600 bg-white"
        >
          {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>
    </div>
  );
}
