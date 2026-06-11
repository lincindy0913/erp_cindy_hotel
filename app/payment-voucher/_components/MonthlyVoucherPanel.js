'use client';

export default function MonthlyVoucherPanel({
  suppliers,
  voucherFilter,
  setVoucherFilter,
  setSearchExecuted,
  suppliersLoading,
  handleSearch,
  fetchVoucherPreview,
  previewLoading,
  printMonthlyVoucher,
  setVoucherPreview,
  preview,
  isLandscape,
  dateColumns,
  noteCount,
  searchExecuted,
  suppliersWithData,
  selectedSupplierIds,
  toggleSelectSupplier,
  toggleSelectAllSuppliers,
  monthlyBatchPrinting,
  batchPrintMonthlyVouchers,
}) {
  return (
    <div className="space-y-4">
      {/* Filter Panel */}
      <div className="bg-white rounded-lg shadow-sm p-6 border">
        <h3 className="text-base font-semibold text-gray-700 mb-4">廠商傳票</h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">進貨起始日 *</label>
            <input id="f"
              type="date"
              value={voucherFilter.startDate}
              onChange={e => { setVoucherFilter(v => ({ ...v, startDate: e.target.value })); setSearchExecuted(false); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">進貨結束日 *</label>
            <input id="f-2"
              type="date"
              value={voucherFilter.endDate}
              onChange={e => { setVoucherFilter(v => ({ ...v, endDate: e.target.value })); setSearchExecuted(false); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
            <select id="f-3"
              value={voucherFilter.warehouse}
              onChange={e => { setVoucherFilter(v => ({ ...v, warehouse: e.target.value })); setSearchExecuted(false); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">全館</option>
              <option value="麗格">麗格</option>
              <option value="麗軒">麗軒</option>
              <option value="民宿">民宿</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={!voucherFilter.startDate || !voucherFilter.endDate || suppliersLoading}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {suppliersLoading ? '搜尋中...' : '搜尋'}
            </button>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">廠商（選填，用於單筆預覽/列印）</label>
            <select id="f-4"
              value={voucherFilter.supplierId}
              onChange={e => { setVoucherFilter(v => ({ ...v, supplierId: e.target.value })); setVoucherPreview(null); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">選擇廠商...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Single supplier preview/print buttons */}
        {voucherFilter.supplierId && voucherFilter.startDate && voucherFilter.endDate && (
          <div className="mt-4 flex items-center gap-3 pt-3 border-t">
            <button
              onClick={fetchVoucherPreview}
              disabled={previewLoading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
            >
              {previewLoading ? '載入中...' : '預覽資訊'}
            </button>
            <button
              onClick={() => printMonthlyVoucher(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
            >
              列印傳票
            </button>
          </div>
        )}
      </div>

      {/* Preview Info + Print (spec23 v3) */}
      {previewLoading && (
        <div className="text-center py-8 text-gray-400">載入傳票資訊中...</div>
      )}

      {preview && !preview.error && (
        <div className="bg-white rounded-lg shadow-sm p-6 border">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-gray-800">{preview.supplier?.name}</span>
                <span className="text-sm text-gray-500">{voucherFilter.startDate} ~ {voucherFilter.endDate} · {voucherFilter.warehouse || '全館'}</span>
              </div>
              {/* Orientation hint */}
              {dateColumns > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>
                    共 <strong>{dateColumns}</strong> 個進貨日期，
                    {isLandscape
                      ? <span className="text-indigo-600 font-medium">將自動使用 A4 橫式列印</span>
                      : <span className="text-gray-600">使用 A4 直式列印</span>
                    }
                  </span>
                </div>
              )}
              {/* Price notes hint */}
              {noteCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    <span className="text-indigo-600 font-medium">{noteCount} 項品名</span>附有歷史較低價參考資訊
                    （{preview.priceNoteSummary?.noteItems?.join('、')}）
                  </span>
                </div>
              )}
              {/* Maker name */}
              <div className="text-xs text-gray-400">
                製表人：{preview.printConfig?.makerName}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => printMonthlyVoucher(true)}
                className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <span>📄</span>
                <span>列印傳票</span>
              </button>
              {noteCount > 0 && (
                <button
                  onClick={() => printMonthlyVoucher(false)}
                  className="px-5 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors text-center"
                >
                  列印（不含附記）
                </button>
              )}
            </div>
          </div>

          {/* Items summary table */}
          {preview.items?.length > 0 && (
            <div className="mt-4 overflow-auto max-h-60">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500">品名</th>
                    <th className="px-3 py-2 text-right text-gray-500">單價</th>
                    <th className="px-3 py-2 text-center text-gray-500">歷史比價</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.items.map((item, i) => (
                    <tr key={i} className={item.isPriceNote ? 'bg-indigo-50' : ''}>
                      <td className="px-3 py-1.5">{item.productName}</td>
                      <td className="px-3 py-1.5 text-right">${item.currentUnitPrice}</td>
                      <td className="px-3 py-1.5 text-center">
                        {item.isPriceNote ? (
                          <span className="text-xs text-gray-500">
                            歷史最低 ${item.priceComparison?.recentMin}（{item.priceComparison?.priceDiff} · {item.priceComparison?.diffRate}）
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {preview?.error && (
        <div className="bg-red-50 rounded-lg p-4 text-sm text-red-600 border border-red-200">
          {preview.error}
        </div>
      )}

      {/* Supplier list with checkboxes for batch print */}
      {searchExecuted && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-gray-700">
                {voucherFilter.startDate} ~ {voucherFilter.endDate} 有進貨資料的廠商
              </h3>
              {suppliersWithData.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={suppliersWithData.length > 0 && selectedSupplierIds.size === suppliersWithData.length}
                    onChange={toggleSelectAllSuppliers}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-600">全選</span>
                </label>
              )}
              <span className="text-sm text-gray-500">
                已選擇 <strong className="text-indigo-600">{selectedSupplierIds.size}</strong> 家
              </span>
            </div>
            <button
              onClick={batchPrintMonthlyVouchers}
              disabled={selectedSupplierIds.size === 0 || monthlyBatchPrinting}
              title={selectedSupplierIds.size === 0 ? '請先勾選左方供應商再列印' : ''}
              className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {monthlyBatchPrinting ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  產生 PDF 中...
                </>
              ) : (
                <>批量列印傳票 ({selectedSupplierIds.size})</>
              )}
            </button>
          </div>
          {suppliersLoading ? (
            <div className="p-8 text-center text-gray-400">載入廠商列表中...</div>
          ) : suppliersWithData.length === 0 ? (
            <div className="p-8 text-center text-gray-400">該月份無進貨資料</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-auto">
              {suppliersWithData.map((s, idx) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-indigo-50 transition-colors ${
                    selectedSupplierIds.has(s.id) ? 'bg-indigo-50/50' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSupplierIds.has(s.id)}
                    onChange={() => toggleSelectSupplier(s.id)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-800 flex-1">{s.name}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{s.count} 筆進貨</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
