'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import ExportButtons from '@/components/ExportButtons';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;

// ── 匯出欄位定義 ──────────────────────────────────────────────────
const BOOKING_EXPORT_COLS = [
  { header: '來源',     key: 'source' },
  { header: '姓名',     key: 'guestName' },
  { header: '房間',     key: 'roomNo' },
  { header: '入住日期', key: 'checkInDate' },
  { header: '退房日期', key: 'checkOutDate' },
  { header: '房費',     key: 'roomCharge',  format: 'number' },
  { header: '消費',     key: 'otherCharge', format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',  format: 'number' },
  { header: '匯款日期', key: 'depositDate' },
  { header: '帳號後五碼',key: 'depositLast5' },
  { header: '刷卡',     key: 'payCard',     format: 'number' },
  { header: '刷卡手續費',key:'cardFee',     format: 'number' },
  { header: '現金',     key: 'payCash',     format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',  format: 'number' },
  { header: '狀態',     key: 'status' },
  { header: '備註',     key: 'note' },
];

const MONTHLY_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '間數',     key: 'rooms',        format: 'number' },
  { header: '住宿房費', key: 'totalRevenue', format: 'number' },
  { header: '其他消費', key: 'otherCharge',  format: 'number' },
  { header: '訂金匯款', key: 'payDeposit',   format: 'number' },
  { header: '刷卡',     key: 'payCard',      format: 'number' },
  { header: '現金',     key: 'payCash',      format: 'number' },
  { header: '住宿卷',   key: 'payVoucher',   format: 'number' },
  { header: '手續費',   key: 'cardFee',      format: 'number' },
  { header: '淨收入',   key: 'netRevenue',   format: 'number' },
];

const PNL_EXPORT_COLS = [
  { header: '月份',     key: 'month' },
  { header: '住宿淨收入',key:'netRevenue',    format: 'number' },
  { header: '其他收入', key: 'otherIncome',   format: 'number' },
  { header: '收入合計', key: 'incomeTotal',   format: 'number' },
  { header: '採購支出', key: 'purchaseExpense',format:'number' },
  { header: '固定費用', key: 'fixedExpense',  format: 'number' },
  { header: '支出合計', key: 'totalExpense',  format: 'number' },
  { header: '淨利',     key: 'pnlNetProfit',  format: 'number' },
];

// ── 列印輔助函式 ──────────────────────────────────────────────────
function openPrintWindow(title, headers, rows) {
  const thHtml = headers.map(h => `<th>${h}</th>`).join('');
  const trHtml = rows.map(r =>
    `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`
  ).join('');
  const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: '微軟正黑體','Arial',sans-serif; font-size:11px; margin:12px; }
  h2 { font-size:14px; margin-bottom:6px; }
  p.sub { font-size:10px; color:#666; margin-bottom:8px; }
  table { border-collapse:collapse; width:100%; }
  th,td { border:1px solid #ccc; padding:4px 6px; white-space:nowrap; }
  th { background:#e8edf8; font-weight:bold; text-align:center; }
  td { text-align:right; }
  td:first-child,td:nth-child(2) { text-align:left; }
  tr:nth-child(even) { background:#f8f9fc; }
  .footer { margin-top:8px; font-size:9px; color:#aaa; }
</style></head><body>
<h2>${title}</h2>
<p class="sub">列印時間：${new Date().toLocaleString('zh-TW')}</p>
<table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table>
<p class="footer">自在海民宿 ERP 系統</p>
</body></html>`;
  const w = window.open('', '_blank', 'width=1100,height=700');
  if (!w) { alert('請允許彈出視窗以進行列印'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}
const TABS = [
  { key: 'records',    label: '訂房明細' },
  { key: 'import',     label: '雲掌櫃匯入' },
  { key: 'dailyRev',   label: '每日收入' },
  { key: 'monthly',    label: '月收入總表' },
  { key: 'pnl',        label: '月收支總表' },
  { key: 'declaration',label: '旅宿網申報' },
  { key: 'declList',   label: '年度申報總覽' },
  { key: 'deposit',    label: '訂金核對' },
  { key: 'otaRecon',   label: 'OTA比對' },
];

const STATUS_COLORS = {
  '已退房': 'bg-gray-100 text-gray-600',
  '已入住': 'bg-green-100 text-green-700',
  '已預訂': 'bg-blue-100 text-blue-700',
  '已刪除': 'bg-red-100 text-red-500',
};
const SOURCE_COLORS = {
  'Booking': 'bg-indigo-100 text-indigo-700',
  '電話':    'bg-amber-100 text-amber-700',
  '其他':    'bg-gray-100 text-gray-600',
};

// ── 子元件：付款編輯 Modal ────────────────────────────────────────
function PaymentModal({ record, onClose, onSaved }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    payDeposit:   record.payDeposit   || 0,
    depositDate:  record.depositDate  || '',
    depositLast5: record.depositLast5 || '',
    payCard:      record.payCard      || 0,
    payCash:      record.payCash      || 0,
    payVoucher:   record.payVoucher   || 0,
    cardFeeRate:  record.cardFeeRate  || 0.0165,
    note:         record.note         || '',
  });
  const [saving, setSaving] = useState(false);
  const cardFee = (Number(form.payCard) * Number(form.cardFeeRate)).toFixed(0);
  const total = Number(form.payDeposit) + Number(form.payCard) + Number(form.payCash) + Number(form.payVoucher);
  const hasDeposit = Number(form.payDeposit) > 0;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bnb/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cardFeeRate: parseFloat(form.cardFeeRate) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || '儲存失敗', 'error');
        return;
      }
      showToast('付款明細已儲存', 'success');
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-800">付款明細 — {record.guestName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{record.checkInDate} ～ {record.checkOutDate}　{record.roomNo || ''}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">訂金匯款</label>
            <input type="number" min="0" value={form.payDeposit}
              onChange={e => setForm(p => ({ ...p, payDeposit: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasDeposit && (
            <div className="ml-2 pl-4 border-l-2 border-blue-200 space-y-2">
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-blue-600 shrink-0">匯款日期</label>
                <input type="date" value={form.depositDate}
                  onChange={e => setForm(p => ({ ...p, depositDate: e.target.value }))}
                  className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-blue-600 shrink-0">帳號後五碼</label>
                <input type="text" maxLength={5} placeholder="例：12345" value={form.depositLast5}
                  onChange={e => setForm(p => ({ ...p, depositLast5: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                  className="w-28 border border-blue-200 rounded-lg px-3 py-1.5 text-sm tracking-widest focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
            </div>
          )}
          {[['payCard','刷卡金額'],['payCash','現金'],['payVoucher','住宿卷']].map(([k,label]) => (
            <div key={k} className="flex items-center gap-3">
              <label className="w-24 text-sm text-gray-600 shrink-0">{label}</label>
              <input type="number" min="0" value={form[k]}
                onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">手續費率</label>
            <input type="number" step="0.0001" min="0" max="1" value={form.cardFeeRate}
              onChange={e => setForm(p => ({ ...p, cardFeeRate: e.target.value }))}
              className="w-28 border rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-xs text-gray-400">手續費 NT${Number(cardFee).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">備註</label>
            <input type="text" value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div className="pt-2 border-t flex justify-between items-center text-sm">
            <span className="text-gray-500">合計收款</span>
            <span className="font-bold text-gray-800">NT${Number(total).toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>房費</span><span>NT${Number(record.roomCharge).toLocaleString()}</span>
          </div>
          {Number(total) !== Number(record.roomCharge) + Number(record.otherCharge) && (
            <p className="text-xs text-amber-600">⚠ 收款合計與房費+消費（NT${(Number(record.roomCharge)+Number(record.otherCharge)).toLocaleString()}）不符</p>
          )}
        </div>
        <div className="p-4 flex gap-2 justify-end border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────
// ── 付款欄位順序（Excel Tab 跳格用）────────────────────────────
const PAY_FIELDS = ['payDeposit', 'depositLast5', 'payCard', 'payCash', 'payVoucher'];

export default function BnbPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('records');

  // 是否有鎖帳權限
  const canLock = session?.user?.role === 'admin'
    || (session?.user?.permissions || []).includes('bnb.lock')
    || (session?.user?.permissions || []).includes('bnb.edit');

  // ── 訂房明細 state ────────────────────────────────────────────
  const [records, setRecords]       = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editRecord, setEditRecord] = useState(null);

  // ── 批次填入 state ────────────────────────────────────────────
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [batchField,    setBatchField]    = useState('status');
  const [batchValue,    setBatchValue]    = useState('');
  const [batchApplying, setBatchApplying] = useState(false);

  // ── Inline edit state ─────────────────────────────────────────
  const [inlineEdit,  setInlineEdit]  = useState(null); // { id, field }
  const [inlineValue, setInlineValue] = useState('');

  // ── Excel 模式 state ──────────────────────────────────────────
  const [editMode,    setEditMode]    = useState(false);
  const [editMap,     setEditMap]     = useState({});  // { [id]: { payDeposit, depositLast5, payCard, payCash, payVoucher } }
  const [dirtyIds,    setDirtyIds]    = useState(new Set());
  const [batchSaving, setBatchSaving] = useState(false);
  const [locking,     setLocking]     = useState(false);

  // ── 雲掌櫃匯入 state ─────────────────────────────────────────
  const [importFile,    setImportFile]    = useState(null);
  const [importMonth,   setImportMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [importWarehouse, setImportWarehouse] = useState('民宿');
  const [importReplace, setImportReplace] = useState(true);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);

  // ── 每日收入 state ──────────────────────────────────────────
  const [drMonth,      setDrMonth]      = useState(() => new Date().toISOString().slice(0, 7));
  const [drWarehouse,  setDrWarehouse]  = useState('民宿');
  const [drData,       setDrData]       = useState(null);
  const [drLoading,    setDrLoading]    = useState(false);
  const [drExpandDay,  setDrExpandDay]  = useState(null);

  // ── 月彙整 state ─────────────────────────────────────────────
  const [summaryYear,    setSummaryYear]    = useState(() => new Date().getFullYear().toString());
  const [summaryRows,    setSummaryRows]    = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── 館別清單 state ────────────────────────────────────────────
  const [warehouseList, setWarehouseList] = useState([]);

  // ── 訂金核對 state ────────────────────────────────────────────
  const [dmMonth,       setDmMonth]       = useState(() => new Date().toISOString().slice(0, 7));
  const [dmWarehouse,   setDmWarehouse]   = useState('');
  const [dmAccountId,   setDmAccountId]   = useState('');
  const [dmData,        setDmData]        = useState(null);
  const [dmLoading,     setDmLoading]     = useState(false);
  const [dmAccounts,    setDmAccounts]    = useState([]);
  const [dmSelBnb,      setDmSelBnb]      = useState(null);  // selected BNB id
  const [dmSelLine,     setDmSelLine]     = useState(null);  // selected bank line id
  const [dmMatching,    setDmMatching]    = useState(false);

  // ── 旅宿網申報 state ─────────────────────────────────────────
  const [declMonth,     setDeclMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [declWarehouse, setDeclWarehouse] = useState('民宿');
  const [declActual,    setDeclActual]    = useState(null);  // 實際資料（auto-computed）
  const [declForm, setDeclForm] = useState({
    cardTotal: '', roomPriceTotal: '', subsidizedRooms: '',
    avgRoomRate: '', monthlyRoomCount: '', roomSuppliesCost: '', fbExpense: '',
    fitGuestCount: '', staffCount: '', salary: '', businessSource: '其他100%',
    otherIncome: '', otherIncomeNote: '', note: '',
  });
  const [declSaving, setDeclSaving] = useState(false);
  const [declLoading, setDeclLoading] = useState(false);
  const [declSearched, setDeclSearched] = useState(false);

  // ── 年度申報總覽 state ─────────────────────────────────────
  const [dlYear,    setDlYear]    = useState(() => new Date().getFullYear().toString());
  const [dlWarehouse, setDlWarehouse] = useState('民宿');
  const [dlRows,    setDlRows]    = useState([]);
  const [dlLoading, setDlLoading] = useState(false);

  // ── OTA 比對 state ──────────────────────────────────────────
  const [otaSource,    setOtaSource]    = useState('Booking');
  const [otaDateFrom,  setOtaDateFrom]  = useState('');
  const [otaDateTo,    setOtaDateTo]    = useState('');
  const [otaWarehouse, setOtaWarehouse] = useState('民宿');
  const [otaFile,      setOtaFile]      = useState(null);
  const [otaResult,    setOtaResult]    = useState(null);
  const [otaLoading,   setOtaLoading]   = useState(false);
  const [otaViewTab,   setOtaViewTab]   = useState('matched'); // matched | unmatchedOta | unmatchedBnb | cancelled

  // ── 鎖帳 state ──────────────────────────────────────────────
  const [lockStatus, setLockStatus]   = useState(null); // { locked, lockedAt, lockedBy }
  const [lockLoading, setLockLoading] = useState(false);

  // ── 館別清單 + 銀行帳戶 fetch（mount once）────────────────────
  useEffect(() => {
    fetch('/api/warehouse-departments')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.list) {
          setWarehouseList(data.list.filter(w => w.type === 'building').map(w => w.name));
        }
      })
      .catch(() => {});
    fetch('/api/cashflow/accounts')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDmAccounts(data.filter(a => a.type === '銀行存款' && a.isActive)))
      .catch(() => {});
  }, []);

  // ── 鎖帳 fetch / toggle ──────────────────────────────────────
  const fetchLockStatus = useCallback(async (month, warehouse = '民宿') => {
    if (!month) return;
    try {
      const p = new URLSearchParams({ month, warehouse });
      const res = await fetch(`/api/bnb/lock?${p}`);
      if (res.ok) setLockStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  const toggleLock = useCallback(async () => {
    if (lockLoading) return;
    const isLocked = lockStatus?.locked;
    const action = isLocked ? '解鎖' : '鎖帳';
    if (!confirm(`確定要${action}「${filterMonth}」的民宿帳嗎？${isLocked ? '' : '\n鎖帳後所有訂房資料、付款明細、匯入、申報都將無法修改。'}`)) return;
    setLockLoading(true);
    try {
      const p = new URLSearchParams({ month: filterMonth, warehouse: '民宿' });
      const res = isLocked
        ? await fetch(`/api/bnb/lock?${p}`, { method: 'DELETE' })
        : await fetch('/api/bnb/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: filterMonth, warehouse: '民宿' }) });
      if (res.ok) {
        const data = await res.json();
        setLockStatus(data);
        showToast(`${filterMonth} 已${data.locked ? '鎖帳' : '解鎖'}`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `${action}失敗`, 'error');
      }
    } catch { showToast(`${action}失敗`, 'error'); }
    finally { setLockLoading(false); }
  }, [lockStatus, lockLoading, filterMonth]);

  // ── 訂金核對 fetch ────────────────────────────────────────────
  const fetchDepositMatch = useCallback(async () => {
    if (!dmAccountId) { showToast('請先選擇存簿帳戶', 'error'); return; }
    setDmLoading(true);
    try {
      const p = new URLSearchParams({ month: dmMonth, accountId: dmAccountId });
      if (dmWarehouse) p.set('warehouse', dmWarehouse);
      const res = await fetch(`/api/bnb/deposit-match?${p}`);
      if (!res.ok) { showToast('載入核對資料失敗', 'error'); return; }
      setDmData(await res.json());
      setDmSelBnb(null);
      setDmSelLine(null);
    } catch { showToast('載入核對資料失敗', 'error'); }
    finally { setDmLoading(false); }
  }, [dmMonth, dmAccountId, dmWarehouse]);

  // ── 訂金手動配對 ──────────────────────────────────────────────
  async function handleMatch() {
    if (!dmSelBnb || !dmSelLine) return;
    setDmMatching(true);
    try {
      const res = await fetch('/api/bnb/deposit-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bnbId: dmSelBnb, bankLineId: dmSelLine }),
      });
      const d = await res.json();
      if (!res.ok) { showToast(d.message || '配對失敗', 'error'); return; }
      showToast('配對成功', 'success');
      setDmSelBnb(null); setDmSelLine(null);
      fetchDepositMatch();
    } catch { showToast('配對失敗', 'error'); }
    finally { setDmMatching(false); }
  }

  // ── 解除配對 ──────────────────────────────────────────────────
  async function handleUnmatch(bnbId) {
    const res = await fetch(`/api/bnb/deposit-match?bnbId=${bnbId}`, { method: 'DELETE' });
    if (!res.ok) { showToast('解除配對失敗', 'error'); return; }
    showToast('已解除配對', 'success');
    fetchDepositMatch();
  }

  // ── 自動配對（套用全部建議）──────────────────────────────────
  async function handleAutoMatch() {
    const suggestions = dmData?.suggestions || [];
    if (!suggestions.length) { showToast('目前沒有可自動配對的項目', 'info'); return; }
    setDmMatching(true);
    let count = 0;
    try {
      for (const s of suggestions) {
        const res = await fetch('/api/bnb/deposit-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bnbId: s.bnbId, bankLineId: s.bankLineId }),
        });
        if (res.ok) count++;
      }
      showToast(`自動配對完成：${count} 筆`, 'success');
      fetchDepositMatch();
    } catch { showToast('自動配對發生錯誤', 'error'); }
    finally { setDmMatching(false); }
  }

  // ── 訂房明細 fetch ────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setRecLoading(true);
    try {
      const p = new URLSearchParams({ month: filterMonth });
      if (filterSource) p.set('source', filterSource);
      if (filterStatus) p.set('status', filterStatus);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) { showToast('載入訂房記錄失敗', 'error'); return; }
      setRecords(await res.json());
    } catch { showToast('載入訂房記錄失敗', 'error'); }
    finally { setRecLoading(false); }
  }, [filterMonth, filterSource, filterStatus]);

  // ── 月彙整 fetch ──────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/bnb/monthly-summary?year=${summaryYear}`);
      if (!res.ok) { showToast('載入月彙整失敗', 'error'); return; }
      const data = await res.json();
      setSummaryRows(data.rows || []);
    } catch { showToast('載入月彙整失敗', 'error'); }
    finally { setSummaryLoading(false); }
  }, [summaryYear]);

  // ── 每日收入 fetch ──────────────────────────────────────────
  // ── OTA 比對 執行 ──────────────────────────────────────────
  const runOtaReconcile = useCallback(async () => {
    if (!otaFile) { showToast('請先上傳 OTA 對帳單', 'error'); return; }
    setOtaLoading(true);
    setOtaResult(null);
    try {
      const fd = new FormData();
      fd.append('file', otaFile);
      fd.append('source', otaSource);
      if (otaDateFrom) fd.append('dateFrom', otaDateFrom);
      if (otaDateTo) fd.append('dateTo', otaDateTo);
      if (otaWarehouse) fd.append('warehouse', otaWarehouse);
      const res = await fetch('/api/bnb/ota-reconcile', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || 'OTA 比對失敗', 'error');
        return;
      }
      const data = await res.json();
      setOtaResult(data);
      setOtaViewTab('matched');
    } catch { showToast('OTA 比對失敗', 'error'); }
    finally { setOtaLoading(false); }
  }, [otaFile, otaSource, otaDateFrom, otaDateTo, otaWarehouse]);

  const fetchDailyRevenue = useCallback(async () => {
    setDrLoading(true);
    setDrExpandDay(null);
    try {
      const p = new URLSearchParams({ month: drMonth });
      if (drWarehouse) p.set('warehouse', drWarehouse);
      const res = await fetch(`/api/bnb/daily-revenue?${p}`);
      if (!res.ok) { showToast('載入每日收入失敗', 'error'); return; }
      setDrData(await res.json());
    } catch { showToast('載入每日收入失敗', 'error'); }
    finally { setDrLoading(false); }
  }, [drMonth, drWarehouse]);

  // ── 旅宿網申報 fetch（實際 + 已存報表）─────────────────────────
  const fetchDecl = useCallback(async () => {
    setDeclLoading(true);
    setDeclSearched(true);
    try {
      const wh = encodeURIComponent(declWarehouse);
      const [actualRes, reportRes] = await Promise.all([
        fetch(`/api/bnb/actual-stats?month=${declMonth}&warehouse=${wh}`),
        fetch(`/api/bnb/monthly-report?month=${declMonth}&warehouse=${wh}`),
      ]);

      const actual = actualRes.ok ? await actualRes.json() : null;
      setDeclActual(actual);

      const saved = reportRes.ok ? await reportRes.json() : null;

      if (saved) {
        setDeclForm({
          cardTotal:        saved.cardTotal        ?? '',
          roomPriceTotal:   saved.roomPriceTotal   ?? '',
          subsidizedRooms:  saved.subsidizedRooms  ?? '',
          avgRoomRate:      saved.avgRoomRate       ?? '',
          monthlyRoomCount: saved.monthlyRoomCount ?? '',
          roomSuppliesCost: saved.roomSuppliesCost ?? '',
          fbExpense:        saved.fbExpense        ?? '',
          fitGuestCount:    saved.fitGuestCount    ?? '',
          staffCount:       saved.staffCount       ?? '',
          salary:           saved.salary           ?? '',
          businessSource:   saved.businessSource   || '其他100%',
          otherIncome:      saved.otherIncome      || '',
          otherIncomeNote:  saved.otherIncomeNote  || '',
          note:             saved.note             || '',
        });
      } else if (actual) {
        setDeclForm({
          cardTotal:        Math.round(actual.payCard) || '',
          roomPriceTotal:   Math.round(actual.revenueTotal) || '',
          subsidizedRooms:  '',
          avgRoomRate:      actual.avgRoomRate || '',
          monthlyRoomCount: actual.roomCount || '',
          roomSuppliesCost: '',
          fbExpense:        '',
          fitGuestCount:    '',
          staffCount:       '',
          salary:           '',
          businessSource:   actual.businessSourceAuto || '其他100%',
          otherIncome:      '',
          otherIncomeNote:  '',
          note:             '',
        });
      }
    } finally { setDeclLoading(false); }
  }, [declMonth, declWarehouse]);

  const fetchDeclList = useCallback(async () => {
    setDlLoading(true);
    try {
      const res = await fetch(`/api/bnb/declaration-list?year=${dlYear}&warehouse=${encodeURIComponent(dlWarehouse)}`);
      if (res.ok) {
        const data = await res.json();
        setDlRows(data.rows || []);
      }
    } catch { /* ignore */ }
    finally { setDlLoading(false); }
  }, [dlYear, dlWarehouse]);

  useEffect(() => {
    if (activeTab === 'records')     fetchRecords();
    if (activeTab === 'dailyRev')    fetchDailyRevenue();
    if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary();
    if (activeTab === 'declaration') { setDeclSearched(false); setDeclActual(null); }
    if (activeTab === 'declList')    fetchDeclList();
    if (activeTab === 'deposit' && dmAccountId) fetchDepositMatch();
  }, [activeTab]);

  useEffect(() => { fetchLockStatus(filterMonth); }, [filterMonth]);

  useEffect(() => {
    if (activeTab === 'records') { setSelectedIds(new Set()); fetchRecords(); }
  }, [filterMonth, filterSource, filterStatus]);
  useEffect(() => { if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary(); }, [summaryYear]);
  useEffect(() => { if (activeTab === 'declList') fetchDeclList(); }, [dlYear, dlWarehouse]);

  const isLocked = !!lockStatus?.locked;

  // ── 匯入 ──────────────────────────────────────────────────────
  async function handleImport() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    setImporting(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('replace', importReplace ? 'true' : 'false');
      const res = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || data.message || '匯入失敗', 'error'); return; }
      setImportResult(data);
      showToast(`匯入成功：${data.imported} 筆`, 'success');
      setImportFile(null);
    } catch { showToast('匯入失敗', 'error'); }
    finally { setImporting(false); }
  }

  // ── 批次選取 ──────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    const eligible = records.filter(r => r.status !== '已刪除').map(r => r.id);
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible));
    }
  }

  // ── 批次套用 ──────────────────────────────────────────────────
  async function handleBatchApply() {
    if (!selectedIds.size || !batchValue) {
      showToast('請選擇狀態', 'error'); return;
    }
    setBatchApplying(true);
    try {
      await Promise.all([...selectedIds].map(id =>
        fetch(`/api/bnb/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: batchValue }),
        })
      ));
      showToast(`已套用 ${selectedIds.size} 筆`, 'success');
      setSelectedIds(new Set());
      setBatchValue('');
      fetchRecords();
    } catch { showToast('批次套用失敗', 'error'); }
    finally { setBatchApplying(false); }
  }

  // ── Inline 儲存 ───────────────────────────────────────────────
  async function handleInlineSave(id, field, value) {
    setInlineEdit(null);
    const isText = field === 'depositLast5';
    const payload = isText ? { [field]: value || null } : { [field]: parseFloat(value) || 0 };
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || err.error || '儲存失敗', 'error');
      fetchRecords();
      return;
    }
    const updated = await res.json();
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r));
  }

  // ── Excel 模式：進入 ──────────────────────────────────────────
  function enterEditMode() {
    const map = {};
    for (const r of records) {
      if (r.status === '已刪除' || r.paymentLocked) continue;
      map[r.id] = {
        payDeposit:   String(r.payDeposit  > 0 ? r.payDeposit  : ''),
        depositLast5: r.depositLast5 || '',
        payCard:      String(r.payCard     > 0 ? r.payCard     : ''),
        payCash:      String(r.payCash     > 0 ? r.payCash     : ''),
        payVoucher:   String(r.payVoucher  > 0 ? r.payVoucher  : ''),
      };
    }
    setEditMap(map);
    setDirtyIds(new Set());
    setEditMode(true);
    setInlineEdit(null);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditMap({});
    setDirtyIds(new Set());
  }

  function updateCell(id, field, value) {
    setEditMap(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setDirtyIds(prev => new Set([...prev, id]));
  }

  function focusPayCell(id, field) {
    const el = document.getElementById(`pc-${id}-${field}`);
    if (el) { el.focus(); el.select(); }
  }

  function handlePayKeyDown(e, rid, field, editableRecords) {
    if (e.key === 'Escape') { cancelEditMode(); return; }
    const fieldIdx  = PAY_FIELDS.indexOf(field);
    const recordIdx = editableRecords.findIndex(x => x.id === rid);

    if (e.key === 'Tab') {
      e.preventDefault();
      if (fieldIdx < PAY_FIELDS.length - 1) {
        focusPayCell(rid, PAY_FIELDS[fieldIdx + 1]);
      } else if (recordIdx < editableRecords.length - 1) {
        focusPayCell(editableRecords[recordIdx + 1].id, PAY_FIELDS[0]);
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (recordIdx < editableRecords.length - 1) {
        focusPayCell(editableRecords[recordIdx + 1].id, field);
      }
    }
  }

  async function saveAllEdits() {
    const toSave = [...dirtyIds].map(id => ({ id, ...editMap[id] }));
    if (!toSave.length) { cancelEditMode(); return; }
    setBatchSaving(true);
    try {
      const res = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'savePayment', records: toSave }),
      });
      if (!res.ok) { showToast('批次儲存失敗', 'error'); return; }
      const d = await res.json();
      const msg = d.skipped > 0 ? `已儲存 ${d.saved} 筆（${d.skipped} 筆鎖定跳過）` : `已儲存 ${d.saved} 筆`;
      showToast(msg, 'success');
      cancelEditMode();
      fetchRecords();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setBatchSaving(false); }
  }

  async function handleLockToggle(action) {
    if (!selectedIds.size) return;
    setLocking(true);
    try {
      const res = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selectedIds] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.message || (action === 'lock' ? '鎖帳失敗' : '解鎖失敗'), 'error');
        return;
      }
      showToast(action === 'lock' ? `已鎖帳 ${selectedIds.size} 筆` : `已解鎖 ${selectedIds.size} 筆`, 'success');
      setSelectedIds(new Set());
      fetchRecords();
    } catch { showToast('操作失敗', 'error'); }
    finally { setLocking(false); }
  }

  // ── 刪除記錄 ──────────────────────────────────────────────────
  async function handleDelete(id, name) {
    if (!confirm(`確定刪除「${name}」的訂房記錄？`)) return;
    const res = await fetch(`/api/bnb/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '刪除失敗', 'error');
      return;
    }
    showToast('已刪除', 'success');
    fetchRecords();
  }

  // ── 旅宿網申報儲存 ────────────────────────────────────────────
  async function handleDeclSave() {
    setDeclSaving(true);
    try {
      const res = await fetch('/api/bnb/monthly-report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...declForm, reportMonth: declMonth, warehouse: declWarehouse }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || '儲存失敗', 'error');
        return;
      }
      showToast('月報已儲存', 'success');
      if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary();
      if (activeTab === 'declList') fetchDeclList();
    } finally { setDeclSaving(false); }
  }

  function handleAutoFillDecl() {
    if (!declActual) { showToast('請先查詢實際資料', 'error'); return; }
    setDeclForm(prev => ({
      ...prev,
      cardTotal:        Math.round(declActual.payCard) || '',
      roomPriceTotal:   Math.round(declActual.revenueTotal) || '',
      avgRoomRate:      declActual.avgRoomRate || prev.avgRoomRate || '',
      monthlyRoomCount: declActual.roomCount || '',
      businessSource:   declActual.businessSourceAuto || prev.businessSource || '',
    }));
    showToast('已從實際資料帶入可計算的欄位', 'success');
  }

  // ── 統計摘要 ──────────────────────────────────────────────────
  const recStats = records.reduce((acc, r) => {
    if (r.status === '已刪除') return acc;
    acc.rooms++;
    acc.revenue  += Number(r.roomCharge) + Number(r.otherCharge);
    acc.deposit  += Number(r.payDeposit);
    acc.card     += Number(r.payCard);
    acc.cash     += Number(r.payCash);
    acc.voucher  += Number(r.payVoucher);
    acc.cardFee  += Number(r.cardFee);
    acc.unfilled += r.paymentFilled ? 0 : 1;
    return acc;
  }, { rooms: 0, revenue: 0, deposit: 0, card: 0, cash: 0, voucher: 0, cardFee: 0, unfilled: 0 });

  const inputCls = 'border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none';
  const btnCls   = 'px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50 transition-colors';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-indigo-500" />

      <main className="max-w-[96rem] mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">民宿帳</h2>
          <p className="text-sm text-gray-500 mt-1">訂房收入、付款明細、月收支總表、旅宿網申報</p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
          {/* 鎖帳狀態指示 + 按鈕 */}
          <div className="ml-auto flex items-center gap-2">
            {isLocked && (
              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                {filterMonth} 已鎖帳
                {lockStatus?.lockedBy && <span className="text-gray-400">（{lockStatus.lockedBy}）</span>}
              </span>
            )}
            <button onClick={toggleLock} disabled={lockLoading}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                isLocked
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
              } disabled:opacity-50`}>
              {lockLoading ? '處理中…' : isLocked ? '解鎖此月' : '鎖帳此月'}
            </button>
          </div>
        </div>

        {/* ══ Tab: 訂房明細 ══ */}
        {activeTab === 'records' && (
          <div>
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份</label>
                <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">來源</label>
                <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  <option value="電話">電話</option>
                  <option value="Booking">Booking</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">狀態</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  <option value="已入住">已入住</option>
                  <option value="已退房">已退房</option>
                  <option value="已預訂">已預訂</option>
                  <option value="已刪除">已刪除</option>
                </select>
              </div>
              <button onClick={fetchRecords} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
              <div className="ml-auto flex items-end gap-2">
                {!editMode ? (
                  <button onClick={enterEditMode}
                    className="px-4 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                    修改付款
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-emerald-700 font-medium">
                      Excel 模式{dirtyIds.size > 0 ? ` (已修改 ${dirtyIds.size} 筆)` : ''}
                    </span>
                    <button onClick={saveAllEdits} disabled={batchSaving}
                      className="px-3 py-1 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      {batchSaving ? '儲存中…' : '儲存全部'}
                    </button>
                    <button onClick={cancelEditMode}
                      className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600">
                      取消
                    </button>
                  </div>
                )}
                <ExportButtons
                  data={records}
                  columns={BOOKING_EXPORT_COLS}
                  filename={`訂房明細_${filterMonth}`}
                  title={`訂房明細 ${filterMonth}`}
                />
                <button
                  onClick={() => openPrintWindow(
                    `訂房明細 ${filterMonth}`,
                    BOOKING_EXPORT_COLS.map(c => c.header),
                    records.map(r => BOOKING_EXPORT_COLS.map(c => r[c.key] ?? ''))
                  )}
                  className={`${btnCls} text-gray-600`}
                >列印</button>
              </div>
            </div>

            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
              {[
                { label: '筆數', val: recStats.rooms },
                { label: '房費+消費', val: NT(recStats.revenue) },
                { label: '訂金匯款', val: NT(recStats.deposit) },
                { label: '刷卡', val: NT(recStats.card) },
                { label: '現金', val: NT(recStats.cash) },
                { label: '住宿卷', val: NT(recStats.voucher) },
                { label: '刷卡手續費', val: NT(recStats.cardFee) },
                { label: '未填付款', val: recStats.unfilled, color: recStats.unfilled > 0 ? 'text-amber-600' : '' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className={`font-bold text-gray-800 text-sm mt-0.5 ${c.color || ''}`}>{c.val}</p>
                </div>
              ))}
            </div>

            {/* 批次行動列 */}
            {selectedIds.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-sm font-medium text-amber-800">已選 {selectedIds.size} 筆</span>
                {/* 狀態批次套用 */}
                {!editMode && (
                  <>
                    <select value={batchField} onChange={e => { setBatchField(e.target.value); setBatchValue(''); }}
                      className="border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 outline-none">
                      <option value="status">狀態</option>
                    </select>
                    <select value={batchValue} onChange={e => setBatchValue(e.target.value)}
                      className="border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 outline-none">
                      <option value="">選擇狀態</option>
                      <option value="已入住">已入住</option>
                      <option value="已退房">已退房</option>
                      <option value="已預訂">已預訂</option>
                    </select>
                    <button onClick={handleBatchApply} disabled={batchApplying}
                      className="px-3 py-1.5 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                      {batchApplying ? '套用中…' : '套用'}
                    </button>
                    <span className="text-gray-300 text-xs">|</span>
                  </>
                )}
                {/* 鎖帳 / 解鎖（需有鎖帳權限） */}
                {canLock && !editMode && (
                  <>
                    <button onClick={() => handleLockToggle('lock')} disabled={locking}
                      className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                      <span>🔒</span> 鎖帳
                    </button>
                    <button onClick={() => handleLockToggle('unlock')} disabled={locking}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-400 text-slate-600 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1">
                      <span>🔓</span> 解鎖
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-gray-500 hover:underline ml-auto">清除選取</button>
              </div>
            )}

            {/* Excel 模式提示 */}
            {editMode && (
              <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-2">
                <span className="font-medium">Excel 模式：</span>
                Tab 跳下一格 ／ Enter 跳下一行同欄 ／ Esc 取消編輯模式。訂金欄位含後五碼輸入。
                <span className="ml-auto text-emerald-500">🔒 灰色鎖定列不可編輯</span>
              </div>
            )}

            {/* 表格 */}
            {recLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (() => {
              // 可編輯的列（未刪除、未鎖定）供 Tab 跳格使用
              const editableRecords = records.filter(r => r.status !== '已刪除' && !r.paymentLocked);

              return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-xs ${editMode ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'}`}>
                      <th className="px-3 py-2">
                        <input type="checkbox"
                          checked={selectedIds.size > 0 && selectedIds.size === records.filter(r => r.status !== '已刪除').length}
                          onChange={toggleSelectAll}
                          className="rounded cursor-pointer" />
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">來源</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">姓名</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">房間</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">入住</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">退房</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">房費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">消費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        訂金{editMode && <span className="block text-[10px] font-normal opacity-60">後五碼</span>}
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">刷卡</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">手續費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">現金</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">住宿卷</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">狀態</th>
                      {!editMode && <th className="px-3 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.length === 0 && (
                      <tr><td colSpan={15} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {records.map(r => {
                      const isSelected    = selectedIds.has(r.id);
                      const isDeleted     = r.status === '已刪除';
                      const isLocked      = !!r.paymentLocked;
                      const inExcelMode   = editMode && !isDeleted && !isLocked;
                      const isDirty       = dirtyIds.has(r.id);

                      // ── 一般模式：點擊式 inline edit ────────────────
                      const editCell = (field, colorCls) => {
                        const isEditing = !editMode && inlineEdit?.id === r.id && inlineEdit?.field === field;
                        const val = Number(r[field]);
                        if (isEditing) return (
                          <input autoFocus type="number" min="0" value={inlineValue}
                            onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => handleInlineSave(r.id, field, inlineValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineSave(r.id, field, inlineValue);
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            className="w-20 border border-indigo-400 rounded px-1 py-0.5 text-xs text-right outline-none ring-1 ring-indigo-400" />
                        );
                        return (
                          <span
                            onClick={() => { if (!isDeleted && !isLocked && !editMode) { setInlineEdit({ id: r.id, field }); setInlineValue(val || ''); } }}
                            className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : ''} ${colorCls} ${val > 0 ? '' : 'text-gray-300'}`}
                            title={isLocked ? '已鎖帳' : editMode ? '' : '點擊編輯'}>
                            {val > 0 ? val.toLocaleString() : '—'}
                          </span>
                        );
                      };

                      // ── Excel 模式：數字 input ───────────────────────
                      const excelInput = (field, colorBorder) => {
                        const val = editMap[r.id]?.[field] ?? '';
                        return (
                          <input
                            id={`pc-${r.id}-${field}`}
                            type="number" min="0"
                            value={val}
                            onChange={e => updateCell(r.id, field, e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handlePayKeyDown(e, r.id, field, editableRecords)}
                            className={`w-20 border rounded px-1.5 py-0.5 text-xs text-right outline-none focus:ring-1 ${colorBorder} ${isDirty ? 'bg-yellow-50' : 'bg-white'}`}
                          />
                        );
                      };

                      const excelTextInput = (field) => {
                        const val = editMap[r.id]?.[field] ?? '';
                        return (
                          <input
                            id={`pc-${r.id}-${field}`}
                            type="text" maxLength={5}
                            value={val}
                            onChange={e => updateCell(r.id, field, e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handlePayKeyDown(e, r.id, field, editableRecords)}
                            placeholder="後五碼"
                            className={`w-16 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-300 border-blue-200 ${isDirty ? 'bg-yellow-50' : 'bg-white'} text-blue-500 font-mono`}
                          />
                        );
                      };

                      return (
                        <tr key={r.id} className={`
                          ${isSelected ? 'bg-amber-50' : isLocked ? 'bg-slate-50' : 'hover:bg-gray-50'}
                          ${isDeleted ? 'opacity-40' : ''}
                          ${editMode && isDirty ? 'ring-1 ring-inset ring-emerald-200' : ''}
                        `}>
                          <td className="px-3 py-2">
                            {!isDeleted && (
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)}
                                className="rounded cursor-pointer" />
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[r.source] || SOURCE_COLORS['其他']}`}>{r.source}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[140px] truncate">{r.guestName}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{r.roomNo || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkInDate}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkOutDate}</td>
                          <td className="px-3 py-2 text-right">{Number(r.roomCharge).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherCharge) > 0 ? Number(r.otherCharge).toLocaleString() : '—'}</td>

                          {/* 訂金 + 後五碼 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payDeposit', 'border-blue-300 focus:ring-blue-300')}
                                {excelTextInput('depositLast5')}
                              </div>
                            ) : (
                              <div>
                                {editCell('payDeposit', 'text-blue-600')}
                                {r.depositLast5 && <div className="text-[10px] text-blue-300 font-mono">{r.depositLast5}</div>}
                              </div>
                            )}
                          </td>

                          {/* 刷卡 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payCard', 'border-purple-300 focus:ring-purple-300') : editCell('payCard', 'text-purple-600')}
                          </td>

                          {/* 手續費（唯讀） */}
                          <td className="px-3 py-2 text-right text-red-400 text-xs">
                            {Number(r.cardFee) > 0 ? Number(r.cardFee).toLocaleString() : '—'}
                          </td>

                          {/* 現金 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payCash', 'border-green-300 focus:ring-green-300') : editCell('payCash', 'text-green-600')}
                          </td>

                          {/* 住宿卷 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payVoucher', 'border-amber-300 focus:ring-amber-300') : editCell('payVoucher', 'text-amber-600')}
                          </td>

                          {/* 狀態 + 鎖帳標示 */}
                          <td className="px-3 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                            {isLocked && <span className="ml-1 text-[10px] text-slate-400" title={`鎖帳：${r.paymentLockedBy || ''}`}>🔒</span>}
                            {!r.paymentFilled && !isDeleted && !isLocked && (
                              <span className="ml-1 text-[10px] text-amber-500">未填</span>
                            )}
                          </td>

                          {/* 操作欄（非 Excel 模式才顯示） */}
                          {!editMode && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button onClick={() => setEditRecord(r)} disabled={isLocked}
                                className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 mr-1 disabled:opacity-40 disabled:cursor-not-allowed">
                                付款
                              </button>
                              <button onClick={() => handleDelete(r.id, r.guestName)} disabled={isLocked}
                                className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                刪
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              );
            })()}
          </div>
        )}

        {/* ══ Tab: 雲掌櫃匯入 ══ */}
        {activeTab === 'import' && (
          <div className="max-w-xl">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">上傳雲掌櫃匯出檔</h3>
              <p className="text-sm text-gray-500">
                支援 <strong>.xlsx / .xls / .csv</strong>。欄位順序需與雲掌櫃一致：<br/>
                A來源 B姓名 C本期房費 D本期消費 E房間 F入住日期 G離店日期 H狀態
              </p>

              <div>
                <label className="block text-xs text-gray-500 mb-1">匯入月份</label>
                <input type="month" value={importMonth} onChange={e => setImportMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={importWarehouse} onChange={e => setImportWarehouse(e.target.value)} className={inputCls}>
                  {warehouseList.length === 0
                    ? <option value="民宿">民宿</option>
                    : warehouseList.map(w => <option key={w} value={w}>{w}</option>)
                  }
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">選擇檔案</label>
                <input type="file" accept=".xlsx,.xls,.csv"
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                  className="block text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-indigo-300 file:text-indigo-600 file:bg-indigo-50 hover:file:bg-indigo-100" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={importReplace} onChange={e => setImportReplace(e.target.checked)}
                  className="rounded" />
                取代同月舊資料（勾選後會先刪除同月份現有記錄再匯入）
              </label>

              {isLocked && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                  {filterMonth} 已鎖帳，無法匯入。如需匯入請先解鎖。
                </div>
              )}
              <button onClick={handleImport} disabled={importing || !importFile || isLocked}
                className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {importing ? '匯入中…' : '開始匯入'}
              </button>

              {importResult && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                  ✓ 匯入完成：{importResult.imported} 筆
                  {importResult.deleted > 0 && `（已刪除舊資料 ${importResult.deleted} 筆）`}
                  <br/>
                  月份：{importResult.importMonth}　館別：{importResult.warehouse}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ Tab: 每日收入 ══ */}
        {activeTab === 'dailyRev' && (
          <div>
            {/* 搜尋列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份</label>
                <input type="month" value={drMonth} onChange={e => setDrMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={drWarehouse} onChange={e => setDrWarehouse(e.target.value)} className={inputCls}>
                  {warehouseList.length === 0
                    ? <option value="民宿">民宿</option>
                    : warehouseList.map(w => <option key={w} value={w}>{w}</option>)
                  }
                </select>
              </div>
              <button onClick={fetchDailyRevenue} disabled={drLoading}
                className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                {drLoading ? '查詢中…' : '查詢'}
              </button>
              {drData && (
                <>
                  <div className="ml-auto flex gap-2">
                    <ExportButtons
                      data={(drData?.days || []).map(d => ({
                        ...d,
                        revenue: d.roomCharge + d.otherCharge,
                        netRevenue: d.roomCharge + d.otherCharge - d.cardFee,
                        dateLabel: `${d.day}日`,
                      }))}
                      columns={[
                        { header: '日期',     key: 'dateLabel' },
                        { header: '筆數',     key: 'count',       format: 'number' },
                        { header: '房費',     key: 'roomCharge',  format: 'number' },
                        { header: '消費',     key: 'otherCharge', format: 'number' },
                        { header: '營收合計', key: 'revenue',     format: 'number' },
                        { header: '訂金',     key: 'payDeposit',  format: 'number' },
                        { header: '刷卡',     key: 'payCard',     format: 'number' },
                        { header: '現金',     key: 'payCash',     format: 'number' },
                        { header: '住宿卷',   key: 'payVoucher',  format: 'number' },
                        { header: '手續費',   key: 'cardFee',     format: 'number' },
                      ]}
                      filename={`每日收入_${drMonth}`}
                      title={`每日收入 ${drMonth}（${drWarehouse}）`}
                    />
                    <button
                      onClick={() => {
                        const cols = ['日期','筆數','房費','消費','營收','訂金','刷卡','現金','住宿卷','手續費'];
                        const rows = (drData?.days || []).filter(d => d.count > 0).map(d => [
                          `${d.day}日`,
                          d.count,
                          d.roomCharge.toLocaleString(),
                          d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '',
                          (d.roomCharge + d.otherCharge).toLocaleString(),
                          d.payDeposit > 0 ? d.payDeposit.toLocaleString() : '',
                          d.payCard > 0 ? d.payCard.toLocaleString() : '',
                          d.payCash > 0 ? d.payCash.toLocaleString() : '',
                          d.payVoucher > 0 ? d.payVoucher.toLocaleString() : '',
                          d.cardFee > 0 ? d.cardFee.toLocaleString() : '',
                        ]);
                        const t = drData.totals;
                        rows.push(['合計', t.count,
                          t.roomCharge.toLocaleString(), t.otherCharge.toLocaleString(),
                          (t.roomCharge + t.otherCharge).toLocaleString(),
                          t.payDeposit.toLocaleString(), t.payCard.toLocaleString(),
                          t.payCash.toLocaleString(), t.payVoucher.toLocaleString(),
                          t.cardFee.toLocaleString(),
                        ]);
                        openPrintWindow(`每日收入 ${drMonth}（${drWarehouse}）`, cols, rows);
                      }}
                      className={`${btnCls} text-gray-600`}
                    >列印</button>
                  </div>
                </>
              )}
            </div>

            {/* 摘要卡 */}
            {drData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
                {[
                  { label: '營業天數', val: drData.days.filter(d => d.count > 0).length, color: '' },
                  { label: '總筆數',   val: drData.totals.count, color: '' },
                  { label: '房費',     val: NT(drData.totals.roomCharge), color: 'text-indigo-700' },
                  { label: '消費',     val: NT(drData.totals.otherCharge), color: 'text-gray-600' },
                  { label: '訂金',     val: NT(drData.totals.payDeposit), color: 'text-blue-600' },
                  { label: '刷卡',     val: NT(drData.totals.payCard), color: 'text-purple-600' },
                  { label: '現金',     val: NT(drData.totals.payCash), color: 'text-green-600' },
                  { label: '手續費',   val: NT(drData.totals.cardFee), color: 'text-red-400' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.val}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 每日收入表格 */}
            {drLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : !drData ? (
              <div className="text-center py-16 text-gray-400">請選擇月份後按「查詢」</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['日期','筆數','房費','消費','營收合計','訂金','刷卡','現金','住宿卷','手續費',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {drData.days.map(d => {
                      const rev = d.roomCharge + d.otherCharge;
                      const hasData = d.count > 0;
                      const isExpanded = drExpandDay === d.day;
                      return (
                        <React.Fragment key={d.day}>
                          <tr className={`${hasData ? 'hover:bg-gray-50 cursor-pointer' : 'text-gray-300'} transition-colors`}
                            onClick={() => hasData && setDrExpandDay(isExpanded ? null : d.day)}>
                            <td className="px-3 py-2 font-medium text-gray-700">
                              <span className={hasData ? '' : 'text-gray-300'}>{d.day}日</span>
                              {hasData && (
                                <span className="ml-1.5 text-[10px] text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{hasData ? d.count : '—'}</td>
                            <td className="px-3 py-2 text-right text-indigo-700">{hasData ? d.roomCharge.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold">{hasData ? rev.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-blue-600">{d.payDeposit > 0 ? d.payDeposit.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-purple-600">{d.payCard > 0 ? d.payCard.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-green-600">{d.payCash > 0 ? d.payCash.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-amber-600">{d.payVoucher > 0 ? d.payVoucher.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right text-red-400">{d.cardFee > 0 ? `(${d.cardFee.toLocaleString()})` : '—'}</td>
                            <td className="px-3 py-2 w-4"></td>
                          </tr>
                          {isExpanded && d.bookings.map((b, i) => (
                            <tr key={`${d.day}-${i}`} className="bg-gray-50/70">
                              <td className="px-3 py-1.5 pl-8 text-xs text-gray-400" colSpan={2}>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
                                  b.source === 'Booking' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'
                                }`}>{b.source}</span>
                                {b.guestName}
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs text-gray-500">{b.roomCharge.toLocaleString()}</td>
                              <td className="px-3 py-1.5 text-xs text-gray-400">{b.roomNo || ''}</td>
                              <td colSpan={7}></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {/* 合計列 */}
                    {(() => {
                      const t = drData.totals;
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2.5">合計</td>
                          <td className="px-3 py-2.5 text-right">{t.count}</td>
                          <td className="px-3 py-2.5 text-right">{t.roomCharge.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{t.otherCharge.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{(t.roomCharge + t.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{t.payDeposit.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{t.payCard.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{t.payCash.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{t.payVoucher.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">({t.cardFee.toLocaleString()})</td>
                          <td className="px-3 py-2.5"></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 月收入總表 ══ */}
        {activeTab === 'monthly' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-600">年份</label>
              <select value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
              <div className="ml-auto flex gap-2">
                <ExportButtons
                  data={summaryRows}
                  columns={MONTHLY_EXPORT_COLS}
                  filename={`月收入總表_${summaryYear}`}
                  title={`月收入總表 ${summaryYear}`}
                />
                <button
                  onClick={() => openPrintWindow(
                    `月收入總表 ${summaryYear}`,
                    MONTHLY_EXPORT_COLS.map(c => c.header),
                    summaryRows.map(r => MONTHLY_EXPORT_COLS.map(c => r[c.key] ?? ''))
                  )}
                  className={`${btnCls} text-gray-600`}
                >列印</button>
              </div>
            </div>

            {summaryLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','間數','住宿房費','其他消費','訂金匯款','刷卡','現金','住宿卷','手續費','淨收入'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => (
                      <tr key={r.month} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.month}</td>
                        <td className="px-3 py-2 text-right">{r.rooms}</td>
                        <td className="px-3 py-2 text-right">{Number(r.totalRevenue).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherCharge).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{Number(r.payDeposit).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-purple-600">{Number(r.payCard).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-green-600">{Number(r.payCash).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{Number(r.payVoucher).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-red-400">({Number(r.cardFee).toLocaleString()})</td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-700">{Number(r.netRevenue).toLocaleString()}</td>
                      </tr>
                    ))}
                    {summaryRows.length > 0 && (() => {
                      const tot = summaryRows.reduce((a, r) => ({
                        rooms: a.rooms + r.rooms,
                        totalRevenue: a.totalRevenue + r.totalRevenue,
                        otherCharge: a.otherCharge + r.otherCharge,
                        payDeposit: a.payDeposit + r.payDeposit,
                        payCard: a.payCard + r.payCard,
                        payCash: a.payCash + r.payCash,
                        payVoucher: a.payVoucher + r.payVoucher,
                        cardFee: a.cardFee + r.cardFee,
                        netRevenue: a.netRevenue + r.netRevenue,
                      }), { rooms:0, totalRevenue:0, otherCharge:0, payDeposit:0, payCard:0, payCash:0, payVoucher:0, cardFee:0, netRevenue:0 });
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2">總計</td>
                          <td className="px-3 py-2 text-right">{tot.rooms}</td>
                          <td className="px-3 py-2 text-right">{Number(tot.totalRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Number(tot.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Number(tot.payDeposit).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Number(tot.payCard).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Number(tot.payCash).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Number(tot.payVoucher).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">({Number(tot.cardFee).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right">{Number(tot.netRevenue).toLocaleString()}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 月收支總表 ══ */}
        {activeTab === 'pnl' && (
          <div>
            {(() => {
              const pnlData = summaryRows.map(r => ({
                ...r,
                incomeTotal:  r.netRevenue + (r.otherIncome || 0),
                pnlNetProfit: r.netRevenue + (r.otherIncome || 0) - r.totalExpense,
              }));
              return (
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-600">年份</label>
              <select value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
              <div className="ml-auto flex gap-2">
                <ExportButtons
                  data={pnlData}
                  columns={PNL_EXPORT_COLS}
                  filename={`月收支總表_${summaryYear}`}
                  title={`月收支總表 ${summaryYear}`}
                />
                <button
                  onClick={() => openPrintWindow(
                    `月收支總表 ${summaryYear}`,
                    PNL_EXPORT_COLS.map(c => c.header),
                    pnlData.map(r => PNL_EXPORT_COLS.map(c => r[c.key] ?? ''))
                  )}
                  className={`${btnCls} text-gray-600`}
                >列印</button>
              </div>
            </div>
              );
            })()}

            {summaryLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','住宿淨收入','其他收入','收入合計','採購支出','固定費用','支出合計','淨利'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => {
                      const incomeTotal = r.netRevenue + r.otherIncome;
                      return (
                        <tr key={r.month} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{r.month}</td>
                          <td className="px-3 py-2 text-right text-indigo-700">{Number(r.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherIncome || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold">{Number(incomeTotal).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-red-500">({Number(r.purchaseExpense).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right text-red-400">({Number(r.fixedExpense).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right text-red-600">({Number(r.totalExpense).toLocaleString()})</td>
                          <td className={`px-3 py-2 text-right font-bold ${r.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {Number(r.netProfit + (r.otherIncome || 0)).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 旅宿網申報 ══ */}
        {activeTab === 'declaration' && (
          <div>
            {/* 搜尋列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">申報月份</label>
                <input type="month" value={declMonth} onChange={e => setDeclMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={declWarehouse} onChange={e => setDeclWarehouse(e.target.value)} className={inputCls}>
                  {warehouseList.length === 0
                    ? <option value="民宿">民宿</option>
                    : warehouseList.map(w => <option key={w} value={w}>{w}</option>)
                  }
                </select>
              </div>
              <button onClick={fetchDecl} disabled={declLoading}
                className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                {declLoading ? '查詢中…' : '查詢'}
              </button>
            </div>

            {!declSearched && !declLoading && (
              <div className="text-center py-20 text-gray-400">請選擇月份與館別後按「查詢」</div>
            )}

            {declSearched && !declLoading && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

                {/* ── 左欄：實際資料（唯讀）── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                    <h3 className="text-sm font-semibold text-emerald-800">實際營業資料（自動計算）</h3>
                    <p className="text-[11px] text-emerald-500 mt-0.5">來源：{declMonth} {declWarehouse} 訂房明細</p>
                  </div>
                  {declActual ? (
                    <div className="p-5">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {[
                          ['刷卡總計',        Math.round(declActual.payCard),        'text-purple-600'],
                          ['房費+消費金額',   Math.round(declActual.revenueTotal),   'text-indigo-700'],
                          ['平均房價',        declActual.avgRoomRate,                'text-blue-600'],
                          ['每月間數',        declActual.roomCount,                  'text-gray-800'],
                          ['訂金匯款',        Math.round(declActual.payDeposit),     'text-blue-500'],
                          ['現金收入',        Math.round(declActual.payCash),        'text-green-600'],
                          ['住宿卷',          Math.round(declActual.payVoucher),     'text-amber-600'],
                          ['刷卡手續費',      Math.round(declActual.cardFee),        'text-red-400'],
                        ].map(([label, val, color]) => (
                          <div key={label} className="flex justify-between items-center py-1 border-b border-gray-50">
                            <span className="text-xs text-gray-500">{label}</span>
                            <span className={`text-sm font-semibold ${color}`}>{Number(val).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t flex justify-between items-center">
                        <span className="text-xs text-gray-500">業務來源（自動）</span>
                        <span className="text-xs text-gray-700">{declActual.businessSourceAuto || '—'}</span>
                      </div>
                      <div className="mt-2 flex justify-between items-center text-[11px] text-gray-400">
                        <span>Booking {declActual.sourceBooking} 筆 / 電話 {declActual.sourcePhone} 筆 / 其他 {declActual.sourceOther} 筆</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-400 text-sm">本月無訂房資料</div>
                  )}
                </div>

                {/* ── 右欄：申報資料（可編輯）── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-indigo-800">旅宿網申報資料{isLocked ? '（已鎖帳）' : '（可編輯）'}</h3>
                      <p className="text-[11px] text-indigo-400 mt-0.5">{isLocked ? '本月已鎖帳，僅供檢視' : '調整後按儲存，此為實際申報數字'}</p>
                    </div>
                    <button onClick={handleAutoFillDecl} disabled={isLocked}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 whitespace-nowrap disabled:opacity-40">
                      ← 從實際帶入
                    </button>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['cardTotal',        '刷卡總計'],
                        ['roomPriceTotal',   '房價金額'],
                        ['subsidizedRooms',  '補助間數'],
                        ['avgRoomRate',      '平均房價'],
                        ['monthlyRoomCount', '每月間數'],
                        ['roomSuppliesCost', '客房備品'],
                        ['fbExpense',        '餐飲支出'],
                        ['fitGuestCount',    '住客FIT人數'],
                        ['staffCount',       '員工人數'],
                        ['salary',           '薪資'],
                      ].map(([k, label]) => (
                        <div key={k}>
                          <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>
                          <input type="number" value={declForm[k]} disabled={isLocked}
                            onChange={e => setDeclForm(p => ({ ...p, [k]: e.target.value }))}
                            className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">業務來源%</label>
                      <input type="text" value={declForm.businessSource} disabled={isLocked}
                        onChange={e => setDeclForm(p => ({ ...p, businessSource: e.target.value }))}
                        placeholder="例：Booking 60%、電話 40%" className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">其他額外收入</label>
                        <input type="number" value={declForm.otherIncome} disabled={isLocked}
                          onChange={e => setDeclForm(p => ({ ...p, otherIncome: e.target.value }))}
                          className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 mb-0.5">收入說明</label>
                        <input type="text" value={declForm.otherIncomeNote} disabled={isLocked}
                          onChange={e => setDeclForm(p => ({ ...p, otherIncomeNote: e.target.value }))}
                          className={inputCls + ' w-full text-sm disabled:bg-gray-100'} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">備註</label>
                      <textarea rows={2} value={declForm.note} disabled={isLocked}
                        onChange={e => setDeclForm(p => ({ ...p, note: e.target.value }))}
                        className={inputCls + ' w-full text-sm resize-none disabled:bg-gray-100'} />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={handleDeclSave} disabled={declSaving || isLocked}
                        className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                        {declSaving ? '儲存中…' : isLocked ? '已鎖帳' : '儲存申報資料'}
                      </button>
                      <button onClick={() => {
                        const d = declForm;
                        const fmtN = v => v != null && v !== '' ? Number(v).toLocaleString() : '—';
                        openPrintWindow(
                          `旅宿網申報 ${declMonth}（${declWarehouse}）`,
                          ['項目', '申報數值'],
                          [
                            ['刷卡總計',   fmtN(d.cardTotal)],
                            ['房價金額',   fmtN(d.roomPriceTotal)],
                            ['補助間數',   fmtN(d.subsidizedRooms)],
                            ['平均房價',   fmtN(d.avgRoomRate)],
                            ['每月間數',   fmtN(d.monthlyRoomCount)],
                            ['客房備品',   fmtN(d.roomSuppliesCost)],
                            ['餐飲支出',   fmtN(d.fbExpense)],
                            ['住客FIT人數',fmtN(d.fitGuestCount)],
                            ['員工人數',   fmtN(d.staffCount)],
                            ['薪資',       fmtN(d.salary)],
                            ['業務來源%',  d.businessSource || '—'],
                            ['其他額外收入',fmtN(d.otherIncome)],
                            ['收入說明',   d.otherIncomeNote || '—'],
                            ['備註',       d.note || '—'],
                          ]
                        );
                      }}
                        className={`${btnCls} text-gray-600 whitespace-nowrap`}>
                        列印申報表
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 年度申報總覽 ══ */}
        {activeTab === 'declList' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-600">年份</label>
              <select value={dlYear} onChange={e => setDlYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <label className="text-sm text-gray-600">館別</label>
              <select value={dlWarehouse} onChange={e => setDlWarehouse(e.target.value)} className={inputCls}>
                {warehouseList.length === 0
                  ? <option value="民宿">民宿</option>
                  : warehouseList.map(w => <option key={w} value={w}>{w}</option>)
                }
              </select>
              <button onClick={fetchDeclList} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
              <ExportButtons
                data={dlRows}
                columns={[
                  { header: '月份',       key: 'monthLabel' },
                  { header: '刷卡總計',    key: 'cardTotal',        format: 'number' },
                  { header: '房價金額',    key: 'roomPriceTotal',   format: 'number' },
                  { header: '補助間數',    key: 'subsidizedRooms',  format: 'number' },
                  { header: '平均房價',    key: 'avgRoomRate',      format: 'number' },
                  { header: '每月間數',    key: 'monthlyRoomCount', format: 'number' },
                  { header: '客房備品',    key: 'roomSuppliesCost', format: 'number' },
                  { header: '餐飲支出',    key: 'fbExpense',        format: 'number' },
                  { header: '住客FIT人數', key: 'fitGuestCount',    format: 'number' },
                  { header: '員工人數',    key: 'staffCount',       format: 'number' },
                  { header: '薪資',       key: 'salary',           format: 'number' },
                  { header: '業務來源%',   key: 'businessSource' },
                ]}
                filename={`旅宿網申報_${dlYear}`}
                title={`旅宿網申報 ${dlYear}（${dlWarehouse}）`}
              />
              <button
                onClick={() => {
                  const cols = ['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%'];
                  const rows = dlRows.map(r => [
                    r.monthLabel,
                    r.cardTotal != null ? Number(r.cardTotal).toLocaleString() : '',
                    r.roomPriceTotal != null ? Number(r.roomPriceTotal).toLocaleString() : '',
                    r.subsidizedRooms ?? '',
                    r.avgRoomRate != null ? Number(r.avgRoomRate).toLocaleString() : '',
                    r.monthlyRoomCount ?? '',
                    r.roomSuppliesCost != null ? Number(r.roomSuppliesCost).toLocaleString() : '',
                    r.fbExpense != null ? Number(r.fbExpense).toLocaleString() : '',
                    r.fitGuestCount ?? '',
                    r.staffCount ?? '',
                    r.salary != null ? Number(r.salary).toLocaleString() : '',
                    r.businessSource || '',
                  ]);
                  openPrintWindow(`旅宿網申報 ${dlYear}年（${dlWarehouse}）`, cols, rows);
                }}
                className={`${btnCls} text-gray-600`}
              >列印</button>
            </div>

            {dlLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {dlRows.map(r => (
                      <tr key={r.month} className={`hover:bg-gray-50 ${r.hasReport ? '' : 'text-gray-300'}`}>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{r.monthLabel}</td>
                        <td className="px-3 py-2.5 text-right text-purple-600">{r.cardTotal != null ? Number(r.cardTotal).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-700 font-semibold">{r.roomPriceTotal != null ? Number(r.roomPriceTotal).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.subsidizedRooms ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-blue-600">{r.avgRoomRate != null ? Number(r.avgRoomRate).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{r.monthlyRoomCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.roomSuppliesCost != null ? Number(r.roomSuppliesCost).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.fbExpense != null ? Number(r.fbExpense).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-teal-600">{r.fitGuestCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.staffCount ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{r.salary != null ? Number(r.salary).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-left text-gray-500 text-xs">{r.businessSource || '—'}</td>
                      </tr>
                    ))}
                    {dlRows.length > 0 && (() => {
                      const tot = dlRows.reduce((a, r) => ({
                        cardTotal:       a.cardTotal       + (Number(r.cardTotal) || 0),
                        roomPriceTotal:  a.roomPriceTotal  + (Number(r.roomPriceTotal) || 0),
                        subsidizedRooms: a.subsidizedRooms + (r.subsidizedRooms || 0),
                        monthlyRoomCount:a.monthlyRoomCount+ (r.monthlyRoomCount || 0),
                        roomSuppliesCost:a.roomSuppliesCost+ (Number(r.roomSuppliesCost) || 0),
                        fbExpense:       a.fbExpense       + (Number(r.fbExpense) || 0),
                        fitGuestCount:   a.fitGuestCount   + (r.fitGuestCount || 0),
                        salary:          a.salary          + (Number(r.salary) || 0),
                      }), { cardTotal:0, roomPriceTotal:0, subsidizedRooms:0, monthlyRoomCount:0, roomSuppliesCost:0, fbExpense:0, fitGuestCount:0, salary:0 });
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2.5">合計</td>
                          <td className="px-3 py-2.5 text-right">{tot.cardTotal.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.roomPriceTotal.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.subsidizedRooms}</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                          <td className="px-3 py-2.5 text-right">{tot.monthlyRoomCount}</td>
                          <td className="px-3 py-2.5 text-right">{tot.roomSuppliesCost.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.fbExpense.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{tot.fitGuestCount}</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                          <td className="px-3 py-2.5 text-right">{tot.salary.toLocaleString()}</td>
                          <td className="px-3 py-2.5"></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 訂金核對 ══ */}
        {activeTab === 'deposit' && (() => {
          const suggestMap = new Map((dmData?.suggestions || []).map(s => [s.bnbId, s.bankLineId]));
          const lineMatchedByBnb = new Map(
            (dmData?.bnbRecords || [])
              .filter(r => r.depositBankLineId)
              .map(r => [r.depositBankLineId, r.guestName])
          );
          const summary = dmData?.summary;
          const bnbRecords = dmData?.bnbRecords || [];
          const bankLines  = dmData?.bankLines  || [];

          return (
            <div>
              {/* 篩選列 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">月份</label>
                  <input type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={dmWarehouse} onChange={e => setDmWarehouse(e.target.value)} className={inputCls}>
                    <option value="">全部</option>
                    {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">存簿帳戶</label>
                  <select value={dmAccountId} onChange={e => setDmAccountId(e.target.value)} className={inputCls}>
                    <option value="">請選擇帳戶</option>
                    {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <button onClick={fetchDepositMatch} disabled={dmLoading || !dmAccountId}
                  className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                  {dmLoading ? '載入中…' : '查詢'}
                </button>
                {dmData && (
                  <button onClick={handleAutoMatch} disabled={dmMatching || !(dmData?.suggestions?.length) || isLocked}
                    className={`${btnCls} bg-amber-50 text-amber-700 disabled:opacity-40`}>
                    ⚡ 自動配對{dmData?.suggestions?.length ? `（${dmData.suggestions.length}筆）` : ''}
                  </button>
                )}
              </div>

              {/* 摘要卡 */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  {[
                    { label: 'BNB 訂金合計',  val: `NT$ ${summary.totalBnbDeposit.toLocaleString()}`,  color: 'text-indigo-700' },
                    { label: '存簿入帳合計',   val: `NT$ ${summary.totalBankCredit.toLocaleString()}`,  color: 'text-blue-700' },
                    { label: '差異',          val: `NT$ ${Math.abs(summary.diff).toLocaleString()}`,    color: summary.diff !== 0 ? 'text-red-600 font-bold' : 'text-green-600' },
                    { label: '已配對',         val: `${summary.matchedCount} 筆`,                        color: 'text-green-600' },
                    { label: '未配對（BNB）',  val: `${summary.unmatchedBnbCount} 筆`,                   color: summary.unmatchedBnbCount > 0 ? 'text-amber-600' : 'text-gray-500' },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                      <p className="text-xs text-gray-500">{c.label}</p>
                      <p className={`font-bold text-sm mt-0.5 ${c.color}`}>{c.val}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 配對按鈕 */}
              {(dmSelBnb && dmSelLine) && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                  <span className="text-sm text-indigo-700">已選取雙側各一筆，確認配對？</span>
                  <button onClick={handleMatch} disabled={dmMatching || isLocked}
                    className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                    {dmMatching ? '配對中…' : isLocked ? '已鎖帳' : '確認配對'}
                  </button>
                  <button onClick={() => { setDmSelBnb(null); setDmSelLine(null); }}
                    className="text-xs text-gray-500 hover:underline">取消</button>
                </div>
              )}

              {!dmData && !dmLoading && (
                <div className="text-center py-20 text-gray-400">請選擇存簿帳戶後按「查詢」</div>
              )}
              {dmLoading && (
                <div className="text-center py-20 text-gray-400">載入中…</div>
              )}

              {/* 雙欄核對表 */}
              {dmData && !dmLoading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* 左欄：BNB 訂金 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-800">訂房訂金（BNB）</span>
                      <span className="text-xs text-indigo-500">{bnbRecords.length} 筆　點選後再點右側存簿行配對</span>
                    </div>
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">狀態</th>
                            <th className="px-3 py-2 text-left">姓名</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">匯款日</th>
                            <th className="px-3 py-2 text-left">後五碼</th>
                            <th className="px-3 py-2 text-right">訂金</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {bnbRecords.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-8 text-gray-400">本月無訂金記錄</td></tr>
                          )}
                          {bnbRecords.map(r => {
                            const isMatched  = !!r.depositBankLineId;
                            const isSuggested = !isMatched && suggestMap.has(r.id);
                            const isSelected = dmSelBnb === r.id;
                            let rowCls = 'cursor-pointer transition-colors ';
                            if (isSelected)  rowCls += 'bg-indigo-100 ring-1 ring-inset ring-indigo-300';
                            else if (isMatched)   rowCls += 'bg-green-50 hover:bg-green-100';
                            else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100';
                            else rowCls += 'hover:bg-gray-50';
                            return (
                              <tr key={r.id} className={rowCls}
                                onClick={() => !isMatched && setDmSelBnb(isSelected ? null : r.id)}>
                                <td className="px-3 py-2.5">
                                  {isMatched
                                    ? <span className="text-green-600 font-bold">✓</span>
                                    : isSuggested
                                      ? <span className="text-amber-500">⚡</span>
                                      : <span className="text-gray-300">○</span>
                                  }
                                </td>
                                <td className="px-3 py-2.5 max-w-[100px] truncate font-medium">{r.guestName}</td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                                <td className="px-3 py-2.5 text-blue-500 whitespace-nowrap text-xs">{r.depositDate || '—'}</td>
                                <td className="px-3 py-2.5 text-blue-600 font-mono text-xs tracking-wider">{r.depositLast5 || '—'}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                  {r.payDeposit.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {isMatched && !isLocked && (
                                    <button onClick={e => { e.stopPropagation(); handleUnmatch(r.id); }}
                                      className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50">
                                      解除
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 右欄：存簿入帳 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-blue-800">存簿入帳（銀行明細）</span>
                      <span className="text-xs text-blue-500">{bankLines.length} 筆入帳</span>
                    </div>
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">狀態</th>
                            <th className="px-3 py-2 text-left">日期</th>
                            <th className="px-3 py-2 text-left">說明</th>
                            <th className="px-3 py-2 text-right">金額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {bankLines.length === 0 && (
                            <tr><td colSpan={4} className="text-center py-8 text-gray-400">本月無存簿入帳資料</td></tr>
                          )}
                          {bankLines.map(l => {
                            const isUsed      = l.isUsed;
                            const isSuggested = !isUsed && [...suggestMap.values()].includes(l.id);
                            const isSelected  = dmSelLine === l.id;
                            const matchedTo   = lineMatchedByBnb.get(l.id);
                            let rowCls = 'transition-colors ';
                            if (isUsed) rowCls += 'bg-green-50 opacity-70';
                            else if (isSelected) rowCls += 'bg-indigo-100 cursor-pointer ring-1 ring-inset ring-indigo-300';
                            else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100 cursor-pointer';
                            else rowCls += 'hover:bg-gray-50 cursor-pointer';
                            return (
                              <tr key={l.id} className={rowCls}
                                onClick={() => !isUsed && setDmSelLine(isSelected ? null : l.id)}>
                                <td className="px-3 py-2.5">
                                  {isUsed
                                    ? <span className="text-green-600 font-bold" title={`已配對：${matchedTo}`}>✓</span>
                                    : isSuggested
                                      ? <span className="text-amber-500">⚡</span>
                                      : <span className="text-gray-300">○</span>
                                  }
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{l.txDate}</td>
                                <td className="px-3 py-2.5 max-w-[160px] truncate text-gray-500"
                                  title={l.description || ''}>
                                  {l.description || '—'}
                                  {isUsed && matchedTo && (
                                    <span className="ml-1 text-green-600">（{matchedTo}）</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-blue-700">
                                  {l.creditAmount.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══ Tab: OTA比對 ══ */}
        {activeTab === 'otaRecon' && (
          <div>
            {/* 搜尋列 */}
            <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">OTA 來源</label>
                <select className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaSource} onChange={e => setOtaSource(e.target.value)}>
                  <option value="Booking">Booking.com</option>
                  <option value="Agoda">Agoda</option>
                  <option value="Expedia">Expedia</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入住起日</label>
                <input type="date" className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaDateFrom} onChange={e => setOtaDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入住迄日</label>
                <input type="date" className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaDateTo} onChange={e => setOtaDateTo(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaWarehouse} onChange={e => setOtaWarehouse(e.target.value)}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">上傳對帳單</label>
                <input type="file" accept=".xls,.xlsx,.csv"
                  className="border rounded-lg px-2 py-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  onChange={e => setOtaFile(e.target.files?.[0] || null)} />
              </div>
              <button onClick={runOtaReconcile} disabled={otaLoading || !otaFile}
                className="px-5 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {otaLoading ? '比對中…' : '開始比對'}
              </button>
            </div>

            {/* 比對結果 */}
            {otaResult && (() => {
              const s = otaResult.summary;
              return (
                <div>
                  {/* 摘要卡片 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                    {[
                      { lbl: 'OTA 筆數', val: otaResult.otaRowCount },
                      { lbl: '系統筆數', val: otaResult.bnbRowCount },
                      { lbl: '成功配對', val: s.matchedCount, color: 'text-green-700' },
                      { lbl: 'OTA 未配對', val: s.unmatchedOtaCnt, color: s.unmatchedOtaCnt > 0 ? 'text-red-600' : '' },
                      { lbl: '系統未配對', val: s.unmatchedBnbCnt, color: s.unmatchedBnbCnt > 0 ? 'text-amber-600' : '' },
                      { lbl: '差異筆數', val: s.issueCount, color: s.issueCount > 0 ? 'text-red-600' : '' },
                      { lbl: '已取消', val: s.cancelledCount },
                    ].map(c => (
                      <div key={c.lbl} className="bg-white rounded-xl shadow p-3 text-center">
                        <div className="text-xs text-gray-500">{c.lbl}</div>
                        <div className={`text-xl font-bold ${c.color || 'text-gray-800'}`}>{c.val}</div>
                      </div>
                    ))}
                  </div>
                  {/* 金額摘要 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { lbl: 'OTA 總金額', val: s.otaTotal.toLocaleString() },
                      { lbl: '系統總金額', val: s.bnbTotal.toLocaleString() },
                      { lbl: '總差異', val: s.diff.toLocaleString(), color: Math.abs(s.diff) > 0 ? 'text-red-600' : 'text-green-700' },
                      { lbl: 'OTA 佣金合計', val: s.otaCommission.toLocaleString() },
                    ].map(c => (
                      <div key={c.lbl} className="bg-white rounded-xl shadow p-3 text-center">
                        <div className="text-xs text-gray-500">{c.lbl}</div>
                        <div className={`text-lg font-bold ${c.color || 'text-gray-800'}`}>NT${c.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* 子分頁切換 */}
                  <div className="flex gap-1 mb-3">
                    {[
                      { k: 'matched', l: `已配對 (${s.matchedCount})` },
                      { k: 'unmatchedOta', l: `OTA未配對 (${s.unmatchedOtaCnt})` },
                      { k: 'unmatchedBnb', l: `系統未配對 (${s.unmatchedBnbCnt})` },
                      { k: 'cancelled', l: `已取消 (${s.cancelledCount})` },
                    ].map(t => (
                      <button key={t.k} onClick={() => setOtaViewTab(t.k)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${otaViewTab === t.k ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                        {t.l}
                      </button>
                    ))}
                  </div>

                  {/* 已配對 */}
                  {otaViewTab === 'matched' && (
                    <div className="bg-white rounded-xl shadow overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">退房</th>
                            <th className="px-3 py-2 text-left">OTA 姓名</th>
                            <th className="px-3 py-2 text-left">系統姓名</th>
                            <th className="px-3 py-2 text-left">房號</th>
                            <th className="px-3 py-2 text-right">OTA 金額</th>
                            <th className="px-3 py-2 text-right">系統金額</th>
                            <th className="px-3 py-2 text-right">差異</th>
                            <th className="px-3 py-2 text-right">佣金</th>
                            <th className="px-3 py-2 text-center">訂單號</th>
                            <th className="px-3 py-2 text-center">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.matched.length === 0 && (
                            <tr><td colSpan={12} className="text-center py-8 text-gray-400">無配對資料</td></tr>
                          )}
                          {otaResult.matched.map((m, i) => (
                            <tr key={i} className={`hover:bg-gray-50 ${m.hasAmtIssue || m.hasNameIssue ? 'bg-amber-50' : ''}`}>
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{m.ota.arrival}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{m.ota.departure}</td>
                              <td className="px-3 py-2">{m.ota.guestName}
                                {m.hasNameIssue && <span className="ml-1 text-amber-500 text-xs" title="姓名不符">⚠</span>}
                              </td>
                              <td className="px-3 py-2">{m.bnb.guestName}</td>
                              <td className="px-3 py-2 text-gray-500">{m.bnb.roomNo || '—'}</td>
                              <td className="px-3 py-2 text-right">{m.ota.finalAmount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right">{m.bnb.roomCharge.toLocaleString()}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${m.hasAmtIssue ? 'text-red-600' : 'text-green-600'}`}>
                                {m.amountDiff === 0 ? '—' : m.amountDiff > 0 ? `+${m.amountDiff}` : m.amountDiff}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-500">{m.ota.commissionAmt.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-xs text-gray-400 font-mono">{m.ota.reservationNo}</td>
                              <td className="px-3 py-2 text-center">
                                {m.hasAmtIssue || m.hasNameIssue
                                  ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">有差異</span>
                                  : <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">吻合</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* OTA未配對 */}
                  {otaViewTab === 'unmatchedOta' && (
                    <div className="bg-white rounded-xl shadow overflow-x-auto">
                      <p className="px-4 pt-3 text-sm text-red-600">以下筆數存在於 OTA 帳單，但在系統中找不到對應的訂房紀錄</p>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">訂單號</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">退房</th>
                            <th className="px-3 py-2 text-left">房客姓名</th>
                            <th className="px-3 py-2 text-left">訂房人</th>
                            <th className="px-3 py-2 text-right">金額</th>
                            <th className="px-3 py-2 text-right">佣金</th>
                            <th className="px-3 py-2 text-center">OTA狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.unmatchedOta.length === 0 && (
                            <tr><td colSpan={9} className="text-center py-8 text-green-600">全部 OTA 筆數都有配對</td></tr>
                          )}
                          {otaResult.unmatchedOta.map((r, i) => (
                            <tr key={i} className="hover:bg-red-50">
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 font-mono text-xs">{r.reservationNo}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.arrival}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.departure}</td>
                              <td className="px-3 py-2">{r.guestName}</td>
                              <td className="px-3 py-2 text-gray-500">{r.bookerName}</td>
                              <td className="px-3 py-2 text-right font-semibold">{r.finalAmount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-gray-500">{r.commissionAmt.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-xs">{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 系統未配對 */}
                  {otaViewTab === 'unmatchedBnb' && (
                    <div className="bg-white rounded-xl shadow overflow-x-auto">
                      <p className="px-4 pt-3 text-sm text-amber-600">以下筆數存在於系統，但在 OTA 帳單中找不到對應紀錄（可能是直接訂房、電話訂、其他來源）</p>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">退房</th>
                            <th className="px-3 py-2 text-left">房客姓名</th>
                            <th className="px-3 py-2 text-left">房號</th>
                            <th className="px-3 py-2 text-right">房費</th>
                            <th className="px-3 py-2 text-center">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.unmatchedBnb.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-8 text-green-600">全部系統紀錄都有配對</td></tr>
                          )}
                          {otaResult.unmatchedBnb.map((r, i) => (
                            <tr key={i} className="hover:bg-amber-50">
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.checkInDate}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.checkOutDate}</td>
                              <td className="px-3 py-2">{r.guestName}</td>
                              <td className="px-3 py-2 text-gray-500">{r.roomNo || '—'}</td>
                              <td className="px-3 py-2 text-right font-semibold">{r.roomCharge.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center text-xs">{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 已取消 */}
                  {otaViewTab === 'cancelled' && (
                    <div className="bg-white rounded-xl shadow overflow-x-auto">
                      <p className="px-4 pt-3 text-sm text-gray-500">以下為 OTA 帳單中標記為已取消的訂單</p>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">訂單號</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">退房</th>
                            <th className="px-3 py-2 text-left">房客姓名</th>
                            <th className="px-3 py-2 text-right">原始金額</th>
                            <th className="px-3 py-2 text-right">最終金額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.cancelledOta.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-8 text-gray-400">無已取消訂單</td></tr>
                          )}
                          {otaResult.cancelledOta.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 font-mono text-xs">{r.reservationNo}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.arrival}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{r.departure}</td>
                              <td className="px-3 py-2">{r.guestName}</td>
                              <td className="px-3 py-2 text-right line-through text-gray-400">{r.originalAmount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-semibold">{r.finalAmount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

      </main>

      {/* 付款明細 Modal */}
      {editRecord && (
        <PaymentModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { setEditRecord(null); fetchRecords(); }}
        />
      )}
    </div>
  );
}
