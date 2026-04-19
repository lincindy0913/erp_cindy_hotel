'use client';

import { formatNumber } from './pmsIncomeFormatters';

export default function PmsIncomeUploadModal({
  showUploadModal,
  onClose,
  resetUploadForm,
  uploadRecords,
  handleUploadRecordChange,
  uploadWarehouse,
  setUploadWarehouse,
  uploadDate,
  setUploadDate,
  uploadFileName,
  setUploadFileName,
  uploadRoomCount,
  setUploadRoomCount,
  uploadOccupancyRate,
  setUploadOccupancyRate,
  uploadAvgRoomRate,
  setUploadAvgRoomRate,
  uploadGuestCount,
  setUploadGuestCount,
  uploadBreakfastCount,
  setUploadBreakfastCount,
  uploadOccupiedRooms,
  setUploadOccupiedRooms,
  handleUploadSubmit,
  uploadSubmitting,
  error,
  WAREHOUSES,
  overviewBuildings,
}) {
  if (!showUploadModal) return null;

  const creditRecords = uploadRecords.filter((r) => r.entryType === '貸方');
  const debitRecords = uploadRecords.filter((r) => r.entryType === '借方');
  const creditTotal = creditRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const debitTotal = debitRecords.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const buildingOptions = overviewBuildings.length ? overviewBuildings : WAREHOUSES;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-teal-800">匯入 PMS 日報表</h3>
          <button
            type="button"
            onClick={() => {
              onClose();
              resetUploadForm();
            }}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
              <select
                value={uploadWarehouse}
                onChange={(e) => setUploadWarehouse(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {buildingOptions.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">營業日期</label>
              <input
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">檔案名稱</label>
              <input
                type="text"
                value={uploadFileName}
                onChange={(e) => setUploadFileName(e.target.value)}
                placeholder="PMS_report.xlsx"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">房間數</label>
              <input
                type="number"
                value={uploadRoomCount}
                onChange={(e) => setUploadRoomCount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住房率 (%)</label>
              <input
                type="number"
                value={uploadOccupancyRate}
                onChange={(e) => setUploadOccupancyRate(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                max="100"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">平均房價</label>
              <input
                type="number"
                value={uploadAvgRoomRate}
                onChange={(e) => setUploadAvgRoomRate(e.target.value)}
                placeholder="0"
                step="1"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住宿人數</label>
              <input
                type="number"
                value={uploadGuestCount}
                onChange={(e) => setUploadGuestCount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">早餐人數</label>
              <input
                type="number"
                value={uploadBreakfastCount}
                onChange={(e) => setUploadBreakfastCount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">住宿間數</label>
              <input
                type="number"
                value={uploadOccupiedRooms}
                onChange={(e) => setUploadOccupiedRooms(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-teal-700 mb-2 border-b border-teal-200 pb-1">貸方科目 (收入)</h4>
            <div className="space-y-2">
              {uploadRecords.map((rec, idx) => {
                if (rec.entryType !== '貸方') return null;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                    <div className="col-span-2 text-xs text-gray-500">{rec.accountingCode}</div>
                    <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        value={rec.amount}
                        step="1"
                        min="0"
                        onChange={(e) => handleUploadRecordChange(idx, 'amount', e.target.value)}
                        placeholder="金額"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="text-right text-sm font-bold text-teal-700 pr-1">貸方合計: {formatNumber(creditTotal)}</div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-amber-700 mb-2 border-b border-amber-200 pb-1">借方科目 (資產/支出)</h4>
            <div className="space-y-2">
              {uploadRecords.map((rec, idx) => {
                if (rec.entryType !== '借方') return null;
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3 text-sm text-gray-700">{rec.pmsColumnName}</div>
                    <div className="col-span-2 text-xs text-gray-500">{rec.accountingCode}</div>
                    <div className="col-span-3 text-xs text-gray-500">{rec.accountingName}</div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        value={rec.amount}
                        step="1"
                        min="0"
                        onChange={(e) => handleUploadRecordChange(idx, 'amount', e.target.value)}
                        placeholder="金額"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                );
              })}
              <div className="text-right text-sm font-bold text-amber-700 pr-1">借方合計: {formatNumber(debitTotal)}</div>
            </div>
          </div>

          <div
            className={`text-right text-sm font-bold px-3 py-2 rounded ${
              Math.abs(creditTotal - debitTotal) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            差額 (貸-借): {formatNumber(creditTotal - debitTotal)}
            {Math.abs(creditTotal - debitTotal) < 0.01 ? ' (平衡)' : ' (不平衡)'}
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}

          <p className="text-xs text-gray-500">請會計核對上方資料無誤後，再按「確認匯入」存檔。</p>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                resetUploadForm();
              }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleUploadSubmit}
              disabled={uploadSubmitting}
              className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadSubmitting ? '匯入中...' : '確認匯入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
