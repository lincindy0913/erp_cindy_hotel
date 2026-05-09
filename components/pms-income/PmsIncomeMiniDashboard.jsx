'use client';

import { useState, useEffect } from 'react';

const OTA_SOURCES = new Set(['OTA-Booking', 'OTA-Agoda', 'OTA-Expedia']);

function kfmt(n) {
  if (!n) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString('zh-TW');
}

function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export default function PmsIncomeMiniDashboard({ WAREHOUSES = [] }) {
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [warehouse, setWarehouse] = useState('');

  const month = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ take: '2000', month });
    if (warehouse) params.set('warehouse', warehouse);

    const prevMon = prevMonth(month);

    Promise.all([
      fetch(`/api/pms-income/reservations?${params}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/pms-income/reservations/deposit-summary?month=${month}${warehouse ? `&warehouse=${encodeURIComponent(warehouse)}` : ''}`).then(r => r.ok ? r.json() : null),
      // Previous month revenue for MoM
      fetch(`/api/pms-income/reservations?take=2000&month=${prevMon}${warehouse ? `&warehouse=${encodeURIComponent(warehouse)}` : ''}`).then(r => r.ok ? r.json() : []),
      // Vendor billing overdue
      fetch(`/api/pms-income/vendor-billing?${warehouse ? `warehouse=${encodeURIComponent(warehouse)}` : ''}`).then(r => r.ok ? r.json() : []),
    ]).then(([rows, summary, prevRows, billings]) => {
      const today   = new Date().toISOString().slice(0, 10);
      const revenue = rows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
      const prevRev = prevRows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
      const momPct  = prevRev > 0 ? Math.round((revenue - prevRev) / prevRev * 100) : null;

      const otaRevenue = rows
        .filter(r => OTA_SOURCES.has(r.sourceOverride || r.source))
        .reduce((s, r) => s + (r.totalRevenue || 0), 0);
      const otaPct  = revenue > 0 ? Math.round(otaRevenue / revenue * 100) : 0;
      const ccPending = rows.filter(r => r.creditCard > 0 && r.creditCardStatus !== '已核對').length;
      const outstanding = summary ? (summary.all.depositIn - summary.all.depositOut) : 0;

      const overdueCount = billings.filter(b =>
        b.status !== '已結帳' && b.dueDate && b.dueDate < today
      ).length;

      setStats({ revenue, prevRev, momPct, otaPct, ccPending, outstanding, overdueCount, count: rows.length });
    }).finally(() => setLoading(false));
  }, [warehouse, month]);

  return (
    <div className="mb-4 bg-teal-700 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-white shadow">
      <div className="flex items-center gap-2">
        <span className="text-xs text-teal-200 whitespace-nowrap">{month} 概況</span>
        {WAREHOUSES.length > 1 && (
          <select
            value={warehouse}
            onChange={e => setWarehouse(e.target.value)}
            className="text-xs bg-teal-600 border border-teal-500 rounded px-1.5 py-0.5 text-white"
          >
            <option value="">全館</option>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        )}
      </div>
      {loading ? (
        <span className="text-xs text-teal-300">載入中…</span>
      ) : stats ? (
        <>
          <KpiItem
            label="本月收入"
            value={kfmt(stats.revenue)}
            sub={stats.momPct !== null
              ? `vs 上月 ${stats.momPct >= 0 ? '+' : ''}${stats.momPct}%`
              : `${stats.count} 筆`}
            accentSub={stats.momPct !== null && stats.momPct < 0}
          />
          <KpiItem label="OTA 佔比" value={`${stats.otaPct}%`} />
          <KpiItem label="信用卡待核" value={stats.ccPending} warn={stats.ccPending > 0} />
          <KpiItem label="訂金餘額（全期）" value={kfmt(stats.outstanding)} />
          {stats.overdueCount > 0 && (
            <KpiItem label="廠商帳款逾期" value={`${stats.overdueCount} 筆`} warn />
          )}
        </>
      ) : null}
    </div>
  );
}

function KpiItem({ label, value, sub, warn, accentSub }) {
  return (
    <div className="flex flex-col min-w-[70px]">
      <span className="text-xs text-teal-300">{label}</span>
      <span className={`text-sm font-bold leading-tight ${warn ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </span>
      {sub && (
        <span className={`text-xs leading-tight ${accentSub ? 'text-red-300' : 'text-teal-300'}`}>
          {sub}
        </span>
      )}
    </div>
  );
}
