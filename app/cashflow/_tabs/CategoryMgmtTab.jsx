'use client';

const PL_LEVEL1_OPTIONS = ['收入', '費用', '業外'];
const PL_GROUP_SUGGESTIONS = {
  '收入': ['住宿收入', '餐飲收入', '其他營業收入'],
  '費用': ['收款成本', '人事費用', '行政費用', '行銷費用', '維修費用', '業外費用'],
  '業外': ['業外收入', '業外支出', '業外收支'],
};

export default function CategoryMgmtTab({
  noCatStats,
  seedLoading,
  handleSeedCategories,
  batchCatForm,
  setBatchCatForm,
  batchLoading,
  handleBatchCategorize,
  categories,
  showCategoryForm,
  setShowCategoryForm,
  categoryForm,
  setCategoryForm,
  handleCreateCategory,
  editCatId,
  setEditCatId,
  editCatForm,
  setEditCatForm,
  handleUpdateCategory,
  handleDeleteCategory,
}) {
  return (
    <div className="space-y-6">

      {/* 未分類提示 + 初始化按鈕 */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-center justify-between">
        <div>
          {noCatStats && noCatStats.noCategory > 0 ? (
            <p className="text-sm text-amber-700 font-medium">
              目前有 <span className="font-bold">{noCatStats.noCategory}</span> 筆交易（共 {noCatStats.total} 筆中的 {noCatStats.pct}%）尚未設定損益科目，損益表將顯示為「未分類」。
            </p>
          ) : noCatStats ? (
            <p className="text-sm text-green-700">所有交易均已設定損益科目。</p>
          ) : null}
        </div>
        <button
          onClick={handleSeedCategories}
          disabled={seedLoading}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
        >
          {seedLoading ? '初始化中…' : '一鍵初始化損益科目'}
        </button>
      </div>

      {/* 批量補科目 */}
      {noCatStats && noCatStats.noCategory > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">批量補充損益科目</h3>
          <form onSubmit={handleBatchCategorize} className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="f-24" className="block text-xs text-gray-500 mb-1">交易類別</label>
              <select id="f-24" value={batchCatForm.type} onChange={e => setBatchCatForm(p => ({ ...p, type: e.target.value }))}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部類別</option>
                <option value="收入">收入</option>
                <option value="支出">支出</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-25" className="block text-xs text-gray-500 mb-1">來源類型</label>
              <select id="f-25" value={batchCatForm.sourceType} onChange={e => setBatchCatForm(p => ({ ...p, sourceType: e.target.value }))}
                className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="">全部來源</option>
                <option value="pms_income_settlement">PMS結算</option>
                <option value="pms_income_fee">PMS手續費</option>
                <option value="pms_manual_commission">PMS佣金</option>
                <option value="cashier_payment">出納付款</option>
                <option value="rental_income">租賃收入</option>
                <option value="fixed_expense">固定費用</option>
                <option value="common_expense">一般費用</option>
                <option value="cc_statement_income">CC撥款收入</option>
                <option value="cc_statement_fee">CC手續費</option>
                <option value="engineering_income">工程收入</option>
                <option value="manual">手動</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-26" className="block text-xs text-gray-500 mb-1">起始日期</label>
              <input id="f-26" type="date" value={batchCatForm.startDate} onChange={e => setBatchCatForm(p => ({ ...p, startDate: e.target.value }))}
                className="border rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="f-27" className="block text-xs text-gray-500 mb-1">結束日期</label>
              <input id="f-27" type="date" value={batchCatForm.endDate} onChange={e => setBatchCatForm(p => ({ ...p, endDate: e.target.value }))}
                className="border rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label htmlFor="f-28" className="block text-xs text-gray-500 mb-1">套用至科目 *</label>
              <select id="f-28" value={batchCatForm.categoryId} onChange={e => setBatchCatForm(p => ({ ...p, categoryId: e.target.value }))}
                className="border rounded-lg px-3 py-1.5 text-sm" required>
                <option value="">選擇損益科目…</option>
                {['收入', '支出'].map(t => {
                  const cats = categories.filter(c => c.type === t && c.isActive);
                  if (!cats.length) return null;
                  return (
                    <optgroup key={t} label={t}>
                      {cats.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.plGroup ? ` (${c.plGroup})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={batchCatForm.noCategoryOnly}
                  onChange={e => setBatchCatForm(p => ({ ...p, noCategoryOnly: e.target.checked }))}
                  className="rounded" />
                僅更新未分類交易
              </label>
            </div>
            <button type="submit" disabled={batchLoading}
              className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50">
              {batchLoading ? '套用中…' : '批量套用科目'}
            </button>
          </form>
          {noCatStats?.bySourceType?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-gray-500">未分類分布：</span>
              {noCatStats.bySourceType.slice(0, 6).map(r => (
                <span key={r.sourceType} className="text-xs bg-white border rounded px-2 py-0.5 text-gray-600">
                  {r.sourceType} ({r.count})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 科目列表 */}
      <div className="bg-white rounded-xl shadow-sm" style={{ overflow: 'clip' }}>
        <div className="px-4 py-3 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-semibold text-sm text-gray-700">現金流科目列表（{categories.length} 筆）</h3>
          <button onClick={() => { setShowCategoryForm(v => !v); }}
            className="text-sm bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700">
            + 新增科目
          </button>
        </div>

        {/* 新增科目表單 */}
        {showCategoryForm && (
          <div className="p-4 border-b bg-emerald-50">
            <form onSubmit={handleCreateCategory} className="flex flex-wrap gap-3 items-end">
              <div>
                <label htmlFor="f-29" className="block text-xs text-gray-500 mb-1">科目名稱 *</label>
                <input id="f-29" value={categoryForm.name} onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))}
                  className="border rounded-lg px-3 py-1.5 text-sm w-36" placeholder="科目名稱" required />
              </div>
              <div>
                <label htmlFor="f-30" className="block text-xs text-gray-500 mb-1">類型 *</label>
                <select id="f-30" value={categoryForm.type} onChange={e => setCategoryForm(p => ({ ...p, type: e.target.value }))}
                  className="border rounded-lg px-3 py-1.5 text-sm">
                  <option value="收入">收入</option>
                  <option value="支出">支出</option>
                </select>
              </div>
              <div>
                <label htmlFor="f-31" className="block text-xs text-gray-500 mb-1">損益分類</label>
                <select id="f-31" value={categoryForm.level1} onChange={e => setCategoryForm(p => ({ ...p, level1: e.target.value }))}
                  className="border rounded-lg px-3 py-1.5 text-sm">
                  <option value="">不設定</option>
                  {PL_LEVEL1_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-47" className="block text-xs text-gray-500 mb-1">損益群組</label>
                <input id="f-47" value={categoryForm.plGroup} onChange={e => setCategoryForm(p => ({ ...p, plGroup: e.target.value }))}
                  list="pl-group-list" className="border rounded-lg px-3 py-1.5 text-sm w-32" placeholder="例：住宿收入" />
                <datalist id="pl-group-list">
                  {Object.values(PL_GROUP_SUGGESTIONS).flat().map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
              <div>
                <label htmlFor="f-48" className="block text-xs text-gray-500 mb-1">排序</label>
                <input id="f-48" type="number" value={categoryForm.plOrder} onChange={e => setCategoryForm(p => ({ ...p, plOrder: e.target.value }))}
                  className="border rounded-lg px-3 py-1.5 text-sm w-20" placeholder="10" min="1" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-emerald-700">儲存</button>
                <button type="button" onClick={() => setShowCategoryForm(false)} className="border px-3 py-1.5 rounded-lg text-sm">取消</button>
              </div>
            </form>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">科目名稱</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">類型</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">損益分類</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">損益群組</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">排序</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">交易筆數</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">尚無科目，請先按「一鍵初始化損益科目」</td></tr>
            )}
            {categories.map(cat => (
              editCatId === cat.id ? (
                /* 編輯列 */
                <tr key={cat.id} className="bg-blue-50">
                  <td className="px-3 py-2" colSpan={7}>
                    <form onSubmit={handleUpdateCategory} className="flex flex-wrap gap-2 items-end">
                      <div>
                        <label htmlFor="f-49" className="block text-xs text-gray-500 mb-0.5">科目名稱</label>
                        <input id="f-49" value={editCatForm.name || ''} onChange={e => setEditCatForm(p => ({ ...p, name: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm w-32" required />
                      </div>
                      <div>
                        <label htmlFor="f-50" className="block text-xs text-gray-500 mb-0.5">類型</label>
                        <select id="f-50" value={editCatForm.type || ''} onChange={e => setEditCatForm(p => ({ ...p, type: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm">
                          <option value="收入">收入</option>
                          <option value="支出">支出</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="f-32" className="block text-xs text-gray-500 mb-0.5">損益分類</label>
                        <select id="f-32" value={editCatForm.level1 || ''} onChange={e => setEditCatForm(p => ({ ...p, level1: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm">
                          <option value="">不設定</option>
                          {PL_LEVEL1_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="f-51" className="block text-xs text-gray-500 mb-0.5">損益群組</label>
                        <input id="f-51" value={editCatForm.plGroup || ''} onChange={e => setEditCatForm(p => ({ ...p, plGroup: e.target.value }))}
                          list="pl-group-list-edit" className="border rounded px-2 py-1 text-sm w-28" placeholder="住宿收入" />
                        <datalist id="pl-group-list-edit">
                          {Object.values(PL_GROUP_SUGGESTIONS).flat().map(g => <option key={g} value={g} />)}
                        </datalist>
                      </div>
                      <div>
                        <label htmlFor="f-52" className="block text-xs text-gray-500 mb-0.5">排序</label>
                        <input id="f-52" type="number" value={editCatForm.plOrder || ''} onChange={e => setEditCatForm(p => ({ ...p, plOrder: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm w-16" min="1" />
                      </div>
                      <div className="flex gap-1">
                        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">儲存</button>
                        <button type="button" onClick={() => setEditCatId(null)} className="border px-3 py-1 rounded text-sm">取消</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-800">{cat.name}</span>
                    {cat.systemCode && <span className="ml-1 text-xs text-gray-400 font-mono">({cat.systemCode})</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${cat.type === '收入' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {cat.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {cat.level1 ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        cat.level1 === '收入' ? 'bg-blue-100 text-blue-700' :
                        cat.level1 === '費用' ? 'bg-orange-100 text-orange-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>{cat.level1}</span>
                    ) : <span className="text-xs text-gray-300">未設定</span>}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{cat.plGroup || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-center text-sm text-gray-500">{cat.plOrder ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-500">{cat._count?.transactions ?? 0}</td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => { setEditCatId(cat.id); setEditCatForm({ name: cat.name, type: cat.type, level1: cat.level1 || '', plGroup: cat.plGroup || '', plOrder: cat.plOrder || '', accountingSubjectId: cat.accountingSubjectId || '' }); }}
                        className="text-xs text-blue-600 hover:underline">編輯</button>
                      <button onClick={() => handleDeleteCategory(cat.id)}
                        className="text-xs text-red-500 hover:underline">刪除</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
