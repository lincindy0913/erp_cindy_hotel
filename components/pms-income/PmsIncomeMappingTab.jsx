'use client';

export default function PmsIncomeMappingTab({ loading, mappingRules }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">PMS 科目對應規則</h3>
          <a href="/settings" className="text-sm text-teal-600 hover:text-teal-800 hover:underline">
            前往設定管理 &rarr;
          </a>
        </div>
        <p className="text-xs text-gray-500 mb-4">以下為 PMS 系統欄位與會計科目的對應關係。如需修改，請聯繫系統管理員或前往設定頁面。</p>

        {loading ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">PMS 欄位名稱</th>
                <th className="px-3 py-2 font-medium">借貸方</th>
                <th className="px-3 py-2 font-medium">會計科目代碼</th>
                <th className="px-3 py-2 font-medium">會計科目名稱</th>
              </tr>
            </thead>
            <tbody>
              {mappingRules.map((rule, i) => (
                <tr key={rule.id || i} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{rule.pmsColumnName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rule.entryType === '貸方' ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rule.entryType}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{rule.accountingCode}</td>
                  <td className="px-3 py-2">{rule.accountingName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
