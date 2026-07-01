'use client';

import { useState } from 'react';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import WhQuickBtns from '../_components/WhQuickBtns';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { inputCls, btnCls, BNB_SOURCES, BNB_SOURCE_COLORS } from '../_constants';

// ── 匯出欄位定義 ──────────────────────────────────────────────────
const BOOKING_EXPORT_COLS = [
  { header: '館別',      key: 'warehouse' },
  { header: '來源',      key: 'source' },
  { header: '姓名',      key: 'guestName' },
  { header: '房間',      key: 'roomNo' },
  { header: '入住日期',  key: 'checkInDate' },
  { header: '退房日期',  key: 'checkOutDate' },
  { header: '房費',      key: 'roomCharge',   format: 'number' },
  { header: '消費',      key: 'otherCharge',  format: 'number' },
  { header: '訂金匯款',  key: 'payDeposit',   format: 'number' },
  { header: '匯款日期',  key: 'depositDate' },
  { header: '帳號後五碼', key: 'depositLast5' },
  { header: '當天匯款',  key: 'payTransfer',  format: 'number' },
  { header: '匯款日期',  key: 'transferDate' },
  { header: '帳號後五碼', key: 'transferLast5' },
  { header: '刷卡',      key: 'payCard',      format: 'number' },
  { header: '刷卡手續費', key: 'cardFee',      format: 'number' },
  { header: '現金',      key: 'payCash',      format: 'number' },
  { header: '住宿卷',    key: 'payVoucher',   format: 'number' },
  { header: '狀態',      key: 'status' },
  { header: '備註',      key: 'note' },
];

const NT = (v) => `NT$ ${Number(v || 0).toLocaleString()}`;
const REC_PAGE_SIZE = 200;

const STATUS_COLORS = {
  '已退房': 'bg-gray-100 text-gray-600',
  '已入住': 'bg-green-100 text-green-700',
  '已預訂': 'bg-blue-100 text-blue-700',
  '已刪除': 'bg-red-100 text-red-500',
  '取消':   'bg-orange-100 text-orange-600',
  '未入住': 'bg-yellow-100 text-yellow-700',
};
function getStatusColor(s) { return STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-600'; }
const SOURCE_COLORS = BNB_SOURCE_COLORS;

export default function RecordsTab({
  // ── from useBnbRecords() ─────────────────────────────────────
  records,
  recLoading, recError, recPage, recTotal,
  filterMonth, setFilterMonth,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo,
  filterSource, setFilterSource,
  filterStatus, setFilterStatus,
  filterWarehouse, setFilterWarehouse,
  filterPayment, setFilterPayment,
  pageSize, setPageSize,
  selectedIds, setSelectedIds,
  batchField, setBatchField,
  batchValue, setBatchValue,
  batchApplying,
  inlineEdit, setInlineEdit,
  editMode, editMap, dirtyIds, batchSaving, locking, rowErrors, roomNoList,
  fetchRecords,
  handleBatchApply, handleInlineSave,
  enterEditMode, cancelEditMode, updateCell, focusPayCell, handlePayKeyDown, saveAllEdits,
  handleLockToggle, lockAllFilled, handleUnlockRow, handleDelete, handleRestore,

  // ── modal state from page.js ─────────────────────────────────
  editRecord, setEditRecord,
  editBooking, setEditBooking,
  addBookingOpen, setAddBookingOpen,

  // ── import state from page.js ────────────────────────────────
  importMonth, setImportMonth,
  importWarehouse, setImportWarehouse,
  importFile, setImportFile,
  importReplace, setImportReplace,
  importPreview, setImportPreview,
  importResult, setImportResult,
  importConfirm, setImportConfirm,
  showImportPanel, setShowImportPanel,
  importing,
  importHistory, setImportHistory,
  handleFileSelect,
  handleImport,
  doImport,

  // ── derived / computed from page.js ──────────────────────────
  canLock,
  isLocked,
  monthLocked,
  warehouseList,
  recStats,
  roomStats,
  auditSummary,        // 全月稽核摘要（不受分頁限制）
  auditSummaryLoading,
  fetchAuditSummary,

  // ── navigation ───────────────────────────────────────────────
  setActiveTab, router,

  // ── print ────────────────────────────────────────────────────
  doPrint,

  // ── callback shortcuts ────────────────────────────────────────
  onGoToPayAudit,
  onGoToDeposit,
}) {
  const { showToast } = useToast();

  // ── inline edit value (local state) ──────────────────────────
  const [inlineValue, setInlineValue] = useState('');

  // ── helpers ──────────────────────────────────────────────────
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

  // 是否處於「選了本頁全部但還有其他頁」狀態
  const allPageSelected = selectedIds.size > 0
    && records.filter(r => r.status !== '已刪除').every(r => selectedIds.has(r.id))
    && recTotal > records.length;

  const goToPayAudit = () => {
    if (onGoToPayAudit) { onGoToPayAudit(); return; }
    setActiveTab('payAudit');
    router.replace('?tab=payAudit', { scroll: false });
  };

  return (
    <>
      {/* ══ 月鎖提示 ══ */}
      <p className="text-[11px] text-gray-400 mb-3">
        💡 月鎖＝整月所有記錄不可修改；筆鎖（🔒 全部鎖帳）＝僅鎖定單筆付款記錄，兩者獨立。
      </p>

      {/* ══ Tab: 訂房明細 ══ */}
      <div>
        {recError && <div className="mb-4"><FetchErrorBanner message={recError} onRetry={() => fetchRecords(1)} /></div>}

        {/* 分頁溢出提示 */}
        {recTotal > records.length && (
          <div className="mb-3 flex items-center gap-2 bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-2.5 text-sm text-yellow-800">
            <span>⚠ 目前顯示 <strong>{records.length}</strong> / <strong>{recTotal}</strong> 筆。</span>
            <span className="text-yellow-700">稽核數字和金額合計已切換為<strong>全月</strong>來源（API 即時計算），批次操作、鎖帳仍限本頁，請縮小篩選範圍再執行。</span>
          </div>
        )}

        {/* 全月稽核橫幅：已退房未填款 */}
        {(() => {
          const cnt = auditSummary?.overdueUnpaid ?? recStats.overdueUnpaid;
          const label = auditSummary ? '（全月）' : (recTotal > records.length ? '（本頁）' : '');
          return cnt > 0 ? (
            <div className="mb-3 flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5">
              <span className="text-sm text-amber-800">⚠ 已退房未填款：<strong>{cnt}</strong> 筆{label}</span>
              <button onClick={goToPayAudit} className="ml-auto text-xs px-3 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap">→ 付款稽核</button>
            </div>
          ) : null;
        })()}

        {/* 全月稽核橫幅：刷卡入帳日未填 */}
        {(() => {
          const cnt = auditSummary?.cardDateMissing ?? recStats.cardDateMissing;
          const label = auditSummary ? '（全月）' : (recTotal > records.length ? '（本頁）' : '');
          return cnt > 0 ? (
            <div className="mb-3 flex items-center gap-3 bg-purple-50 border border-purple-300 rounded-xl px-4 py-2.5">
              <span className="text-sm text-purple-800">卡？ 刷卡入帳日未填：<strong>{cnt}</strong> 筆{label}</span>
              <button onClick={goToPayAudit} className="ml-auto text-xs px-3 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 whitespace-nowrap">→ 付款稽核</button>
            </div>
          ) : null;
        })()}

        {/* 篩選列 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="f" className="block text-xs text-gray-500 mb-1">月份{(filterDateFrom || filterDateTo) && <span className="text-gray-300 ml-1">(區間優先)</span>}</label>
            <input id="f" type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className={`${inputCls} ${(filterDateFrom || filterDateTo) ? 'opacity-40' : ''}`} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">日期區間（入住日）</label>
            <div className="flex items-center gap-1">
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className={inputCls} />
              <span className="text-gray-400 text-xs">～</span>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className={inputCls} />
              {(filterDateFrom || filterDateTo) && (
                <button type="button" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline whitespace-nowrap ml-1">清除</button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">來源</label>
            <select id="f-2" value={filterSource} onChange={e => setFilterSource(e.target.value)} className={inputCls}>
              <option value="">全部</option>
              {BNB_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">狀態</label>
            <select id="f-3" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls}>
              <option value="">全部</option>
              {Object.keys(STATUS_COLORS).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-39" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="f-39" value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className={inputCls}>
              <option value="">全部</option>
              {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <WhQuickBtns list={warehouseList} value={filterWarehouse} onChange={setFilterWarehouse} />
          </div>
          <div>
            <label htmlFor="f-pagesize" className="block text-xs text-gray-500 mb-1">每頁筆數</label>
            <select id="f-pagesize" value={pageSize}
              onChange={e => { const s = Number(e.target.value); setPageSize(s); fetchRecords(1, s); }}
              className={inputCls}>
              <option value={50}>50 筆</option>
              <option value={100}>100 筆</option>
              <option value={200}>200 筆</option>
              <option value={500}>500 筆</option>
            </select>
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
              onClick={() => doPrint(
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
                <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">匯入月份</label>
                <input id="f-4" type="month" value={importMonth} onChange={e => setImportMonth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="f-5" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-5" value={importWarehouse} onChange={e => setImportWarehouse(e.target.value)} className={inputCls}>
                  {(warehouseList.length ? warehouseList : [importWarehouse]).map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="span" className="block text-xs text-gray-500 mb-1">
                  選擇檔案
                  {importPreview && <span className="ml-2 text-violet-600 font-semibold">（解析到 {importPreview.totalRows} 筆）</span>}
                </label>
                <input id="span" type="file" accept=".xlsx,.xls,.csv"
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
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                  <span>✓ 匯入完成：{importResult.imported} 筆{importResult.deleted > 0 ? `，刪除 ${importResult.deleted} 筆` : ''}{importResult.skipped > 0 ? `，略過重複 ${importResult.skipped} 筆` : ''}　{importResult.importMonth}／{importResult.warehouse}</span>
                  <span className="text-green-400">|</span>
                  <span className="text-green-700 font-medium">下一步：</span>
                  <button
                    onClick={() => setFilterPayment('unfilled')}
                    className="px-2 py-0.5 rounded bg-white border border-green-300 text-green-700 hover:bg-green-100 whitespace-nowrap">
                    填寫付款明細
                  </button>
                  {onGoToDeposit && (
                    <button
                      onClick={onGoToDeposit}
                      className="px-2 py-0.5 rounded bg-white border border-green-300 text-green-700 hover:bg-green-100 whitespace-nowrap">
                      → 訂金核對
                    </button>
                  )}
                </div>
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
                    try { localStorage.removeItem('bnb_import_history'); } catch {}
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

        {/* 摘要卡（有全月數據時顯示全月；否則顯示本頁） */}
        {(() => {
          const src = auditSummary || recStats;
          const isMonthly = !!auditSummary;
          const tag = recTotal > records.length
            ? (isMonthly ? '全月' : '本頁')
            : '';
          return (
            <div className="mb-4">
              {tag && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${isMonthly ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isMonthly ? '📊 全月合計' : '⚠ 本頁合計'}
                  </span>
                  {auditSummaryLoading && <span className="text-xs text-gray-400 animate-pulse">更新中…</span>}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  { label: '筆數',      val: (isMonthly ? auditSummary.totalCount : recStats.rooms) },
                  { label: '房費+消費', val: NT(isMonthly ? auditSummary.revenue    : recStats.revenue) },
                  { label: '訂金匯款',  val: NT(isMonthly ? auditSummary.payDeposit  : recStats.deposit) },
                  { label: '當天匯款',  val: NT(isMonthly ? auditSummary.payTransfer : recStats.transfer) },
                  { label: '刷卡',      val: NT(isMonthly ? auditSummary.payCard     : recStats.card) },
                  { label: '現金',      val: NT(isMonthly ? auditSummary.payCash     : recStats.cash) },
                  { label: '住宿卷',    val: NT(isMonthly ? auditSummary.payVoucher  : recStats.voucher) },
                  { label: '刷卡手續費', val: NT(isMonthly ? auditSummary.cardFee    : recStats.cardFee) },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className="font-bold text-gray-800 text-sm mt-0.5">{c.val}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 付款完成度橫幅（全月數字優先） */}
        {(() => {
          const isMonthly = !!auditSummary;
          const total      = isMonthly ? auditSummary.totalCount  : recStats.rooms;
          const unf        = isMonthly ? auditSummary.unfilled     : recStats.unfilled;
          const comp       = isMonthly ? auditSummary.complimentary : recStats.complimentary;
          const lck        = isMonthly ? auditSummary.locked        : recStats.locked;
          const mis        = isMonthly ? auditSummary.mismatch      : recStats.mismatch;
          const srcLabel   = isMonthly ? '全月' : (recTotal > records.length ? '本頁' : '本月');
          return (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-white rounded-xl shadow-sm border border-gray-100 text-sm">
          <span className="text-gray-500">{srcLabel}共</span>
          <span className="font-semibold text-gray-800">{total} 筆</span>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => setFilterPayment(filterPayment === 'filled' ? '' : 'filled')}
            className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'filled' ? 'bg-green-100 text-green-800 font-semibold' : 'text-green-600 hover:bg-green-50'}`}>
            已填付款 {total - unf}
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => setFilterPayment(filterPayment === 'unfilled' ? '' : 'unfilled')}
            className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'unfilled' ? 'bg-amber-100 text-amber-800 font-semibold' : unf > 0 ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 cursor-default'}`}
            disabled={unf === 0}>
            未填 {unf} 筆
          </button>
          {comp > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-rose-500">招待 {comp} 筆</span>
            </>
          )}
          <span className="text-gray-300">|</span>
          <span className="text-slate-500">已鎖帳 <span className={lck === total && total > 0 ? 'text-green-600 font-semibold' : 'text-slate-700'}>{lck}</span></span>
          {mis > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => setFilterPayment(filterPayment === 'mismatch' ? '' : 'mismatch')}
                className={`rounded px-2 py-0.5 transition-colors ${filterPayment === 'mismatch' ? 'bg-red-100 text-red-800 font-semibold' : 'text-red-500 hover:bg-red-50 font-medium'}`}>
                金額不符 {mis} 筆{isMonthly ? '（全月）' : (recTotal > records.length ? '（本頁）' : '')}
              </button>
            </>
          )}
          {(mis > 0 || unf > 0) && (
            <>
              <span className="text-gray-300">|</span>
              <button
                onClick={goToPayAudit}
                className="text-xs text-indigo-600 hover:underline font-medium whitespace-nowrap">
                → 付款稽核
              </button>
            </>
          )}
          {filterPayment === 'mismatch' && (
            <button
              onClick={() => {
                const mismatchRows = records.filter(r => {
                  if (r.status === '已刪除' || !r.paymentFilled || r.isComplimentary) return false;
                  const pt = Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0);
                  const ct = Number(r.roomCharge||0)+Number(r.otherCharge||0);
                  return Math.abs(pt - ct) > 0.01;
                });
                if (!mismatchRows.length) return;
                const csvEsc = v => { const s = String(v ?? ''); return `"${s.replace(/"/g, '""')}"`; };
                const headers = ['房客', '入住', '退房', '館別', '應收', '實收', '差額', '狀態'];
                const rows = mismatchRows.map(r => {
                  const ct = Number(r.roomCharge||0)+Number(r.otherCharge||0);
                  const pt = Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0);
                  return [r.guestName||'', r.checkInDate||'', r.checkOutDate||'', r.warehouse||'', ct, pt, pt-ct, r.status||''].map(csvEsc).join(',');
                });
                const blob = new Blob(['﻿'+[headers.map(csvEsc).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `金額不符_${new Date().toISOString().slice(0,10)}.csv`; a.click();
              }}
              className="text-xs px-2.5 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 whitespace-nowrap">
              📥 匯出不符清單
            </button>
          )}
          {filterPayment && (
            <button onClick={() => setFilterPayment('')}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
              清除篩選
            </button>
          )}
          </div>
          );
        })()}

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
            <span className="text-sm font-medium text-amber-800">
              已選 {selectedIds.size} 筆{allPageSelected ? `（本頁全選，另有 ${recTotal - records.length} 筆在其他頁未選取）` : ''}
            </span>
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
          const visibleRecords = filterPayment
            ? records.filter(r => {
                if (filterPayment === 'filled')   return r.paymentFilled;
                if (filterPayment === 'unfilled') return !r.paymentFilled && !r.isComplimentary;
                if (filterPayment === 'mismatch') {
                  if (r.status === '已刪除' || !r.paymentFilled || r.isComplimentary) return false;
                  const pt = Number(r.payDeposit||0)+Number(r.payTransfer||0)+Number(r.payCard||0)+Number(r.payCash||0)+Number(r.payVoucher||0);
                  const ct = Number(r.roomCharge||0)+Number(r.otherCharge||0);
                  return Math.abs(pt - ct) > 0.01;
                }
                return true;
              })
            : records;
          // 逾期未填判斷基準日
          const today = todayStr();

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
                  {/* 手機隱藏：館別、來源（sm+可見） */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">館別</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">來源</th>
                  {/* 必顯：姓名 */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">姓名</th>
                  {/* 手機隱藏：房間 */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">房間</th>
                  {/* 必顯：入住、退房 */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">入住</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">退房</th>
                  {/* 手機隱藏：房費、消費 */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden md:table-cell">房費</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden md:table-cell">消費</th>
                  {/* 付款欄：手機隱藏 */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden lg:table-cell">
                    訂金{editMode && <span className="block text-[10px] font-normal opacity-60">後五碼</span>}
                  </th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden lg:table-cell">
                    當天匯款{editMode && <span className="block text-[10px] font-normal opacity-60">後五碼</span>}
                  </th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden lg:table-cell">刷卡</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden xl:table-cell">手續費</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden lg:table-cell">現金</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden xl:table-cell">住宿卷</th>
                  {/* 金流、狀態：md+ */}
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden md:table-cell">金流</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">狀態</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap hidden sm:table-cell">備註</th>
                  {!editMode && <th className="px-3 py-2 text-center font-medium whitespace-nowrap">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRecords.length === 0 && (
                  <tr><td colSpan={19} className="text-center py-10 text-gray-400">
                    {filterPayment === 'filled'
                      ? '目前條件下無已填付款記錄，可嘗試調整月份或館別篩選'
                      : filterPayment === 'unfilled'
                        ? '目前條件下無未填付款記錄，表示所有訂單均已完成付款登記'
                        : '目前查詢範圍無資料，請確認月份與館別設定，或新增訂房記錄'}
                  </td></tr>
                )}
                {visibleRecords.map(r => {
                  const isSelected      = selectedIds.has(r.id);
                  const isDeleted       = r.status === '已刪除';
                  const isRowLocked     = !!r.paymentLocked;
                  const isLocked        = isRowLocked || monthLocked;
                  const inExcelMode     = editMode && !isDeleted && !isLocked;
                  const isDirty         = dirtyIds.has(r.id);
                  const hasRowError     = rowErrors[r.id];
                  const isOverdueUnpaid = !isDeleted && r.status === '已退房' && !r.paymentFilled && !r.isComplimentary && r.checkOutDate && r.checkOutDate < today;
                  const payTotal        = Number(r.payDeposit) + Number(r.payTransfer) + Number(r.payCard) + Number(r.payCash) + Number(r.payVoucher);
                  const chargeTotal     = Number(r.roomCharge) + Number(r.otherCharge);
                  const paymentMismatch = !isDeleted && r.paymentFilled && !r.isComplimentary && Math.abs(payTotal - chargeTotal) > 0.01;

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
                    <tr key={r.id}
                      title={hasRowError || undefined}
                      className={`
                      ${isSelected ? 'bg-amber-50' : isLocked ? 'bg-slate-50' : paymentMismatch ? 'bg-orange-50' : isOverdueUnpaid ? 'bg-red-50' : isPaymentComplete ? 'bg-gray-100 text-gray-400' : 'hover:bg-gray-50'}
                      ${isDeleted ? 'opacity-40' : ''}
                      ${hasRowError ? 'ring-2 ring-inset ring-red-400' : editMode && isDirty ? 'ring-1 ring-inset ring-emerald-200' : ''}
                    `}>
                      <td className="px-3 py-2">
                        {!isDeleted && (
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)}
                            className="rounded cursor-pointer" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap hidden sm:table-cell">{r.warehouse}</td>
                      <td className="px-3 py-2 whitespace-nowrap hidden sm:table-cell">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[r.source] || SOURCE_COLORS['其他']}`}>{r.source}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap max-w-[140px]">
                        <span className="truncate">{r.guestName}</span>
                        {inExcelMode ? (
                          <label className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-rose-600 cursor-pointer align-middle whitespace-nowrap"
                            title="招待（免費，收款 $0 也算已填）" onClick={e => e.stopPropagation()}>
                            <input type="checkbox"
                              checked={!!(editMap[r.id]?.isComplimentary ?? r.isComplimentary)}
                              onChange={e => updateCell(r.id, 'isComplimentary', e.target.checked)}
                              className="rounded accent-rose-500" />
                            招待
                          </label>
                        ) : (
                          r.isComplimentary && <span className="ml-1 text-[10px] bg-rose-100 text-rose-600 px-1 py-0.5 rounded">招待</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs hidden sm:table-cell">{r.roomNo || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">
                        {r.checkInDate}
                        {r.checkOutDate && r.checkOutDate.substring(0, 7) !== r.importMonth && (
                          <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium"
                            title={`退房日 ${r.checkOutDate} 與入住月 ${r.importMonth} 不同月份；此訂單收入整筆計入入住月`}>跨月</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap hidden sm:table-cell">{r.checkOutDate}</td>
                      <td className={`px-3 py-2 text-right hidden md:table-cell ${paymentMismatch ? 'text-red-600' : ''}`}>
                        {Math.round(Number(r.roomCharge)).toLocaleString()}
                        {paymentMismatch && (
                          <div className="text-[10px] text-red-500 whitespace-nowrap" title={`收款合計 ${Math.round(payTotal).toLocaleString()} ≠ 房費+消費 ${Math.round(chargeTotal).toLocaleString()}`}>
                            差 {(payTotal - chargeTotal) > 0 ? '+' : ''}{Math.round(payTotal - chargeTotal).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 hidden md:table-cell">{Number(r.otherCharge) > 0 ? Math.round(Number(r.otherCharge)).toLocaleString() : '—'}</td>

                      {/* 訂金 + 後五碼（點擊開啟付款 Modal 以填寫日期+後五碼） */}
                      <td className="px-3 py-1.5 text-right hidden lg:table-cell">
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
                      <td className="px-3 py-1.5 text-right hidden lg:table-cell">
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
                      <td className="px-3 py-1.5 text-right hidden lg:table-cell">
                        {inExcelMode ? (
                          <div className="flex flex-col gap-0.5 items-end">
                            {excelInput('payCard', 'border-purple-300 focus:ring-purple-300')}
                            <input
                              id={`pc-${r.id}-cardSettlementDate`}
                              type="date"
                              value={editMap[r.id]?.cardSettlementDate ?? (r.cardSettlementDate || '')}
                              onChange={e => updateCell(r.id, 'cardSettlementDate', e.target.value)}
                              onKeyDown={e => handlePayKeyDown(e, r.id, 'cardSettlementDate', editableRecords)}
                              className={`w-32 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 border-purple-200 focus:ring-purple-300 ${(editMap[r.id]?.cardSettlementDate !== undefined) ? 'bg-yellow-50' : 'bg-white'} text-purple-500`}
                            />
                          </div>
                        ) : editCell('payCard', 'text-purple-600')}
                      </td>

                      {/* 手續費（唯讀） */}
                      <td className="px-3 py-2 text-right text-red-400 text-xs hidden xl:table-cell">
                        {Number(r.cardFee) > 0 ? Math.round(Number(r.cardFee)).toLocaleString() : '—'}
                      </td>

                      {/* 現金 */}
                      <td className="px-3 py-1.5 text-right hidden lg:table-cell">
                        {inExcelMode ? (
                          <div className="flex flex-col gap-0.5 items-end">
                            {excelInput('payCash', 'border-green-300 focus:ring-green-300')}
                            {/* 存帳日期（非老闆收取時顯示） */}
                            {(editMap[r.id]?.cashDestination ?? r.cashDestination) !== '老闆收取' && (
                              <input
                                id={`pc-${r.id}-cashDepositDate`}
                                type="date"
                                value={editMap[r.id]?.cashDepositDate ?? (r.cashDepositDate || '')}
                                onChange={e => updateCell(r.id, 'cashDepositDate', e.target.value)}
                                onKeyDown={e => handlePayKeyDown(e, r.id, 'cashDepositDate', editableRecords)}
                                className={`w-32 border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 border-green-200 focus:ring-green-300 ${(editMap[r.id]?.cashDepositDate !== undefined) ? 'bg-yellow-50' : 'bg-white'} text-green-500`}
                              />
                            )}
                            <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none"
                              title="勾選表示此現金由老闆直接收取">
                              <input type="checkbox"
                                id={`pc-${r.id}-cashDestination`}
                                checked={(editMap[r.id]?.cashDestination ?? r.cashDestination) === '老闆收取'}
                                onChange={e => updateCell(r.id, 'cashDestination', e.target.checked ? '老闆收取' : '')}
                                className="w-3 h-3 accent-orange-500 cursor-pointer" />
                              <span className={(editMap[r.id]?.cashDestination ?? r.cashDestination) === '老闆收取' ? 'text-orange-600 font-medium' : 'text-gray-400'}>老闆收現</span>
                            </label>
                          </div>
                        ) : editCell('payCash', 'text-green-600')}
                      </td>

                      {/* 住宿卷 */}
                      <td className="px-3 py-1.5 text-right hidden xl:table-cell">
                        {inExcelMode ? excelInput('payVoucher', 'border-amber-300 focus:ring-amber-300') : editCell('payVoucher', 'text-amber-600')}
                      </td>

                      {/* 金流狀態 */}
                      <td className="px-3 py-1.5 hidden md:table-cell">
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
                      <td className="px-3 py-2 hidden sm:table-cell">{noteCell()}</td>

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
    </>
  );
}
