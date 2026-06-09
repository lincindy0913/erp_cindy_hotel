'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

function interest(r) {
  return r ? (r.status === '已核實' || r.status === '已預付' ? (r.actualInterest ?? r.estimatedInterest) : r.estimatedInterest) : 0;
}
function principal(r) {
  return r ? (r.status === '已核實' || r.status === '已預付' ? (r.actualPrincipal ?? r.estimatedPrincipal) : r.estimatedPrincipal) : 0;
}

export default function AnnualPrintModal({
  annualYear,
  annualData,
  onClose,
}) {
  const loanMap = {};
  for (const r of annualData) {
    const lid = r.loanId;
    if (!loanMap[lid]) loanMap[lid] = { loan: r.loan, months: {} };
    loanMap[lid].months[r.recordMonth] = r;
  }
  const loanRows = Object.values(loanMap);
  const totalInterestByMonth = MONTHS.map(m => annualData.filter(r => r.recordMonth === m).reduce((s, r) => s + interest(r), 0));
  const grandTotalInterest = totalInterestByMonth.reduce((a, b) => a + b, 0);
  const grandTotalPrincipal = annualData.reduce((s, r) => s + principal(r), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 no-print-loans" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-loans" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800">{annualYear} 年度貸款利息費用報表</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">列印</button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
        </div>
        <div id="loans-annual-report-print-root" className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">{annualYear} 年度貸款利息費用報表</h2>
            <p className="text-sm text-gray-500 mt-1">製表日期：{new Date().toLocaleDateString('zh-TW')}</p>
          </div>
          <div className="flex gap-8 mb-6 text-sm border rounded-lg p-4 bg-gray-50">
            <div><span className="text-gray-500">年度利息費用：</span><span className="font-bold text-red-600">{formatCurrency(Math.round(grandTotalInterest))}</span></div>
            <div><span className="text-gray-500">年度本金還款：</span><span className="font-bold text-indigo-600">{formatCurrency(Math.round(grandTotalPrincipal))}</span></div>
            <div><span className="text-gray-500">年度還款合計：</span><span className="font-bold">{formatCurrency(Math.round(grandTotalInterest + grandTotalPrincipal))}</span></div>
          </div>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs border-collapse border border-gray-300">
              <thead className="sticky top-0 z-10 bg-gray-100">
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1.5 text-left">貸款名稱</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left">銀行</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left">館別</th>
                  {MONTHS.map(m => <th key={m} className="border border-gray-300 px-2 py-1.5 text-right">{m}月</th>)}
                  <th className="border border-gray-300 px-2 py-1.5 text-right bg-red-50">年計</th>
                </tr>
              </thead>
              <tbody>
                {loanRows.map(({ loan, months }) => {
                  const rowInterest = MONTHS.reduce((s, m) => s + interest(months[m]), 0);
                  return (
                    <tr key={loan?.id}>
                      <td className="border border-gray-300 px-2 py-1.5">{loan?.loanName}</td>
                      <td className="border border-gray-300 px-2 py-1.5">{loan?.bankName}</td>
                      <td className="border border-gray-300 px-2 py-1.5">{loan?.warehouse || '-'}</td>
                      {MONTHS.map(m => {
                        const rec = months[m];
                        const val = interest(rec);
                        return (
                          <td key={m} className="border border-gray-300 px-2 py-1.5 text-right font-mono">
                            {!rec ? '' : rec.status === '跳過' ? '—' : formatCurrency(Math.round(val))}
                          </td>
                        );
                      })}
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-mono font-bold text-red-600 bg-red-50">{formatCurrency(Math.round(rowInterest))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={3} className="border border-gray-300 px-2 py-1.5 text-right">月度利息合計</td>
                  {MONTHS.map((m, i) => (
                    <td key={m} className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(totalInterestByMonth[i]))}</td>
                  ))}
                  <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-red-600 bg-red-50">{formatCurrency(Math.round(grandTotalInterest))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <table className="w-full text-xs border-collapse border border-gray-300">
            <thead className="sticky top-0 z-10 bg-gray-100">
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-1.5 text-left">貸款名稱</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">銀行</th>
                <th className="border border-gray-300 px-2 py-1.5 text-left">館別</th>
                <th className="border border-gray-300 px-2 py-1.5 text-right">年利率</th>
                <th className="border border-gray-300 px-2 py-1.5 text-right">年度利息費用</th>
                <th className="border border-gray-300 px-2 py-1.5 text-right">年度本金還款</th>
                <th className="border border-gray-300 px-2 py-1.5 text-right">年度合計</th>
              </tr>
            </thead>
            <tbody>
              {loanRows.map(({ loan, months }) => {
                const rowInterest = Object.values(months).reduce((s, r) => s + interest(r), 0);
                const rowPrincipal = Object.values(months).reduce((s, r) => s + principal(r), 0);
                return (
                  <tr key={loan?.id}>
                    <td className="border border-gray-300 px-2 py-1.5">{loan?.loanName}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{loan?.bankName}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{loan?.warehouse || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{loan?.annualRate != null ? `${Number(loan.annualRate).toFixed(2)}%` : '-'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-mono font-bold text-red-600">{formatCurrency(Math.round(rowInterest))}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(rowPrincipal))}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-mono font-bold">{formatCurrency(Math.round(rowInterest + rowPrincipal))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={4} className="border border-gray-300 px-2 py-1.5 text-right">年度合計</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-red-600">{formatCurrency(Math.round(grandTotalInterest))}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(grandTotalPrincipal))}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-right font-mono">{formatCurrency(Math.round(grandTotalInterest + grandTotalPrincipal))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <style>{`
        @media print {
          .no-print-loans, .no-print-loans * { visibility: hidden !important; }
          #loans-annual-report-print-root { visibility: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #fff !important; z-index: 99999 !important; }
          #loans-annual-report-print-root * { visibility: visible !important; }
        }
      `}</style>
    </div>
  );
}
