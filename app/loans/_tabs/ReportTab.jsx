'use client';

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '待出納': 'bg-orange-100 text-orange-800 border-orange-300',
  '已預付': 'bg-blue-100 text-blue-800 border-blue-300',
  '已核實': 'bg-green-100 text-green-800 border-green-300',
  '跳過': 'bg-gray-100 text-gray-600 border-gray-300',
  '已結清': 'bg-blue-100 text-blue-800 border-blue-300'
};

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

export default function ReportTab({
  reportYear,
  setReportYear,
  reportMonth,
  setReportMonth,
  reportData,
  setShowLoansPrintModal,
  now,
}) {
  const totalEstPrincipal = reportData.reduce((s, r) => s + r.estimatedPrincipal, 0);
  const totalEstInterest = reportData.reduce((s, r) => s + r.estimatedInterest, 0);
  const totalEstTotal = reportData.reduce((s, r) => s + r.estimatedTotal, 0);
  const confirmedRecords = reportData.filter(r => r.status === '已核實');
  const totalActPrincipal = confirmedRecords.reduce((s, r) => s + (r.actualPrincipal || 0), 0);
  const totalActInterest = confirmedRecords.reduce((s, r) => s + (r.actualInterest || 0), 0);
  const totalActTotal = confirmedRecords.reduce((s, r) => s + (r.actualTotal || 0), 0);

  return (
    <div>
      {/* Month Selector + Print */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <label htmlFor="f-28" className="text-sm font-medium text-gray-600">報表月份:</label>
        <select id="f-28" value={reportYear} onChange={e => setReportYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowLoansPrintModal(true)}
          className="ml-auto px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
        >
          列印每月貸款支出報表
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">暫估合計</p>
          <p className="text-xl font-bold text-yellow-700">{formatCurrency(totalEstTotal)}</p>
          <div className="text-xs text-gray-400 mt-1">本金 {formatCurrency(totalEstPrincipal)} / 利息 {formatCurrency(totalEstInterest)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">實際合計</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totalActTotal)}</p>
          <div className="text-xs text-gray-400 mt-1">本金 {formatCurrency(totalActPrincipal)} / 利息 {formatCurrency(totalActInterest)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-gray-500 mb-1">差異 (暫估 - 實際)</p>
          <p className={`text-xl font-bold ${totalEstTotal - totalActTotal > 0 ? 'text-orange-600' : 'text-blue-600'}`}>
            {formatCurrency(totalEstTotal - totalActTotal)}
          </p>
          <div className="text-xs text-gray-400 mt-1">
            已核實 {confirmedRecords.length} / {reportData.length} 筆
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl shadow-sm" style={{ overflow: 'clip' }}>
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-medium text-gray-700">{reportYear}年{reportMonth}月 貸款還款明細</h3>
        </div>
        <div className="tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">貸款</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">銀行</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">館別</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">狀態</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">暫估本金</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">暫估利息</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">暫估合計</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">實際本金</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">實際利息</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">實際合計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reportData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">此月份暫無還款資料</td>
                </tr>
              ) : reportData.map(rec => (
                <tr key={rec.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{rec.loan?.loanName}</div>
                    <div className="text-xs text-gray-400">{rec.loan?.loanCode}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{rec.loan?.bankName}</td>
                  <td className="px-4 py-3 text-gray-700">{rec.loan?.warehouse || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(rec.estimatedPrincipal)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(rec.estimatedInterest)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatCurrency(rec.estimatedTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualPrincipal !== null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualInterest !== null ? formatCurrency(rec.actualInterest) : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-green-700">{rec.actualTotal !== null ? formatCurrency(rec.actualTotal) : '-'}</td>
                </tr>
              ))}
            </tbody>
            {reportData.length > 0 && (
              <tfoot className="bg-indigo-50 border-t-2 border-indigo-200">
                <tr className="font-bold">
                  <td colSpan={4} className="px-4 py-3 text-right text-gray-700">月度合計:</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstPrincipal)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstInterest)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(totalEstTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActPrincipal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActInterest)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{formatCurrency(totalActTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
