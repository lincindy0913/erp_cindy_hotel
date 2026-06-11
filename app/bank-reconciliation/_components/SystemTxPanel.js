'use client';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-TW'));

export default function SystemTxPanel({ systemTransactions }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-medium text-sm text-gray-700">系統現金流交易（本月）</h3>
      </div>
      <div className="overflow-y-auto max-h-[508px]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">日期</th>
              <th className="px-3 py-2 text-left">說明</th>
              <th className="px-3 py-2 text-right">金額</th>
              <th className="px-3 py-2 text-center">配對</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(systemTransactions || []).length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-gray-400">本月無系統交易</td></tr>
            )}
            {(systemTransactions || []).map(t => (
              <tr key={t.id} className={`hover:bg-gray-50 ${!t.isMatched ? 'bg-yellow-50/30' : ''}`}>
                <td className="px-3 py-2 font-mono">{t.transactionDate}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={t.description}>{t.description || t.sourceType}</td>
                <td className={`px-3 py-2 text-right font-medium ${t.type === '收入' ? 'text-green-700' : 'text-red-600'}`}>
                  {t.type === '收入' ? '+' : '-'}{fmt(t.amount)}
                </td>
                <td className="px-3 py-2 text-center">
                  {t.isMatched
                    ? <span className="text-[10px] text-green-600">✓</span>
                    : <span className="text-[10px] text-amber-500">未配對</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
