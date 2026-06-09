'use client';

export default function DetailTab({
  detailRecords,
  detailLoading,
  detailFilter,
  setDetailFilter,
  fetchDetailRecords,
  confirmDelete,
  setConfirmDelete,
  detailDeleting,
  deleteRecord,
  isAdmin,
  WAREHOUSE_OPTIONS,
  openEdit,
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label htmlFor="f-5" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f-5" value={detailFilter.warehouse} onChange={e => setDetailFilter(f => ({ ...f, warehouse: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {WAREHOUSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-9" className="block text-xs text-gray-500 mb-1">年度</label>
          <input id="f-9" type="text" value={detailFilter.year} onChange={e => setDetailFilter(f => ({ ...f, year: e.target.value }))}
            placeholder="例：114" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
        </div>
        <div>
          <label htmlFor="f-10" className="block text-xs text-gray-500 mb-1">類型</label>
          <select id="f-10" value={detailFilter.billType} onChange={e => setDetailFilter(f => ({ ...f, billType: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">全部</option>
            <option value="水費">水費</option>
            <option value="電費">電費</option>
          </select>
        </div>
        <button onClick={fetchDetailRecords} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
          重新查詢
        </button>
      </div>

      {detailLoading ? (
        <div className="py-12 text-center text-gray-400">載入中…</div>
      ) : detailRecords.length === 0 ? (
        <div className="py-12 text-center text-gray-400">尚無記錄</div>
      ) : (
        <div className="space-y-4">
          {detailRecords.map(r => {
            let rows = [];
            try {
              const parsed = typeof r.summaryJson === 'string' ? JSON.parse(r.summaryJson) : r.summaryJson;
              rows = Array.isArray(parsed) ? parsed : [parsed];
            } catch { rows = []; }

            const isWaterBill = r.billType === '水費';
            const borderColor = isWaterBill ? 'border-sky-200' : 'border-amber-200';
            const headerBg = isWaterBill ? 'bg-sky-50' : 'bg-amber-50';
            const badgeColor = isWaterBill ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700';
            const accentColor = isWaterBill ? 'text-sky-600' : 'text-amber-600';

            return (
              <div key={r.id} className={`bg-white rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
                {/* Record header */}
                <div className={`px-4 py-3 ${headerBg} border-b ${borderColor} flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>
                      {isWaterBill ? '💧 水費' : '⚡ 電費'}
                    </span>
                    <span className="font-semibold text-gray-800">{r.warehouse}</span>
                    <span className="text-sm text-gray-600">{r.billYear} 年 {r.billMonth} 月</span>
                    {r.fileName && <span className="text-xs text-gray-400 hidden md:inline">📄 {r.fileName}</span>}
                    <span className="text-xs text-gray-400">{rows.length} 筆明細</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(r)}
                      className="px-3 py-1 text-xs bg-white border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-50 font-medium"
                    >
                      編輯
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="px-3 py-1 text-xs bg-white border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium"
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>

                {/* Rows table */}
                {rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {Object.keys(rows[0]).map(k => (
                            <th key={k} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${accentColor}`}>{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">{String(val ?? '—')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">確認刪除</h4>
            <p className="text-sm text-gray-600 mb-1">
              確定要刪除以下帳單記錄？此操作無法復原。
            </p>
            <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mr-2 ${confirmDelete.billType === '水費' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                {confirmDelete.billType === '水費' ? '💧 水費' : '⚡ 電費'}
              </span>
              <strong>{confirmDelete.warehouse}</strong> {confirmDelete.billYear} 年 {confirmDelete.billMonth} 月
              {confirmDelete.fileName && <div className="text-gray-400 text-xs mt-1">📄 {confirmDelete.fileName}</div>}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                取消
              </button>
              <button
                onClick={() => deleteRecord(confirmDelete.id)}
                disabled={detailDeleting === confirmDelete.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {detailDeleting === confirmDelete.id ? '刪除中…' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
