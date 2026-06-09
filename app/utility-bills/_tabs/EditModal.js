'use client';

export default function EditModal({
  editRecord,
  editSummary,
  setEditSummary,
  savingEdit,
  saveEdit,
  closeEdit,
}) {
  if (!editRecord || editSummary === null) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeEdit}>
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h4 className="text-lg font-semibold text-gray-800 mb-2">
          編輯 — {editRecord.warehouse} {editRecord.billYear}年{editRecord.billMonth}月 {editRecord.billType}
        </h4>
        <div className="space-y-4 text-sm mb-4">
          {Array.isArray(editSummary) ? (
            editSummary.map((rec, idx) => (
              <div key={idx} className="border border-sky-200 rounded-lg p-3 bg-sky-50">
                <div className="text-xs font-semibold text-sky-700 mb-2">第 {idx + 1} 筆 — 水號：{rec.水號}</div>
                <div className="grid grid-cols-1 gap-2">
                  {Object.keys(rec).map(k => (
                    <div key={k} className="flex items-center gap-2">
                      <label className="font-medium text-gray-600 shrink-0 text-xs w-24">{k}</label>
                      <input
                        type="text"
                        value={String(rec[k] ?? '')}
                        onChange={e => setEditSummary(prev => prev.map((r, i) => i === idx ? { ...r, [k]: e.target.value } : r))}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            Object.keys(editSummary).map(k => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <label className="font-medium text-gray-700 w-24 shrink-0">{k}</label>
                <input
                  type="text"
                  value={String(editSummary[k] ?? '')}
                  onChange={e => setEditSummary(prev => ({ ...prev, [k]: e.target.value }))}
                  className="flex-1 min-w-[200px] border border-gray-300 rounded px-2 py-1.5 text-sm"
                />
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveEdit}
            disabled={savingEdit}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
          >
            {savingEdit ? '儲存中…' : '儲存'}
          </button>
          <button
            type="button"
            onClick={closeEdit}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
