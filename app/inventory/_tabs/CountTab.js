'use client';

import { SortableTh } from '@/components/SortableTh';
import WarehouseSelect from '../_components/WarehouseSelect';

export function CountTab({
  stockCounts, countLoading, sortedStockCounts, inventory,
  countForm, setCountForm, countSubmitting, cntKey, cntDir, cntT,
  warehouseList, warehouse, setWarehouse,
  addCountItem, updateCountItem, removeCountItem, submitStockCount,
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">新增盤點（簡化）</h3>
        <p className="text-sm text-gray-500 mb-4">請先選擇倉庫，再從庫存中選產品並輸入實盤數量，系統會計算差異並更新庫存。</p>
        <div className="flex gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">館別 / 倉庫 *</label>
            <WarehouseSelect
              value={countForm.warehouse}
              onChange={v => { setCountForm(prev => ({ ...prev, warehouse: v })); setWarehouse(v); }}
              warehouseList={warehouseList}
              placeholder="選擇館別/倉庫"
              className="px-3 py-2 border rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="cnt-date" className="block text-sm text-gray-600 mb-1">盤點日期</label>
            <input id="cnt-date" type="date" value={countForm.countDate}
              onChange={e => setCountForm(prev => ({ ...prev, countDate: e.target.value }))}
              className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <button onClick={addCountItem} disabled={!countForm.warehouse || inventory.length === 0}
            className="self-end px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm">
            從庫存加入產品
          </button>
        </div>
        {countForm.items.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10"><tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">產品</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">帳面數</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">實盤數</th>
                <th className="px-4 py-2 text-right font-medium text-gray-600">差異</th>
                <th className="px-4 py-2 w-16">操作</th>
              </tr></thead>
              <tbody>
                {countForm.items.map((it, idx) => {
                  const act = (Number(it.actualQty) ?? Number(it.systemQty)) || 0;
                  const sys = Number(it.systemQty) || 0;
                  const diff = act - sys;
                  return (
                    <tr key={idx} className="border-t">
                      <td className="px-4 py-2">{it.productName || '-'}</td>
                      <td className="px-4 py-2 text-right">{sys}</td>
                      <td className="px-4 py-2">
                        <input type="number" value={it.actualQty ?? ''}
                          onChange={e => updateCountItem(idx, 'actualQty', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-20 px-2 py-1 border rounded text-right" />
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>{diff}</td>
                      <td><button onClick={() => removeCountItem(idx)} className="text-red-500 hover:underline text-xs">刪除</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button onClick={submitStockCount} disabled={countSubmitting}
              className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm">
              {countSubmitting ? '送出中...' : '確認盤點'}
            </button>
          </>
        )}
      </div>
      <div className="bg-white rounded-lg shadow-sm tbl-wrap">
        <h3 className="text-lg font-semibold p-4 border-b">盤點記錄</h3>
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10"><tr>
            <SortableTh label="單號" colKey="countNo" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
            <SortableTh label="倉庫" colKey="warehouse" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
            <SortableTh label="日期" colKey="countDate" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
            <SortableTh label="品項數" colKey="itemCount" sortKey={cntKey} sortDir={cntDir} onSort={cntT} className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {countLoading ? <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
              stockCounts.length === 0 ? <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">尚無盤點記錄</td></tr> :
              sortedStockCounts.map(s => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-2 text-sm">{s.countNo}</td>
                  <td className="px-4 py-2 text-sm">{s.warehouse}</td>
                  <td className="px-4 py-2 text-sm">{s.countDate}</td>
                  <td className="px-4 py-2 text-sm">{s.items?.length || 0}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
