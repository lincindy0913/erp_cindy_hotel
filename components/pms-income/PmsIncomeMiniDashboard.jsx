'use client';

import { useState, useEffect } from 'react';

const OTA_SOURCES = new Set(['OTA-Booking', 'OTA-Agoda', 'OTA-Expedia']);

function kfmt(n) {
  if (!n) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString('zh-TW');
}

export default function PmsIncomeMiniDashboard({ WAREHOUSES = [] }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warehouse, setWarehouse] = useState('');

  const month = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ take: '2000', month });
    if (warehouse) params.set('warehouse', warehouse);

    Promise.all([
      fetch(`/api/pms-income/reservations?${params}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/pms-income/reservations/deposit-summary?month=${month}${warehouse ? `&warehouse=${warehouse}` : ''}`).then(r => r.ok ? r.json() : null),
    ]).then(([rows, summary]) => {
      const revenue    = rows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
      const otaRevenue = rows.filter(r => OTA_SOURCES.has(r.sourceOverride || r.source))
                             .reduce((s, r) => s + (r.totalRevenue || 0), 0);
      const otaPct     = revenue > 0 ? Math.round(otaRevenue / revenue * 100) : 0;
      const ccPending  = rows.filter(r => r.creditCard > 0 && r.creditCardStatus !== '已核對').length;
      const outstanding = summary ? (summary.all.depositIn - summary.all.depositOut) : 0;
      setStats({ revenue, otaPct, ccPending, outstanding, count: rows.length });
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
          <KpiItem label="本月收入" value={kfmt(stats.revenue)} sub={`${stats.count} 筆`} />
          <KpiItem label="OTA 佔比" value={`${stats.otaPct}%`} accent={stats.otaPct > 60} />
          <KpiItem label="信用卡待核" value={stats.ccPending} accent={stats.ccPending > 0} warn />
          <KpiItem label="訂金餘額（全期）" value={kfmt(stats.outstanding)} />
        </>
      ) : null}
    </div>
  );
}

function KpiItem({ label, value, sub, warn, accent }) {
  return (
    <div className="flex flex-col min-w-[70px]">
      <span className="text-xs text-teal-300">{label}</span>
      <span className={`text-sm font-bold leading-tight ${warn && value > 0 ? 'text-amber-300' : accent ? 'text-teal-100' : 'text-white'}`}>
        {value}
        {sub && <span className="text-xs font-normal text-teal-300 ml-1">{sub}</span>}
      </span>
    </div>
  );
}
