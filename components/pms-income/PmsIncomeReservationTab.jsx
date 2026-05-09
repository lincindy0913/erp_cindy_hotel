'use client';
import { useState, useEffect, useCallback } from 'react';

const SOURCE_OPTIONS = ['全部', '電話', 'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '代訂中心', '月租'];
const DEPOSIT_STATUS_OPTIONS = ['全部', '待確認', '已核對', '差異'];
const CC_STATUS_OPTIONS = ['全部', '待核對', '已核對'];

const SOURCE_COLORS = {
  '電話':        'bg-gray-100 text-gray-700',
  'OTA-Booking': 'bg-blue-100 text-blue-700',
  'OTA-Agoda':   'bg-red-100 text-red-700',
  'OTA-Expedia': 'bg-yellow-100 text-yellow-800',
  '代訂中心':    'bg-purple-100 text-purple-700',
  '月租':        'bg-green-100 text-green-700',
};

function fmt(n) {
  if (n == null || n === '') return '-';
  const v = Number(n);
  if (isNaN(v) || v === 0) return '-';
  return v.toLocaleString('zh-TW');
}

function downloadCsv(rows) {
  const headers = ['日期', '房號', '住客', '房型', '公司', '來源', '住宿金額', '現金', '信用卡', '轉帳', '佣金', '收訂金', '沖訂金', '訂金狀態', '信用卡核對'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const src = r.sourceOverride || r.source;
    lines.push([
      r.businessDate, r.roomNo || '', r.guestName || '', r.roomType || '', r.companyName || '',
      src, r.totalRevenue || 0, r.cash || 0, r.creditCard || 0, r.wireTransfer || 0,
      r.commission || 0, r.depositIn || 0, r.depositOut || 0, r.depositStatus, r.creditCardStatus,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `訂房明細_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PmsIncomeReservationTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [useRange, setUseRange] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sourceFilter, setSourceFilter] = useState('全部');
  const [depositFilter, setDepositFilter] = useState('全部');
  const [ccFilter, setCcFilter] = useState('全部');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pushMode, setPushMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [billingId, setBillingId] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassMsg, setReclassMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '1000' });
      if (warehouse) params.set('warehouse', warehouse);
      if (useRange) {
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
      } else {
        if (month) params.set('month', month);
      }
      if (sourceFilter !== '全部') params.set('source', sourceFilter);
      if (depositFilter !== '全部') params.set('depositStatus', depositFilter);
      if (ccFilter !== '全部') params.set('creditCardStatus', ccFilter);
      const res = await fetch(`/api/pms-income/reservations?${params}`);
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [warehouse, useRange, month, dateFrom, dateTo, sourceFilter, depositFilter, ccFilter]);

  useEffect(() => { load(); }, [load]);

  const totalRevenue = rows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  const totalCash = rows.reduce((s, r) => s + (r.cash || 0), 0);
  const totalCC = rows.reduce((s, r) => s + (r.creditCard || 0), 0);
  const totalWire = rows.reduce((s, r) => s + (r.wireTransfer || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + (r.commission || 0), 0);

  const sourceCounts = {};
  for (const r of rows) {
    const src = r.sourceOverride || r.source;
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  async function pushToVendorBilling() {
    if (!billingId) { setPushMsg('請輸入廠商帳單 ID'); return; }
    if (checkedIds.size === 0) { setPushMsg('請勾選要推送的訂單'); return; }
    setPushing(true); setPushMsg('');
    try {
      const res = await fetch('/api/pms-income/vendor-billing/push-reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingId: parseInt(billingId), reservationIds: [...checkedIds] }),
      });
      const json = await res.json();
      if (res.ok) {
        setPushMsg(`已推送 ${json.count} 筆至帳單 #${billingId}`);
        setCheckedIds(new Set()); setPushMode(false); load();
      } else {
        setPushMsg(json.error?.message || '推送失敗');
      }
    } catch { setPushMsg('網路錯誤'); }
    finally { setPushing(false); }
  }

  async function reclassify() {
    if (!month && !useRange) { setReclassMsg('請先選擇月份'); return; }
    if (useRange) { setReclassMsg('日期區間模式下請切換回月份模式再重新分類'); return; }
    setReclassifying(true); setReclassMsg('');
    try {
      const res = await fetch('/api/pms-income/reservations/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse, month }),
      });
      const json = await res.json();
      if (res.ok) {
        setReclassMsg(`已重新分類 ${json.updated} 筆`);
        load();
      } else {
        setReclassMsg(json.error?.message || '分類失敗');
      }
    } catch { setReclassMsg('網路錯誤'); }
    finally { setReclassifying(false); }
  }

  async function updateRow(id, patch) {
    const res = await fetch(`/api/pms-income/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
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
          <label className="block text-xs text-gray-500 mb-1">
            篩選方式&nbsp;
            <button
              onClick={() => setUseRange(r => !r)}
              className="text-blue-600 text-xs underline"
            >
              {useRange ? '切換回月份' : '切換日期區間'}
            </button>
          </label>
          {useRange ? (
            <div className="flex gap-1 items-center">
              <input type="date" className="border rounded px-2 py-1 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-gray-400 text-xs">~</span>
              <input type="date" className="border rounded px-2 py-1 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          ) : (
            <input type="month" className="border rounded px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">來源</label>
          <select className="border rounded px-2 py-1 text-sm" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            {SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">訂金狀態</label>
          <select className="border rounded px-2 py-1 text-sm" value={depositFilter} onChange={e => setDepositFilter(e.target.value)}>
            {DEPOSIT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">信用卡核對</label>
          <select className="border rounded px-2 py-1 text-sm" value={ccFilter} onChange={e => setCcFilter(e.target.value)}>
            {CC_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
        <button
          onClick={() => downloadCsv(rows)}
          disabled={rows.length === 0}
          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
        >
          匯出 CSV
        </button>
        <button
          onClick={() => { setPushMode(m => !m); setCheckedIds(new Set()); setPushMsg(''); }}
          className={`px-3 py-1 text-sm rounded ${pushMode ? 'bg-purple-600 text-white' : 'border border-purple-500 text-purple-600 hover:bg-purple-50'}`}
        >
          {pushMode ? '取消推送' : '推送至廠商帳單'}
        </button>
        <button
          onClick={reclassify}
          disabled={reclassifying || useRange}
          className="px-3 py-1 text-sm border border-orange-400 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-40"
          title={useRange ? '請切換到月份模式再重新分類' : ''}
        >
          {reclassifying ? '分類中...' : '重新分類來源'}
        </button>
        {reclassMsg && (
          <span className={`text-xs ${reclassMsg.startsWith('已重新') ? 'text-green-600' : 'text-red-600'}`}>
            {reclassMsg}
          </span>
        )}
      </div>

      {/* Push panel */}
      {pushMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex flex-wrap gap-3 items-center">
          <span className="text-sm text-purple-700">已勾選 {checkedIds.size} 筆（建議篩選來源 = 代訂中心）</span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">廠商帳單 ID：</label>
            <input type="number" className="border rounded px-2 py-1 text-sm w-24" value={billingId} onChange={e => setBillingId(e.target.value)} />
          </div>
          <button onClick={pushToVendorBilling} disabled={pushing} className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">
            {pushing ? '推送中...' : '確認推送'}
          </button>
          {pushMsg && <span className={`text-sm ${pushMsg.startsWith('已推送') ? 'text-green-600' : 'text-red-600'}`}>{pushMsg}</span>}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '訂房筆數', value: rows.length + ' 筆' },
          { label: '總收入', value: totalRevenue.toLocaleString('zh-TW') },
          { label: '現金', value: totalCash.toLocaleString('zh-TW') },
          { label: '信用卡', value: totalCC.toLocaleString('zh-TW') },
          { label: '佣金', value: totalCommission.toLocaleString('zh-TW') },
        ].map(k => (
          <div key={k.label} className="bg-white border rounded-lg p-3">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className="text-lg font-semibold">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Source chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(sourceCounts).map(([src, cnt]) => (
          <span key={src} className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-700'}`}>
            {src}: {cnt}
          </span>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-gray-400">尚無訂房明細資料。請先匯入含訂房序號的日營業報表。</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                {pushMode && (
                  <th className="px-3 py-2">
                    <input type="checkbox"
                      checked={checkedIds.size === rows.length && rows.length > 0}
                      onChange={() => setCheckedIds(checkedIds.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))}
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">房號</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left">房型</th>
                <th className="px-3 py-2 text-right">住宿金額</th>
                <th className="px-3 py-2 text-right">現金</th>
                <th className="px-3 py-2 text-right">信用卡</th>
                <th className="px-3 py-2 text-right">佣金</th>
                <th className="px-3 py-2 text-center">來源</th>
                <th className="px-3 py-2 text-center">訂金</th>
                <th className="px-3 py-2 text-center">信用卡核對</th>
                <th className="px-3 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => {
                const src = r.sourceOverride || r.source;
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${checkedIds.has(r.id) ? 'bg-purple-50' : ''}`}>
                    {pushMode && (
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => {
                          const n = new Set(checkedIds);
                          n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                          setCheckedIds(n);
                        }} />
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">{r.businessDate}</td>
                    <td className="px-3 py-2">{r.roomNo || '-'}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate" title={r.guestName}>{r.guestName || '-'}</td>
                    <td className="px-3 py-2">{r.roomType || '-'}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.cash)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.creditCard)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.commission)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-600'}`}>{src}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        r.depositStatus === '已核對' ? 'bg-green-100 text-green-700' :
                        r.depositStatus === '差異' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>{r.depositStatus}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${r.creditCardStatus === '已核對' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {r.creditCardStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setSelected(r)} className="text-xs text-blue-600 hover:underline">詳情</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ReservationDetailModal
          row={selected}
          onClose={() => setSelected(null)}
          onSave={(patch) => { updateRow(selected.id, patch); setSelected(null); }}
        />
      )}
    </div>
  );
}

function ReservationDetailModal({ row, onClose, onSave }) {
  const [sourceOverride, setSourceOverride] = useState(row.sourceOverride || '');
  const [depositStatus, setDepositStatus] = useState(row.depositStatus || '待確認');
  const [note, setNote] = useState(row.note || '');

  function f(n) {
    if (!n || n === 0) return '-';
    return Number(n).toLocaleString('zh-TW');
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center px-5 py-4 border-b">
          <h3 className="font-semibold">訂房明細 #{row.reservationNo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-500">日期：</span>{row.businessDate}</div>
            <div><span className="text-gray-500">房號：</span>{row.roomNo || '-'}</div>
            <div><span className="text-gray-500">住客：</span>{row.guestName || '-'}</div>
            <div><span className="text-gray-500">公司：</span>{row.companyName || '-'}</div>
            <div><span className="text-gray-500">入住：</span>{row.checkIn || '-'}</div>
            <div><span className="text-gray-500">退房：</span>{row.checkOut || '-'}</div>
          </div>
          <hr />
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-500">住宿金額：</span>{f(row.roomRate)}</div>
            <div><span className="text-gray-500">服務費：</span>{f(row.serviceFee)}</div>
            <div><span className="text-gray-500">現金：</span>{f(row.cash)}</div>
            <div><span className="text-gray-500">信用卡：</span>{f(row.creditCard)}</div>
            <div><span className="text-gray-500">轉帳：</span>{f(row.wireTransfer)}</div>
            <div><span className="text-gray-500">佣金：</span>{f(row.commission)}</div>
            <div><span className="text-gray-500">收訂金：</span>{f(row.depositIn)}</div>
            <div><span className="text-gray-500">沖訂金：</span>{f(row.depositOut)}</div>
          </div>
          <hr />
          <div>
            <label className="block text-gray-500 mb-1">來源覆寫</label>
            <select className="border rounded px-2 py-1 w-full" value={sourceOverride} onChange={e => setSourceOverride(e.target.value)}>
              <option value="">（使用自動分類：{row.source}）</option>
              {['電話', 'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '代訂中心', '月租', '其他'].map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 mb-1">訂金狀態</label>
            <select className="border rounded px-2 py-1 w-full" value={depositStatus} onChange={e => setDepositStatus(e.target.value)}>
              {['待確認', '已核對', '差異', '無訂金'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 mb-1">備註</label>
            <textarea rows={2} className="border rounded px-2 py-1 w-full text-sm" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border rounded">取消</button>
          <button
            onClick={() => onSave({ sourceOverride: sourceOverride || null, depositStatus, note })}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
