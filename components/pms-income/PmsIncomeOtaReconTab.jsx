'use client';

import { useState, useCallback } from 'react';
import ExportButtons from '@/components/ExportButtons';

const STATUS_BADGE = {
  ok:    'bg-green-100 text-green-700',
  issue: 'bg-red-100 text-red-700',
  warn:  'bg-amber-100 text-amber-700',
  gray:  'bg-gray-100 text-gray-500',
};

function Num({ v, cls = '' }) {
  if (v == null || v === '') return <span className="text-gray-300">—</span>;
  return <span className={cls}>{Number(v).toLocaleString('zh-TW')}</span>;
}

/**
 * PMS 收入 → OTA 對帳比對
 * 上傳 OTA（如 Booking.com）對帳單，解析所有訂單，
 * 並與 PMS 記錄中傭金科目做金額比對。
 */
export default function PmsIncomeOtaReconTab({ WAREHOUSES }) {
  const [source,   setSource]   = useState('Booking');
  const [month,    setMonth]    = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [warehouse,setWarehouse]= useState('');
  const [file,     setFile]     = useState(null);
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [viewTab,  setViewTab]  = useState('otaList');
  const [error,    setError]    = useState('');

  const handleMonthChange = (m) => {
    setMonth(m);
    if (m) {
      const [y, mo] = m.split('-').map(Number);
      const last = new Date(y, mo, 0).getDate();
      setDateFrom(`${m}-01`);
      setDateTo(`${m}-${String(last).padStart(2, '0')}`);
    }
  };

  const run = useCallback(async () => {
    if (!file) { setError('請先上傳 OTA 對帳單'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('source', source);
      if (dateFrom) fd.append('dateFrom', dateFrom);
      if (dateTo)   fd.append('dateTo', dateTo);
      if (warehouse) fd.append('warehouse', warehouse);
      const res  = await fetch('/api/pms-income/ota-reconcile', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || '比對失敗');
      setResult(data);
      setViewTab('otaList');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [file, source, dateFrom, dateTo, warehouse]);

  const s = result?.summary;

  return (
    <div className="space-y-4">
      {/* ── 操作列 ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">OTA 來源</label>
          <select className="border rounded-lg px-3 py-1.5 text-sm" value={source} onChange={e => setSource(e.target.value)}>
            <option value="Booking">Booking.com</option>
            <option value="Agoda">Agoda</option>
            <option value="Expedia">Expedia</option>
            <option value="其他">其他</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">館別</label>
          <select className="border rounded-lg px-3 py-1.5 text-sm" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            <option value="">全部</option>
            {(WAREHOUSES || []).map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">快速月份</label>
          <input type="month" className="border rounded-lg px-3 py-1.5 text-sm" value={month}
            onChange={e => handleMonthChange(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">入住起日</label>
          <input type="date" className="border rounded-lg px-3 py-1.5 text-sm" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setMonth(''); }} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">入住迄日</label>
          <input type="date" className="border rounded-lg px-3 py-1.5 text-sm" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setMonth(''); }} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">上傳對帳單</label>
          <input type="file" accept=".xls,.xlsx,.csv"
            className="border rounded-lg px-2 py-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); }} />
        </div>
        <button onClick={run} disabled={loading || !file}
          className="px-5 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium">
          {loading ? '比對中…' : '開始比對'}
        </button>
        {result && (
          <ExportButtons
            data={result.otaRows.map((r, i) => ({
              no: i + 1,
              reservationNo: r.reservationNo,
              arrival: r.arrival,
              departure: r.departure,
              guestName: r.guestName,
              bookerName: r.bookerName,
              roomNights: r.roomNights,
              finalAmount: r.finalAmount,
              commissionPct: r.commissionPct,
              commissionAmt: r.commissionAmt,
              status: r.status,
            }))}
            columns={[
              { header: '#',      key: 'no' },
              { header: '訂單號', key: 'reservationNo' },
              { header: '入住',   key: 'arrival' },
              { header: '退房',   key: 'departure' },
              { header: '房客',   key: 'guestName' },
              { header: '訂房人', key: 'bookerName' },
              { header: '間夜',   key: 'roomNights', format: 'number' },
              { header: 'OTA金額',key: 'finalAmount', format: 'number' },
              { header: '佣金%',  key: 'commissionPct' },
              { header: '佣金',   key: 'commissionAmt', format: 'number' },
              { header: '狀態',   key: 'status' },
            ]}
            filename={`OTA比對_${source}_${dateFrom||'all'}`}
            title={`OTA 對帳明細 ${source}`}
          />
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* ── 比對說明 ── */}
      {!result && !loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold">使用說明</p>
          <p>1. 從 Booking.com 後台下載「對帳報表」(Reservation report)，格式為 Excel 或 CSV。</p>
          <p>2. 選擇館別與入住月份後上傳，系統將解析所有訂單並計算傭金合計。</p>
          <p>3. 與 PMS 記錄中的傭金科目（6101 佣金費用）自動比對金額差異。</p>
          <p className="text-blue-600 text-xs mt-1">支援 Booking.com 標準格式；Agoda / Expedia 欄位若有差異請聯繫管理員調整。</p>
        </div>
      )}

      {/* ── 結果 ── */}
      {result && (() => {
        const diffCls = Math.abs(s.commDiff) <= 1 ? 'text-green-700' : 'text-red-600';
        return (
          <div className="space-y-4">
            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { lbl: 'OTA 總筆數',   val: result.otaRowCount, sub: `有效 ${result.activeCount}` },
                { lbl: '已取消',       val: result.cancelledCount, cls: result.cancelledCount > 0 ? 'text-amber-600' : '' },
                { lbl: 'OTA 房費合計', val: `NT$${s.otaRoomTotal.toLocaleString()}`, cls: 'text-teal-700' },
                { lbl: 'OTA 傭金合計', val: `NT$${s.otaCommTotal.toLocaleString()}`, cls: 'text-red-700' },
                { lbl: 'PMS 記錄傭金', val: `NT$${s.pmsCommTotal.toLocaleString()}`, cls: 'text-indigo-700', sub: `${result.pmsRecordCount} 筆` },
                {
                  lbl: '傭金差異',
                  val: `${s.commDiff >= 0 ? '+' : ''}NT$${s.commDiff.toLocaleString()}`,
                  cls: diffCls,
                  sub: s.hasIssue ? '⚠ 有差異' : '✓ 吻合',
                },
              ].map(c => (
                <div key={c.lbl} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{c.lbl}</div>
                  <div className={`text-base font-bold ${c.cls || 'text-gray-800'}`}>{c.val}</div>
                  {c.sub && <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* 差異警示 */}
            {s.hasIssue && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                ⚠ OTA 傭金合計（NT${s.otaCommTotal.toLocaleString()}）與 PMS 記錄傭金（NT${s.pmsCommTotal.toLocaleString()}）
                差異 NT${Math.abs(s.commDiff).toLocaleString()}，請核查 PMS 是否有漏登或多登。
              </div>
            )}
            {!s.hasIssue && s.pmsRecordCount > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                ✓ OTA 傭金與 PMS 記錄金額吻合（差異 ≤ NT$1）。
              </div>
            )}
            {s.pmsRecordCount === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                ⚠ 未查到對應期間的 PMS 傭金記錄，請確認已匯入 PMS 資料，或調整館別／日期範圍。
              </div>
            )}

            {/* 子分頁 */}
            <div className="flex gap-1">
              {[
                { k: 'otaList',  l: `OTA 明細 (${result.otaRowCount})` },
                { k: 'pmsComm',  l: `PMS 傭金記錄 (${result.pmsRecordCount})` },
              ].map(t => (
                <button key={t.k} onClick={() => setViewTab(t.k)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${viewTab === t.k ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* OTA 明細 */}
            {viewTab === 'otaList' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">訂單號</th>
                      <th className="px-3 py-2 text-left">入住</th>
                      <th className="px-3 py-2 text-left">退房</th>
                      <th className="px-3 py-2 text-left">房客</th>
                      <th className="px-3 py-2 text-left">訂房人</th>
                      <th className="px-3 py-2 text-right">間夜</th>
                      <th className="px-3 py-2 text-right">OTA 金額</th>
                      <th className="px-3 py-2 text-right">佣金%</th>
                      <th className="px-3 py-2 text-right">佣金</th>
                      <th className="px-3 py-2 text-center">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.otaRows.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-8 text-gray-400">無資料</td></tr>
                    )}
                    {result.otaRows.map((r, i) => {
                      const isCancelled = r.status === 'CANCELLED';
                      return (
                        <tr key={i} className={`hover:bg-gray-50 ${isCancelled ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.reservationNo || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.arrival}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.departure}</td>
                          <td className="px-3 py-2 font-medium">{r.guestName}</td>
                          <td className="px-3 py-2 text-gray-500">{r.bookerName || '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{r.roomNights || '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            <Num v={r.finalAmount} cls={isCancelled ? 'line-through text-gray-400' : 'text-teal-700'} />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {r.commissionPct ? `${r.commissionPct}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Num v={r.commissionAmt} cls={isCancelled ? 'line-through text-gray-400' : 'text-red-600'} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${isCancelled ? STATUS_BADGE.gray : STATUS_BADGE.ok}`}>
                              {isCancelled ? '已取消' : (r.status || '有效')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {result.activeCount > 0 && (
                    <tfoot className="bg-indigo-50 text-xs font-semibold">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-gray-700">
                          有效合計（{result.activeCount} 筆）
                        </td>
                        <td className="px-3 py-2 text-right text-teal-700">
                          NT${s.otaRoomTotal.toLocaleString()}
                        </td>
                        <td />
                        <td className="px-3 py-2 text-right text-red-700">
                          NT${s.otaCommTotal.toLocaleString()}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* PMS 傭金記錄 */}
            {viewTab === 'pmsComm' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <p className="px-4 pt-3 text-xs text-gray-500">
                  以下為 PMS 記錄中傭金科目（6101 佣金費用 或欄位含「佣金」）的帳務記錄，供與 OTA 對帳單交叉核對。
                </p>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">館別</th>
                      <th className="px-3 py-2 text-left">科目代碼</th>
                      <th className="px-3 py-2 text-left">PMS 欄位</th>
                      <th className="px-3 py-2 text-left">科目名稱</th>
                      <th className="px-3 py-2 text-center">借貸</th>
                      <th className="px-3 py-2 text-right">金額</th>
                      <th className="px-3 py-2 text-left">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.pmsRecords.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400">無對應的 PMS 傭金記錄</td></tr>
                    )}
                    {result.pmsRecords.map((r, i) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.businessDate}</td>
                        <td className="px-3 py-2 text-gray-600">{r.warehouse}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.accountingCode || '—'}</td>
                        <td className="px-3 py-2">{r.pmsColumnName}</td>
                        <td className="px-3 py-2 text-gray-500">{r.accountingName || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.entryType === '借方' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>
                            {r.entryType}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${r.entryType === '借方' ? 'text-red-700' : 'text-teal-700'}`}>
                          NT${r.amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-gray-400 text-xs">{r.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {result.pmsRecords.length > 0 && (
                    <tfoot className="bg-indigo-50 text-xs font-semibold">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-gray-700">借方合計</td>
                        <td className="px-3 py-2 text-right text-red-700">
                          NT${s.pmsCommTotal.toLocaleString()}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
