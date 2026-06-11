'use client';

import Link from 'next/link';

export default function SupplierSearchBar({
  filterKeyword,
  setFilterKeyword,
  searchTimer,
  setSearchTimer,
  fetchSuppliers,
  itemsPerPage,
  showDateFilterMenu,
  setShowDateFilterMenu,
  dateFilterType,
  setDateFilterType,
  customDateRange,
  setCustomDateRange,
  handleDateFilterChange,
  handleCustomDateChange,
  getDateFilterLabel,
  applySortAndFilter,
  allSuppliers,
  sortType,
  setShowAddForm,
  showAddForm,
}) {
  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">廠商管理</h2>
        <Link href="/suppliers/payment-health"
          className="px-3 py-1.5 text-sm bg-teal-50 border border-teal-300 text-teal-700 rounded-lg hover:bg-teal-100">
          📊 付款健康度
        </Link>
      </div>
      <div className="flex gap-3 items-center">
        {/* 搜尋欄 */}
        <div className="relative">
          <input
            type="text"
            value={filterKeyword}
            onChange={(e) => {
              const val = e.target.value;
              setFilterKeyword(val);
              if (searchTimer) clearTimeout(searchTimer);
              setSearchTimer(setTimeout(() => {
                fetchSuppliers(1, itemsPerPage, val);
              }, 400));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchTimer) clearTimeout(searchTimer);
                fetchSuppliers(1, itemsPerPage, filterKeyword);
              }
            }}
            placeholder="搜尋廠商名稱、聯絡人、電話..."
            className="w-64 px-4 py-2 pl-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {filterKeyword && (
            <button
              onClick={() => { setFilterKeyword(''); if (searchTimer) clearTimeout(searchTimer); fetchSuppliers(1, itemsPerPage, ''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>

        {/* 日期區間篩選按鈕 */}
        <div className="relative date-filter-menu-container">
          <button
            onClick={() => setShowDateFilterMenu(!showDateFilterMenu)}
            className={`px-4 py-2 rounded-lg border text-sm ${
              dateFilterType !== 'all'
                ? 'bg-blue-100 border-blue-400 text-blue-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {dateFilterType !== 'all' ? getDateFilterLabel() : '日期篩選'}
          </button>
          {showDateFilterMenu && (
            <div
              className="absolute top-full right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[280px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">選擇合約日期區間</div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {['all', '1month', '3months', '6months'].map(type => (
                    <button
                      key={type}
                      onClick={() => handleDateFilterChange(type)}
                      className={`px-3 py-2 text-sm rounded-lg border ${
                        dateFilterType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {type === 'all' ? '全部' : type === '1month' ? '近1個月' : type === '3months' ? '近3個月' : '近6個月'}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDateFilterChange('1year')}
                    className={`px-3 py-2 text-sm rounded-lg border col-span-2 ${
                      dateFilterType === '1year' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    近1年
                  </button>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <div className="text-xs text-gray-500 mb-2">自訂日期範圍</div>
                  <div className="flex gap-2 items-center mb-3">
                    <input
                      type="date"
                      value={customDateRange.start}
                      onChange={(e) => {
                        handleCustomDateChange('start', e.target.value);
                        setDateFilterType('custom');
                      }}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-400">~</span>
                    <input
                      type="date"
                      value={customDateRange.end}
                      onChange={(e) => {
                        handleCustomDateChange('end', e.target.value);
                        setDateFilterType('custom');
                      }}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setDateFilterType('all');
                        setCustomDateRange({ start: '', end: '' });
                        setShowDateFilterMenu(false);
                        applySortAndFilter(allSuppliers, sortType, filterKeyword, 'all', { start: '', end: '' });
                      }}
                      className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      清除篩選
                    </button>
                    <button
                      onClick={() => setShowDateFilterMenu(false)}
                      className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      確認
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
        >
          + 新增廠商
        </button>
      </div>
    </div>
  );
}
