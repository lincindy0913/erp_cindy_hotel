'use client';

import Link from 'next/link';

function NT(val) {
  return `NT$ ${Number(val || 0).toLocaleString()}`;
}

function KpiCard({ label, value, sub, icon, colorClass = 'text-gray-900', borderClass = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border border-gray-100 ${borderClass}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  );
}

function MiniBar({ label, value, max, color = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-16 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-24 shrink-0">{NT(value)}</span>
    </div>
  );
}

export default function DashboardPublicView({ summary, summaryLoading, onRetry }) {
  if (summaryLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 h-28 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-7 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center space-y-3">
        <p className="text-gray-500 text-sm">資料載入失敗，請重新整理頁面。</p>
        <button
          onClick={onRetry || (() => window.location.reload())}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          重新整理
        </button>
      </div>
    );
  }

  const sk = summary.kpis || {};
  const sa = summary.alerts || {};
  const purchase = sk.thisMonthPurchase || 0;
  const sales = sk.thisMonthSales || 0;
  const expense = sk.thisMonthExpense || 0;
  const pms = sk.pmsIncome || 0;
  const cash = sk.totalCashBalance || 0;
  const barMax = Math.max(purchase, sales, expense, pms, 1);
  const totalAlerts = (sa.overdueChecks || 0) + (sa.expiringLoans || 0) + (sa.pendingPayments || 0) + (sa.lowInventoryCount || 0);

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <p className="text-sm font-medium text-blue-800">目前為唯讀模式</p>
            <p className="text-xs text-blue-600">登入後可檢視完整資料、操作及管理功能</p>
          </div>
        </div>
        <Link href="/login" className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap">
          前往登入
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本月進貨金額" value={NT(purchase)} sub={`${sk.purchaseCount || 0} 筆`} icon="📦" borderClass="border-l-4 border-l-blue-400" />
        <KpiCard label="本月銷貨金額" value={NT(sales)} sub={`${sk.salesCount || 0} 筆`} icon="🧾" borderClass="border-l-4 border-l-indigo-400" />
        <KpiCard label="現金餘額合計" value={NT(cash)} sub={`${summary.cashAccounts?.length || 0} 個帳戶`} icon="💰" colorClass="text-emerald-700" borderClass="border-l-4 border-l-emerald-400" />
        <KpiCard label="PMS 營業收入" value={NT(pms)} sub={`${sk.pmsIncomeCount || 0} 筆`} icon="🏨" colorClass="text-teal-700" borderClass="border-l-4 border-l-teal-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-4">本月財務概況（{summary.month}）</h2>
          <div className="space-y-4">
            <MiniBar label="進貨" value={purchase} max={barMax} color="bg-blue-500" />
            <MiniBar label="銷貨" value={sales} max={barMax} color="bg-indigo-500" />
            <MiniBar label="費用" value={expense} max={barMax} color="bg-amber-500" />
            <MiniBar label="PMS" value={pms} max={barMax} color="bg-teal-500" />
          </div>
          {summary.cashAccounts?.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-1.5">
              <p className="text-xs text-gray-400 font-medium mb-2">現金帳戶餘額</p>
              {summary.cashAccounts.slice(0, 5).map((acc, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[160px]">
                    {acc.warehouse ? `[${acc.warehouse}] ` : ''}{acc.name}
                  </span>
                  <span className={`font-medium ${acc.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {NT(acc.balance)}
                  </span>
                </div>
              ))}
              {summary.cashAccounts.length > 5 && (
                <p className="text-xs text-gray-400">…還有 {summary.cashAccounts.length - 5} 個帳戶</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">待處理事項</h2>
            {totalAlerts > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{totalAlerts} 項</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`flex items-center gap-3 p-3 rounded-lg ${sa.pendingPayments > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'}`}>
              <span className="text-2xl">💳</span>
              <div>
                <p className={`text-lg font-bold ${sa.pendingPayments > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{sa.pendingPayments || 0}</p>
                <p className="text-xs text-gray-500">待付款單</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${sa.overdueChecks > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
              <span className="text-2xl">📋</span>
              <div>
                <p className={`text-lg font-bold ${sa.overdueChecks > 0 ? 'text-red-600' : 'text-gray-300'}`}>{sa.overdueChecks || 0}</p>
                <p className="text-xs text-gray-500">逾期支票</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${sa.expiringLoans > 0 ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'}`}>
              <span className="text-2xl">🏦</span>
              <div>
                <p className={`text-lg font-bold ${sa.expiringLoans > 0 ? 'text-purple-600' : 'text-gray-300'}`}>{sa.expiringLoans || 0}</p>
                <p className="text-xs text-gray-500">即將到期貸款</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg ${sa.lowInventoryCount > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
              <span className="text-2xl">⚠️</span>
              <div>
                <p className={`text-lg font-bold ${sa.lowInventoryCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{sa.lowInventoryCount || 0}</p>
                <p className="text-xs text-gray-500">庫存警示</p>
              </div>
            </div>
          </div>
          {summary.utilityBillCount > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">水電費帳單紀錄</span>
              <span className="text-sm font-medium text-teal-700">{summary.utilityBillCount} 筆</span>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">登入後可查看詳細資料與處理待辦事項</p>
          </div>
        </div>
      </div>
    </>
  );
}
