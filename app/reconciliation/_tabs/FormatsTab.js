'use client';

export function FormatsTab({
  isLoggedIn,
  formats, formatsLoading,
  showFormatForm, setShowFormatForm,
  formatForm, setFormatForm,
  formatSaving, submitFormat,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">銀行格式管理</h3>
        {isLoggedIn && (
          <button
            onClick={() => setShowFormatForm(!showFormatForm)}
            className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
          >
            {showFormatForm ? '取消' : '+ 新增自訂格式'}
          </button>
        )}
      </div>

      {/* Add format form */}
      {showFormatForm && (
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">新增自訂銀行格式</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="f-16" className="block text-xs text-gray-500 mb-1">銀行名稱 *</label>
              <input id="f-16"
                type="text"
                value={formatForm.bankName}
                onChange={e => setFormatForm({ ...formatForm, bankName: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 華南銀行"
              />
            </div>
            <div>
              <label htmlFor="f-17" className="block text-xs text-gray-500 mb-1">銀行代碼</label>
              <input id="f-17"
                type="text"
                value={formatForm.bankCode}
                onChange={e => setFormatForm({ ...formatForm, bankCode: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 008"
              />
            </div>
            <div>
              <label htmlFor="f-18" className="block text-xs text-gray-500 mb-1">檔案編碼</label>
              <select id="f-18"
                value={formatForm.fileEncoding}
                onChange={e => setFormatForm({ ...formatForm, fileEncoding: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="UTF-8">UTF-8</option>
                <option value="Big5">Big5</option>
                <option value="MS950">MS950</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-19" className="block text-xs text-gray-500 mb-1">日期欄位名稱</label>
              <input id="f-19"
                type="text"
                value={formatForm.dateColumn}
                onChange={e => setFormatForm({ ...formatForm, dateColumn: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 交易日期"
              />
            </div>
            <div>
              <label htmlFor="f-20" className="block text-xs text-gray-500 mb-1">日期格式</label>
              <select id="f-20"
                value={formatForm.dateFormat}
                onChange={e => setFormatForm({ ...formatForm, dateFormat: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="YYYY/MM/DD">YYYY/MM/DD</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYMMDD">民國 YYYMMDD</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-21" className="block text-xs text-gray-500 mb-1">說明欄位名稱</label>
              <input id="f-21"
                type="text"
                value={formatForm.descriptionColumn}
                onChange={e => setFormatForm({ ...formatForm, descriptionColumn: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 摘要"
              />
            </div>
            <div>
              <label htmlFor="f-22" className="block text-xs text-gray-500 mb-1">提款欄位名稱</label>
              <input id="f-22"
                type="text"
                value={formatForm.debitColumn}
                onChange={e => setFormatForm({ ...formatForm, debitColumn: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 提款金額"
              />
            </div>
            <div>
              <label htmlFor="f-23" className="block text-xs text-gray-500 mb-1">存入欄位名稱</label>
              <input id="f-23"
                type="text"
                value={formatForm.creditColumn}
                onChange={e => setFormatForm({ ...formatForm, creditColumn: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 存入金額"
              />
            </div>
            <div>
              <label htmlFor="f-24" className="block text-xs text-gray-500 mb-1">餘額欄位名稱</label>
              <input id="f-24"
                type="text"
                value={formatForm.balanceColumn}
                onChange={e => setFormatForm({ ...formatForm, balanceColumn: e.target.value })}
                className="w-full border rounded-lg px-3 py-1.5 text-sm"
                placeholder="例: 餘額"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={submitFormat}
              disabled={formatSaving}
              className="px-6 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {formatSaving ? '儲存中…' : '儲存格式'}
            </button>
          </div>
        </div>
      )}

      {/* Formats list */}
      {formatsLoading ? (
        <div className="text-center py-12 text-gray-400">載入中...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-violet-50 sticky top-0 z-10 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-violet-800">銀行名稱</th>
                <th className="px-4 py-3 text-left font-medium text-violet-800">銀行代碼</th>
                <th className="px-4 py-3 text-left font-medium text-violet-800">檔案格式</th>
                <th className="px-4 py-3 text-left font-medium text-violet-800">編碼</th>
                <th className="px-4 py-3 text-left font-medium text-violet-800">日期格式</th>
                <th className="px-4 py-3 text-center font-medium text-violet-800">類型</th>
              </tr>
            </thead>
            <tbody>
              {formats.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    尚無銀行格式設定
                  </td>
                </tr>
              ) : (
                formats.map(f => (
                  <tr key={f.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{f.bankName}</td>
                    <td className="px-4 py-3 text-gray-500">{f.bankCode || '-'}</td>
                    <td className="px-4 py-3">{f.fileType?.toUpperCase()}</td>
                    <td className="px-4 py-3">{f.fileEncoding}</td>
                    <td className="px-4 py-3">{f.dateFormat || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {f.isBuiltIn ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          內建
                        </span>
                      ) : (
                        <span className="text-xs text-violet-600">自訂</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
