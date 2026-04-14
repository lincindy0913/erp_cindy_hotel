'use client';

import { useState, useEffect, useCallback } from 'react';
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
  { key: 'monthly',    label: '月收入總表' },
  { key: 'pnl',        label: '月收支總表' },
  { key: 'declaration',label: '旅宿網申報' },
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
    payDeposit:  record.payDeposit  || 0,
    payCard:     record.payCard     || 0,
    payCash:     record.payCash     || 0,
    payVoucher:  record.payVoucher  || 0,
    cardFeeRate: record.cardFeeRate || 0.0165,
    note:        record.note        || '',
  });
  const [saving, setSaving] = useState(false);
  const cardFee = (Number(form.payCard) * Number(form.cardFeeRate)).toFixed(0);
  const total = Number(form.payDeposit) + Number(form.payCard) + Number(form.payCash) + Number(form.payVoucher);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/bnb/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cardFeeRate: parseFloat(form.cardFeeRate) }),
      });
      if (!res.ok) { showToast('儲存失敗', 'error'); return; }
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
          {[['payDeposit','訂金匯款'],['payCard','刷卡金額'],['payCash','現金'],['payVoucher','住宿卷']].map(([k,label]) => (
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
export default function BnbPage() {
  useSession();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('records');

  // ── 訂房明細 state ────────────────────────────────────────────
  const [records, setRecords]       = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editRecord, setEditRecord] = useState(null);

  // ── 雲掌櫃匯入 state ─────────────────────────────────────────
  const [importFile,    setImportFile]    = useState(null);
  const [importMonth,   setImportMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [importWarehouse, setImportWarehouse] = useState('民宿');
  const [importReplace, setImportReplace] = useState(true);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);

  // ── 月彙整 state ─────────────────────────────────────────────
  const [summaryYear,    setSummaryYear]    = useState(() => new Date().getFullYear().toString());
  const [summaryRows,    setSummaryRows]    = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── 館別清單 state ────────────────────────────────────────────
  const [warehouseList, setWarehouseList] = useState([]);

  // ── 旅宿網申報 state ─────────────────────────────────────────
  const [declMonth,     setDeclMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [declWarehouse, setDeclWarehouse] = useState('民宿');
  const [declForm, setDeclForm] = useState({
    avgRoomRate: '', roomSuppliesCost: '', fbExpense: '',
    staffCount: '', salary: '', businessSource: '其他100%',
    fitGuestCount: '', otherIncome: '', otherIncomeNote: '', note: '',
  });
  const [declSaving, setDeclSaving] = useState(false);
  const [declLoading, setDeclLoading] = useState(false);

  // ── 館別清單 fetch ────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/warehouse-departments')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.list) {
          setWarehouseList(data.list.filter(w => w.type === 'building').map(w => w.name));
        }
      })
      .catch(() => {});
  }, []);

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

  // ── 旅宿網申報 fetch ──────────────────────────────────────────
  const fetchDecl = useCallback(async () => {
    setDeclLoading(true);
    try {
      const res = await fetch(`/api/bnb/monthly-report?month=${declMonth}&warehouse=${encodeURIComponent(declWarehouse)}`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setDeclForm({
            avgRoomRate:      data.avgRoomRate      ?? '',
            roomSuppliesCost: data.roomSuppliesCost ?? '',
            fbExpense:        data.fbExpense        ?? '',
            staffCount:       data.staffCount       ?? '',
            salary:           data.salary           ?? '',
            businessSource:   data.businessSource   || '其他100%',
            fitGuestCount:    data.fitGuestCount    ?? '',
            otherIncome:      data.otherIncome      || '',
            otherIncomeNote:  data.otherIncomeNote  || '',
            note:             data.note             || '',
          });
        }
      }
    } finally { setDeclLoading(false); }
  }, [declMonth, declWarehouse]);

  useEffect(() => {
    if (activeTab === 'records')     fetchRecords();
    if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary();
    if (activeTab === 'declaration') fetchDecl();
  }, [activeTab]);

  useEffect(() => { if (activeTab === 'records') fetchRecords(); }, [filterMonth, filterSource, filterStatus]);
  useEffect(() => { if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary(); }, [summaryYear]);
  useEffect(() => { if (activeTab === 'declaration') fetchDecl(); }, [declMonth, declWarehouse]);

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
      if (!res.ok) { showToast(data.message || '匯入失敗', 'error'); return; }
      setImportResult(data);
      showToast(`匯入成功：${data.imported} 筆`, 'success');
      setImportFile(null);
    } catch { showToast('匯入失敗', 'error'); }
    finally { setImporting(false); }
  }

  // ── 刪除記錄 ──────────────────────────────────────────────────
  async function handleDelete(id, name) {
    if (!confirm(`確定刪除「${name}」的訂房記錄？`)) return;
    const res = await fetch(`/api/bnb/${id}`, { method: 'DELETE' });
    if (!res.ok) { showToast('刪除失敗', 'error'); return; }
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
      if (!res.ok) { showToast('儲存失敗', 'error'); return; }
      showToast('月報已儲存', 'success');
      if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary();
    } finally { setDeclSaving(false); }
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

            {/* 表格 */}
            {recLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['來源','姓名','房間','入住','退房','房費','消費','訂金','刷卡','手續費','現金','住宿卷','狀態',''].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.length === 0 && (
                      <tr><td colSpan={14} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {records.map(r => (
                      <tr key={r.id} className={`hover:bg-gray-50 ${r.status === '已刪除' ? 'opacity-40' : ''}`}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[r.source] || SOURCE_COLORS['其他']}`}>{r.source}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap max-w-[140px] truncate">{r.guestName}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{r.roomNo || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkInDate}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkOutDate}</td>
                        <td className="px-3 py-2 text-right">{Number(r.roomCharge).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherCharge) > 0 ? Number(r.otherCharge).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{Number(r.payDeposit) > 0 ? Number(r.payDeposit).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2 text-right text-purple-600">{Number(r.payCard) > 0 ? Number(r.payCard).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-400 text-xs">{Number(r.cardFee) > 0 ? Number(r.cardFee).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2 text-right text-green-600">{Number(r.payCash) > 0 ? Number(r.payCash).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{Number(r.payVoucher) > 0 ? Number(r.payVoucher).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                          {!r.paymentFilled && r.status !== '已刪除' && (
                            <span className="ml-1 text-[10px] text-amber-500">未填</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button onClick={() => setEditRecord(r)}
                            className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 mr-1">
                            付款
                          </button>
                          <button onClick={() => handleDelete(r.id, r.guestName)}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50">
                            刪
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

              <button onClick={handleImport} disabled={importing || !importFile}
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
          <div className="max-w-lg">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">旅宿網後台申報資料</h3>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">申報月份</label>
                  <input type="month" value={declMonth} onChange={e => setDeclMonth(e.target.value)} className={inputCls + ' w-full'} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={declWarehouse} onChange={e => setDeclWarehouse(e.target.value)} className={inputCls + ' w-full'}>
                    {warehouseList.length === 0
                      ? <option value="民宿">民宿</option>
                      : warehouseList.map(w => <option key={w} value={w}>{w}</option>)
                    }
                  </select>
                </div>
              </div>

              {declLoading && <p className="text-sm text-gray-400">載入中…</p>}

              <div className="grid grid-cols-2 gap-3">
                {[
                  ['avgRoomRate',      '平均房價',     'number'],
                  ['roomSuppliesCost', '客房備品費',   'number'],
                  ['fbExpense',        '餐飲支出',     'number'],
                  ['staffCount',       '員工人數',     'number'],
                  ['salary',           '薪資總額',     'number'],
                  ['fitGuestCount',    '住客FIT人數',  'number'],
                ].map(([k, label, type]) => (
                  <div key={k}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input type={type} value={declForm[k]} onChange={e => setDeclForm(p => ({ ...p, [k]: e.target.value }))}
                      className={inputCls + ' w-full'} />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">業務來源%</label>
                <input type="text" value={declForm.businessSource}
                  onChange={e => setDeclForm(p => ({ ...p, businessSource: e.target.value }))}
                  placeholder="例：Booking 60%、電話 40%" className={inputCls + ' w-full'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">其他額外收入</label>
                  <input type="number" value={declForm.otherIncome}
                    onChange={e => setDeclForm(p => ({ ...p, otherIncome: e.target.value }))}
                    className={inputCls + ' w-full'} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">收入說明</label>
                  <input type="text" value={declForm.otherIncomeNote}
                    onChange={e => setDeclForm(p => ({ ...p, otherIncomeNote: e.target.value }))}
                    className={inputCls + ' w-full'} />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">備註</label>
                <textarea rows={2} value={declForm.note}
                  onChange={e => setDeclForm(p => ({ ...p, note: e.target.value }))}
                  className={inputCls + ' w-full resize-none'} />
              </div>

              <button onClick={handleDeclSave} disabled={declSaving}
                className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {declSaving ? '儲存中…' : '儲存月報'}
              </button>
            </div>
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
