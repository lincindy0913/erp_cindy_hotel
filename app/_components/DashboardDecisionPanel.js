'use client';

import Link from 'next/link';

export default function DashboardDecisionPanel({ executiveData, latestReport }) {
  function NT(val) {
    return `NT$ ${Number(val || 0).toLocaleString()}`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">決策建議</h2>
          <Link href="/analytics" className="text-xs text-blue-600 hover:underline">完整分析 →</Link>
        </div>
        {executiveData?.riskAlerts?.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {executiveData.riskAlerts.slice(0, 3).map((alert, i) => (
              <div key={i} className={`px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${
                alert.severity === 'high' ? 'bg-red-50 text-red-800' :
                alert.severity === 'medium' ? 'bg-amber-50 text-amber-800' :
                'bg-blue-50 text-blue-800'
              }`}>
                <span>{alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟠' : '🟡'}</span>
                <div>
                  <span className="font-medium">{alert.message}</span>
                  {alert.action && <span className="ml-1 opacity-75">— {alert.action}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {executiveData?.recommendations?.length > 0 ? (
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {executiveData.recommendations.map((rec, i) => (
              <div key={i} className={`p-2.5 rounded-lg border-l-4 ${
                rec.priority === 1 ? 'bg-red-50 border-red-400' :
                rec.priority === 2 ? 'bg-amber-50 border-amber-400' :
                'bg-blue-50 border-blue-400'
              }`}>
                <p className={`text-xs font-medium ${
                  rec.priority === 1 ? 'text-red-800' :
                  rec.priority === 2 ? 'text-amber-800' : 'text-blue-800'
                }`}>{rec.priority}. {rec.action}</p>
                <p className={`text-xs mt-0.5 ${
                  rec.priority === 1 ? 'text-red-600' :
                  rec.priority === 2 ? 'text-amber-600' : 'text-blue-600'
                }`}>{rec.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-6 text-green-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-gray-600">暫無風險警示，運營狀況良好</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            月度經營報告
            {latestReport && (
              <span className="ml-2 text-xs font-normal text-gray-400">
                {latestReport.reportYear}年{latestReport.reportMonth}月
              </span>
            )}
          </h2>
          <Link href="/analytics?tab=business-report" className="text-xs text-blue-600 hover:underline">完整報告 →</Link>
        </div>
        {latestReport ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">銷貨額</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{NT(latestReport.profitAnalysis?.totalSales)}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">毛利率</p>
                <p className={`text-sm font-bold mt-1 ${(latestReport.profitAnalysis?.grossMargin || 0) >= 36 ? 'text-green-700' : 'text-amber-600'}`}>
                  {latestReport.profitAnalysis?.grossMargin || 0}%
                </p>
                <p className="text-xs text-gray-400">目標 36%</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">現金餘額</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{NT(latestReport.cashFlowAnalysis?.currentBalance)}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">廠商集中度</p>
                <p className={`text-sm font-bold mt-1 ${(latestReport.riskAnalysis?.supplierConcentration?.top1Percentage || 0) > 20 ? 'text-red-600' : 'text-green-700'}`}>
                  {latestReport.riskAnalysis?.supplierConcentration?.top1Percentage || 0}%
                </p>
                <p className="text-xs text-gray-400">門檻 20%</p>
              </div>
            </div>
            {latestReport.executiveSummary && (
              <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                {latestReport.executiveSummary.length > 180
                  ? latestReport.executiveSummary.substring(0, 180) + '...'
                  : latestReport.executiveSummary}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded ${
                latestReport.status === 'approved' ? 'bg-green-100 text-green-700' :
                latestReport.status === 'preview' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {latestReport.status === 'approved' ? '已簽核' : latestReport.status === 'preview' ? '即時預覽' : '草稿'}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            本月報告尚未生成
          </div>
        )}
      </div>
    </div>
  );
}
