'use client';

export default function MonthlyView({
  // filters
  statsStartMonth,
  statsEndMonth,
  statsWarehouse,
  setStatsStartMonth,
  setStatsEndMonth,
  setStatsWarehouse,
  // data
  statsData,
  statsLoading,
  // actions
  fetchMonthlyStats,
  // navigation
  setSearchDateFrom,
  setSearchDateTo,
  setSearchWarehouse,
  setSearchInvoiceTitle,
  goSalesView,
}) {
  return (
    <div className="space-y-4">
      {/* 篩選列 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-12" className="block text-xs text-gray-500 mb-1">起始月份</label>
            <input id="f-12" type="month" value={statsStartMonth} onChange={e => setStatsStartMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
          </div>
          <div>
            <label htmlFor="f-13" className="block text-xs text-gray-500 mb-1">結束月份</label>
            <input id="f-13" type="month" value={statsEndMonth} onChange={e => setStatsEndMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none" />
          </div>
          <div>
            <label htmlFor="f-14" className="block text-xs text-gray-500 mb-1">館別</label>
            <select id="f-14" value={statsWarehouse} onChange={e => setStatsWarehouse(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-400 outline-none">
              <option value="">全部館別</option>
              {(statsData?.warehouses || []).map(wh => (
                <option key={wh} value={wh}>{wh}</option>
              ))}
              {/* fallback options if statsData not yet loaded */}
              {!statsData && ['麗格','麗軒','民宿'].map(wh => (
                <option key={wh} value={wh}>{wh}</option>
              ))}
            </select>
          </div>
          <button onClick={fetchMonthlyStats}
            className="px-5 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium">
            查詢
          </button>
          {statsData && (
            <span className="text-xs text-gray-400 self-center">
              {statsData.startMonth} ～ {statsData.endMonth}
              {statsData.warehouse && ` ｜ ${statsData.warehouse}`}
            </span>
          )}
        </div>
      </div>

      {statsLoading ? (
        <div className="text-center py-16 text-gray-400">統計中…</div>
      ) : statsData ? (
        <div className="space-y-4">
          {/* ── KPI 卡片 ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {statsData.warehouses.map(wh => {
              const whTotal = statsData.periodTotal.byWarehouse[wh] || 0;
              const pct = statsData.periodTotal.total > 0
                ? Math.round((whTotal / statsData.periodTotal.total) * 100) : 0;
              return (
                <div key={wh} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-xs text-gray-500 mb-1 truncate">{wh}</p>
                  <p className="text-base font-bold text-green-700">NT$ {whTotal.toLocaleString()}</p>
                  <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-green-400" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}% 佔比</p>
                </div>
              );
            })}
            <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">期間合計</p>
              <p className="text-base font-bold text-green-800">NT$ {statsData.periodTotal.total.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-2">{statsData.periodTotal.invoiceCount} 張發票</p>
              <p className="text-xs text-gray-400">{statsData.rows.length} 個月</p>
            </div>
          </div>

          {/* ── 月 × 館別 樞紐表 ── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">月份 × 館別 進項發票金額</p>
              <p className="text-xs text-gray-400">點擊金額可跳至發票列表</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-green-50">
                  <tr className="bg-green-50 text-green-800 text-xs border-b border-green-100">
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap sticky left-0 bg-green-50">月份</th>
                    {statsData.warehouses.map(wh => (
                      <th key={wh} className="px-4 py-2.5 text-right font-medium whitespace-nowrap">{wh}</th>
                    ))}
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap border-l border-green-100">張數</th>
                    <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap bg-green-100/50">月合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statsData.rows.length === 0 ? (
                    <tr><td colSpan={statsData.warehouses.length + 3} className="text-center py-12 text-gray-400">此期間無進項發票（或請確認資料類型篩選）</td></tr>
                  ) : statsData.rows.map((row, idx) => {
                    const jumpToList = (wh) => {
                      const [y, mo] = row.month.split('-').map(Number);
                      setSearchDateFrom(`${row.month}-01`);
                      setSearchDateTo(`${row.month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`);
                      setSearchWarehouse(wh || '');
                      setSearchInvoiceTitle('');
                      goSalesView('list');
                    };
                    return (
                      <tr key={row.month} className={`hover:bg-green-50/30 ${idx % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-700 sticky left-0 bg-inherit">
                          <button onClick={() => jumpToList('')} className="text-green-700 hover:underline">
                            {row.month}
                          </button>
                        </td>
                        {statsData.warehouses.map(wh => (
                          <td key={wh} className="px-4 py-2.5 text-right">
                            {(row.byWarehouse[wh] || 0) > 0
                              ? <button onClick={() => jumpToList(wh)}
                                  className="text-green-700 hover:underline font-medium tabular-nums">
                                  {(row.byWarehouse[wh] || 0).toLocaleString()}
                                </button>
                              : <span className="text-gray-200">—</span>
                            }
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs border-l border-gray-100 tabular-nums">{row.invoiceCount}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-800 bg-green-50/50 tabular-nums">
                          NT$ {row.total.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-green-100/60 font-semibold text-green-900 text-sm border-t-2 border-green-200">
                    <td className="px-4 py-2.5 sticky left-0 bg-green-100/60">期間合計</td>
                    {statsData.warehouses.map(wh => (
                      <td key={wh} className="px-4 py-2.5 text-right tabular-nums">
                        {(statsData.periodTotal.byWarehouse[wh] || 0).toLocaleString()}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-xs border-l border-green-200 tabular-nums">{statsData.periodTotal.invoiceCount}</td>
                    <td className="px-4 py-2.5 text-right bg-green-100 tabular-nums">NT$ {statsData.periodTotal.total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── 業主私帳獨立統計 ── */}
          {statsData.private && statsData.private.rows.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-orange-200 overflow-hidden">
              <div className="px-4 py-3 border-b bg-orange-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                  <p className="text-sm font-semibold text-orange-800">業主私帳發票統計</p>
                  <span className="text-xs text-orange-500">（已包含於上方合計）</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-orange-700">NT$ {statsData.private.total.total.toLocaleString()}</p>
                  <p className="text-xs text-orange-400">{statsData.private.total.invoiceCount} 張</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-orange-50">
                  <tr className="bg-orange-50/60 text-orange-700 text-xs border-b border-orange-100">
                    <th className="px-4 py-2 text-left font-medium">月份</th>
                    <th className="px-4 py-2 text-right font-medium">張數</th>
                    <th className="px-4 py-2 text-right font-medium">金額</th>
                    <th className="px-4 py-2 text-right font-medium">佔該月發票比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-50">
                  {statsData.private.rows.map(row => {
                    const monthTotal = statsData.rows.find(r => r.month === row.month)?.total || 0;
                    const pct = monthTotal > 0 ? (row.total / monthTotal * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={row.month} className="hover:bg-orange-50/40">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{row.month}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{row.invoiceCount}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-orange-700 tabular-nums">
                          NT$ {row.total.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-orange-100/60 font-semibold text-orange-900 text-sm border-t border-orange-200">
                    <td className="px-4 py-2.5">期間合計</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{statsData.private.total.invoiceCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">NT$ {statsData.private.total.total.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-orange-500 tabular-nums">
                      {statsData.periodTotal.total > 0
                        ? (statsData.private.total.total / statsData.periodTotal.total * 100).toFixed(1)
                        : '0.0'}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── 發票抬頭分析 ── */}
          {statsData.titles.length > 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <p className="text-sm font-semibold text-gray-700">發票抬頭分析</p>
              </div>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="px-4 py-2 text-left font-medium">發票抬頭</th>
                    <th className="px-4 py-2 text-right font-medium">金額</th>
                    <th className="px-4 py-2 text-right font-medium">佔比</th>
                    <th className="px-4 py-2 font-medium w-40">分布</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statsData.titles
                    .map(t => ({ title: t, amt: statsData.periodTotal.byTitle[t] || 0 }))
                    .sort((a, b) => b.amt - a.amt)
                    .map(({ title, amt }) => {
                      const pct = statsData.periodTotal.total > 0
                        ? (amt / statsData.periodTotal.total * 100).toFixed(1) : '0.0';
                      return (
                        <tr key={title} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-700">{title}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">NT$ {amt.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{pct}%</td>
                          <td className="px-4 py-2.5">
                            <div className="bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full bg-blue-400"
                                style={{ width: `${Math.min(100, parseFloat(pct))}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">請設定查詢條件後按「查詢」</div>
      )}
    </div>
  );
}
