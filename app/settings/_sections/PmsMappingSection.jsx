'use client';

export default function PmsMappingSection({
  mappingRules,
  mappingSubTab,
  setMappingSubTab,
  editingMappingId,
  mappingEditForm,
  setMappingEditForm,
  showAddMappingForm,
  setShowAddMappingForm,
  newMappingForm,
  setNewMappingForm,
  accountingSubjects,
  saving,
  startEditMapping,
  cancelEditMapping,
  saveMappingEdit,
  addMappingRule,
  deleteMappingRule,
  auditInfo,
}) {
  const currentEntryType = mappingSubTab === 'credit' ? '貸方' : '借方';
  const filteredRules = mappingRules
    .filter(r => r.entryType === currentEntryType)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  function renderAuditTrail(sectionKey) {
    const info = auditInfo[sectionKey];
    if (!info) return null;
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          最後修改：{info.email} 於 {new Date(info.updatedAt).toLocaleString('zh-TW')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-medium text-amber-800">注意事項</p>
            <p className="text-xs text-amber-700 mt-1">
              修改後僅影響未來新匯入的記錄，歷史已匯入記錄不受影響。
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setMappingSubTab('credit'); setShowAddMappingForm(false); cancelEditMapping(); }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              mappingSubTab === 'credit'
                ? 'bg-gray-700 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            貸方對應（收入科目）
          </button>
          <button
            onClick={() => { setMappingSubTab('debit'); setShowAddMappingForm(false); cancelEditMapping(); }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              mappingSubTab === 'debit'
                ? 'bg-gray-700 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            借方對應（資產/負債科目）
          </button>
        </div>

        <div className="p-6">
          {/* Add button */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-600">
              {currentEntryType}對應規則（共 {filteredRules.length} 筆）
            </h3>
            <button
              onClick={() => {
                setShowAddMappingForm(!showAddMappingForm);
                cancelEditMapping();
              }}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-xs font-medium transition-colors"
            >
              {showAddMappingForm ? '取消新增' : '+ 新增對應'}
            </button>
          </div>

          {/* Add form */}
          {showAddMappingForm && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-800 mb-3">新增 {currentEntryType} 對應規則</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">PMS 欄位名稱 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newMappingForm.pmsColumnName}
                    onChange={e => setNewMappingForm(prev => ({ ...prev, pmsColumnName: e.target.value }))}
                    placeholder="例：住房收入"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">會計科目代碼 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newMappingForm.accountingCode}
                    onChange={e => setNewMappingForm(prev => ({ ...prev, accountingCode: e.target.value }))}
                    placeholder="例：4111"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">會計科目名稱 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newMappingForm.accountingName}
                    onChange={e => setNewMappingForm(prev => ({ ...prev, accountingName: e.target.value }))}
                    placeholder="例：住房收入"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label htmlFor="f-3" className="block text-xs text-gray-600 mb-1">說明</label>
                  <input id="f-3"
                    type="text"
                    value={newMappingForm.description}
                    onChange={e => setNewMappingForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="備註說明..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              </div>
              {/* Accounting subject quick pick */}
              {accountingSubjects.length > 0 && (
                <div className="mb-3">
                  <label htmlFor="f-4" className="block text-xs text-gray-500 mb-1">快速選取會計科目：</label>
                  <select id="f-4"
                    onChange={e => {
                      const subj = accountingSubjects.find(s => s.code === e.target.value);
                      if (subj) {
                        setNewMappingForm(prev => ({
                          ...prev,
                          accountingCode: subj.code,
                          accountingName: subj.name,
                        }));
                      }
                    }}
                    value=""
                    className="w-full md:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">-- 選擇科目 --</option>
                    {accountingSubjects.map(s => (
                      <option key={s.id} value={s.code}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={addMappingRule}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {saving ? '新增中...' : '新增'}
              </button>
            </div>
          )}

          {/* Mapping rules table */}
          {filteredRules.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">尚無 {currentEntryType} 對應規則</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 text-gray-600 font-medium w-8">#</th>
                    <th className="text-left py-3 px-3 text-gray-600 font-medium">PMS 欄位名稱</th>
                    <th className="text-left py-3 px-3 text-gray-600 font-medium">科目代碼</th>
                    <th className="text-left py-3 px-3 text-gray-600 font-medium">科目名稱</th>
                    <th className="text-left py-3 px-3 text-gray-600 font-medium">說明</th>
                    <th className="text-right py-3 px-3 text-gray-600 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule, i) => (
                    <tr
                      key={rule.id}
                      className={`border-b border-gray-100 transition-colors ${
                        rule.isSystemDefault ? 'bg-gray-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-3 px-3 text-gray-400">{i + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">{rule.pmsColumnName}</span>
                          {rule.isSystemDefault && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">預設</span>
                          )}
                        </div>
                      </td>
                      {editingMappingId === rule.id ? (
                        <>
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={mappingEditForm.accountingCode}
                              onChange={e => setMappingEditForm(prev => ({ ...prev, accountingCode: e.target.value }))}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-gray-400"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={mappingEditForm.accountingName}
                              onChange={e => setMappingEditForm(prev => ({ ...prev, accountingName: e.target.value }))}
                              className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-gray-400"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={mappingEditForm.description}
                              onChange={e => setMappingEditForm(prev => ({ ...prev, description: e.target.value }))}
                              className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-gray-400"
                            />
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => saveMappingEdit(rule.id)}
                              disabled={saving}
                              className="text-green-600 hover:text-green-800 text-sm font-medium mr-2 transition-colors"
                            >
                              儲存
                            </button>
                            <button
                              onClick={cancelEditMapping}
                              className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
                            >
                              取消
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 px-3">
                            <span className="font-mono text-gray-600">{rule.accountingCode}</span>
                          </td>
                          <td className="py-3 px-3 text-gray-700">{rule.accountingName}</td>
                          <td className="py-3 px-3 text-gray-500 text-xs">{rule.description || '-'}</td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => startEditMapping(rule)}
                              className="text-gray-600 hover:text-gray-800 text-sm font-medium mr-2 transition-colors"
                            >
                              編輯
                            </button>
                            {!rule.isSystemDefault && rule.id > 0 && (
                              <button
                                onClick={() => deleteMappingRule(rule.id)}
                                className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                              >
                                刪除
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Link to PMS Income page mapping tab */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            如需在 PMS 收入匯入頁面直接管理對應設定，請前往：
          </p>
          <a
            href="/pms-income?tab=mapping"
            className="text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
          >
            前往 PMS 收入管理 →
          </a>
        </div>
      </div>
      {renderAuditTrail('pms-mapping')}
    </div>
  );
}
