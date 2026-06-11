'use client';

export default function SupplierTableHeader({
  showSortMenu,
  setShowSortMenu,
  sortType,
  filterKeyword,
  setFilterKeyword,
  handleSortChange,
  handleFilterChange,
  setSortType,
  applySortAndFilter,
  allSuppliers,
}) {
  return (
    <thead className="bg-gray-50 sticky top-0 z-10">
      <tr>
        <th className="w-[4%] px-2 py-3 text-left text-xs font-medium text-gray-700">
          <div className="relative sort-menu-container">
            <button
              onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
              className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
            >
              <span>序號</span>
              <span className="text-xs">▼</span>
            </button>
            {showSortMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[200px]"
                onClick={(e) => e.stopPropagation()}>
                <div className="py-1">
                  <button onClick={(e) => { e.stopPropagation(); handleSortChange('id-asc'); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'id-asc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    由小到大 (1→9)
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleSortChange('id-desc'); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'id-desc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    由大到小 (9→1)
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleSortChange('name-asc'); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'name-asc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    A到Z (名稱排序)
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleSortChange('name-desc'); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'name-desc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    Z到A (名稱排序)
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleSortChange('sort-asc'); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'sort-asc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    依順序小→大
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleSortChange('sort-desc'); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${sortType === 'sort-desc' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    依順序大→小
                  </button>
                  <div className="border-t border-gray-200 my-1"></div>
                  <div className="px-4 py-2">
                    <label htmlFor="f-13" className="block text-xs text-gray-600 mb-1">關鍵字篩選</label>
                    <input id="f-13" type="text" value={filterKeyword}
                      onChange={(e) => { handleFilterChange(e.target.value); setSortType('filter'); }}
                      onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()}
                      placeholder="搜尋序號、名稱、聯絡人等..."
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setFilterKeyword(''); setSortType('id-asc'); setShowSortMenu(false); applySortAndFilter(allSuppliers, 'id-asc', ''); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-gray-500">
                    清除篩選
                  </button>
                </div>
              </div>
            )}
          </div>
        </th>
        <th className="w-[8%] px-2 py-3 text-left text-xs font-medium text-gray-700">廠商名稱</th>
        <th className="w-[7%] px-2 py-3 text-left text-xs font-medium text-gray-700">統一編號</th>
        <th className="w-[6%] px-2 py-3 text-left text-xs font-medium text-gray-700">聯絡人</th>
        <th className="w-[6%] px-2 py-3 text-left text-xs font-medium text-gray-700">負責人</th>
        <th className="w-[8%] px-2 py-3 text-left text-xs font-medium text-gray-700">聯絡電話</th>
        <th className="w-[12%] px-2 py-3 text-left text-xs font-medium text-gray-700">地址</th>
        <th className="w-[5%] px-2 py-3 text-left text-xs font-medium text-gray-700">付款</th>
        <th className="w-[7%] px-2 py-3 text-left text-xs font-medium text-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (sortType === 'date-asc') handleSortChange('date-desc');
              else if (sortType === 'date-desc') handleSortChange('id-asc');
              else handleSortChange('date-asc');
            }}
            className="flex items-center gap-1 hover:text-blue-600 cursor-pointer"
          >
            <span>合約日期</span>
            {sortType === 'date-asc' && <span className="text-xs">↑</span>}
            {sortType === 'date-desc' && <span className="text-xs">↓</span>}
            {sortType !== 'date-asc' && sortType !== 'date-desc' && <span className="text-xs text-gray-400">⇅</span>}
          </button>
        </th>
        <th className="w-[9%] px-2 py-3 text-left text-xs font-medium text-gray-700">合約到期</th>
        <th className="w-[6%] px-2 py-3 text-left text-xs font-medium text-gray-700">付款狀態</th>
        <th className="w-[7%] px-2 py-3 text-left text-xs font-medium text-gray-700">支票抬頭</th>
        <th className="w-[5%] px-2 py-3 text-left text-xs font-medium text-gray-700">行業類別</th>
        <th className="w-[4%] px-2 py-3 text-center text-xs font-medium text-gray-700">順序</th>
        <th className="w-[10%] px-2 py-3 text-left text-xs font-medium text-gray-700">備註</th>
        <th className="w-[5%] px-2 py-3 text-left text-xs font-medium text-gray-700">操作</th>
      </tr>
    </thead>
  );
}
