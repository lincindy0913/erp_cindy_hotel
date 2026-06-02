'use client';

export default function WarehousesSection({
  warehouseData,
  warehouseLoading,
  saving,
  selectedBuildingForStorage,
  setSelectedBuildingForStorage,
  newWarehouse,
  setNewWarehouse,
  addStorageLocation,
  deleteStorageLocation,
}) {
  const list = Array.isArray(warehouseData.list) ? warehouseData.list : [];
  const buildings = list.filter(x => x.type === 'building' && !x.parentId);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">倉庫管理</h3>
        <p className="text-sm text-gray-500 mb-4">倉庫為館別內的實體儲存地點。請先至「館別設定」新增館別，再於此設定各館別的倉庫位置。</p>
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <select
            value={selectedBuildingForStorage}
            onChange={e => setSelectedBuildingForStorage(e.target.value)}
            className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 text-sm"
          >
            <option value="">選擇館別</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input
            type="text"
            value={newWarehouse}
            onChange={e => setNewWarehouse(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addStorageLocation()}
            placeholder="倉庫名稱，例如：地下室、備品室、2F倉庫"
            className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-gray-400 text-sm"
          />
          <button
            onClick={addStorageLocation}
            disabled={saving || !selectedBuildingForStorage || !newWarehouse.trim()}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            新增倉庫
          </button>
        </div>
        {warehouseLoading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : buildings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">尚無館別，請先至「館別設定」新增館別（如：麗格）</p>
        ) : (
          <div className="space-y-3">
            {buildings.map(b => {
              const storageLocations = list.filter(x => x.type === 'storage' && x.parentId === b.id);
              return (
                <div key={b.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                    <span className="font-medium text-gray-800">{b.name}（館別）</span>
                  </div>
                  <div className="px-4 py-3">
                    {storageLocations.length === 0 ? (
                      <p className="text-sm text-gray-400">尚無倉庫位置</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {storageLocations.map(loc => (
                          <span key={loc.id} className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                            {loc.name}
                            <button onClick={() => deleteStorageLocation(loc.id, loc.name)} className="ml-1 text-green-400 hover:text-red-500 leading-none" title="刪除倉庫">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">範例：館別「麗格」底下可設倉庫「地下室」、「備品室」、「2F倉庫」、「小倉庫」。</p>
      </div>
    </div>
  );
}
