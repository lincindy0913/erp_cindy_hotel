'use client';

export default function ForecastTab({
  forecastWarehouse,
  setForecastWarehouse,
  warehouses,
  summaryData,
  fetchSummary,
  formatMoney,
}) {
  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label htmlFor="f-23" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
            <select id="f-23"
              value={forecastWarehouse}
              onChange={(e) => setForecastWarehouse(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <button
            onClick={fetchSummary}
            className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm"
          >
            更新預測
          </button>
        </div>
      </div>

      {summaryData && (
        <div>
          {/* Current status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-emerald-500">
              <div className="text-sm text-gray-500 mb-1">目前總餘額</div>
              <div className="text-xl font-bold text-emerald-700">{formatMoney(summaryData.grandTotal)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
              <div className="text-sm text-gray-500 mb-1">近30日收入</div>
              <div className="text-xl font-bold text-green-700">{formatMoney(summaryData.periodIncome)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
              <div className="text-sm text-gray-500 mb-1">近30日支出</div>
              <div className="text-xl font-bold text-red-700">{formatMoney(summaryData.periodExpense)}</div>
            </div>
            <div className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${summaryData.avgDailyNet >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
              <div className="text-sm text-gray-500 mb-1">日均淨流量</div>
              <div className={`text-xl font-bold ${summaryData.avgDailyNet >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {formatMoney(summaryData.avgDailyNet)}
              </div>
            </div>
          </div>

          {/* Balance by type */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h4 className="text-md font-semibold mb-4">各類帳戶餘額</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(summaryData.totalByType || {}).map(([type, amount]) => (
                <div key={type} className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500">{type}</div>
                  <div className={`text-lg font-bold ${amount >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {formatMoney(amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Balance by warehouse */}
          {Object.keys(summaryData.totalByWarehouse || {}).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h4 className="text-md font-semibold mb-4">各館別餘額</h4>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(summaryData.totalByWarehouse || {}).map(([wh, amount]) => (
                  <div key={wh} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-500">{wh}</div>
                    <div className={`text-lg font-bold ${amount >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                      {formatMoney(amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Forecast table */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h4 className="text-md font-semibold mb-4">未來30日資金水位預測</h4>
            <p className="text-sm text-gray-500 mb-4">
              基於過去30日平均淨流量（{formatMoney(summaryData.avgDailyNet)}/日）進行線性預測
            </p>
            <div style={{ overflow: 'clip' }}>
              {/* Visual bar chart */}
              <div className="space-y-1 mb-6">
                {(summaryData.forecast || []).filter((_, i) => i % 3 === 0 || i === summaryData.forecast.length - 1).map((f, idx) => {
                  const maxVal = Math.max(...summaryData.forecast.map(ff => Math.abs(ff.projectedBalance)), 1);
                  const pct = Math.min(Math.abs(f.projectedBalance) / maxVal * 100, 100);
                  const isNeg = f.projectedBalance < 0;
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 text-right">{f.date}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                        <div
                          className={`h-5 rounded-full ${isNeg ? 'bg-red-400' : 'bg-emerald-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium w-32 text-right ${isNeg ? 'text-red-600' : 'text-gray-700'}`}>
                        {formatMoney(f.projectedBalance)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Forecast table */}
              <div className="border rounded-lg tbl-wrap">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">日期</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">預估餘額</th>
                      <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(summaryData.forecast || []).map((f, idx) => (
                      <tr key={idx} className={f.projectedBalance < 0 ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2 text-sm">{f.date}</td>
                        <td className={`px-4 py-2 text-sm text-right font-semibold ${f.projectedBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                          {formatMoney(f.projectedBalance)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {f.projectedBalance < 0 ? (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">資金不足</span>
                          ) : f.projectedBalance < summaryData.grandTotal * 0.3 ? (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">偏低</span>
                          ) : (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">正常</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {!summaryData && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          請點擊「更新預測」查看資金預測
        </div>
      )}
    </div>
  );
}
