'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

function fmt(n) {
  if (n == null || n === '' || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function getWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const mon = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { from: isoDate(mon), to: isoDate(sun) };
}

// 所有可用狀態
const STATUS_OPTIONS = [
  { key: '已入存簿', label: '已入存簿', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  { key: '已核對',   label: '已核對',   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  { key: '待確認',   label: '待確認',   color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-200' },
  { key: '逾期未入', label: '逾期未入', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  { key: '差異',     label: '差異',     color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
];

const STATUS_BADGE = {
  '已入存簿': 'bg-green-100 text-green-700',
  '已核對':   'bg-blue-100 text-blue-700',
  '差異':     'bg-red-100 text-red-700',
  '逾期未入': 'bg-orange-100 text-orange-700',
};

export default function PmsIncomeDepositReconTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // 本週核對日期範圍
  const [weekView, setWeekView] = useState(false);
  const [weekFrom, setWeekFrom] = useState(getWeekRange().from);
  const [weekTo,   setWeekTo]   = useState(getWeekRange().to);

  const [rows, setRows]   = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('全部');

  const load = useCallback(async () => {
    setLoading(true);
    // 先自動標記超過 7 天未入存簿的訂金為「逾期未入」，再讀取最新資料
    try {
      const op = new URLSearchParams({ days: '7' });
      if (warehouse) op.set('warehouse', warehouse);
      await fetch(`/api/pms-income/reservations/auto-mark-overdue?${op}`, { method: 'POST' });
    } catch {}
    try {
      const params = new URLSearchParams({ take: '1000' });
      if (warehouse) params.set('warehouse', warehouse);
      if (weekView) {
        params.set('dateFrom', weekFrom);
        params.set('dateTo', weekTo);
      } else {
        params.set('month', month);
      }
      const [rowsRes, sumRes] = await Promise.all([
        fetch(`/api/pms-income/reservations?${params}`),
        weekView ? Promise.resolve({ ok: false }) :
          fetch(`/api/pms-income/reservations/deposit-summary?month=${month}${warehouse ? `&warehouse=${warehouse}` : ''}`),
      ]);
      if (rowsRes.ok) {
        const all = await rowsRes.json();
        setRows(all.filter(r => r.depositIn > 0 || r.depositOut > 0));
      }
      if (sumRes.ok) setSummary(await sumRes.json());
      else if (!weekView) setSummary(null);
    } finally { setLoading(false); }
  }, [warehouse, month, weekView, weekFrom, weekTo]);

  useEffect(() => { load(); }, [load]);

  // 月度數字
  const totalIn  = rows.reduce((s, r) => s + (r.depositIn  || 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.depositOut || 0), 0);
  const monthNet = totalIn - totalOut;

  // 狀態彙總
  const byStatus = useMemo(() => {
    const m = {};
    STATUS_OPTIONS.forEach(o => { m[o.key] = { in: 0, out: 0, count: 0 }; });
    m['待確認'] = { in: 0, out: 0, count: 0 };

    if (!weekView && summary?.byStatus) {
      for (const s of summary.byStatus) {
        const key = STATUS_OPTIONS.find(o => o.key === s.status) ? s.status : '待確認';
        if (!m[key]) m[key] = { in: 0, out: 0, count: 0 };
        m[key].in    += s.depositIn;
        m[key].out   += s.depositOut;
        m[key].count += s.count;
      }
    } else {
      for (const r of rows) {
        const key = STATUS_OPTIONS.find(o => o.key === r.depositStatus) ? r.depositStatus : '待確認';
        if (!m[key]) m[key] = { in: 0, out: 0, count: 0 };
        m[key].in  += r.depositIn  || 0;
        m[key].out += r.depositOut || 0;
        m[key].count++;
      }
    }
    return m;
  }, [rows, summary, weekView]);

  const cumulativeIn  = summary?.all?.depositIn  ?? totalIn;
  const cumulativeOut = summary?.all?.depositOut ?? totalOut;
  const outstanding   = cumulativeIn - cumulativeOut;

  const displayed = statusFilter === '全部' ? rows : rows.filter(r => {
    if (statusFilter === '待確認') return !STATUS_OPTIONS.find(o => o.key === r.depositStatus && o.key !== '待確認');
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
    }
  }

  // 本週待入帳（未入存簿）的訂金
  const weekPending = useMemo(() =>
    rows.filter(r => r.depositIn > 0 && r.depositStatus !== '已入存簿'),
    [rows]
  );

  return (
    <div className="space-y-4">
      {/* ── 篩選列 ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded px-2 py-1 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>

        {/* 月份 / 本週 切換 */}
        <div className="flex gap-2 items-end">
          <button onClick={() => setWeekView(false)}
            className={`px-3 py-1 text-sm rounded border ${!weekView ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            月份檢視
          </button>
          <button onClick={() => { setWeekView(true); const w = getWeekRange(); setWeekFrom(w.from); setWeekTo(w.to); }}
            className={`px-3 py-1 text-sm rounded border ${weekView ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            本週核對
          </button>
        </div>

        {!weekView ? (
          <div>
            <label className="block text-xs text-gray-500 mb-1">月份</label>
            <input type="month" className="border rounded px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">起始日</label>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={weekFrom} onChange={e => setWeekFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">結束日</label>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={weekTo} onChange={e => setWeekTo(e.target.value)} />
            </div>
          </>
        )}
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
        <a href="/bank-reconciliation" target="_blank"
          className="px-3 py-1 text-sm border border-indigo-400 text-indigo-600 rounded hover:bg-indigo-50">
          前往存簿對帳 →
        </a>
      </div>

      {/* ── 本週核對提示 ── */}
      {weekView && weekPending.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-amber-800">本週尚有 {weekPending.length} 筆訂金未確認入存簿</span>
            <span className="ml-2 text-sm text-amber-600">合計 NT$ {weekPending.reduce((s,r)=>s+(r.depositIn||0),0).toLocaleString('zh-TW')}</span>
          </div>
          <span className="text-xs text-amber-600">請對照存摺後逐筆標記「已入存簿」</span>
        </div>
      )}

      {/* ── 月度 KPI（月份檢視） ── */}
      {!weekView && (
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
      )}

      {/* ── 狀態篩選 chips ── */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setStatusFilter('全部')}
          className={`px-3 py-1 text-xs rounded-full border transition-all ${statusFilter === '全部' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          全部 ({rows.length})
        </button>
        {STATUS_OPTIONS.map(s => (
          <button key={s.key} onClick={() => setStatusFilter(prev => prev === s.key ? '全部' : s.key)}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${statusFilter === s.key ? `${s.bg} ring-2 ring-offset-1 ring-blue-400` : `${s.bg}`}`}>
            <span className={s.color}>{s.label}</span>
            <span className="ml-1 text-gray-500">({byStatus[s.key]?.count || 0})</span>
          </button>
        ))}
      </div>

      {/* ── 表格 ── */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {weekView ? '本週無訂金記錄' : '本月無訂金記錄'}
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left hidden sm:table-cell">公司 / 來源</th>
                <th className="px-3 py-2 text-right">收訂金</th>
                <th className="px-3 py-2 text-right">沖訂金</th>
                <th className="px-3 py-2 text-right hidden sm:table-cell">淨額</th>
                <th className="px-3 py-2 text-center">狀態</th>
                <th className="px-3 py-2 text-center min-w-[160px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map(r => {
                const netAmt = (r.depositIn || 0) - (r.depositOut || 0);
                const st = r.depositStatus || '待確認';
                const badgeCls = STATUS_BADGE[st] || 'bg-gray-100 text-gray-600';
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${st === '逾期未入' ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-3 py-2">{r.businessDate}</td>
                    <td className="px-3 py-2">{r.guestName || '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">
                      {r.companyName || '-'} · <span className="text-gray-400">{r.source}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-green-700 tabular-nums">{fmt(r.depositIn)}</td>
                    <td className="px-3 py-2 text-right text-red-600 tabular-nums">{fmt(r.depositOut)}</td>
                    <td className="px-3 py-2 text-right font-medium hidden sm:table-cell tabular-nums">
                      {netAmt !== 0 ? netAmt.toLocaleString('zh-TW') : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${badgeCls}`}>{st}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {st !== '已入存簿' && (
                        <button onClick={() => setStatus(r.id, '已入存簿')}
                          className="text-green-600 hover:underline mr-1.5">已入存簿</button>
                      )}
                      {st !== '已核對' && (
                        <button onClick={() => setStatus(r.id, '已核對')}
                          className="text-blue-600 hover:underline mr-1.5">已核對</button>
                      )}
                      {st !== '逾期未入' && r.depositIn > 0 && (
                        <button onClick={() => setStatus(r.id, '逾期未入')}
                          className="text-orange-500 hover:underline mr-1.5">逾期未入</button>
                      )}
                      {st !== '差異' && (
                        <button onClick={() => setStatus(r.id, '差異')}
                          className="text-red-500 hover:underline mr-1.5">差異</button>
                      )}
                      {st !== '待確認' && (
                        <button onClick={() => setStatus(r.id, '待確認')}
                          className="text-gray-400 hover:underline">重設</button>
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
                <td className="px-3 py-2 text-right text-green-700 tabular-nums">
                  {displayed.reduce((s, r) => s + (r.depositIn || 0), 0).toLocaleString('zh-TW')}
                </td>
                <td className="px-3 py-2 text-right text-red-600 tabular-nums">
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
