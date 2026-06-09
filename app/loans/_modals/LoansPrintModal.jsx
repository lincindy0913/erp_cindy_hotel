'use client';

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '待出納': 'bg-orange-100 text-orange-800 border-orange-300',
  '已預付': 'bg-blue-100 text-blue-800 border-blue-300',
  '已核實': 'bg-green-100 text-green-800 border-green-300',
  '跳過': 'bg-gray-100 text-gray-600 border-gray-300',
  '已結清': 'bg-blue-100 text-blue-800 border-blue-300'
};

export default function LoansPrintModal({
  reportYear,
  reportMonth,
  reportData,
  onClose,
}) {
  const totalEstPrincipal = reportData.reduce((s, r) => s + (r.estimatedPrincipal || 0), 0);
  const totalEstInterest = reportData.reduce((s, r) => s + (r.estimatedInterest || 0), 0);
  const totalEstTotal = reportData.reduce((s, r) => s + (r.estimatedTotal || 0), 0);
  const confirmedRecords = reportData.filter(r => r.status === '已核實');
  const totalActPrincipal = confirmedRecords.reduce((s, r) => s + (r.actualPrincipal || 0), 0);
  const totalActInterest = confirmedRecords.reduce((s, r) => s + (r.actualInterest || 0), 0);
  const totalActTotal = confirmedRecords.reduce((s, r) => s + (r.actualTotal || 0), 0);
  const printDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 no-print-loans" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto no-print-loans" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-800">{reportYear}年{reportMonth}月 貸款支出報表</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-500 mb-4">列印日期：{printDate}</p>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">貸款</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">銀行</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">館別</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">原本貸款金額</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">剩餘還本金額</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">目前利率</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">備註</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">狀態</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">暫估本金</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">暫估利息</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">暫估合計</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">實際本金</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">實際利息</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">實際合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reportData.length === 0 ? (
                    <tr><td colSpan={14} className="text-center py-8 text-gray-400">此月份暫無還款資料</td></tr>
                  ) : reportData.map(rec => (
                    <tr key={rec.id}>
                      <td className="px-3 py-2"><div className="font-medium">{rec.loan?.loanName}</div><div className="text-xs text-gray-400">{rec.loan?.loanCode}</div></td>
                      <td className="px-3 py-2 text-gray-700">{rec.loan?.bankName}</td>
                      <td className="px-3 py-2 text-gray-700">{rec.loan?.warehouse || '-'}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.loan?.originalAmount)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.loan?.currentBalance)}</td>
                      <td className="px-3 py-2 text-right">{rec.loan?.annualRate != null ? `${Number(rec.loan.annualRate * 100).toFixed(2)}%` : '-'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate" title={rec.loan?.remark || ''}>{rec.loan?.remark || '－'}</td>
                      <td className="px-3 py-2 text-center"><span className={`inline-block px-2 py-0.5 rounded text-xs border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>{rec.status}</span></td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.estimatedPrincipal)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(rec.estimatedInterest)}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{formatCurrency(rec.estimatedTotal)}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{rec.actualPrincipal != null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{rec.actualInterest != null ? formatCurrency(rec.actualInterest) : '-'}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-green-700">{rec.actualTotal != null ? formatCurrency(rec.actualTotal) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                {reportData.length > 0 && (
                  <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                    <tr className="font-bold">
                      <td colSpan={8} className="px-3 py-2 text-right text-gray-700">月度合計</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstPrincipal)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstInterest)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatCurrency(totalEstTotal)}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalActPrincipal)}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalActInterest)}</td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{formatCurrency(totalActTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">關閉</button>
              <button type="button" onClick={() => window.print()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">列印</button>
            </div>
          </div>
        </div>
      </div>

      {/* 列印時只顯示此區塊 */}
      <div id="loans-monthly-report-print-root" className="fixed -left-[9999px] top-0 w-screen bg-white p-8" aria-hidden="true">
        <h1 className="text-xl font-bold text-gray-800 mb-2">{reportYear}年{reportMonth}月 貸款支出報表</h1>
        <p className="text-sm text-gray-500 mb-4">列印日期：{printDate}</p>
        <table className="w-full text-sm border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-3 py-2 border border-gray-300 font-medium">貸款</th>
              <th className="text-left px-3 py-2 border border-gray-300 font-medium">銀行</th>
              <th className="text-left px-3 py-2 border border-gray-300 font-medium">館別</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">原本貸款金額</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">剩餘還本金額</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">目前利率</th>
              <th className="text-left px-3 py-2 border border-gray-300 font-medium">備註</th>
              <th className="text-center px-3 py-2 border border-gray-300 font-medium">狀態</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">暫估本金</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">暫估利息</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">暫估合計</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">實際本金</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">實際利息</th>
              <th className="text-right px-3 py-2 border border-gray-300 font-medium">實際合計</th>
            </tr>
          </thead>
          <tbody>
            {reportData.length === 0 ? (
              <tr><td colSpan={14} className="text-center py-8 text-gray-400 border border-gray-300">此月份暫無還款資料</td></tr>
            ) : reportData.map(rec => (
              <tr key={rec.id}>
                <td className="px-3 py-2 border border-gray-300"><div className="font-medium">{rec.loan?.loanName}</div><div className="text-xs text-gray-400">{rec.loan?.loanCode}</div></td>
                <td className="px-3 py-2 border border-gray-300">{rec.loan?.bankName}</td>
                <td className="px-3 py-2 border border-gray-300">{rec.loan?.warehouse || '-'}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.loan?.originalAmount)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.loan?.currentBalance)}</td>
                <td className="px-3 py-2 text-right border border-gray-300">{rec.loan?.annualRate != null ? `${Number(rec.loan.annualRate * 100).toFixed(2)}%` : '-'}</td>
                <td className="px-3 py-2 border border-gray-300 text-gray-600">{rec.loan?.remark || '－'}</td>
                <td className="px-3 py-2 text-center border border-gray-300">{rec.status}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.estimatedPrincipal)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.estimatedInterest)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(rec.estimatedTotal)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{rec.actualPrincipal != null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{rec.actualInterest != null ? formatCurrency(rec.actualInterest) : '-'}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{rec.actualTotal != null ? formatCurrency(rec.actualTotal) : '-'}</td>
              </tr>
            ))}
          </tbody>
          {reportData.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-indigo-50">
                <td colSpan={8} className="px-3 py-2 text-right border border-gray-300 text-gray-700">月度合計</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalEstPrincipal)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalEstInterest)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalEstTotal)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalActPrincipal)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalActInterest)}</td>
                <td className="px-3 py-2 text-right border border-gray-300 font-mono">{formatCurrency(totalActTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
