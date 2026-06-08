'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const CHIPS = [
  { key: 'ccPending',        label: (n) => `信用卡未核對 ${n} 筆`,        tab: 'creditCardStatement', color: () => 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200' },
  {
    key: 'depositPending',
    label: (n, d) => `訂金待入帳 ${n} 筆${d?.depositOldestDays > 7 ? `（最舊 ${d.depositOldestDays} 天）` : ''}`,
    tab: 'depositRecon',
    color: (n, d) => d?.depositOldestDays > 7
      ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300'
      : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200',
  },
  { key: 'depositOverdue',   label: (n) => `訂金逾期 ${n} 筆`,              tab: 'depositRecon',        color: () => 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200' },
  { key: 'noInvoice',        label: (n) => `退房逾3天未開發票 ${n} 筆`,     tab: 'invoiceQuery',        color: () => 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200' },
  { key: 'otaUnrecon',       label: (n) => `OTA佣金未記錄 ${n} 筆`,         tab: 'otaCommission',       color: () => 'bg-sky-100 text-sky-700 hover:bg-sky-200 border-sky-200' },
  { key: 'otaBillingUnrecon',label: (n, d) => `OTA傭金帳單未對帳 ${n} 個來源（${d?.otaBillingMonth || '上月'}）`, tab: 'otaCommission', color: () => 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200 border-cyan-300' },
  { key: 'checksDueSoon',    label: (n) => `支票 7 天內到期 ${n} 張`,        tab: null,                  color: () => 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300', href: '/checks' },
  { key: 'apPending',        label: (n) => `廠商應付未結 ${n} 筆`,          tab: 'vendorBilling',       color: () => 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' },
  { key: 'apOverdue',        label: (n) => `應付帳款逾期 ${n} 筆`,          tab: null,                  color: () => 'bg-rose-100 text-rose-700 hover:bg-rose-200 border-rose-300', expandable: true },
];

export default function PmsIncomeDailyTodoBar({ WAREHOUSES = [], setActiveTab }) {
  const [warehouse, setWarehouse]       = useState('');
  const [data,      setData]            = useState(null);
  const [expandedKey, setExpandedKey]   = useState(null);

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

  function handleChipClick(c) {
    if (c.expandable) {
      setExpandedKey(prev => prev === c.key ? null : c.key);
      return;
    }
    if (c.tab) setActiveTab(c.tab);
  }

  return (
    <div className={`mb-4 rounded-lg border text-xs ${allClear ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
        {allClear ? (
          <span className="text-green-600 font-semibold">✓ {data.yearMonth} 本月所有項目已處理完成</span>
        ) : (
          <>
            <span className="font-semibold text-amber-800 shrink-0">⚠ {data.yearMonth} 待辦</span>
            {activeChips.map(c => {
              const cls = `px-2.5 py-1 rounded-full border font-medium transition-colors cursor-pointer ${typeof c.color === 'function' ? c.color(data[c.key], data) : c.color}`;
              if (c.href) {
                return (
                  <Link key={c.key} href={c.href} className={cls}>
                    {c.label(data[c.key], data)}
                  </Link>
                );
              }
              return (
                <button key={c.key} onClick={() => handleChipClick(c)} className={cls}>
                  {c.label(data[c.key], data)}
                  {c.expandable && <span className="ml-1">{expandedKey === c.key ? '▲' : '▼'}</span>}
                </button>
              );
            })}
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

      {/* 逾期應付帳款展開詳情 */}
      {expandedKey === 'apOverdue' && data.apOverdueDetail?.length > 0 && (
        <div className="border-t border-rose-200 px-4 py-2 bg-rose-50/60">
          <p className="text-xs font-semibold text-rose-800 mb-1.5">逾期應付帳款明細</p>
          <div className="space-y-1">
            {data.apOverdueDetail.map((o, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-rose-700 font-medium">{o.supplierName}</span>
                <div className="flex gap-3 text-gray-600">
                  <span>NT$ {o.amount.toLocaleString('zh-TW')}</span>
                  <span className="text-rose-600 font-medium">逾期 {o.daysOverdue} 天</span>
                </div>
              </div>
            ))}
          </div>
          <Link href="/cashier?tab=pending" className="mt-2 inline-block text-xs text-rose-600 hover:underline">
            前往出納處理 →
          </Link>
        </div>
      )}
    </div>
  );
}
