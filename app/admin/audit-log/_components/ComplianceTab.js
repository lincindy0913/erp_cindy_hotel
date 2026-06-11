'use client';

export default function ComplianceTab({
  complianceReport, complianceLoading,
  complianceYear, setComplianceYear,
  complianceMonth, setComplianceMonth,
  fetchComplianceReport,
  getScoreColor, getScoreBg,
}) {
  return (
    <div>
      {/* Year/Month Selector */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="f" className="text-sm font-medium text-gray-600">選擇期間：</label>
          <select id="f"
            value={complianceYear}
            onChange={e => setComplianceYear(Number(e.target.value))}
            className="border rounded px-3 py-2 text-sm"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
          <select
            value={complianceMonth}
            onChange={e => setComplianceMonth(Number(e.target.value))}
            className="border rounded px-3 py-2 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m} 月</option>
            ))}
          </select>
          <button
            onClick={() => fetchComplianceReport(complianceYear, complianceMonth)}
            className="bg-zinc-600 text-white px-4 py-2 rounded text-sm hover:bg-zinc-700"
          >
            查詢
          </button>
        </div>
      </div>

      {complianceLoading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">載入中...</div>
      ) : !complianceReport ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">請選擇期間後查詢</div>
      ) : (
        <>
          {/* Compliance Score */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className={`rounded-lg shadow p-6 border text-center ${getScoreBg(complianceReport.score ?? 0)}`}>
              <p className="text-sm text-gray-600 mb-2">合規分數</p>
              <p className={`text-4xl font-bold ${getScoreColor(complianceReport.score ?? 0)}`}>
                {complianceReport.score ?? '-'}
              </p>
              <p className="text-xs text-gray-500 mt-1">滿分 100</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
              <p className="text-sm text-gray-500">異常次數</p>
              <p className="text-3xl font-bold text-yellow-700">{complianceReport.anomalyCount ?? 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
              <p className="text-sm text-gray-500">總操作次數</p>
              <p className="text-3xl font-bold text-blue-700">{complianceReport.totalOperations ?? 0}</p>
            </div>
          </div>

          {/* Top Users Table */}
          {complianceReport.topUsers && complianceReport.topUsers.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 border-b bg-zinc-50">
                <h3 className="text-sm font-medium text-gray-700">操作最多使用者</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">排名</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">使用者</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">信箱</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">操作次數</th>
                  </tr>
                </thead>
                <tbody>
                  {complianceReport.topUsers.map((user, idx) => (
                    <tr key={user.email || idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{user.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{user.email || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">{user.count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
