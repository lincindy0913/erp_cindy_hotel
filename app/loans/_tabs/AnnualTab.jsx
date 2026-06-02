'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

export default function AnnualTab({
  annualYear,
  setAnnualYear,
  annualData,
  annualLoading,
  setShowAnnualPrintModal,
  now,
}) {
  const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

  // Build per-loan map
  const loanMap = {};
  for (const r of annualData) {
    const lid = r.loanId;
    if (!loanMap[lid]) {
      loanMap[lid] = { loan: r.loan, months: {} };
    }
    loanMap[lid].months[r.recordMonth] = r;
  }
  const loanRows = Object.values(loanMap);

  // Interest value: use actual if confirmed, else estimated
  function interest(r) { return r ? (r.status === '已核實' || r.status === '已預付' ? (r.actualInterest ?? r.estimatedInterest) : r.estimatedInterest) : 0; }
  function principal(r) { return r ? (r.status === '已核實' || r.status === '已預付' ? (r.actualPrincipal ?? r.estimatedPrincipal) : r.estimatedPrincipal) : 0; }

  // Totals
  const totalInterestByMonth = MONTHS.map(m => annualData.filter(r => r.recordMonth === m).reduce((s, r) => s + interest(r), 0));
  const totalPrincipalByMonth = MONTHS.map(m => annualData.filter(r => r.recordMonth === m).reduce((s, r) => s + principal(r), 0));
  const grandTotalInterest = totalInterestByMonth.reduce((a, b) => a + b, 0);
  const grandTotalPrincipal = totalPrincipalByMonth.reduce((a, b) => a + b, 0);

  // By warehouse
  const warehouseMap = {};
  for (const r of annualData) {
    const wh = r.loan?.warehouse || '未指定';
    if (!warehouseMap[wh]) warehouseMap[wh] = { interest: 0, principal: 0 };
    warehouseMap[wh].interest += interest(r);
    warehouseMap[wh].principal += principal(r);
  }
  const warehouseList = Object.entries(warehouseMap).sort((a, b) => b[1].interest - a[1].interest);

  const confirmedCount = annualData.filter(r => r.status === '已核實').length;
  const totalCount = annualData.length;

  const yearOptions = [now.getFullYear() - 3, now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div>
      {/* Controls */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <label htmlFor="f-29" className="text-sm font-medium text-gray-600">報表年度:</label>
        <select id="f-29" value={annualYear} onChange={e => setAnnualYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {yearOptions.map(y => <option key={y} value={y}>{y} 年</option>)}
        </select>
        {annualLoading && <span className="text-sm text-gray-400 ml-2">載入中...</span>}
        <button
          type="button"
          onClick={() => setShowAnnualPrintModal(true)}
          className="ml-auto px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
        >
          列印年度報表
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">年度利息費用</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(Math.round(grandTotalInterest))}</p>
          <p className="text-xs text-gray-400 mt-1">{annualYear} 年全年</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">年度本金還款</p>
          <p className="text-xl font-bold text-indigo-600">{formatCurrency(Math.round(grandTotalPrincipal))}</p>
          <p className="text-xs text-gray-400 mt-1">本金攤還合計</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">年度還款合計</p>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(Math.round(grandTotalInterest + grandTotalPrincipal))}</p>
          <p className="text-xs text-gray-400 mt-1">利息 + 本金</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-xs text-gray-500 mb-1">核實進度</p>
          <p className="text-xl font-bold text-green-600">{confirmedCount} / {totalCount}</p>
          <p className="text-xs text-gray-400 mt-1">筆已核實</p>
        </div>
      </div>

      {/* By warehouse */}
      {warehouseList.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">各館別年度利息費用</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {warehouseList.map(([wh, v]) => (
              <div key={wh} className="bg-red-50 rounded-lg p-3 border border-red-100">
                <p className="text-xs text-gray-500 mb-1">{wh}</p>
                <p className="text-base font-bold text-red-600">{formatCurrency(Math.round(v.interest))}</p>
                <p className="text-xs text-gray-400">本金 {formatCurrency(Math.round(v.principal))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly interest pivot table */}
      <div className="bg-white rounded-xl shadow-sm mb-6" style={{ overflow: 'clip' }}>
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="font-medium text-gray-700">{annualYear} 年度 — 各貸款月度利息費用明細</h3>
          <span className="text-xs text-gray-400">單位: 元</span>
        </div>
        <div className="overflow-x-auto">
          {annualLoading ? (
            <div className="text-center py-12 text-gray-400">載入中...</div>
          ) : loanRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">此年度暫無還款資料</div>
          ) : (
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 border-b text-gray-600 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-gray-50 z-10 min-w-[140px]">貸款</th>
                  <th className="text-left px-3 py-2 font-medium min-w-[80px]">銀行</th>
                  <th className="text-left px-3 py-2 font-medium min-w-[60px]">館別</th>
                  {MONTHS.map(m => (
                    <th key={m} className="text-right px-2 py-2 font-medium min-w-[70px]">{m}月</th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium bg-red-50 min-w-[80px]">年計利息</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loanRows.map(({ loan, months }) => {
                  const rowInterest = MONTHS.reduce((s, m) => s + interest(months[m]), 0);
                  return (
                    <tr key={loan?.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 sticky left-0 bg-white z-10">
                        <div className="font-medium text-gray-800">{loan?.loanName}</div>
                        <div className="text-gray-400">{loan?.loanCode}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{loan?.bankName}</td>
                      <td className="px-3 py-2 text-gray-600">{loan?.warehouse || '-'}</td>
                      {MONTHS.map(m => {
                        const rec = months[m];
                        const val = interest(rec);
                        const isConfirmed = rec && (rec.status === '已核實' || rec.status === '已預付');
                        const isSkipped = rec && rec.status === '跳過';
                        return (
                          <td key={m} className={`px-2 py-2 text-right font-mono ${isSkipped ? 'text-gray-300' : isConfirmed ? 'text-green-700' : 'text-gray-600'}`}>
                            {!rec ? <span className="text-gray-200">—</span> : isSkipped ? '跳過' : formatCurrency(Math.round(val))}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono font-bold text-red-600 bg-red-50">{formatCurrency(Math.round(rowInterest))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-indigo-200 bg-indigo-50 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-gray-700 sticky left-0 bg-indigo-50 z-10">月度利息合計</td>
                  {MONTHS.map((m, i) => (
                    <td key={m} className="px-2 py-2 text-right font-mono text-indigo-700">{formatCurrency(Math.round(totalInterestByMonth[i]))}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono text-red-700 bg-red-100">{formatCurrency(Math.round(grandTotalInterest))}</td>
                </tr>
                <tr className="border-t border-indigo-100">
                  <td colSpan={3} className="px-3 py-2 text-right text-gray-700 sticky left-0 bg-indigo-50 z-10">月度本金合計</td>
                  {MONTHS.map((m, i) => (
                    <td key={m} className="px-2 py-2 text-right font-mono text-gray-600">{formatCurrency(Math.round(totalPrincipalByMonth[i]))}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono text-gray-700">{formatCurrency(Math.round(grandTotalPrincipal))}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Per-loan annual summary table */}
      <div className="bg-white rounded-xl shadow-sm" style={{ overflow: 'clip' }}>
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-medium text-gray-700">{annualYear} 年度 — 各貸款年度費用匯總</h3>
        </div>
        <div className="tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">貸款名稱</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">銀行</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">館別</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">年利率</th>
                <th className="text-right px-4 py-3 font-medium text-red-600">年度利息費用</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">年度本金還款</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">年度還款合計</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">有效月份</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loanRows.map(({ loan, months }) => {
                const rowInterest = Object.values(months).reduce((s, r) => s + interest(r), 0);
                const rowPrincipal = Object.values(months).reduce((s, r) => s + principal(r), 0);
                const monthCount = Object.values(months).filter(r => r.status !== '跳過').length;
                return (
                  <tr key={loan?.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{loan?.loanName}</div>
                      <div className="text-xs text-gray-400">{loan?.loanCode}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{loan?.bankName}</td>
                    <td className="px-4 py-3 text-gray-700">{loan?.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{loan?.annualRate != null ? `${Number(loan.annualRate).toFixed(2)}%` : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-red-600">{formatCurrency(Math.round(rowInterest))}</td>
                    <td className="px-4 py-3 text-right font-mono text-indigo-600">{formatCurrency(Math.round(rowPrincipal))}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">{formatCurrency(Math.round(rowInterest + rowPrincipal))}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{monthCount} 個月</td>
                  </tr>
                );
              })}
            </tbody>
            {loanRows.length > 0 && (
              <tfoot className="bg-indigo-50 border-t-2 border-indigo-200 font-bold">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-gray-700">年度合計</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{formatCurrency(Math.round(grandTotalInterest))}</td>
                  <td className="px-4 py-3 text-right font-mono text-indigo-600">{formatCurrency(Math.round(grandTotalPrincipal))}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-800">{formatCurrency(Math.round(grandTotalInterest + grandTotalPrincipal))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
