'use client';

import React from 'react';
import Link from 'next/link';
import { CC_STATUS_MAP } from '@/components/reconciliation/useCreditCardTab';
import FetchErrorBanner from '@/components/FetchErrorBanner';

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function CreditCardTab({
  ccStatements, ccSummary, ccMerchantConfigs, ccLoading,
  ccMonth, setCcMonth, ccWarehouseFilter, setCcWarehouseFilter,
  ccStatusFilter, setCcStatusFilter, ccExpandedId, setCcExpandedId,
  ccBuildings, ccShowUpload, setCcShowUpload,
  ccUploadWarehouse, setCcUploadWarehouse, ccParsedData, setCcParsedData,
  ccMatchResults, ccMatchLoading, ccInnerTab, setCcInnerTab,
  ccPmsRecords, ccPmsLoading,
  ccPmsStartDate, setCcPmsStartDate, ccPmsEndDate, setCcPmsEndDate,
  ccPmsWarehouse, setCcPmsWarehouse,
  ccShowConfigModal, setCcShowConfigModal,
  ccConfigForm, setCcConfigForm, ccBankType, setCcBankType, ccConfigSaving,
  fetchCcPmsData, handleCcPdfUpload,
  saveParsedCcStatement, matchCcPms, matchAllCcPms,
  toggleCcConfirm, deleteCcStatement, saveCcConfig,
  fetchError, onRetryFetch,
}) {
  const summaryRows = ccSummary?.summary || [];
  const grandTotal = ccSummary?.grandTotal || {};

  // PMS records grouped by date for comparison
  const pmsByDate = {};
  for (const r of ccPmsRecords) {
    if (!pmsByDate[r.businessDate]) pmsByDate[r.businessDate] = { records: [], total: 0 };
    pmsByDate[r.businessDate].records.push(r);
    pmsByDate[r.businessDate].total += Number(r.amount);
  }
  const pmsTotalAmount = ccPmsRecords.reduce((s, r) => s + Number(r.amount), 0);
  const pmsGroupedByWarehouse = {};
  for (const r of ccPmsRecords) {
    if (!pmsGroupedByWarehouse[r.warehouse]) pmsGroupedByWarehouse[r.warehouse] = 0;
    pmsGroupedByWarehouse[r.warehouse] += Number(r.amount);
  }

  return (
    <div className="space-y-4">
      {fetchError && <FetchErrorBanner message={fetchError} onRetry={onRetryFetch} />}
      {/* 提示：已整合到 PMS 收入 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-amber-500 text-lg shrink-0">ℹ️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">信用卡對帳已整合至 PMS 收入管理</p>
            <p className="text-xs text-amber-600 mt-0.5">建議前往 PMS 收入頁面的「信用卡對帳」tab 操作，功能更完整且同步。此處保留為舊版備查介面。</p>
          </div>
        </div>
        <Link href="/pms-income?tab=creditCardStatement" className="shrink-0 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-600">
          前往新版 →
        </Link>
      </div>

      {/* Inner sub-tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setCcInnerTab('statements')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${ccInnerTab === 'statements' ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >信用卡對帳單</button>
        <button
          onClick={() => setCcInnerTab('pms')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${ccInnerTab === 'pms' ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >PMS信用卡收入</button>
      </div>

      {/* ===== PMS sub-tab ===== */}
      {ccInnerTab === 'pms' && (
        <div className="space-y-4">
          {/* Search filters */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="f" className="block text-xs text-gray-500 mb-1">開始日期</label>
                <input id="f" type="date" value={ccPmsStartDate} onChange={e => setCcPmsStartDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-2" className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input id="f-2" type="date" value={ccPmsEndDate} onChange={e => setCcPmsEndDate(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">館別</label>
                <select id="f-3" value={ccPmsWarehouse} onChange={e => setCcPmsWarehouse(e.target.value)}
                  className="border rounded-lg px-3 py-1.5 text-sm">
                  <option value="">全部</option>
                  {ccBuildings.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>
              <button onClick={fetchCcPmsData} disabled={ccPmsLoading}
                className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
                {ccPmsLoading ? '查詢中...' : '查詢'}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          {ccPmsRecords.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-gray-500">PMS信用卡總筆數</p>
                <p className="text-2xl font-bold text-violet-700 mt-1">{ccPmsRecords.length}</p>
              </div>
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <p className="text-xs text-gray-500">PMS信用卡總金額</p>
                <p className="text-2xl font-bold text-violet-700 mt-1">{formatMoney(pmsTotalAmount)}</p>
              </div>
              {Object.entries(pmsGroupedByWarehouse).map(([w, amt]) => (
                <div key={w} className="bg-white rounded-xl border shadow-sm p-4">
                  <p className="text-xs text-gray-500">{w}</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{formatMoney(amt)}</p>
                </div>
              ))}
            </div>
          )}

          {/* PMS vs Statement comparison */}
          {ccPmsRecords.length > 0 && ccStatements.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-violet-50 border-b">
                <h4 className="text-sm font-semibold text-violet-800">PMS 信用卡 vs 銀行對帳單 比對</h4>
                <p className="text-xs text-gray-500 mt-0.5">以館別為單位，比較 PMS 匯入金額與信用卡請款金額</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">PMS信用卡金額</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">銀行請款金額</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">差異</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Object.entries(pmsGroupedByWarehouse).map(([w, pmsAmt]) => {
                      const stmts = ccStatements.filter(s => s.warehouse === w);
                      const stmtAmt = stmts.reduce((sum, s) => sum + Number(s.totalAmount), 0);
                      const diff = pmsAmt - stmtAmt;
                      const matched = stmts.length > 0 && Math.abs(diff) < 1;
                      return (
                        <tr key={w} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{w}</td>
                          <td className="px-3 py-2 text-right font-mono text-violet-700">{formatMoney(pmsAmt)}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{stmts.length > 0 ? formatMoney(stmtAmt) : <span className="text-gray-400">尚無對帳單</span>}</td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${Math.abs(diff) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                            {stmts.length > 0 ? (diff >= 0 ? '+' : '') + formatMoney(diff) : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {stmts.length === 0
                              ? <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">無對帳單</span>
                              : matched
                                ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">金額相符</span>
                                : <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">有差異</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PMS detail records */}
          {ccPmsLoading ? (
            <div className="text-center py-12 text-gray-500">載入中...</div>
          ) : ccPmsRecords.length === 0 ? (
            <div className="bg-white rounded-xl border shadow-sm p-8 text-center text-gray-500">
              <p className="text-sm">尚無資料，請選擇日期範圍後點擊查詢</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">每日信用卡收入明細（共 {ccPmsRecords.length} 筆）</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">日期</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">PMS科目</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金額</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">批次</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ccPmsRecords.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">{r.businessDate}</td>
                        <td className="px-3 py-2 text-gray-700">{r.warehouse}</td>
                        <td className="px-3 py-2 text-gray-600">{r.pmsColumnName}</td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-violet-700">{formatMoney(r.amount)}</td>
                        <td className="px-3 py-2 text-xs text-gray-400">{r.importBatch?.batchNo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-gray-700">合計</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">{formatMoney(pmsTotalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Statements sub-tab ===== */}
      {ccInnerTab === 'statements' && <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">月份</label>
            <input id="f-4" type="month" value={ccMonth} onChange={e => setCcMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label htmlFor="f-5" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="f-5" value={ccWarehouseFilter} onChange={e => setCcWarehouseFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">全部</option>
              {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-30" className="block text-xs text-gray-500 mb-1">狀態</label>
            <select id="f-30" value={ccStatusFilter} onChange={e => setCcStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="all">全部</option>
              <option value="pending">待對帳</option>
              <option value="matched">已對帳</option>
              <option value="confirmed">已確認</option>
            </select>
          </div>
          <div className="flex items-end gap-2 ml-auto">
            <button onClick={() => setCcShowConfigModal(true)}
              className="px-4 py-1.5 border border-violet-300 text-violet-700 text-sm rounded-lg hover:bg-violet-50">
              特約商店設定
            </button>
            <button onClick={matchAllCcPms}
              disabled={ccStatements.filter(s => s.status !== 'confirmed').length === 0}
              className="px-4 py-1.5 border border-blue-300 text-blue-700 text-sm rounded-lg hover:bg-blue-50 disabled:opacity-50">
              批次比對 PMS
            </button>
            <button onClick={() => { setCcShowUpload(true); setCcParsedData(null); }}
              className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700">
              上傳 PDF 對帳單
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Summary Table */}
      {summaryRows.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b">
            <h4 className="text-sm font-semibold text-violet-800">
              {ccMonth.replace('-', ' 年 ')} 月 各館信用卡對帳匯總
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">筆數</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">請款金額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">手續費</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">撥款淨額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">PMS金額</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">差異</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaryRows.map(row => {
                  const si = CC_STATUS_MAP[row.status] || CC_STATUS_MAP.no_data;
                  return (
                    <tr key={row.warehouseId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{row.warehouse}</td>
                      <td className="px-3 py-2 text-center">{row.totalCount}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatMoney(row.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(row.netAmount)}</td>
                      <td className="px-3 py-2 text-right">{row.pmsAmount ? formatMoney(row.pmsAmount) : '-'}</td>
                      <td className={`px-3 py-2 text-right font-medium ${row.difference > 0 ? 'text-green-600' : row.difference < 0 ? 'text-red-600' : ''}`}>
                        {row.stmtCount > 0 ? (row.difference > 0 ? '+' : '') + formatMoney(row.difference) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${si.color}`}>{si.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-violet-50 font-semibold text-sm">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-center">{grandTotal.totalCount || 0}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.totalAmount)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{formatMoney(grandTotal.totalFee)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.netAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(grandTotal.pmsAmount)}</td>
                  <td className={`px-3 py-2 text-right ${(grandTotal.difference || 0) !== 0 ? 'text-orange-600' : ''}`}>
                    {(grandTotal.difference > 0 ? '+' : '') + formatMoney(grandTotal.difference || 0)}
                  </td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Statements List */}
      {ccLoading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : ccStatements.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
          <p>本月尚無信用卡對帳單</p>
          <p className="text-sm mt-1">點擊「上傳 PDF 對帳單」匯入銀行撥款對帳單</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-4 py-3 bg-violet-50 border-b flex items-center justify-between">
            <h4 className="text-sm font-semibold text-violet-800">對帳單明細 ({ccStatements.length} 筆)</h4>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-8"></th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">請款日</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">撥款日</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">筆數</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">請款金額</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">手續費</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">撥款淨額</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">狀態</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ccStatements.map(stmt => {
                const si = CC_STATUS_MAP[stmt.status] || CC_STATUS_MAP.pending;
                const isExpanded = ccExpandedId === stmt.id;
                return (
                  <React.Fragment key={stmt.id}>
                    <tr className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-violet-50/50' : ''}`}
                      onClick={() => setCcExpandedId(isExpanded ? null : stmt.id)}>
                      <td className="px-3 py-2 text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{stmt.warehouse}</td>
                      <td className="px-3 py-2">{stmt.billingDate}</td>
                      <td className="px-3 py-2 text-gray-500">{stmt.paymentDate || '-'}</td>
                      <td className="px-3 py-2 text-center">{stmt.totalCount}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(stmt.totalAmount)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatMoney(stmt.totalFee)}</td>
                      <td className="px-3 py-2 text-right font-medium text-violet-700">{formatMoney(stmt.netAmount)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${si.color}`}>{si.label}</span>
                      </td>
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => matchCcPms(stmt.id)} title="比對PMS"
                            className="text-blue-600 hover:text-blue-800 text-xs px-1.5 py-0.5 border border-blue-200 rounded hover:bg-blue-50">
                            比對
                          </button>
                          {stmt.status !== 'confirmed' ? (
                            <button onClick={() => toggleCcConfirm(stmt.id, stmt.status)} title="確認"
                              className="text-green-600 hover:text-green-800 text-xs px-1.5 py-0.5 border border-green-200 rounded hover:bg-green-50">
                              確認
                            </button>
                          ) : (
                            <button onClick={() => toggleCcConfirm(stmt.id, stmt.status)} title="取消確認"
                              className="text-orange-600 hover:text-orange-800 text-xs px-1.5 py-0.5 border border-orange-200 rounded hover:bg-orange-50">
                              取消
                            </button>
                          )}
                          {stmt.status !== 'confirmed' && (
                            <button onClick={() => deleteCcStatement(stmt.id)} title="刪除"
                              className="text-red-500 hover:text-red-700 text-xs px-1.5 py-0.5 border border-red-200 rounded hover:bg-red-50">
                              刪除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded Detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-4 py-4 bg-violet-50/30">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Left: Batch Lines */}
                            <div className="bg-white rounded-lg border p-4">
                              <h5 className="text-sm font-semibold text-gray-700 mb-2">批次明細</h5>
                              {stmt.batchLines?.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-2 py-1 text-left">終端機</th>
                                      <th className="px-2 py-1 text-left">批次</th>
                                      <th className="px-2 py-1 text-left">卡別</th>
                                      <th className="px-2 py-1 text-center">筆數</th>
                                      <th className="px-2 py-1 text-right">金額</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {stmt.batchLines.map((l, i) => (
                                      <tr key={i}>
                                        <td className="px-2 py-1 font-mono">{l.terminalId}</td>
                                        <td className="px-2 py-1 font-mono">{l.batchNo}</td>
                                        <td className="px-2 py-1">
                                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                                            l.cardType === 'VISA' ? 'bg-blue-100 text-blue-700' :
                                            l.cardType === 'MASTER' ? 'bg-red-100 text-red-700' :
                                            l.cardType === 'JCB' ? 'bg-green-100 text-green-700' :
                                            'bg-gray-100 text-gray-700'
                                          }`}>{l.cardType}</span>
                                        </td>
                                        <td className="px-2 py-1 text-center">{l.count}</td>
                                        <td className="px-2 py-1 text-right font-medium">{formatMoney(l.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : <p className="text-xs text-gray-400">無批次明細</p>}
                            </div>

                            {/* Right: Fee Details + PMS */}
                            <div className="space-y-4">
                              <div className="bg-white rounded-lg border p-4">
                                <h5 className="text-sm font-semibold text-gray-700 mb-2">手續費明細</h5>
                                {stmt.feeDetails?.length > 0 ? (
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-left">類型</th>
                                        <th className="px-2 py-1 text-left">卡別</th>
                                        <th className="px-2 py-1 text-center">筆數</th>
                                        <th className="px-2 py-1 text-right">金額</th>
                                        <th className="px-2 py-1 text-right">手續費</th>
                                        <th className="px-2 py-1 text-right">費率</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {stmt.feeDetails.map((d, i) => (
                                        <tr key={i}>
                                          <td className="px-2 py-1">{d.origin}</td>
                                          <td className="px-2 py-1">{d.cardType}</td>
                                          <td className="px-2 py-1 text-center">{d.count}</td>
                                          <td className="px-2 py-1 text-right">{formatMoney(d.amount)}</td>
                                          <td className="px-2 py-1 text-right text-red-600">{formatMoney(d.fee)}</td>
                                          <td className="px-2 py-1 text-right text-gray-500">{d.feeRate ? d.feeRate + '%' : '-'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : <p className="text-xs text-gray-400">無手續費明細</p>}
                              </div>

                              {/* PMS comparison */}
                              <div className="bg-white rounded-lg border p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h5 className="text-sm font-semibold text-gray-700">PMS 信用卡收入比對</h5>
                                  <button
                                    onClick={() => matchCcPms(stmt.id)}
                                    disabled={ccMatchLoading[stmt.id] || stmt.status === 'confirmed'}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {ccMatchLoading[stmt.id] ? (
                                      <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />比對中…</>
                                    ) : '比對 PMS'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <div className="text-xs text-gray-500 mb-1">銀行請款金額</div>
                                    <div className="font-bold text-lg">{formatMoney(stmt.totalAmount)}</div>
                                  </div>
                                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                                    <div className="text-xs text-gray-500 mb-1">PMS 信用卡收入</div>
                                    <div className="font-bold text-lg text-blue-700">{stmt.pmsAmount != null ? formatMoney(stmt.pmsAmount) : <span className="text-gray-400 text-sm">未比對</span>}</div>
                                  </div>
                                  <div className={`rounded-lg p-3 text-center ${stmt.difference == null ? 'bg-gray-50' : Math.abs(stmt.difference) < 1 ? 'bg-green-50' : 'bg-red-50'}`}>
                                    <div className="text-xs text-gray-500 mb-1">差異</div>
                                    <div className={`font-bold text-lg ${stmt.difference > 0 ? 'text-green-700' : stmt.difference < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                      {stmt.difference != null ? (stmt.difference > 0 ? '+' : '') + formatMoney(stmt.difference) : <span className="text-gray-400 text-sm">-</span>}
                                    </div>
                                    {stmt.difference != null && Math.abs(stmt.difference) < 1 && (
                                      <div className="text-xs text-green-600 mt-0.5">✓ 吻合</div>
                                    )}
                                  </div>
                                </div>

                                {/* Matched PMS records detail */}
                                {ccMatchResults[stmt.id] && (
                                  <div className="mt-2 border-t pt-2">
                                    <div className="text-xs text-gray-500 mb-1.5">
                                      比對日期：{ccMatchResults[stmt.id].matchedDates?.join('、')}
                                    </div>
                                    {ccMatchResults[stmt.id].pmsRecords?.length > 0 ? (
                                      <table className="w-full text-xs">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                          <tr>
                                            <th className="px-2 py-1 text-left text-gray-500">日期</th>
                                            <th className="px-2 py-1 text-left text-gray-500">項目</th>
                                            <th className="px-2 py-1 text-right text-gray-500">金額</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {ccMatchResults[stmt.id].pmsRecords.map((r, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                              <td className="px-2 py-1 text-gray-600">{r.businessDate}</td>
                                              <td className="px-2 py-1 text-gray-700">{r.pmsColumnName}</td>
                                              <td className="px-2 py-1 text-right font-medium">{formatMoney(r.amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p className="text-xs text-orange-600">未找到對應 PMS 信用卡收入紀錄</p>
                                    )}
                                  </div>
                                )}

                                {stmt.note && <p className="text-xs text-gray-500 mt-2 pt-2 border-t">備註：{stmt.note}</p>}
                              </div>

                              {/* Summary info */}
                              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-sm">
                                <div className="flex justify-between">
                                  <span>特店代號</span><span className="font-mono">{stmt.merchantId || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>入帳帳號</span><span className="font-mono">{stmt.accountNo || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>銀行</span><span>{stmt.bankName || '-'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </div>}

      {/* Upload PDF Modal */}
      {ccShowUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-xl mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">上傳信用卡對帳單 PDF</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                <select id="f-6" value={ccUploadWarehouse} onChange={e => setCcUploadWarehouse(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">選擇館別</option>
                  {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-31" className="block text-sm font-medium text-gray-700 mb-1">銀行 *</label>
                <select id="f-31" value={ccBankType} onChange={e => { setCcBankType(e.target.value); setCcParsedData(null); }}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="國泰世華">國泰世華</option>
                  <option value="玉山">玉山銀行</option>
                  <option value="台新">台新銀行</option>
                  <option value="中信">中國信託</option>
                  <option value="合庫">合作金庫</option>
                  <option value="第一">第一銀行</option>
                  <option value="土銀">土地銀行</option>
                  <option value="台灣銀行">台灣銀行</option>
                  <option value="郵局">中華郵政</option>
                </select>
              </div>
              <div>
                <label htmlFor="pdf" className="block text-sm font-medium text-gray-700 mb-1">選擇 PDF 檔案</label>
                <input id="pdf" type="file" accept=".pdf,.txt" onChange={handleCcPdfUpload}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">
                  {ccBankType === '國泰世華' ? '支援國泰世華信用卡特約商店撥款對帳單 PDF' : `支援 ${ccBankType} 信用卡特約商店對帳單 PDF（通用解析）`}
                </p>
              </div>

              {ccParsedData && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">解析結果</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">特店名稱：</span>{ccParsedData.merchantName}</div>
                    <div><span className="text-gray-500">特店代號：</span>{ccParsedData.merchantId}</div>
                    <div><span className="text-gray-500">請款日：</span>{ccParsedData.billingDate}</div>
                    <div><span className="text-gray-500">撥款日：</span>{ccParsedData.paymentDate}</div>
                    <div><span className="text-gray-500">筆數：</span>{ccParsedData.totalCount}</div>
                    <div><span className="text-gray-500">請款金額：</span>{formatMoney(ccParsedData.totalAmount)}</div>
                    <div><span className="text-gray-500">手續費：</span>{formatMoney(ccParsedData.totalFee)}</div>
                    <div><span className="text-gray-500">撥款淨額：</span><span className="font-bold text-violet-700">{formatMoney(ccParsedData.netAmount)}</span></div>
                  </div>
                  {ccParsedData.batchLines?.length > 0 && (
                    <p className="text-xs text-green-700 mt-2">批次明細 {ccParsedData.batchLines.length} 筆 / 手續費明細 {ccParsedData.feeDetails?.length || 0} 筆</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setCcShowUpload(false); setCcParsedData(null); setCcBankType('國泰世華'); }}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={saveParsedCcStatement} disabled={!ccParsedData || !ccUploadWarehouse}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
                匯入對帳單
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merchant Config Modal */}
      {ccShowConfigModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">信用卡特約商店設定</h3>

            {/* Existing configs */}
            {ccMerchantConfigs.length > 0 && (
              <div className="mb-4 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs">館別</th>
                      <th className="px-3 py-1.5 text-left text-xs">銀行</th>
                      <th className="px-3 py-1.5 text-left text-xs">特店代號</th>
                      <th className="px-3 py-1.5 text-right text-xs">國內%</th>
                      <th className="px-3 py-1.5 text-right text-xs">國外%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ccMerchantConfigs.map(c => (
                      <tr key={c.id}>
                        <td className="px-3 py-1.5">{c.warehouse?.name}</td>
                        <td className="px-3 py-1.5">{c.bankName}</td>
                        <td className="px-3 py-1.5 font-mono">{c.merchantId}</td>
                        <td className="px-3 py-1.5 text-right">{Number(c.domesticFeeRate)}%</td>
                        <td className="px-3 py-1.5 text-right">{Number(c.foreignFeeRate)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add form */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-7" className="block text-xs text-gray-500 mb-1">館別 *</label>
                  <select id="f-7" value={ccConfigForm.warehouseId} onChange={e => setCcConfigForm({...ccConfigForm, warehouseId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm">
                    <option value="">選擇</option>
                    {ccBuildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-32" className="block text-xs text-gray-500 mb-1">銀行名稱 *</label>
                  <input id="f-32" type="text" value={ccConfigForm.bankName} onChange={e => setCcConfigForm({...ccConfigForm, bankName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-33" className="block text-xs text-gray-500 mb-1">特店代號 *</label>
                  <input id="f-33" type="text" value={ccConfigForm.merchantId} onChange={e => setCcConfigForm({...ccConfigForm, merchantId: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="例: 310800073" />
                </div>
                <div>
                  <label htmlFor="f-8" className="block text-xs text-gray-500 mb-1">特店名稱</label>
                  <input id="f-8" type="text" value={ccConfigForm.merchantName} onChange={e => setCcConfigForm({...ccConfigForm, merchantName: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label htmlFor="f-9" className="block text-xs text-gray-500 mb-1">入帳帳號</label>
                <input id="f-9" type="text" value={ccConfigForm.accountNo} onChange={e => setCcConfigForm({...ccConfigForm, accountNo: e.target.value})}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">國內手續費率%</label>
                  <input id="f-10" type="number" step="0.01" value={ccConfigForm.domesticFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, domesticFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-11" className="block text-xs text-gray-500 mb-1">國外手續費率%</label>
                  <input id="f-11" type="number" step="0.01" value={ccConfigForm.foreignFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, foreignFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label htmlFor="f-12" className="block text-xs text-gray-500 mb-1">自行卡費率%</label>
                  <input id="f-12" type="number" step="0.01" value={ccConfigForm.selfFeeRate}
                    onChange={e => setCcConfigForm({...ccConfigForm, selfFeeRate: e.target.value})}
                    className="w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setCcShowConfigModal(false)}
                className="px-4 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50" disabled={ccConfigSaving}>關閉</button>
              <button onClick={saveCcConfig}
                disabled={ccConfigSaving}
                className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">{ccConfigSaving ? '儲存中…' : '儲存設定'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
