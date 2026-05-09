'use client';

import { useState, useCallback, useEffect } from 'react';
import ExportButtons from '@/components/ExportButtons';

const MATCH_BADGE = {
  matched:     'bg-green-100 text-green-700',
  amount_diff: 'bg-amber-100 text-amber-700',
  name_diff:   'bg-orange-100 text-orange-700',
  unmatched:   'bg-red-100 text-red-700',
};
const MATCH_LABEL = {
  matched:     '吻合',
  amount_diff: '金額差異',
  name_diff:   '姓名差異',
  unmatched:   '未對應',
};

function Num({ v, cls = '' }) {
  if (v == null || v === '') return <span className="text-gray-300">—</span>;
  return <span className={cls}>{Number(v).toLocaleString('zh-TW')}</span>;
}

export default function PmsIncomeOtaReconTab({ WAREHOUSES }) {
  const [source,    setSource]    = useState('Booking');
  const [month,     setMonth]     = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [file,      setFile]      = useState(null);
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [viewTab,   setViewTab]   = useState('otaList');
  const [error,     setError]     = useState('');

  // History state
  const [historyLogs,    setHistoryLogs]    = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedLog,    setSelectedLog]    = useState(null); // detail
  const [showHistory,    setShowHistory]    = useState(false);
  const [histMonth,      setHistMonth]      = useState('');
  const [histWarehouse,  setHistWarehouse]  = useState('');

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
      if (dateFrom)  fd.append('dateFrom', dateFrom);
      if (dateTo)    fd.append('dateTo', dateTo);
      if (warehouse) fd.append('warehouse', warehouse);
      const res  = await fetch('/api/pms-income/ota-reconcile', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || '比對失敗');
      setResult(data);
      setViewTab('reconLines');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [file, source, dateFrom, dateTo, warehouse]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (histWarehouse) params.set('warehouse', histWarehouse);
      if (histMonth)     params.set('month', histMonth);
      const res = await fetch(`/api/pms-income/ota-recon-logs?${params}`);
      if (res.ok) setHistoryLogs(await res.json());
    } finally {
      setHistoryLoading(false);
    }
  }, [histWarehouse, histMonth]);

  const loadLogDetail = async (logId) => {
    const res = await fetch(`/api/pms-income/ota-recon-logs?logId=${logId}`);
    if (res.ok) setSelectedLog(await res.json());
  };

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  const s = result?.summary;
  const reconLines = result?.reconLines || [];

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
        <button
          onClick={() => setShowHistory(h => !h)}
          className={`px-4 py-1.5 text-sm rounded-lg border font-medium ${showHistory ? 'bg-gray-700 text-white border-gray-700' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        >
          歷史記錄
        </button>
        {result && (
          <ExportButtons
            data={reconLines.map((r, i) => ({
              no: i + 1,
              otaReservationNo: r.otaReservationNo,
              otaGuestName: r.otaGuestName,
              otaArrival: r.otaArrival,
              otaDeparture: r.otaDeparture,
              otaFinalAmount: r.otaFinalAmount,
              otaCommissionAmt: r.otaCommissionAmt,
              pmsCommissionAmt: r.pmsCommissionAmt,
              diffAmount: r.diffAmount,
              matchStatus: MATCH_LABEL[r.matchStatus] || r.matchStatus,
            }))}
            columns={[
              { header: '#', key: 'no' },
              { header: 'OTA 訂單號', key: 'otaReservationNo' },
              { header: '房客', key: 'otaGuestName' },
              { header: '入住', key: 'otaArrival' },
              { header: '退房', key: 'otaDeparture' },
              { header: 'OTA 金額', key: 'otaFinalAmount', format: 'number' },
              { header: 'OTA 傭金', key: 'otaCommissionAmt', format: 'number' },
              { header: 'PMS 傭金', key: 'pmsCommissionAmt', format: 'number' },
              { header: '差異', key: 'diffAmount', format: 'number' },
              { header: '比對狀態', key: 'matchStatus' },
            ]}
            filename={`OTA逐筆比對_${source}_${dateFrom || 'all'}`}
            title={`OTA 逐筆比對 ${source}`}
          />
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* ── 歷史記錄面板 ── */}
      {showHistory && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <h3 className="text-sm font-semibold text-gray-700 mr-2">歷史對帳記錄</h3>
            <select className="border rounded px-2 py-1 text-sm" value={histWarehouse} onChange={e => setHistWarehouse(e.target.value)}>
              <option value="">全部館別</option>
              {(WAREHOUSES || []).map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <input type="month" className="border rounded px-2 py-1 text-sm" value={histMonth} onChange={e => setHistMonth(e.target.value)} />
            <button onClick={loadHistory} className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700">查詢</button>
          </div>
          {historyLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">載入中...</div>
          ) : historyLogs.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-sm">無歷史記錄</div>
          ) : (
            <div className="overflow-x-auto border rounded-lg bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">時間</th>
                    <th className="px-3 py-2 text-left">OTA</th>
                    <th className="px-3 py-2 text-left">館別</th>
                    <th className="px-3 py-2 text-left">月份</th>
                    <th className="px-3 py-2 text-right">吻合</th>
                    <th className="px-3 py-2 text-right">未對應</th>
                    <th className="px-3 py-2 text-right">總差異</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyLogs.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-3 py-2">{l.otaSource}</td>
                      <td className="px-3 py-2">{l.warehouse}</td>
                      <td className="px-3 py-2">{l.billingMonth}</td>
                      <td className="px-3 py-2 text-right text-green-700">{l.matchedCount}</td>
                      <td className="px-3 py-2 text-right text-red-600">{l.unmatchedCount}</td>
                      <td className={`px-3 py-2 text-right font-medium ${Math.abs(l.totalDiff) > 1 ? 'text-red-600' : 'text-green-700'}`}>
                        {l.totalDiff > 0 ? '+' : ''}{Number(l.totalDiff).toLocaleString('zh-TW')}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => loadLogDetail(l.id)} className="text-xs text-indigo-600 hover:underline">
                          查看明細
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

      {/* ── 歷史明細 Modal ── */}
      {selectedLog && (
        <ReconLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      {/* ── 說明 ── */}
      {!result && !loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold">使用說明</p>
          <p>1. 從 Booking.com 後台下載「對帳報表」(Reservation report)，格式為 Excel 或 CSV。</p>
          <p>2. 選擇館別與入住月份後上傳，系統將解析所有訂單並逐筆與 PMS 訂房明細比對。</p>
          <p>3. 比對結果自動儲存至歷史記錄，可隨時查閱。</p>
          <p className="text-blue-600 text-xs mt-1">支援 Booking.com 標準格式；需先匯入含訂房序號的日營業報表，逐筆比對才能顯示 PMS 傭金。</p>
        </div>
      )}

      {/* ── 比對結果 ── */}
      {result && (() => {
        const diffCls = Math.abs(s.commDiff) <= 1 ? 'text-green-700' : 'text-red-600';
        return (
          <div className="space-y-4">
            {/* 摘要卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { lbl: 'OTA 總筆數', val: result.otaRowCount, sub: `有效 ${result.activeCount}` },
                { lbl: '已取消', val: result.cancelledCount, cls: result.cancelledCount > 0 ? 'text-amber-600' : '' },
                { lbl: '逐筆吻合', val: result.matchedCount ?? '-', cls: 'text-green-700' },
                { lbl: '未對應', val: result.unmatchedCount ?? '-', cls: 'text-red-600' },
                { lbl: 'OTA 房費', val: `NT$${s.otaRoomTotal.toLocaleString()}`, cls: 'text-teal-700' },
                { lbl: 'OTA 傭金', val: `NT$${s.otaCommTotal.toLocaleString()}`, cls: 'text-red-700' },
                { lbl: 'PMS 傭金', val: `NT$${s.pmsCommTotal.toLocaleString()}`, cls: 'text-indigo-700', sub: `${result.pmsRecordCount} 筆` },
                { lbl: '傭金差異', val: `${s.commDiff >= 0 ? '+' : ''}NT$${s.commDiff.toLocaleString()}`, cls: diffCls, sub: s.hasIssue ? '⚠ 有差異' : '✓ 吻合' },
              ].map(c => (
                <div key={c.lbl} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">{c.lbl}</div>
                  <div className={`text-base font-bold ${c.cls || 'text-gray-800'}`}>{c.val}</div>
                  {c.sub && <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>}
                </div>
              ))}
            </div>

            {s.hasIssue && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                ⚠ OTA 傭金合計（NT${s.otaCommTotal.toLocaleString()}）與 PMS 記錄傭金（NT${s.pmsCommTotal.toLocaleString()}）差異 NT${Math.abs(s.commDiff).toLocaleString()}。
              </div>
            )}
            {!s.hasIssue && s.pmsRecordCount > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                ✓ OTA 傭金與 PMS 記錄金額吻合（差異 ≤ NT$1）。
              </div>
            )}

            {/* 子分頁 */}
            <div className="flex gap-1 flex-wrap">
              {[
                { k: 'reconLines', l: `逐筆比對 (${reconLines.length})` },
                { k: 'otaList',    l: `OTA 明細 (${result.otaRowCount})` },
                { k: 'pmsComm',    l: `PMS 傭金 (${result.pmsRecordCount})` },
              ].map(t => (
                <button key={t.k} onClick={() => setViewTab(t.k)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${viewTab === t.k ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* 逐筆比對 */}
            {viewTab === 'reconLines' && (
              <ReconLinesTable lines={reconLines} />
            )}

            {/* OTA 明細 */}
            {viewTab === 'otaList' && (
              <OtaListTable rows={result.otaRows} activeCount={result.activeCount} s={s} />
            )}

            {/* PMS 傭金記錄 */}
            {viewTab === 'pmsComm' && (
              <PmsCommTable records={result.pmsRecords} s={s} />
            )}
          </div>
        );
      })()}
    </div>
  );
}

function ReconLinesTable({ lines }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? lines : lines.filter(l => l.matchStatus === filter);
  const counts = lines.reduce((m, l) => { m[l.matchStatus] = (m[l.matchStatus] || 0) + 1; return m; }, {});

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {[
          { k: 'all', l: `全部 (${lines.length})` },
          { k: 'matched', l: `吻合 (${counts.matched || 0})` },
          { k: 'amount_diff', l: `金額差異 (${counts.amount_diff || 0})` },
          { k: 'name_diff', l: `姓名差異 (${counts.name_diff || 0})` },
          { k: 'unmatched', l: `未對應 (${counts.unmatched || 0})` },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            className={`px-2.5 py-1 text-xs rounded-full border ${filter === f.k ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}>
            {f.l}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-center">狀態</th>
              <th className="px-3 py-2 text-left">OTA 訂單號</th>
              <th className="px-3 py-2 text-left">OTA 房客</th>
              <th className="px-3 py-2 text-left">入住</th>
              <th className="px-3 py-2 text-left">退房</th>
              <th className="px-3 py-2 text-right">OTA 金額</th>
              <th className="px-3 py-2 text-right">OTA 傭金</th>
              <th className="px-3 py-2 text-right">PMS 傭金</th>
              <th className="px-3 py-2 text-right">差異</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">無資料</td></tr>
            )}
            {filtered.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${MATCH_BADGE[l.matchStatus] || 'bg-gray-100 text-gray-500'}`}>
                    {MATCH_LABEL[l.matchStatus] || l.matchStatus}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{l.otaReservationNo || '—'}</td>
                <td className="px-3 py-2 font-medium">{l.otaGuestName || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{l.otaArrival || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{l.otaDeparture || '—'}</td>
                <td className="px-3 py-2 text-right"><Num v={l.otaFinalAmount} cls="text-teal-700" /></td>
                <td className="px-3 py-2 text-right"><Num v={l.otaCommissionAmt} cls="text-red-600" /></td>
                <td className="px-3 py-2 text-right"><Num v={l.pmsCommissionAmt} cls="text-indigo-700" /></td>
                <td className={`px-3 py-2 text-right font-medium ${Math.abs(l.diffAmount) > 1 ? 'text-red-600' : 'text-gray-400'}`}>
                  {l.diffAmount !== 0 ? (l.diffAmount > 0 ? '+' : '') + Number(l.diffAmount).toLocaleString('zh-TW') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OtaListTable({ rows, activeCount, s }) {
  return (
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
          {rows.length === 0 && <tr><td colSpan={11} className="text-center py-8 text-gray-400">無資料</td></tr>}
          {rows.map((r, i) => {
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
                <td className="px-3 py-2 text-right text-gray-500">{r.commissionPct ? `${r.commissionPct}%` : '—'}</td>
                <td className="px-3 py-2 text-right">
                  <Num v={r.commissionAmt} cls={isCancelled ? 'line-through text-gray-400' : 'text-red-600'} />
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isCancelled ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                    {isCancelled ? '已取消' : (r.status || '有效')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        {activeCount > 0 && s && (
          <tfoot className="bg-indigo-50 text-xs font-semibold">
            <tr>
              <td colSpan={7} className="px-3 py-2 text-gray-700">有效合計（{activeCount} 筆）</td>
              <td className="px-3 py-2 text-right text-teal-700">NT${s.otaRoomTotal.toLocaleString()}</td>
              <td />
              <td className="px-3 py-2 text-right text-red-700">NT${s.otaCommTotal.toLocaleString()}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function PmsCommTable({ records, s }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <p className="px-4 pt-3 text-xs text-gray-500">PMS 傭金科目（6101 或欄位含「佣金」）記錄，供交叉核對。</p>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-xs text-gray-500">
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">日期</th>
            <th className="px-3 py-2 text-left">館別</th>
            <th className="px-3 py-2 text-left">科目</th>
            <th className="px-3 py-2 text-left">PMS 欄位</th>
            <th className="px-3 py-2 text-center">借貸</th>
            <th className="px-3 py-2 text-right">金額</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {records.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">無對應的 PMS 傭金記錄</td></tr>}
          {records.map((r, i) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r.businessDate}</td>
              <td className="px-3 py-2 text-gray-600">{r.warehouse}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.accountingCode || '—'}</td>
              <td className="px-3 py-2">{r.pmsColumnName}</td>
              <td className="px-3 py-2 text-center">
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.entryType === '借方' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>
                  {r.entryType}
                </span>
              </td>
              <td className={`px-3 py-2 text-right font-medium ${r.entryType === '借方' ? 'text-red-700' : 'text-teal-700'}`}>
                NT${r.amount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        {records.length > 0 && s && (
          <tfoot className="bg-indigo-50 text-xs font-semibold">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-gray-700">借方合計</td>
              <td className="px-3 py-2 text-right text-red-700">NT${s.pmsCommTotal.toLocaleString()}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function ReconLogDetailModal({ log, onClose }) {
  const [filter, setFilter] = useState('all');
  const lines = log.lines || [];
  const filtered = filter === 'all' ? lines : lines.filter(l => l.matchStatus === filter);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center px-5 py-4 border-b">
          <div>
            <h3 className="font-semibold">歷史對帳明細 — {log.otaSource} / {log.warehouse} / {log.billingMonth}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              吻合 {log.matchedCount} / 未對應 {log.unmatchedCount} / 總差異 {Number(log.totalDiff).toLocaleString('zh-TW')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex gap-2 px-5 py-3 border-b flex-wrap">
          {['all', 'matched', 'amount_diff', 'name_diff', 'unmatched'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-full border ${filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              {f === 'all' ? `全部 (${lines.length})` : `${MATCH_LABEL[f]} (${lines.filter(l => l.matchStatus === f).length})`}
            </button>
          ))}
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-center">狀態</th>
                <th className="px-3 py-2 text-left">OTA 訂單號</th>
                <th className="px-3 py-2 text-left">OTA 房客</th>
                <th className="px-3 py-2 text-left">入住</th>
                <th className="px-3 py-2 text-right">OTA 傭金</th>
                <th className="px-3 py-2 text-right">PMS 傭金</th>
                <th className="px-3 py-2 text-right">差異</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((l, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${MATCH_BADGE[l.matchStatus] || 'bg-gray-100 text-gray-500'}`}>
                      {MATCH_LABEL[l.matchStatus] || l.matchStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{l.otaReservationNo || '—'}</td>
                  <td className="px-3 py-2">{l.otaGuestName || '—'}</td>
                  <td className="px-3 py-2 text-xs">{l.otaArrival || '—'}</td>
                  <td className="px-3 py-2 text-right text-red-600">{Number(l.otaCommissionAmt).toLocaleString('zh-TW')}</td>
                  <td className="px-3 py-2 text-right text-indigo-700">{Number(l.pmsCommissionAmt).toLocaleString('zh-TW')}</td>
                  <td className={`px-3 py-2 text-right font-medium ${Math.abs(l.diffAmount) > 1 ? 'text-red-600' : 'text-gray-400'}`}>
                    {l.diffAmount !== 0 ? (l.diffAmount > 0 ? '+' : '') + Number(l.diffAmount).toLocaleString('zh-TW') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
