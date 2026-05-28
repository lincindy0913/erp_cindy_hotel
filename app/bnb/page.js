'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import { useToast } from '@/context/ToastContext';
import ExportButtons from '@/components/ExportButtons';

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const DEFAULT_WAREHOUSE = '民宿';

// ── 匯出欄位定義 ──────────────────────────────────────────────────
const BOOKING_EXPORT_COLS = [
  { header: '館別',     key: 'warehouse' },
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
  { header: '當天匯款', key: 'payTransfer', format: 'number' },
  { header: '匯款日期', key: 'transferDate' },
  { header: '帳號後五碼',key: 'transferLast5' },
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
  { header: '當天匯款', key: 'payTransfer',  format: 'number' },
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
  { key: 'records',      label: '訂房明細' },
  { key: 'otherIncome',  label: '其他收入' },
  { key: 'analytics',    label: '分析' },
  { key: 'declaration',label: '旅宿網申報' },
  { key: 'deposit',    label: '訂金核對' },
  { key: 'otaRecon',   label: 'OTA比對' },
  { key: 'otaCommission', label: 'OTA傭金' },
  { key: 'bossWithdraw', label: '老闆收取' },
  { key: 'payAudit',       label: '付款稽核' },
  { key: 'guestHistory',   label: '房客歷史' },
];

/** 分析分頁內子分頁（每日收入、報表與統計） */
const ANALYTICS_SUB_TABS = [
  { key: 'dailyRev',       label: '每日收入' },
  { key: 'monthly',        label: '月收入總表' },
  { key: 'pnl',            label: '月收支總表' },
  { key: 'declList',       label: '年度申報總表' },
  { key: 'sourceAnalysis', label: '來源分析' },
  { key: 'otaAnalytics',  label: 'OTA收益分析' },
  { key: 'occupancy',      label: '入住率統計' },
  { key: 'calendar',       label: '訂房日曆' },
];

const STATUS_COLORS = {
  '已退房': 'bg-gray-100 text-gray-600',
  '已入住': 'bg-green-100 text-green-700',
  '已預訂': 'bg-blue-100 text-blue-700',
  '已刪除': 'bg-red-100 text-red-500',
  '取消':   'bg-orange-100 text-orange-600',
  '未入住': 'bg-yellow-100 text-yellow-700',
};
function getStatusColor(s) { return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-600'; }
const SOURCE_COLORS = {
  'Booking': 'bg-indigo-100 text-indigo-700',
  '電話':    'bg-amber-100 text-amber-700',
  '其他':    'bg-gray-100 text-gray-600',
};

// ── 子元件：付款編輯 Modal ────────────────────────────────────────
function PaymentModal({ record, onClose, onSaved }) {
  const { showToast } = useToast();

  // 預設刷卡入帳日 = 退房日 + 1 天
  const defaultCardSettlement = (() => {
    if (record.cardSettlementDate) return record.cardSettlementDate;
    if (record.checkOutDate) {
      const d = new Date(record.checkOutDate);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    return '';
  })();

  const [form, setForm] = useState({
    payDeposit:         record.payDeposit         || 0,
    depositDate:        record.depositDate         || '',
    depositLast5:       record.depositLast5        || '',
    payTransfer:        record.payTransfer         || 0,
    transferDate:       record.transferDate        || '',
    transferLast5:      record.transferLast5       || '',
    payCard:            record.payCard             || 0,
    cardSettlementDate: defaultCardSettlement,
    payCash:            record.payCash             || 0,
    cashDestination:    record.cashDestination     || '',
    cashDepositDate:    record.cashDepositDate      || '',
    bossWithdrawNote:   record.bossWithdrawNote     || '',
    payVoucher:         record.payVoucher           || 0,
    cardFeeRate:        record.cardFeeRate          || 0.0165,
    note:               record.note                || '',
  });
  const [saving, setSaving] = useState(false);
  const cardFee    = (Number(form.payCard) * Number(form.cardFeeRate)).toFixed(0);
  const total      = Number(form.payDeposit) + Number(form.payTransfer) + Number(form.payCard) + Number(form.payCash) + Number(form.payVoucher);
  const hasDeposit  = Number(form.payDeposit)  > 0;
  const hasTransfer = Number(form.payTransfer) > 0;
  const hasCard     = Number(form.payCard)     > 0;
  const hasCash     = Number(form.payCash)     > 0;

  async function handleSave() {
    const expected = Number(record.roomCharge) + Number(record.otherCharge);
    if (total > 0 && Math.abs(total - expected) > 0.01) {
      if (!confirm(`收款合計 NT$${total.toLocaleString()} 與房費+消費 NT$${expected.toLocaleString()} 不符（差額 ${(total - expected) > 0 ? '+' : ''}${(total - expected).toLocaleString()}），確定要儲存嗎？`)) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/bnb/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cardFeeRate: parseFloat(form.cardFeeRate),
          // 僅在現金去向為存帳時傳 cashDepositDate
          cashDepositDate:  form.cashDestination === '存帳'    ? form.cashDepositDate  : null,
          bossWithdrawNote: form.cashDestination === '老闆收取' ? form.bossWithdrawNote : null,
        }),
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
        <div className="p-5 space-y-3 max-h-[72vh] overflow-y-auto">
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
          {/* 當天匯款 */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">當天匯款</label>
            <input type="number" min="0" value={form.payTransfer}
              onChange={e => setForm(p => ({ ...p, payTransfer: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasTransfer && (
            <div className="ml-2 pl-4 border-l-2 border-teal-200 space-y-2">
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-teal-600 shrink-0">匯款日期</label>
                <input type="date" value={form.transferDate}
                  onChange={e => setForm(p => ({ ...p, transferDate: e.target.value }))}
                  className="flex-1 border border-teal-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-teal-600 shrink-0">帳號後五碼</label>
                <input type="text" maxLength={5} placeholder="例：12345" value={form.transferLast5}
                  onChange={e => setForm(p => ({ ...p, transferLast5: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                  className="w-28 border border-teal-200 rounded-lg px-3 py-1.5 text-sm tracking-widest focus:ring-2 focus:ring-teal-300 outline-none" />
              </div>
            </div>
          )}

          {/* 刷卡金額 */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">刷卡金額</label>
            <input type="number" min="0" value={form.payCard}
              onChange={e => setForm(p => ({ ...p, payCard: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasCard && (
            <div className="ml-2 pl-4 border-l-2 border-purple-200 space-y-2">
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-purple-600 shrink-0">刷卡入帳日</label>
                <input type="date" value={form.cardSettlementDate}
                  onChange={e => setForm(p => ({ ...p, cardSettlementDate: e.target.value }))}
                  className="flex-1 border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-300 outline-none" />
                <span className="text-xs text-purple-400 whitespace-nowrap">刷卡後1-2天入帳</span>
              </div>
            </div>
          )}

          {/* 現金 */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">現金</label>
            <input type="number" min="0" value={form.payCash}
              onChange={e => setForm(p => ({ ...p, payCash: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasCash && (
            <div className="ml-2 pl-4 border-l-2 border-green-200 space-y-2">
              <div className="flex items-center gap-3">
                <label className="w-20 text-xs text-green-600 shrink-0">現金去向</label>
                <div className="flex gap-4">
                  {[['存帳','存入土銀'],['老闆收取','老闆收取']].map(([val, label]) => (
                    <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="cashDestination" value={val}
                        checked={form.cashDestination === val}
                        onChange={() => setForm(p => ({ ...p, cashDestination: val }))}
                        className="accent-green-600" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {form.cashDestination === '存帳' && (
                <div className="flex items-center gap-3">
                  <label className="w-20 text-xs text-green-600 shrink-0">存款日期</label>
                  <input type="date" value={form.cashDepositDate}
                    onChange={e => setForm(p => ({ ...p, cashDepositDate: e.target.value }))}
                    className="flex-1 border border-green-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-300 outline-none" />
                </div>
              )}
              {form.cashDestination === '老闆收取' && (
                <div className="flex items-center gap-3">
                  <label className="w-20 text-xs text-green-600 shrink-0">收取備註</label>
                  <input type="text" value={form.bossWithdrawNote}
                    onChange={e => setForm(p => ({ ...p, bossWithdrawNote: e.target.value }))}
                    placeholder="選填，例：老闆 4/15 收"
                    className="flex-1 border border-green-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-300 outline-none" />
                </div>
              )}
            </div>
          )}

          {/* 住宿券 */}
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-600 shrink-0">住宿卷</label>
            <input type="number" min="0" value={form.payVoucher}
              onChange={e => setForm(p => ({ ...p, payVoucher: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
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
          {total > 0 && Math.abs(total - (Number(record.roomCharge) + Number(record.otherCharge))) > 0.01 && (
            <p className="text-xs text-red-600 font-medium">⚠ 收款合計與房費+消費（NT${(Number(record.roomCharge)+Number(record.otherCharge)).toLocaleString()}）不符，差額 {(total - Number(record.roomCharge) - Number(record.otherCharge)) > 0 ? '+' : ''}NT${(total - Number(record.roomCharge) - Number(record.otherCharge)).toLocaleString()}</p>
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

// 民宿快速館別按鈕（點同館別再次點擊可取消選取回到全部）
const BNB_QUICK_WH = ['自在海', '花語'];
function WhQuickBtns({ value, onChange }) {
  return BNB_QUICK_WH.map(wh => (
    <button key={wh} type="button"
      onClick={() => onChange(value === wh ? '' : wh)}
      className={`text-xs px-2 py-1 rounded border transition-colors whitespace-nowrap ${value === wh ? 'bg-indigo-600 border-indigo-600 text-white font-medium' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'}`}>
      {wh}
    </button>
  ));
}

// ── 訂房新增 / 編輯 Modal ────────────────────────────────────────
function BookingFormModal({ record, onClose, onSaved, warehouseList }) {
  const { showToast } = useToast();
  const isEdit = !!(record?.id);
  const todayStr = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    importMonth:  record?.importMonth  || todayStr.substring(0, 7),
    warehouse:    record?.warehouse    || '民宿',
    source:       record?.source       || '電話',
    guestName:    record?.guestName    || '',
    roomNo:       record?.roomNo       || '',
    checkInDate:  record?.checkInDate  || '',
    checkOutDate: record?.checkOutDate || '',
    roomCharge:   record?.roomCharge   > 0 ? String(record.roomCharge) : '',
    otherCharge:  record?.otherCharge  > 0 ? String(record.otherCharge) : '',
    status:       record?.status       || '已入住',
    note:         record?.note         || '',
  });
  const [saving, setSaving] = useState(false);

  function handleCheckIn(val) {
    setForm(p => ({ ...p, checkInDate: val, importMonth: val ? val.substring(0, 7) : p.importMonth }));
  }

  async function handleSave() {
    if (!form.guestName.trim()) { showToast('請填寫姓名', 'error'); return; }
    if (!form.checkInDate || !form.checkOutDate) { showToast('請填寫入住/退房日期', 'error'); return; }
    if (form.checkInDate >= form.checkOutDate) { showToast('退房日需晚於入住日', 'error'); return; }
    setSaving(true);
    try {
      const url    = isEdit ? `/api/bnb/${record.id}` : '/api/bnb';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          roomCharge:  parseFloat(form.roomCharge)  || 0,
          otherCharge: parseFloat(form.otherCharge) || 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || err.error || '儲存失敗', 'error');
        return;
      }
      showToast(isEdit ? '訂房已更新' : '訂房已新增', 'success');
      onSaved();
    } finally { setSaving(false); }
  }

  const inp = 'w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none';
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            {isEdit ? `編輯訂房 — ${record.guestName}` : '新增訂房'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3 max-h-[72vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">館別</label>
              <select value={form.warehouse} onChange={e => setForm(p => ({ ...p, warehouse: e.target.value }))} className={inp}>
                {(warehouseList?.length ? warehouseList : ['民宿']).map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">來源</label>
              <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} className={inp}>
                <option value="電話">電話</option>
                <option value="Booking">Booking</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">姓名 <span className="text-red-400">*</span></label>
              <input type="text" value={form.guestName} onChange={e => setForm(p => ({ ...p, guestName: e.target.value }))} className={inp} placeholder="房客姓名" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">房間號碼</label>
              <input type="text" value={form.roomNo} onChange={e => setForm(p => ({ ...p, roomNo: e.target.value }))} className={inp} placeholder="例：101" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">入住日期 <span className="text-red-400">*</span></label>
              <input type="date" value={form.checkInDate} onChange={e => handleCheckIn(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">退房日期 <span className="text-red-400">*</span></label>
              <input type="date" value={form.checkOutDate} onChange={e => setForm(p => ({ ...p, checkOutDate: e.target.value }))} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">房費</label>
              <input type="number" min="0" value={form.roomCharge} onChange={e => setForm(p => ({ ...p, roomCharge: e.target.value }))} className={inp} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">其他消費</label>
              <input type="number" min="0" value={form.otherCharge} onChange={e => setForm(p => ({ ...p, otherCharge: e.target.value }))} className={inp} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={inp}>
                <option value="已預訂">已預訂</option>
                <option value="已入住">已入住</option>
                <option value="已退房">已退房</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">匯入月份</label>
              <input type="month" value={form.importMonth} onChange={e => setForm(p => ({ ...p, importMonth: e.target.value }))} className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">備註</label>
            <input type="text" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} className={inp} placeholder="選填" />
          </div>
        </div>
        <div className="p-4 flex gap-2 justify-end border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '儲存中…' : isEdit ? '更新' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────
// ── 付款欄位順序（Excel Tab 跳格用）────────────────────────────
const PAY_FIELDS = ['payDeposit', 'depositDate', 'depositLast5', 'payTransfer', 'transferDate', 'transferLast5', 'payCard', 'payCash', 'payVoucher'];

export default function BnbPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('records');
  /** 分析分頁內子分頁 */
  const [analyticsSub, setAnalyticsSub] = useState('dailyRev');

  // 是否有鎖帳權限
  const canLock = session?.user?.role === 'admin'
    || (session?.user?.permissions || []).includes('bnb.lock')
    || (session?.user?.permissions || []).includes('bnb.edit');

  // ── 訂房明細 state ────────────────────────────────────────────
  const [records, setRecords]       = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recPage,  setRecPage]  = useState(1);
  const [recTotal, setRecTotal] = useState(0);
  const REC_PAGE_SIZE = 200;
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filterSource,    setFilterSource]    = useState('');
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterPayment, setFilterPayment] = useState(''); // '' | 'unfilled' | 'filled'
  const [editRecord,    setEditRecord]    = useState(null); // PaymentModal
  const [editBooking,   setEditBooking]   = useState(null); // BookingFormModal (edit)
  const [addBookingOpen,setAddBookingOpen]= useState(false); // BookingFormModal (add)

  // ── 入住率統計 state ──────────────────────────────────────────
  const [occYear,      setOccYear]      = useState(() => new Date().getFullYear().toString());
  const [occWarehouse, setOccWarehouse] = useState('');
  const [occData,      setOccData]      = useState(null);
  const [occLoading,   setOccLoading]   = useState(false);

  // ── 來源分析 state ────────────────────────────────────────────
  const [saYear,      setSaYear]      = useState(() => new Date().getFullYear().toString());
  const [saWarehouse, setSaWarehouse] = useState('');
  const [saData,      setSaData]      = useState(null);
  const [saLoading,   setSaLoading]   = useState(false);

  // ── OTA 收益分析 state ────────────────────────────────────────
  const [oaYear,      setOaYear]      = useState(() => new Date().getFullYear().toString());
  const [oaWarehouse, setOaWarehouse] = useState('');
  const [oaData,      setOaData]      = useState(null);
  const [oaLoading,   setOaLoading]   = useState(false);

  // ── 付款稽核 state ────────────────────────────────────────────
  const [auditMonth,     setAuditMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [auditWarehouse, setAuditWarehouse] = useState('');
  const [auditData,      setAuditData]      = useState([]);
  const [auditLoading,   setAuditLoading]   = useState(false);

  // ── 房客歷史 state ────────────────────────────────────────────
  const [ghSearch,   setGhSearch]   = useState('');
  const [ghData,     setGhData]     = useState([]);
  const [ghLoading,  setGhLoading]  = useState(false);
  const [ghSearched, setGhSearched] = useState(false);

  // ── 訂房日曆 state ────────────────────────────────────────────
  const [calYear,      setCalYear]      = useState(() => new Date().getFullYear());
  const [calMonth,     setCalMonth]     = useState(() => new Date().getMonth() + 1);
  const [calWarehouse, setCalWarehouse] = useState('');
  const [calData,      setCalData]      = useState([]);
  const [calLoading,   setCalLoading]   = useState(false);

  // ── 老闆收取 state ────────────────────────────────────────────
  const [bwData,        setBwData]        = useState(null);
  const [bwLoading,     setBwLoading]     = useState(false);
  const [bwMonth,       setBwMonth]       = useState(() => new Date().toISOString().slice(0, 7));
  const [bwWarehouse,   setBwWarehouse]   = useState('');
  const [bwViewMode,    setBwViewMode]    = useState('detail');   // 'detail' | 'monthly'
  const [bwYear,        setBwYear]        = useState(() => String(new Date().getFullYear()));
  const [bwSummary,     setBwSummary]     = useState(null);
  const [bwSummaryLoad, setBwSummaryLoad] = useState(false);

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
  const [importFile,      setImportFile]      = useState(null);
  const [importMonth,     setImportMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [importWarehouse, setImportWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [importReplace,   setImportReplace]   = useState(true);
  const [importing,       setImporting]       = useState(false);
  const [importResult,    setImportResult]    = useState(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importPreview,   setImportPreview]   = useState(null);   // { rows, totalRows, detectedMonth }
  const [importConfirm,   setImportConfirm]   = useState(null);   // { existingCount }
  const [importHistory,   setImportHistory]   = useState(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(sessionStorage.getItem('bnb_import_history') || '[]'); } catch { return []; }
  });

  // ── 每日收入 state ──────────────────────────────────────────
  const [drMonth,      setDrMonth]      = useState(() => new Date().toISOString().slice(0, 7));
  const [drWarehouse,  setDrWarehouse]  = useState(DEFAULT_WAREHOUSE);
  const [drData,       setDrData]       = useState(null);
  const [drLoading,    setDrLoading]    = useState(false);
  const [drExpandDay,  setDrExpandDay]  = useState(null);

  // ── 月彙整 state ─────────────────────────────────────────────
  const [summaryYear,      setSummaryYear]      = useState(() => new Date().getFullYear().toString());
  const [summaryWarehouse, setSummaryWarehouse] = useState('');
  const [summaryMode,      setSummaryMode]      = useState('monthly'); // 'monthly' | 'annual'
  const [summaryRows,      setSummaryRows]      = useState([]);
  const [summaryLoading,   setSummaryLoading]   = useState(false);
  /** /api/bnb/monthly-summary 回傳之 fixedExpenseHelp */
  const [summaryFixedHelp, setSummaryFixedHelp] = useState(null);

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
  const [dmPayType,     setDmPayType]     = useState('combined'); // deposit | transfer | card | cash | all | ledger | combined
  const [dmMarkModal,   setDmMarkModal]   = useState(null);     // { bnbId, skipType }
  const [dmMarkNote,    setDmMarkNote]    = useState('');

  // ── 存簿匯入 modal state ──────────────────────────────────────
  const [showBankImport, setShowBankImport] = useState(false);
  const [bankImportLines, setBankImportLines] = useState([]);
  const [bankImportFileName, setBankImportFileName] = useState('');
  const [bankImportParsing, setBankImportParsing] = useState(false);
  const [bankImportSubmitting, setBankImportSubmitting] = useState(false);
  const [bankImportError, setBankImportError] = useState('');

  // ── 收款流水帳 state ─────────────────────────────────────────
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [ledgerMonthFrom, setLedgerMonthFrom] = useState(thisMonth);
  const [ledgerMonthTo,   setLedgerMonthTo]   = useState(thisMonth);
  const [ledgerWarehouse, setLedgerWarehouse] = useState('');
  const [ledgerRows,      setLedgerRows]      = useState([]);
  const [ledgerLoading,   setLedgerLoading]   = useState(false);

  // ── 其他收入 state ──────────────────────────────────────────
  const [oiMonth,       setOiMonth]       = useState(thisMonth);
  const [oiWarehouse,   setOiWarehouse]   = useState('');
  const [oiRows,        setOiRows]        = useState([]);
  const [oiLoading,     setOiLoading]     = useState(false);
  const [oiModalOpen,   setOiModalOpen]   = useState(false);
  const [oiEditRow,     setOiEditRow]     = useState(null); // null=新增, obj=編輯
  const [oiSaving,      setOiSaving]      = useState(false);
  const OI_CATEGORIES = ['停車費', '清潔費', '設備租借', '其他'];
  const [oiForm, setOiForm] = useState({ importMonth: thisMonth, warehouse: DEFAULT_WAREHOUSE, incomeDate: '', category: '', description: '', amount: '', note: '' });

  // ── 旅宿網申報 state ─────────────────────────────────────────
  const [declMonth,     setDeclMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [declWarehouse, setDeclWarehouse] = useState(DEFAULT_WAREHOUSE);
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
  const [dlWarehouse, setDlWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [dlRows,    setDlRows]    = useState([]);
  const [dlLoading, setDlLoading] = useState(false);

  // ── OTA 比對 state ──────────────────────────────────────────
  const [otaSource,    setOtaSource]    = useState('Booking');
  const [otaDateFrom,  setOtaDateFrom]  = useState('');
  const [otaDateTo,    setOtaDateTo]    = useState('');
  const [otaWarehouse, setOtaWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [otaFile,      setOtaFile]      = useState(null);
  const [otaResult,    setOtaResult]    = useState(null);
  const [otaLoading,   setOtaLoading]   = useState(false);
  const [otaMonth,     setOtaMonth]     = useState('');
  const [otaViewTab,   setOtaViewTab]   = useState('matched'); // matched | unmatchedOta | unmatchedBnb | cancelled
  // OTA 傭金確認
  const [commAmt,        setCommAmt]        = useState('');
  const [commMethod,     setCommMethod]     = useState('轉帳');
  const [commNote,       setCommNote]       = useState('');
  const [commSubmitting, setCommSubmitting] = useState(false);
  const [commExisting,   setCommExisting]   = useState(null);  // { exists, record, orderStatus }
  const [reconcileConfirmed, setReconcileConfirmed] = useState(false); // 是否已確認存檔
  const [reconcileConfirming, setReconcileConfirming] = useState(false);
  // OTA 傭金歷史列表
  const [commHistRows,   setCommHistRows]   = useState([]);
  const [commHistLoading,setCommHistLoading]= useState(false);
  const [commEditId,    setCommEditId]    = useState(null);   // 正在編輯的傭金 id
  const [commEditData,  setCommEditData]  = useState({});     // { commissionAmount, paymentMethod, note }
  const [commEditSaving,setCommEditSaving]= useState(false);
  // OTA 比對記錄 (reconcile log)
  const [reconLogs,      setReconLogs]      = useState([]);
  const [reconLogsLoading, setReconLogsLoading] = useState(false);

  // ── 鎖帳 state ──────────────────────────────────────────────
  const [lockStatus, setLockStatus]   = useState(null); // { locked, lockedAt, lockedBy }
  const [lockLoading, setLockLoading] = useState(false);

  // ── 館別清單（session 載入後才 fetch，否則會 401）────────────
  useEffect(() => {
    if (!session) return;
    fetch('/api/warehouse-departments')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.list) {
          const list = data.list.filter(w => w.type === 'building' && !w.parentId).map(w => w.name);
          if (list.length === 0) return;
          setWarehouseList(list);
          const first = list[0];
          setImportWarehouse(prev => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDrWarehouse(prev    => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDeclWarehouse(prev  => prev === DEFAULT_WAREHOUSE ? first : prev);
          setDlWarehouse(prev    => prev === DEFAULT_WAREHOUSE ? first : prev);
          setOtaWarehouse(prev   => prev === DEFAULT_WAREHOUSE ? first : prev);
        }
      })
      .catch(() => {});
  }, [session]);

  // ── 銀行帳戶 fetch（mount once）──────────────────────────────
  useEffect(() => {
    fetch('/api/cashflow/accounts')
      .then(r => r.ok ? r.json() : [])
      .then(data => setDmAccounts(data.filter(a => a.type === '銀行存款' && a.isActive)))
      .catch(() => {});
  }, []);

  // ── 鎖帳 fetch / toggle ──────────────────────────────────────
  const fetchLockStatus = useCallback(async (month, warehouse = DEFAULT_WAREHOUSE) => {
    if (!month) return;
    try {
      const p = new URLSearchParams({ month, warehouse });
      const res = await fetch(`/api/bnb/lock?${p}`);
      if (res.ok) setLockStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  const getActiveLockContext = useCallback(() => {
    switch (activeTab) {
      case 'declaration': return { month: declMonth,   warehouse: declWarehouse };
      case 'deposit':     return { month: dmMonth,     warehouse: dmWarehouse || DEFAULT_WAREHOUSE };
      default:            return { month: filterMonth,  warehouse: DEFAULT_WAREHOUSE };
    }
  }, [activeTab, filterMonth, declMonth, declWarehouse, dmMonth, dmWarehouse]);

  const toggleLock = useCallback(async () => {
    if (lockLoading) return;
    const { month, warehouse } = getActiveLockContext();
    const isLocked = lockStatus?.locked;
    const action = isLocked ? '解鎖' : '鎖帳';
    if (!confirm(`確定要${action}「${month}（${warehouse}）」的民宿帳嗎？${isLocked ? '' : '\n鎖帳後所有訂房資料、付款明細、匯入、申報都將無法修改。'}`)) return;
    setLockLoading(true);
    try {
      const p = new URLSearchParams({ month, warehouse });
      const res = isLocked
        ? await fetch(`/api/bnb/lock?${p}`, { method: 'DELETE' })
        : await fetch('/api/bnb/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, warehouse }) });
      if (res.ok) {
        const data = await res.json();
        setLockStatus(data);
        showToast(`${month} 已${data.locked ? '鎖帳' : '解鎖'}`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || `${action}失敗`, 'error');
      }
    } catch { showToast(`${action}失敗`, 'error'); }
    finally { setLockLoading(false); }
  }, [lockStatus, lockLoading, getActiveLockContext]);

  // ── 訂金核對 fetch ────────────────────────────────────────────
  const fetchDepositMatch = useCallback(async () => {
    if (dmPayType !== 'all' && dmPayType !== 'combined' && !dmAccountId) { showToast('請先選擇存簿帳戶', 'error'); return; }
    setDmLoading(true);
    try {
      const p = new URLSearchParams({ month: dmMonth, paymentType: dmPayType });
      if (dmAccountId) p.set('accountId', dmAccountId);
      if (dmWarehouse) p.set('warehouse', dmWarehouse);
      const res = await fetch(`/api/bnb/deposit-match?${p}`);
      if (!res.ok) { showToast('載入核對資料失敗', 'error'); return; }
      setDmData(await res.json());
      setDmSelBnb(null);
      setDmSelLine(null);
    } catch { showToast('載入核對資料失敗', 'error'); }
    finally { setDmLoading(false); }
  }, [dmMonth, dmAccountId, dmWarehouse, dmPayType]);

  // ── 存簿對帳單匯入（土地銀行 XLS / CSV）────────────────────────
  async function handleBankFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBankImportError('');
    setBankImportLines([]);
    setBankImportFileName(file.name);
    setBankImportParsing(true);

    const isExcel = /\.(xls|xlsx)$/i.test(file.name);
    const parsed = [];

    try {
      const parseAmount = (v) => {
        if (v == null || v === '') return 0;
        const n = parseFloat(String(v).replace(/,/g, '').trim());
        return isNaN(n) ? 0 : Math.abs(n);
      };
      const parseRocDate = (v) => {
        if (!v) return '';
        const s = String(v).replace(/\//g, '-').trim();
        const m = s.match(/^(\d{2,3})-(\d{1,2})-(\d{1,2})/);
        if (m) {
          const y = parseInt(m[1]) + (parseInt(m[1]) < 200 ? 1911 : 0);
          return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
        }
        return s;
      };

      if (isExcel) {
        const mod = await import('xlsx');
        const XLSX = mod.default || mod;
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array', raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

        // 找到表頭列（土地銀行格式：交易日期 or 交易日）
        let dataStart = 6;
        for (let r = 0; r < Math.min(matrix.length, 10); r++) {
          const first = String(matrix[r]?.[0] || '').trim();
          if (first === '交易日期' || first === '交易日') { dataStart = r + 1; break; }
        }
        for (let i = dataStart; i < matrix.length; i++) {
          const row = matrix[i];
          const txDate = parseRocDate(row[0]);
          if (!txDate) continue;
          const debit = parseAmount(row[3]);
          const credit = parseAmount(row[4]);
          if (debit === 0 && credit === 0) continue;
          const desc = [row[1], row[2]].filter(Boolean).join(' ').trim();
          const memo = String(row[6] || '').trim();
          parsed.push({
            txDate,
            description: memo ? `${desc} ｜${memo}` : desc,
            debitAmount: debit,
            creditAmount: credit,
            runningBalance: parseAmount(row[5]),
            referenceNo: memo.slice(0, 100),
          });
        }
      } else {
        // CSV（Big5 encoding）
        const reader = new FileReader();
        await new Promise((resolve, reject) => {
          reader.onload = (ev) => {
            try {
              const text = ev.target.result;
              const lines = text.split(/\r?\n/);
              let dataStart = 0;
              for (let i = 0; i < Math.min(lines.length, 15); i++) {
                if (lines[i].includes('交易日')) { dataStart = i + 1; break; }
              }
              for (let i = dataStart; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
                if (cols.length < 4) continue;
                const txDate = parseRocDate(cols[0]);
                if (!txDate) continue;
                const debit = parseAmount(cols[2]);
                const credit = parseAmount(cols[3]);
                if (debit === 0 && credit === 0) continue;
                const desc = [cols[1], cols[5]].filter(Boolean).join(' ').trim();
                parsed.push({
                  txDate,
                  description: desc || cols[1],
                  debitAmount: debit,
                  creditAmount: credit,
                  runningBalance: parseAmount(cols[4]),
                  referenceNo: (cols[5] || '').slice(0, 100),
                });
              }
              resolve();
            } catch (err) { reject(err); }
          };
          reader.onerror = reject;
          reader.readAsText(file, 'Big5');
        });
      }

      if (parsed.length === 0) {
        setBankImportError('無法解析檔案，請確認為土地銀行的 XLS/CSV 對帳單');
      } else {
        setBankImportLines(parsed);
      }
    } catch (err) {
      setBankImportError('解析失敗：' + (err.message || '未知錯誤'));
    }
    setBankImportParsing(false);
    // reset input
    e.target.value = '';
  }

  async function submitBankImport() {
    if (!bankImportLines.length || !dmAccountId) return;
    setBankImportSubmitting(true);
    try {
      const [y, m] = dmMonth.split('-').map(Number);
      const res = await fetch('/api/reconciliation/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: parseInt(dmAccountId),
          bankFormatId: 1,          // 土地銀行
          year: y,
          month: m,
          fileName: bankImportFileName,
          lines: bankImportLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setBankImportError(data.error?.message || data.error || '匯入失敗'); return; }
      showToast(`匯入成功：${bankImportLines.length} 筆`, 'success');
      setShowBankImport(false);
      setBankImportLines([]);
      setBankImportFileName('');
      fetchDepositMatch();
    } catch (err) {
      setBankImportError('匯入失敗：' + (err.message || ''));
    }
    setBankImportSubmitting(false);
  }

  // ── 收款流水帳 fetch ───────────────────────────────────────────
  async function fetchLedger() {
    setLedgerLoading(true);
    try {
      const p = new URLSearchParams({ monthFrom: ledgerMonthFrom, monthTo: ledgerMonthTo, pageSize: '2000' });
      if (ledgerWarehouse) p.set('warehouse', ledgerWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) { showToast('載入失敗', 'error'); return; }
      const data = await res.json();
      setLedgerRows(data.data || []);
    } catch { showToast('載入失敗', 'error'); }
    finally { setLedgerLoading(false); }
  }

  // ── 其他收入 fetch / CRUD ────────────────────────────────────
  async function fetchOtherIncome() {
    setOiLoading(true);
    try {
      const p = new URLSearchParams({ month: oiMonth });
      if (oiWarehouse) p.set('warehouse', oiWarehouse);
      const res = await fetch(`/api/bnb/other-income?${p}`);
      if (!res.ok) { showToast('載入失敗', 'error'); return; }
      const data = await res.json();
      setOiRows(data.data || []);
    } catch { showToast('載入失敗', 'error'); }
    finally { setOiLoading(false); }
  }

  function openOiModal(row = null) {
    if (row) {
      setOiForm({ importMonth: row.importMonth, warehouse: row.warehouse, incomeDate: row.incomeDate, category: row.category || '', description: row.description, amount: String(row.amount), note: row.note || '' });
      setOiEditRow(row);
    } else {
      setOiForm({ importMonth: oiMonth, warehouse: oiWarehouse || DEFAULT_WAREHOUSE, incomeDate: new Date().toISOString().split('T')[0], category: '', description: '', amount: '', note: '' });
      setOiEditRow(null);
    }
    setOiModalOpen(true);
  }

  async function saveOtherIncome() {
    if (!oiForm.incomeDate || !oiForm.description || !oiForm.amount) {
      showToast('請填寫日期、說明、金額', 'error'); return;
    }
    setOiSaving(true);
    try {
      const url  = oiEditRow ? `/api/bnb/other-income/${oiEditRow.id}` : '/api/bnb/other-income';
      const method = oiEditRow ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(oiForm) });
      if (!res.ok) { const d = await res.json(); showToast(d.message || '儲存失敗', 'error'); return; }
      showToast(oiEditRow ? '已更新' : '已新增', 'success');
      setOiModalOpen(false);
      fetchOtherIncome();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setOiSaving(false); }
  }

  async function deleteOtherIncome(id) {
    try {
      const res = await fetch(`/api/bnb/other-income/${id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      fetchOtherIncome();
    } catch { showToast('刪除失敗', 'error'); }
  }

  // ── 訂金手動配對 ──────────────────────────────────────────────
  async function handleMatch() {
    if (!dmSelBnb || !dmSelLine) return;
    setDmMatching(true);
    try {
      const res = await fetch('/api/bnb/deposit-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bnbId: dmSelBnb, bankLineId: dmSelLine, paymentType: dmPayType }),
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
    const res = await fetch(`/api/bnb/deposit-match?bnbId=${bnbId}&paymentType=${dmPayType}`, { method: 'DELETE' });
    if (!res.ok) { showToast('解除配對失敗', 'error'); return; }
    showToast('已解除配對', 'success');
    fetchDepositMatch();
  }

  async function handleMark() {
    if (!dmMarkModal) return;
    const { bnbId, skipType } = dmMarkModal;
    const res = await fetch('/api/bnb/deposit-match', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bnbId, paymentType: dmPayType, matchSkip: skipType, matchSkipNote: dmMarkNote || null }),
    });
    if (!res.ok) { showToast('標記失敗', 'error'); return; }
    showToast('已標記', 'success');
    setDmMarkModal(null);
    setDmMarkNote('');
    fetchDepositMatch();
  }

  async function handleClearMark(bnbId) {
    const res = await fetch('/api/bnb/deposit-match', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bnbId, paymentType: dmPayType, matchSkip: null, matchSkipNote: null }),
    });
    if (!res.ok) { showToast('清除標記失敗', 'error'); return; }
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
          body: JSON.stringify({ bnbId: s.bnbId, bankLineId: s.bankLineId, paymentType: dmPayType }),
        });
        if (res.ok) count++;
      }
      const totalUnmatched = (dmData?.summary?.unmatchedBnbCount ?? 0) - count;
      showToast(`已配對 ${count} 筆${totalUnmatched > 0 ? `，仍有 ${totalUnmatched} 筆待處理` : '，全部配對完成！'}`, count > 0 ? 'success' : 'info');
      await fetchDepositMatch();
      if (totalUnmatched > 0) {
        setTimeout(() => {
          document.querySelector('[data-first-unmatched]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    } catch { showToast('自動配對發生錯誤', 'error'); }
    finally { setDmMatching(false); }
  }

  // ── 訂房明細 fetch ────────────────────────────────────────────
  const fetchRecords = useCallback(async (page = 1) => {
    setRecLoading(true);
    try {
      const p = new URLSearchParams({ month: filterMonth, page: String(page), pageSize: '200' });
      if (filterSource)    p.set('source', filterSource);
      if (filterStatus)    p.set('status', filterStatus);
      if (filterWarehouse) p.set('warehouse', filterWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) {
        if (res.status === 401) { window.location.href = '/login'; return; }
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error || `載入訂房記錄失敗（${res.status}）`;
        showToast(msg, 'error');
        return;
      }
      const json = await res.json();
      setRecords(json.data ?? json);
      setRecTotal(json.total ?? (json.data ?? json).length);
      setRecPage(page);
    } catch (e) { showToast(`載入訂房記錄失敗：${e.message}`, 'error'); }
    finally { setRecLoading(false); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);

  // ── 月彙整 fetch ──────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const p = new URLSearchParams({ year: summaryYear, mode: summaryMode });
      if (summaryWarehouse) p.set('warehouse', summaryWarehouse);
      const res = await fetch(`/api/bnb/monthly-summary?${p}`);
      if (!res.ok) {
        showToast('載入月彙整失敗', 'error');
        setSummaryFixedHelp(null);
        return;
      }
      const data = await res.json();
      setSummaryRows(data.rows || []);
      setSummaryFixedHelp(data.fixedExpenseHelp ?? null);
    } catch { showToast('載入月彙整失敗', 'error'); setSummaryFixedHelp(null); }
    finally { setSummaryLoading(false); }
  }, [summaryYear, summaryWarehouse, summaryMode]);

  // ── 入住率統計 fetch ──────────────────────────────────────────
  const fetchOccupancy = useCallback(async () => {
    setOccLoading(true);
    try {
      const p = new URLSearchParams({ year: occYear });
      if (occWarehouse) p.set('warehouse', occWarehouse);
      const res = await fetch(`/api/bnb/occupancy?${p}`);
      if (res.ok) setOccData(await res.json());
    } catch { showToast('載入入住率失敗', 'error'); }
    finally { setOccLoading(false); }
  }, [occYear, occWarehouse]);

  // ── 來源分析 fetch ────────────────────────────────────────────
  const fetchSourceAnalysis = useCallback(async () => {
    setSaLoading(true);
    try {
      const p = new URLSearchParams({ year: saYear });
      if (saWarehouse) p.set('warehouse', saWarehouse);
      const res = await fetch(`/api/bnb/source-analysis?${p}`);
      if (res.ok) setSaData(await res.json());
    } catch { showToast('載入來源分析失敗', 'error'); }
    finally { setSaLoading(false); }
  }, [saYear, saWarehouse]);

  // ── OTA 收益分析 fetch ────────────────────────────────────────
  const fetchOtaAnalytics = useCallback(async () => {
    setOaLoading(true);
    try {
      const p = new URLSearchParams({ year: oaYear });
      if (oaWarehouse) p.set('warehouse', oaWarehouse);
      const res = await fetch(`/api/bnb/ota-analytics?${p}`);
      if (res.ok) setOaData(await res.json());
    } catch { showToast('載入 OTA 分析失敗', 'error'); }
    finally { setOaLoading(false); }
  }, [oaYear, oaWarehouse]);

  // ── 付款稽核 fetch（重用訂房 API 撈全月無篩選資料）─────────────
  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const p = new URLSearchParams({ month: auditMonth, pageSize: '500' });
      if (auditWarehouse) p.set('warehouse', auditWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows = (json.data ?? json).filter(r => r.status !== '已刪除');
      setAuditData(rows);
    } catch { showToast('載入付款稽核失敗', 'error'); }
    finally { setAuditLoading(false); }
  }, [auditMonth, auditWarehouse]);

  // ── 房客歷史 fetch ────────────────────────────────────────────
  const fetchGuestHistory = useCallback(async () => {
    if (!ghSearch.trim()) { showToast('請輸入姓名搜尋', 'error'); return; }
    setGhLoading(true);
    setGhSearched(true);
    try {
      const p = new URLSearchParams({ guestName: ghSearch.trim(), pageSize: '200' });
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) return;
      const json = await res.json();
      setGhData(json.data ?? json);
    } catch { showToast('查詢失敗', 'error'); }
    finally { setGhLoading(false); }
  }, [ghSearch]);

  // ── 訂房日曆 fetch ────────────────────────────────────────────
  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const ym = `${calYear}-${String(calMonth).padStart(2, '0')}`;
      const p = new URLSearchParams({ month: ym, pageSize: '500' });
      if (calWarehouse) p.set('warehouse', calWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) return;
      const json = await res.json();
      setCalData(json.data ?? json);
    } catch { showToast('載入日曆失敗', 'error'); }
    finally { setCalLoading(false); }
  }, [calYear, calMonth, calWarehouse]);

  // ── 每日收入 fetch ──────────────────────────────────────────
  // ── OTA 比對 執行 ──────────────────────────────────────────
  const runOtaReconcile = useCallback(async () => {
    if (!otaFile) { showToast('請先上傳 OTA 對帳單', 'error'); return; }
    setOtaLoading(true);
    setOtaResult(null);
    setReconcileConfirmed(false);
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
      setCommAmt(data.summary?.otaCommission > 0 ? String(data.summary.otaCommission) : '');
      // 查詢是否已有傭金記錄
      const month = otaDateFrom ? otaDateFrom.substring(0, 7) : new Date().toISOString().substring(0, 7);
      try {
        const p = new URLSearchParams({ month, source: otaSource, warehouse: otaWarehouse || DEFAULT_WAREHOUSE });
        const chk = await fetch(`/api/bnb/ota-commission?${p}`);
        if (chk.ok) setCommExisting(await chk.json());
      } catch {}
    } catch { showToast('OTA 比對失敗', 'error'); }
    finally { setOtaLoading(false); }
  }, [otaFile, otaSource, otaDateFrom, otaDateTo, otaWarehouse]);

  // OTA 傭金：建立草稿（不立即建立 PaymentOrder）
  const submitCommission = useCallback(async () => {
    if (!otaResult) return;
    const amt = Number(commAmt);
    if (!amt || amt <= 0) { showToast('請輸入有效的傭金金額', 'error'); return; }
    const month = otaDateFrom ? otaDateFrom.substring(0, 7) : new Date().toISOString().substring(0, 7);
    setCommSubmitting(true);
    try {
      const res = await fetch('/api/bnb/ota-commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionMonth: month,
          otaSource,
          warehouse: otaWarehouse || DEFAULT_WAREHOUSE,
          commissionAmount: amt,
          paymentMethod: commMethod,
          note: commNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '建立失敗', 'error'); return; }
      showToast('傭金草稿已建立，請到「OTA傭金」分頁確認金額後送出出納', 'success');
      // 重新查狀態
      const p = new URLSearchParams({ month, source: otaSource, warehouse: otaWarehouse || DEFAULT_WAREHOUSE });
      const chk = await fetch(`/api/bnb/ota-commission?${p}`);
      if (chk.ok) setCommExisting(await chk.json());
    } catch { showToast('建立失敗', 'error'); }
    finally { setCommSubmitting(false); }
  }, [otaResult, commAmt, commMethod, commNote, otaSource, otaDateFrom, otaWarehouse]);

  // OTA 傭金歷史列表
  const fetchCommHistory = useCallback(async () => {
    setCommHistLoading(true);
    try {
      const p = new URLSearchParams();
      if (otaWarehouse) p.set('warehouse', otaWarehouse);
      const res = await fetch(`/api/bnb/ota-commission?${p}`);
      if (res.ok) {
        const data = await res.json();
        setCommHistRows(data.rows || []);
      }
    } catch {}
    finally { setCommHistLoading(false); }
  }, [otaWarehouse]);

  // OTA 傭金：確認送出出納（草稿 → 待出納，建立 PaymentOrder）
  const confirmCommission = useCallback(async (id) => {
    if (!confirm('確認後將建立付款單並送出出納，確定嗎？')) return;
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '確認失敗', 'error'); return; }
      showToast(`傭金已送出出納（${data.orderNo}）`, 'success');
      fetchCommHistory();
    } catch { showToast('確認失敗', 'error'); }
  }, [fetchCommHistory]);

  // OTA 傭金：取消
  const cancelCommission = useCallback(async (id) => {
    if (!confirm('確定要取消此傭金應付款嗎？出納端的待付款單也會一同取消。')) return;
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '取消失敗', 'error'); return; }
      showToast('已取消傭金應付款', 'success');
      fetchCommHistory();
      const month = otaDateFrom ? otaDateFrom.substring(0, 7) : new Date().toISOString().substring(0, 7);
      const p = new URLSearchParams({ month, source: otaSource, warehouse: otaWarehouse || DEFAULT_WAREHOUSE });
      const chk = await fetch(`/api/bnb/ota-commission?${p}`);
      if (chk.ok) setCommExisting(await chk.json());
    } catch { showToast('取消失敗', 'error'); }
  }, [fetchCommHistory, otaSource, otaDateFrom, otaWarehouse]);

  // OTA 傭金：開始編輯
  const startEditComm = useCallback((row) => {
    setCommEditId(row.id);
    setCommEditData({
      commissionAmount: String(row.commissionAmount),
      paymentMethod: row.paymentMethod || '轉帳',
      note: row.note || '',
    });
  }, []);

  // OTA 傭金：儲存編輯
  const saveEditComm = useCallback(async () => {
    if (!commEditId) return;
    setCommEditSaving(true);
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${commEditId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionAmount: parseFloat(commEditData.commissionAmount) || 0,
          paymentMethod: commEditData.paymentMethod,
          note: commEditData.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '儲存失敗', 'error'); return; }
      showToast('傭金已更新', 'success');
      setCommEditId(null);
      fetchCommHistory();
    } catch { showToast('儲存失敗', 'error'); }
    finally { setCommEditSaving(false); }
  }, [commEditId, commEditData]);

  // OTA 比對：確認並存檔比對結果
  const confirmReconcile = useCallback(async () => {
    if (!otaResult) return;
    setReconcileConfirming(true);
    try {
      const s = otaResult.summary;
      const month = otaDateFrom ? otaDateFrom.substring(0, 7) : new Date().toISOString().substring(0, 7);
      const res = await fetch('/api/bnb/ota-reconcile-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reconcileMonth: month,
          otaSource,
          warehouse: otaWarehouse || DEFAULT_WAREHOUSE,
          dateFrom: otaDateFrom || null,
          dateTo: otaDateTo || null,
          otaRowCount:     otaResult.otaRowCount,
          bnbRowCount:     otaResult.bnbRowCount,
          matchedCount:    s.matchedCount,
          unmatchedOtaCnt: s.unmatchedOtaCnt,
          unmatchedBnbCnt: s.unmatchedBnbCnt,
          issueCount:      s.issueCount,
          cancelledCount:  s.cancelledCount,
          otaTotal:        s.otaTotal,
          bnbTotal:        s.bnbTotal,
          diff:            s.diff,
          otaCommission:   s.otaCommission,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '存檔失敗', 'error'); return; }
      setReconcileConfirmed(true);
      showToast('比對結果已確認存檔', 'success');
    } catch { showToast('存檔失敗', 'error'); }
    finally { setReconcileConfirming(false); }
  }, [otaResult, otaSource, otaWarehouse, otaDateFrom, otaDateTo]);

  // OTA比對：開啟編輯（以 bnbId 撈取完整記錄後開 BookingFormModal）
  const openOtaEdit = useCallback(async (bnbId) => {
    try {
      const res = await fetch(`/api/bnb/${bnbId}`);
      if (!res.ok) { showToast('載入訂房記錄失敗', 'error'); return; }
      const record = await res.json();
      if (!record) { showToast('找不到此訂房記錄', 'error'); return; }
      setEditBooking(record);
    } catch { showToast('載入訂房記錄失敗', 'error'); }
  }, []);

  // OTA比對：刪除系統記錄
  const deleteOtaBnb = useCallback(async (bnbId) => {
    if (!confirm('確定要刪除此筆系統訂房記錄嗎？')) return;
    try {
      const res = await fetch(`/api/bnb/${bnbId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '刪除失敗', 'error'); return; }
      showToast('已刪除', 'success');
      runOtaReconcile();
    } catch { showToast('刪除失敗', 'error'); }
  }, [runOtaReconcile]);

  // OTA比對：新增 OTA 資料到系統（預填欄位後開 BookingFormModal）
  const openOtaAdd = useCallback((otaRow) => {
    setEditBooking({
      id: null,
      guestName:   otaRow.guestName || '',
      checkInDate:  otaRow.arrival  || '',
      checkOutDate: otaRow.departure || '',
      roomCharge:   otaRow.finalAmount || 0,
      source: otaRow.source || otaSource,
      reservationNo: otaRow.reservationNo || '',
      warehouse: otaWarehouse || '',
      status: '已確認',
    });
  }, [otaSource, otaWarehouse]);

  // ── 老闆收取記錄 fetch ─────────────────────────────────────────
  const fetchBossWithdraw = useCallback(async () => {
    setBwLoading(true);
    try {
      const p = new URLSearchParams({ month: bwMonth });
      if (bwWarehouse) p.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${p}`);
      if (res.ok) setBwData(await res.json());
    } catch {}
    finally { setBwLoading(false); }
  }, [bwMonth, bwWarehouse]);

  const fetchBossWithdrawSummary = useCallback(async () => {
    setBwSummaryLoad(true);
    try {
      const p = new URLSearchParams({ year: bwYear, summary: 'true' });
      if (bwWarehouse) p.set('warehouse', bwWarehouse);
      const res = await fetch(`/api/bnb/boss-withdraw?${p}`);
      if (res.ok) setBwSummary(await res.json());
    } catch {}
    finally { setBwSummaryLoad(false); }
  }, [bwYear, bwWarehouse]);

  // OTA 比對歷史記錄
  const fetchReconLogs = useCallback(async () => {
    setReconLogsLoading(true);
    try {
      const p = new URLSearchParams();
      if (otaWarehouse) p.set('warehouse', otaWarehouse);
      const res = await fetch(`/api/bnb/ota-reconcile-log?${p}`);
      if (res.ok) {
        const data = await res.json();
        setReconLogs(data.rows || []);
      }
    } catch {}
    finally { setReconLogsLoading(false); }
  }, [otaWarehouse]);

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
    if (activeTab === 'otherIncome') fetchOtherIncome();
    if (activeTab === 'analytics' && analyticsSub === 'dailyRev') fetchDailyRevenue();
    if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
    if (activeTab === 'declaration') { setDeclSearched(false); setDeclActual(null); }
    if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
    if (activeTab === 'deposit' && dmAccountId) fetchDepositMatch();
    if (activeTab === 'otaCommission') { fetchCommHistory(); fetchReconLogs(); }
    if (activeTab === 'bossWithdraw')  fetchBossWithdraw();
    if (activeTab === 'analytics' && analyticsSub === 'occupancy') fetchOccupancy();
    if (activeTab === 'analytics' && analyticsSub === 'sourceAnalysis') fetchSourceAnalysis();
    if (activeTab === 'analytics' && analyticsSub === 'otaAnalytics')  fetchOtaAnalytics();
    if (activeTab === 'payAudit')      fetchAudit();
    if (activeTab === 'analytics' && analyticsSub === 'calendar') fetchCalendar();
  }, [activeTab, analyticsSub]);

  useEffect(() => {
    const ctx = getActiveLockContext();
    fetchLockStatus(ctx.month, ctx.warehouse);
  }, [activeTab, filterMonth, declMonth, declWarehouse, dmMonth, dmWarehouse]);

  useEffect(() => {
    if (activeTab === 'records') { setSelectedIds(new Set()); fetchRecords(); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);
  useEffect(() => {
    if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
  }, [summaryYear, summaryWarehouse, summaryMode, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
  }, [dlYear, dlWarehouse, activeTab, analyticsSub]);
  useEffect(() => { if (activeTab === 'bossWithdraw') fetchBossWithdraw(); }, [bwMonth, bwWarehouse, activeTab]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'occupancy') fetchOccupancy();
  }, [occYear, occWarehouse, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'sourceAnalysis') fetchSourceAnalysis();
  }, [saYear, saWarehouse, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'otaAnalytics') fetchOtaAnalytics();
  }, [oaYear, oaWarehouse, activeTab, analyticsSub]);
  useEffect(() => {
    if (activeTab === 'deposit') fetchDepositMatch();
  }, [dmPayType, activeTab]);
  useEffect(() => { if (activeTab === 'payAudit') fetchAudit(); }, [auditMonth, auditWarehouse, activeTab]);
  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'calendar') fetchCalendar();
  }, [calYear, calMonth, calWarehouse, activeTab, analyticsSub]);

  useEffect(() => {
    if (activeTab === 'analytics' && analyticsSub === 'dailyRev') fetchDailyRevenue();
  }, [drMonth, drWarehouse, activeTab, analyticsSub]);

  const isLocked   = !!lockStatus?.locked;
  const monthLocked = isLocked;

  // ── 選擇檔案後自動預覽（偵測月份 + 前 5 筆） ─────────────────
  async function handleFileSelect(file) {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportConfirm(null);
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('preview', 'true');
      const res  = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok && data.preview) {
        setImportPreview(data);
        // 自動更新月份（若偵測到不同月份）
        if (data.detectedMonth && data.detectedMonth !== importMonth) {
          setImportMonth(data.detectedMonth);
        }
      }
    } catch {} // 預覽失敗不阻礙後續操作
  }

  // ── 匯入（帶覆蓋確認） ────────────────────────────────────────
  async function handleImport() {
    if (!importFile) { showToast('請選擇檔案', 'error'); return; }
    if (importReplace) {
      // 查現有筆數，若有資料則顯示確認對話框
      try {
        const res  = await fetch(`/api/bnb/import?importMonth=${importMonth}&warehouse=${encodeURIComponent(importWarehouse)}`);
        const data = await res.json();
        if (data.count > 0) { setImportConfirm({ existingCount: data.count }); return; }
      } catch {}
    }
    await doImport();
  }

  // ── 實際執行匯入 ──────────────────────────────────────────────
  async function doImport() {
    setImporting(true); setImportResult(null); setImportConfirm(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('importMonth', importMonth);
      fd.append('warehouse', importWarehouse);
      fd.append('replace', importReplace ? 'true' : 'false');
      const res  = await fetch('/api/bnb/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || data.message || '匯入失敗', 'error'); return; }
      setImportResult(data);
      const msg = `匯入成功：${data.imported} 筆` +
        (data.deleted > 0 ? `，刪除舊資料 ${data.deleted} 筆` : '') +
        (data.skipped > 0 ? `，略過重複 ${data.skipped} 筆` : '');
      showToast(msg, 'success');
      setImportFile(null);
      setImportPreview(null);
      // 匯入後跳到對應月份
      setFilterMonth(importMonth);
      fetchRecords(1);
      // 寫入本次 session 歷史
      const entry = {
        importMonth,
        warehouse: importWarehouse,
        imported:  data.imported,
        deleted:   data.deleted || 0,
        skipped:   data.skipped || 0,
        replace:   importReplace,
        at:        new Date().toLocaleString('zh-TW'),
      };
      setImportHistory(prev => {
        const next = [entry, ...prev].slice(0, 10);
        try { sessionStorage.setItem('bnb_import_history', JSON.stringify(next)); } catch {}
        return next;
      });
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
    const isText = ['depositLast5', 'transferLast5', 'note', 'roomNo'].includes(field);
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
    // merge payload so inline-edited field is reflected immediately without refetch
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...payload, ...updated } : r));
  }

  // ── Excel 模式：進入 ──────────────────────────────────────────
  function enterEditMode() {
    const map = {};
    for (const r of records) {
      if (r.status === '已刪除' || r.paymentLocked) continue;
      map[r.id] = {
        payDeposit:      String(r.payDeposit   > 0 ? r.payDeposit   : ''),
        depositLast5:    r.depositLast5 || '',
        payTransfer:     String(r.payTransfer  > 0 ? r.payTransfer  : ''),
        transferDate:    r.transferDate  || '',
        transferLast5:   r.transferLast5 || '',
        payCard:         String(r.payCard      > 0 ? r.payCard      : ''),
        payCash:         String(r.payCash      > 0 ? r.payCash      : ''),
        cashDestination: r.cashDestination || '',
        payVoucher:      String(r.payVoucher   > 0 ? r.payVoucher   : ''),
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

  // ── 月底批次鎖帳（全部已填付款）────────────────────────────────
  async function lockAllFilled() {
    const eligible = records.filter(r => r.paymentFilled && !r.paymentLocked && r.status !== '已刪除');
    if (eligible.length === 0) {
      showToast('無可鎖定的記錄（已全部鎖帳或無已填付款記錄）', 'error');
      return;
    }
    const mismatchList = eligible.filter(r => {
      const pt = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
      const ct = Number(r.roomCharge) + Number(r.otherCharge);
      return Math.abs(pt - ct) > 0.01;
    });
    if (mismatchList.length > 0) {
      const names = mismatchList.slice(0, 5).map(r => r.guestName).join('、');
      const extra = mismatchList.length > 5 ? `…等 ${mismatchList.length} 筆` : '';
      if (!confirm(`以下 ${mismatchList.length} 筆收款金額與房費+消費不符：\n${names}${extra}\n\n是否仍要繼續鎖帳？`)) return;
    }
    if (!confirm(`確定要鎖定本月 ${eligible.length} 筆已填付款記錄嗎？鎖定後僅有鎖帳權限者可修改付款資料。`)) return;
    setLocking(true);
    try {
      const res = await fetch('/api/bnb/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock', ids: eligible.map(r => r.id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(d.message || '鎖帳失敗', 'error'); return; }
      showToast(`已鎖帳 ${eligible.length} 筆`, 'success');
      fetchRecords();
    } catch { showToast('鎖帳失敗', 'error'); }
    finally { setLocking(false); }
  }

  // ── 逐筆解鎖 ─────────────────────────────────────────────────
  async function handleUnlockRow(id, name) {
    if (!confirm(`確定解鎖「${name}」的付款鎖定？解鎖後可重新編輯付款資料。`)) return;
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentLocked: false }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '解鎖失敗', 'error');
      return;
    }
    showToast('已解鎖', 'success');
    fetchRecords();
  }

  // ── 刪除記錄（軟刪除：將狀態改為「已刪除」）──────────────────
  async function handleDelete(id, name) {
    if (!confirm(`確定刪除「${name}」的訂房記錄？刪除後可點擊「還原」恢復。`)) return;
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已刪除' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '刪除失敗', 'error');
      return;
    }
    showToast('已刪除（可點擊「還原」恢復）', 'success');
    fetchRecords();
  }

  // ── 還原已刪除記錄 ──────────────────────────────────────────
  async function handleRestore(id, name) {
    if (!confirm(`確定還原「${name}」的訂房記錄？`)) return;
    const res = await fetch(`/api/bnb/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '已退房' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || '還原失敗', 'error');
      return;
    }
    showToast('已還原', 'success');
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
      if (activeTab === 'analytics' && (analyticsSub === 'monthly' || analyticsSub === 'pnl')) fetchSummary();
      if (activeTab === 'analytics' && analyticsSub === 'declList') fetchDeclList();
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
    acc.transfer += Number(r.payTransfer);
    acc.card     += Number(r.payCard);
    acc.cash     += Number(r.payCash);
    acc.voucher  += Number(r.payVoucher);
    acc.cardFee  += Number(r.cardFee);
    acc.unfilled += r.paymentFilled ? 0 : 1;
    acc.locked   += r.paymentLocked ? 1 : 0;
    const pt = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
    const ct = Number(r.roomCharge) + Number(r.otherCharge);
    if (r.paymentFilled && Math.abs(pt - ct) > 0.01) acc.mismatch++;
    return acc;
  }, { rooms: 0, revenue: 0, deposit: 0, transfer: 0, card: 0, cash: 0, voucher: 0, cardFee: 0, unfilled: 0, locked: 0, mismatch: 0 });

  // ── 房號分析（依目前 records 頁面資料計算）────────────────────
  const roomStats = (() => {
    const map = {};
    for (const r of records) {
      if (r.status === '已刪除') continue;
      const key = r.roomNo || '未指定';
      if (!map[key]) map[key] = { roomNo: key, bookings: 0, revenue: 0, nights: 0 };
      map[key].bookings++;
      map[key].revenue += Number(r.roomCharge) + Number(r.otherCharge);
      map[key].nights  += Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000));
    }
    return Object.values(map).sort((a, b) => b.bookings - a.bookings);
  })();

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
                {getActiveLockContext().month} 已鎖帳
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

        {activeTab === 'analytics' && (
          <div className="flex flex-wrap gap-1 mb-6 bg-indigo-50/80 rounded-xl border border-indigo-100 p-1.5">
            {ANALYTICS_SUB_TABS.map(st => (
              <button
                key={st.key}
                type="button"
                onClick={() => setAnalyticsSub(st.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  analyticsSub === st.key ? 'bg-indigo-700 text-white shadow-sm' : 'text-indigo-900/80 hover:bg-white/80'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        )}

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
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={filterWarehouse} onChange={setFilterWarehouse} />
              </div>
              <button onClick={fetchRecords} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
              <button onClick={() => setAddBookingOpen(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
                + 新增訂房
              </button>
              <button
                onClick={() => { setShowImportPanel(v => !v); setImportResult(null); }}
                className={`px-3 py-1.5 text-sm rounded-lg border flex items-center gap-1 transition-colors font-medium ${showImportPanel ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-50 text-violet-700 border-violet-300 hover:bg-violet-100'}`}>
                ↑ 雲掌櫃匯入
              </button>
              <div className="ml-auto flex items-end gap-2">
                {canLock && !editMode && (
                  <button onClick={lockAllFilled} disabled={locking}
                    title="鎖定本月全部已填付款記錄"
                    className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1">
                    🔒 全部鎖帳
                  </button>
                )}
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

            {/* 雲掌櫃匯入面板 */}
            {showImportPanel && (
              <div className="mb-4 bg-white rounded-xl shadow-sm border border-violet-100 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800 text-sm">上傳雲掌櫃匯出檔</h3>
                  <p className="text-xs text-gray-400">支援 .xlsx / .xls / .csv　欄位：A來源 B姓名 C房費 D消費 E房間 F入住 G離店 H狀態</p>
                </div>

                {/* 設定列 */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">匯入月份</label>
                    <input type="month" value={importMonth} onChange={e => setImportMonth(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">館別</label>
                    <select value={importWarehouse} onChange={e => setImportWarehouse(e.target.value)} className={inputCls}>
                      {(warehouseList.length ? warehouseList : [importWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      選擇檔案
                      {importPreview && <span className="ml-2 text-violet-600 font-semibold">（解析到 {importPreview.totalRows} 筆）</span>}
                    </label>
                    <input type="file" accept=".xlsx,.xls,.csv"
                      onChange={e => handleFileSelect(e.target.files?.[0] || null)}
                      className="block text-sm text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-indigo-300 file:text-indigo-600 file:bg-indigo-50 hover:file:bg-indigo-100" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={importReplace} onChange={e => setImportReplace(e.target.checked)} className="rounded" />
                    取代同月舊資料
                  </label>
                  {isLocked ? (
                    <span className="text-xs text-red-500 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                      {filterMonth} 已鎖帳，無法匯入
                    </span>
                  ) : (
                    <button onClick={handleImport} disabled={importing || !importFile}
                      className="px-4 py-1.5 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium">
                      {importing ? '匯入中…' : '開始匯入'}
                    </button>
                  )}
                  {importResult && (
                    <span className="text-xs text-green-700 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      ✓ {importResult.imported} 筆
                      {importResult.deleted > 0 && `，刪除 ${importResult.deleted} 筆`}
                      {importResult.skipped > 0 && `，略過重複 ${importResult.skipped} 筆`}
                      　{importResult.importMonth}／{importResult.warehouse}
                    </span>
                  )}
                </div>

                {/* 欄位對應預覽表 */}
                {importPreview && importPreview.rows.length > 0 && (
                  <div className="border border-violet-100 rounded-lg overflow-hidden">
                    <div className="bg-violet-50 px-3 py-2 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-medium text-violet-700">
                        預覽（前 {importPreview.rows.length} 筆，共 {importPreview.totalRows} 筆）
                      </span>
                      {importPreview.detectedMonth !== importMonth && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          偵測到月份 {importPreview.detectedMonth}，已自動更新匯入月份
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                          <tr>
                            {['來源','姓名','房間','入住日','離店日','房費','狀態'].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {importPreview.rows.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5">{r.source}</td>
                              <td className="px-3 py-1.5 font-medium">{r.guestName}</td>
                              <td className="px-3 py-1.5">{r.roomNo || '—'}</td>
                              <td className="px-3 py-1.5">{r.checkInDate}</td>
                              <td className="px-3 py-1.5">{r.checkOutDate}</td>
                              <td className="px-3 py-1.5 text-right">{(r.roomCharge || 0).toLocaleString('zh-TW')}</td>
                              <td className="px-3 py-1.5">{r.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 覆蓋確認對話框 */}
                {importConfirm && (
                  <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-3">
                    <p className="text-sm text-red-800 font-medium mb-3">
                      確定覆蓋？將刪除 <strong>{importWarehouse} / {importMonth}</strong> 現有 <strong>{importConfirm.existingCount} 筆</strong> 資料，再匯入 <strong>{importPreview?.totalRows ?? '？'} 筆</strong>新資料，此操作無法還原。
                    </p>
                    <div className="flex gap-2">
                      <button onClick={doImport} disabled={importing}
                        className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                        {importing ? '匯入中…' : `確定刪除 ${importConfirm.existingCount} 筆並匯入`}
                      </button>
                      <button onClick={() => setImportConfirm(null)} className="px-4 py-1.5 text-sm border border-gray-300 bg-white rounded-lg hover:bg-gray-50">
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* 本次 session 上傳歷史 */}
                {importHistory.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400 font-medium">本次工作階段上傳記錄</span>
                      <button type="button" onClick={() => {
                        setImportHistory([]);
                        try { sessionStorage.removeItem('bnb_import_history'); } catch {}
                      }} className="text-xs text-gray-300 hover:text-red-500">清除</button>
                    </div>
                    <div className="space-y-1">
                      {importHistory.map((h, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <span className="text-gray-400">{h.at}</span>
                          <span className="font-medium text-gray-700">{h.importMonth} / {h.warehouse}</span>
                          <span className="text-green-600">匯入 {h.imported} 筆</span>
                          {h.deleted > 0 && <span className="text-red-500">刪除 {h.deleted} 筆</span>}
                          {h.skipped > 0 && <span className="text-amber-500">略過重複 {h.skipped} 筆</span>}
                          <span className="text-gray-300 ml-auto">{h.replace ? '覆蓋' : '追加'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
              {[
                { label: '筆數', val: recStats.rooms },
                { label: '房費+消費', val: NT(recStats.revenue) },
                { label: '訂金匯款', val: NT(recStats.deposit) },
                { label: '當天匯款', val: NT(recStats.transfer) },
                { label: '刷卡', val: NT(recStats.card) },
                { label: '現金', val: NT(recStats.cash) },
                { label: '住宿卷', val: NT(recStats.voucher) },
                { label: '刷卡手續費', val: NT(recStats.cardFee) },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <p className="font-bold text-gray-800 text-sm mt-0.5">{c.val}</p>
                </div>
              ))}
            </div>

            {/* 付款完成度橫幅 */}
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm">
              <span className="text-gray-500">本月共</span>
              <span className="font-semibold text-gray-800">{recStats.rooms} 筆</span>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setFilterPayment(filterPayment === 'filled' ? '' : 'filled')}
                className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'filled' ? 'bg-green-100 text-green-800 font-semibold' : 'text-green-600 hover:bg-green-50'}`}>
                已填付款 {recStats.rooms - recStats.unfilled}
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setFilterPayment(filterPayment === 'unfilled' ? '' : 'unfilled')}
                className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'unfilled' ? 'bg-amber-100 text-amber-800 font-semibold' : recStats.unfilled > 0 ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 cursor-default'}`}
                disabled={recStats.unfilled === 0}>
                未填 {recStats.unfilled} 筆
              </button>
              <span className="text-gray-300">|</span>
              <span className="text-slate-500">已鎖帳 <span className={recStats.locked === recStats.rooms && recStats.rooms > 0 ? 'text-green-600 font-semibold' : 'text-slate-700'}>{recStats.locked}</span></span>
              {recStats.mismatch > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-red-500 font-medium">金額不符 {recStats.mismatch} 筆</span>
                </>
              )}
              {filterPayment && (
                <button onClick={() => setFilterPayment('')}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                  清除篩選
                </button>
              )}
            </div>

            {/* 房號分析面板（僅有房號資料時顯示） */}
            {roomStats.length > 1 && (
              <div className="mb-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="text-xs font-semibold text-gray-500 mb-2">房號統計（本頁資料）</div>
                <div className="flex flex-wrap gap-2">
                  {roomStats.map(r => (
                    <div key={r.roomNo} className="text-xs bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-100">
                      <span className="font-medium text-gray-700">{r.roomNo}</span>
                      <span className="ml-1.5 text-indigo-500">{r.bookings}筆</span>
                      <span className="ml-1 text-teal-500">{r.nights}晚</span>
                      <span className="ml-1 text-emerald-500">NT${r.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              // 付款篩選（client-side）
              const visibleRecords  = filterPayment
                ? records.filter(r => filterPayment === 'filled' ? r.paymentFilled : !r.paymentFilled)
                : records;
              // 逾期未填判斷基準日
              const today = new Date().toISOString().split('T')[0];

              return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className={`text-xs ${editMode ? 'bg-emerald-50 text-emerald-800' : 'bg-indigo-50 text-indigo-800'}`}>
                      <th className="px-3 py-2">
                        <input type="checkbox"
                          checked={selectedIds.size > 0 && selectedIds.size === records.filter(r => r.status !== '已刪除').length}
                          onChange={toggleSelectAll}
                          className="rounded cursor-pointer" />
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">館別</th>
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
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        當天匯款{editMode && <span className="block text-[10px] font-normal opacity-60">後五碼</span>}
                      </th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">刷卡</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">手續費</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">現金</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">住宿卷</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">金流</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">狀態</th>
                      <th className="px-3 py-2 text-left font-medium whitespace-nowrap">備註</th>
                      {!editMode && <th className="px-3 py-2 text-center font-medium whitespace-nowrap">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleRecords.length === 0 && (
                      <tr><td colSpan={19} className="text-center py-10 text-gray-400">
                        {filterPayment ? `無${filterPayment === 'filled' ? '已填付款' : '未填付款'}記錄` : '無資料'}
                      </td></tr>
                    )}
                    {visibleRecords.map(r => {
                      const isSelected      = selectedIds.has(r.id);
                      const isDeleted       = r.status === '已刪除';
                      const isRowLocked     = !!r.paymentLocked;
                      const isLocked        = isRowLocked || monthLocked;
                      const inExcelMode     = editMode && !isDeleted && !isLocked;
                      const isDirty         = dirtyIds.has(r.id);
                      const isOverdueUnpaid = !isDeleted && r.status === '已退房' && !r.paymentFilled && r.checkOutDate && r.checkOutDate < today;
                      const payTotal        = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
                      const chargeTotal     = Number(r.roomCharge) + Number(r.otherCharge);
                      const paymentMismatch = !isDeleted && r.paymentFilled && Math.abs(payTotal - chargeTotal) > 0.01;

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
                            onClick={() => {
                              if (isLocked) {
                                showToast(monthLocked ? `${filterMonth} 已鎖帳，如需修改請先解鎖該月` : '此筆記錄已鎖帳，請點擊右側「解鎖」按鈕', 'error');
                                return;
                              }
                              if (!isDeleted && !editMode) { setInlineEdit({ id: r.id, field }); setInlineValue(val || ''); }
                            }}
                            className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : 'cursor-not-allowed'} ${colorCls} ${val > 0 ? '' : 'text-gray-300'}`}
                            title={isLocked ? (monthLocked ? `${filterMonth} 已鎖帳` : '此筆已鎖帳') : editMode ? '' : '點擊編輯'}>
                            {val > 0 ? Math.round(val).toLocaleString() : '—'}
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

                      // ── 備註 inline edit ─────────────────────────
                      const noteCell = () => {
                        const isEditing = !editMode && inlineEdit?.id === r.id && inlineEdit?.field === 'note';
                        if (isEditing) return (
                          <input autoFocus type="text" value={inlineValue}
                            onChange={e => setInlineValue(e.target.value)}
                            onBlur={() => handleInlineSave(r.id, 'note', inlineValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleInlineSave(r.id, 'note', inlineValue);
                              if (e.key === 'Escape') setInlineEdit(null);
                            }}
                            className="w-28 border border-indigo-400 rounded px-1 py-0.5 text-xs outline-none ring-1 ring-indigo-400"
                          />
                        );
                        return (
                          <span
                            onClick={() => { if (!isDeleted && !editMode) { setInlineEdit({ id: r.id, field: 'note' }); setInlineValue(r.note || ''); } }}
                            className={`block max-w-[112px] truncate text-xs ${r.note ? 'text-gray-500 cursor-pointer hover:text-indigo-600' : 'text-gray-200 cursor-pointer'}`}
                            title={r.note || '點擊新增備註'}>
                            {r.note || '—'}
                          </span>
                        );
                      };

                      const isPaymentComplete = !isDeleted && !isLocked && r.paymentFilled && !paymentMismatch;

                      return (
                        <tr key={r.id} className={`
                          ${isSelected ? 'bg-amber-50' : isLocked ? 'bg-slate-50' : paymentMismatch ? 'bg-orange-50' : isOverdueUnpaid ? 'bg-red-50' : isPaymentComplete ? 'bg-gray-100 text-gray-400' : 'hover:bg-gray-50'}
                          ${isDeleted ? 'opacity-40' : ''}
                          ${editMode && isDirty ? 'ring-1 ring-inset ring-emerald-200' : ''}
                        `}>
                          <td className="px-3 py-2">
                            {!isDeleted && (
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)}
                                className="rounded cursor-pointer" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{r.warehouse}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[r.source] || SOURCE_COLORS['其他']}`}>{r.source}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[140px] truncate">{r.guestName}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{r.roomNo || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                            {r.checkInDate}
                            {r.checkOutDate && r.checkOutDate.substring(0, 7) !== r.importMonth && (
                              <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium"
                                title={`退房日 ${r.checkOutDate} 與入住月 ${r.importMonth} 不同月份；此訂單收入整筆計入入住月`}>跨月</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkOutDate}</td>
                          <td className={`px-3 py-2 text-right ${paymentMismatch ? 'text-red-600' : ''}`}>
                            {Math.round(Number(r.roomCharge)).toLocaleString()}
                            {paymentMismatch && (
                              <div className="text-[10px] text-red-500 whitespace-nowrap" title={`收款合計 ${Math.round(payTotal).toLocaleString()} ≠ 房費+消費 ${Math.round(chargeTotal).toLocaleString()}`}>
                                差 {(payTotal - chargeTotal) > 0 ? '+' : ''}{Math.round(payTotal - chargeTotal).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherCharge) > 0 ? Math.round(Number(r.otherCharge)).toLocaleString() : '—'}</td>

                          {/* 訂金 + 後五碼（點擊開啟付款 Modal 以填寫日期+後五碼） */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payDeposit', 'border-blue-300 focus:ring-blue-300')}
                                <input
                                  id={`pc-${r.id}-depositDate`}
                                  type="date"
                                  value={editMap[r.id]?.depositDate ?? (r.depositDate || '')}
                                  onChange={e => updateCell(r.id, 'depositDate', e.target.value)}
                                  onKeyDown={e => handlePayKeyDown(e, r.id, 'depositDate', editableRecords)}
                                  className={`w-32 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 border-blue-200 focus:ring-blue-300 ${(editMap[r.id]?.depositDate !== undefined) ? 'bg-yellow-50' : 'bg-white'} text-blue-500`}
                                />
                                {excelTextInput('depositLast5')}
                              </div>
                            ) : (() => {
                              const depVal = Math.round(Number(r.payDeposit));
                              return (
                                <div>
                                  <span
                                    onClick={() => {
                                      if (isLocked) { showToast(monthLocked ? `${filterMonth} 已鎖帳，如需修改請先解鎖該月` : '此筆記錄已鎖帳，請點擊右側「解鎖」按鈕', 'error'); return; }
                                      if (!isDeleted && !editMode) setEditRecord(r);
                                    }}
                                    className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : 'cursor-not-allowed'} text-blue-600 ${depVal > 0 ? '' : 'text-gray-300'}`}
                                    title={isLocked ? (monthLocked ? `${filterMonth} 已鎖帳` : '此筆已鎖帳') : editMode ? '' : '點擊開啟付款明細'}>
                                    {depVal > 0 ? depVal.toLocaleString() : '—'}
                                  </span>
                                  {r.depositLast5 && <div className="text-[10px] text-blue-300 font-mono">{r.depositLast5}</div>}
                                  {r.depositDate && <div className="text-[10px] text-blue-300">{r.depositDate}</div>}
                                </div>
                              );
                            })()}
                          </td>

                          {/* 當天匯款 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payTransfer', 'border-teal-300 focus:ring-teal-300')}
                                <input
                                  id={`pc-${r.id}-transferDate`}
                                  type="date"
                                  value={editMap[r.id]?.transferDate ?? (r.transferDate || '')}
                                  onChange={e => updateCell(r.id, 'transferDate', e.target.value)}
                                  onKeyDown={e => handlePayKeyDown(e, r.id, 'transferDate', editableRecords)}
                                  className={`w-32 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 border-teal-200 focus:ring-teal-300 ${(editMap[r.id]?.transferDate !== undefined) ? 'bg-yellow-50' : 'bg-white'} text-teal-500`}
                                />
                                <input
                                  id={`pc-${r.id}-transferLast5`}
                                  type="text" maxLength={5}
                                  value={editMap[r.id]?.transferLast5 ?? (r.transferLast5 || '')}
                                  onChange={e => updateCell(r.id, 'transferLast5', e.target.value)}
                                  onKeyDown={e => handlePayKeyDown(e, r.id, 'transferLast5', editableRecords)}
                                  placeholder="後五碼"
                                  className={`w-16 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-teal-300 border-teal-200 ${isDirty ? 'bg-yellow-50' : 'bg-white'} text-teal-500 font-mono`}
                                />
                              </div>
                            ) : (() => {
                              const trnVal = Math.round(Number(r.payTransfer));
                              return (
                                <div>
                                  <span
                                    onClick={() => {
                                      if (isLocked) { showToast(monthLocked ? `${filterMonth} 已鎖帳，如需修改請先解鎖該月` : '此筆記錄已鎖帳，請點擊右側「解鎖」按鈕', 'error'); return; }
                                      if (!isDeleted && !editMode) setEditRecord(r);
                                    }}
                                    className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : 'cursor-not-allowed'} text-teal-600 ${trnVal > 0 ? '' : 'text-gray-300'}`}
                                    title={isLocked ? (monthLocked ? `${filterMonth} 已鎖帳` : '此筆已鎖帳') : editMode ? '' : '點擊開啟付款明細'}>
                                    {trnVal > 0 ? trnVal.toLocaleString() : '—'}
                                  </span>
                                  {r.transferLast5 && <div className="text-[10px] text-teal-300 font-mono">{r.transferLast5}</div>}
                                  {r.transferDate && <div className="text-[10px] text-teal-300">{r.transferDate}</div>}
                                </div>
                              );
                            })()}
                          </td>

                          {/* 刷卡 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payCard', 'border-purple-300 focus:ring-purple-300') : editCell('payCard', 'text-purple-600')}
                          </td>

                          {/* 手續費（唯讀） */}
                          <td className="px-3 py-2 text-right text-red-400 text-xs">
                            {Number(r.cardFee) > 0 ? Math.round(Number(r.cardFee)).toLocaleString() : '—'}
                          </td>

                          {/* 現金 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? (
                              <div className="flex flex-col gap-0.5 items-end">
                                {excelInput('payCash', 'border-green-300 focus:ring-green-300')}
                                <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none"
                                  title="勾選表示此現金由老闆直接收取">
                                  <input type="checkbox"
                                    checked={(editMap[r.id]?.cashDestination ?? r.cashDestination) === '老闆收取'}
                                    onChange={e => updateCell(r.id, 'cashDestination', e.target.checked ? '老闆收取' : '')}
                                    className="w-3 h-3 accent-orange-500 cursor-pointer" />
                                  <span className={(editMap[r.id]?.cashDestination ?? r.cashDestination) === '老闆收取' ? 'text-orange-600 font-medium' : 'text-gray-400'}>老闆收現</span>
                                </label>
                              </div>
                            ) : editCell('payCash', 'text-green-600')}
                          </td>

                          {/* 住宿卷 */}
                          <td className="px-3 py-1.5 text-right">
                            {inExcelMode ? excelInput('payVoucher', 'border-amber-300 focus:ring-amber-300') : editCell('payVoucher', 'text-amber-600')}
                          </td>

                          {/* 金流狀態 */}
                          <td className="px-3 py-1.5">
                            <div className="flex flex-col gap-0.5 text-[10px] leading-tight">
                              {/* 訂金 */}
                              {r.depositCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.depositMatched ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-400'}`}
                                  title={r.depositMatched ? '訂金已對帳' : '訂金已記帳，待對帳'}>
                                  匯{r.depositMatched ? '✓' : '…'}
                                </span>
                              ) : Number(r.payDeposit) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="訂金尚未填入匯款日期">匯?</span>
                              ) : null}
                              {/* 當天匯款 */}
                              {r.transferCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.transferMatched ? 'bg-teal-100 text-teal-700' : 'bg-teal-50 text-teal-400'}`}
                                  title={r.transferMatched ? '當天匯款已對帳' : '當天匯款已記帳，待對帳'}>
                                  轉{r.transferMatched ? '✓' : '…'}
                                </span>
                              ) : Number(r.payTransfer) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="當天匯款尚未填入匯款日期">轉?</span>
                              ) : null}
                              {/* 刷卡 */}
                              {r.cardCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.cardMatched ? 'bg-purple-100 text-purple-700' : 'bg-purple-50 text-purple-400'}`}
                                  title={r.cardMatched ? `刷卡已對帳 (${r.cardSettlementDate || ''})` : `刷卡已記帳，入帳日 ${r.cardSettlementDate || '未填'}`}>
                                  卡{r.cardMatched ? '✓' : r.cardSettlementDate ? `${r.cardSettlementDate.slice(5)}` : '…'}
                                </span>
                              ) : Number(r.payCard) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="刷卡尚未填入入帳日">卡?</span>
                              ) : null}
                              {/* 現金 */}
                              {r.cashCashTxId ? (
                                <span className={`px-1 py-0.5 rounded ${r.cashMatched ? 'bg-green-100 text-green-700' : 'bg-green-50 text-green-400'}`}
                                  title={r.cashMatched ? '現金存帳已對帳' : '現金存帳已記帳，待對帳'}>
                                  存{r.cashMatched ? '✓' : '…'}
                                </span>
                              ) : r.cashDestination === '老闆收取' && Number(r.payCash) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-orange-50 text-orange-500" title="老闆收取">老闆</span>
                              ) : Number(r.payCash) > 0 ? (
                                <span className="px-1 py-0.5 rounded bg-gray-50 text-gray-300" title="現金尚未設定去向">現?</span>
                              ) : null}
                            </div>
                          </td>

                          {/* 狀態 + 鎖帳標示 */}
                          <td className="px-3 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(r.status)}`}>{r.status || '—'}</span>
                            {isRowLocked && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-600 font-medium" title={r.paymentLockedBy ? `鎖帳人：${r.paymentLockedBy}` : '此筆已鎖帳'}>已鎖帳</span>}
                            {!isRowLocked && monthLocked && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 font-medium" title={`${filterMonth} 整月已鎖帳`}>月鎖</span>}
                            {!r.paymentFilled && !isDeleted && !isLocked && (
                              <span className="ml-1 text-[10px] text-amber-500">未填</span>
                            )}
                            {paymentMismatch && (
                              <span className="ml-1 text-[10px] text-red-500" title={`收款 ${Math.round(payTotal).toLocaleString()} ≠ 費用 ${Math.round(chargeTotal).toLocaleString()}`}>金額不符</span>
                            )}
                          </td>

                          {/* 備註（點擊 inline 編輯） */}
                          <td className="px-3 py-2">{noteCell()}</td>

                          {/* 操作欄（非 Excel 模式才顯示） */}
                          {!editMode && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              {isDeleted ? (
                                <button onClick={() => handleRestore(r.id, r.guestName)}
                                  title="還原此筆訂房記錄"
                                  className="text-xs px-2 py-1 rounded border border-green-300 text-green-600 hover:bg-green-50">
                                  還原
                                </button>
                              ) : isLocked ? (
                                <button onClick={() => handleUnlockRow(r.id, r.guestName)}
                                  title="解除此筆付款鎖定"
                                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-600 hover:bg-amber-50">
                                  🔓 解鎖
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => setEditBooking(r)}
                                    title="編輯訂房資料"
                                    className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 mr-1">
                                    編輯
                                  </button>
                                  <button onClick={() => setEditRecord(r)}
                                    title="編輯付款明細"
                                    className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 mr-1">
                                    付款
                                  </button>
                                  <button onClick={() => handleDelete(r.id, r.guestName)}
                                    title="刪除此筆訂房（可還原）"
                                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50">
                                    刪除
                                  </button>
                                </>
                              )}
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
            {/* 分頁控制 */}
            {recTotal > REC_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-3 px-1">
                <span className="text-xs text-gray-400">
                  顯示第 {(recPage - 1) * REC_PAGE_SIZE + 1}–{Math.min(recPage * REC_PAGE_SIZE, recTotal)} 筆，共 {recTotal} 筆
                </span>
                <div className="flex gap-1">
                  <button onClick={() => fetchRecords(recPage - 1)} disabled={recPage <= 1}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    ← 上一頁
                  </button>
                  <button onClick={() => fetchRecords(recPage + 1)} disabled={recPage * REC_PAGE_SIZE >= recTotal}
                    className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                    下一頁 →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 每日收入 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'dailyRev' && (
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
                  {(warehouseList.length ? warehouseList : [drWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={drWarehouse} onChange={setDrWarehouse} />
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
                        { header: '當天匯款', key: 'payTransfer', format: 'number' },
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
                        const cols = ['日期','筆數','房費','消費','營收','訂金','當天匯款','刷卡','現金','住宿卷','手續費'];
                        const rows = (drData?.days || []).filter(d => d.count > 0).map(d => [
                          `${d.day}日`,
                          d.count,
                          d.roomCharge.toLocaleString(),
                          d.otherCharge > 0 ? d.otherCharge.toLocaleString() : '',
                          (d.roomCharge + d.otherCharge).toLocaleString(),
                          d.payDeposit  > 0 ? d.payDeposit.toLocaleString()  : '',
                          d.payTransfer > 0 ? d.payTransfer.toLocaleString() : '',
                          d.payCard     > 0 ? d.payCard.toLocaleString()     : '',
                          d.payCash     > 0 ? d.payCash.toLocaleString()     : '',
                          d.payVoucher  > 0 ? d.payVoucher.toLocaleString()  : '',
                          d.cardFee     > 0 ? d.cardFee.toLocaleString()     : '',
                        ]);
                        const t = drData.totals;
                        rows.push(['合計', t.count,
                          t.roomCharge.toLocaleString(), t.otherCharge.toLocaleString(),
                          (t.roomCharge + t.otherCharge).toLocaleString(),
                          t.payDeposit.toLocaleString(), t.payTransfer.toLocaleString(), t.payCard.toLocaleString(),
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
                  { label: '訂金',     val: NT(drData.totals.payDeposit),  color: 'text-blue-600' },
                  { label: '當天匯款', val: NT(drData.totals.payTransfer), color: 'text-teal-600' },
                  { label: '刷卡',     val: NT(drData.totals.payCard),     color: 'text-purple-600' },
                  { label: '現金',     val: NT(drData.totals.payCash),     color: 'text-green-600' },
                  { label: '手續費',   val: NT(drData.totals.cardFee),     color: 'text-red-400' },
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['日期','筆數','房費','消費','營收合計','訂金','當天匯款','刷卡','現金','住宿卷','手續費',''].map(h => (
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
                            <td className="px-3 py-2 text-right text-teal-600">{d.payTransfer > 0 ? d.payTransfer.toLocaleString() : '—'}</td>
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
                              <td colSpan={8}></td>
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
                          <td className="px-3 py-2.5 text-right">{Math.round(t.roomCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.roomCharge + t.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payDeposit).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payTransfer).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payCard).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payCash).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">{Math.round(t.payVoucher).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right">({Math.round(t.cardFee).toLocaleString()})</td>
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
        {activeTab === 'analytics' && analyticsSub === 'monthly' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-600">年份</label>
              <select value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <label className="text-sm text-gray-600">館別</label>
              <select value={summaryWarehouse} onChange={e => setSummaryWarehouse(e.target.value)} className={inputCls}>
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns value={summaryWarehouse} onChange={setSummaryWarehouse} />
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

            <p className="text-xs text-gray-400 mb-3">
              ※ 依「入住月份」分組；跨月入住（如月底入住隔月退房）整筆計入入住當月，退房月不另計。訂房明細中標有
              <span className="mx-1 px-1 py-0.5 rounded bg-orange-100 text-orange-600 text-[10px] font-medium">跨月</span>
              的訂單即為此情況。
            </p>
            {summaryLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','間數','住宿房費','其他消費','訂金匯款','當天匯款','刷卡','現金','住宿卷','手續費','淨收入','鎖帳'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={12} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => {
                      const lockRatio = r.rooms > 0 ? (r.lockedCount || 0) / r.rooms : 0;
                      const lockColor = lockRatio === 1 ? 'text-green-600 font-semibold' : lockRatio > 0 ? 'text-amber-600' : 'text-gray-300';
                      return (
                      <tr key={r.month} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.month}</td>
                        <td className="px-3 py-2 text-right">{r.rooms}</td>
                        <td className="px-3 py-2 text-right">{Math.round(r.totalRevenue).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{Math.round(r.otherCharge).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{Math.round(r.payDeposit).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-teal-600">{Math.round(r.payTransfer).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-purple-600">{Math.round(r.payCard).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-green-600">{Math.round(r.payCash).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{Math.round(r.payVoucher).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-red-400">({Math.round(r.cardFee).toLocaleString()})</td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-700">{Math.round(r.netRevenue).toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right text-xs ${lockColor}`} title={`${r.lockedCount || 0}/${r.rooms} 筆已鎖帳`}>
                          {r.lockedCount || 0}/{r.rooms}
                        </td>
                      </tr>
                    );})}
                    {summaryRows.length > 0 && (() => {
                      const tot = summaryRows.reduce((a, r) => ({
                        rooms: a.rooms + r.rooms,
                        totalRevenue: a.totalRevenue + r.totalRevenue,
                        otherCharge: a.otherCharge + r.otherCharge,
                        payDeposit: a.payDeposit + r.payDeposit,
                        payTransfer: a.payTransfer + (r.payTransfer || 0),
                        payCard: a.payCard + r.payCard,
                        payCash: a.payCash + r.payCash,
                        payVoucher: a.payVoucher + r.payVoucher,
                        cardFee: a.cardFee + r.cardFee,
                        netRevenue: a.netRevenue + r.netRevenue,
                      }), { rooms:0, totalRevenue:0, otherCharge:0, payDeposit:0, payTransfer:0, payCard:0, payCash:0, payVoucher:0, cardFee:0, netRevenue:0 });
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800">
                          <td className="px-3 py-2">總計</td>
                          <td className="px-3 py-2 text-right">{tot.rooms}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.totalRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.otherCharge).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payDeposit).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payTransfer).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payCard).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payCash).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.payVoucher).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">({Math.round(tot.cardFee).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-xs">
                            {summaryRows.reduce((s, r) => s + (r.lockedCount || 0), 0)}/{tot.rooms}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 損益表（月報 / 年報）══ */}
        {activeTab === 'analytics' && analyticsSub === 'pnl' && (
          <div>
            {/* 控制列 */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* 月報/年報 切換 */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                {[['monthly','月報'],['annual','年報']].map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setSummaryMode(v)}
                    className={`px-4 py-1.5 ${summaryMode === v ? 'bg-indigo-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >{label}</button>
                ))}
              </div>
              {summaryMode === 'monthly' && (
                <>
                  <label className="text-sm text-gray-600">年份</label>
                  <select value={summaryYear} onChange={e => setSummaryYear(e.target.value)} className={inputCls}>
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </>
              )}
              <label className="text-sm text-gray-600">館別</label>
              <select value={summaryWarehouse} onChange={e => setSummaryWarehouse(e.target.value)} className={inputCls}>
                <option value="">全部</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns value={summaryWarehouse} onChange={setSummaryWarehouse} />
              <button onClick={fetchSummary} className={`${btnCls} bg-indigo-50 text-indigo-700`}>重新整理</button>
              <div className="ml-auto flex gap-2">
                {(() => {
                  const pnlData = summaryRows.map(r => ({
                    ...r,
                    month: summaryMode === 'annual' ? r.year : r.month,
                    incomeTotal:  r.netRevenue + (r.otherIncome || 0),
                    pnlNetProfit: r.netProfit,
                  }));
                  const title = summaryMode === 'annual'
                    ? `損益年報_${summaryWarehouse || '全館'}`
                    : `損益月報_${summaryYear}${summaryWarehouse ? '_' + summaryWarehouse : ''}`;
                  return (
                    <>
                      <ExportButtons
                        data={pnlData}
                        columns={PNL_EXPORT_COLS}
                        filename={title}
                        title={title}
                      />
                      <button
                        onClick={() => openPrintWindow(
                          title,
                          PNL_EXPORT_COLS.map(c => c.header),
                          pnlData.map(r => PNL_EXPORT_COLS.map(c => r[c.key] ?? ''))
                        )}
                        className={`${btnCls} text-gray-600`}
                      >列印</button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 月報：固定費用提示 */}
            {summaryMode === 'monthly' && !summaryLoading && summaryFixedHelp && (
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-600">
                  <span>此表固定費用來自費用管理之共通費用（僅計入<strong>已確認</strong>）。</span>
                  <Link href="/expenses" className="text-indigo-600 hover:underline font-medium whitespace-nowrap">
                    前往費用管理
                  </Link>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 space-y-0.5">
                  <div><span className="font-medium text-gray-700">採購支出</span>：依進貨單的<strong>進貨日期</strong>歸月，僅計入狀態為「已入庫」或「已完成」的進貨單。</div>
                  <div><span className="font-medium text-gray-700">固定費用</span>：依共通費用記錄的<strong>費用月份</strong>歸月，僅計入狀態為「已確認」、類型為固定費用（非進貨單連結）的記錄。</div>
                </div>
                {(summaryFixedHelp.pendingFixedCount ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    {summaryYear} 年度尚有 <strong>{summaryFixedHelp.pendingFixedCount}</strong> 筆共通費用紀錄未確認，不會計入上表固定費用；請至費用管理處理。
                  </div>
                )}
                {(summaryFixedHelp.monthsWithZeroFixed?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
                    以下月份有訂房或房費收入，但固定費用為 NT$0，請確認該月是否已建立並確認共通費用：
                    <span className="ml-1 font-mono text-xs sm:text-sm">
                      {summaryFixedHelp.monthsWithZeroFixed.join('、')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {summaryLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {[summaryMode === 'annual' ? '年份' : '月份','住宿淨收入','其他收入','收入合計','採購支出','固定費用','支出合計','淨利'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => {
                      const key = summaryMode === 'annual' ? r.year : r.month;
                      const incomeTotal = r.netRevenue + (r.otherIncome || 0);
                      const zeroFixedHint =
                        summaryMode === 'monthly' && (summaryFixedHelp?.monthsWithZeroFixed?.includes(r.month) ?? false);
                      const fixedExpenseLink = summaryMode === 'monthly'
                        ? `/expenses?month=${r.month}&subTab=records${summaryWarehouse ? `&warehouse=${encodeURIComponent(summaryWarehouse)}` : ''}`
                        : null;
                      const purchaseLink = summaryMode === 'monthly'
                        ? `/purchasing?startDate=${r.month}-01&endDate=${r.month}-31${summaryWarehouse ? `&warehouse=${encodeURIComponent(summaryWarehouse)}` : ''}`
                        : null;
                      return (
                        <tr
                          key={key}
                          className={`hover:bg-gray-50 ${zeroFixedHint ? 'bg-amber-50/60' : ''}`}
                        >
                          <td className="px-3 py-2 font-medium">{key}</td>
                          <td className="px-3 py-2 text-right text-indigo-700">{Math.round(r.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{Math.round(r.otherIncome || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold">{Math.round(incomeTotal).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-red-500">
                            {purchaseLink ? (
                              <a href={purchaseLink} target="_blank" rel="noopener" className="hover:underline hover:text-red-600">
                                ({Math.round(r.purchaseExpense).toLocaleString()})
                              </a>
                            ) : (
                              <span>({Math.round(r.purchaseExpense).toLocaleString()})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-red-400">
                            {fixedExpenseLink ? (
                              <a href={fixedExpenseLink} target="_blank" rel="noopener" className="hover:underline hover:text-red-600">
                                ({Math.round(r.fixedExpense).toLocaleString()})
                              </a>
                            ) : (
                              <span>({Math.round(r.fixedExpense).toLocaleString()})</span>
                            )}
                            {zeroFixedHint && (
                              <span className="block text-[10px] leading-tight text-amber-800 font-normal mt-0.5">可能未登記或未確認</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-red-600">({Math.round(r.totalExpense).toLocaleString()})</td>
                          <td className={`px-3 py-2 text-right font-bold ${r.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {Math.round(r.netProfit).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 合計列（月報模式才顯示，年報各年已是年度合計） */}
                    {summaryMode === 'monthly' && summaryRows.length > 0 && (() => {
                      const tot = summaryRows.reduce((a, r) => ({
                        netRevenue:      (a.netRevenue      || 0) + r.netRevenue,
                        otherIncome:     (a.otherIncome     || 0) + (r.otherIncome || 0),
                        purchaseExpense: (a.purchaseExpense || 0) + r.purchaseExpense,
                        fixedExpense:    (a.fixedExpense    || 0) + r.fixedExpense,
                        totalExpense:    (a.totalExpense    || 0) + r.totalExpense,
                        netProfit:       (a.netProfit       || 0) + r.netProfit,
                      }), {});
                      const incomeTotal = tot.netRevenue + tot.otherIncome;
                      return (
                        <tr className="bg-indigo-50 font-bold text-indigo-800 text-xs border-t-2 border-indigo-200">
                          <td className="px-3 py-2">全年合計</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.netRevenue).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(tot.otherIncome).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.round(incomeTotal).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-red-600">({Math.round(tot.purchaseExpense).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right text-red-500">({Math.round(tot.fixedExpense).toLocaleString()})</td>
                          <td className="px-3 py-2 text-right text-red-700">({Math.round(tot.totalExpense).toLocaleString()})</td>
                          <td className={`px-3 py-2 text-right ${tot.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {Math.round(tot.netProfit).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })()}
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
                  {(warehouseList.length ? warehouseList : [declWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={declWarehouse} onChange={setDeclWarehouse} />
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
                          ['每月間數（筆數）', declActual.roomCount,                  'text-gray-800'],
                          ['住宿間數（晚）',   declActual.roomNights,                 'text-teal-700'],
                          ['訂金匯款',        Math.round(declActual.payDeposit),     'text-blue-500'],
                          ['當天匯款',        Math.round(declActual.payTransfer),    'text-teal-600'],
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
        {activeTab === 'analytics' && analyticsSub === 'declList' && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-600">年份</label>
              <select value={dlYear} onChange={e => setDlYear(e.target.value)} className={inputCls}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <label className="text-sm text-gray-600">館別</label>
              <select value={dlWarehouse} onChange={e => setDlWarehouse(e.target.value)} className={inputCls}>
                {(warehouseList.length ? warehouseList : [dlWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns value={dlWarehouse} onChange={setDlWarehouse} />
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
                  { header: '其他收入',    key: 'otherIncome',      format: 'number' },
                  { header: '收入說明',    key: 'otherIncomeNote' },
                  { header: '備註',       key: 'note' },
                ]}
                filename={`旅宿網申報_${dlYear}`}
                title={`旅宿網申報 ${dlYear}（${dlWarehouse}）`}
              />
              <button
                onClick={() => {
                  const cols = ['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%','其他收入','收入說明','備註'];
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
                    r.otherIncome ? Number(r.otherIncome).toLocaleString() : '',
                    r.otherIncomeNote || '',
                    r.note || '',
                  ]);
                  openPrintWindow(`旅宿網申報 ${dlYear}年（${dlWarehouse}）`, cols, rows);
                }}
                className={`${btnCls} text-gray-600`}
              >列印</button>
            </div>

            {dlLoading ? (
              <div className="text-center py-16 text-gray-400">載入中…</div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      {['月份','刷卡總計','房價金額','補助間數','平均房價','每月間數','客房備品','餐飲支出','住客FIT','員工','薪資','業務來源%','其他收入','備註'].map(h => (
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
                        <td className="px-3 py-2.5 text-right text-gray-600">{r.otherIncome ? Number(r.otherIncome).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2.5 text-left text-gray-400 text-xs max-w-[120px] truncate" title={[r.otherIncomeNote, r.note].filter(Boolean).join(' / ')}>{r.note || r.otherIncomeNote || '—'}</td>
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
                        otherIncome:     a.otherIncome     + (Number(r.otherIncome) || 0),
                      }), { cardTotal:0, roomPriceTotal:0, subsidizedRooms:0, monthlyRoomCount:0, roomSuppliesCost:0, fbExpense:0, fitGuestCount:0, salary:0, otherIncome:0 });
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
                          <td className="px-3 py-2.5 text-right">{tot.otherIncome ? tot.otherIncome.toLocaleString() : ''}</td>
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
              .filter(r => r.bankLineId)
              .map(r => [r.bankLineId, r.guestName])
          );
          const summary    = dmData?.summary;
          const bnbRecords = dmData?.bnbRecords || [];
          const bankLines  = dmData?.bankLines  || [];
          const allSummary = dmData?.summary;  // for paymentType=all view

          const PAY_TYPE_TABS = [
            { key: 'payment', label: '收款明細' },
            { key: 'ledger',  label: '流水帳' },
            { key: 'all',     label: '整體進度' },
          ];
          const PAY_SUB_TYPES = [
            { key: 'combined', label: '全部' },
            { key: 'deposit',  label: '訂金匯款' },
            { key: 'transfer', label: '當天匯款' },
            { key: 'card',     label: '刷卡' },
            { key: 'cash',     label: '現金存款' },
          ];
          const activeOuterTab = dmPayType === 'all' ? 'all' : dmPayType === 'ledger' ? 'ledger' : 'payment';

          return (
            <div>
              {/* 付款類型切換 */}
              <div className="flex gap-1 mb-4 overflow-x-auto">
                {PAY_TYPE_TABS.map(t => (
                  <button key={t.key}
                    onClick={() => {
                      if (t.key === 'all') { setDmPayType('all'); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }
                      else if (t.key === 'ledger') { setDmPayType('ledger'); }
                      else if (dmPayType === 'all' || dmPayType === 'ledger') { setDmPayType('deposit'); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }
                    }}
                    className={`px-4 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
                      activeOuterTab === t.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-indigo-50'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 篩選列 */}
              {activeOuterTab !== 'ledger' && <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">月份</label>
                  <input type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)} className={inputCls} />
                </div>
                {dmPayType !== 'all' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">分類</label>
                    <select value={dmPayType} onChange={e => { setDmPayType(e.target.value); setDmData(null); setDmSelBnb(null); setDmSelLine(null); }} className={inputCls}>
                      {PAY_SUB_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">館別</label>
                  <select value={dmWarehouse} onChange={e => setDmWarehouse(e.target.value)} className={inputCls}>
                    <option value="">全部</option>
                    {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <WhQuickBtns value={dmWarehouse} onChange={setDmWarehouse} />
                </div>
                {dmPayType !== 'all' && dmPayType !== 'combined' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">存簿帳戶</label>
                    <select value={dmAccountId} onChange={e => setDmAccountId(e.target.value)} className={inputCls}>
                      <option value="">請選擇帳戶</option>
                      {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                <button onClick={fetchDepositMatch} disabled={dmLoading || (dmPayType !== 'all' && dmPayType !== 'combined' && !dmAccountId)}
                  className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                  {dmLoading ? '載入中…' : '查詢'}
                </button>
                <button
                  type="button"
                  onClick={() => { setBankImportLines([]); setBankImportError(''); setShowBankImport(true); }}
                  className="px-4 py-1.5 text-sm rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
                  ↑ 匯入銀行對帳單
                </button>
                {dmData && dmPayType !== 'all' && (
                  <>
                    <button onClick={handleAutoMatch} disabled={dmMatching || !(dmData?.suggestions?.length) || isLocked}
                      className={`${btnCls} bg-amber-50 text-amber-700 disabled:opacity-40`}>
                      ⚡ 自動配對{dmData?.suggestions?.length ? `（${dmData.suggestions.length}筆）` : ''}
                    </button>
                    <ExportButtons
                      data={(dmData?.bnbRecords || []).map(r => ({
                        guestName:   r.guestName,
                        checkInDate: r.checkInDate,
                        checkOutDate:r.checkOutDate,
                        payAmount:   r.payAmount,
                        payDate:     r.payDate,
                        last5:       r.last5,
                        matchStatus: r.bankLineId ? '已配對' : '未配對',
                        matchedBy:   r.matchedBy || '',
                      }))}
                      columns={[
                        { header: '姓名',    key: 'guestName' },
                        { header: '入住',    key: 'checkInDate' },
                        { header: '退房',    key: 'checkOutDate' },
                        { header: '金額',    key: 'payAmount',  format: 'number' },
                        { header: '付款日期', key: 'payDate' },
                        { header: '後五碼',  key: 'last5' },
                        { header: '配對狀態', key: 'matchStatus' },
                        { header: '配對者',  key: 'matchedBy' },
                      ]}
                      filename={`核對_${dmPayType}_${dmMonth}`}
                      title={`${PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''} 核對 ${dmMonth}`}
                    />
                  </>
                )}
              </div>}

              {/* 流水帳 */}
              {activeOuterTab === 'ledger' && (
                <div>
                  {/* 流水帳篩選列 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">月份起</label>
                      <input type="month" value={ledgerMonthFrom} onChange={e => setLedgerMonthFrom(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">月份迄</label>
                      <input type="month" value={ledgerMonthTo} onChange={e => setLedgerMonthTo(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">館別</label>
                      <select value={ledgerWarehouse} onChange={e => setLedgerWarehouse(e.target.value)} className={inputCls}>
                        <option value="">全部</option>
                        {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <WhQuickBtns value={ledgerWarehouse} onChange={setLedgerWarehouse} />
                    </div>
                    <button onClick={fetchLedger} disabled={ledgerLoading}
                      className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                      {ledgerLoading ? '載入中…' : '查詢'}
                    </button>
                    {ledgerRows.length > 0 && (() => {
                      const sumRoom    = ledgerRows.reduce((s, r) => s + Number(r.roomCharge  || 0), 0);
                      const sumOther   = ledgerRows.reduce((s, r) => s + Number(r.otherCharge || 0), 0);
                      const sumDeposit = ledgerRows.reduce((s, r) => s + Number(r.payDeposit  || 0), 0);
                      const sumXfer    = ledgerRows.reduce((s, r) => s + Number(r.payTransfer || 0), 0);
                      const sumCard    = ledgerRows.reduce((s, r) => s + Number(r.payCard     || 0), 0);
                      const sumCash    = ledgerRows.reduce((s, r) => s + Number(r.payCash     || 0), 0);
                      const sumVoucher = ledgerRows.reduce((s, r) => s + Number(r.payVoucher  || 0), 0);
                      const sumFee     = ledgerRows.reduce((s, r) => s + Number(r.cardFee     || 0), 0);
                      const net = sumDeposit + sumXfer + sumCard + sumCash + sumVoucher - sumFee;
                      return (
                        <div className="flex flex-wrap gap-2 items-center ml-2 text-xs">
                          <span className="text-gray-400">{ledgerRows.length} 筆</span>
                          <span className="text-gray-500">房費 <b className="text-indigo-700">{NT(sumRoom)}</b></span>
                          <span className="text-gray-500">訂金 <b>{NT(sumDeposit)}</b></span>
                          <span className="text-gray-500">匯款 <b>{NT(sumXfer)}</b></span>
                          <span className="text-gray-500">刷卡 <b>{NT(sumCard)}</b></span>
                          <span className="text-gray-500">現金 <b>{NT(sumCash)}</b></span>
                          <span className="text-gray-500">住宿券 <b>{NT(sumVoucher)}</b></span>
                          <span className="text-gray-500">手續費 <b className="text-red-500">-{NT(sumFee)}</b></span>
                          <span className="text-gray-700 font-semibold">淨收入 <b className="text-green-700">{NT(net)}</b></span>
                        </div>
                      );
                    })()}
                    {ledgerRows.length > 0 && (
                      <ExportButtons
                        data={ledgerRows.map(r => ({
                          importMonth:  r.importMonth,
                          warehouse:    r.warehouse,
                          source:       r.source,
                          guestName:    r.guestName,
                          roomNo:       r.roomNo || '',
                          checkInDate:  r.checkInDate,
                          checkOutDate: r.checkOutDate,
                          roomCharge:   Number(r.roomCharge  || 0),
                          otherCharge:  Number(r.otherCharge || 0),
                          payDeposit:   Number(r.payDeposit  || 0),
                          depositDate:  r.depositDate  || '',
                          depositLast5: r.depositLast5 || '',
                          payTransfer:  Number(r.payTransfer || 0),
                          transferDate: r.transferDate  || '',
                          transferLast5:r.transferLast5 || '',
                          payCard:      Number(r.payCard     || 0),
                          cardFeeRate:  Number(r.cardFeeRate || 0),
                          cardFee:      Number(r.cardFee     || 0),
                          payCash:      Number(r.payCash     || 0),
                          payVoucher:   Number(r.payVoucher  || 0),
                          net: Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0)-Number(r.cardFee||0),
                          status:       r.status,
                          note:         r.note || '',
                        }))}
                        columns={[
                          { header: '月份',     key: 'importMonth' },
                          { header: '館別',     key: 'warehouse' },
                          { header: '來源',     key: 'source' },
                          { header: '姓名',     key: 'guestName' },
                          { header: '房號',     key: 'roomNo' },
                          { header: '入住',     key: 'checkInDate' },
                          { header: '退房',     key: 'checkOutDate' },
                          { header: '房費',     key: 'roomCharge',   format: 'number' },
                          { header: '其他費用', key: 'otherCharge',  format: 'number' },
                          { header: '訂金',     key: 'payDeposit',   format: 'number' },
                          { header: '訂金日期', key: 'depositDate' },
                          { header: '訂金後五碼',key:'depositLast5' },
                          { header: '當天匯款', key: 'payTransfer',  format: 'number' },
                          { header: '匯款日期', key: 'transferDate' },
                          { header: '匯款後五碼',key:'transferLast5'},
                          { header: '刷卡',     key: 'payCard',      format: 'number' },
                          { header: '手續費率', key: 'cardFeeRate',  format: 'number' },
                          { header: '手續費',   key: 'cardFee',      format: 'number' },
                          { header: '現金',     key: 'payCash',      format: 'number' },
                          { header: '住宿券',   key: 'payVoucher',   format: 'number' },
                          { header: '淨收入',   key: 'net',          format: 'number' },
                          { header: '狀態',     key: 'status' },
                          { header: '備註',     key: 'note' },
                        ]}
                        filename={`流水帳_${ledgerMonthFrom}_${ledgerMonthTo}${ledgerWarehouse ? '_' + ledgerWarehouse : ''}`}
                        title={`收款流水帳 ${ledgerMonthFrom} ~ ${ledgerMonthTo}${ledgerWarehouse ? '　' + ledgerWarehouse : ''}`}
                      />
                    )}
                  </div>

                  {/* 流水帳表格 */}
                  {ledgerLoading && <div className="text-center py-20 text-gray-400">載入中…</div>}
                  {!ledgerLoading && ledgerRows.length === 0 && (
                    <div className="text-center py-20 text-gray-400">請設定月份區間後按「查詢」</div>
                  )}
                  {!ledgerLoading && ledgerRows.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="sticky top-0 bg-indigo-50 text-indigo-800">
                          <tr>
                            <th className="px-3 py-2 text-left">月份</th>
                            <th className="px-3 py-2 text-left">館別</th>
                            <th className="px-3 py-2 text-left">姓名</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">退房</th>
                            <th className="px-3 py-2 text-right">房費</th>
                            <th className="px-3 py-2 text-right">其他</th>
                            <th className="px-3 py-2 text-right">訂金</th>
                            <th className="px-3 py-2 text-left">訂金日</th>
                            <th className="px-3 py-2 text-left">後五碼</th>
                            <th className="px-3 py-2 text-right">匯款</th>
                            <th className="px-3 py-2 text-left">匯款日</th>
                            <th className="px-3 py-2 text-left">後五碼</th>
                            <th className="px-3 py-2 text-right">刷卡</th>
                            <th className="px-3 py-2 text-right">手續費</th>
                            <th className="px-3 py-2 text-right">現金</th>
                            <th className="px-3 py-2 text-right">住宿券</th>
                            <th className="px-3 py-2 text-right font-semibold">淨收入</th>
                            <th className="px-3 py-2 text-left">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {ledgerRows.map(r => {
                            const net = Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0)-Number(r.cardFee||0);
                            return (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">{r.importMonth}</td>
                                <td className="px-3 py-2">{r.warehouse}</td>
                                <td className="px-3 py-2">{r.guestName}</td>
                                <td className="px-3 py-2">{r.checkInDate}</td>
                                <td className="px-3 py-2">{r.checkOutDate}</td>
                                <td className="px-3 py-2 text-right">{Number(r.roomCharge||0) > 0 ? NT(r.roomCharge) : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.otherCharge||0) > 0 ? NT(r.otherCharge) : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payDeposit||0) > 0 ? NT(r.payDeposit) : ''}</td>
                                <td className="px-3 py-2 text-gray-500">{r.depositDate || ''}</td>
                                <td className="px-3 py-2 font-mono text-gray-500">{r.depositLast5 || ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payTransfer||0) > 0 ? NT(r.payTransfer) : ''}</td>
                                <td className="px-3 py-2 text-gray-500">{r.transferDate || ''}</td>
                                <td className="px-3 py-2 font-mono text-gray-500">{r.transferLast5 || ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payCard||0) > 0 ? NT(r.payCard) : ''}</td>
                                <td className="px-3 py-2 text-right text-red-500">{Number(r.cardFee||0) > 0 ? `-${NT(r.cardFee)}` : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payCash||0) > 0 ? NT(r.payCash) : ''}</td>
                                <td className="px-3 py-2 text-right">{Number(r.payVoucher||0) > 0 ? NT(r.payVoucher) : ''}</td>
                                <td className="px-3 py-2 text-right font-semibold text-green-700">{net > 0 ? NT(net) : ''}</td>
                                <td className="px-3 py-2 text-gray-500">{r.status}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 整體進度視圖 */}
              {dmPayType === 'all' && dmData && !dmLoading && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(dmData.summary || []).map(s => {
                      const pct = s.total > 0 ? Math.round(s.matched / s.total * 100) : 0;
                      return (
                        <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                          <div className="text-xs text-gray-500 mb-1">{s.label}</div>
                          <div className="text-lg font-bold text-indigo-700">
                            NT$ {s.amount.toLocaleString()}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-green-500 h-2 rounded-full transition-all"
                                style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{pct}%</span>
                          </div>
                          <div className="mt-1 flex justify-between text-xs">
                            <span className="text-green-600">✓ {s.matched}</span>
                            {s.skipped > 0 && <span className="text-orange-500">↗ {s.skipped}</span>}
                            <span className={s.unmatched > 0 ? 'text-amber-600' : 'text-gray-400'}>
                              ○ {s.unmatched}
                            </span>
                            <span className="text-gray-400">共 {s.total}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 摘要卡 */}
              {summary && dmPayType !== 'all' && dmPayType !== 'ledger' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                  {[
                    { label: `BNB ${PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''}合計`,
                      val: `NT$ ${summary.totalBnbAmount.toLocaleString()}`, color: 'text-indigo-700' },
                    { label: '存簿入帳合計',   val: `NT$ ${summary.totalBankCredit.toLocaleString()}`,  color: 'text-blue-700' },
                    { label: '差異',          val: `NT$ ${Math.abs(summary.diff).toLocaleString()}`,    color: summary.diff !== 0 ? 'text-red-600 font-bold' : 'text-green-600' },
                    { label: '已配對',         val: `${summary.matchedCount} 筆`,                        color: 'text-green-600' },
                    { label: '標記處理',       val: `${summary.skippedCount || 0} 筆`,                   color: summary.skippedCount > 0 ? 'text-orange-500' : 'text-gray-400' },
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

              {!dmData && !dmLoading && activeOuterTab !== 'ledger' && (
                <div className="text-center py-20 text-gray-400">
                  {dmPayType === 'all' ? '請選擇月份後按「查詢」' : '請選擇存簿帳戶後按「查詢」'}
                </div>
              )}
              {dmLoading && activeOuterTab !== 'ledger' && (
                <div className="text-center py-20 text-gray-400">載入中…</div>
              )}

              {/* 雙欄核對表 */}
              {/* 全部分類合併列表 */}
              {dmData && !dmLoading && dmPayType === 'combined' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-indigo-800">全部收款類型（BNB）</span>
                    <span className="text-xs text-indigo-500">
                      {bnbRecords.length} 筆 　合計 NT${bnbRecords.reduce((s, r) => s + (r.payAmount || 0), 0).toLocaleString('zh-TW')}
                    </span>
                  </div>
                  <div className="overflow-y-auto max-h-[600px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-gray-500">
                          <th className="px-3 py-2 text-left">姓名</th>
                          <th className="px-3 py-2 text-left">入住</th>
                          <th className="px-3 py-2 text-left">付款日</th>
                          <th className="px-3 py-2 text-left">分類</th>
                          <th className="px-3 py-2 text-left">後五碼</th>
                          <th className="px-3 py-2 text-right">金額</th>
                          <th className="px-3 py-2 text-center">配對</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {bnbRecords.length === 0 && (
                          <tr><td colSpan={7} className="text-center py-8 text-gray-400">本月無收款記錄</td></tr>
                        )}
                        {bnbRecords.map(r => {
                          const typeColors = { deposit: 'bg-blue-50 text-blue-700', transfer: 'bg-indigo-50 text-indigo-700', card: 'bg-purple-50 text-purple-700', cash: 'bg-green-50 text-green-700' };
                          return (
                            <tr key={r.id} className={r.bankLineId ? 'bg-green-50' : 'hover:bg-gray-50'}>
                              <td className="px-3 py-2 font-medium max-w-[90px] truncate">{r.guestName}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                              <td className="px-3 py-2 text-blue-500 whitespace-nowrap">{r.payDate || '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${typeColors[r.paymentTypeKey] || 'bg-gray-100 text-gray-600'}`}>
                                  {r.paymentTypeLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-blue-600 font-mono">{r.last5 || '—'}</td>
                              <td className="px-3 py-2 text-right font-semibold text-indigo-700">{r.payAmount.toLocaleString()}</td>
                              <td className="px-3 py-2 text-center">
                                {r.bankLineId
                                  ? <span className="text-green-600 font-bold">✓</span>
                                  : r.matchSkip
                                    ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchSkip === 'next_month' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}
                                        title={r.matchSkipNote || ''}>
                                        {r.matchSkip === 'next_month' ? '跨月' : '免配'}
                                      </span>
                                    : <span className="text-gray-300">○</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold text-xs">
                        <tr>
                          {['deposit','transfer','card','cash'].map(key => {
                            const typeRows = bnbRecords.filter(r => r.paymentTypeKey === key);
                            if (typeRows.length === 0) return null;
                            const label = PAY_SUB_TYPES.find(t => t.key === key)?.label || key;
                            const total = typeRows.reduce((s, r) => s + (r.payAmount || 0), 0);
                            return <td key={key} className="px-3 py-2 text-gray-600">{label}: {total.toLocaleString()}</td>;
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {dmData && !dmLoading && dmPayType !== 'all' && dmPayType !== 'combined' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                  {/* 左欄：BNB 收款 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-indigo-800">
                        {PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || ''}（BNB）
                      </span>
                      <span className="text-xs text-indigo-500">{bnbRecords.length} 筆　點選後再點右側存簿行配對</span>
                    </div>
                    <div className="overflow-y-auto max-h-[480px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-gray-500">
                            <th className="px-3 py-2 text-left">狀態</th>
                            <th className="px-3 py-2 text-left">姓名</th>
                            <th className="px-3 py-2 text-left">入住</th>
                            <th className="px-3 py-2 text-left">付款日</th>
                            <th className="px-3 py-2 text-left">分類</th>
                            {(dmPayType === 'deposit' || dmPayType === 'transfer') && (
                              <th className="px-3 py-2 text-left">後五碼</th>
                            )}
                            <th className="px-3 py-2 text-right">金額</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {bnbRecords.length === 0 && (
                            <tr><td colSpan={(dmPayType === 'deposit' || dmPayType === 'transfer') ? 8 : 7} className="text-center py-8 text-gray-400">本月無此類型收款記錄</td></tr>
                          )}
                          {bnbRecords.map((r, _ri, arr) => {
                            const isMatched   = !!r.bankLineId;
                            const isSkipped   = !r.bankLineId && !!r.matchSkip;
                            const isSuggested = !isMatched && !isSkipped && suggestMap.has(r.id);
                            const isSelected  = dmSelBnb === r.id;
                            const isFirstUnmatched = !isMatched && !isSkipped && arr.findIndex(x => !x.bankLineId && !x.matchSkip) === _ri;
                            let rowCls = 'transition-colors ';
                            if (!isMatched && !isSkipped) rowCls += 'cursor-pointer ';
                            if (isSelected)       rowCls += 'bg-indigo-100 ring-1 ring-inset ring-indigo-300';
                            else if (isMatched)   rowCls += 'bg-green-50 hover:bg-green-100';
                            else if (isSkipped)   rowCls += r.matchSkip === 'next_month' ? 'bg-orange-50' : 'bg-gray-50';
                            else if (isSuggested) rowCls += 'bg-amber-50 hover:bg-amber-100';
                            else rowCls += 'hover:bg-gray-50';
                            return (
                              <tr key={r.id} className={rowCls}
                                {...(isFirstUnmatched ? { 'data-first-unmatched': '1' } : {})}
                                onClick={() => !isMatched && !isSkipped && setDmSelBnb(isSelected ? null : r.id)}>
                                <td className="px-3 py-2.5">
                                  {isMatched
                                    ? <span className="text-green-600 font-bold">✓</span>
                                    : isSkipped
                                      ? <span className={`text-[10px] font-semibold ${r.matchSkip === 'next_month' ? 'text-orange-500' : 'text-gray-400'}`}>
                                          {r.matchSkip === 'next_month' ? '↗' : '–'}
                                        </span>
                                      : isSuggested
                                        ? <span className="text-amber-500">⚡</span>
                                        : <span className="text-gray-300">○</span>
                                  }
                                </td>
                                <td className="px-3 py-2.5 max-w-[100px] truncate font-medium">{r.guestName}</td>
                                <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.checkInDate}</td>
                                <td className="px-3 py-2.5 text-blue-500 whitespace-nowrap text-xs">{r.payDate || '—'}</td>
                                <td className="px-3 py-2.5">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 whitespace-nowrap">
                                    {PAY_SUB_TYPES.find(t => t.key === dmPayType)?.label || dmPayType}
                                  </span>
                                </td>
                                {(dmPayType === 'deposit' || dmPayType === 'transfer') && (
                                  <td className="px-3 py-2.5 text-blue-600 font-mono text-xs tracking-wider">{r.last5 || '—'}</td>
                                )}
                                <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                  {r.payAmount.toLocaleString()}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  {isSkipped ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.matchSkip === 'next_month' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}
                                        title={r.matchSkipNote || ''}>
                                        {r.matchSkip === 'next_month' ? '跨月' : '免配'}
                                      </span>
                                      {!isLocked && (
                                        <button onClick={e => { e.stopPropagation(); handleClearMark(r.id); }}
                                          className="text-gray-300 hover:text-red-400 text-sm leading-none ml-0.5">×</button>
                                      )}
                                    </div>
                                  ) : isMatched ? (
                                    !isLocked && (
                                      <button onClick={e => { e.stopPropagation(); handleUnmatch(r.id); }}
                                        className="text-[10px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50">
                                        解除
                                      </button>
                                    )
                                  ) : !isLocked ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <button onClick={e => { e.stopPropagation(); setDmMarkNote(''); setDmMarkModal({ bnbId: r.id, skipType: 'next_month' }); }}
                                        className="text-[10px] text-orange-600 border border-orange-200 hover:bg-orange-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        跨月
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); setDmMarkNote(''); setDmMarkModal({ bnbId: r.id, skipType: 'no_match' }); }}
                                        className="text-[10px] text-gray-500 border border-gray-200 hover:bg-gray-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        免配
                                      </button>
                                    </div>
                                  ) : null}
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
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-blue-500">{bankLines.length} 筆入帳</span>
                        {dmAccountId && (
                          <button onClick={() => { setBankImportLines([]); setBankImportError(''); setShowBankImport(true); }}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">
                            ↑ 匯入對帳單
                          </button>
                        )}
                      </div>
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
                  <option value="Agoda" disabled>Agoda（尚未支援）</option>
                  <option value="Expedia" disabled>Expedia（尚未支援）</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">快速月份</label>
                <input type="month" className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaMonth}
                  onChange={e => {
                    const m = e.target.value;
                    setOtaMonth(m);
                    if (m) {
                      const [y, mo] = m.split('-').map(Number);
                      const last = new Date(y, mo, 0).getDate();
                      setOtaDateFrom(`${m}-01`);
                      setOtaDateTo(`${m}-${String(last).padStart(2, '0')}`);
                    }
                  }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入住起日</label>
                <input type="date" className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaDateFrom} onChange={e => { setOtaDateFrom(e.target.value); setOtaMonth(''); }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入住迄日</label>
                <input type="date" className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaDateTo} onChange={e => { setOtaDateTo(e.target.value); setOtaMonth(''); }} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaWarehouse} onChange={e => setOtaWarehouse(e.target.value)}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={otaWarehouse} onChange={setOtaWarehouse} />
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
              {otaResult && (
                <ExportButtons
                  data={[
                    ...otaResult.matched.map(m => ({
                      type: '已配對', arrival: m.ota.arrival, departure: m.ota.departure,
                      otaName: m.ota.guestName, sysName: m.bnb.guestName, roomNo: m.bnb.roomNo,
                      otaAmt: m.ota.finalAmount, sysAmt: m.bnb.roomCharge, diff: m.amountDiff,
                      commission: m.ota.commissionAmt, reservationNo: m.ota.reservationNo,
                      status: m.hasAmtIssue || m.hasNameIssue ? '有差異' : '吻合',
                    })),
                    ...otaResult.unmatchedOta.map(r => ({
                      type: 'OTA未配對', arrival: r.arrival, departure: r.departure,
                      otaName: r.guestName, sysName: '', roomNo: '',
                      otaAmt: r.finalAmount, sysAmt: '', diff: '',
                      commission: r.commissionAmt, reservationNo: r.reservationNo, status: r.status,
                    })),
                    ...otaResult.unmatchedBnb.map(r => ({
                      type: '系統未配對', arrival: r.checkInDate, departure: r.checkOutDate,
                      otaName: '', sysName: r.guestName, roomNo: r.roomNo,
                      otaAmt: '', sysAmt: r.roomCharge, diff: '',
                      commission: '', reservationNo: '', status: r.status,
                    })),
                  ]}
                  columns={[
                    { header: '類別', key: 'type' },
                    { header: '入住', key: 'arrival' },
                    { header: '退房', key: 'departure' },
                    { header: 'OTA姓名', key: 'otaName' },
                    { header: '系統姓名', key: 'sysName' },
                    { header: '房號', key: 'roomNo' },
                    { header: 'OTA金額', key: 'otaAmt', format: 'number' },
                    { header: '系統金額', key: 'sysAmt', format: 'number' },
                    { header: '差異', key: 'diff', format: 'number' },
                    { header: '佣金', key: 'commission', format: 'number' },
                    { header: '訂單號', key: 'reservationNo' },
                    { header: '狀態', key: 'status' },
                  ]}
                  filename={`OTA比對_${otaSource}_${otaDateFrom || 'all'}`}
                  title={`OTA 比對結果 ${otaSource}`}
                />
              )}
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

                  {/* 確認比對完成 / 存檔 */}
                  <div className="bg-white rounded-xl shadow p-4 mb-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-700 text-sm mb-0.5">確認比對結果</div>
                      <div className="text-xs text-gray-400">審查完畢後點擊「確認存檔」，將本次比對摘要儲存至系統記錄</div>
                    </div>
                    {reconcileConfirmed ? (
                      <span className="flex items-center gap-1.5 px-4 py-2 bg-green-100 text-green-700 rounded-xl text-sm font-semibold">
                        ✓ 已確認存檔
                      </span>
                    ) : (
                      <button
                        onClick={confirmReconcile}
                        disabled={reconcileConfirming}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
                        {reconcileConfirming ? '存檔中…' : '確認存檔'}
                      </button>
                    )}
                  </div>

                  {/* 傭金確認送出 */}
                  <div className="bg-white rounded-xl shadow p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-semibold text-gray-700 text-sm">傭金登記</span>
                      {commExisting?.exists && commExisting.record?.status !== '已取消' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          (commExisting.record?.status === '已付款' || commExisting.orderStatus?.status === '已執行') ? 'bg-green-100 text-green-700'
                          : commExisting.record?.status === '草稿' ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {(commExisting.record?.status === '已付款' || commExisting.orderStatus?.status === '已執行') ? '已付款'
                            : commExisting.record?.status === '草稿' ? '草稿（未送出）'
                            : `待出納 — ${commExisting.orderStatus?.orderNo || ''}`}
                        </span>
                      )}
                    </div>
                    {commExisting?.exists && commExisting.record?.status !== '已取消' ? (
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                        <span>金額：<strong className="text-gray-800">NT$ {Number(commExisting.record.commissionAmount).toLocaleString()}</strong></span>
                        <span>付款方式：{commExisting.record.paymentMethod}</span>
                        <span>廠商：{commExisting.record.supplierName}</span>
                        {commExisting.record.note && <span>備註：{commExisting.record.note}</span>}
                        {commExisting.record.status === '草稿' && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            請到「OTA傭金」分頁確認金額後點「確認送出」
                          </span>
                        )}
                        {(commExisting.record.status === '草稿' || commExisting.record.status === '待出納') && (
                          <button onClick={() => cancelCommission(commExisting.record.id)}
                            className="px-3 py-1 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                            取消傭金
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">傭金金額（NT$）</label>
                          <input type="number" min="0" step="1"
                            className="border rounded-lg px-3 py-1.5 text-sm w-36"
                            value={commAmt}
                            onChange={e => setCommAmt(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">付款方式</label>
                          <select className="border rounded-lg px-3 py-1.5 text-sm"
                            value={commMethod} onChange={e => setCommMethod(e.target.value)}>
                            <option value="轉帳">轉帳</option>
                            <option value="匯款">匯款</option>
                            <option value="現金">現金</option>
                            <option value="支票">支票</option>
                            <option value="信用卡">信用卡</option>
                            <option value="月結">月結</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">備註</label>
                          <input type="text" className="border rounded-lg px-3 py-1.5 text-sm w-52"
                            placeholder="選填"
                            value={commNote} onChange={e => setCommNote(e.target.value)} />
                        </div>
                        <button onClick={submitCommission}
                          disabled={commSubmitting || !commAmt}
                          className="px-5 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                          {commSubmitting ? '建立中…' : '建立草稿'}
                        </button>
                        <span className="text-xs text-gray-400">建立後可在「OTA傭金」分頁編輯金額再確認送出</span>
                      </div>
                    )}
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
                    <div className="bg-white rounded-xl shadow tbl-wrap">
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
                            <th className="px-3 py-2 text-center">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.matched.length === 0 && (
                            <tr><td colSpan={13} className="text-center py-8 text-gray-400">無配對資料</td></tr>
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
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => openOtaEdit(m.bnb.id)}
                                  className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">編輯</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* OTA未配對 */}
                  {otaViewTab === 'unmatchedOta' && (
                    <div className="bg-white rounded-xl shadow tbl-wrap">
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
                            <th className="px-3 py-2 text-center">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.unmatchedOta.length === 0 && (
                            <tr><td colSpan={10} className="text-center py-8 text-green-600">全部 OTA 筆數都有配對</td></tr>
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
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => openOtaAdd(r)}
                                  className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 whitespace-nowrap">新增到系統</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 系統未配對 */}
                  {otaViewTab === 'unmatchedBnb' && (
                    <div className="bg-white rounded-xl shadow tbl-wrap">
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
                            <th className="px-3 py-2 text-center">操作</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {otaResult.unmatchedBnb.length === 0 && (
                            <tr><td colSpan={8} className="text-center py-8 text-green-600">全部系統紀錄都有配對</td></tr>
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
                              <td className="px-3 py-2 text-center">
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => openOtaEdit(r.id)}
                                    className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">編輯</button>
                                  <button onClick={() => deleteOtaBnb(r.id)}
                                    className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">刪除</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 已取消 */}
                  {otaViewTab === 'cancelled' && (
                    <div className="bg-white rounded-xl shadow tbl-wrap">
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

        {/* ══ Tab: OTA傭金 ══ */}
        {activeTab === 'otaCommission' && (
          <div>
            {/* KPI 摘要 */}
            {commHistRows.length > 0 && (() => {
              const active     = commHistRows.filter(r => r.status !== '已取消');
              const totalAmt   = active.reduce((s, r) => s + Number(r.commissionAmount), 0);
              const draftAmt   = active.filter(r => r.status === '草稿').reduce((s, r) => s + Number(r.commissionAmount), 0);
              const paidAmt    = active.filter(r => r.status === '已付款' || r.paymentOrder?.status === '已執行').reduce((s, r) => s + Number(r.commissionAmount), 0);
              const pendingAmt = active.filter(r => r.status === '待出納').reduce((s, r) => s + Number(r.commissionAmount), 0);
              const draftCnt   = active.filter(r => r.status === '草稿').length;
              const pendingCnt = active.filter(r => r.status === '待出納').length;
              const paidCnt    = active.filter(r => r.status === '已付款' || r.paymentOrder?.status === '已執行').length;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="text-xs text-gray-400 mb-1">傭金總額（有效）</div>
                    <div className="text-xl font-bold text-gray-800">NT$ {totalAmt.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-1">{active.length} 筆</div>
                  </div>
                  <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
                    <div className="text-xs text-blue-400 mb-1">草稿（待確認）</div>
                    <div className="text-xl font-bold text-blue-600">NT$ {draftAmt.toLocaleString()}</div>
                    <div className="text-xs text-blue-400 mt-1">{draftCnt} 筆</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="text-xs text-gray-400 mb-1">待出納</div>
                    <div className="text-xl font-bold text-amber-600">NT$ {pendingAmt.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-1">{pendingCnt} 筆</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="text-xs text-gray-400 mb-1">已付款</div>
                    <div className="text-xl font-bold text-green-600">NT$ {paidAmt.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-1">{paidCnt} 筆</div>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="text-xs text-gray-400 mb-1">已付款率</div>
                    <div className="text-xl font-bold text-indigo-600">
                      {totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0}%
                    </div>
                    <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full"
                        style={{ width: `${totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaWarehouse} onChange={e => setOtaWarehouse(e.target.value)}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={otaWarehouse} onChange={setOtaWarehouse} />
              </div>
              <button onClick={fetchCommHistory} disabled={commHistLoading}
                className="px-5 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {commHistLoading ? '載入中…' : '重新整理'}
              </button>
              {commHistRows.length > 0 && (
                <ExportButtons
                  data={commHistRows.map(r => ({
                    ...r,
                    poStatus: r.paymentOrder?.status || '',
                    orderNo: r.paymentOrder?.orderNo || '',
                  }))}
                  columns={[
                    { header: '月份',     key: 'commissionMonth' },
                    { header: 'OTA來源',  key: 'otaSource' },
                    { header: '館別',     key: 'warehouse' },
                    { header: '傭金金額',  key: 'commissionAmount', format: 'number' },
                    { header: '付款方式',  key: 'paymentMethod' },
                    { header: '廠商',     key: 'supplierName' },
                    { header: '傭金狀態',  key: 'status' },
                    { header: '出納狀態',  key: 'poStatus' },
                    { header: '付款單號',  key: 'orderNo' },
                    { header: '確認者',   key: 'confirmedBy' },
                    { header: '備註',     key: 'note' },
                  ]}
                  filename={`OTA傭金_${otaWarehouse || '全部'}`}
                  title="OTA 傭金記錄"
                />
              )}
            </div>

            <div className="bg-white rounded-xl shadow tbl-wrap">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-gray-500">
                    <th className="px-3 py-2 text-left">月份</th>
                    <th className="px-3 py-2 text-left">OTA 來源</th>
                    <th className="px-3 py-2 text-left">館別</th>
                    <th className="px-3 py-2 text-right">傭金金額</th>
                    <th className="px-3 py-2 text-left">付款方式</th>
                    <th className="px-3 py-2 text-left">廠商</th>
                    <th className="px-3 py-2 text-center">傭金狀態</th>
                    <th className="px-3 py-2 text-center">出納狀態</th>
                    <th className="px-3 py-2 text-left">付款單號</th>
                    <th className="px-3 py-2 text-left">確認者</th>
                    <th className="px-3 py-2 text-left">備註</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {commHistLoading && (
                    <tr><td colSpan={12} className="text-center py-8 text-gray-400">載入中…</td></tr>
                  )}
                  {!commHistLoading && commHistRows.length === 0 && (
                    <tr><td colSpan={12} className="text-center py-8 text-gray-400">尚無傭金記錄</td></tr>
                  )}
                  {commHistRows.map(r => {
                    const isPaid      = r.status === '已付款' || r.paymentOrder?.status === '已執行';
                    const isCancelled = r.status === '已取消';
                    const isDraft     = r.status === '草稿';
                    const isPending   = r.status === '待出納' && !isPaid;
                    const isEditing   = commEditId === r.id;
                    const statusColor = isCancelled ? 'bg-gray-100 text-gray-400'
                      : isPaid    ? 'bg-green-100 text-green-700'
                      : isDraft   ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700';
                    const statusLabel = isCancelled ? '已取消' : isPaid ? '已付款' : r.status;
                    const poColor = !r.paymentOrder ? ''
                      : (r.paymentOrder.status === '已執行' || r.paymentOrder.status === '已付款') ? 'text-green-600 font-semibold'
                      : r.paymentOrder.status === '已取消' ? 'text-gray-400 line-through'
                      : 'text-amber-600';
                    const canEdit = (isDraft || isPending) && !isPaid && !isCancelled;
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 ${isCancelled ? 'opacity-50' : ''} ${isDraft ? 'bg-blue-50/40' : ''} ${isEditing ? 'bg-indigo-50' : ''}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{r.commissionMonth}</td>
                        <td className="px-3 py-2.5">{r.otaSource}</td>
                        <td className="px-3 py-2.5 text-gray-500">{r.warehouse}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                          {isEditing ? (
                            <input type="number" min="1" step="1"
                              className="border rounded px-2 py-0.5 w-28 text-right text-sm"
                              value={commEditData.commissionAmount}
                              onChange={e => setCommEditData(p => ({ ...p, commissionAmount: e.target.value }))} />
                          ) : `NT$ ${r.commissionAmount.toLocaleString()}`}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {isEditing ? (
                            <select className="border rounded px-2 py-0.5 text-sm"
                              value={commEditData.paymentMethod}
                              onChange={e => setCommEditData(p => ({ ...p, paymentMethod: e.target.value }))}>
                              <option>轉帳</option><option>匯款</option><option>現金</option><option>支票</option><option>信用卡</option><option>月結</option>
                            </select>
                          ) : r.paymentMethod}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{r.supplierName || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-center text-sm ${poColor}`}>
                          {r.paymentOrder?.status || (isDraft ? '未建立' : '—')}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-gray-400">
                          {r.paymentOrder?.orderNo || (isDraft ? '—' : '—')}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{r.confirmedBy || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[140px] truncate">
                          {isEditing ? (
                            <input type="text" className="border rounded px-2 py-0.5 w-full text-sm"
                              placeholder="備註"
                              value={commEditData.note}
                              onChange={e => setCommEditData(p => ({ ...p, note: e.target.value }))} />
                          ) : <span title={r.note}>{r.note || '—'}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex gap-1 justify-center flex-wrap">
                            {isEditing ? (
                              <>
                                <button onClick={saveEditComm} disabled={commEditSaving}
                                  className="px-2 py-0.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                                  {commEditSaving ? '…' : '儲存'}
                                </button>
                                <button onClick={() => setCommEditId(null)}
                                  className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                                  取消編輯
                                </button>
                              </>
                            ) : (
                              <>
                                {canEdit && (
                                  <button onClick={() => startEditComm(r)}
                                    className="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                    編輯
                                  </button>
                                )}
                                {isDraft && (
                                  <button onClick={() => confirmCommission(r.id)}
                                    className="px-2 py-0.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                                    確認送出
                                  </button>
                                )}
                                {canEdit && (
                                  <button onClick={() => cancelCommission(r.id)}
                                    className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100">
                                    取消
                                  </button>
                                )}
                                {isPaid && (
                                  <span className="text-xs text-green-600 font-semibold">已付款</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 比對記錄 */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">OTA 比對記錄（最近 100 次）</h3>
                <button onClick={fetchReconLogs} disabled={reconLogsLoading}
                  className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
                  {reconLogsLoading ? '載入中…' : '重新整理'}
                </button>
              </div>
              <div className="bg-white rounded-xl shadow tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-500 text-xs">
                      <th className="px-3 py-2 text-left">比對時間</th>
                      <th className="px-3 py-2 text-left">月份</th>
                      <th className="px-3 py-2 text-left">來源</th>
                      <th className="px-3 py-2 text-left">館別</th>
                      <th className="px-3 py-2 text-center">OTA筆</th>
                      <th className="px-3 py-2 text-center">系統筆</th>
                      <th className="px-3 py-2 text-center">配對</th>
                      <th className="px-3 py-2 text-center">OTA未配</th>
                      <th className="px-3 py-2 text-center">系統未配</th>
                      <th className="px-3 py-2 text-center">差異筆</th>
                      <th className="px-3 py-2 text-right">OTA總額</th>
                      <th className="px-3 py-2 text-right">系統總額</th>
                      <th className="px-3 py-2 text-right">差異</th>
                      <th className="px-3 py-2 text-right">佣金</th>
                      <th className="px-3 py-2 text-left">執行者</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reconLogsLoading && (
                      <tr><td colSpan={15} className="text-center py-6 text-gray-400">載入中…</td></tr>
                    )}
                    {!reconLogsLoading && reconLogs.length === 0 && (
                      <tr><td colSpan={15} className="text-center py-6 text-gray-400">尚無比對記錄</td></tr>
                    )}
                    {reconLogs.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.reconcileMonth}</td>
                        <td className="px-3 py-2">{r.otaSource}</td>
                        <td className="px-3 py-2 text-gray-500">{r.warehouse}</td>
                        <td className="px-3 py-2 text-center">{r.otaRowCount}</td>
                        <td className="px-3 py-2 text-center">{r.bnbRowCount}</td>
                        <td className="px-3 py-2 text-center text-green-600 font-semibold">{r.matchedCount}</td>
                        <td className={`px-3 py-2 text-center ${r.unmatchedOtaCnt > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{r.unmatchedOtaCnt}</td>
                        <td className={`px-3 py-2 text-center ${r.unmatchedBnbCnt > 0 ? 'text-amber-500 font-semibold' : 'text-gray-400'}`}>{r.unmatchedBnbCnt}</td>
                        <td className={`px-3 py-2 text-center ${r.issueCount > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{r.issueCount}</td>
                        <td className="px-3 py-2 text-right text-xs">{r.otaTotal.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-xs">{r.bnbTotal.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold ${Math.abs(r.diff) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {r.diff === 0 ? '—' : r.diff > 0 ? `+${r.diff.toLocaleString()}` : r.diff.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-600">{r.otaCommission.toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{r.createdBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ Tab: 老闆收取 ══ */}
        {activeTab === 'bossWithdraw' && (
          <div>
            {/* 檢視切換 */}
            <div className="flex gap-2 mb-4">
              {[{ key: 'detail', label: '📋 明細' }, { key: 'monthly', label: '📊 月份報表' }].map(v => (
                <button key={v.key} onClick={() => setBwViewMode(v.key)}
                  className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${bwViewMode === v.key ? 'bg-orange-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-orange-50'}`}>
                  {v.label}
                </button>
              ))}
            </div>

            {/* ── 明細模式 ── */}
            {bwViewMode === 'detail' && (
              <>
                <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">月份</label>
                    <input type="month" value={bwMonth} onChange={e => setBwMonth(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">館別</label>
                    <select value={bwWarehouse} onChange={e => setBwWarehouse(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                      <option value="">全部</option>
                      {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                    <WhQuickBtns value={bwWarehouse} onChange={setBwWarehouse} />
                  </div>
                  <button onClick={fetchBossWithdraw}
                    className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700">
                    查詢
                  </button>
                  {bwData && (
                    <div className="ml-auto text-sm text-gray-500">
                      共 <span className="font-semibold text-gray-800">{(bwData.rows || []).length}</span> 筆，
                      合計 <span className="font-bold text-orange-600">NT${Number(bwData.total || 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-xl shadow overflow-hidden">
                  {bwLoading ? (
                    <div className="text-center py-10 text-gray-400">載入中…</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-orange-50">
                        <tr className="text-orange-800 text-xs">
                          <th className="px-4 py-2 text-left font-medium">日期</th>
                          <th className="px-4 py-2 text-left font-medium">館別</th>
                          <th className="px-4 py-2 text-left font-medium">房客姓名</th>
                          <th className="px-4 py-2 text-right font-medium">金額</th>
                          <th className="px-4 py-2 text-left font-medium">備註</th>
                          <th className="px-4 py-2 text-left font-medium">建立時間</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(!bwData || !bwData.rows || bwData.rows.length === 0) && (
                          <tr><td colSpan={6} className="text-center py-10 text-gray-400">無資料</td></tr>
                        )}
                        {(bwData?.rows || []).map(r => (
                          <tr key={r.id} className="hover:bg-orange-50/40">
                            <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.withdrawDate}</td>
                            <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                            <td className="px-4 py-2 font-medium text-gray-700">{r.guestName || '—'}</td>
                            <td className="px-4 py-2 text-right font-semibold text-orange-600">NT${Number(r.amount).toLocaleString()}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{r.note || '—'}</td>
                            <td className="px-4 py-2 text-gray-300 text-xs whitespace-nowrap">
                              {r.createdAt ? new Date(r.createdAt).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ── 月份報表模式 ── */}
            {bwViewMode === 'monthly' && (
              <>
                <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">年度</label>
                    <select value={bwYear} onChange={e => setBwYear(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                      {[0,1,2,3].map(d => {
                        const y = String(new Date().getFullYear() - d);
                        return <option key={y} value={y}>{y} 年</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">館別</label>
                    <select value={bwWarehouse} onChange={e => setBwWarehouse(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-300 outline-none">
                      <option value="">全部</option>
                      {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                    <WhQuickBtns value={bwWarehouse} onChange={setBwWarehouse} />
                  </div>
                  <button onClick={fetchBossWithdrawSummary}
                    className="px-4 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700">
                    {bwSummaryLoad ? '載入中…' : '查詢'}
                  </button>
                  {bwSummary && (
                    <div className="ml-auto text-sm text-gray-500">
                      全年共 <span className="font-semibold">{bwSummary.grandCnt}</span> 筆，
                      合計 <span className="font-bold text-orange-600">NT${Number(bwSummary.grandTotal || 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* 月份彙整表 */}
                <div className="bg-white rounded-xl shadow overflow-hidden">
                  {bwSummaryLoad ? (
                    <div className="text-center py-10 text-gray-400">載入中…</div>
                  ) : !bwSummary ? (
                    <div className="text-center py-10 text-gray-400">請選擇年度後按「查詢」</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-orange-50">
                        <tr className="text-orange-800 text-xs font-medium">
                          <th className="px-4 py-3 text-left">月份</th>
                          <th className="px-4 py-3 text-left">館別</th>
                          <th className="px-4 py-3 text-center">筆數</th>
                          <th className="px-4 py-3 text-right">老闆收取現金</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(bwSummary.summaryRows || []).length === 0 && (
                          <tr><td colSpan={4} className="text-center py-10 text-gray-400">{bwYear} 年無資料</td></tr>
                        )}
                        {(bwSummary.summaryRows || []).map((r, i) => (
                          <tr key={i} className="hover:bg-orange-50/40">
                            <td className="px-4 py-3 font-medium text-gray-800">{r.month}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{r.warehouse}</td>
                            <td className="px-4 py-3 text-center text-gray-500">{r.cnt} 筆</td>
                            <td className="px-4 py-3 text-right font-bold text-orange-600 text-base">
                              NT${r.total.toLocaleString('zh-TW')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {(bwSummary.summaryRows || []).length > 0 && (
                        <tfoot className="bg-orange-100 font-bold text-sm">
                          <tr>
                            <td className="px-4 py-3 text-orange-800">全年合計</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-center text-orange-700">{bwSummary.grandCnt} 筆</td>
                            <td className="px-4 py-3 text-right text-orange-700 text-lg">
                              NT${Number(bwSummary.grandTotal).toLocaleString('zh-TW')}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ Tab: 其他收入 ══ */}
        {activeTab === 'otherIncome' && (
          <div>
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份</label>
                <input type="month" value={oiMonth} onChange={e => setOiMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={oiWarehouse} onChange={e => setOiWarehouse(e.target.value)} className={inputCls}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={oiWarehouse} onChange={setOiWarehouse} />
              </div>
              <button onClick={fetchOtherIncome} disabled={oiLoading}
                className={`${btnCls} bg-indigo-50 text-indigo-700 disabled:opacity-40`}>
                {oiLoading ? '載入中…' : '查詢'}
              </button>
              <button onClick={() => openOiModal(null)}
                className={`${btnCls} bg-indigo-600 text-white hover:bg-indigo-700`}>
                + 新增其他收入
              </button>
              {oiRows.length > 0 && (
                <ExportButtons
                  data={oiRows.map(r => ({ importMonth: r.importMonth, warehouse: r.warehouse, incomeDate: r.incomeDate, category: r.category || '', description: r.description, amount: r.amount, note: r.note || '' }))}
                  columns={[
                    { header: '月份',   key: 'importMonth' },
                    { header: '館別',   key: 'warehouse' },
                    { header: '日期',   key: 'incomeDate' },
                    { header: '類別',   key: 'category' },
                    { header: '說明',   key: 'description' },
                    { header: '金額',   key: 'amount', format: 'number' },
                    { header: '備註',   key: 'note' },
                  ]}
                  filename={`其他收入_${oiMonth}${oiWarehouse ? '_' + oiWarehouse : ''}`}
                  title={`其他收入 ${oiMonth}${oiWarehouse ? '　' + oiWarehouse : ''}`}
                />
              )}
              {oiRows.length > 0 && (
                <span className="text-sm text-gray-500 ml-2">
                  合計 <b className="text-indigo-700">{NT(oiRows.reduce((s, r) => s + Number(r.amount), 0))}</b>（{oiRows.length} 筆）
                </span>
              )}
            </div>

            {/* 資料表格 */}
            {oiLoading && <div className="text-center py-20 text-gray-400">載入中…</div>}
            {!oiLoading && oiRows.length === 0 && (
              <div className="text-center py-20 text-gray-400">請選擇月份後按「查詢」，或按「+ 新增其他收入」</div>
            )}
            {!oiLoading && oiRows.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 tbl-wrap">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-indigo-50">
                    <tr className="bg-indigo-50 text-indigo-800 text-xs">
                      <th className="px-3 py-2 text-left">月份</th>
                      <th className="px-3 py-2 text-left">館別</th>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">類別</th>
                      <th className="px-3 py-2 text-left">說明</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">備註</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {oiRows.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-500">{r.importMonth}</td>
                        <td className="px-3 py-2 text-xs">{r.warehouse}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{r.incomeDate}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.category ? <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">{r.category}</span> : '—'}
                        </td>
                        <td className="px-3 py-2">{r.description}</td>
                        <td className="px-3 py-2 text-right font-medium text-indigo-700">{NT(r.amount)}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{r.note || '—'}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <button onClick={() => openOiModal(r)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 mr-1">編輯</button>
                          <button onClick={() => { if (confirm(`確定刪除「${r.description}」？`)) deleteOtherIncome(r.id); }}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-400 hover:bg-red-50">刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 新增/編輯 Modal */}
            {oiModalOpen && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <h3 className="text-lg font-bold mb-4">{oiEditRow ? '編輯其他收入' : '新增其他收入'}</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">月份 *</label>
                        <input type="month" value={oiForm.importMonth} onChange={e => setOiForm(f => ({ ...f, importMonth: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">日期 *</label>
                        <input type="date" value={oiForm.incomeDate} onChange={e => setOiForm(f => ({ ...f, incomeDate: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">館別 *</label>
                        <select value={oiForm.warehouse} onChange={e => setOiForm(f => ({ ...f, warehouse: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm">
                          {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">類別</label>
                        <select value={oiForm.category} onChange={e => setOiForm(f => ({ ...f, category: e.target.value }))} className="w-full border rounded-lg px-3 py-1.5 text-sm">
                          <option value="">請選擇</option>
                          {OI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">說明 *</label>
                      <input type="text" value={oiForm.description} onChange={e => setOiForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="例：5月停車費" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">金額 *</label>
                      <input type="number" value={oiForm.amount} onChange={e => setOiForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0" className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">備註</label>
                      <input type="text" value={oiForm.note} onChange={e => setOiForm(f => ({ ...f, note: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={saveOtherIncome} disabled={oiSaving}
                      className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {oiSaving ? '儲存中…' : '儲存'}
                    </button>
                    <button onClick={() => setOiModalOpen(false)}
                      className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">取消</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ Tab: 訂房日曆 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'calendar' && (() => {
          const daysInMonth = new Date(calYear, calMonth, 0).getDate();
          const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
          // 統計每天有幾筆入住中的訂單
          const dayMap = {};
          for (const r of calData) {
            if (r.status === '已刪除') continue;
            const inn  = new Date(r.checkInDate);
            const out  = new Date(r.checkOutDate);
            for (let d = new Date(inn); d < out; d.setDate(d.getDate() + 1)) {
              if (d.getFullYear() === calYear && d.getMonth() + 1 === calMonth) {
                const key = d.getDate();
                if (!dayMap[key]) dayMap[key] = [];
                dayMap[key].push(r);
              }
            }
          }
          const firstDay = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
          const cells = [];
          for (let i = 0; i < firstDay; i++) cells.push(null);
          for (const d of days) cells.push(d);
          const weekLabels = ['日','一','二','三','四','五','六'];
          return (
            <div className="space-y-4">
              {/* toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => { const d = new Date(calYear, calMonth - 2, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1); }}
                  className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50">← 上月</button>
                <span className="font-semibold text-gray-800 text-lg">{calYear} 年 {calMonth} 月</span>
                <button onClick={() => { const d = new Date(calYear, calMonth, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1); }}
                  className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50">下月 →</button>
                <select value={calWarehouse} onChange={e => setCalWarehouse(e.target.value)} className={inputCls}>
                  <option value="">全館</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={calWarehouse} onChange={setCalWarehouse} />
                {calLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
              </div>
              {/* calendar grid */}
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="grid grid-cols-7 border-b">
                  {weekLabels.map(w => (
                    <div key={w} className={`py-2 text-center text-xs font-medium ${w === '日' ? 'text-red-400' : w === '六' ? 'text-blue-400' : 'text-gray-500'}`}>{w}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-[minmax(80px,auto)]">
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`e${idx}`} className="border-b border-r border-gray-50" />;
                    const bookings = dayMap[day] || [];
                    const isToday = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}` === new Date().toISOString().slice(0,10);
                    const dow = (firstDay + day - 1) % 7;
                    return (
                      <div key={day} className={`border-b border-r border-gray-100 p-1.5 ${isToday ? 'bg-indigo-50' : bookings.length > 0 ? 'bg-green-50/40' : ''}`}>
                        <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-600' : dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-gray-500'}`}>{day}</div>
                        {bookings.slice(0, 3).map(b => (
                          <div key={b.id} className="text-[10px] leading-4 px-1 rounded truncate bg-green-100 text-green-700 mb-0.5" title={`${b.guestName} ${b.checkInDate}~${b.checkOutDate}`}>
                            {b.roomNo ? `${b.roomNo} ` : ''}{b.guestName}
                          </div>
                        ))}
                        {bookings.length > 3 && <div className="text-[10px] text-gray-400">+{bookings.length - 3}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* legend */}
              <div className="text-xs text-gray-400 flex gap-4">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" />有訂房</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-50 inline-block" />今日</span>
                <span>共 {calData.filter(r => r.status !== '已刪除').length} 筆訂房</span>
              </div>
            </div>
          );
        })()}

        {/* ══ Tab: 入住率統計 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'occupancy' && (
          <div className="space-y-4">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <input type="number" min="2020" max="2035" value={occYear} onChange={e => setOccYear(e.target.value)}
                className={inputCls + ' w-24'} placeholder="年度" />
              <select value={occWarehouse} onChange={e => setOccWarehouse(e.target.value)} className={inputCls}>
                <option value="">全館</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns value={occWarehouse} onChange={setOccWarehouse} />
              <button onClick={fetchOccupancy} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
              {occLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
            </div>
            {occData && (() => {
              const rows = occData.rows || [];
              const totalBookings = rows.reduce((s, r) => s + r.bookings, 0);
              const totalRevenue  = rows.reduce((s, r) => s + r.revenue,  0);
              const totalNights   = rows.reduce((s, r) => s + r.roomNights, 0);
              return (
                <>
                  {/* KPI */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: '全年訂房數', value: totalBookings, color: 'text-indigo-600' },
                      { label: '住宿房夜', value: `${totalNights} 晚`, color: 'text-teal-600' },
                      { label: '全年收入', value: `NT$ ${totalRevenue.toLocaleString()}`, color: 'text-emerald-600' },
                      { label: '平均住宿天數', value: `${totalBookings > 0 ? (totalNights / totalBookings).toFixed(1) : 0} 晚`, color: 'text-amber-600' },
                    ].map(k => (
                      <div key={k.label} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                        <div className="text-xs text-gray-400 mb-1">{k.label}</div>
                        <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* monthly bar chart */}
                  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">月度訂房數與收入</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="text-xs text-gray-400 border-b">
                            <th className="text-left py-2 pr-3 font-medium">月份</th>
                            <th className="text-right py-2 px-2 font-medium">訂房</th>
                            <th className="text-right py-2 px-2 font-medium">房夜</th>
                            <th className="text-right py-2 px-2 font-medium">均住</th>
                            <th className="text-right py-2 px-2 font-medium">收入</th>
                            <th className="py-2 pl-3 font-medium w-40">訂房比例</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map(r => {
                            const pct = totalBookings > 0 ? Math.round(r.bookings / totalBookings * 100) : 0;
                            return (
                              <tr key={r.month} className="hover:bg-gray-50">
                                <td className="py-2 pr-3 text-gray-600 font-medium">{r.month}</td>
                                <td className="py-2 px-2 text-right text-indigo-600 font-semibold">{r.bookings}</td>
                                <td className="py-2 px-2 text-right text-teal-600">{r.roomNights}</td>
                                <td className="py-2 px-2 text-right text-gray-500">{r.avgStay}</td>
                                <td className="py-2 px-2 text-right text-emerald-600">NT$ {r.revenue.toLocaleString()}</td>
                                <td className="py-2 pl-3">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                                      <div className="bg-indigo-400 rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ══ Tab: 付款稽核 ══ */}
        {activeTab === 'payAudit' && (() => {
          const unfilled   = auditData.filter(r => !r.paymentFilled);
          const mismatched = auditData.filter(r => {
            if (!r.paymentFilled) return false;
            const pay = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
            const chg = Number(r.roomCharge) + Number(r.otherCharge);
            return Math.abs(pay - chg) > 0.01;
          });
          const ok = auditData.length - unfilled.length - mismatched.length;
          return (
            <div className="space-y-4">
              {/* toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <input type="month" value={auditMonth} onChange={e => setAuditMonth(e.target.value)} className={inputCls} />
                <select value={auditWarehouse} onChange={e => setAuditWarehouse(e.target.value)} className={inputCls}>
                  <option value="">全館</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                <WhQuickBtns value={auditWarehouse} onChange={setAuditWarehouse} />
                <button onClick={fetchAudit} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
                {auditLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
              </div>
              {auditData.length > 0 && (
                <>
                  {/* summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                      <div className="text-xs text-emerald-600 mb-1">付款完整</div>
                      <div className="text-2xl font-bold text-emerald-700">{ok}</div>
                      <div className="text-[10px] text-emerald-400 mt-1">{auditData.length > 0 ? Math.round(ok / auditData.length * 100) : 0}%</div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                      <div className="text-xs text-amber-600 mb-1">未填付款</div>
                      <div className="text-2xl font-bold text-amber-700">{unfilled.length}</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                      <div className="text-xs text-red-600 mb-1">金額不符</div>
                      <div className="text-2xl font-bold text-red-700">{mismatched.length}</div>
                    </div>
                  </div>
                  {/* problem records */}
                  {(unfilled.length > 0 || mismatched.length > 0) && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                        <h4 className="text-sm font-semibold text-red-700">需處理記錄</h4>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-gray-50">
                          <tr className="text-xs text-gray-400 border-b bg-gray-50">
                            <th className="px-4 py-2 text-left font-medium">問題類型</th>
                            <th className="px-4 py-2 text-left font-medium">館別</th>
                            <th className="px-4 py-2 text-left font-medium">姓名</th>
                            <th className="px-4 py-2 text-left font-medium">入住</th>
                            <th className="px-4 py-2 text-right font-medium">房費</th>
                            <th className="px-4 py-2 text-right font-medium">已收</th>
                            <th className="px-4 py-2 text-right font-medium">差額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...unfilled.map(r => ({ ...r, _issue: '未填付款' })), ...mismatched.map(r => ({ ...r, _issue: '金額不符' }))].map(r => {
                            const pay = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
                            const chg = Number(r.roomCharge) + Number(r.otherCharge);
                            return (
                              <tr key={r.id} className="hover:bg-red-50/30">
                                <td className="px-4 py-2">
                                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${r._issue === '未填付款' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>{r._issue}</span>
                                </td>
                                <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                                <td className="px-4 py-2 font-medium text-gray-700">{r.guestName}</td>
                                <td className="px-4 py-2 text-gray-500 text-xs">{r.checkInDate}</td>
                                <td className="px-4 py-2 text-right">{chg.toLocaleString()}</td>
                                <td className="px-4 py-2 text-right text-teal-600">{pay.toLocaleString()}</td>
                                <td className={`px-4 py-2 text-right font-semibold ${Math.abs(pay - chg) > 0.01 ? 'text-red-500' : 'text-gray-300'}`}>
                                  {pay - chg !== 0 ? (pay - chg > 0 ? '+' : '') + Math.round(pay - chg).toLocaleString() : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {unfilled.length === 0 && mismatched.length === 0 && (
                    <div className="text-center py-10 text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100">
                      ✓ {auditMonth} 全部 {auditData.length} 筆付款資料完整，無異常
                    </div>
                  )}
                </>
              )}
              {!auditLoading && auditData.length === 0 && (
                <div className="text-center py-10 text-gray-400">請選擇月份後點擊查詢</div>
              )}
            </div>
          );
        })()}

        {/* ══ Tab: 來源分析 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'sourceAnalysis' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="number" min="2020" max="2035" value={saYear} onChange={e => setSaYear(e.target.value)}
                className={inputCls + ' w-24'} />
              <select value={saWarehouse} onChange={e => setSaWarehouse(e.target.value)} className={inputCls}>
                <option value="">全館</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns value={saWarehouse} onChange={setSaWarehouse} />
              <button onClick={fetchSourceAnalysis} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
              {saLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
            </div>
            {saData && (() => {
              const sources = saData.sources || [];
              const trend   = saData.trend   || [];
              const colors  = ['bg-indigo-400','bg-amber-400','bg-teal-400','bg-rose-400','bg-purple-400','bg-green-400'];
              const maxBookings = Math.max(...sources.map(s => s.bookings), 1);
              return (
                <>
                  {/* KPI */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">總訂房數</div>
                      <div className="text-2xl font-bold text-indigo-600">{saData.totalBookings}</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">總收入</div>
                      <div className="text-2xl font-bold text-emerald-600">NT$ {saData.totalRevenue?.toLocaleString()}</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">來源數</div>
                      <div className="text-2xl font-bold text-teal-600">{sources.length}</div>
                    </div>
                  </div>
                  {/* source breakdown */}
                  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">來源明細</h4>
                    <div className="space-y-3">
                      {sources.map((s, i) => (
                        <div key={s.source} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-700">{s.source}</span>
                            <span className="text-gray-400 text-xs">{s.bookings} 筆 · {s.bookingPct}% · 均 NT${s.avgRevenue?.toLocaleString()} · 均住 {s.avgStay} 晚</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                              <div className={`${colors[i % colors.length]} rounded-full h-2.5 transition-all`} style={{ width: `${Math.round(s.bookings / maxBookings * 100)}%` }} />
                            </div>
                            <span className="text-xs text-emerald-600 w-28 text-right">NT$ {s.revenue?.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* monthly trend table */}
                  {trend.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 tbl-wrap">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">月度趨勢（訂房數）</h4>
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="border-b text-gray-400">
                            <th className="text-left py-1.5 pr-3 font-medium">月份</th>
                            {sources.map(s => <th key={s.source} className="text-right py-1.5 px-2 font-medium">{s.source}</th>)}
                            <th className="text-right py-1.5 pl-2 font-medium text-gray-600">合計</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {trend.map(t => {
                            const total = sources.reduce((sum, s) => sum + (t[s.source] || 0), 0);
                            return (
                              <tr key={t.month} className="hover:bg-gray-50">
                                <td className="py-1.5 pr-3 text-gray-600 font-medium">{t.month}</td>
                                {sources.map(s => (
                                  <td key={s.source} className="py-1.5 px-2 text-right text-indigo-600">{t[s.source] || 0}</td>
                                ))}
                                <td className="py-1.5 pl-2 text-right font-semibold text-gray-700">{total}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ══ Tab: OTA收益分析 ══ */}
        {activeTab === 'analytics' && analyticsSub === 'otaAnalytics' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="number" min="2020" max="2035" value={oaYear} onChange={e => setOaYear(e.target.value)}
                className={inputCls + ' w-24'} />
              <select value={oaWarehouse} onChange={e => setOaWarehouse(e.target.value)} className={inputCls}>
                <option value="">全館</option>
                {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <WhQuickBtns value={oaWarehouse} onChange={setOaWarehouse} />
              <button onClick={fetchOtaAnalytics} className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">查詢</button>
              {oaLoading && <span className="text-xs text-gray-400 animate-pulse">載入中…</span>}
            </div>

            {oaData && (() => {
              const { months, bySource, totals } = oaData;
              return (
                <>
                  {/* 年度 KPI */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">OTA 收入</div>
                      <div className="text-xl font-bold text-indigo-600">NT$ {totals.otaRevenue.toLocaleString()}</div>
                      <div className="text-xs text-gray-400 mt-0.5">佔比 {totals.otaPct}%</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">傭金支出</div>
                      <div className="text-xl font-bold text-rose-600">NT$ {totals.commissionTotal.toLocaleString()}</div>
                      <div className="text-xs text-gray-400 mt-0.5">均率 {totals.avgCommRate}%</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">OTA 淨收入</div>
                      <div className="text-xl font-bold text-emerald-600">NT$ {totals.netOtaRevenue.toLocaleString()}</div>
                      <div className="text-xs text-gray-400 mt-0.5">扣除傭金後</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-1">待付傭金</div>
                      <div className="text-xl font-bold text-amber-600">NT$ {totals.commissionPending.toLocaleString()}</div>
                      <div className="text-xs text-gray-400 mt-0.5">已付 NT$ {totals.commissionPaid.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* 來源分析 */}
                  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4">來源分析（{oaData.year} 年）</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr className="border-b text-gray-400">
                            <th className="text-left py-2 pr-3 font-medium">來源</th>
                            <th className="text-right py-2 px-2 font-medium">訂房</th>
                            <th className="text-right py-2 px-2 font-medium">收入</th>
                            <th className="text-right py-2 px-2 font-medium">傭金</th>
                            <th className="text-right py-2 px-2 font-medium">淨收入</th>
                            <th className="text-right py-2 pl-2 font-medium">傭金率</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {bySource.map(s => (
                            <tr key={s.source} className="hover:bg-gray-50">
                              <td className="py-2 pr-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  s.isOta ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                                }`}>{s.source}</span>
                              </td>
                              <td className="py-2 px-2 text-right text-gray-600">{s.bookings}</td>
                              <td className="py-2 px-2 text-right font-semibold text-gray-800">NT$ {s.revenue.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right text-rose-600">
                                {s.commission > 0 ? `NT$ ${s.commission.toLocaleString()}` : '—'}
                              </td>
                              <td className="py-2 px-2 text-right text-emerald-600 font-semibold">NT$ {s.netRevenue.toLocaleString()}</td>
                              <td className="py-2 pl-2 text-right text-gray-500">
                                {s.isOta && s.commissionRate > 0 ? `${s.commissionRate}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 月度趨勢 */}
                  <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100 tbl-wrap">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">月度 OTA 收益趨勢</h4>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-white">
                        <tr className="border-b text-gray-400">
                          <th className="text-left py-1.5 pr-3 font-medium">月份</th>
                          <th className="text-right py-1.5 px-2 font-medium">OTA訂</th>
                          <th className="text-right py-1.5 px-2 font-medium">OTA收入</th>
                          <th className="text-right py-1.5 px-2 font-medium">傭金</th>
                          <th className="text-right py-1.5 px-2 font-medium">待付</th>
                          <th className="text-right py-1.5 px-2 font-medium">OTA淨收</th>
                          <th className="text-right py-1.5 pl-2 font-medium text-gray-600">傭金率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {months.filter(m => m.totalBookings > 0 || m.commissionTotal > 0).map(m => (
                          <tr key={m.month} className="hover:bg-gray-50">
                            <td className="py-1.5 pr-3 text-gray-600 font-medium">{m.month}</td>
                            <td className="py-1.5 px-2 text-right text-indigo-600">{m.otaBookings}</td>
                            <td className="py-1.5 px-2 text-right font-semibold text-gray-700">
                              {m.otaRevenue > 0 ? `NT$ ${m.otaRevenue.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-rose-600">
                              {m.commissionTotal > 0 ? `NT$ ${m.commissionTotal.toLocaleString()}` : '—'}
                            </td>
                            <td className={`py-1.5 px-2 text-right ${m.commissionPending > 0 ? 'text-amber-600 font-semibold' : 'text-gray-300'}`}>
                              {m.commissionPending > 0 ? `NT$ ${m.commissionPending.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-right text-emerald-600 font-semibold">
                              {m.netOtaRevenue !== 0 ? `NT$ ${m.netOtaRevenue.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-1.5 pl-2 text-right text-gray-500">
                              {m.effectiveCommRate > 0 ? `${m.effectiveCommRate}%` : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="py-2 pr-3 text-gray-700">合計</td>
                          <td className="py-2 px-2 text-right text-indigo-700">{totals.otaBookings}</td>
                          <td className="py-2 px-2 text-right text-gray-800">NT$ {totals.otaRevenue.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-rose-700">NT$ {totals.commissionTotal.toLocaleString()}</td>
                          <td className={`py-2 px-2 text-right ${totals.commissionPending > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                            {totals.commissionPending > 0 ? `NT$ ${totals.commissionPending.toLocaleString()}` : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-700">NT$ {totals.netOtaRevenue.toLocaleString()}</td>
                          <td className="py-2 pl-2 text-right text-gray-600">{totals.avgCommRate}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ══ Tab: 房客歷史 ══ */}
        {activeTab === 'guestHistory' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input type="text" value={ghSearch} onChange={e => setGhSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchGuestHistory()}
                placeholder="輸入房客姓名搜尋…" className={inputCls + ' flex-1 max-w-xs'} />
              <button onClick={fetchGuestHistory} disabled={ghLoading}
                className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {ghLoading ? '搜尋中…' : '搜尋'}
              </button>
            </div>
            {ghSearched && !ghLoading && (
              ghData.length === 0 ? (
                <div className="text-center py-10 text-gray-400">找不到「{ghSearch}」的訂房記錄</div>
              ) : (
                <>
                  {/* summary for this guest */}
                  {(() => {
                    const nonDel = ghData.filter(r => r.status !== '已刪除');
                    const rev    = nonDel.reduce((s, r) => s + Number(r.roomCharge) + Number(r.otherCharge), 0);
                    const nights = nonDel.reduce((s, r) => s + Math.max(0, Math.round((new Date(r.checkOutDate) - new Date(r.checkInDate)) / 86400000)), 0);
                    return (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                          <div className="text-xs text-gray-400 mb-1">入住次數</div>
                          <div className="text-2xl font-bold text-indigo-600">{nonDel.length}</div>
                        </div>
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                          <div className="text-xs text-gray-400 mb-1">總住宿天數</div>
                          <div className="text-2xl font-bold text-teal-600">{nights} 晚</div>
                        </div>
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                          <div className="text-xs text-gray-400 mb-1">消費總額</div>
                          <div className="text-2xl font-bold text-emerald-600">NT$ {rev.toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr className="bg-gray-50 text-xs text-gray-400 border-b">
                          <th className="px-4 py-2 text-left font-medium">入住月</th>
                          <th className="px-4 py-2 text-left font-medium">館別</th>
                          <th className="px-4 py-2 text-left font-medium">房號</th>
                          <th className="px-4 py-2 text-left font-medium">入住日</th>
                          <th className="px-4 py-2 text-left font-medium">退房日</th>
                          <th className="px-4 py-2 text-right font-medium">房費</th>
                          <th className="px-4 py-2 text-left font-medium">來源</th>
                          <th className="px-4 py-2 text-left font-medium">狀態</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {ghData.map(r => (
                          <tr key={r.id} className={`hover:bg-gray-50 ${r.status === '已刪除' ? 'opacity-40' : ''}`}>
                            <td className="px-4 py-2 text-gray-500 text-xs">{r.importMonth}</td>
                            <td className="px-4 py-2 text-gray-400 text-xs">{r.warehouse}</td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{r.roomNo || '—'}</td>
                            <td className="px-4 py-2 text-gray-700">{r.checkInDate}</td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{r.checkOutDate}</td>
                            <td className="px-4 py-2 text-right font-medium text-emerald-600">
                              NT$ {(Number(r.roomCharge) + Number(r.otherCharge)).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-500">{r.source}</td>
                            <td className="px-4 py-2">
                              <span className={`text-[11px] px-1.5 py-0.5 rounded ${getStatusColor(r.status)}`}>{r.status || '—'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}
            {!ghSearched && <div className="text-center py-10 text-gray-300">輸入房客姓名後按 Enter 或點擊搜尋</div>}
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

      {/* 編輯訂房 Modal（含 OTA 比對新增/編輯） */}
      {editBooking && (
        <BookingFormModal
          record={editBooking}
          warehouseList={warehouseList}
          onClose={() => setEditBooking(null)}
          onSaved={() => {
            setEditBooking(null);
            fetchRecords();
            if (activeTab === 'otaReconcile' && otaResult) runOtaReconcile();
          }}
        />
      )}

      {/* 新增訂房 Modal */}
      {addBookingOpen && (
        <BookingFormModal
          record={null}
          warehouseList={warehouseList}
          onClose={() => setAddBookingOpen(false)}
          onSaved={() => { setAddBookingOpen(false); fetchRecords(); }}
        />
      )}

      {/* ══ 存簿比對：標記跳過 Modal ══ */}
      {dmMarkModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setDmMarkModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-[340px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-2">
              {dmMarkModal.skipType === 'next_month' ? '標記為跨月入帳' : '標記為無需配對'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {dmMarkModal.skipType === 'next_month'
                ? '此筆款項下月才入帳存簿，本月暫不配對。'
                : '此筆款項為現金收帳或已另行處理，不需存簿配對。'}
            </p>
            <div className="mb-5">
              <label className="block text-xs text-gray-500 mb-1">備註（選填）</label>
              <input
                type="text"
                value={dmMarkNote}
                onChange={e => setDmMarkNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleMark()}
                placeholder="說明原因…"
                maxLength={255}
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDmMarkModal(null); setDmMarkNote(''); }}
                className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={handleMark}
                className={`px-4 py-1.5 text-sm rounded-lg text-white ${dmMarkModal.skipType === 'next_month' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-600 hover:bg-gray-700'}`}>
                確認標記
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 存簿對帳單匯入 Modal ══ */}
      {showBankImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBankImport(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">↑ 匯入存簿對帳單</h3>
              <button onClick={() => setShowBankImport(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
              {/* 說明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-medium mb-1">📥 土地銀行網路銀行下載步驟</p>
                <ol className="list-decimal ml-4 space-y-0.5 text-xs">
                  <li>登入土地銀行網銀 → 帳戶管理 → 存款交易明細</li>
                  <li>選擇帳戶（土海）、月份區間</li>
                  <li>點「匯出 Excel」下載 .xls 檔</li>
                  <li>上傳至此處即可</li>
                </ol>
              </div>

              {/* 匯入月份/帳戶 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">月份</label>
                  <input type="month" value={dmMonth} onChange={e => setDmMonth(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">存簿帳戶 *</label>
                  <select value={dmAccountId} onChange={e => setDmAccountId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm">
                    <option value="">請選擇帳戶</option>
                    {dmAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 檔案選擇 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">選擇檔案（.xls / .xlsx / .csv）</label>
                <input type="file" accept=".xls,.xlsx,.csv"
                  onChange={handleBankFileUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                {bankImportParsing && <p className="text-xs text-blue-500 mt-1">解析中…</p>}
                {bankImportError && <p className="text-xs text-red-500 mt-1">{bankImportError}</p>}
              </div>

              {/* 解析預覽 */}
              {bankImportLines.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    預覽：共 {bankImportLines.length} 筆
                    （存入 {bankImportLines.filter(l => l.creditAmount > 0).length} 筆 /
                    支出 {bankImportLines.filter(l => l.debitAmount > 0).length} 筆）
                  </p>
                  <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">日期</th>
                          <th className="px-3 py-2 text-left">說明</th>
                          <th className="px-3 py-2 text-right text-green-700">存入</th>
                          <th className="px-3 py-2 text-right text-red-600">支出</th>
                          <th className="px-3 py-2 text-right">餘額</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {bankImportLines.map((l, i) => (
                          <tr key={i} className={l.creditAmount > 0 ? 'bg-green-50/30' : ''}>
                            <td className="px-3 py-1.5 whitespace-nowrap">{l.txDate}</td>
                            <td className="px-3 py-1.5 max-w-[200px] truncate" title={l.description}>{l.description}</td>
                            <td className="px-3 py-1.5 text-right text-green-700">{l.creditAmount > 0 ? l.creditAmount.toLocaleString() : ''}</td>
                            <td className="px-3 py-1.5 text-right text-red-600">{l.debitAmount > 0 ? l.debitAmount.toLocaleString() : ''}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">{l.runningBalance ? l.runningBalance.toLocaleString() : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowBankImport(false)}
                className="px-4 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300">取消</button>
              <button onClick={submitBankImport}
                disabled={bankImportLines.length === 0 || !dmAccountId || bankImportSubmitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {bankImportSubmitting ? '匯入中…' : bankImportLines.length === 0 ? '請先上傳檔案' : !dmAccountId ? '請選擇帳戶' : `確認匯入 ${bankImportLines.length} 筆`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
