'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const SOURCE_OPTIONS = ['全部', '電話', 'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '攜程網', '易遊網', '代訂中心', '月租'];
const SOURCE_EDIT_OPTIONS = ['電話', 'OTA-Booking', 'OTA-Agoda', 'OTA-Expedia', '攜程網', '易遊網', '代訂中心', '月租', '其他', '自訂…'];
const DEPOSIT_STATUS_OPTIONS = ['全部', '待確認', '已核對', '差異'];
const CC_STATUS_OPTIONS = ['全部', '待核對', '已核對'];
const DEPOSIT_CYCLE = ['待確認', '已核對', '差異'];

const SOURCE_COLORS = {
  '電話':        'bg-gray-100 text-gray-700',
  'OTA-Booking': 'bg-blue-100 text-blue-700',
  'OTA-Agoda':   'bg-red-100 text-red-700',
  'OTA-Expedia': 'bg-yellow-100 text-yellow-800',
  '攜程網':      'bg-cyan-100 text-cyan-700',
  '易遊網':      'bg-teal-100 text-teal-700',
  '代訂中心':    'bg-purple-100 text-purple-700',
  '月租':        'bg-green-100 text-green-700',
  '其他':        'bg-gray-100 text-gray-600',
};
const DEPOSIT_COLORS = {
  '已核對': 'bg-green-100 text-green-700 border-green-200',
  '差異':   'bg-red-100 text-red-700 border-red-200',
  '待確認': 'bg-gray-100 text-gray-500 border-gray-200',
};
const CC_COLORS = {
  '已核對': 'bg-green-100 text-green-700 border-green-200',
  '待核對': 'bg-gray-100 text-gray-500 border-gray-200',
};
const EMPTY_ADD_FORM = {
  guestName:'', companyName:'', roomNo:'', source:'電話',
  totalRevenue:'', cash:'', creditCard:'', wireTransfer:'',
  commission:'', depositIn:'', depositOut:'', note:'',
};

function fmt(n) {
  const v = Number(n);
  if (n == null || isNaN(v) || v === 0) return '';
  return v.toLocaleString('zh-TW');
}

/** 表格排序（客戶端） */
function compareReservationSort(a, b, key, dir) {
  const num = (x) => Number(x) || 0;
  let va;
  let vb;
  switch (key) {
    case 'businessDate':
      va = a.businessDate || '';
      vb = b.businessDate || '';
      break;
    case 'roomNo':
      va = a.roomNo || '';
      vb = b.roomNo || '';
      break;
    case 'guestName':
      va = a.guestName || '';
      vb = b.guestName || '';
      break;
    case 'companyName':
      va = a.companyName || '';
      vb = b.companyName || '';
      break;
    case 'source':
      va = a.sourceOverride || a.source || '';
      vb = b.sourceOverride || b.source || '';
      break;
    case 'totalRevenue':
      va = num(a.totalRevenue);
      vb = num(b.totalRevenue);
      break;
    case 'cash':
      va = num(a.cash);
      vb = num(b.cash);
      break;
    case 'creditCard':
      va = num(a.creditCard);
      vb = num(b.creditCard);
      break;
    case 'commission':
      va = num(a.commission);
      vb = num(b.commission);
      break;
    case 'depositStatus':
      va = a.depositStatus || '';
      vb = b.depositStatus || '';
      break;
    case 'creditCardStatus':
      va = a.creditCardStatus === '已核對' ? 1 : 0;
      vb = b.creditCardStatus === '已核對' ? 1 : 0;
      break;
    case 'note':
      va = a.note || '';
      vb = b.note || '';
      break;
    default:
      va = '';
      vb = '';
  }
  let c = 0;
  if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
  else c = String(va).localeCompare(String(vb), 'zh-Hant');
  return dir === 'asc' ? c : -c;
}

function SortTh({
  label,
  sortKey: colKey,
  activeKey,
  dir,
  onSort,
  className = '',
  align = 'left',
}) {
  const active = activeKey === colKey;
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      className={`px-3 py-2 text-xs text-gray-500 ${alignCls} whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(colKey)}
      title="點擊切換排序"
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : ''}`}>
        <span>{label}</span>
        <span className={`inline-flex flex-col leading-[0.65] text-[9px] ${active ? 'text-blue-600' : 'text-gray-300'}`}>
          <span className={active && dir === 'asc' ? 'text-blue-600 font-bold' : ''}>▲</span>
          <span className={active && dir === 'desc' ? 'text-blue-600 font-bold' : ''}>▼</span>
        </span>
      </span>
    </th>
  );
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
  const blob = new Blob(['﻿'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`訂房明細_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

async function downloadXlsx(rows, month, warehouse) {
  const XLSX = (await import('xlsx')).default;
  const srcMap = {};
  for (const r of rows) {
    const src = r.sourceOverride||r.source;
    if (!srcMap[src]) srcMap[src]={來源:src,筆數:0,總收入:0,現金:0,信用卡:0,轉帳:0,佣金:0};
    srcMap[src].筆數++; srcMap[src].總收入+=r.totalRevenue||0;
    srcMap[src].現金+=r.cash||0; srcMap[src].信用卡+=r.creditCard||0;
    srcMap[src].轉帳+=r.wireTransfer||0; srcMap[src].佣金+=r.commission||0;
  }
  const summaryData=[...Object.values(srcMap),{來源:'合計',筆數:rows.length,總收入:rows.reduce((s,r)=>s+(r.totalRevenue||0),0),現金:rows.reduce((s,r)=>s+(r.cash||0),0),信用卡:rows.reduce((s,r)=>s+(r.creditCard||0),0),轉帳:rows.reduce((s,r)=>s+(r.wireTransfer||0),0),佣金:rows.reduce((s,r)=>s+(r.commission||0),0)}];
  const detailData=rows.map(r=>({日期:r.businessDate,房號:r.roomNo||'',住客:r.guestName||'',公司:r.companyName||'',來源:r.sourceOverride||r.source,住宿金額:r.totalRevenue||0,現金:r.cash||0,信用卡:r.creditCard||0,轉帳:r.wireTransfer||0,佣金:r.commission||0,收訂金:r.depositIn||0,沖訂金:r.depositOut||0,訂金狀態:r.depositStatus,信用卡核對:r.creditCardStatus,備註:r.note||''}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summaryData),'來源摘要');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detailData),'訂房明細');
  XLSX.writeFile(wb,`月報_${warehouse}_${month}.xlsx`);
}

// ── Source cell ──
function SourceCell({ row, onSave, locked }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const ref = useRef(null);
  const src = row.sourceOverride || row.source;

  useEffect(() => {
    if (!open) { setCustomMode(false); setCustomVal(''); return; }
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const choose = async (val) => {
    if (val === '自訂…') { setCustomMode(true); return; }
    setOpen(false); setSaving(true);
    await onSave({ sourceOverride: val===src && !row.sourceOverride ? null : (val===row.source ? null : val) });
    setSaving(false);
  };

  const saveCustom = async () => {
    const v = customVal.trim();
    if (!v) { setCustomMode(false); return; }
    setOpen(false); setCustomMode(false); setSaving(true);
    await onSave({ sourceOverride: v });
    setSaving(false);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <span onClick={() => !locked && setOpen(o=>!o)}
        className={`px-1.5 py-0.5 rounded text-xs border transition-all
          ${locked ? 'cursor-default opacity-70' : 'cursor-pointer hover:ring-1 hover:ring-blue-300'}
          ${saving ? 'opacity-40' : ''}
          ${SOURCE_COLORS[src]||'bg-gray-100 text-gray-600'}`}
        title={locked ? '已結算鎖定' : '點擊修改來源'}>
        {src}{row.sourceOverride && row.sourceOverride!==row.source && ' ✎'}
      </span>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[140px]">
          <div className="px-2 py-1 text-xs text-gray-400 border-b">自動：{row.source}</div>
          {customMode ? (
            <div className="p-2 space-y-1">
              <input autoFocus className="border rounded px-2 py-1 text-xs w-full focus:ring-1 focus:ring-blue-300"
                placeholder="輸入自訂來源…" value={customVal} onChange={e=>setCustomVal(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')saveCustom();if(e.key==='Escape')setCustomMode(false);}} />
              <div className="flex gap-1">
                <button onMouseDown={saveCustom} className="flex-1 text-xs bg-blue-600 text-white rounded px-2 py-1">確認</button>
                <button onMouseDown={()=>setCustomMode(false)} className="text-xs border rounded px-2 py-1 text-gray-500">返回</button>
              </div>
            </div>
          ) : (
            <>
              {SOURCE_EDIT_OPTIONS.map(o=>(
                <button key={o} onMouseDown={()=>choose(o)}
                  className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${(row.sourceOverride||row.source)===o?'font-bold text-blue-700':'text-gray-700'}`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SOURCE_COLORS[o]?.split(' ')[0]||'bg-gray-300'}`}/>{o}
                </button>
              ))}
              {row.sourceOverride && <button onMouseDown={()=>choose(row.source)} className="block w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t">↩ 還原自動</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Deposit badge ──
function DepositBadge({ row, onSave, locked }) {
  const [saving, setSaving] = useState(false);
  if (!row.depositIn && !row.depositOut) return <span className="text-gray-300 text-xs">—</span>;
  const cycle = async () => {
    if (saving || locked) return;
    const next = DEPOSIT_CYCLE[(DEPOSIT_CYCLE.indexOf(row.depositStatus)+1)%DEPOSIT_CYCLE.length];
    setSaving(true); await onSave({depositStatus:next}); setSaving(false);
  };
  const amtParts = [
    row.depositIn  ? `入${Number(row.depositIn).toLocaleString('zh-TW')}`  : '',
    row.depositOut ? `沖${Number(row.depositOut).toLocaleString('zh-TW')}` : '',
  ].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs text-gray-400 tabular-nums leading-none">{amtParts}</span>
      <span onClick={cycle}
        className={`px-1.5 py-0.5 rounded text-xs border transition-all
          ${locked?'cursor-default opacity-70':'cursor-pointer hover:opacity-80'}
          ${saving?'opacity-40':''}
          ${DEPOSIT_COLORS[row.depositStatus]||DEPOSIT_COLORS['待確認']}`}
        title={locked?'已結算鎖定':`${amtParts} — 點擊切換狀態`}>
        {saving?'…':row.depositStatus}
      </span>
    </div>
  );
}

// ── CC badge ──
function CCBadge({ row, onSave, locked }) {
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    if (saving || locked) return;
    const next = row.creditCardStatus==='已核對'?'待核對':'已核對';
    setSaving(true); await onSave({creditCardStatus:next}); setSaving(false);
  };
  return (
    <span onClick={toggle}
      className={`px-1.5 py-0.5 rounded text-xs border transition-all
        ${locked?'cursor-default opacity-70':'cursor-pointer hover:opacity-80'}
        ${saving?'opacity-40':''}
        ${CC_COLORS[row.creditCardStatus]||CC_COLORS['待核對']}`}
      title={locked?'已結算鎖定':'點擊切換'}>
      {saving?'…':(row.creditCardStatus==='已核對'?'✓ 已核對':row.creditCardStatus)}
    </span>
  );
}

// ── Amount cell (inline editable) ──
function AmountCell({ row, field, onSave, locked, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const start = () => { if (locked) return; setVal(String(row[field] || '')); setEditing(true); };
  const commit = async () => {
    setEditing(false);
    const num = parseFloat(val);
    const newVal = isNaN(num) ? 0 : num;
    if (newVal !== (row[field] || 0)) await onSave({ [field]: newVal });
  };
  if (editing) {
    return <input autoFocus type="number" step="1"
      className="border rounded px-1 py-0.5 text-xs w-20 text-right focus:ring-1 focus:ring-blue-300 tabular-nums"
      value={val} onChange={e=>setVal(e.target.value)}
      onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false);}} />;
  }
  return (
    <span onClick={start}
      className={`tabular-nums block text-right ${locked?'cursor-default':'cursor-pointer hover:text-blue-600 hover:underline decoration-dashed'} ${className}`}
      title={locked?'已結算鎖定':'點擊修改金額'}>
      {fmt(row[field])||<span className="text-gray-200">—</span>}
    </span>
  );
}

// ── Note cell ──
function NoteCell({ row, onSave, locked }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.note||'');
  const save = async () => { setEditing(false); if (val!==(row.note||'')) await onSave({note:val||null}); };
  if (!locked && editing) {
    return <input autoFocus className="border rounded px-1.5 py-0.5 text-xs w-28 focus:ring-1 focus:ring-blue-300"
      value={val} onChange={e=>setVal(e.target.value)}
      onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape'){setVal(row.note||'');setEditing(false);}}} />;
  }
  return (
    <span onClick={()=>!locked&&setEditing(true)}
      className={`text-xs max-w-[100px] truncate block ${locked?'text-gray-400':'text-gray-500 cursor-pointer hover:text-blue-600 hover:underline'}`}
      title={row.note||''}>
      {row.note||<span className="text-gray-300">{locked?'—':'+ 備註'}</span>}
    </span>
  );
}

// ── Detail Modal ──
function DetailModal({ row, onClose, onSave }) {
  const [sourceOverride, setSourceOverride] = useState(row.sourceOverride||'');
  const [customSrc, setCustomSrc] = useState('');
  const [showCustomSrc, setShowCustomSrc] = useState(false);
  const [depositStatus, setDepositStatus] = useState(row.depositStatus||'待確認');
  const [depositIn,  setDepositIn]  = useState(row.depositIn  ?? '');
  const [depositOut, setDepositOut] = useState(row.depositOut ?? '');
  const [note, setNote] = useState(row.note||'');
  const f = n => { const v=Number(n); return (!v||isNaN(v))?'—':v.toLocaleString('zh-TW'); };

  const handleSrcChange = e => {
    if (e.target.value === '自訂…') { setShowCustomSrc(true); }
    else { setShowCustomSrc(false); setSourceOverride(e.target.value); }
  };

  const save = () => {
    const src = showCustomSrc ? customSrc.trim() || null : (sourceOverride || null);
    onSave({
      sourceOverride: src,
      depositStatus,
      depositIn:  parseFloat(depositIn)  || 0,
      depositOut: parseFloat(depositOut) || 0,
      note,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center px-5 py-3 border-b">
          <h3 className="font-semibold text-sm">{row.guestName||'—'} · {row.businessDate} · {row.roomNo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 rounded-lg p-3">
            <div><span className="text-gray-400">入住</span><br/>{row.checkIn||'—'}</div>
            <div><span className="text-gray-400">退房</span><br/>{row.checkOut||'—'}</div>
            <div><span className="text-gray-400">公司</span><br/>{row.companyName||'—'}</div>
            <div><span className="text-gray-400">住宿金額</span><br/>{f(row.totalRevenue)}</div>
            <div><span className="text-gray-400">現金</span><br/>{f(row.cash)}</div>
            <div><span className="text-gray-400">信用卡</span><br/>{f(row.creditCard)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">來源覆寫</label>
            <select className="border rounded px-2 py-1.5 w-full text-sm" value={showCustomSrc?'自訂…':sourceOverride} onChange={handleSrcChange}>
              <option value="">（自動：{row.source}）</option>
              {SOURCE_EDIT_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
            {showCustomSrc && (
              <input className="mt-1 border rounded px-2 py-1.5 w-full text-sm" placeholder="輸入自訂來源名稱…"
                value={customSrc} onChange={e=>setCustomSrc(e.target.value)} autoFocus />
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">訂金狀態</label>
              <select className="border rounded px-2 py-1.5 w-full text-sm" value={depositStatus} onChange={e=>setDepositStatus(e.target.value)}>
                {['待確認','已核對','差異','無訂金'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">收訂金</label>
              <input type="number" step="1" className="border rounded px-2 py-1.5 w-full text-sm" value={depositIn} onChange={e=>setDepositIn(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">沖訂金</label>
              <input type="number" step="1" className="border rounded px-2 py-1.5 w-full text-sm" value={depositOut} onChange={e=>setDepositOut(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">備註</label>
            <textarea rows={2} className="border rounded px-2 py-1.5 w-full text-sm" value={note} onChange={e=>setNote(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded text-gray-600">取消</button>
          <button onClick={save} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">儲存</button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Add Modal ──
function AddReservationModal({ warehouse, month, onClose, onSave }) {
  const defaultDate = month ? `${month}-01` : new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({...EMPTY_ADD_FORM, businessDate:defaultDate});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}));
  const submit = async () => {
    if (!form.guestName && !form.roomNo) { setErr('請填寫住客或房號'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/pms-income/reservations', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          warehouse, businessDate:form.businessDate,
          guestName:form.guestName||null, companyName:form.companyName||null,
          roomNo:form.roomNo||null, source:form.source,
          totalRevenue:parseFloat(form.totalRevenue)||0, cash:parseFloat(form.cash)||0,
          creditCard:parseFloat(form.creditCard)||0, wireTransfer:parseFloat(form.wireTransfer)||0,
          commission:parseFloat(form.commission)||0, depositIn:parseFloat(form.depositIn)||0,
          depositOut:parseFloat(form.depositOut)||0, note:form.note||null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message||'新增失敗');
      onSave(data);
    } catch(e) { setErr(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-5 py-3 border-b">
          <h3 className="font-semibold text-sm">手動新增訂房記錄</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">日期 *</label><input type="date" className="border rounded px-2 py-1.5 w-full text-sm" value={form.businessDate} onChange={f('businessDate')} /></div>
            <div><label className="block text-xs text-gray-500 mb-1">來源</label>
              <select className="border rounded px-2 py-1.5 w-full text-sm" value={form.source} onChange={f('source')}>
                {SOURCE_EDIT_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-gray-500 mb-1">住客名稱</label><input className="border rounded px-2 py-1.5 w-full text-sm" value={form.guestName} onChange={f('guestName')} placeholder="王小明" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">房號</label><input className="border rounded px-2 py-1.5 w-full text-sm" value={form.roomNo} onChange={f('roomNo')} placeholder="101" /></div>
            <div className="col-span-2"><label className="block text-xs text-gray-500 mb-1">公司</label><input className="border rounded px-2 py-1.5 w-full text-sm" value={form.companyName} onChange={f('companyName')} /></div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs text-gray-400 mb-2">金額（留空視為 0）</p>
            <div className="grid grid-cols-2 gap-3">
              {[['totalRevenue','住宿金額'],['cash','現金'],['creditCard','信用卡'],['wireTransfer','轉帳'],['commission','佣金'],['depositIn','收訂金'],['depositOut','沖訂金']].map(([k,label])=>(
                <div key={k}><label className="block text-xs text-gray-500 mb-1">{label}</label><input type="number" className="border rounded px-2 py-1.5 w-full text-sm" value={form[k]} onChange={f(k)} step="1" /></div>
              ))}
            </div>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">備註</label><input className="border rounded px-2 py-1.5 w-full text-sm" value={form.note} onChange={f('note')} /></div>
          {err && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded text-gray-600">取消</button>
          <button onClick={submit} disabled={saving} className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50">{saving?'新增中…':'確認新增'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Duplicate Scan Modal ──
function DuplicateScanModal({ warehouse, month, onClose }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');
  const [toDelete, setToDelete] = useState(new Set()); // record IDs to delete

  useEffect(() => {
    const params = new URLSearchParams();
    if (warehouse) params.set('warehouse', warehouse);
    if (month) params.set('month', month);
    fetch(`/api/pms-income/reservations/duplicates?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setGroups(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [warehouse, month]);

  // Auto-select the newer duplicates (keep lowest ID, delete rest)
  const selectNewerDuplicates = () => {
    const ids = new Set();
    for (const g of groups) {
      const sorted = [...g.records].sort((a,b)=>a.id-b.id);
      sorted.slice(1).forEach(r => ids.add(r.id)); // keep first, delete rest
    }
    setToDelete(ids);
  };

  const deleteDuplicates = async () => {
    if (toDelete.size === 0) { setMsg('請先勾選要刪除的記錄'); return; }
    setDeleting(true); setMsg('');
    try {
      const res = await fetch('/api/pms-income/reservations/duplicates', {
        method:'DELETE', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ids: [...toDelete] }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg(`已刪除 ${json.deleted} 筆重複記錄`);
        setGroups(prev => prev.map(g => ({
          ...g, records: g.records.filter(r => !toDelete.has(r.id))
        })).filter(g => g.records.length > 1));
        setToDelete(new Set());
      } else setMsg(json.error?.message||'刪除失敗');
    } catch { setMsg('網路錯誤'); } finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center px-5 py-3 border-b flex-shrink-0">
          <h3 className="font-semibold text-sm">重複記錄掃描{month?` — ${month}`:''}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {loading ? <div className="text-center py-8 text-gray-400">掃描中…</div>
          : groups.length === 0 ? <div className="text-center py-8 text-green-600">✓ 未發現重複記錄</div>
          : (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-amber-700">發現 {groups.length} 組重複（共 {groups.reduce((s,g)=>s+g.records.length,0)} 筆）</span>
                <button onClick={selectNewerDuplicates} className="text-xs px-2 py-1 border border-amber-400 text-amber-700 rounded hover:bg-amber-50">自動選取較新記錄</button>
              </div>
              {groups.map(g => (
                <div key={g.key} className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    {g.records[0]?.businessDate} · {g.records[0]?.guestName||'—'} · 房號 {g.records[0]?.roomNo||'—'} ({g.count} 筆)
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left w-8">刪</th>
                        <th className="px-3 py-1.5 text-left">ID</th>
                        <th className="px-3 py-1.5 text-left">批次</th>
                        <th className="px-3 py-1.5 text-right">金額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.records.map((r, ri) => (
                        <tr key={r.id} className={`border-t ${ri===0?'bg-green-50':toDelete.has(r.id)?'bg-red-50':''}`}>
                          <td className="px-3 py-1.5">
                            {ri===0 ? <span className="text-green-600 text-xs">保留</span>
                            : <input type="checkbox" checked={toDelete.has(r.id)}
                                onChange={()=>{const n=new Set(toDelete);n.has(r.id)?n.delete(r.id):n.add(r.id);setToDelete(n);}} />}
                          </td>
                          <td className="px-3 py-1.5 font-mono">{r.id}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.batchId}</td>
                          <td className="px-3 py-1.5 text-right">{Number(r.totalRevenue).toLocaleString('zh-TW')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="border-t px-5 py-3 flex items-center gap-3 flex-shrink-0">
          {msg && <span className={`text-xs ${msg.includes('失敗')||msg.includes('錯誤')?'text-red-600':'text-green-600'}`}>{msg}</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded text-gray-600">關閉</button>
            {groups.length > 0 && (
              <button onClick={deleteDuplicates} disabled={deleting||toDelete.size===0}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                {deleting?'刪除中…':`刪除已選 ${toDelete.size} 筆`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──
export default function PmsIncomeReservationTab({ WAREHOUSES = [] }) {
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0]||'');
  const [useRange, setUseRange] = useState(false);
  const [month, setMonth] = useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // cross-month guest search
  const [sourceFilter, setSourceFilter] = useState('全部');
  const [depositFilter, setDepositFilter] = useState('全部');
  const [ccFilter, setCcFilter] = useState('全部');
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDupModal, setShowDupModal] = useState(false);

  // Settlement lock
  const [isSettled, setIsSettled] = useState(false);

  // Row selection（批次核對、推廠商共用）
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batching, setBatching] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');

  // Push mode（填廠商帳單 ID）
  const [pushMode, setPushMode] = useState(false);
  const [billingId, setBillingId] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  // Reclassify
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassMsg, setReclassMsg] = useState('');

  // 客戶端欄位排序
  const [sortKey, setSortKey] = useState('businessDate');
  const [sortDir, setSortDir] = useState('desc');

  const toggleSort = useCallback((key) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      const descFirst = ['businessDate', 'totalRevenue', 'cash', 'creditCard', 'commission'].includes(key);
      setSortDir(descFirst ? 'desc' : 'asc');
      return key;
    });
  }, []);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => compareReservationSort(a, b, sortKey, sortDir));
    return arr;
  }, [rows, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '1000' });
      if (warehouse) params.set('warehouse', warehouse);
      if (searchTerm.trim()) {
        // Cross-month search mode — no date filter
        params.set('guestName', searchTerm.trim());
      } else if (useRange) {
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
      } else {
        if (month) params.set('month', month);
      }
      if (sourceFilter !== '全部') params.set('source', sourceFilter);
      if (depositFilter !== '全部') params.set('depositStatus', depositFilter);
      if (ccFilter !== '全部') params.set('creditCardStatus', ccFilter);
      if (onlyOverridden) params.set('onlyOverridden', '1');
      const res = await fetch(`/api/pms-income/reservations?${params}`);
      if (res.ok) setRows(await res.json());
    } finally { setLoading(false); }
  }, [warehouse, useRange, month, dateFrom, dateTo, searchTerm, sourceFilter, depositFilter, ccFilter, onlyOverridden]);

  useEffect(() => { load(); }, [load]);

  // Check settlement status for current month
  useEffect(() => {
    if (!warehouse || useRange || searchTerm || !month) { setIsSettled(false); return; }
    const [y, m] = month.split('-');
    fetch(`/api/pms-income/batches?warehouse=${encodeURIComponent(warehouse)}&year=${y}&month=${parseInt(m)}`)
      .then(r => r.ok ? r.json() : [])
      .then(batches => setIsSettled(batches.some(b => b.status === '已結算')))
      .catch(() => setIsSettled(false));
  }, [warehouse, month, useRange, searchTerm]);

  async function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id===id ? {...r,...patch} : r));
    const res = await fetch(`/api/pms-income/reservations/${id}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch),
    });
    if (!res.ok) { load(); }
    else { const u=await res.json(); setRows(prev=>prev.map(r=>r.id===id?{...r,...u}:r)); }
  }

  async function deleteRow(id) {
    if (!confirm('確定刪除此訂房記錄？此操作無法還原。')) return;
    const res = await fetch(`/api/pms-income/reservations/${id}`, { method:'DELETE' });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
    else { const j=await res.json(); alert(j.error?.message||'刪除失敗'); }
  }

  async function batchUpdate(patch) {
    if (selectedIds.size === 0) { setBatchMsg('請勾選要更新的訂單'); return; }
    setBatching(true); setBatchMsg('');
    try {
      const res = await fetch('/api/pms-income/reservations/bulk-patch', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ids:[...selectedIds], patch }),
      });
      const json = await res.json();
      if (res.ok) {
        setBatchMsg(`已更新 ${json.updated} 筆`);
        setRows(prev=>prev.map(r=>selectedIds.has(r.id)?{...r,...patch}:r));
        setSelectedIds(new Set());
      } else setBatchMsg(json.error?.message||'更新失敗');
    } catch { setBatchMsg('網路錯誤'); } finally { setBatching(false); }
  }

  async function pushToVendorBilling() {
    if (!billingId) { setPushMsg('請輸入廠商帳單 ID'); return; }
    if (selectedIds.size === 0) { setPushMsg('請勾選要推送的訂單'); return; }
    setPushing(true); setPushMsg('');
    try {
      const res = await fetch('/api/pms-income/vendor-billing/push-reservations', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({billingId:parseInt(billingId),reservationIds:[...selectedIds]}),
      });
      const json = await res.json();
      if (res.ok) { setPushMsg(`已推送 ${json.count} 筆`); setSelectedIds(new Set()); setPushMode(false); load(); }
      else setPushMsg(json.error?.message||'推送失敗');
    } catch { setPushMsg('網路錯誤'); } finally { setPushing(false); }
  }

  async function reclassify() {
    setReclassifying(true); setReclassMsg('');
    try {
      const res = await fetch('/api/pms-income/reservations/reclassify', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({warehouse,month}),
      });
      const json = await res.json();
      if (res.ok) { setReclassMsg(`已重新分類 ${json.updated} 筆`); load(); }
      else setReclassMsg(json.error?.message||'失敗');
    } catch { setReclassMsg('網路錯誤'); } finally { setReclassifying(false); }
  }

  const totalRevenue = rows.reduce((s,r)=>s+(r.totalRevenue||0),0);
  const totalCC = rows.reduce((s,r)=>s+(r.creditCard||0),0);
  const totalCommission = rows.reduce((s,r)=>s+(r.commission||0),0);
  const reconCount = rows.filter(r=>r.creditCardStatus==='已核對').length;
  const depositDoneCount = rows.filter(r=>r.depositIn>0&&r.depositStatus==='已核對').length;
  const depositTotalCount = rows.filter(r=>r.depositIn>0).length;
  const overriddenCount = rows.filter(r=>r.sourceOverride).length;

  const sourceCounts = {};
  for (const r of rows) { const s=r.sourceOverride||r.source; sourceCounts[s]=(sourceCounts[s]||0)+1; }

  const locked = isSettled;
  /** 未結算時永遠顯示列勾選（批次核對／推廠商共用） */
  const showRowSelection = !locked;

  return (
    <div className="space-y-3">
      {/* Settlement lock banner */}
      {isSettled && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800">
          <span className="text-base">🔒</span>
          <span>此月份已完成結算，所有欄位為唯讀模式。如需修改請先至「月度結算」頁面取消結算。</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-gray-100 rounded-xl px-3 py-3 flex flex-wrap gap-2 items-end shadow-sm">
        <div>
          <label className="block text-xs text-gray-400 mb-1">館別</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={warehouse} onChange={e=>setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w=><option key={w} value={w}>{w}</option>)}
          </select>
        </div>

        {/* Search box — when filled, overrides date filter */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">住客搜尋（跨月）</label>
          <div className="flex gap-1 items-center">
            <input className="border rounded-lg px-2 py-1.5 text-sm w-32" placeholder="住客名稱…"
              value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')load();}}
            />
            {searchTerm && <button onClick={()=>setSearchTerm('')} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>}
          </div>
        </div>

        {!searchTerm && (
          <div>
            <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
              {useRange?'日期區間':'月份'}
              <button onClick={()=>setUseRange(r=>!r)} className="text-blue-500 hover:underline text-xs ml-1">{useRange?'切回月份':'切換區間'}</button>
            </label>
            {useRange ? (
              <div className="flex gap-1 items-center">
                <input type="date" className="border rounded-lg px-2 py-1.5 text-sm" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
                <span className="text-gray-300">~</span>
                <input type="date" className="border rounded-lg px-2 py-1.5 text-sm" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
              </div>
            ) : (
              <input type="month" className="border rounded-lg px-2 py-1.5 text-sm" value={month} onChange={e=>setMonth(e.target.value)} />
            )}
          </div>
        )}

        <div className="hidden sm:block">
          <label className="block text-xs text-gray-400 mb-1">來源</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}>
            {SOURCE_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="hidden sm:block">
          <label className="block text-xs text-gray-400 mb-1">訂金</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={depositFilter} onChange={e=>setDepositFilter(e.target.value)}>
            {DEPOSIT_STATUS_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="hidden sm:block">
          <label className="block text-xs text-gray-400 mb-1">信用卡</label>
          <select className="border rounded-lg px-2 py-1.5 text-sm" value={ccFilter} onChange={e=>setCcFilter(e.target.value)}>
            {CC_STATUS_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        <div className="flex gap-1.5 items-end flex-wrap">
          <button onClick={load} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">整理</button>
          <button onClick={()=>downloadCsv(rows)} disabled={!rows.length} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40">↓ CSV</button>
          <button onClick={()=>downloadXlsx(rows,month,warehouse)} disabled={!rows.length} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">↓ XLSX</button>
          {!locked && <>
            <button onClick={()=>{setPushMode(m=>!m);setPushMsg('');}}
              className={`px-3 py-1.5 text-sm rounded-lg ${pushMode?'bg-purple-600 text-white':'border border-purple-400 text-purple-600 hover:bg-purple-50'}`}>
              {pushMode?'取消推廠商':'推廠商'}
            </button>
            <button onClick={()=>setShowAddModal(true)} className="px-3 py-1.5 text-sm rounded-lg border border-teal-400 text-teal-600 hover:bg-teal-50">+ 手動新增</button>
            {!useRange && <button onClick={reclassify} disabled={reclassifying} className="px-3 py-1.5 text-sm border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 disabled:opacity-40">{reclassifying?'…':'重分類'}</button>}
            <button onClick={()=>setShowDupModal(true)} className="px-3 py-1.5 text-sm border border-red-300 text-red-500 rounded-lg hover:bg-red-50">掃描重複</button>
          </>}
          {reclassMsg && <span className="text-xs text-green-600">{reclassMsg}</span>}
        </div>
      </div>

      {/* Source override filter toggle */}
      {overriddenCount > 0 && (
        <button onClick={()=>setOnlyOverridden(o=>!o)}
          className={`text-xs px-3 py-1 rounded-full border transition-all ${onlyOverridden?'bg-orange-100 border-orange-400 text-orange-700':'border-orange-200 text-orange-500 hover:bg-orange-50'}`}>
          {onlyOverridden?'✕ 清除篩選 · ':''}{overriddenCount} 筆已覆寫來源{onlyOverridden?'（顯示中）':'（點擊篩選）'}
        </button>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          {label:'訂單', value:`${rows.length} 筆`},
          {label:'總收入', value:totalRevenue?totalRevenue.toLocaleString('zh-TW'):'—'},
          {label:'信用卡', value:totalCC?totalCC.toLocaleString('zh-TW'):'—'},
          {label:'信用卡已核', value:`${reconCount} / ${rows.length}`, ok:reconCount===rows.length&&rows.length>0},
          {label:'訂金已核', value:depositTotalCount?`${depositDoneCount} / ${depositTotalCount}`:'—', ok:depositDoneCount===depositTotalCount&&depositTotalCount>0},
        ].map(k=>(
          <div key={k.label} className={`border rounded-xl px-3 py-2 ${k.ok?'bg-green-50 border-green-200':'bg-white border-gray-100'}`}>
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className={`text-base font-bold ${k.ok?'text-green-700':'text-gray-800'}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Source chips */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(sourceCounts).map(([src,cnt])=>(
          <button key={src} onClick={()=>setSourceFilter(sourceFilter===src?'全部':src)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all ${SOURCE_COLORS[src]||'bg-gray-100 text-gray-700'} ${sourceFilter===src?'ring-2 ring-offset-1 ring-blue-400':'hover:opacity-80'}`}>
            {src}: {cnt}
          </button>
        ))}
        {sourceFilter!=='全部' && <button onClick={()=>setSourceFilter('全部')} className="px-2 py-0.5 rounded-full text-xs text-gray-400 hover:text-gray-600">✕ 清除</button>}
      </div>

      {!locked && (
        <div className="text-xs text-gray-400 flex gap-3 flex-wrap">
          <span>💡 直接點擊表格內可編輯：</span>
          <span className="text-blue-500">來源</span>·<span className="text-orange-500">金額</span>·<span className="text-green-600">訂金狀態</span>·<span className="text-green-600">信用卡核對</span>·<span className="text-gray-500">備註</span>
          <span className="text-purple-400">— ↗ 推廠商帳單</span>
          <span className="text-gray-500">欄位標題 ▲▼ 可排序</span>
          <span className="text-red-400">· 🗑 刪除</span>
        </div>
      )}

      {/* 列選取：全選 + 批次確認（緊接在表格上方） */}
      {!locked && rows.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center text-sm">
          <span className="text-indigo-800 font-medium">已選 {selectedIds.size} 筆</span>
          <button type="button" onClick={()=>setSelectedIds(new Set(sortedRows.map(r=>r.id)))} className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-700 hover:bg-white">全選</button>
          <button type="button" onClick={()=>setSelectedIds(new Set())} className="text-xs text-gray-500 hover:underline">清除</button>
          <span className="text-gray-300 hidden sm:inline">|</span>
          <button type="button" onClick={()=>batchUpdate({ creditCardStatus: '已核對' })} disabled={batching || selectedIds.size === 0} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg disabled:opacity-50">{batching ? '…' : '批次·信用卡已核'}</button>
          <button type="button" onClick={()=>batchUpdate({ depositStatus: '已核對' })} disabled={batching || selectedIds.size === 0} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg disabled:opacity-50">批次·訂金已核</button>
          <button type="button" onClick={()=>batchUpdate({ creditCardStatus: '已核對', depositStatus: '已核對' })} disabled={batching || selectedIds.size === 0} className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg disabled:opacity-50">批次·兩項已核</button>
          {batchMsg && <span className="text-xs text-green-700">{batchMsg}</span>}
        </div>
      )}

      {pushMode && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center text-sm">
          <span className="text-purple-700">已勾選 {selectedIds.size} 筆（與表格勾選共用）</span>
          <input type="number" className="border rounded px-2 py-1 text-sm w-24" value={billingId} onChange={e=>setBillingId(e.target.value)} placeholder="帳單 ID" />
          <button type="button" onClick={pushToVendorBilling} disabled={pushing} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg disabled:opacity-50">{pushing?'推送中…':'確認推送'}</button>
          {pushMsg && <span className="text-xs text-green-600">{pushMsg}</span>}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">載入中…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {searchTerm ? `找不到「${searchTerm}」的住客記錄` : '尚無訂房明細資料'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {showRowSelection && (
                  <th className="px-2 py-2 w-10 align-middle bg-gray-50">
                    <input
                      type="checkbox"
                      aria-label="全選此頁"
                      checked={selectedIds.size === sortedRows.length && sortedRows.length > 0}
                      onChange={() => {
                        setSelectedIds(
                          selectedIds.size === sortedRows.length ? new Set() : new Set(sortedRows.map((r) => r.id))
                        );
                      }}
                    />
                  </th>
                )}
                <SortTh label="日期" sortKey="businessDate" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortTh label="房號" sortKey="roomNo" activeKey={sortKey} dir={sortDir} onSort={toggleSort} className="!px-2" />
                <SortTh label="住客" sortKey="guestName" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortTh
                  label="公司"
                  sortKey="companyName"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  className="hidden md:table-cell"
                />
                <SortTh
                  label={`來源${!locked ? ' ✎' : ''}`}
                  sortKey="source"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  align="center"
                />
                <SortTh label="住宿金額" sortKey="totalRevenue" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortTh
                  label="現金"
                  sortKey="cash"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  align="right"
                  className="hidden md:table-cell"
                />
                <SortTh label="信用卡" sortKey="creditCard" activeKey={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                <SortTh
                  label="佣金"
                  sortKey="commission"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  align="right"
                  className="hidden md:table-cell"
                />
                <SortTh
                  label={`訂金${!locked ? ' ✎' : ''}`}
                  sortKey="depositStatus"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  align="center"
                  className="whitespace-nowrap"
                />
                <SortTh
                  label={`信用卡核對${!locked ? ' ✎' : ''}`}
                  sortKey="creditCardStatus"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  align="center"
                  className="whitespace-nowrap hidden sm:table-cell"
                />
                <th className="px-2 py-2 text-xs text-gray-500 text-center hidden sm:table-cell whitespace-nowrap">付款</th>
                <SortTh
                  label={`備註${!locked ? ' ✎' : ''}`}
                  sortKey="note"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  className="hidden lg:table-cell"
                />
                <th className="px-2 py-2 w-14 bg-gray-50" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedRows.map((r) => {
                const hasAnomaly = !r.totalRevenue && !r.cash && !r.creditCard && !r.wireTransfer;
                const isSel = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`transition-colors ${
                      isSel ? 'bg-indigo-50/90' : hasAnomaly ? 'bg-orange-50/60' : 'hover:bg-blue-50/40'
                    }`}
                  >
                    {showRowSelection && (
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => {
                            const n = new Set(selectedIds);
                            if (n.has(r.id)) n.delete(r.id);
                            else n.add(r.id);
                            setSelectedIds(n);
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs text-gray-600">{r.businessDate}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-500">{r.roomNo || '—'}</td>
                    <td className="px-3 py-1.5 max-w-[120px] truncate font-medium text-gray-800" title={r.guestName}>
                      {r.guestName || '—'}
                    </td>
                    <td className="px-3 py-1.5 max-w-[100px] truncate text-xs text-gray-400 hidden md:table-cell" title={r.companyName}>
                      {r.companyName || ''}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <SourceCell row={r} onSave={(p) => updateRow(r.id, p)} locked={locked} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <AmountCell row={r} field="totalRevenue" onSave={(p) => updateRow(r.id, p)} locked={locked} className="text-gray-700" />
                    </td>
                    <td className="px-3 py-1.5 text-right hidden md:table-cell">
                      <AmountCell row={r} field="cash" onSave={(p) => updateRow(r.id, p)} locked={locked} className="text-gray-600" />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <AmountCell row={r} field="creditCard" onSave={(p) => updateRow(r.id, p)} locked={locked} className="text-gray-700" />
                    </td>
                    <td className="px-3 py-1.5 text-right hidden md:table-cell">
                      <AmountCell row={r} field="commission" onSave={(p) => updateRow(r.id, p)} locked={locked} className="text-red-600" />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <DepositBadge row={r} onSave={(p) => updateRow(r.id, p)} locked={locked} />
                    </td>
                    <td className="px-3 py-1.5 text-center hidden sm:table-cell">
                      <CCBadge row={r} onSave={(p) => updateRow(r.id, p)} locked={locked} />
                    </td>
                    <td className="px-2 py-1.5 text-center hidden sm:table-cell">
                      <div className="flex gap-1 justify-center items-center">
                        <span
                          className={`w-2 h-2 rounded-full ${r.cash > 0 ? 'bg-green-400' : 'bg-gray-200'}`}
                          title={`現金: ${r.cash > 0 ? r.cash.toLocaleString('zh-TW') : '無'}`}
                        />
                        <span
                          className={`w-2 h-2 rounded-full ${r.creditCard > 0 && r.creditCardStatus === '已核對' ? 'bg-green-400' : r.creditCard > 0 ? 'bg-amber-400' : 'bg-gray-200'}`}
                          title={`信用卡: ${r.creditCard > 0 ? r.creditCard.toLocaleString('zh-TW') : '無'} (${r.creditCardStatus})`}
                        />
                        <span
                          className={`w-2 h-2 rounded-full ${r.commission > 0 ? 'bg-green-400' : 'bg-gray-200'}`}
                          title={`佣金: ${r.commission > 0 ? r.commission.toLocaleString('zh-TW') : '無'}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 hidden lg:table-cell">
                      <NoteCell row={r} onSave={(p) => updateRow(r.id, p)} locked={locked} />
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      <button onClick={() => setDetailRow(r)} className="text-gray-300 hover:text-gray-500 text-xs mr-1" title="詳情">
                        ⋯
                      </button>
                      {!locked && (
                        <>
                          <button
                            onClick={() => {
                              setPushMode(true);
                              setSelectedIds(new Set([r.id]));
                            }}
                            className="text-purple-200 hover:text-purple-500 text-xs mr-1"
                            title="推送至廠商帳單"
                          >
                            ↗
                          </button>
                          <button onClick={() => deleteRow(r.id)} className="text-red-200 hover:text-red-500 text-xs" title="刪除">
                            🗑
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold border-t-2 border-gray-200">
              <tr>
                <td colSpan={showRowSelection ? 6 : 5} className="px-3 py-2 text-gray-500">
                  合計 {rows.length} 筆
                </td>
                <td className="px-3 py-2 text-right text-gray-700">{totalRevenue ? totalRevenue.toLocaleString('zh-TW') : '—'}</td>
                <td className="px-3 py-2 text-right hidden md:table-cell">{rows.reduce((s, r) => s + (r.cash || 0), 0) || ''}</td>
                <td className="px-3 py-2 text-right">{totalCC ? totalCC.toLocaleString('zh-TW') : ''}</td>
                <td className="px-3 py-2 text-right text-red-600 hidden md:table-cell">
                  {totalCommission ? totalCommission.toLocaleString('zh-TW') : ''}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {detailRow && <DetailModal row={detailRow} onClose={()=>setDetailRow(null)} onSave={p=>{updateRow(detailRow.id,p);setDetailRow(null);}} />}
      {showAddModal && <AddReservationModal warehouse={warehouse} month={!useRange?month:undefined} onClose={()=>setShowAddModal(false)} onSave={newRow=>{setRows(prev=>[newRow,...prev]);setShowAddModal(false);}} />}
      {showDupModal && <DuplicateScanModal warehouse={warehouse} month={!useRange&&!searchTerm?month:undefined} onClose={()=>{setShowDupModal(false);load();}} />}
    </div>
  );
}
