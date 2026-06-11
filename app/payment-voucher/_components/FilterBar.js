'use client';

export default function FilterBar({ filterData, setFilterData, suppliers }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4">篩選條件</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">銷帳年月</label>
          <input id="f-5"
            type="month"
            value={filterData.yearMonth}
            onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
          <select id="f-6"
            value={filterData.supplierId}
            onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">全部廠商</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-7" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
          <select id="f-7"
            value={filterData.warehouse}
            onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">全部館別</option>
            <option value="麗格">麗格</option>
            <option value="麗軒">麗軒</option>
            <option value="民宿">民宿</option>
          </select>
        </div>
      </div>
    </div>
  );
}
