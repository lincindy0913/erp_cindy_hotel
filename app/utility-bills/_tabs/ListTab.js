'use client';

export default function ListTab({
  records,
  listFilter,
  setListFilter,
  listLoading,
  fetchRecords,
  WAREHOUSE_OPTIONS,
  openEdit,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-teal-100 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">各館別、每月水電費一覽</h3>
      <p className="text-sm text-gray-600 mb-4">
        在「電費單解析」或「水費單解析」產出第一頁後按「儲存此筆」，即會出現在此列表。可依館別、年、月、類型篩選。
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <select
          value={listFilter.warehouse}
          onChange={e => setListFilter(f => ({ ...f, warehouse: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">全部館別</option>
          {WAREHOUSE_OPTIONS.filter(o => o.value).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="年度"
          value={listFilter.year}
          onChange={e => setListFilter(f => ({ ...f, year: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder="月份"
          min={1}
          max={12}
          value={listFilter.month}
          onChange={e => setListFilter(f => ({ ...f, month: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={listFilter.billType}
          onChange={e => setListFilter(f => ({ ...f, billType: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">全部類型</option>
          <option value="水費">水費</option>
          <option value="電費">電費</option>
        </select>
      </div>
      {listLoading ? (
        <div className="py-8 text-center text-gray-500">載入中…</div>
      ) : records.length === 0 ? (
        <div className="py-8 text-center text-gray-500">尚無儲存紀錄，請先解析並儲存水電費單</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700">館別</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">年月</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">類型</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">檔名</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">儲存日</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.warehouse}</td>
                  <td className="px-4 py-2">{r.billYear}年{r.billMonth}月</td>
                  <td className="px-4 py-2">{r.billType}</td>
                  <td className="px-4 py-2 text-gray-600">{r.fileName || '－'}</td>
                  <td className="px-4 py-2 text-gray-500">{new Date(r.createdAt).toLocaleDateString('zh-TW')}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="text-teal-600 hover:underline text-sm"
                    >
                      編輯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
