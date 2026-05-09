'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

const SOURCE_OPTIONS = ['全部', '電話', 'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '代訂中心', '月租'];
const SOURCE_EDIT_OPTIONS = ['電話', 'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '代訂中心', '月租', '其他'];
const DEPOSIT_STATUS_OPTIONS = ['全部', '待確認', '已核對', '差異'];
const CC_STATUS_OPTIONS = ['全部', '待核對', '已核對'];
const DEPOSIT_CYCLE = ['待確認', '已核對', '差異'];

const SOURCE_COLORS = {
  '電話':        'bg-gray-100 text-gray-700',
  'OTA-Booking': 'bg-blue-100 text-blue-700',
  'OTA-Agoda':   'bg-red-100 text-red-700',
  'OTA-Expedia': 'bg-yellow-100 text-yellow-800',
  '代訂中心':    'bg-purple-100 text-purple-700',
  '月租':        'bg-green-100 text-green-700',
  '其他':        'bg-gray-100 text-gray-600',
};
const DEPOSIT_COLORS = {
  '已核對': 'bg-green-100 text-green-700 border-green-200',
  '差異':   'bg-red-100 text-red-700 border-red-200',
  '待確認': 'bg-gray-100 text-gray-500 border-gray-200',
  '無訂金': 'bg-gray-50 text-gray-400 border-gray-100',
};
const CC_COLORS = {
  '已核對': 'bg-green-100 text-green-700 border-green-200',
  '待核對': 'bg-gray-100 text-gray-500 border-gray-200',
};

function fmt(n) {
  const v = Number(n);
  if (n == null || isNaN(v) || v === 0) return '';
  return v.toLocaleString('zh-TW');
}

function downloadCsv(rows) {
  const headers = ['日期','房號','住客','公司','來源','住宿金額','現金','信用卡','轉帳','佣金','收訂金','沖訂金','訂金狀態','信用卡核對','備註'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.businessDate, r.roomNo||'', r.guestName||'', r.companyName||'',
      r.sourceOverride||r.source, r.totalRevenue||0, r.cash||0, r.creditCard||0,
      r.wireTransfer||0, r.commission||0, r.depositIn||0, r.depositOut||0,
      r.depositStatus, r.creditCardStatus, r.note||'',
    ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  }
  const blob = new Blob(['﻿'+lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `訂房明細_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── Inline editable: Source tag ──
function SourceCell({ row, onSave }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const src = row.sourceOverride || row.source;

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const choose = async (val) => {
    setOpen(false);
    setSaving(true);
    await onSave({ sourceOverride: val === src && !row.sourceOverride ? null : (val === row.source ? null : val) });
    setSaving(false);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <span
        onClick={() => setOpen(o => !o)}
        className={`px-1.5 py-0.5 rounded text-xs cursor-pointer border transition-all
          ${saving ? 'opacity-40' : 'hover:ring-1 hover:ring-blue-300'}
          ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-600'}`}
        title="點擊修改來源"
      >
        {src}{row.sourceOverride && row.sourceOverride !== row.source && ' ✎'}
      </span>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[130px]">
          <div className="px-2 py-1 text-xs text-gray-400 border-b">自動：{row.source}</div>
          {SOURCE_EDIT_OPTIONS.map(o => (
            <button key={o} onMouseDown={() => choose(o)}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50
                ${(row.sourceOverride||row.source)===o ? 'font-bold text-blue-700' : 'text-gray-700'}`}>
              <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SOURCE_COLORS[o]?.split(' ')[0]||'bg-gray-300'}`}/>
              {o}
            </button>
          ))}
          {row.sourceOverride && (
            <button onMouseDown={() => choose(row.source)}
              className="block w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t">
              ↩ 還原自動分類
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline editable: Deposit status badge ──
function DepositBadge({ row, onSave }) {
  const [saving, setSaving] = useState(false);
  if (!row.depositIn && !row.depositOut) return <span className="text-gray-300 text-xs">—</span>;
  const cycle = async () => {
    if (saving) return;
    const idx = DEPOSIT_CYCLE.indexOf(row.depositStatus);
    const next = DEPOSIT_CYCLE[(idx + 1) % DEPOSIT_CYCLE.length];
    setSaving(true);
    await onSave({ depositStatus: next });
    setSaving(false);
  };
  return (
    <span onClick={cycle}
      className={`px-1.5 py-0.5 rounded text-xs cursor-pointer border transition-all
        ${saving ? 'opacity-40' : 'hover:opacity-80 hover:ring-1 hover:ring-gray-300'}
        ${DEPOSIT_COLORS[row.depositStatus] || DEPOSIT_COLORS['待確認']}`}
      title="點擊切換：待確認→已核對→差異"
    >
      {saving ? '…' : row.depositStatus}
    </span>
  );
}

// ── Inline editable: CC status toggle ──
function CCBadge({ row, onSave }) {
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    if (saving) return;
    const next = row.creditCardStatus === '已核對' ? '待核對' : '已核對';
    setSaving(true);
    await onSave({ creditCardStatus: next });
    setSaving(false);
  };
  return (
    <span onClick={toggle}
      className={`px-1.5 py-0.5 rounded text-xs cursor-pointer border transition-all
        ${saving ? 'opacity-40' : 'hover:opacity-80 hover:ring-1 hover:ring-gray-300'}
        ${CC_COLORS[row.creditCardStatus] || CC_COLORS['待核對']}`}
      title="點擊切換：待核對 ↔ 已核對"
    >
      {saving ? '…' : (row.creditCardStatus === '已核對' ? '✓ 已核對' : row.creditCardStatus)}
    </span>
  );
}

// ── Inline editable: Note ──
function NoteCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.note || '');
  const ref = useRef(null);

  const save = async () => {
    setEditing(false);
    if (val !== (row.note || '')) await onSave({ note: val || null });
  };

  if (editing) {
    return (
      <input
        ref={ref}
        autoFocus
        className="border rounded px-1.5 py-0.5 text-xs w-28 focus:ring-1 focus:ring-blue-300"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(row.note||''); setEditing(false); } }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="text-xs text-gray-500 cursor-pointer hover:text-blue-600 hover:underline max-w-[100px] truncate block"
      title={row.note || '點擊新增備註'}
    >
      {row.note || <span className="text-gray-300">+ 備註</span>}
    </span>
  );
}

// ── Inline editable: Source override via small modal for full detail ──
function DetailModal({ row, onClose, onSave }) {
  const [sourceOverride, setSourceOverride] = useState(row.sourceOverride || '');
  const [depositStatus, setDepositStatus] = useState(row.depositStatus || '待確認');
  const [note, setNote] = useState(row.note || '');

  function f(n) { const v = Number(n); return (!v||isNaN(v)) ? '—' : v.toLocaleString('zh-TW'); }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center px-5 py-3 border-b">
          <h3 className="font-semibold text-sm">{row.guestName || '—'} · {row.businessDate} · {row.roomNo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 rounded-lg p-3">
            <div><span className="text-gray-400">入住</span><br/>{row.checkIn||'—'}</div>
            <div><span className="text-gray-400">退房</span><br/>{row.checkOut||'—'}</div>
            <div><span className="text-gray-400">公司</span><br/>{row.companyName||'—'}</div>
            <div><span className="text-gray-400">住宿金額</span><br/>{f(row.roomRate)}</div>
            <div><span className="text-gray-400">收訂金</span><br/>{f(row.depositIn)}</div>
            <div><span className="text-gray-400">沖訂金</span><br/>{f(row.depositOut)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">來源覆寫</label>
            <select className="border rounded px-2 py-1.5 w-full text-sm" value={sourceOverride} onChange={e => setSourceOverride(e.target.value)}>
              <option value="">（自動：{row.source}）</option>
              {SOURCE_EDIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">訂金狀態</label>
            <select className="border rounded px-2 py-1.5 w-full text-sm" value={depositStatus} onChange={e => setDepositStatus(e.target.value)}>
              {['待確認','已核對','差異','無訂金'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">備註</label>
            <textarea rows={2} className="border rounded px-2 py-1.5 w-full text-sm" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded text-gray-600">取消</button>
          <button onClick={() => { onSave({ sourceOverride: sourceOverride||null, depositStatus, note }); onClose(); }}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">儲存</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──
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
  const [detailRow, setDetailRow] = useState(null);
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

  // Optimistic update: apply patch locally then persist
  async function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    const res = await fetch(`/api/pms-income/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // Revert on failure
      load();
    } else {
      const updated = await res.json();
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
    }
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
      if (res.ok) { setPushMsg(`已推送 ${json.count} 筆`); setCheckedIds(new Set()); setPushMode(false); load(); }
      else setPushMsg(json.error?.message || '推送失敗');
    } catch { setPushMsg('網路錯誤'); }
    finally { setPushing(false); }
  }

  async function reclassify() {
    setReclassifying(true); setReclassMsg('');
    try {
      const res = await fetch('/api/pms-income/reservations/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse, month }),
      });
      const json = await res.json();
      if (res.ok) { setReclassMsg(`已重新分類 ${json.updated} 筆`); load(); }
      else setReclassMsg(json.error?.message || '失敗');
    } catch { setReclassMsg('網路錯誤'); }
    finally { setReclassifying(false); }
  }

  const totalRevenue = rows.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  const totalCC = rows.reduce((s, r) => s + (r.creditCard || 0), 0);
  const totalCommission = rows.reduce((s, r) => s + (r.commission || 0), 0);
  const reconCount = rows.filter(r => r.creditCardStatus === '已核對').length;
  const depositDoneCount = rows.filter(r => r.depositIn > 0 && r.depositStatus === '已核對').length;
  const depositTotalCount = rows.filter(r => r.depositIn > 0).length;

  const sourceCounts = {};
  for (const r of rows) {
    const src = r.sourceOverride || r.source;
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex flex-wrap gap-2 items-end shadow-sm">
        <div>
          <label className="block text-xs text-gray-400 mb-1">館別</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
            {useRange ? '日期區間' : '月份'}
            <button onClick={() => setUseRange(r => !r)} className="text-blue-500 hover:underline text-xs ml-1">
              {useRange ? '切回月份' : '切換區間'}
            </button>
          </label>
          {useRange ? (
            <div className="flex gap-1 items-center">
              <input type="date" className="border rounded-lg px-2 py-1.5 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-gray-300">~</span>
              <input type="date" className="border rounded-lg px-2 py-1.5 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          ) : (
            <input type="month" className="border rounded-lg px-2 py-1.5 text-sm" value={month} onChange={e => setMonth(e.target.value)} />
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">來源</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            {SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">訂金</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={depositFilter} onChange={e => setDepositFilter(e.target.value)}>
            {DEPOSIT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">信用卡</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={ccFilter} onChange={e => setCcFilter(e.target.value)}>
            {CC_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5 items-end flex-wrap">
          <button onClick={load} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">整理</button>
          <button onClick={() => downloadCsv(rows)} disabled={!rows.length} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40">↓ CSV</button>
          <button onClick={() => { setPushMode(m=>!m); setCheckedIds(new Set()); }}
            className={`px-3 py-1.5 text-sm rounded-lg ${pushMode ? 'bg-purple-600 text-white' : 'border border-purple-400 text-purple-600 hover:bg-purple-50'}`}>
            {pushMode ? '取消' : '推廠商'}
          </button>
          {!useRange && (
            <button onClick={reclassify} disabled={reclassifying}
              className="px-3 py-1.5 text-sm border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 disabled:opacity-40">
              {reclassifying ? '…' : '重分類'}
            </button>
          )}
          {reclassMsg && <span className="text-xs text-green-600">{reclassMsg}</span>}
        </div>
      </div>

      {/* Push panel */}
      {pushMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center text-sm">
          <span className="text-purple-700">已勾選 {checkedIds.size} 筆</span>
          <input type="number" className="border rounded px-2 py-1 text-sm w-24" value={billingId} onChange={e => setBillingId(e.target.value)} placeholder="帳單 ID" />
          <button onClick={pushToVendorBilling} disabled={pushing} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg disabled:opacity-50">
            {pushing ? '推送中…' : '確認推送'}
          </button>
          {pushMsg && <span className="text-xs text-green-600">{pushMsg}</span>}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { label: '訂單', value: `${rows.length} 筆` },
          { label: '總收入', value: totalRevenue ? totalRevenue.toLocaleString('zh-TW') : '—' },
          { label: '信用卡', value: totalCC ? totalCC.toLocaleString('zh-TW') : '—' },
          { label: '信用卡已核', value: `${reconCount} / ${rows.length}`, ok: reconCount === rows.length && rows.length > 0 },
          { label: '訂金已核', value: depositTotalCount ? `${depositDoneCount} / ${depositTotalCount}` : '—', ok: depositDoneCount === depositTotalCount && depositTotalCount > 0 },
        ].map(k => (
          <div key={k.label} className={`border rounded-xl px-3 py-2 ${k.ok ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className={`text-base font-bold ${k.ok ? 'text-green-700' : 'text-gray-800'}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Source chips */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(sourceCounts).map(([src, cnt]) => (
          <button key={src}
            onClick={() => setSourceFilter(sourceFilter === src ? '全部' : src)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all
              ${SOURCE_COLORS[src] || 'bg-gray-100 text-gray-700'}
              ${sourceFilter === src ? 'ring-2 ring-offset-1 ring-blue-400' : 'hover:opacity-80'}`}>
            {src}: {cnt}
          </button>
        ))}
        {sourceFilter !== '全部' && (
          <button onClick={() => setSourceFilter('全部')} className="px-2 py-0.5 rounded-full text-xs text-gray-400 hover:text-gray-600">✕ 清除</button>
        )}
      </div>

      {/* Hint */}
      <div className="text-xs text-gray-400 flex gap-3 flex-wrap">
        <span>💡 直接點擊表格內的標籤可編輯：</span>
        <span className="text-blue-500">來源</span>（下拉選單）·
        <span className="text-green-600">訂金</span>（循環切換）·
        <span className="text-green-600">信用卡核對</span>（點擊開關）·
        <span className="text-gray-500">備註</span>（點擊輸入）
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">尚無訂房明細資料</div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs sticky top-0 z-10">
              <tr>
                {pushMode && <th className="px-2 py-2">
                  <input type="checkbox"
                    checked={checkedIds.size === rows.length && rows.length > 0}
                    onChange={() => setCheckedIds(checkedIds.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))} />
                </th>}
                <th className="px-3 py-2 text-left whitespace-nowrap">日期</th>
                <th className="px-2 py-2 text-left">房號</th>
                <th className="px-3 py-2 text-left">住客</th>
                <th className="px-3 py-2 text-left">公司</th>
                <th className="px-3 py-2 text-center">來源 ✎</th>
                <th className="px-3 py-2 text-right">住宿金額</th>
                <th className="px-3 py-2 text-right">現金</th>
                <th className="px-3 py-2 text-right">信用卡</th>
                <th className="px-3 py-2 text-right">佣金</th>
                <th className="px-3 py-2 text-center whitespace-nowrap">訂金 ✎</th>
                <th className="px-3 py-2 text-center whitespace-nowrap">信用卡核對 ✎</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">備註 ✎</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => {
                const hasAnomaly = (!r.totalRevenue && !r.cash && !r.creditCard && !r.wireTransfer);
                return (
                  <tr key={r.id}
                    className={`transition-colors
                      ${checkedIds.has(r.id) ? 'bg-purple-50' : hasAnomaly ? 'bg-orange-50/60' : 'hover:bg-blue-50/40'}`}>
                    {pushMode && (
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => {
                          const n = new Set(checkedIds); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setCheckedIds(n);
                        }} />
                      </td>
                    )}
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-gray-600">{r.businessDate}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-500">{r.roomNo||'—'}</td>
                    <td className="px-3 py-1.5 max-w-[120px] truncate font-medium text-gray-800" title={r.guestName}>{r.guestName||'—'}</td>
                    <td className="px-3 py-1.5 max-w-[100px] truncate text-xs text-gray-400" title={r.companyName}>{r.companyName||''}</td>
                    <td className="px-3 py-1.5 text-center">
                      <SourceCell row={r} onSave={patch => updateRow(r.id, patch)} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmt(r.totalRevenue)||<span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmt(r.cash)||<span className="text-gray-200">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmt(r.creditCard)||<span className="text-gray-200">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{fmt(r.commission)||<span className="text-gray-200">—</span>}</td>
                    <td className="px-3 py-1.5 text-center">
                      <DepositBadge row={r} onSave={patch => updateRow(r.id, patch)} />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <CCBadge row={r} onSave={patch => updateRow(r.id, patch)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <NoteCell row={r} onSave={patch => updateRow(r.id, patch)} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => setDetailRow(r)} className="text-gray-300 hover:text-gray-500 text-xs" title="完整詳情">⋯</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold border-t-2 border-gray-200">
              <tr>
                <td colSpan={pushMode ? 6 : 5} className="px-3 py-2 text-gray-500">合計 {rows.length} 筆</td>
                <td className="px-3 py-2 text-right text-gray-700">{totalRevenue ? totalRevenue.toLocaleString('zh-TW') : '—'}</td>
                <td className="px-3 py-2 text-right">{rows.reduce((s,r)=>s+(r.cash||0),0)||''}</td>
                <td className="px-3 py-2 text-right">{totalCC ? totalCC.toLocaleString('zh-TW') : ''}</td>
                <td className="px-3 py-2 text-right text-red-600">{totalCommission ? totalCommission.toLocaleString('zh-TW') : ''}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {detailRow && (
        <DetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onSave={patch => { updateRow(detailRow.id, patch); setDetailRow(null); }}
        />
      )}
    </div>
  );
}
