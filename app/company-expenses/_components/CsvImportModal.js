'use client';

export default function CsvImportModal({ csvRows, csvImporting, onImport, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold">CSV 匯入預覽（工程進項）</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-3 text-sm text-gray-500 bg-gray-50 border-b">
          共 <span className="font-semibold text-gray-800">{csvRows.length}</span> 筆資料。確認後點「確認匯入」。
          <span className="ml-2 text-xs text-gray-400">CSV 欄位：日期, 發票號碼, 廠商統編, 廠商名稱, 材料別, 品名, 未稅, 稅額, 總計, 地點, 期間, 備註</span>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-100 text-gray-600">
              <tr>
                {['日期', '發票號碼', '廠商名稱', '材料別', '品名', '未稅', '稅額', '總計', '地點', '期間'].map(h => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {csvRows.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.invoiceDate}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{r.invoiceNo}</td>
                  <td className="px-3 py-1.5 max-w-[120px] truncate">{r.vendorName}</td>
                  <td className="px-3 py-1.5">{r.materialType}</td>
                  <td className="px-3 py-1.5 max-w-[150px] truncate">{r.itemName}</td>
                  <td className="px-3 py-1.5 text-right">{r.amount}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{r.taxAmount}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{r.totalAmount}</td>
                  <td className="px-3 py-1.5">{r.location}</td>
                  <td className="px-3 py-1.5">{r.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
          <button onClick={onImport} disabled={csvImporting || !csvRows.length}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {csvImporting ? '匯入中…' : `確認匯入 ${csvRows.length} 筆`}
          </button>
        </div>
      </div>
    </div>
  );
}
