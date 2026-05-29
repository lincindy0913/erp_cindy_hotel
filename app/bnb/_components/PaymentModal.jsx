'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';

export default function PaymentModal({ record, onClose, onSaved }) {
  const { showToast } = useToast();

  // 預設刷卡入帳日 = 退房日 + 1 天
  const defaultCardSettlement = (() => {
    if (record.cardSettlementDate) return record.cardSettlementDate;
    if (record.checkOutDate) {
      const [y, m, day] = record.checkOutDate.split('-').map(Number);
      const next = new Date(y, m - 1, day + 1);
      const pad = n => String(n).padStart(2, '0');
      return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
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
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);
  const cardFee    = Math.round(Number(form.payCard) * Number(form.cardFeeRate));
  const total      = Number(form.payDeposit) + Number(form.payTransfer) + Number(form.payCard) + Number(form.payCash) + Number(form.payVoucher);
  const expected   = Number(record.roomCharge) + Number(record.otherCharge);
  const hasMismatch = total > 0 && Math.abs(total - expected) > 0.01;
  const hasDeposit  = Number(form.payDeposit)  > 0;
  const hasTransfer = Number(form.payTransfer) > 0;
  const hasCard     = Number(form.payCard)     > 0;
  const hasCash     = Number(form.payCash)     > 0;
  useEffect(() => { setMismatchConfirmed(false); }, [total]);

  async function handleSave() {
    if (hasMismatch && !mismatchConfirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bnb/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cardFeeRate: parseFloat(form.cardFeeRate),
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
      if (form.cashDestination === '老闆收取') showToast('現金已標記為老闆收取，記得到「老闆收取」分頁確認', 'info');
      if (form.cashDestination === '存帳')     showToast('現金已標記為存帳，記得到「老闆收取」分頁確認', 'info');
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
            <label htmlFor="pm-payDeposit" className="w-24 text-sm text-gray-600 shrink-0">訂金匯款</label>
            <input id="pm-payDeposit" type="number" min="0" value={form.payDeposit}
              onChange={e => setForm(p => ({ ...p, payDeposit: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasDeposit && (
            <div className="ml-2 pl-4 border-l-2 border-blue-200 space-y-2">
              <div className="flex items-center gap-3">
                <label htmlFor="pm-depositDate" className="w-20 text-xs text-blue-600 shrink-0">匯款日期</label>
                <input id="pm-depositDate" type="date" value={form.depositDate}
                  onChange={e => setForm(p => ({ ...p, depositDate: e.target.value }))}
                  className="flex-1 border border-blue-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="pm-depositLast5" className="w-20 text-xs text-blue-600 shrink-0">帳號後五碼</label>
                <input id="pm-depositLast5" type="text" maxLength={5} placeholder="例：12345" value={form.depositLast5}
                  onChange={e => setForm(p => ({ ...p, depositLast5: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                  className="w-28 border border-blue-200 rounded-lg px-3 py-1.5 text-sm tracking-widest focus:ring-2 focus:ring-blue-300 outline-none" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label htmlFor="pm-payTransfer" className="w-24 text-sm text-gray-600 shrink-0">當天匯款</label>
            <input id="pm-payTransfer" type="number" min="0" value={form.payTransfer}
              onChange={e => setForm(p => ({ ...p, payTransfer: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasTransfer && (
            <div className="ml-2 pl-4 border-l-2 border-teal-200 space-y-2">
              <div className="flex items-center gap-3">
                <label htmlFor="pm-transferDate" className="w-20 text-xs text-teal-600 shrink-0">匯款日期</label>
                <input id="pm-transferDate" type="date" value={form.transferDate}
                  onChange={e => setForm(p => ({ ...p, transferDate: e.target.value }))}
                  className="flex-1 border border-teal-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-teal-300 outline-none" />
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="pm-transferLast5" className="w-20 text-xs text-teal-600 shrink-0">帳號後五碼</label>
                <input id="pm-transferLast5" type="text" maxLength={5} placeholder="例：12345" value={form.transferLast5}
                  onChange={e => setForm(p => ({ ...p, transferLast5: e.target.value.replace(/[^0-9]/g, '').slice(0, 5) }))}
                  className="w-28 border border-teal-200 rounded-lg px-3 py-1.5 text-sm tracking-widest focus:ring-2 focus:ring-teal-300 outline-none" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label htmlFor="pm-payCard" className="w-24 text-sm text-gray-600 shrink-0">刷卡金額</label>
            <input id="pm-payCard" type="number" min="0" value={form.payCard}
              onChange={e => setForm(p => ({ ...p, payCard: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {hasCard && (
            <div className="ml-2 pl-4 border-l-2 border-purple-200 space-y-2">
              <div className="flex items-center gap-3">
                <label htmlFor="pm-cardSettlementDate" className="w-20 text-xs text-purple-600 shrink-0">刷卡入帳日</label>
                <input id="pm-cardSettlementDate" type="date" value={form.cardSettlementDate}
                  onChange={e => setForm(p => ({ ...p, cardSettlementDate: e.target.value }))}
                  className="flex-1 border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-300 outline-none" />
                <span className="text-xs text-purple-400 whitespace-nowrap">刷卡後1-2天入帳</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <label htmlFor="pm-payCash" className="w-24 text-sm text-gray-600 shrink-0">現金</label>
            <input id="pm-payCash" type="number" min="0" value={form.payCash}
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
                  <label htmlFor="pm-cashDepositDate" className="w-20 text-xs text-green-600 shrink-0">存款日期</label>
                  <input id="pm-cashDepositDate" type="date" value={form.cashDepositDate}
                    onChange={e => setForm(p => ({ ...p, cashDepositDate: e.target.value }))}
                    className="flex-1 border border-green-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-300 outline-none" />
                </div>
              )}
              {form.cashDestination === '老闆收取' && (
                <div className="flex items-center gap-3">
                  <label htmlFor="pm-bossWithdrawNote" className="w-20 text-xs text-green-600 shrink-0">收取備註</label>
                  <input id="pm-bossWithdrawNote" type="text" value={form.bossWithdrawNote}
                    onChange={e => setForm(p => ({ ...p, bossWithdrawNote: e.target.value }))}
                    placeholder="選填，例：老闆 4/15 收"
                    className="flex-1 border border-green-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-300 outline-none" />
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <label htmlFor="pm-payVoucher" className="w-24 text-sm text-gray-600 shrink-0">住宿卷</label>
            <input id="pm-payVoucher" type="number" min="0" value={form.payVoucher}
              onChange={e => setForm(p => ({ ...p, payVoucher: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="pm-cardFeeRate" className="w-24 text-sm text-gray-600 shrink-0">手續費率</label>
            <input id="pm-cardFeeRate" type="number" step="0.0001" min="0" max="1" value={form.cardFeeRate}
              onChange={e => setForm(p => ({ ...p, cardFeeRate: e.target.value }))}
              className="w-28 border rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-xs text-gray-400">手續費 NT${cardFee.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="pm-note" className="w-24 text-sm text-gray-600 shrink-0">備註</label>
            <input id="pm-note" type="text" value={form.note}
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
          {hasMismatch && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
              <p className="text-xs text-red-600 font-medium">⚠ 收款合計與房費+消費（NT${expected.toLocaleString()}）不符，差額 {(total - expected) > 0 ? '+' : ''}NT${Math.abs(total - expected).toLocaleString()}</p>
              <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer select-none">
                <input type="checkbox" checked={mismatchConfirmed} onChange={e => setMismatchConfirmed(e.target.checked)} />
                我已確認差額，仍要儲存
              </label>
            </div>
          )}
        </div>
        <div className="p-4 flex gap-2 justify-end border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">取消</button>
          <button onClick={handleSave} disabled={saving || (hasMismatch && !mismatchConfirmed)}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
