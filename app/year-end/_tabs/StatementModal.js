'use client';

import { formatNum0 as formatNumber, formatCurrency } from '@/lib/format-utils';

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月'
];

export function renderStatementContent(statement, selectedYear) {
  if (!statement?.statementData) return <p className="text-gray-500 text-sm">無資料</p>;
  const data = statement.statementData;

  switch (statement.statementType) {
    case '損益表':
      return (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-violet-700">{selectedYear || data.year} 年度損益表</h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-violet-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">營業收入</p>
              <p className="text-lg font-bold text-violet-700">{formatCurrency(data.revenue?.totalRevenue)}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">營業成本</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(data.costOfGoodsSold)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">營業毛利</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(data.grossProfit)}</p>
            </div>
            <div className={`rounded-lg p-3 text-center ${data.netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500">稅前淨利</p>
              <p className={`text-lg font-bold ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.netIncome)}
              </p>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">收入明細</h5>
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-600">發票銷售收入</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(data.revenue?.salesRevenue)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-600">PMS 營業收入</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(data.revenue?.pmsIncome)}</td>
                </tr>
                <tr className="bg-violet-50">
                  <td className="py-2 px-2 font-medium text-violet-700">營業收入合計</td>
                  <td className="py-2 px-2 text-right font-bold text-violet-700">{formatCurrency(data.revenue?.totalRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">費用明細</h5>
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-600">一般費用</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(data.operatingExpenses?.expenses)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-600">部門費用</td>
                  <td className="py-2 text-right font-medium">{formatCurrency(data.operatingExpenses?.departmentExpenses)}</td>
                </tr>
                <tr className="bg-orange-50">
                  <td className="py-2 px-2 font-medium text-orange-700">營業費用合計</td>
                  <td className="py-2 px-2 text-right font-bold text-orange-700">{formatCurrency(data.operatingExpenses?.totalExpenses)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.monthlyBreakdown && data.monthlyBreakdown.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">月度明細</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-violet-50">
                    <tr className="bg-violet-50">
                      <th className="text-left p-2 border border-violet-200">月份</th>
                      <th className="text-right p-2 border border-violet-200">收入</th>
                      <th className="text-right p-2 border border-violet-200">成本</th>
                      <th className="text-right p-2 border border-violet-200">毛利</th>
                      <th className="text-right p-2 border border-violet-200">費用</th>
                      <th className="text-right p-2 border border-violet-200">淨利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlyBreakdown.map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="p-2 border border-gray-200">{MONTH_NAMES[m.month - 1]}</td>
                        <td className="text-right p-2 border border-gray-200">{formatCurrency(m.revenue)}</td>
                        <td className="text-right p-2 border border-gray-200">{formatCurrency(m.cogs)}</td>
                        <td className="text-right p-2 border border-gray-200">{formatCurrency(m.grossProfit)}</td>
                        <td className="text-right p-2 border border-gray-200">{formatCurrency(m.expenses)}</td>
                        <td className={`text-right p-2 border border-gray-200 font-medium ${m.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(m.netIncome)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );

    case '資產負債表':
      return (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-violet-700">{data.year} 年度資產負債表</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-violet-200 rounded-lg p-4">
              <h5 className="font-medium text-violet-700 mb-3">資產</h5>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">現金及約當現金</td>
                    <td className="py-2 text-right">{formatCurrency(data.assets?.currentAssets?.cashAndEquivalents)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">存貨</td>
                    <td className="py-2 text-right">{formatCurrency(data.assets?.currentAssets?.inventory)}</td>
                  </tr>
                  <tr className="bg-violet-50">
                    <td className="py-2 px-2 font-medium">資產合計</td>
                    <td className="py-2 px-2 text-right font-bold">{formatCurrency(data.assets?.totalAssets)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border border-violet-200 rounded-lg p-4">
              <h5 className="font-medium text-violet-700 mb-3">負債與權益</h5>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">應付帳款</td>
                    <td className="py-2 text-right">{formatCurrency(data.liabilities?.currentLiabilities?.accountsPayable)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">長期貸款</td>
                    <td className="py-2 text-right">{formatCurrency(data.liabilities?.longTermLiabilities?.totalLongTermLiabilities)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">保留盈餘</td>
                    <td className="py-2 text-right">{formatCurrency(data.equity?.retainedEarnings)}</td>
                  </tr>
                  <tr className="bg-violet-50">
                    <td className="py-2 px-2 font-medium">負債及權益合計</td>
                    <td className="py-2 px-2 text-right font-bold">{formatCurrency(data.balanceCheck?.totalLiabilitiesAndEquity)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className={`rounded-lg p-3 text-sm ${data.balanceCheck?.isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <span className="font-medium">
              {data.balanceCheck?.isBalanced ? 'O 資產負債平衡' : '! 資產負債不平衡'}
            </span>
            <span className="ml-3">
              資產 {formatCurrency(data.balanceCheck?.totalAssets)} | 負債+權益 {formatCurrency(data.balanceCheck?.totalLiabilitiesAndEquity)}
            </span>
          </div>

          {data.liabilities?.longTermLiabilities?.loanDetails?.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">貸款明細</h5>
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="bg-gray-50">
                    <th className="text-left p-2 border border-gray-200">貸款名稱</th>
                    <th className="text-left p-2 border border-gray-200">銀行</th>
                    <th className="text-right p-2 border border-gray-200">餘額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.liabilities.longTermLiabilities.loanDetails.map((loan, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-2 border border-gray-200">{loan.name}</td>
                      <td className="p-2 border border-gray-200">{loan.bank}</td>
                      <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(loan.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );

    case '現金流量表':
      return (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-violet-700">{data.year} 年度現金流量表</h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">營業活動</p>
              <p className={`text-lg font-bold ${data.operatingActivities?.netOperating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.operatingActivities?.netOperating)}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">投資活動</p>
              <p className={`text-lg font-bold ${data.investingActivities?.netInvesting >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(data.investingActivities?.netInvesting)}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">理財活動</p>
              <p className={`text-lg font-bold ${data.financingActivities?.netFinancing >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                {formatCurrency(data.financingActivities?.netFinancing)}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center ${data.netCashChange >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500">淨現金變動</p>
              <p className={`text-lg font-bold ${data.netCashChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(data.netCashChange)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[400px]">
              <thead className="sticky top-0 z-10 bg-violet-50">
                <tr className="bg-violet-50">
                  <th className="text-left p-2 border border-violet-200">項目</th>
                  <th className="text-right p-2 border border-violet-200">流入</th>
                  <th className="text-right p-2 border border-violet-200">流出</th>
                  <th className="text-right p-2 border border-violet-200">淨額</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200">營業活動</td>
                  <td className="text-right p-2 border border-gray-200 text-green-600">{formatCurrency(data.operatingActivities?.income)}</td>
                  <td className="text-right p-2 border border-gray-200 text-red-600">{formatCurrency(data.operatingActivities?.expenses)}</td>
                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(data.operatingActivities?.netOperating)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200">投資活動</td>
                  <td className="text-right p-2 border border-gray-200 text-green-600">{formatCurrency(data.investingActivities?.inflow)}</td>
                  <td className="text-right p-2 border border-gray-200 text-red-600">{formatCurrency(data.investingActivities?.outflow)}</td>
                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(data.investingActivities?.netInvesting)}</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200">理財活動</td>
                  <td className="text-right p-2 border border-gray-200 text-green-600">{formatCurrency(data.financingActivities?.inflow)}</td>
                  <td className="text-right p-2 border border-gray-200 text-red-600">{formatCurrency(data.financingActivities?.outflow)}</td>
                  <td className="text-right p-2 border border-gray-200 font-medium">{formatCurrency(data.financingActivities?.netFinancing)}</td>
                </tr>
                <tr className="bg-violet-50 font-medium">
                  <td className="p-2 border border-violet-200">合計</td>
                  <td className="p-2 border border-violet-200"></td>
                  <td className="p-2 border border-violet-200"></td>
                  <td className="text-right p-2 border border-violet-200 font-bold text-violet-700">{formatCurrency(data.netCashChange)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.monthlyBreakdown && data.monthlyBreakdown.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">月度明細</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-violet-50">
                    <tr className="bg-violet-50">
                      <th className="text-left p-2 border border-violet-200">月份</th>
                      <th className="text-right p-2 border border-violet-200">營業</th>
                      <th className="text-right p-2 border border-violet-200">投資</th>
                      <th className="text-right p-2 border border-violet-200">理財</th>
                      <th className="text-right p-2 border border-violet-200">淨額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlyBreakdown.map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="p-2 border border-gray-200">{MONTH_NAMES[m.month - 1]}</td>
                        <td className={`text-right p-2 border border-gray-200 ${m.operating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(m.operating)}
                        </td>
                        <td className={`text-right p-2 border border-gray-200 ${m.investing >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {formatCurrency(m.investing)}
                        </td>
                        <td className={`text-right p-2 border border-gray-200 ${m.financing >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                          {formatCurrency(m.financing)}
                        </td>
                        <td className={`text-right p-2 border border-gray-200 font-medium ${m.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatCurrency(m.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400">
            總交易筆數: {data.totalTransactions || 0}
          </div>
        </div>
      );

    default:
      return (
        <pre className="bg-gray-50 p-3 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
  }
}

export default function StatementModal({ statementModal, setStatementModal, selectedYear }) {
  if (!statementModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-violet-200 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-violet-800">
            {statementModal.data?.statementType || '財務報表'}
          </h3>
          <button
            onClick={() => setStatementModal(null)}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
          >
            &times;
          </button>
        </div>
        <div className="px-6 py-4">
          {statementModal.loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
              <span className="ml-3 text-gray-500">載入報表中...</span>
            </div>
          )}
          {!statementModal.loading && statementModal.data && (
            <>
              <div className="text-xs text-gray-400 mb-4">
                產生時間：{statementModal.data.generatedAt ? new Date(statementModal.data.generatedAt).toLocaleString('zh-TW') : '-'}
                {statementModal.data.generatedBy && ` ｜ 由 ${statementModal.data.generatedBy}`}
                {statementModal.data.yearEnd && ` ｜ ${statementModal.data.yearEnd.year} 年度`}
              </div>
              {renderStatementContent(statementModal.data, selectedYear)}
            </>
          )}
          {!statementModal.loading && !statementModal.data && (
            <p className="text-gray-500 text-center py-8">載入失敗，請重試</p>
          )}
        </div>
      </div>
    </div>
  );
}
