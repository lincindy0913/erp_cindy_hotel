'use client';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

export default function OverviewTab({
  summary, summaryError, summaryLoading, summaryLastFetched, fetchSummary,
  switchTab, switchAnalyticsSub,
}) {
  return (
    <>
      {summaryError && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4 flex items-center justify-between">
          <span className="text-red-700 text-sm">總覽載入失敗：{summaryError}</span>
          <button onClick={fetchSummary} disabled={summaryLoading}
            className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 ml-4 disabled:opacity-50">
            {summaryLoading ? '載入中…' : '重試'}
          </button>
        </div>
      )}
      {!summaryError && summaryLoading && !summary && (
        <div className="text-center py-12 text-gray-500">載入中...</div>
      )}
      {!summaryError && summaryLastFetched && (Date.now() - summaryLastFetched > 5 * 60_000) && (
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-2 mb-3 flex items-center justify-between text-xs text-amber-700">
          <span>資料為 {Math.floor((Date.now() - summaryLastFetched) / 60000)} 分鐘前載入</span>
          <button onClick={fetchSummary} className="underline ml-3">重新載入</button>
        </div>
      )}
      {summary && (() => {
        const thirtyDayCount = (summary.expiringContractDetails || []).filter(c => c.daysUntilExpiry <= 30).length;
        return (
          <div>
            {/* Notification banners */}
            {summary.overdueCount > 0 && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-3 rounded flex items-center justify-between">
                <p className="text-red-700 font-medium">
                  有 {summary.overdueCount} 筆租金逾期未收，總金額 ${fmt(summary.overdueAmount)}
                </p>
                <button onClick={() => switchAnalyticsSub('overdue')} className="text-xs text-red-600 underline">前往逾期催繳報表</button>
              </div>
            )}
            {thirtyDayCount > 0 && (
              <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-3 rounded flex items-center justify-between">
                <p className="text-red-700 font-semibold">
                  緊急：有 {thirtyDayCount} 筆合約將於 30 天內到期，請儘速處理續約
                </p>
                <button onClick={() => switchTab('contracts')} className="text-xs text-red-600 underline">前往合約管理</button>
              </div>
            )}
            {summary.expiringContracts > thirtyDayCount && (
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-3 rounded flex items-center justify-between">
                <p className="text-yellow-700 font-medium">
                  有 {summary.expiringContracts - thirtyDayCount} 筆合約將於 31–60 天內到期
                </p>
                <button onClick={() => switchTab('contracts')} className="text-xs text-yellow-600 underline">前往合約管理</button>
              </div>
            )}
            {summary.pendingTaxes > 0 && (
              <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-3 rounded">
                <p className="text-orange-700 font-medium">
                  有 {summary.pendingTaxes} 筆稅款待繳納
                </p>
              </div>
            )}
            {/* #5 待審核合約 */}
            {summary.pendingContractCount > 0 && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-3 rounded flex items-center justify-between">
                <p className="text-blue-700 font-medium">
                  有 {summary.pendingContractCount} 份合約待審核（pending），確認無誤後請至合約管理改為「生效」
                </p>
                <button onClick={() => switchTab('contracts')} className="text-xs text-blue-600 underline whitespace-nowrap ml-4">前往合約管理</button>
              </div>
            )}
            {/* #1 未綁定資產 */}
            {summary.unlinkedPropertyCount > 0 && (
              <div className="bg-gray-50 border-l-4 border-gray-400 p-3 mb-3 rounded flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  有 {summary.unlinkedPropertyCount} 個物業尚未綁定資產主檔，如需追蹤面積、取得日等財務屬性，請至資產管理建立並綁定。
                </span>
                <a href="/assets" className="text-xs text-teal-600 underline whitespace-nowrap ml-4">前往資產管理 →</a>
              </div>
            )}

            {/* KPI Cards Row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-teal-500">
                <p className="text-sm text-gray-500">總物業數</p>
                <p className="text-2xl font-bold text-teal-700">{summary.totalProperties}</p>
                <p className="text-xs text-gray-400 mt-1">
                  已出租 {summary.rentedCount} / 空置 {summary.availableCount} / 維護 {summary.maintenanceCount}
                </p>
              </div>
              <div onClick={() => switchTab('cashier')}
                className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500 cursor-pointer hover:shadow-md transition-shadow"
                title="前往收租工作台">
                <p className="text-sm text-gray-500">本月應收</p>
                <p className="text-2xl font-bold text-blue-700">${fmt(summary.thisMonthExpected)}</p>
                <p className="text-xs text-gray-400 mt-1">待收 {summary.thisMonthPending ?? '-'} 筆</p>
              </div>
              <div onClick={() => switchTab('cashier')}
                className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500 cursor-pointer hover:shadow-md transition-shadow"
                title="前往收租工作台">
                <p className="text-sm text-gray-500">本月已收</p>
                <p className="text-2xl font-bold text-green-700">${fmt(summary.thisMonthCollected)}</p>
                <p className="text-xs text-gray-400 mt-1">收款率 {summary.collectionRate ?? 0}%</p>
              </div>
              <div onClick={() => switchAnalyticsSub('overdue')}
                className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500 cursor-pointer hover:shadow-md transition-shadow"
                title="前往逾期催繳報表">
                <p className="text-sm text-gray-500">逾期未收</p>
                <p className="text-2xl font-bold text-red-700">{summary.overdueCount} 筆</p>
                <p className="text-xs text-gray-400 mt-1">${fmt(summary.overdueAmount)}</p>
              </div>
            </div>

            {/* KPI Cards Row 2 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
                <p className="text-sm text-gray-500">本月收款率</p>
                <p className="text-2xl font-bold text-indigo-700">{summary.collectionRate ?? 0}%</p>
                <div className="mt-2 bg-gray-100 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(summary.collectionRate ?? 0, 100)}%` }} />
                </div>
              </div>
              <div onClick={() => switchTab('contracts')}
                className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500 cursor-pointer hover:shadow-md transition-shadow"
                title="前往合約管理">
                <p className="text-sm text-gray-500">即將到期合約</p>
                <p className="text-2xl font-bold text-yellow-700">{summary.expiringContracts}</p>
                <p className="text-xs text-gray-400 mt-1">60天內</p>
              </div>
              <div onClick={() => switchTab('taxes')}
                className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500 cursor-pointer hover:shadow-md transition-shadow"
                title="前往稅款管理">
                <p className="text-sm text-gray-500">待繳稅款</p>
                <p className="text-2xl font-bold text-orange-700">{summary.pendingTaxes}</p>
              </div>
              <div onClick={() => switchTab('maintenance')}
                className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500 cursor-pointer hover:shadow-md transition-shadow"
                title="前往維護費">
                <p className="text-sm text-gray-500">待付維護費</p>
                <p className="text-2xl font-bold text-purple-700">{summary.pendingMaintenance}</p>
              </div>
            </div>

            {/* Detail lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Overdue list */}
              {summary.overdueDetails && summary.overdueDetails.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-red-700">逾期租金明細</h3>
                    <button onClick={() => switchTab('cashier')} className="text-xs text-teal-600 underline">前往收租</button>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="text-gray-400 border-b">
                        <th className="text-center pb-1">序號</th>
                        <th className="text-center pb-1">資產編號</th>
                        <th className="text-left pb-1">物業</th>
                        <th className="text-left pb-1">租客</th>
                        <th className="text-right pb-1">金額</th>
                        <th className="text-right pb-1">逾期天數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.overdueDetails.map((d, idx) => (
                        <tr key={d.id} className="border-b border-gray-50 hover:bg-red-50">
                          <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                          <td className="py-1.5 text-center text-gray-700 font-mono">{d.sortOrder ?? '—'}</td>
                          <td className="py-1.5 text-gray-700">{d.propertyName}</td>
                          <td className="py-1.5 text-gray-600">{d.tenantName}</td>
                          <td className="py-1.5 text-right font-medium text-red-600">${fmt(d.expectedAmount)}</td>
                          <td className="py-1.5 text-right">
                            <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{d.daysOverdue}天</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.overdueCount > summary.overdueDetails.length && (
                    <p className="text-xs text-gray-400 mt-2 text-right">僅顯示前 {summary.overdueDetails.length} 筆，共 {summary.overdueCount} 筆</p>
                  )}
                </div>
              )}

              {/* Expiring contracts list */}
              {summary.expiringContractDetails && summary.expiringContractDetails.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-yellow-700">即將到期合約明細</h3>
                    <button onClick={() => switchTab('contracts')} className="text-xs text-teal-600 underline">前往合約</button>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="text-gray-400 border-b">
                        <th className="text-center pb-1">序號</th>
                        <th className="text-center pb-1">資產編號</th>
                        <th className="text-left pb-1">物業</th>
                        <th className="text-left pb-1">租客</th>
                        <th className="text-right pb-1">月租</th>
                        <th className="text-right pb-1">剩餘天數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.expiringContractDetails.map((c, idx) => (
                        <tr key={c.id} className="border-b border-gray-50 hover:bg-yellow-50">
                          <td className="py-1.5 text-center text-gray-500">{idx + 1}</td>
                          <td className="py-1.5 text-center text-gray-700 font-mono">{c.sortOrder ?? '—'}</td>
                          <td className="py-1.5 text-gray-700">{c.propertyName}</td>
                          <td className="py-1.5 text-gray-600">{c.tenantName}</td>
                          <td className="py-1.5 text-right font-medium">${fmt(c.monthlyRent)}</td>
                          <td className="py-1.5 text-right">
                            <span className={`px-1.5 py-0.5 rounded ${c.daysUntilExpiry <= 30 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {c.daysUntilExpiry}天
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {summary.expiringContracts > summary.expiringContractDetails.length && (
                    <p className="text-xs text-gray-400 mt-2 text-right">僅顯示前 {summary.expiringContractDetails.length} 筆，共 {summary.expiringContracts} 筆</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
