'use client';

import Link from 'next/link';

const ACCOUNT_TYPES = ['現金', '銀行存款', '代墊款', '信用卡'];

export default function OverviewTab({
  accounts,
  warehouses,
  isLoggedIn,
  pmsDashboard,
  overviewCategorySummary,
  showAccountForm,
  setShowAccountForm,
  accountForm,
  setAccountForm,
  handleCreateAccount,
  handleSetPrimaryAccount,
  handleDeleteAccount,
  formatMoney,
}) {
  return (
    <div>
      {/* Total summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {ACCOUNT_TYPES.map(type => {
          const total = accounts.filter(a => a.type === type).reduce((s, a) => s + (a.currentBalance ?? 0), 0);
          return (
            <div key={type} className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-emerald-500">
              <div className="text-sm text-gray-500 mb-1">{type}</div>
              <div className={`text-xl font-bold ${total >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatMoney(total)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grand total */}
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4 mb-6 flex justify-between items-center">
        <span className="text-lg font-semibold text-gray-700">全部帳戶總餘額</span>
        <span className={`text-2xl font-bold ${accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          {formatMoney(accounts.reduce((s, a) => s + (a.currentBalance ?? 0), 0))}
        </span>
      </div>

      {/* PMS 現金流 mini-widget */}
      {pmsDashboard && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-indigo-800">PMS 本月收款概況（{pmsDashboard.yearMonth}・{pmsDashboard.count} 筆訂房）</h4>
            <Link href="/pms-income?tab=reservations" className="text-xs text-indigo-600 hover:underline">查看明細 →</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              { label: '現金收款', val: pmsDashboard.cashTotal, today: pmsDashboard.todayCash, color: 'text-emerald-700' },
              { label: 'ATM / 匯款', val: pmsDashboard.wireTotal, today: pmsDashboard.todayWire, color: 'text-blue-700' },
              { label: '信用卡（待撥）', val: pmsDashboard.ccTotal, today: pmsDashboard.todayCc, color: 'text-purple-700' },
              { label: '預收訂金', val: pmsDashboard.depositIn, today: null, color: 'text-amber-700' },
            ].map(({ label, val, today, color }) => (
              <div key={label} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-gray-500">{label}</div>
                <div className={`text-base font-semibold ${color}`}>{val > 0 ? val.toLocaleString('zh-TW') : '-'}</div>
                {today != null && today > 0 && (
                  <div className="text-xs text-gray-400">今日 +{today.toLocaleString('zh-TW')}</div>
                )}
              </div>
            ))}
          </div>
          {Object.keys(pmsDashboard.bySource).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(pmsDashboard.bySource)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([src, amt]) => (
                  <span key={src} className="text-xs bg-white border border-indigo-200 rounded-full px-2 py-0.5 text-indigo-700">
                    {src}：{amt.toLocaleString('zh-TW')}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly category summary */}
      {overviewCategorySummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Income by category */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold text-green-700">本月收入分類</h4>
              <span className="text-lg font-bold text-green-700">{formatMoney(overviewCategorySummary.totalIncome)}</span>
            </div>
            {overviewCategorySummary.incomeByCategory?.length > 0 ? (
              <div className="space-y-2">
                {overviewCategorySummary.incomeByCategory.slice(0, 5).map((item) => (
                  <div key={item.name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-100 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min((item.amount / overviewCategorySummary.totalIncome) * 100, 100)}%` }} />
                      </div>
                      <span className="text-sm font-medium w-24 text-right">{formatMoney(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">本月尚無收入</div>
            )}
          </div>
          {/* Expense by category */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold text-red-700">本月支出分類</h4>
              <span className="text-lg font-bold text-red-700">{formatMoney(overviewCategorySummary.totalExpense)}</span>
            </div>
            {overviewCategorySummary.expenseByCategory?.length > 0 ? (
              <div className="space-y-2">
                {overviewCategorySummary.expenseByCategory.slice(0, 5).map((item) => (
                  <div key={item.name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-100 rounded-full h-2">
                        <div className="bg-red-500 h-2 rounded-full" style={{ width: `${Math.min((item.amount / overviewCategorySummary.totalExpense) * 100, 100)}%` }} />
                      </div>
                      <span className="text-sm font-medium w-24 text-right">{formatMoney(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">本月尚無支出</div>
            )}
          </div>
        </div>
      )}

      {/* Add account button */}
      {isLoggedIn && (
        <div className="mb-4">
          <button
            onClick={() => setShowAccountForm(!showAccountForm)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm"
          >
            + 新增帳戶
          </button>
        </div>
      )}

      {/* Add account form */}
      {showAccountForm && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-emerald-200">
          <h3 className="text-lg font-semibold mb-4">新增資金帳戶</h3>
          <form onSubmit={handleCreateAccount}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">帳戶名稱 *</label>
                <input id="f"
                  type="text"
                  required
                  value={accountForm.name}
                  onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                  placeholder="例：零用金、台銀帳戶"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">帳戶類型 *</label>
                <select id="f-2"
                  value={accountForm.type}
                  onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-35" className="block text-sm font-medium text-gray-700 mb-1">館別 *</label>
                <select id="f-35"
                  required
                  value={accountForm.warehouse}
                  onChange={(e) => setAccountForm({ ...accountForm, warehouse: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">選擇館別</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-36" className="block text-sm font-medium text-gray-700 mb-1">起始金額</label>
                <input id="f-36"
                  type="number"
                  step="0.01"
                  value={accountForm.openingBalance}
                  onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {accountForm.type === '銀行存款' && (
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={accountForm.isPrimary}
                    onChange={e => setAccountForm({ ...accountForm, isPrimary: e.target.checked })}
                    className="rounded" />
                  設為此館別的主要收款銀行帳戶（民宿出納同步優先使用）
                </label>
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm">儲存</button>
              <button type="button" onClick={() => setShowAccountForm(false)} className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {/* Account list grouped by type */}
      {ACCOUNT_TYPES.map(type => {
        const accs = accounts.filter(a => a.type === type);
        if (accs.length === 0) return null;
        return (
          <div key={type} className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-700">{type}</h3>
            <div className="bg-white rounded-lg shadow-sm tbl-wrap">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">帳戶名稱</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">起始金額</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">目前餘額</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">異動金額</th>
                    {isLoggedIn && <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accs.map(acc => {
                    const diff = acc.currentBalance - acc.openingBalance;
                    return (
                      <tr key={acc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{acc.warehouse}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {acc.name}
                          {acc.isPrimary && <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">主要</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{formatMoney(acc.openingBalance)}</td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${acc.currentBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {formatMoney(acc.currentBalance)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${diff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {diff >= 0 ? '+' : ''}{formatMoney(diff)}
                        </td>
                        {isLoggedIn && (
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {acc.type === '銀行存款' && !acc.isPrimary && (
                              <button
                                onClick={() => handleSetPrimaryAccount(acc.id, acc.warehouse, acc.type)}
                                className="text-indigo-600 hover:underline text-sm mr-3"
                              >
                                設為主要
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAccount(acc.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {accounts.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          尚未建立任何帳戶，請先新增資金帳戶
        </div>
      )}
    </div>
  );
}
