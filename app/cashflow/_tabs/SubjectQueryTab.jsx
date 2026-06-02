'use client';

export default function SubjectQueryTab({
  warehouses,
  accountingSubjects,
  subjectFilter,
  setSubjectFilter,
  subjectData,
  subjectLoading,
  fetchSubjectQuery,
  formatMoney,
}) {
  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <div>
            <label htmlFor="f-17" className="block text-sm font-medium text-gray-700 mb-1">起始日期</label>
            <input id="f-17"
              type="date"
              value={subjectFilter.startDate}
              onChange={(e) => setSubjectFilter({ ...subjectFilter, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="f-18" className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input id="f-18"
              type="date"
              value={subjectFilter.endDate}
              onChange={(e) => setSubjectFilter({ ...subjectFilter, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="f-19" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
            <select id="f-19"
              value={subjectFilter.warehouse}
              onChange={(e) => setSubjectFilter({ ...subjectFilter, warehouse: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-44" className="block text-sm font-medium text-gray-700 mb-1">會計科目</label>
            <select id="f-44"
              value={subjectFilter.accountingSubject}
              onChange={(e) => setSubjectFilter({ ...subjectFilter, accountingSubject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">全部科目</option>
              {(() => {
                const groups = {};
                for (const s of accountingSubjects) {
                  const cat = s.category || '其他';
                  if (!groups[cat]) groups[cat] = [];
                  groups[cat].push(s);
                }
                return Object.entries(groups).map(([cat, items]) => (
                  <optgroup key={cat} label={cat}>
                    {items
                      .slice()
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map(s => (
                        <option key={s.id} value={s.code}>
                          {s.code}　{s.name}
                        </option>
                      ))}
                  </optgroup>
                ));
              })()}
            </select>
          </div>
        </div>
        <button
          onClick={fetchSubjectQuery}
          disabled={subjectLoading}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
        >
          {subjectLoading ? '查詢中...' : '查詢'}
        </button>
      </div>

      {/* Results */}
      {subjectData && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500">
              <div className="text-sm text-gray-500 mb-1">收入合計</div>
              <div className="text-xl font-bold text-green-700">{formatMoney(subjectData.totalIncome)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
              <div className="text-sm text-gray-500 mb-1">支出合計</div>
              <div className="text-xl font-bold text-red-700">{formatMoney(subjectData.totalExpense)}</div>
            </div>
            <div className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${subjectData.totalIncome - subjectData.totalExpense >= 0 ? 'border-emerald-500' : 'border-orange-500'}`}>
              <div className="text-sm text-gray-500 mb-1">淨額（共 {subjectData.totalCount} 筆）</div>
              <div className={`text-xl font-bold ${subjectData.totalIncome - subjectData.totalExpense >= 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                {formatMoney(subjectData.totalIncome - subjectData.totalExpense)}
              </div>
            </div>
          </div>

          {/* Grouped table */}
          <div className="bg-white rounded-lg shadow-sm tbl-wrap">
            <table className="w-full">
              <thead className="bg-emerald-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">會計科目</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">筆數</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">收入</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">支出</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">淨額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subjectData.rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">查無符合的交易紀錄</td></tr>
                ) : (
                  subjectData.rows.map((row, idx) => {
                    const net = row.income - row.expense;
                    return (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-mono">{row.subject}</td>
                        <td className="px-4 py-3 text-sm">{row.warehouse}</td>
                        <td className="px-4 py-3 text-sm text-right">{row.count}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-700 font-medium">
                          {row.income > 0 ? formatMoney(row.income) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-red-700 font-medium">
                          {row.expense > 0 ? formatMoney(row.expense) : '-'}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${net >= 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                          {formatMoney(net)}
                        </td>
                      </tr>
                    );
                  })
                )}
                {subjectData.rows.length > 0 && (
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-4 py-3 text-sm" colSpan={2}>合計</td>
                    <td className="px-4 py-3 text-sm text-right">{subjectData.totalCount}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-700">{formatMoney(subjectData.totalIncome)}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-700">{formatMoney(subjectData.totalExpense)}</td>
                    <td className={`px-4 py-3 text-sm text-right ${subjectData.totalIncome - subjectData.totalExpense >= 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                      {formatMoney(subjectData.totalIncome - subjectData.totalExpense)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!subjectData && !subjectLoading && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
          請設定查詢條件後點擊「查詢」
        </div>
      )}
    </div>
  );
}
