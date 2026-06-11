'use client';

export default function BuildTxModal({ buildModal, setBuildModal, buildDesc, setBuildDesc, buildCategoryId, setBuildCategoryId, categories, buildLoading, onConfirm }) {
  if (!buildModal) return null;
  const line = buildModal.line;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-gray-800 mb-4">補建現金流交易</h3>

        <div className="space-y-3 mb-5">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-500 text-xs mb-1">來源存摺明細</p>
            <p className="font-medium">{line.txDate} · {line.description || '（無說明）'}</p>
            <p className={`font-bold mt-1 ${Number(line.creditAmount) > 0 ? 'text-green-700' : 'text-red-600'}`}>
              {Number(line.creditAmount) > 0
                ? `存入 ${Number(line.creditAmount).toLocaleString('zh-TW')}`
                : `提出 ${Number(line.debitAmount).toLocaleString('zh-TW')}`}
            </p>
          </div>

          <div>
            <label htmlFor="f-3" className="block text-xs text-gray-500 mb-1">交易說明（可修改）</label>
            <input
              id="f-3"
              type="text"
              value={buildDesc}
              onChange={e => setBuildDesc(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full"
              placeholder="說明"
            />
          </div>

          <div>
            <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">損益科目（選填）</label>
            <select
              id="f-4"
              value={buildCategoryId}
              onChange={e => setBuildCategoryId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full"
            >
              <option value="">— 不指定 —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.plGroup ? ` (${c.plGroup})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setBuildModal(null)}
            className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
          >取消</button>
          <button
            onClick={onConfirm}
            disabled={buildLoading}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {buildLoading ? '補建中…' : '確認補建'}
          </button>
        </div>
      </div>
    </div>
  );
}
