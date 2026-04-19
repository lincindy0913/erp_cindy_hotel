'use client';

import { formatNumber, formatDate } from './pmsIncomeFormatters';
import PmsIncomeSortIcon from './PmsIncomeSortIcon';
import PmsIncomeRecordsPagination from './PmsIncomeRecordsPagination';

export default function PmsIncomeRecordsTab({
  filterStartDate,
  filterEndDate,
  occupancyLoading,
  occupancyStats,
  WAREHOUSES,
  filterWarehouse,
  setFilterWarehouse,
  setRecordsPage,
  setFilterStartDate,
  setFilterEndDate,
  filterEntryType,
  setFilterEntryType,
  filterAccountingCode,
  setFilterAccountingCode,
  handlePushToCashflow,
  pushToCashflowLoading,
  setShowAddModal,
  creditCardFeeForm,
  setCreditCardFeeForm,
  handleSaveCreditCardFee,
  creditCardFees,
  loading,
  records,
  handleSort,
  sortField,
  sortDir,
  sortedRecords,
  handleDeleteRecord,
  recordsTotal,
  recordsLimit,
  recordsPage,
}) {
  return (
    <div className="space-y-4">
      {(filterStartDate || filterEndDate) && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-800">
              住宿統計摘要
              {filterStartDate && filterEndDate && (
                <span className="ml-2 text-xs font-normal text-indigo-500">
                  {filterStartDate} ～ {filterEndDate}
                </span>
              )}
            </p>
            {occupancyLoading && <span className="text-xs text-indigo-400">載入中...</span>}
          </div>
          {!occupancyLoading && occupancyStats.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">查無住宿資料（請確認已匯入 PMS 日報）</p>
          )}
          {occupancyStats.length > 0 &&
            (() => {
              const totals = occupancyStats.reduce(
                (acc, r) => ({
                  occupiedRooms: acc.occupiedRooms + r.occupiedRooms,
                  guestCount: acc.guestCount + r.guestCount,
                  breakfastCount: acc.breakfastCount + r.breakfastCount,
                  roomCount: acc.roomCount + r.roomCount,
                  days: Math.max(acc.days, r.days),
                }),
                { occupiedRooms: 0, guestCount: 0, breakfastCount: 0, roomCount: 0, days: 0 }
              );

              const occ = (r) =>
                r.roomCount && r.days ? ((r.occupiedRooms / (r.roomCount * r.days)) * 100).toFixed(1) + '%' : '—';
              const bfRate = (r) => (r.guestCount ? ((r.breakfastCount / r.guestCount) * 100).toFixed(1) + '%' : '—');
              const perRoom = (r) => (r.occupiedRooms ? (r.breakfastCount / r.occupiedRooms).toFixed(1) : '—');

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">住宿間數</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">住宿人數</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">早餐人數</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">住房率</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">早餐滲透率</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">每間房早餐</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {occupancyStats.map((r) => (
                        <tr key={r.warehouse} className="hover:bg-indigo-50/30">
                          <td className="px-4 py-2 font-medium text-gray-800">{r.warehouse}</td>
                          <td className="px-4 py-2 text-right font-mono text-gray-700">{r.occupiedRooms.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono text-gray-700">{r.guestCount.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono text-gray-700">{r.breakfastCount.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-medium text-indigo-700">{occ(r)}</td>
                          <td className="px-4 py-2 text-right font-medium text-teal-700">{bfRate(r)}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{perRoom(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {occupancyStats.length > 1 && (
                      <tfoot className="bg-indigo-50 border-t font-semibold text-sm">
                        <tr>
                          <td className="px-4 py-2 text-gray-700">合計</td>
                          <td className="px-4 py-2 text-right font-mono">{totals.occupiedRooms.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono">{totals.guestCount.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right font-mono">{totals.breakfastCount.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-indigo-700">{occ(totals)}</td>
                          <td className="px-4 py-2 text-right text-teal-700">{bfRate(totals)}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{perRoom(totals)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              );
            })()}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">館別</label>
            <select
              value={filterWarehouse}
              onChange={(e) => {
                setFilterWarehouse(e.target.value);
                setRecordsPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[100px]"
            >
              <option value="">全部</option>
              {WAREHOUSES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">起始日期</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => {
                setFilterStartDate(e.target.value);
                setRecordsPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => {
                setFilterEndDate(e.target.value);
                setRecordsPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">借貸方</label>
            <select
              value={filterEntryType}
              onChange={(e) => {
                setFilterEntryType(e.target.value);
                setRecordsPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[80px]"
            >
              <option value="">全部</option>
              <option value="貸方">貸方</option>
              <option value="借方">借方</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">科目代碼</label>
            <input
              type="text"
              value={filterAccountingCode}
              onChange={(e) => {
                setFilterAccountingCode(e.target.value);
                setRecordsPage(1);
              }}
              placeholder="例: 4111"
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterWarehouse('');
              setFilterStartDate('');
              setFilterEndDate('');
              setFilterEntryType('');
              setFilterAccountingCode('');
              setRecordsPage(1);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            清除篩選
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handlePushToCashflow}
            disabled={pushToCashflowLoading}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {pushToCashflowLoading ? '同步中...' : '同步至現金流'}
          </button>
          <button type="button" onClick={() => setShowAddModal(true)} className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700">
            + 手動新增
          </button>
        </div>
      </div>

      <div className="bg-amber-50/70 rounded-lg shadow-sm border border-amber-200 p-4">
        <h3 className="text-sm font-bold text-amber-900 mb-3">每日信用卡手續費</h3>
        <p className="text-xs text-amber-800 mb-3">信用卡收入延遲入帳時，請輸入「入帳日」與手續費金額；同步至現金流時會以「收入合計 − 手續費」作為存簿存入金額。</p>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">館別</label>
            <select
              value={creditCardFeeForm.warehouse}
              onChange={(e) => setCreditCardFeeForm((f) => ({ ...f, warehouse: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              {WAREHOUSES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">入帳日</label>
            <input
              type="date"
              value={creditCardFeeForm.settlementDate}
              onChange={(e) => setCreditCardFeeForm((f) => ({ ...f, settlementDate: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">手續費金額</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={creditCardFeeForm.feeAmount}
              onChange={(e) => setCreditCardFeeForm((f) => ({ ...f, feeAmount: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-28"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">備註</label>
            <input
              type="text"
              value={creditCardFeeForm.note}
              onChange={(e) => setCreditCardFeeForm((f) => ({ ...f, note: e.target.value }))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32"
              placeholder="選填"
            />
          </div>
          <button type="button" onClick={handleSaveCreditCardFee} className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700">
            儲存
          </button>
        </div>
        {creditCardFees.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-100/80 text-left">
                  <th className="px-2 py-1.5 font-medium">入帳日</th>
                  <th className="px-2 py-1.5 font-medium">館別</th>
                  <th className="px-2 py-1.5 font-medium text-right">手續費</th>
                  <th className="px-2 py-1.5 font-medium">備註</th>
                </tr>
              </thead>
              <tbody>
                {creditCardFees.slice(0, 20).map((f) => (
                  <tr key={`${f.warehouse}-${f.settlementDate}`} className="border-t border-amber-200/50">
                    <td className="px-2 py-1.5 font-mono text-xs">{f.settlementDate}</td>
                    <td className="px-2 py-1.5">{f.warehouse}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatNumber(f.feeAmount)}</td>
                    <td className="px-2 py-1.5 text-gray-500 text-xs">{f.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {creditCardFees.length > 20 && <p className="text-xs text-gray-500 mt-1">僅顯示前 20 筆，請用篩選查詢</p>}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-gray-400">無符合條件的記錄</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th
                      className="px-3 py-2 font-medium cursor-pointer hover:text-teal-700"
                      onClick={() => handleSort('businessDate')}
                    >
                      營業日期 <PmsIncomeSortIcon field="businessDate" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      className="px-3 py-2 font-medium cursor-pointer hover:text-teal-700"
                      onClick={() => handleSort('warehouse')}
                    >
                      館別 <PmsIncomeSortIcon field="warehouse" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th
                      className="px-3 py-2 font-medium cursor-pointer hover:text-teal-700"
                      onClick={() => handleSort('entryType')}
                    >
                      借貸方 <PmsIncomeSortIcon field="entryType" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th className="px-3 py-2 font-medium">PMS 欄位</th>
                    <th
                      className="px-3 py-2 font-medium text-right cursor-pointer hover:text-teal-700"
                      onClick={() => handleSort('amount')}
                    >
                      金額 <PmsIncomeSortIcon field="amount" sortField={sortField} sortDir={sortDir} />
                    </th>
                    <th className="px-3 py-2 font-medium">科目代碼</th>
                    <th className="px-3 py-2 font-medium">科目名稱</th>
                    <th className="px-3 py-2 font-medium">批次</th>
                    <th className="px-3 py-2 font-medium">結算狀態</th>
                    <th className="px-3 py-2 font-medium text-center">現金流</th>
                    <th className="px-3 py-2 font-medium">備註</th>
                    <th className="px-3 py-2 font-medium text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((rec) => (
                    <tr key={rec.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{formatDate(rec.businessDate)}</td>
                      <td className="px-3 py-2">{rec.warehouse}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            rec.entryType === '貸方' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {rec.entryType}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm">{rec.pmsColumnName}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatNumber(rec.amount)}
                        {rec.isModified && (
                          <span className="ml-1 text-xs text-orange-500" title={`原始: ${formatNumber(rec.originalAmount)}`}>
                            *
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{rec.accountingCode}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{rec.accountingName}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{rec.importBatch?.batchNo || '手動'}</td>
                      <td className="px-3 py-2">
                        {rec.importBatch?.status ? (
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              rec.importBatch.status === '已結算'
                                ? 'bg-green-100 text-green-800'
                                : rec.importBatch.status === '已核對'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {rec.importBatch.status}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {rec.entryType === '借方' && rec.cashTransactionId ? (
                          <span className="text-xs text-green-600 font-medium">已連動</span>
                        ) : rec.entryType === '借方' ? (
                          <span className="text-xs text-gray-400">-</span>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 max-w-[100px] truncate">{rec.note || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id)}
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
            <div className="px-4 py-3 border-t">
              <PmsIncomeRecordsPagination
                recordsTotal={recordsTotal}
                recordsLimit={recordsLimit}
                recordsPage={recordsPage}
                setRecordsPage={setRecordsPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
