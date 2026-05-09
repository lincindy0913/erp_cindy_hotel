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
  const [summary, setSummary] = useState(null); // from deposit-summary API
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('全部');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rowsRes, sumRes] = await Promise.all([
        fetch(`/api/pms-income/reservations?take=1000${warehouse ? `&warehouse=${warehouse}` : ''}&month=${month}`),
        fetch(`/api/pms-income/reservations/deposit-summary?month=${month}${warehouse ? `&warehouse=${warehouse}` : ''}`),
      ]);
      if (rowsRes.ok) {
        const all = await rowsRes.json();
        setRows(all.filter(r => r.depositIn > 0 || r.depositOut > 0));
      }
      if (sumRes.ok) setSummary(await sumRes.json());
    } finally {
      setLoading(false);
    }
  }, [warehouse, month]);

  useEffect(() => { load(); }, [load]);

  // Monthly stats from rows
  const totalIn  = rows.reduce((s, r) => s + (r.depositIn  || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.depositOut || 0), 0);
  const monthNet = totalIn - totalOut;

  // Status breakdown — from summary API if available, else from rows
  const byStatus = { '已核對': { in: 0, out: 0, count: 0 }, '待確認': { in: 0, out: 0, count: 0 }, '差異': { in: 0, out: 0, count: 0 } };
  if (summary?.byStatus) {
    for (const s of summary.byStatus) {
      const key = s.status === '已核對' ? '已核對' : s.status === '差異' ? '差異' : '待確認';
      byStatus[key].in    += s.depositIn;
      byStatus[key].out   += s.depositOut;
      byStatus[key].count += s.count;
    }
  } else {
    for (const r of rows) {
      const key = r.depositStatus === '已核對' ? '已核對' : r.depositStatus === '差異' ? '差異' : '待確認';
      byStatus[key].in  += r.depositIn  || 0;
      byStatus[key].out += r.depositOut || 0;
      byStatus[key].count++;
    }
  }

  // Cumulative outstanding from summary API (server-side aggregation)
  const cumulativeIn  = summary?.all?.depositIn  ?? rows.reduce((s, r) => s + (r.depositIn  || 0), 0);
  const cumulativeOut = summary?.all?.depositOut ?? rows.reduce((s, r) => s + (r.depositOut || 0), 0);
  const outstanding   = cumulativeIn - cumulativeOut;

  // Filter displayed rows
  const displayed = statusFilter === '全部' ? rows : rows.filter(r => {
    if (statusFilter === '待確認') return r.depositStatus !== '已核對' && r.depositStatus !== '差異';
    return r.depositStatus === statusFilter;
  });

  async function setStatus(id, depositStatus) {
    const res = await fetch(`/api/pms-income/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
      // Refresh summary
      fetch(`/api/pms-income/reservations/deposit-summary?month=${month}${warehouse ? `&warehouse=${warehouse}` : ''}`)
        .then(r => r.ok ? r.json() : null).then(s => { if (s) setSummary(s); });
    }
  }

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
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
      </div>

      {/* Monthly KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">本月收訂金</div>
          <div className="text-lg font-semibold text-green-600">{totalIn.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">本月沖訂金</div>
          <div className="text-lg font-semibold text-red-600">{totalOut.toLocaleString('zh-TW')}</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">本月淨增減</div>
          <div className={`text-lg font-semibold ${monthNet >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {monthNet >= 0 ? '+' : ''}{monthNet.toLocaleString('zh-TW')}
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-xs text-amber-700">累計預收款餘額（全期）</div>
          <div className={`text-lg font-semibold ${outstanding >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
            {outstanding.toLocaleString('zh-TW')}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">收 {cumulativeIn.toLocaleString('zh-TW')} − 沖 {cumulativeOut.toLocaleString('zh-TW')}</div>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: '已核對', label: '已核對', color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { key: '待確認', label: '待確認 / 其他', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' },
          { key: '差異', label: '差異', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(prev => prev === s.key ? '全部' : s.key)}
            className={`border rounded-lg p-3 text-left transition-all ${s.bg} ${statusFilter === s.key ? 'ring-2 ring-blue-400' : ''}`}
          >
            <div className={`text-xs font-medium ${s.color}`}>{s.label}</div>
            <div className="text-sm font-bold mt-1">{byStatus[s.key]?.count || 0} 筆</div>
            <div className="text-xs text-gray-500">
              收 {(byStatus[s.key]?.in || 0).toLocaleString('zh-TW')}　沖 {(byStatus[s.key]?.out || 0).toLocaleString('zh-TW')}
            </div>
          </button>
        ))}
      </div>
      {statusFilter !== '全部' && (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <span>篩選中：{statusFilter}</span>
          <button onClick={() => setStatusFilter('全部')} className="underline">清除篩選</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-8 text-gray-400">本月無訂金記錄</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left hidden sm:table-cell">公司</th>
                <th className="px-3 py-2 text-right">收訂金</th>
                <th className="px-3 py-2 text-right">沖訂金</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">淨額</th>
                <th className="px-3 py-2 text-center">狀態</th>
                <th className="px-3 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map(r => {
                const netAmt = (r.depositIn || 0) - (r.depositOut || 0);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{r.businessDate}</td>
                    <td className="px-3 py-2">{r.guestName || '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">{r.companyName || '-'}</td>
                    <td className="px-3 py-2 text-right text-green-700">{fmt(r.depositIn)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(r.depositOut)}</td>
                    <td className="px-3 py-2 text-right font-medium hidden sm:table-cell">{netAmt !== 0 ? netAmt.toLocaleString('zh-TW') : '-'}</td>
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
                        <button onClick={() => setStatus(r.id, '已核對')} className="text-xs text-green-600 hover:underline mr-2">確認</button>
                      ) : (
                        <button onClick={() => setStatus(r.id, '待確認')} className="text-xs text-gray-400 hover:underline mr-2">取消</button>
                      )}
                      {r.depositStatus !== '差異' && (
                        <button onClick={() => setStatus(r.id, '差異')} className="text-xs text-red-500 hover:underline">差異</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold">
              <tr>
                <td colSpan={2} className="px-3 py-2 text-gray-600">合計（{displayed.length} 筆）</td>
                <td className="hidden sm:table-cell" />
                <td className="px-3 py-2 text-right text-green-700">
                  {displayed.reduce((s, r) => s + (r.depositIn || 0), 0).toLocaleString('zh-TW')}
                </td>
                <td className="px-3 py-2 text-right text-red-600">
                  {displayed.reduce((s, r) => s + (r.depositOut || 0), 0).toLocaleString('zh-TW')}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
