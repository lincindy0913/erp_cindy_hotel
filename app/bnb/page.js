'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
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
  { key: 'otaCommission', label: 'OTA傭金' },
  { key: 'bossWithdraw', label: '老闆收取' },
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
  const cardFee   = (Number(form.payCard) * Number(form.cardFeeRate)).toFixed(0);
  const total     = Number(form.payDeposit) + Number(form.payCard) + Number(form.payCash) + Number(form.payVoucher);
  const hasDeposit = Number(form.payDeposit) > 0;
  const hasCard    = Number(form.payCard) > 0;
  const hasCash    = Number(form.payCash) > 0;

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

// ── 訂房新增 / 編輯 Modal ────────────────────────────────────────
function BookingFormModal({ record, onClose, onSaved, warehouseList }) {
  const { showToast } = useToast();
  const isEdit = !!record;
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
const PAY_FIELDS = ['payDeposit', 'depositDate', 'depositLast5', 'payCard', 'payCash', 'payVoucher'];

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
  const [filterSource,    setFilterSource]    = useState('');
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterPayment, setFilterPayment] = useState(''); // '' | 'unfilled' | 'filled'
  const [editRecord,    setEditRecord]    = useState(null); // PaymentModal
  const [editBooking,   setEditBooking]   = useState(null); // BookingFormModal (edit)
  const [addBookingOpen,setAddBookingOpen]= useState(false); // BookingFormModal (add)

  // ── 老闆收取 state ────────────────────────────────────────────
  const [bwData,      setBwData]      = useState(null);
  const [bwLoading,   setBwLoading]   = useState(false);
  const [bwMonth,     setBwMonth]     = useState(() => new Date().toISOString().slice(0, 7));
  const [bwWarehouse, setBwWarehouse] = useState('');

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
  const [importWarehouse, setImportWarehouse] = useState(DEFAULT_WAREHOUSE);
  const [importReplace, setImportReplace] = useState(true);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);

  // ── 每日收入 state ──────────────────────────────────────────
  const [drMonth,      setDrMonth]      = useState(() => new Date().toISOString().slice(0, 7));
  const [drWarehouse,  setDrWarehouse]  = useState(DEFAULT_WAREHOUSE);
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
  const [otaViewTab,   setOtaViewTab]   = useState('matched'); // matched | unmatchedOta | unmatchedBnb | cancelled
  // OTA 傭金確認
  const [commAmt,        setCommAmt]        = useState('');
  const [commMethod,     setCommMethod]     = useState('轉帳');
  const [commNote,       setCommNote]       = useState('');
  const [commSubmitting, setCommSubmitting] = useState(false);
  const [commExisting,   setCommExisting]   = useState(null);  // { exists, record, orderStatus }
  // OTA 傭金歷史列表
  const [commHistRows,   setCommHistRows]   = useState([]);
  const [commHistLoading,setCommHistLoading]= useState(false);
  // OTA 比對記錄 (reconcile log)
  const [reconLogs,      setReconLogs]      = useState([]);
  const [reconLogsLoading, setReconLogsLoading] = useState(false);

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
      case 'import':      return { month: importMonth, warehouse: importWarehouse };
      case 'declaration': return { month: declMonth,   warehouse: declWarehouse };
      case 'deposit':     return { month: dmMonth,     warehouse: dmWarehouse || DEFAULT_WAREHOUSE };
      default:            return { month: filterMonth,  warehouse: DEFAULT_WAREHOUSE };
    }
  }, [activeTab, filterMonth, importMonth, importWarehouse, declMonth, declWarehouse, dmMonth, dmWarehouse]);

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
      if (filterSource)    p.set('source', filterSource);
      if (filterStatus)    p.set('status', filterStatus);
      if (filterWarehouse) p.set('warehouse', filterWarehouse);
      const res = await fetch(`/api/bnb?${p}`);
      if (!res.ok) { showToast('載入訂房記錄失敗', 'error'); return; }
      setRecords(await res.json());
    } catch { showToast('載入訂房記錄失敗', 'error'); }
    finally { setRecLoading(false); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);

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

  // OTA 傭金：送出應付款
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
      if (!res.ok) { showToast(data.message || '送出失敗', 'error'); return; }
      showToast(`傭金已送出出納（${data.orderNo}）`, 'success');
      // 重新查狀態
      const p = new URLSearchParams({ month, source: otaSource, warehouse: otaWarehouse || DEFAULT_WAREHOUSE });
      const chk = await fetch(`/api/bnb/ota-commission?${p}`);
      if (chk.ok) setCommExisting(await chk.json());
    } catch { showToast('送出失敗', 'error'); }
    finally { setCommSubmitting(false); }
  }, [otaResult, commAmt, commMethod, commNote, otaSource, otaDateFrom, otaWarehouse]);

  // OTA 傭金：取消
  const cancelCommission = useCallback(async (id) => {
    if (!confirm('確定要取消此傭金應付款嗎？出納端的待付款單也會一同取消。')) return;
    try {
      const res = await fetch(`/api/bnb/ota-commission?id=${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.message || '取消失敗', 'error'); return; }
      showToast('已取消傭金應付款', 'success');
      const month = otaDateFrom ? otaDateFrom.substring(0, 7) : new Date().toISOString().substring(0, 7);
      const p = new URLSearchParams({ month, source: otaSource, warehouse: otaWarehouse || DEFAULT_WAREHOUSE });
      const chk = await fetch(`/api/bnb/ota-commission?${p}`);
      if (chk.ok) setCommExisting(await chk.json());
    } catch { showToast('取消失敗', 'error'); }
  }, [otaSource, otaDateFrom, otaWarehouse]);

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
    if (activeTab === 'dailyRev')    fetchDailyRevenue();
    if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary();
    if (activeTab === 'declaration') { setDeclSearched(false); setDeclActual(null); }
    if (activeTab === 'declList')    fetchDeclList();
    if (activeTab === 'deposit' && dmAccountId) fetchDepositMatch();
    if (activeTab === 'otaCommission') { fetchCommHistory(); fetchReconLogs(); }
    if (activeTab === 'bossWithdraw')  fetchBossWithdraw();
  }, [activeTab]);

  useEffect(() => {
    const ctx = getActiveLockContext();
    fetchLockStatus(ctx.month, ctx.warehouse);
  }, [activeTab, filterMonth, importMonth, importWarehouse, declMonth, declWarehouse, dmMonth, dmWarehouse]);

  useEffect(() => {
    if (activeTab === 'records') { setSelectedIds(new Set()); fetchRecords(); }
  }, [filterMonth, filterSource, filterStatus, filterWarehouse]);
  useEffect(() => { if (activeTab === 'monthly' || activeTab === 'pnl') fetchSummary(); }, [summaryYear]);
  useEffect(() => { if (activeTab === 'declList') fetchDeclList(); }, [dlYear, dlWarehouse]);
  useEffect(() => { if (activeTab === 'bossWithdraw') fetchBossWithdraw(); }, [bwMonth, bwWarehouse]);

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
    const isText = ['depositLast5', 'note', 'roomNo'].includes(field);
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

  // ── 月底批次鎖帳（全部已填付款）────────────────────────────────
  async function lockAllFilled() {
    const eligible = records.filter(r => r.paymentFilled && !r.paymentLocked && r.status !== '已刪除');
    if (eligible.length === 0) {
      showToast('無可鎖定的記錄（已全部鎖帳或無已填付款記錄）', 'error');
      return;
    }
    const mismatchList = eligible.filter(r => {
      const pt = Number(r.payDeposit) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
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
    acc.locked   += r.paymentLocked ? 1 : 0;
    const pt = Number(r.payDeposit) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
    const ct = Number(r.roomCharge) + Number(r.otherCharge);
    if (r.paymentFilled && Math.abs(pt - ct) > 0.01) acc.mismatch++;
    return acc;
  }, { rooms: 0, revenue: 0, deposit: 0, card: 0, cash: 0, voucher: 0, cardFee: 0, unfilled: 0, locked: 0, mismatch: 0 });

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
              </div>
              <button onClick={fetchRecords} className={`${btnCls} bg-indigo-50 text-indigo-700`}>查詢</button>
              <button onClick={() => setAddBookingOpen(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
                + 新增訂房
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

            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
              {[
                { label: '筆數', val: recStats.rooms },
                { label: '房費+消費', val: NT(recStats.revenue) },
                { label: '訂金匯款', val: NT(recStats.deposit) },
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
                      <tr><td colSpan={18} className="text-center py-10 text-gray-400">
                        {filterPayment ? `無${filterPayment === 'filled' ? '已填付款' : '未填付款'}記錄` : '無資料'}
                      </td></tr>
                    )}
                    {visibleRecords.map(r => {
                      const isSelected      = selectedIds.has(r.id);
                      const isDeleted       = r.status === '已刪除';
                      const isLocked        = !!r.paymentLocked;
                      const inExcelMode     = editMode && !isDeleted && !isLocked;
                      const isDirty         = dirtyIds.has(r.id);
                      const isOverdueUnpaid = !isDeleted && r.status === '已退房' && !r.paymentFilled && r.checkOutDate && r.checkOutDate < today;
                      const payTotal        = Number(r.payDeposit) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
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

                      return (
                        <tr key={r.id} className={`
                          ${isSelected ? 'bg-amber-50' : isLocked ? 'bg-slate-50' : paymentMismatch ? 'bg-orange-50' : isOverdueUnpaid ? 'bg-red-50' : 'hover:bg-gray-50'}
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
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkInDate}</td>
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{r.checkOutDate}</td>
                          <td className={`px-3 py-2 text-right ${paymentMismatch ? 'text-red-600' : ''}`}>
                            {Number(r.roomCharge).toLocaleString()}
                            {paymentMismatch && (
                              <div className="text-[10px] text-red-500 whitespace-nowrap" title={`收款合計 ${payTotal.toLocaleString()} ≠ 房費+消費 ${chargeTotal.toLocaleString()}`}>
                                差 {(payTotal - chargeTotal) > 0 ? '+' : ''}{(payTotal - chargeTotal).toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{Number(r.otherCharge) > 0 ? Number(r.otherCharge).toLocaleString() : '—'}</td>

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
                              const depVal = Number(r.payDeposit);
                              return (
                                <div>
                                  <span
                                    onClick={() => { if (!isDeleted && !isLocked && !editMode) setEditRecord(r); }}
                                    className={`${!isLocked && !editMode ? 'cursor-pointer hover:underline hover:text-indigo-600' : ''} text-blue-600 ${depVal > 0 ? '' : 'text-gray-300'}`}
                                    title={isLocked ? '已鎖帳' : editMode ? '' : '點擊開啟付款明細'}>
                                    {depVal > 0 ? depVal.toLocaleString() : '—'}
                                  </span>
                                  {r.depositLast5 && <div className="text-[10px] text-blue-300 font-mono">{r.depositLast5}</div>}
                                  {r.depositDate && <div className="text-[10px] text-blue-300">{r.depositDate}</div>}
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
                            <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
                            {isLocked && <span className="ml-1 text-[10px] text-slate-400" title={`鎖帳：${r.paymentLockedBy || ''}`}>🔒</span>}
                            {!r.paymentFilled && !isDeleted && !isLocked && (
                              <span className="ml-1 text-[10px] text-amber-500">未填</span>
                            )}
                            {paymentMismatch && (
                              <span className="ml-1 text-[10px] text-red-500" title={`收款 ${payTotal.toLocaleString()} ≠ 費用 ${chargeTotal.toLocaleString()}`}>金額不符</span>
                            )}
                          </td>

                          {/* 備註（點擊 inline 編輯） */}
                          <td className="px-3 py-2">{noteCell()}</td>

                          {/* 操作欄（非 Excel 模式才顯示） */}
                          {!editMode && (
                            <td className="px-3 py-2 whitespace-nowrap">
                              {isLocked ? (
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
                                    title="刪除此筆訂房"
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
                    ? <option value={DEFAULT_WAREHOUSE}>{DEFAULT_WAREHOUSE}</option>
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
                    ? <option value={DEFAULT_WAREHOUSE}>{DEFAULT_WAREHOUSE}</option>
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
                      {['月份','間數','住宿房費','其他消費','訂金匯款','刷卡','現金','住宿卷','手續費','淨收入','鎖帳'].map(h => (
                        <th key={h} className="px-3 py-2 text-right first:text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-10 text-gray-400">無資料</td></tr>
                    )}
                    {summaryRows.map(r => {
                      const lockRatio = r.rooms > 0 ? (r.lockedCount || 0) / r.rooms : 0;
                      const lockColor = lockRatio === 1 ? 'text-green-600 font-semibold' : lockRatio > 0 ? 'text-amber-600' : 'text-gray-300';
                      return (
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

        {/* ══ Tab: 月收支總表 ══ */}
        {activeTab === 'pnl' && (
          <div>
            {(() => {
              const pnlData = summaryRows.map(r => ({
                ...r,
                incomeTotal:  r.netRevenue + (r.otherIncome || 0),
                pnlNetProfit: r.netProfit,
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
                            {Number(r.netProfit).toLocaleString()}
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
                    ? <option value={DEFAULT_WAREHOUSE}>{DEFAULT_WAREHOUSE}</option>
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
                          ['每月間數（筆數）', declActual.roomCount,                  'text-gray-800'],
                          ['住宿間數（晚）',   declActual.roomNights,                 'text-teal-700'],
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
                  ? <option value={DEFAULT_WAREHOUSE}>{DEFAULT_WAREHOUSE}</option>
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
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
                  <>
                    <button onClick={handleAutoMatch} disabled={dmMatching || !(dmData?.suggestions?.length) || isLocked}
                      className={`${btnCls} bg-amber-50 text-amber-700 disabled:opacity-40`}>
                      ⚡ 自動配對{dmData?.suggestions?.length ? `（${dmData.suggestions.length}筆）` : ''}
                    </button>
                    <ExportButtons
                      data={(dmData?.bnbRecords || []).map(r => ({
                        ...r,
                        matchStatus: r.depositBankLineId ? '已配對' : '未配對',
                        matchedBy: r.depositMatchedBy || '',
                      }))}
                      columns={[
                        { header: '姓名',   key: 'guestName' },
                        { header: '入住',   key: 'checkInDate' },
                        { header: '退房',   key: 'checkOutDate' },
                        { header: '訂金',   key: 'payDeposit',  format: 'number' },
                        { header: '匯款日期', key: 'depositDate' },
                        { header: '後五碼',  key: 'depositLast5' },
                        { header: '配對狀態', key: 'matchStatus' },
                        { header: '配對者',  key: 'matchedBy' },
                      ]}
                      filename={`訂金核對_${dmMonth}`}
                      title={`訂金核對 ${dmMonth}`}
                    />
                  </>
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
                  <option value="Agoda" disabled>Agoda（尚未支援）</option>
                  <option value="Expedia" disabled>Expedia（尚未支援）</option>
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

                  {/* 傭金確認送出 */}
                  <div className="bg-white rounded-xl shadow p-4 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-semibold text-gray-700 text-sm">確認傭金 → 送出出納待付款</span>
                      {commExisting?.exists && commExisting.record?.status !== '已取消' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          commExisting.orderStatus?.status === '已付款' ? 'bg-green-100 text-green-700'
                          : commExisting.orderStatus?.status === '已取消' ? 'bg-gray-100 text-gray-500'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {commExisting.orderStatus?.status === '已付款' ? '已付款' : '待出納中'} — {commExisting.orderStatus?.orderNo}
                        </span>
                      )}
                    </div>
                    {commExisting?.exists && commExisting.record?.status !== '已取消' ? (
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                        <span>金額：<strong className="text-gray-800">NT$ {Number(commExisting.record.commissionAmount).toLocaleString()}</strong></span>
                        <span>付款方式：{commExisting.record.paymentMethod}</span>
                        <span>廠商：{commExisting.record.supplierName}</span>
                        {commExisting.record.note && <span>備註：{commExisting.record.note}</span>}
                        {commExisting.record.status === '待出納' && (
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
                          className="px-5 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                          {commSubmitting ? '送出中…' : '送出出納待付款'}
                        </button>
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

        {/* ══ Tab: OTA傭金 ══ */}
        {activeTab === 'otaCommission' && (
          <div>
            <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select className="border rounded-lg px-3 py-1.5 text-sm"
                  value={otaWarehouse} onChange={e => setOtaWarehouse(e.target.value)}>
                  <option value="">全部</option>
                  {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
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

            <div className="bg-white rounded-xl shadow overflow-x-auto">
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
                    const statusColor = r.status === '已取消' ? 'bg-gray-100 text-gray-400'
                      : r.status === '待出納' ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700';
                    const poColor = !r.paymentOrder ? ''
                      : r.paymentOrder.status === '已付款' ? 'text-green-600 font-semibold'
                      : r.paymentOrder.status === '已取消' ? 'text-gray-400 line-through'
                      : 'text-amber-600';
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 ${r.status === '已取消' ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{r.commissionMonth}</td>
                        <td className="px-3 py-2.5">{r.otaSource}</td>
                        <td className="px-3 py-2.5 text-gray-500">{r.warehouse}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                          NT$ {r.commissionAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">{r.paymentMethod}</td>
                        <td className="px-3 py-2.5 text-gray-600">{r.supplierName || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-center text-sm ${poColor}`}>
                          {r.paymentOrder?.status || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono text-gray-400">
                          {r.paymentOrder?.orderNo || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{r.confirmedBy || '—'}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[140px] truncate"
                          title={r.note}>{r.note || '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          {r.status === '待出納' && (
                            <button onClick={() => cancelCommission(r.id)}
                              className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100">
                              取消
                            </button>
                          )}
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
              <div className="bg-white rounded-xl shadow overflow-x-auto">
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
            {/* 篩選列 */}
            <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">月份</label>
                <input type="month" value={bwMonth} onChange={e => setBwMonth(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">館別</label>
                <select value={bwWarehouse} onChange={e => setBwWarehouse(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none">
                  <option value="">全部</option>
                  {(warehouseList || [DEFAULT_WAREHOUSE]).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <button onClick={fetchBossWithdraw}
                className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                查詢
              </button>
              {bwData && (
                <div className="ml-auto text-sm text-gray-500">
                  共 <span className="font-semibold text-gray-800">{(bwData.rows || []).length}</span> 筆，
                  合計 <span className="font-bold text-orange-600">NT${Number(bwData.total || 0).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* 列表 */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              {bwLoading ? (
                <div className="text-center py-10 text-gray-400">載入中…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-orange-50 text-orange-800 text-xs">
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
                        <td className="px-4 py-2 text-right font-semibold text-orange-600">
                          NT${Number(r.amount).toLocaleString()}
                        </td>
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

      {/* 編輯訂房 Modal */}
      {editBooking && (
        <BookingFormModal
          record={editBooking}
          warehouseList={warehouseList}
          onClose={() => setEditBooking(null)}
          onSaved={() => { setEditBooking(null); fetchRecords(); }}
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
    </div>
  );
}
