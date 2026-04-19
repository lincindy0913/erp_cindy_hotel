'use client';

import { formatNumber, formatDate } from './pmsIncomeFormatters';
import PmsIncomeCalendarGrid from './PmsIncomeCalendarGrid';

export default function PmsIncomeOverviewTab({
  overviewYear,
  setOverviewYear,
  overviewMonth,
  setOverviewMonth,
  fetchOverviewData,
  loading,
  monthlySummary,
  batches,
  WAREHOUSES,
  buildingList,
  selectedWarehouseForUpload,
  setOverviewUploadWarehouse,
  setUploadWarehouse,
  setShowUploadModal,
  handleExcelUpload,
  excelParsing,
  handleDeleteBatch,
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={overviewYear}
            onChange={(e) => setOverviewYear(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            value={overviewMonth}
            onChange={(e) => setOverviewMonth(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchOverviewData}
            className="px-3 py-2 text-sm border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50"
          >
            重新整理
          </button>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            <span>快取啟用中</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            id="pms-excel-upload"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleExcelUpload(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => {
              setUploadWarehouse(selectedWarehouseForUpload);
              setShowUploadModal(true);
            }}
            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            匯入 PMS 日報表
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border-2 border-amber-100 p-4">
        <h3 className="text-sm font-bold text-teal-800 mb-2 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 text-lg">↑</span>
          上傳 Excel（日營業報表）
        </h3>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-sm font-medium text-gray-700">上傳前請選擇館別：</label>
          <select
            value={selectedWarehouseForUpload}
            onChange={(e) => setOverviewUploadWarehouse(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            {buildingList.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">此檔案將匯入至「{selectedWarehouseForUpload}」</span>
          <button
            type="button"
            onClick={() => document.getElementById('pms-excel-upload')?.click()}
            disabled={excelParsing}
            className="ml-2 px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {excelParsing ? '解析中...' : '選擇檔案'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          上傳後系統會自動帶入營業日期、各科目金額與房間數／住房率／平均房價，請會計核對無誤後再按「確認匯入」存檔。
        </p>
        <div
          className="border-2 border-dashed border-amber-200 rounded-lg p-6 text-center bg-amber-50/50 hover:bg-amber-50 transition-colors cursor-pointer"
          onClick={() => document.getElementById('pms-excel-upload')?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('border-amber-400', 'bg-amber-50');
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('border-amber-400', 'bg-amber-50');
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('border-amber-400', 'bg-amber-50');
            const f = e.dataTransfer?.files?.[0];
            if (f) handleExcelUpload(f);
          }}
        >
          <svg className="w-10 h-10 text-amber-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <span className="text-sm font-medium text-amber-800 block">
            {excelParsing ? '解析中...' : '點此或拖曳 Excel 檔案至此（.xlsx / .xls）'}
          </span>
        </div>
      </div>

      {monthlySummary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-4">
            <div className="text-xs text-gray-500 mb-1">本月淨收入</div>
            <div className="text-xl font-bold text-teal-700">{formatNumber(monthlySummary.total)}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-4">
            <div className="text-xs text-gray-500 mb-1">已匯入天數</div>
            <div className="text-xl font-bold text-teal-700">
              {monthlySummary.importedDays} / {monthlySummary.totalDays}
            </div>
          </div>
          {Object.entries(monthlySummary.byWarehouse || {}).map(([wh, data]) => (
            <div key={wh} className="bg-white rounded-lg shadow-sm border border-teal-100 p-4">
              <div className="text-xs text-gray-500 mb-1">{wh} 貸方合計</div>
              <div className="text-xl font-bold text-teal-700">{formatNumber(data.credit)}</div>
              <div className="text-xs text-gray-400">{data.importedDays} 天已匯入</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">每日匯入狀態</h3>
        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : (
          <PmsIncomeCalendarGrid
            overviewYear={overviewYear}
            overviewMonth={overviewMonth}
            batches={batches}
            warehouses={WAREHOUSES}
            monthlySummary={monthlySummary}
          />
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">匯入批次列表</h3>
        {batches.length === 0 ? (
          <p className="text-gray-400 text-center py-4">本月尚無匯入批次</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-medium">批次號</th>
                  <th className="px-3 py-2 font-medium">館別</th>
                  <th className="px-3 py-2 font-medium">營業日期</th>
                  <th className="px-3 py-2 font-medium">檔案名稱</th>
                  <th className="px-3 py-2 font-medium text-right">貸方合計</th>
                  <th className="px-3 py-2 font-medium text-right">借方合計</th>
                  <th className="px-3 py-2 font-medium text-right">差額</th>
                  <th className="px-3 py-2 font-medium text-center">筆數</th>
                  <th className="px-3 py-2 font-medium text-center">早餐人數</th>
                  <th className="px-3 py-2 font-medium text-center">狀態</th>
                  <th className="px-3 py-2 font-medium text-center">信用卡對帳</th>
                  <th className="px-3 py-2 font-medium">匯入時間</th>
                  <th className="px-3 py-2 font-medium text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{batch.batchNo}</td>
                    <td className="px-3 py-2">{batch.warehouse}</td>
                    <td className="px-3 py-2">{formatDate(batch.businessDate)}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 max-w-[150px] truncate">{batch.fileName}</td>
                    <td className="px-3 py-2 text-right text-teal-700 font-medium">{formatNumber(batch.creditTotal)}</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-medium">{formatNumber(batch.debitTotal)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        Math.abs(batch.difference) < 0.01 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatNumber(batch.difference)}
                    </td>
                    <td className="px-3 py-2 text-center">{batch.recordCount}</td>
                    <td
                      className="px-3 py-2 text-center text-gray-600"
                      title={`住宿${batch.guestCount ?? '-'}／住宿間數${batch.occupiedRooms ?? '-'}`}
                    >
                      {batch.breakfastCount != null ? batch.breakfastCount : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          batch.status === '已結算'
                            ? 'bg-green-100 text-green-700'
                            : batch.status === '已核對'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {batch.ccReconciliation ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            batch.ccReconciliation.status === 'confirmed'
                              ? 'bg-green-100 text-green-700'
                              : batch.ccReconciliation.status === 'matched'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}
                          title={`手續費 ${formatNumber(batch.ccReconciliation.totalFee)}｜撥款淨額 ${formatNumber(batch.ccReconciliation.netAmount)}`}
                        >
                          {batch.ccReconciliation.status === 'confirmed'
                            ? '已確認'
                            : batch.ccReconciliation.status === 'matched'
                              ? '已比對'
                              : '待比對'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {batch.importedAt ? new Date(batch.importedAt).toLocaleString('zh-TW') : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteBatch(batch.id, batch.batchNo)}
                        className="text-red-500 hover:text-red-700 text-xs hover:underline"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
