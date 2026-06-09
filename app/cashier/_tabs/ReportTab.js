'use client';

import { getDisplayOrderNo } from '../_hooks/useCashierOrders';

export default function ReportTab({
  reportDateFrom, setReportDateFrom,
  reportDateTo, setReportDateTo,
  reportData,
  reportLoading,
  fetchReportData,
  reportByMethod,
  reportTotal,
  reportByAccount,
  accounts,
}) {
  return (
    <div className="print-area">
      {/* Filter controls - hidden when printing */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 no-print">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-14" className="block text-sm font-medium text-gray-700 mb-1">起始日期</label>
            <input id="f-14" type="date" value={reportDateFrom}
              onChange={e => setReportDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="f-15" className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input id="f-15" type="date" value={reportDateTo}
              onChange={e => setReportDateTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </div>
          <button onClick={fetchReportData}
            disabled={reportLoading}
            className="bg-amber-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50 font-medium">
            {reportLoading ? '查詢中...' : '查詢'}
          </button>
          {reportData.length > 0 && (
            <button onClick={() => window.print()}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              列印報表
            </button>
          )}
        </div>
      </div>

      {/* Printable Report：兩段式表格 - 出納支出 + 付款帳戶 */}
      {reportData.length > 0 && (
        <div className="print-content bg-white rounded-lg shadow" id="cashier-report">
          {/* Report Header */}
          <div className="p-6 pb-2 border-b">
            <h2 className="text-xl font-bold text-center mb-1">出納執行報表</h2>
            <p className="text-center text-sm text-gray-600 mb-3">
              報表期間：{reportDateFrom} 至 {reportDateTo}
            </p>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>列印日期：{new Date().toLocaleDateString('zh-TW')} {new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {/* 依付款方式/依資金帳戶（僅畫面顯示） */}
            <div className="grid grid-cols-2 gap-4 mb-2 no-print">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">依付款方式</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(reportByMethod).map(([method, info]) => (
                    <span key={method} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                      {method}：{info.count} 筆 / NT$ {info.total.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">依資金帳戶</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(reportByAccount).map(([accName, info]) => (
                    <span key={accName} className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                      {accName}：{info.count} 筆 / NT$ {info.total.toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-6">
            {/* 第一段：出納支出 */}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-2">出納支出</h3>
              <table className="w-full text-xs border-collapse report-table border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">付款單號</th>
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">廠商</th>
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">館別</th>
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">付款方式</th>
                    <th className="py-2 px-2 text-right font-semibold border-r border-gray-300">金額</th>
                    <th className="py-2 px-2 text-left font-semibold">摘要</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((order) => {
                    const exec = order.executions?.[0];
                    const amount = Number(exec?.actualAmount ?? order.netAmount);
                    return (
                      <tr key={order.id} className="border-b border-gray-200">
                        <td className="py-1.5 px-2 border-r border-gray-200 font-medium">{getDisplayOrderNo(order)}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200">{order.supplierName || '-'}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200">{order.warehouse || '-'}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200">{exec?.paymentMethod || order.paymentMethod}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200 text-right font-medium">NT$ {amount.toLocaleString()}</td>
                        <td className="py-1.5 px-2 whitespace-pre-wrap">{order.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-400">
                    <td className="py-2 px-2 border-r border-gray-300" colSpan={4}>共{reportData.length}筆</td>
                    <td className="py-2 px-2 text-right border-r border-gray-300">合計</td>
                    <td className="py-2 px-2 text-right font-bold">NT$ {reportTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 第二段：付款帳戶 */}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-2">付款帳戶</h3>
              <table className="w-full text-xs border-collapse report-table border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">出納單號</th>
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">執行日期</th>
                    <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">資金帳戶</th>
                    <th className="py-2 px-2 text-right font-semibold border-r border-gray-300">支出金額</th>
                    <th className="py-2 px-2 text-left font-semibold">備註</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((order) => {
                    const exec = order.executions?.[0];
                    const acct = exec ? accounts.find(a => a.id === exec.accountId) : null;
                    const amount = Number(exec?.actualAmount ?? order.netAmount);
                    return (
                      <tr key={order.id} className="border-b border-gray-200">
                        <td className="py-1.5 px-2 border-r border-gray-200 font-medium">{exec?.executionNo || '-'}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200">{exec?.executionDate || '-'}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200">{acct?.name || '-'}</td>
                        <td className="py-1.5 px-2 border-r border-gray-200 text-right font-medium">NT$ {amount.toLocaleString()}</td>
                        <td className="py-1.5 px-2 whitespace-pre-wrap">{exec?.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-400">
                    <td className="py-2 px-2 border-r border-gray-300" colSpan={3}>共{reportData.length}筆</td>
                    <td className="py-2 px-2 text-right border-r border-gray-300">合計</td>
                    <td className="py-2 px-2 text-right font-bold">NT$ {reportTotal.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Signature lines */}
          <div className="p-6 pt-8">
            <div className="grid grid-cols-3 gap-8 text-sm">
              <div className="text-center">
                <div className="border-b border-gray-400 pb-8 mb-2"></div>
                <div className="text-gray-600">製表人</div>
              </div>
              <div className="text-center">
                <div className="border-b border-gray-400 pb-8 mb-2"></div>
                <div className="text-gray-600">覆核人</div>
              </div>
              <div className="text-center">
                <div className="border-b border-gray-400 pb-8 mb-2"></div>
                <div className="text-gray-600">核准人</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!reportLoading && reportData.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          請選擇日期區間後按「查詢」
        </div>
      )}
    </div>
  );
}
