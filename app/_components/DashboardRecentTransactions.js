'use client';

function NT(val) {
  return `NT$ ${Number(val || 0).toLocaleString()}`;
}

export default function DashboardRecentTransactions({ loading, recentTransactions }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">最近交易</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-gray-100">
              <th className="pb-2 text-left text-xs font-medium text-gray-500">時間</th>
              <th className="pb-2 text-left text-xs font-medium text-gray-500">類型</th>
              <th className="pb-2 text-left text-xs font-medium text-gray-500">單號</th>
              <th className="pb-2 text-right text-xs font-medium text-gray-500">金額</th>
              <th className="pb-2 text-left text-xs font-medium text-gray-500 pl-4">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan="5" className="py-8 text-center text-gray-400 text-xs">載入中...</td></tr>
            ) : recentTransactions.length === 0 ? (
              <tr><td colSpan="5" className="py-8 text-center text-gray-400 text-xs">尚無交易資料</td></tr>
            ) : (
              recentTransactions.map((t, index) => (
                <tr key={index} className="hover:bg-gray-50 transition-colors">
                  <td className="py-2.5 text-xs text-gray-500">{t.date}</td>
                  <td className="py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      t.type === '進貨' ? 'bg-blue-50 text-blue-700' :
                      t.type === '銷貨' ? 'bg-green-50 text-green-700' :
                      'bg-amber-50 text-amber-700'
                    }`}>{t.type}</span>
                  </td>
                  <td className="py-2.5 text-xs text-gray-600 font-mono">{t.no}</td>
                  <td className="py-2.5 text-xs text-right font-medium text-gray-800">{NT(t.amount)}</td>
                  <td className="py-2.5 pl-4">
                    <span className={`text-xs ${
                      t.status === '已完成' || t.status === '已出貨' || t.status === '已確認'
                        ? 'text-green-600' : t.status ? 'text-amber-600' : 'text-gray-400'
                    }`}>{t.status || '—'}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
