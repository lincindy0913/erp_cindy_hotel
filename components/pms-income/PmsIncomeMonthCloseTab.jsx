'use client';

import { useState, useEffect, useCallback } from 'react';

function fmt(n) {
  if (n == null || n === '' || Number(n) === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}

const STATUS_META = {
  draft:     { label: '草稿',   color: 'bg-gray-100 text-gray-700',   border: 'border-gray-300' },
  confirmed: { label: '已確認', color: 'bg-blue-100 text-blue-700',   border: 'border-blue-300' },
  locked:    { label: '已鎖定', color: 'bg-green-100 text-green-700', border: 'border-green-400' },
};

export default function PmsIncomeMonthCloseTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [yearMonth, setYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [record, setRecord]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');
  const [note,    setNote]    = useState('');
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const load = useCallback(async () => {
    if (!warehouse || !yearMonth) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`/api/pms-income/month-close?warehouse=${encodeURIComponent(warehouse)}&yearMonth=${yearMonth}`);
      if (res.ok) {
        const data = await res.json();
        const found = data.find(c => c.yearMonth === yearMonth && c.warehouse === warehouse) || null;
        setRecord(found);
        setNote(found?.note || '');
      }
    } finally {
      setLoading(false);
    }
  }, [warehouse, yearMonth]);

  const loadHistory = useCallback(async () => {
    if (!warehouse) return;
    setHistLoading(true);
    try {
      const res = await fetch(`/api/pms-income/month-close?warehouse=${encodeURIComponent(warehouse)}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.slice(0, 12));
      }
    } finally {
      setHistLoading(false);
    }
  }, [warehouse]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function calculate() {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/pms-income/month-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse, yearMonth, note }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`計算失敗：${data.error?.message || '未知錯誤'}`); return; }
      setRecord(data);
      setNote(data.note || '');
      setMsg('月結草稿已更新');
      loadHistory();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(newStatus) {
    if (newStatus === 'locked' && !confirm(`確定要鎖定 ${yearMonth} 月結？鎖定後本月訂房資料將無法修改。`)) return;
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/pms-income/month-close', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse, yearMonth, status: newStatus, note }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`操作失敗：${data.error?.message || '未知錯誤'}`); return; }
      setRecord(data);
      setMsg(`狀態已更新為：${STATUS_META[newStatus]?.label || newStatus}`);
      loadHistory();
    } finally {
      setSaving(false);
    }
  }

  const isLocked = record?.status === 'locked';
  const sm = STATUS_META[record?.status] || STATUS_META.draft;
  const bySource = record?.summary?.bySource || {};

  return (
    <div className="space-y-5">
      {/* 篩選列 */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded px-2 py-1 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <input type="month" className="border rounded px-2 py-1 text-sm" value={yearMonth} onChange={e => setYearMonth(e.target.value)} />
        </div>
        <button onClick={calculate} disabled={saving || isLocked} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? '計算中...' : '重新計算月結'}
        </button>
      </div>

      {msg && (
        <div className={`text-sm px-3 py-2 rounded ${msg.includes('失敗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : !record ? (
        <div className="bg-gray-50 border rounded-lg p-6 text-center text-gray-500">
          <div className="text-sm">尚無 {yearMonth} 月結記錄</div>
          <div className="text-xs mt-1 text-gray-400">點擊「重新計算月結」建立草稿</div>
        </div>
      ) : (
        <>
          {/* 狀態列 */}
          <div className={`flex items-center justify-between border rounded-lg px-4 py-3 ${sm.border} bg-white`}>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${sm.color}`}>{sm.label}</span>
              <span className="text-sm text-gray-600">{warehouse}・{yearMonth}</span>
              {record.closedBy && (
                <span className="text-xs text-gray-400">
                  {record.status === 'locked' ? '鎖定' : '確認'}人：{record.closedBy}
                  {record.closedAt ? ` ${new Date(record.closedAt).toLocaleString('zh-TW')}` : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {record.status === 'draft' && (
                <button onClick={() => updateStatus('confirmed')} disabled={saving}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  確認月結
                </button>
              )}
              {record.status === 'confirmed' && (
                <>
                  <button onClick={() => updateStatus('draft')} disabled={saving}
                    className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50">
                    退回草稿
                  </button>
                  <button onClick={() => updateStatus('locked')} disabled={saving}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                    鎖定月結
                  </button>
                </>
              )}
              {record.status === 'locked' && (
                <button onClick={() => updateStatus('confirmed')} disabled={saving}
                  className="px-3 py-1 text-xs border border-orange-400 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-50">
                  解鎖（主管）
                </button>
              )}
            </div>
          </div>

          {/* KPI 卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: '現金收款', val: record.cashTotal, color: 'text-emerald-700' },
              { label: 'ATM / 匯款', val: record.wireTotal, color: 'text-blue-700' },
              { label: '信用卡（待撥）', val: record.ccTotal, color: 'text-purple-700' },
              { label: 'OTA 總收益', val: record.otaTotal, color: 'text-orange-700' },
              { label: '收訂金', val: record.depositIn, color: 'text-amber-700' },
              { label: '沖訂金', val: record.depositOut, color: 'text-red-600' },
              { label: '預收款淨額', val: record.depositIn - record.depositOut, color: record.depositIn - record.depositOut >= 0 ? 'text-amber-700' : 'text-red-600' },
              { label: '本月總收益', val: record.totalRevenue, color: 'text-gray-800', bold: true },
            ].map(({ label, val, color, bold }) => (
              <div key={label} className="bg-white border rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-base font-${bold ? 'bold' : 'semibold'} ${color}`}>{fmt(val)}</div>
              </div>
            ))}
          </div>

          {/* 來源分布 */}
          {Object.keys(bySource).length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">來源分布（本月總收益）</h4>
              <div className="space-y-2">
                {Object.entries(bySource)
                  .sort((a, b) => b[1] - a[1])
                  .map(([src, amt]) => {
                    const pct = record.totalRevenue > 0 ? (amt / record.totalRevenue) * 100 : 0;
                    return (
                      <div key={src} className="flex items-center gap-2">
                        <div className="w-20 text-xs text-gray-600 truncate">{src}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <div className="text-xs text-gray-700 w-20 text-right">{fmt(amt)}</div>
                        <div className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(1)}%</div>
                      </div>
                    );
                  })}
              </div>
              <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                共 {record.summary?.reservationCount || 0} 筆訂房・最後計算：
                {record.summary?.generatedAt ? new Date(record.summary.generatedAt).toLocaleString('zh-TW') : '-'}
              </div>
            </div>
          )}

          {/* 備註 */}
          <div className="bg-white border rounded-lg p-4">
            <label className="text-xs text-gray-500 block mb-1">月結備註</label>
            <textarea
              rows={2}
              className="w-full border rounded px-2 py-1 text-sm resize-none"
              placeholder="會計備註、差異說明..."
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={isLocked}
            />
            {!isLocked && (
              <button onClick={async () => {
                const res = await fetch('/api/pms-income/month-close', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ warehouse, yearMonth, note }),
                });
                if (res.ok) setMsg('備註已儲存');
              }} className="mt-1 text-xs text-blue-600 hover:underline">儲存備註</button>
            )}
          </div>
        </>
      )}

      {/* 歷史月結列表 */}
      {history.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">近期月結記錄</div>
          {histLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">載入中...</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">月份</th>
                  <th className="px-3 py-2 text-right">現金</th>
                  <th className="px-3 py-2 text-right">ATM</th>
                  <th className="px-3 py-2 text-right">信用卡</th>
                  <th className="px-3 py-2 text-right">總收益</th>
                  <th className="px-3 py-2 text-center">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map(c => {
                  const sm2 = STATUS_META[c.status] || STATUS_META.draft;
                  return (
                    <tr key={c.id}
                      className={`hover:bg-gray-50 cursor-pointer ${c.yearMonth === yearMonth ? 'bg-blue-50' : ''}`}
                      onClick={() => setYearMonth(c.yearMonth)}>
                      <td className="px-3 py-2 font-medium">{c.yearMonth}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(c.cashTotal)}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{fmt(c.wireTotal)}</td>
                      <td className="px-3 py-2 text-right text-purple-700">{fmt(c.ccTotal)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(c.totalRevenue)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${sm2.color}`}>{sm2.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
