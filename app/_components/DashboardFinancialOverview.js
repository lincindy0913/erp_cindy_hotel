'use client';

function NT(val) {
  return `NT$ ${Number(val || 0).toLocaleString()}`;
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

export default function DashboardFinancialOverview({ loading, kpis, cashAccounts }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-4">本月財務概況</h2>
      {loading ? (
        <div className="space-y-4 pt-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded animate-pulse"></div>
          ))}
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {(() => {
            const purchase = kpis.thisMonthPurchase || 0;
            const sales = kpis.thisMonthSales || 0;
            const expense = kpis.thisMonthExpense || 0;
            const max = Math.max(purchase, sales, expense, 1);
            return (
              <>
                <MiniBar label="進貨" value={purchase} max={max} color="bg-blue-500" />
                <MiniBar label="銷貨" value={sales} max={max} color="bg-indigo-500" />
                <MiniBar label="費用" value={expense} max={max} color="bg-amber-500" />
              </>
            );
          })()}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-500">本月毛利</span>
            <span className={`text-sm font-bold ${(kpis.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {NT(kpis.grossProfit)} ({kpis.grossProfitMargin || 0}%)
            </span>
          </div>
          {cashAccounts?.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <p className="text-xs text-gray-400 font-medium mb-2">現金帳戶</p>
              {cashAccounts.slice(0, 4).map(acc => (
                <div key={acc.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[120px]">{acc.name}</span>
                  <span className={`font-medium ${acc.currentBalance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {NT(acc.currentBalance)}
                  </span>
                </div>
              ))}
              {cashAccounts.length > 4 && (
                <p className="text-xs text-gray-400">…還有 {cashAccounts.length - 4} 個帳戶</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
