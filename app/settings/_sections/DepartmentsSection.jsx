'use client';

export default function DepartmentsSection({
  warehouseData,
  warehouseLoading,
  saving,
  newBuilding,
  setNewBuilding,
  addBuilding,
  newDeptWarehouse,
  setNewDeptWarehouse,
  newDeptName,
  setNewDeptName,
  addDepartmentToWarehouse,
  deleteWarehouse,
  deleteDepartment,
}) {
  const list = Array.isArray(warehouseData.list) ? warehouseData.list : [];
  const byName = warehouseData.byName || {};
  const buildings = list.filter(x => x.type === 'building');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">館別設定</h3>
        <p className="text-sm text-gray-500 mb-4">館別指建築／據點（如麗格），部門為該館別下的單位（如行政部、管理部、房務部）。請先新增館別，再為該館別新增部門。</p>
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <input
            type="text"
            value={newBuilding}
            onChange={e => setNewBuilding(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBuilding()}
            placeholder="新增館別，例如：麗格"
            className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
          />
          <button type="button" onClick={addBuilding} disabled={saving || !newBuilding.trim()} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 text-sm font-medium">新增館別</button>
        </div>
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <select
            value={newDeptWarehouse}
            onChange={e => setNewDeptWarehouse(e.target.value)}
            className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
          >
            <option value="">選擇館別</option>
            {buildings.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
          <input
            type="text"
            value={newDeptName}
            onChange={e => setNewDeptName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDepartmentToWarehouse()}
            placeholder="部門名稱，例如：行政部、管理部、房務部"
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
          />
          <button
            onClick={addDepartmentToWarehouse}
            disabled={saving || !newDeptWarehouse || !newDeptName.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            新增部門
          </button>
        </div>
        {warehouseLoading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : buildings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">尚無館別，請先新增館別（如：麗格）</p>
        ) : (
          <div className="space-y-3">
            {buildings.map(b => (
              <div key={b.name} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                  <span className="font-medium text-gray-800">{b.name}（館別）</span>
                  <button type="button" onClick={() => deleteWarehouse(b.name)} className="text-xs text-red-500 hover:text-red-700 hover:underline">刪除館別</button>
                </div>
                <div className="px-4 py-3">
                  {(byName[b.name] || []).length === 0 ? (
                    <p className="text-sm text-gray-400">尚無部門</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(byName[b.name] || []).map(dept => (
                        <span key={dept} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                          {dept}
                          <button onClick={() => deleteDepartment(b.name, dept)} className="ml-1 text-blue-400 hover:text-red-500 leading-none" title="刪除部門">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">範例：館別「麗格」底下可設部門「行政部」、「管理部」、「房務部」。</p>
      </div>
    </div>
  );
}
