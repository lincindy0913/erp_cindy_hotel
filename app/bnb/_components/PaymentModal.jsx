'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';

const TAB_DEF = [
  { key: 'transfer', label: '匯款', color: 'blue' },
  { key: 'card',     label: '刷卡', color: 'purple' },
  { key: 'cash',     label: '現金/其他', color: 'green' },
];

const TAB_CLS = {
  blue:   { active: 'border-b-2 border-blue-500 text-blue-700 font-semibold', dot: 'bg-blue-500' },
  purple: { active: 'border-b-2 border-purple-500 text-purple-700 font-semibold', dot: 'bg-purple-500' },
  green:  { active: 'border-b-2 border-green-500 text-green-700 font-semibold', dot: 'bg-green-500' },
};

const inp = 'flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 outline-none';
const label = 'w-24 text-sm text-gray-600 shrink-0';
const subLabel = 'w-20 text-xs shrink-0';
const row = 'flex items-center gap-3';
const subRow = 'flex items-center gap-3';
const subSection = (color) => `ml-2 pl-4 border-l-2 border-${color}-200 space-y-2`;

export default function PaymentModal({ record, onClose, onSaved }) {
  const { showToast } = useToast();
  const [tab, setTab] = useState('transfer');

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
    cardFeeRate:        record.cardFeeRate          || 0.0165,
    payCash:            record.payCash             || 0,
    cashDestination:    record.cashDestination     || '',
    cashDepositDate:    record.cashDepositDate      || '',
    bossWithdrawNote:   record.bossWithdrawNote     || '',
    payVoucher:         record.payVoucher           || 0,
    note:               record.note                || '',
    isComplimentary:    record.isComplimentary      || false,
  });
  const [saving, setSaving] = useState(false);
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);

  useEffect(() => {
    if (record.cardFeeRate) return;
    fetch('/api/bnb/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.bnb_card_fee_rate) {
          const rate = parseFloat(data.bnb_card_fee_rate);
          if (!isNaN(rate)) setForm(f => ({ ...f, cardFeeRate: rate }));
        }
      })
      .catch(() => {});
  }, [record.cardFeeRate]);

  const f = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const cardFee    = Math.round(Number(form.payCard) * Number(form.cardFeeRate));
  const total      = Number(form.payDeposit) + Number(form.payTransfer) + Number(form.payCard) + Number(form.payCash) + Number(form.payVoucher);
  const expected   = Number(record.roomCharge) + Number(record.otherCharge);
  const hasMismatch = !form.isComplimentary && total > 0 && Math.abs(total - expected) > 0.01;
  useEffect(() => { setMismatchConfirmed(false); }, [total]);

  // dot indicator: tab has data?
  const hasTransfer = Number(form.payDeposit) > 0 || Number(form.payTransfer) > 0;
  const hasCard     = Number(form.payCard) > 0;
  const hasCash     = Number(form.payCash) > 0 || Number(form.payVoucher) > 0;

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
          // 按下「儲存」＝已確認此筆付款，收款 0 元（招待/免收）也標記為已填
          paymentFilled: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.error || '儲存失敗', 'error'); return; }
      if (data.syncWarning) {
        showToast('付款明細已儲存，但出納現金流同步失敗，請至出納管理手動確認。', 'warning');
      } else {
        showToast('付款明細已儲存', 'success');
      }
      if (form.cashDestination === '老闆收取') showToast('現金已標記為老闆收取，記得到「老闆收取」分頁確認', 'info');
      if (form.cashDestination === '存帳')     showToast('現金已標記為存帳，記得到「老闆收取」分頁確認', 'info');
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b">
          <h3 className="font-semibold text-gray-800">付款明細 — {record.guestName}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {record.checkInDate} ～ {record.checkOutDate}
            {record.roomNo ? `　${record.roomNo}` : ''}
            　房費 NT${Number(record.roomCharge).toLocaleString()}
            {Number(record.otherCharge) > 0 && ` + 消費 NT${Number(record.otherCharge).toLocaleString()}`}
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex border-b px-2">
          {TAB_DEF.map(t => {
            const hasData = t.key === 'transfer' ? hasTransfer : t.key === 'card' ? hasCard : hasCash;
            const cls = TAB_CLS[t.color];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
                  tab === t.key ? cls.active : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                {hasData && <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="px-5 py-4 space-y-3 min-h-[200px]">
          {/* ── 匯款 tab ── */}
          {tab === 'transfer' && (
            <>
              <div className={row}>
                <label htmlFor="pm-payDeposit" className={label}>訂金匯款</label>
                <input id="pm-payDeposit" type="number" min="0" value={form.payDeposit}
                  onChange={e => f('payDeposit', e.target.value)}
                  className={`${inp} focus:ring-blue-300`} />
              </div>
              {Number(form.payDeposit) > 0 && (
                <div className={subSection('blue')}>
                  <div className={subRow}>
                    <label htmlFor="pm-depositDate" className={`${subLabel} text-blue-600`}>匯款日期</label>
                    <input id="pm-depositDate" type="date" value={form.depositDate}
                      onChange={e => f('depositDate', e.target.value)}
                      className={`${inp} border-blue-200 focus:ring-blue-300`} />
                  </div>
                  <div className={subRow}>
                    <label htmlFor="pm-depositLast5" className={`${subLabel} text-blue-600`}>帳號後五碼</label>
                    <input id="pm-depositLast5" type="text" maxLength={5} placeholder="例：12345" value={form.depositLast5}
                      onChange={e => f('depositLast5', e.target.value.replace(/\D/g, '').slice(0, 5))}
                      className="w-28 border border-blue-200 rounded-lg px-3 py-1.5 text-sm tracking-widest focus:ring-2 focus:ring-blue-300 outline-none" />
                  </div>
                </div>
              )}
              <div className={row}>
                <label htmlFor="pm-payTransfer" className={label}>當天匯款</label>
                <input id="pm-payTransfer" type="number" min="0" value={form.payTransfer}
                  onChange={e => f('payTransfer', e.target.value)}
                  className={`${inp} focus:ring-teal-300`} />
              </div>
              {Number(form.payTransfer) > 0 && (
                <div className={subSection('teal')}>
                  <div className={subRow}>
                    <label htmlFor="pm-transferDate" className={`${subLabel} text-teal-600`}>匯款日期</label>
                    <input id="pm-transferDate" type="date" value={form.transferDate}
                      onChange={e => f('transferDate', e.target.value)}
                      className={`${inp} border-teal-200 focus:ring-teal-300`} />
                  </div>
                  <div className={subRow}>
                    <label htmlFor="pm-transferLast5" className={`${subLabel} text-teal-600`}>帳號後五碼</label>
                    <input id="pm-transferLast5" type="text" maxLength={5} placeholder="例：12345" value={form.transferLast5}
                      onChange={e => f('transferLast5', e.target.value.replace(/\D/g, '').slice(0, 5))}
                      className="w-28 border border-teal-200 rounded-lg px-3 py-1.5 text-sm tracking-widest focus:ring-2 focus:ring-teal-300 outline-none" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 刷卡 tab ── */}
          {tab === 'card' && (
            <>
              <div className={row}>
                <label htmlFor="pm-payCard" className={label}>刷卡金額</label>
                <input id="pm-payCard" type="number" min="0" value={form.payCard}
                  onChange={e => f('payCard', e.target.value)}
                  className={`${inp} focus:ring-purple-300`} />
              </div>
              {Number(form.payCard) > 0 && (
                <div className={subSection('purple')}>
                  <div className={subRow}>
                    <label htmlFor="pm-cardSettlementDate" className={`${subLabel} text-purple-600`}>刷卡入帳日</label>
                    <input id="pm-cardSettlementDate" type="date" value={form.cardSettlementDate}
                      onChange={e => f('cardSettlementDate', e.target.value)}
                      className={`${inp} border-purple-200 focus:ring-purple-300`} />
                    <span className="text-xs text-purple-400 whitespace-nowrap">退房後1-2天</span>
                  </div>
                </div>
              )}
              <div className={row}>
                <label htmlFor="pm-cardFeeRate" className={label}>手續費率</label>
                <input id="pm-cardFeeRate" type="number" step="0.0001" min="0" max="1" value={form.cardFeeRate}
                  onChange={e => f('cardFeeRate', e.target.value)}
                  className="w-28 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-purple-300 outline-none" />
                <span className="text-xs text-gray-400">→ 手續費 NT${cardFee.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* ── 現金/其他 tab ── */}
          {tab === 'cash' && (
            <>
              <div className={row}>
                <label htmlFor="pm-payCash" className={label}>現金</label>
                <input id="pm-payCash" type="number" min="0" value={form.payCash}
                  onChange={e => f('payCash', e.target.value)}
                  className={`${inp} focus:ring-green-300`} />
              </div>
              {Number(form.payCash) > 0 && (
                <div className={subSection('green')}>
                  <div className={subRow}>
                    <label className={`${subLabel} text-green-600`}>現金去向</label>
                    <div className="flex gap-4">
                      {[['存帳','存入銀行'],['老闆收取','老闆收取']].map(([val, lbl]) => (
                        <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="cashDestination" value={val}
                            checked={form.cashDestination === val}
                            onChange={() => f('cashDestination', val)}
                            className="accent-green-600" />
                          <span className="text-sm text-gray-700">{lbl}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {form.cashDestination === '存帳' && (
                    <div className={subRow}>
                      <label htmlFor="pm-cashDepositDate" className={`${subLabel} text-green-600`}>存款日期</label>
                      <input id="pm-cashDepositDate" type="date" value={form.cashDepositDate}
                        onChange={e => f('cashDepositDate', e.target.value)}
                        className={`${inp} border-green-200 focus:ring-green-300`} />
                    </div>
                  )}
                  {form.cashDestination === '老闆收取' && (
                    <div className={subRow}>
                      <label htmlFor="pm-bossWithdrawNote" className={`${subLabel} text-green-600`}>收取備註</label>
                      <input id="pm-bossWithdrawNote" type="text" value={form.bossWithdrawNote}
                        onChange={e => f('bossWithdrawNote', e.target.value)}
                        placeholder="選填，例：4/15 收"
                        className={`${inp} border-green-200 focus:ring-green-300`} />
                    </div>
                  )}
                </div>
              )}
              <div className={row}>
                <label htmlFor="pm-payVoucher" className={label}>住宿卷</label>
                <input id="pm-payVoucher" type="number" min="0" value={form.payVoucher}
                  onChange={e => f('payVoucher', e.target.value)}
                  className={`${inp} focus:ring-amber-300`} />
              </div>
            </>
          )}
        </div>

        {/* Always-visible summary + note */}
        <div className="px-5 pb-2 space-y-2 border-t pt-3">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 select-none">
            <input type="checkbox" checked={form.isComplimentary}
              onChange={e => f('isComplimentary', e.target.checked)}
              className="rounded accent-rose-500" />
            招待（免收，收款 $0 也算已填）
            {form.isComplimentary && (
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded">招待</span>
            )}
          </label>
          <div className="flex items-center gap-3">
            <label htmlFor="pm-note" className={label}>備註</label>
            <input id="pm-note" type="text" value={form.note}
              onChange={e => f('note', e.target.value)}
              className={`${inp} focus:ring-gray-300`} />
          </div>
          <div className="flex justify-between items-center text-sm pt-1">
            <span className="text-gray-500">合計收款</span>
            <span className={`font-bold ${hasMismatch ? 'text-red-600' : 'text-gray-800'}`}>
              NT${Number(total).toLocaleString()}
              {hasMismatch && <span className="text-xs font-normal ml-1 text-red-500">（應收 NT${expected.toLocaleString()}）</span>}
            </span>
          </div>
          {hasMismatch && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
              <p className="text-xs text-red-600 font-medium">
                ⚠ 差額 {(total - expected) > 0 ? '+' : ''}NT${Math.abs(total - expected).toLocaleString()}
              </p>
              <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer select-none">
                <input type="checkbox" checked={mismatchConfirmed} onChange={e => setMismatchConfirmed(e.target.checked)} />
                我已確認差額，仍要儲存
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex gap-2 justify-end border-t">
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
