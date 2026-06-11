'use client';

export default function SessionList({
  sessions,
  loading,
  activeSession,
  showNewForm,
  setShowNewForm,
  newForm,
  setNewForm,
  creating,
  createSession,
  selectSession,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">匯入作業</h3>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
        >
          + 新建作業
        </button>
      </div>

      {/* New session form */}
      {showNewForm && (
        <div className="bg-white rounded-lg border border-amber-200 p-4 mb-3">
          <div className="space-y-3">
            <div>
              <label htmlFor="f" className="block text-xs font-medium text-gray-600 mb-1">開帳基準日 *</label>
              <input id="f"
                type="date"
                value={newForm.openingDate}
                onChange={e => setNewForm(f => ({ ...f, openingDate: e.target.value }))}
                className="w-full px-3 py-1.5 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="f-2" className="block text-xs font-medium text-gray-600 mb-1">備註</label>
              <input id="f-2"
                type="text"
                value={newForm.note}
                onChange={e => setNewForm(f => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-1.5 border rounded-lg text-sm"
                placeholder="可選填備註"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createSession} disabled={creating} className="flex-1 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {creating ? '建立中...' : '建立'}
              </button>
              <button onClick={() => setShowNewForm(false)} className="px-3 py-1.5 border text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">載入中...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-lg border">
          尚無匯入作業<br />
          <span className="text-xs">請點擊「新建作業」開始</span>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => {
            const importedCount = s.batches?.filter(b => b.status === 'imported').length || 0;
            const totalCount = s.batches?.length || 0;
            const isArchived = s.status === 'archived';

            return (
              <div
                key={s.id}
                onClick={() => selectSession(s)}
                className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${
                  activeSession?.id === s.id ? 'border-amber-400 shadow-sm' : 'border-gray-200 hover:border-amber-300'
                } ${isArchived ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{s.sessionNo}</div>
                    <div className="text-xs text-gray-500 mt-0.5">開帳日：{s.openingDate}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.status === 'completed' ? 'bg-green-100 text-green-700' :
                    s.status === 'archived' ? 'bg-gray-100 text-gray-500' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {s.status === 'completed' ? '已完成' : s.status === 'archived' ? '已封存' : '進行中'}
                  </span>
                </div>
                {totalCount > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>{importedCount}/{totalCount} 批次完成</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-amber-500 h-1.5 rounded-full"
                        style={{ width: totalCount > 0 ? `${(importedCount / totalCount) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
