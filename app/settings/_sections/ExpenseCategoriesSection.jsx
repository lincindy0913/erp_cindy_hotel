'use client';

export default function ExpenseCategoriesSection({
  expenseCategories,
  categoryForm,
  setCategoryForm,
  editingCategoryId,
  saving,
  saveExpenseCategory,
  editExpenseCategory,
  cancelEditCategory,
  deleteExpenseCategory,
  auditInfo,
}) {
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
      {/* Category Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          {editingCategoryId ? '編輯費用分類' : '新增費用分類'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">分類名稱 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例：水電費"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
          </div>
          <div>
            <label htmlFor="f-5" className="block text-sm text-gray-600 mb-1">說明</label>
            <input id="f-5"
              type="text"
              value={categoryForm.description}
              onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="分類說明..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
          </div>
          <div>
            <label htmlFor="f-6" className="block text-sm text-gray-600 mb-1">排序</label>
            <input id="f-6"
              type="number"
              value={categoryForm.sortOrder}
              onChange={e => setCategoryForm(prev => ({ ...prev, sortOrder: e.target.value }))}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={saveExpenseCategory}
            disabled={saving}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {saving ? '儲存中...' : editingCategoryId ? '更新分類' : '新增分類'}
          </button>
          {editingCategoryId && (
            <button
              onClick={cancelEditCategory}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </div>

      {/* Category List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">費用分類列表</h3>
        {expenseCategories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">尚未設定費用分類</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">排序</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">名稱</th>
                  <th className="text-left py-3 px-4 text-gray-600 font-medium">說明</th>
                  <th className="text-right py-3 px-4 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {expenseCategories
                  .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                  .map((cat) => (
                    <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-gray-500">{cat.sortOrder ?? 0}</td>
                      <td className="py-3 px-4 text-gray-700 font-medium">{cat.name}</td>
                      <td className="py-3 px-4 text-gray-500">{cat.description || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => editExpenseCategory(cat)}
                          className="text-gray-600 hover:text-gray-800 text-sm font-medium mr-3 transition-colors"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => deleteExpenseCategory(cat.id)}
                          className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {renderAuditTrail('expense-categories')}
    </div>
  );
}
