'use client';
import { useState, useEffect, useCallback } from 'react';

const OTA_SOURCES = ['OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '代訂中心'];
const SOURCE_COLORS = {
  'OTA-Booking':  'bg-blue-100 text-blue-700',
  'OTA-Agoda':    'bg-red-100 text-red-700',
  'OTA-Expedia':  'bg-yellow-100 text-yellow-800',
  '代訂中心':     'bg-purple-100 text-purple-700',
};

function fmt(n) {
  if (n == null || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}

export default function PmsIncomeOtaCommissionTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [sourceFilter, setSourceFilter] = useState('全部');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '1000' });
      if (warehouse) params.set('warehouse', warehouse);
      if (month) params.set('month', month);
      const res = await fetch(`/api/pms-income/reservations?${params}`);
      if (res.ok) {
        const all = await res.json();
        setRows(all.filter(r => {
          const src = r.sourceOverride || r.source;
          return OTA_SOURCES.includes(src);
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse, month]);

  useEffect(() => { load(); }, [load]);

  const displayed = sourceFilter === '全部'
    ? rows
    : rows.filter(r => (r.sourceOverride || r.source) === sourceFilter);

  // Per-source aggregations
  const bySource = {};
  for (const r of rows) {
    const src = r.sourceOverride || r.source;
    if (!bySource[src]) bySource[src] = { count: 0, totalRevenue: 0, totalCommission: 0 };
    bySource[src].count++;
    bySource[src].totalRevenue += r.totalRevenue || 0;
    bySource[src].totalCommission += r.commission || 0;
  }

  const totalRevenue = rows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + (r.commission || 0), 0);
  const avgRate = totalRevenue > 0 ? totalCommission / totalRevenue : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
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
        <div>
          <label className="block text-xs text-gray-500 mb-1">來源</label>
          <select className="border rounded px-2 py-1 text-sm" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            {['全部', ...OTA_SOURCES].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'OTA/代訂 訂單數', value: `${rows.length} 筆`, color: '' },
          { label: '總住宿收入', value: totalRevenue.toLocaleString('zh-TW'), color: '' },
          { label: '佣金合計', value: totalCommission.toLocaleString('zh-TW'), color: 'text-red-600' },
          { label: '平均佣金率', value: (avgRate * 100).toFixed(2) + '%', color: '' },
        ].map(k => (
          <div key={k.label} className="bg-white border rounded-lg p-3">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className={`text-lg font-semibold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Per-source breakdown */}
      {Object.keys(bySource).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(bySource).map(([src, s]) => (
            <div key={src} className="bg-white border rounded-lg p-3">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-700'}`}>{src}</span>
              <div className="text-sm font-semibold">{s.count} 筆</div>
              <div className="text-xs text-gray-500">收入：{s.totalRevenue.toLocaleString('zh-TW')}</div>
              <div className="text-xs text-red-600">佣金：{s.totalCommission.toLocaleString('zh-TW')}</div>
              {s.totalRevenue > 0 && (
                <div className="text-xs text-gray-400">費率：{(s.totalCommission / s.totalRevenue * 100).toFixed(2)}%</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-8 text-gray-400">本月無 OTA / 代訂中心佣金資料。請先匯入含訂房序號的日營業報表。</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left">公司 / 折扣名稱</th>
                <th className="px-3 py-2 text-center">來源</th>
                <th className="px-3 py-2 text-right">住宿金額</th>
                <th className="px-3 py-2 text-right">佣金</th>
                <th className="px-3 py-2 text-right">佣金率</th>
                <th className="px-3 py-2 text-right">現金</th>
                <th className="px-3 py-2 text-right">信用卡</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map(r => {
                const src = r.sourceOverride || r.source;
                const commRate = r.totalRevenue > 0 && r.commission > 0
                  ? (r.commission / r.totalRevenue * 100).toFixed(2) + '%'
                  : '-';
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{r.businessDate}</td>
                    <td className="px-3 py-2 max-w-[100px] truncate" title={r.guestName}>{r.guestName || '-'}</td>
                    <td className="px-3 py-2 max-w-[150px] text-xs text-gray-500 truncate" title={r.companyName || r.discountName}>
                      {r.companyName || r.discountName || '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-600'}`}>{src}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{fmt(r.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right text-red-600 font-medium">{fmt(r.commission)}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">{commRate}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.cash)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.creditCard)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-gray-600">合計（{displayed.length} 筆）</td>
                <td className="px-3 py-2 text-right">{displayed.reduce((s, r) => s + (r.totalRevenue || 0), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right text-red-600">{displayed.reduce((s, r) => s + (r.commission || 0), 0).toLocaleString('zh-TW')}</td>
                <td />
                <td className="px-3 py-2 text-right">{displayed.reduce((s, r) => s + (r.cash || 0), 0).toLocaleString('zh-TW')}</td>
                <td className="px-3 py-2 text-right">{displayed.reduce((s, r) => s + (r.creditCard || 0), 0).toLocaleString('zh-TW')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
