'use client';

import { useState, useEffect, useCallback } from 'react';

function fmt(n) {
  if (n == null || n === 0) return '-';
  return Number(n).toLocaleString('zh-TW');
}
function fmtSign(n) {
  if (!n) return '-';
  const v = Number(n);
  return (v >= 0 ? '+' : '') + v.toLocaleString('zh-TW');
}

function SectionTitle({ children, badge, badgeColor = 'bg-blue-100 text-blue-700' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-gray-800">{children}</h3>
      {badge != null && <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
    </div>
  );
}

function EmptyRow({ msg }) {
  return <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400 text-sm">{msg}</td></tr>;
}

function StatusBadge({ status }) {
  const map = {
    '草稿':   'bg-gray-100 text-gray-600',
    '已送出': 'bg-blue-100 text-blue-600',
    '已確認': 'bg-indigo-100 text-indigo-700',
    '已結帳': 'bg-green-100 text-green-700',
  };
  return <span className={`text-xs px-1.5 py-0.5 rounded ${map[status] || 'bg-gray-100 text-gray-500'}`}>{status}</span>;
}

const OTA_STATUS_BADGE = {
  '待確認': 'bg-gray-100 text-gray-500',
  '已到帳': 'bg-green-100 text-green-700',
  '有差異': 'bg-red-100 text-red-700',
};

export default function PmsIncomeCashierSummaryTab({ WAREHOUSES = [] }) {
  const now = new Date();
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0] || '');
  const [yearMonth, setYearMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // OTA 撥款到帳確認
  const [otaPayments,    setOtaPayments]    = useState([]);
  const [otaConfirmRow,  setOtaConfirmRow]  = useState(null); // { source, netReceivable }
  const [otaActualInput, setOtaActualInput] = useState('');
  const [otaDateInput,   setOtaDateInput]   = useState('');
  const [otaNoteInput,   setOtaNoteInput]   = useState('');
  const [otaSaving,      setOtaSaving]      = useState(false);

  const loadOtaPayments = useCallback(async () => {
    if (!warehouse || !yearMonth) return;
    try {
      const res = await fetch(`/api/pms-income/ota-payment?warehouse=${encodeURIComponent(warehouse)}&yearMonth=${yearMonth}`);
      if (res.ok) setOtaPayments(await res.json());
    } catch {}
  }, [warehouse, yearMonth]);

  const load = useCallback(async () => {
    if (!warehouse || !yearMonth) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ warehouse, yearMonth });
      const res = await fetch(`/api/pms-income/cashier-summary?${params}`);
      if (!res.ok) throw new Error((await res.json()).error?.message || '載入失敗');
      setData(await res.json());
      await loadOtaPayments();
    } catch (e) {
      setError(e.message); setData(null);
    } finally { setLoading(false); }
  }, [warehouse, yearMonth, loadOtaPayments]);

  async function confirmOtaPayment() {
    if (!otaConfirmRow) return;
    setOtaSaving(true);
    try {
      const res = await fetch('/api/pms-income/ota-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse,
          yearMonth,
          source:          otaConfirmRow.source,
          expectedAmount:  otaConfirmRow.netReceivable,
          actualAmount:    parseFloat(otaActualInput) || 0,
          confirmedDate:   otaDateInput || null,
          note:            otaNoteInput || null,
        }),
      });
      if (res.ok) {
        setOtaConfirmRow(null);
        await loadOtaPayments();
      }
    } finally {
      setOtaSaving(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-5">
      {/* ── 篩選列 ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded px-2 py-1 text-sm" value={warehouse}
            onChange={e => setWarehouse(e.target.value)}>
            {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">月份</label>
          <input type="month" className="border rounded px-2 py-1 text-sm" value={yearMonth}
            onChange={e => setYearMonth(e.target.value)} />
        </div>
        <button onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">重新整理</button>
        <button onClick={handlePrint} className="px-3 py-1 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50">列印</button>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}
      {loading && <div className="text-center py-8 text-gray-400">計算中...</div>}

      {data && (
        <>
          {/* ── 彙總卡片 ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'OTA + 代訂 應收款', val: data.summary.totalAR,        color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
              { label: '廠商行程 應付款',    val: data.summary.totalAP,        color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
              { label: '廠商應收（出帳）',   val: data.summary.totalArVendor,  color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
              { label: '累計預收訂金餘額',   val: data.summary.depositOutstanding, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            ].map(({ label, val, color, bg }) => (
              <div key={label} className={`border rounded-xl p-4 ${bg}`}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`text-xl font-bold ${color}`}>NT$ {fmt(val)}</div>
              </div>
            ))}
          </div>

          {/* 淨部位 */}
          <div className={`border-2 rounded-xl p-4 flex items-center justify-between
            ${data.summary.netPosition >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
            <span className="text-sm font-semibold text-gray-700">
              出納淨部位（應收合計 − 應付合計）
            </span>
            <span className={`text-2xl font-bold ${data.summary.netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {fmtSign(data.summary.netPosition)}
            </span>
          </div>

          {/* ── OTA + 代訂中心 應收款 ── */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b flex items-center justify-between">
              <SectionTitle badge={`${data.ar.length} 筆`} badgeColor="bg-blue-200 text-blue-800">
                OTA / 代訂中心 應收款（{yearMonth}）
              </SectionTitle>
              <span className="text-xs text-gray-500">OTA 撥款尚未入帳者，於月底請款後比對</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">來源</th>
                  <th className="px-3 py-2 text-left">類型</th>
                  <th className="px-3 py-2 text-right">訂房數</th>
                  <th className="px-3 py-2 text-right">毛收入</th>
                  <th className="px-3 py-2 text-right">佣金（應扣）</th>
                  <th className="px-3 py-2 text-right font-semibold text-blue-700">淨應收</th>
                  <th className="px-3 py-2 text-center">撥款到帳</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.ar.length === 0
                  ? <EmptyRow msg="本月無 OTA / 代訂中心訂房記錄" />
                  : data.ar.map(r => {
                    const pay = otaPayments.find(p => p.source === r.source);
                    return (
                      <tr key={r.source} className="hover:bg-blue-50/30">
                        <td className="px-3 py-2 font-medium text-gray-800">{r.source}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.type}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.totalRevenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">
                          {r.commission > 0 ? `(${fmt(r.commission)})` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{fmt(r.netReceivable)}</td>
                        <td className="px-3 py-2 text-center">
                          {pay?.status === '已到帳' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700" title={`實收 ${fmt(pay.actualAmount)}・${pay.confirmedDate || ''}`}>
                              ✓ 已到帳
                            </span>
                          ) : pay?.status === '有差異' ? (
                            <button onClick={() => { setOtaConfirmRow(r); setOtaActualInput(pay.actualAmount || ''); setOtaDateInput(pay.confirmedDate || ''); setOtaNoteInput(pay.note || ''); }}
                              className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200">
                              差異 {fmt(pay.diff)}
                            </button>
                          ) : (
                            <button onClick={() => { setOtaConfirmRow(r); setOtaActualInput(r.netReceivable || ''); setOtaDateInput(''); setOtaNoteInput(''); }}
                              className="text-xs px-2 py-0.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50">
                              確認到帳
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
              {data.ar.length > 0 && (
                <tfoot className="bg-blue-50 text-xs font-semibold">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-blue-800">合計</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                      {fmt(data.ar.reduce((s, r) => s + r.totalRevenue, 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-red-600 tabular-nums">
                      ({fmt(data.ar.reduce((s, r) => s + r.commission, 0))})
                    </td>
                    <td className="px-3 py-2 text-right text-blue-700 tabular-nums">
                      {fmt(data.summary.totalAR)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* ── 廠商行程 應付款 (AP) ── */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b flex items-center justify-between">
              <SectionTitle badge={`${data.ap.length} 筆`} badgeColor="bg-red-200 text-red-800">
                廠商行程 應付款（{yearMonth}）
              </SectionTitle>
              <a href="/pms-income?tab=vendorBilling" className="text-xs text-red-600 hover:underline">前往廠商帳單 →</a>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">廠商</th>
                  <th className="px-3 py-2 text-center">狀態</th>
                  <th className="px-3 py-2 text-right">帳單金額</th>
                  <th className="px-3 py-2 text-right">已付</th>
                  <th className="px-3 py-2 text-right font-semibold text-red-700">未付（待付）</th>
                  <th className="px-3 py-2 text-center">到期日</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.ap.length === 0
                  ? <EmptyRow msg="本月無廠商行程應付帳單" />
                  : data.ap.map(r => (
                    <tr key={r.id} className={`hover:bg-red-50/20 ${r.outstanding > 0 && r.status !== '已結帳' ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{r.supplierName}</td>
                      <td className="px-3 py-2 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.totalAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{fmt(r.settledAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">{fmt(r.outstanding)}</td>
                      <td className="px-3 py-2 text-center text-xs text-gray-400">{r.dueDate || '-'}</td>
                    </tr>
                  ))
                }
              </tbody>
              {data.ap.length > 0 && (
                <tfoot className="bg-red-50 text-xs font-semibold">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-red-800">合計</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                      {fmt(data.ap.reduce((s, r) => s + r.totalAmount, 0))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                      {fmt(data.ap.reduce((s, r) => s + r.settledAmount, 0))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">{fmt(data.summary.totalAP)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* ── 廠商應收（AR billing）── */}
          {data.arVendor.length > 0 && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-indigo-50 border-b">
                <SectionTitle badge={`${data.arVendor.length} 筆`} badgeColor="bg-indigo-200 text-indigo-800">
                  廠商應收帳款（旅館向廠商收款）
                </SectionTitle>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">廠商</th>
                    <th className="px-3 py-2 text-center">狀態</th>
                    <th className="px-3 py-2 text-right">帳單金額</th>
                    <th className="px-3 py-2 text-right">已收</th>
                    <th className="px-3 py-2 text-right font-semibold text-indigo-700">未收</th>
                    <th className="px-3 py-2 text-center">到期日</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.arVendor.map(r => (
                    <tr key={r.id} className="hover:bg-indigo-50/20">
                      <td className="px-3 py-2 font-medium text-gray-800">{r.supplierName}</td>
                      <td className="px-3 py-2 text-center"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.totalAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{fmt(r.settledAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">{fmt(r.outstanding)}</td>
                      <td className="px-3 py-2 text-center text-xs text-gray-400">{r.dueDate || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 訂金預收款餘額說明 ── */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
            <div className="font-semibold text-amber-800 mb-1">累計預收訂金餘額（全期）</div>
            <div className="text-amber-700 text-xl font-bold">NT$ {fmt(data.depositOutstanding)}</div>
            <div className="text-xs text-amber-600 mt-1">此為「收訂金 − 沖訂金」全期累計，即旅館帳上仍負債給未來住客的金額。</div>
          </div>
        </>
      )}

      {/* ── OTA 撥款到帳確認彈窗 ── */}
      {otaConfirmRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-800">OTA 撥款到帳確認</h3>
              <button onClick={() => setOtaConfirmRow(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
              <div className="text-gray-500 text-xs mb-0.5">{otaConfirmRow.source}・{yearMonth}</div>
              <div className="font-semibold text-blue-700">系統預期淨應收：NT$ {fmt(otaConfirmRow.netReceivable)}</div>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">實際到帳金額 *</label>
                <input type="number" value={otaActualInput} onChange={e => setOtaActualInput(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-right font-medium" placeholder="0" />
                {otaActualInput && Math.abs(parseFloat(otaActualInput) - otaConfirmRow.netReceivable) > 1 && (
                  <div className="text-xs text-red-600 mt-1">
                    差異：{(parseFloat(otaActualInput) - otaConfirmRow.netReceivable).toLocaleString('zh-TW')}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">入帳日期</label>
                <input type="date" value={otaDateInput} onChange={e => setOtaDateInput(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">備註（差異說明）</label>
                <input value={otaNoteInput} onChange={e => setOtaNoteInput(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如：含退款扣除..." />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setOtaConfirmRow(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={confirmOtaPayment} disabled={!otaActualInput || otaSaving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {otaSaving ? '儲存中...' : '確認到帳'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
