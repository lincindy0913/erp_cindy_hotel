'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      thisMonthPurchase: 0,
      thisMonthSales: 0,
      grossProfit: 0,
      grossProfitMargin: 0,
      lowInventoryCount: 0
    },
    recentTransactions: [],
    thisMonthTrend: { purchases: 0, sales: 0 },
    totalCashBalance: 0,
    cashAccounts: [],
    pendingPayments: 0,
    riskAlerts: { overdueChecks: 0, expiringLoans: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [executiveData, setExecutiveData] = useState(null);
  const [latestReport, setLatestReport] = useState(null);

  // Notification state for 本日待辦 card
  const [ntfNotifications, setNtfNotifications] = useState([]);
  const [ntfSummary, setNtfSummary] = useState({ total: 0, critical: 0, urgent: 0, warning: 0 });
  const [ntfLoading, setNtfLoading] = useState(true);
  const [ntfWarningExpanded, setNtfWarningExpanded] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setNtfNotifications(data.notifications || []);
        setNtfSummary(data.summary || { total: 0, critical: 0, urgent: 0, warning: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setNtfLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchNotifications();
    fetchExecutiveData();
    fetchLatestReport();
  }, [fetchNotifications]);

  async function fetchDashboardData() {
    try {
      const response = await fetch('/api/dashboard');
      const data = await response.json();
      setDashboardData(prev => ({ ...prev, ...data }));
      setLoading(false);
    } catch (error) {
      console.error('取得儀表板資料失敗:', error);
      setLoading(false);
    }
  }

  async function fetchExecutiveData() {
    try {
      const response = await fetch('/api/dashboard/executive');
      if (response.ok) {
        const data = await response.json();
        setExecutiveData(data);
      }
    } catch (error) {
      console.error('取得決策儀表板資料失敗:', error);
    }
  }

  async function fetchLatestReport() {
    try {
      const now = new Date();
      const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/analytics/business-report?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        setLatestReport(data.report || data.generated);
      }
    } catch (error) {
      console.error('取得月度報告失敗:', error);
    }
  }

  return (
    <div className="min-h-screen page-bg-dashboard">
      <Navigation borderColor="border-blue-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Row 1: Core KPIs */}
        <div className="grid grid-cols-4 gap-6 mb-4">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-600 mb-2">本月進貨</p>
            <p className="text-3xl font-bold text-gray-900">
              NT$ {loading ? '-' : dashboardData.kpis.thisMonthPurchase.toLocaleString()}
            </p>
            <p className="text-sm text-gray-400 mt-2">本月 {dashboardData.thisMonthTrend.purchases} 筆</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-600 mb-2">本月銷貨</p>
            <p className="text-3xl font-bold text-gray-900">
              NT$ {loading ? '-' : dashboardData.kpis.thisMonthSales.toLocaleString()}
            </p>
            <p className="text-sm text-gray-400 mt-2">本月 {dashboardData.thisMonthTrend.sales} 筆</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-600 mb-2">本月毛利</p>
            <p className="text-3xl font-bold text-gray-900">
              NT$ {loading ? '-' : dashboardData.kpis.grossProfit.toLocaleString()}
            </p>
            <p className="text-sm text-gray-600 mt-2">毛利率 {dashboardData.kpis.grossProfitMargin}%</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-sm text-gray-600 mb-2">現金餘額合計</p>
            <p className="text-3xl font-bold text-emerald-700">
              NT$ {loading ? '-' : Number(dashboardData.totalCashBalance || 0).toLocaleString()}
            </p>
            <p className="text-sm text-gray-400 mt-2">{dashboardData.cashAccounts?.length || 0} 個帳戶</p>
          </div>
        </div>

        {/* Row 2: Alerts */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500">
            <p className="text-sm text-gray-600 mb-2">庫存警示</p>
            <p className="text-3xl font-bold text-red-600">
              {loading ? '-' : dashboardData.kpis.lowInventoryCount} 項
            </p>
            <a href="/inventory" className="text-sm text-blue-600 mt-2 inline-block">查看詳情 →</a>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange-400">
            <p className="text-sm text-gray-600 mb-2">待付款單</p>
            <p className="text-3xl font-bold text-orange-600">
              {loading ? '-' : dashboardData.pendingPayments || 0} 筆
            </p>
            <a href="/finance" className="text-sm text-blue-600 mt-2 inline-block">前往處理 →</a>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-yellow-400">
            <p className="text-sm text-gray-600 mb-2">逾期支票</p>
            <p className="text-3xl font-bold text-yellow-700">
              {loading ? '-' : dashboardData.riskAlerts?.overdueChecks || 0} 張
            </p>
            <a href="/checks" className="text-sm text-blue-600 mt-2 inline-block">前往處理 →</a>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-400">
            <p className="text-sm text-gray-600 mb-2">即將到期貸款</p>
            <p className="text-3xl font-bold text-purple-700">
              {loading ? '-' : dashboardData.riskAlerts?.expiringLoans || 0} 筆
            </p>
            <a href="/loans" className="text-sm text-blue-600 mt-2 inline-block">查看詳情 →</a>
          </div>
        </div>

        {/* 本日待辦 notification card */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">本日待辦</h2>
              {!ntfLoading && ntfSummary.total > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${
                  ntfSummary.critical > 0 ? 'bg-red-500' : ntfSummary.urgent > 0 ? 'bg-orange-500' : 'bg-amber-500'
                }`}>
                  {ntfSummary.total}
                </span>
              )}
            </div>
            <Link href="/notifications" className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
              查看全部 →
            </Link>
          </div>

          {ntfLoading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : ntfNotifications.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">今日無待辦事項，一切順利！</span>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Critical items */}
              {ntfNotifications.filter(n => n.level === 'critical').map(n => (
                <div key={n.code} className="flex items-center justify-between p-3 rounded-lg bg-red-50 border-l-4 border-red-500">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <span className="text-sm font-medium text-red-800">{n.title}</span>
                      <span className="text-xs text-red-600 ml-2">({n.count})</span>
                      <p className="text-xs text-red-600 mt-0.5">{n.message}</p>
                    </div>
                  </div>
                  <Link href={n.targetUrl} className="text-xs text-red-700 hover:text-red-900 font-medium whitespace-nowrap">
                    → 前往
                  </Link>
                </div>
              ))}

              {/* Urgent items */}
              {ntfNotifications.filter(n => n.level === 'urgent').map(n => (
                <div key={n.code} className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border-l-4 border-orange-500">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-orange-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <span className="text-sm font-medium text-orange-800">{n.title}</span>
                      <span className="text-xs text-orange-600 ml-2">({n.count})</span>
                      <p className="text-xs text-orange-600 mt-0.5">{n.message}</p>
                    </div>
                  </div>
                  <Link href={n.targetUrl} className="text-xs text-orange-700 hover:text-orange-900 font-medium whitespace-nowrap">
                    → 前往
                  </Link>
                </div>
              ))}

              {/* Warning items - with expand toggle */}
              {ntfNotifications.filter(n => n.level === 'warning').length > 0 && (
                <>
                  <button
                    onClick={() => setNtfWarningExpanded(!ntfWarningExpanded)}
                    className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-amber-50 transition-colors text-left"
                  >
                    <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-amber-700 font-medium">
                      警告事項 ({ntfNotifications.filter(n => n.level === 'warning').reduce((s, n) => s + n.count, 0)})
                    </span>
                    <svg className={`w-4 h-4 text-amber-600 transition-transform ${ntfWarningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {ntfWarningExpanded && ntfNotifications.filter(n => n.level === 'warning').map(n => (
                    <div key={n.code} className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border-l-4 border-amber-400 ml-4">
                      <div>
                        <span className="text-sm font-medium text-amber-800">{n.title}</span>
                        <span className="text-xs text-amber-600 ml-2">({n.count})</span>
                        <p className="text-xs text-amber-600 mt-0.5">{n.message}</p>
                      </div>
                      <Link href={n.targetUrl} className="text-xs text-amber-700 hover:text-amber-900 font-medium whitespace-nowrap">
                        → 前往
                      </Link>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold mb-4">進銷貨趨勢</h2>
            <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-500 mb-2">進貨：{dashboardData.thisMonthTrend.purchases} 筆</p>
                <p className="text-gray-500">銷貨：{dashboardData.thisMonthTrend.sales} 筆</p>
              </div>
            </div>
          </div>

          {/* Executive Risk Alerts + Recommendations */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">決策建議</h2>
              <Link href="/analytics" className="text-sm text-blue-600 hover:underline">完整分析 →</Link>
            </div>
            {/* Risk alerts from executive API */}
            {executiveData?.riskAlerts?.length > 0 && (
              <div className="mb-3 space-y-2">
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
                  <div key={i} className={`p-3 rounded-lg border-l-4 ${
                    rec.priority === 1 ? 'bg-red-50 border-red-400' :
                    rec.priority === 2 ? 'bg-amber-50 border-amber-400' :
                    'bg-blue-50 border-blue-400'
                  }`}>
                    <p className={`text-sm font-medium ${
                      rec.priority === 1 ? 'text-red-800' :
                      rec.priority === 2 ? 'text-amber-800' :
                      'text-blue-800'
                    }`}>{rec.priority}. {rec.action}</p>
                    <p className={`text-xs mt-0.5 ${
                      rec.priority === 1 ? 'text-red-600' :
                      rec.priority === 2 ? 'text-amber-600' :
                      'text-blue-600'
                    }`}>{rec.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 bg-gray-50 rounded flex items-center justify-center text-gray-400 text-sm">
                暫無風險警示，運營狀況良好
              </div>
            )}
          </div>
        </div>

        {/* Monthly Business Report Widget */}
        {latestReport && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">
                月度經營報告
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {latestReport.reportYear}年{latestReport.reportMonth}月
                </span>
              </h2>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  latestReport.status === 'approved' ? 'bg-green-100 text-green-700' :
                  latestReport.status === 'preview' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {latestReport.status === 'approved' ? '已簽核' : latestReport.status === 'preview' ? '即時預覽' : '草稿'}
                </span>
                <Link href="/analytics?tab=business-report" className="text-sm text-blue-600 hover:underline">查看完整報告 →</Link>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">銷貨額</p>
                <p className="text-base font-bold text-gray-800 mt-1">
                  NT$ {Number(latestReport.profitAnalysis?.totalSales || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">毛利率</p>
                <p className={`text-base font-bold mt-1 ${
                  (latestReport.profitAnalysis?.grossMargin || 0) >= 36 ? 'text-green-700' : 'text-amber-600'
                }`}>
                  {latestReport.profitAnalysis?.grossMargin || 0}%
                </p>
                <p className="text-xs text-gray-400">目標 36%</p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">現金餘額</p>
                <p className="text-base font-bold text-gray-800 mt-1">
                  NT$ {Number(latestReport.cashFlowAnalysis?.currentBalance || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">廠商集中度</p>
                <p className={`text-base font-bold mt-1 ${
                  (latestReport.riskAnalysis?.supplierConcentration?.top1Percentage || 0) > 20 ? 'text-red-600' : 'text-green-700'
                }`}>
                  {latestReport.riskAnalysis?.supplierConcentration?.top1Percentage || 0}%
                </p>
                <p className="text-xs text-gray-400">門檻 20%</p>
              </div>
            </div>
            {latestReport.executiveSummary && (
              <p className="mt-3 text-xs text-gray-500 border-t border-gray-100 pt-3 leading-relaxed">
                {latestReport.executiveSummary.length > 200
                  ? latestReport.executiveSummary.substring(0, 200) + '...'
                  : latestReport.executiveSummary}
              </p>
            )}
          </div>
        )}

        <div className="flex gap-4 mb-8 flex-wrap">
          <Link href="/purchasing" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
            <span>➕</span>
            <span>新增進貨單</span>
          </Link>
          <Link href="/sales" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2">
            <span>➕</span>
            <span>新增銷貨單</span>
          </Link>
          <Link href="/inventory" className="bg-white border border-blue-600 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50 inline-flex items-center gap-2">
            <span>📦</span>
            <span>查詢庫存</span>
          </Link>
          <Link href="/analytics" className="bg-white border border-blue-600 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50 inline-flex items-center gap-2">
            <span>📊</span>
            <span>查看報表</span>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-4">最近交易</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">時間</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">類型</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">單號</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">金額</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">載入中...</td>
                  </tr>
                ) : dashboardData.recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">尚無交易資料</td>
                  </tr>
                ) : (
                  dashboardData.recentTransactions.map((t, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{t.date}</td>
                      <td className="px-4 py-3">
                        <span className={t.type === '進貨' ? 'text-blue-600' : 'text-green-600'}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">{t.no}</td>
                      <td className="px-4 py-3">NT$ {parseFloat(t.amount).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={t.status === '已完成' || t.status === '已出貨' ? 'text-green-600' : 'text-yellow-600'}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
