'use client';

export default function ReportTab({
  reportFilter,
  setReportFilter,
  warehouses,
  suppliers,
  reportData,
  fetchReport,
  formatMoney,
  onGoToCategoryMgmt,
}) {
  const hasUncategorized = reportData && (
    (reportData.incomeByCategory  || []).some(c => c.name === '未分類') ||
    (reportData.expenseByCategory || []).some(c => c.name === '未分類')
  );

  return (
    <div>
      {/* Report filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
          <div>
            <label htmlFor="f-20" className="block text-sm font-medium text-gray-700 mb-1">起始日期 *</label>
            <input id="f-20"
              type="date"
              value={reportFilter.startDate}
              onChange={(e) => setReportFilter({ ...reportFilter, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="f-21" className="block text-sm font-medium text-gray-700 mb-1">結束日期 *</label>
            <input id="f-21"
              type="date"
              value={reportFilter.endDate}
              onChange={(e) => setReportFilter({ ...reportFilter, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="f-22" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
            <select id="f-22"
              value={reportFilter.warehouse}
              onChange={(e) => setReportFilter({ ...reportFilter, warehouse: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-45" className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
            <select id="f-45"
              value={reportFilter.supplierId}
              onChange={(e) => setReportFilter({ ...reportFilter, supplierId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-46" className="block text-sm font-medium text-gray-700 mb-1">會計科目</label>
            <input id="f-46"
              type="text"
              value={reportFilter.accountingSubject}
              onChange={(e) => setReportFilter({ ...reportFilter, accountingSubject: e.target.value })}
              placeholder="科目代碼或名稱"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <button
          onClick={fetchReport}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm"
        >
          產生報表
        </button>
      </div>

      {/* Report content */}
      {hasUncategorized && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5">
          <span className="text-sm text-amber-800">⚠ 報表中含「未分類」項目，損益數字可能不完整。</span>
          {onGoToCategoryMgmt && (
            <button onClick={onGoToCategoryMgmt}
              className="ml-auto text-xs px-3 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap">
              → 前往批次歸類
            </button>
          )}
        </div>
      )}
      {reportData && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
              <div className="text-sm text-gray-500 mb-1">營業收入</div>
              <div className="text-xl font-bold text-green-700">{formatMoney(reportData.totalIncome)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
              <div className="text-sm text-gray-500 mb-1">營業支出</div>
              <div className="text-xl font-bold text-red-700">{formatMoney(reportData.totalExpense)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-500">
              <div className="text-sm text-gray-500 mb-1">手續費合計</div>
              <div className="text-xl font-bold text-yellow-700">{formatMoney(reportData.totalFees)}</div>
            </div>
            <div className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${reportData.netCashFlow >= 0 ? 'border-emerald-500' : 'border-red-500'}`}>
              <div className="text-sm text-gray-500 mb-1">淨現金流</div>
              <div className={`text-xl font-bold ${reportData.netCashFlow >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatMoney(reportData.netCashFlow)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Income by category */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h4 className="text-md font-semibold mb-4 text-green-700">收入明細</h4>
              {reportData.incomeByCategory.length > 0 ? (
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b">
                      <th className="text-left text-sm font-medium text-gray-700 pb-2">類別</th>
                      <th className="text-right text-sm font-medium text-gray-700 pb-2">金額</th>
                      <th className="text-right text-sm font-medium text-gray-700 pb-2">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.incomeByCategory.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 text-sm">{item.name}</td>
                        <td className="py-2 text-sm text-right font-medium">{formatMoney(item.amount)}</td>
                        <td className="py-2 text-sm text-right text-gray-500">
                          {reportData.totalIncome > 0 ? `${((item.amount / reportData.totalIncome) * 100).toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-green-50">
                      <td className="py-2 text-sm">合計</td>
                      <td className="py-2 text-sm text-right">{formatMoney(reportData.totalIncome)}</td>
                      <td className="py-2 text-sm text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-gray-500">此期間無收入紀錄</div>
              )}
            </div>

            {/* Expense by category */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h4 className="text-md font-semibold mb-4 text-red-700">支出明細</h4>
              {reportData.expenseByCategory.length > 0 ? (
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b">
                      <th className="text-left text-sm font-medium text-gray-700 pb-2">類別</th>
                      <th className="text-right text-sm font-medium text-gray-700 pb-2">金額</th>
                      <th className="text-right text-sm font-medium text-gray-700 pb-2">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.expenseByCategory.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 text-sm">{item.name}</td>
                        <td className="py-2 text-sm text-right font-medium">{formatMoney(item.amount)}</td>
                        <td className="py-2 text-sm text-right text-gray-500">
                          {reportData.totalExpense > 0 ? `${((item.amount / reportData.totalExpense) * 100).toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-red-50">
                      <td className="py-2 text-sm">合計</td>
                      <td className="py-2 text-sm text-right">{formatMoney(reportData.totalExpense)}</td>
                      <td className="py-2 text-sm text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="text-sm text-gray-500">此期間無支出紀錄</div>
              )}
            </div>
          </div>

          {/* Expense by supplier */}
          {reportData.expenseBySupplier && reportData.expenseBySupplier.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
              <h4 className="text-md font-semibold mb-4 text-orange-700">廠商支出明細</h4>
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b">
                    <th className="text-left text-sm font-medium text-gray-700 pb-2">廠商</th>
                    <th className="text-right text-sm font-medium text-gray-700 pb-2">金額</th>
                    <th className="text-right text-sm font-medium text-gray-700 pb-2">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.expenseBySupplier.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 text-sm">{item.name}</td>
                      <td className="py-2 text-sm text-right font-medium">{formatMoney(item.amount)}</td>
                      <td className="py-2 text-sm text-right text-gray-500">
                        {reportData.totalExpense > 0 ? `${((item.amount / reportData.totalExpense) * 100).toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 text-sm text-gray-500 text-right">
            報表期間：{reportData.period?.startDate} ~ {reportData.period?.endDate} |
            館別：{reportData.warehouse} |
            交易筆數：{reportData.transactionCount}
          </div>
        </div>
      )}

      {!reportData && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          請選擇日期範圍後點擊「產生報表」
        </div>
      )}
    </div>
  );
}
