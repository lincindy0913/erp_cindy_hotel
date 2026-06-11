'use client';

export default function CleanupModal({
  cleanupDays, setCleanupDays,
  cleanupPreview, setCleanupPreview,
  cleanupResult,
  cleanupLoading,
  cleanupConfirm, setCleanupConfirm,
  handleCleanupPreview, handleCleanupConfirm, handleCleanupClose,
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-bold text-zinc-800 mb-1">清理舊日誌</h3>
        <p className="text-xs text-gray-500 mb-4">
          財務日誌保留 730 天、管理日誌保留 365 天，不受下方設定影響。
        </p>

        {cleanupResult ? (
          <div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-green-800 mb-2">清理完成，共刪除 {cleanupResult.deleted.total} 筆</p>
              <ul className="text-xs text-green-700 space-y-0.5">
                <li>操作日誌：{cleanupResult.deleted.operation} 筆</li>
                <li>嘗試記錄：{cleanupResult.deleted.attempt} 筆</li>
                <li>財務日誌：{cleanupResult.deleted.finance} 筆</li>
                <li>管理日誌：{cleanupResult.deleted.admin} 筆</li>
              </ul>
            </div>
            <button onClick={handleCleanupClose} className="w-full bg-zinc-600 text-white py-2 rounded text-sm hover:bg-zinc-700">關閉</button>
          </div>
        ) : (
          <>
            {/* 保留天數選擇 */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">
                操作 / 嘗試日誌保留天數
              </label>
              <div className="flex gap-2">
                {[30, 60, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    onClick={() => { setCleanupDays(d); setCleanupPreview(null); setCleanupConfirm(''); }}
                    className={`flex-1 py-1.5 rounded text-sm border ${cleanupDays === d ? 'bg-zinc-700 text-white border-zinc-700' : 'border-gray-300 hover:bg-gray-50'}`}
                  >
                    {d}天
                  </button>
                ))}
              </div>
            </div>

            {/* 預覽結果 */}
            {cleanupPreview && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs">
                <p className="font-medium text-amber-800 mb-1.5">預計刪除 {cleanupPreview.counts.total} 筆</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-amber-700">
                  <span>操作日誌（{cleanupPreview.cutoffs.operation} 前）</span>
                  <span className="text-right font-medium">{cleanupPreview.counts.operation} 筆</span>
                  <span>嘗試記錄（{cleanupPreview.cutoffs.attempt} 前）</span>
                  <span className="text-right font-medium">{cleanupPreview.counts.attempt} 筆</span>
                  <span>財務日誌（{cleanupPreview.cutoffs.finance} 前）</span>
                  <span className="text-right font-medium">{cleanupPreview.counts.finance} 筆</span>
                  <span>管理日誌（{cleanupPreview.cutoffs.admin} 前）</span>
                  <span className="text-right font-medium">{cleanupPreview.counts.admin} 筆</span>
                </div>
              </div>
            )}

            {/* 確認輸入 */}
            {cleanupPreview && cleanupPreview.counts.total > 0 && (
              <div className="mb-4">
                <label htmlFor="span-classname-font-mono-" className="text-sm text-gray-600 block mb-1">
                  輸入「<span className="font-mono font-bold">確認清理</span>」以繼續
                </label>
                <input id="span-classname-font-mono-"
                  type="text"
                  value={cleanupConfirm}
                  onChange={e => setCleanupConfirm(e.target.value)}
                  placeholder="確認清理"
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleCleanupClose} className="flex-1 border border-gray-300 py-2 rounded text-sm hover:bg-gray-50">取消</button>
              <button
                onClick={handleCleanupPreview}
                disabled={cleanupLoading}
                className="flex-1 bg-zinc-600 text-white py-2 rounded text-sm hover:bg-zinc-700 disabled:opacity-50"
              >
                {cleanupLoading && !cleanupPreview ? '計算中...' : '預覽'}
              </button>
              {cleanupPreview && cleanupPreview.counts.total > 0 && (
                <button
                  onClick={handleCleanupConfirm}
                  disabled={cleanupLoading || cleanupConfirm !== '確認清理'}
                  className="flex-1 bg-red-600 text-white py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {cleanupLoading && cleanupPreview ? '清理中...' : '執行清理'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
