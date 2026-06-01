'use client';

export default function ReorderSuggestionsPanel({ suggestions, onClose, onReorder, isLoggedIn }) {
  if (!suggestions.length) return null;
  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-amber-800">📦 補貨建議（庫存低於安全量）</h3>
        <button type="button" onClick={onClose} className="text-amber-600 hover:text-amber-800 text-sm">關閉</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-amber-100 text-amber-800">
              <th className="px-3 py-2 text-left font-medium">商品</th>
              <th className="px-3 py-2 text-left font-medium">館別</th>
              <th className="px-3 py-2 text-right font-medium">現貨</th>
              <th className="px-3 py-2 text-right font-medium">安全量</th>
              <th className="px-3 py-2 text-right font-medium">建議採購量</th>
              <th className="px-3 py-2 text-left font-medium">預設廠商</th>
              <th className="px-3 py-2 text-right font-medium">上次單價</th>
              <th className="px-3 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-200">
            {suggestions.map((s, idx) => (
              <tr key={idx} className="bg-white hover:bg-amber-50">
                <td className="px-3 py-2">
                  <div className="font-medium">{s.productName}</div>
                  {s.productCode && <div className="text-xs text-gray-400">{s.productCode}</div>}
                </td>
                <td className="px-3 py-2 text-gray-600">{s.warehouse}</td>
                <td className="px-3 py-2 text-right text-red-600 font-semibold">{s.currentQty} {s.unit}</td>
                <td className="px-3 py-2 text-right text-gray-500">{s.threshold} {s.unit}</td>
                <td className="px-3 py-2 text-right font-bold text-amber-700">{s.suggestedQty} {s.unit}</td>
                <td className="px-3 py-2">
                  {s.supplierName
                    ? <span className="text-gray-700">{s.supplierName}</span>
                    : <span className="text-gray-400 text-xs">未設定</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.lastUnitPrice != null
                    ? <span>NT$ {Number(s.lastUnitPrice).toFixed(2)}<div className="text-xs text-gray-400">{s.lastPurchaseDate}</div></span>
                    : <span className="text-gray-400 text-xs">無記錄</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {isLoggedIn && s.supplierId ? (
                    <button type="button" onClick={() => onReorder(s)}
                      className="px-3 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 font-medium">
                      立即採購
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">需設廠商</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-amber-600 mt-2">建議採購量 = 安全量 × 2 − 現貨。點「立即採購」可自動帶入廠商、品項與上次單價。</p>
    </div>
  );
}
