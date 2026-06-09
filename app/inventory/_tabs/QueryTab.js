'use client';

import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';
import { SortableTh } from '@/components/SortableTh';

function getStatusIcon(status) {
  switch (status) {
    case '正常': return '🟢';
    case '偏低': return '🟠';
    case '不足': return '🔴';
    case '過多': return '🔵';
    default: return '⚪';
  }
}

export function QueryTab({
  inventory, inventoryLoading, sortedInventory, warehouse, filterLowStock, setFilterLowStock,
  invQKey, invQDir, invQT, setAdjustModal, setAdjustForm,
}) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterLowStock(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              filterLowStock
                ? 'bg-orange-100 border-orange-300 text-orange-700'
                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {filterLowStock ? '✕ 取消篩選' : '⚠ 只看低庫存'}
          </button>
          {filterLowStock && (
            <span className="text-xs text-orange-600 font-medium">{sortedInventory.length} 項偏低／缺貨</span>
          )}
        </div>
        <ExportButtons
          data={inventory.map(item => ({
            productCode: item.product?.code || '-',
            productName: item.product?.name || '未知產品',
            category: item.product?.category || '-',
            warehouse: warehouse || item.product?.warehouseLocation || '-',
            quantity: item.currentQty,
            unit: item.product?.unit || '-',
            costPrice: item.product?.costPrice || 0,
            totalValue: (item.currentQty || 0) * (item.product?.costPrice || 0),
          }))}
          columns={EXPORT_CONFIGS.inventory.columns}
          exportName={EXPORT_CONFIGS.inventory.filename}
          title="庫存查詢"
          sheetName="庫存清單"
        />
      </div>
      <div className="bg-white rounded-lg shadow-sm tbl-wrap">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableTh label="產品" colKey="productName" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" />
              <SortableTh label="館別/倉庫" colKey="warehouseLoc" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">入庫倉庫</th>
              <SortableTh label="進貨（已入庫）" colKey="purchaseIn" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
              <SortableTh label="領用" colKey="requisitionQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
              <SortableTh label="調出" colKey="transferOutQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
              <SortableTh label="調入" colKey="transferInQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
              <SortableTh label="盤點調整" colKey="countAdjustQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
              <SortableTh label="現存量" colKey="currentQty" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" align="right" />
              <SortableTh label="狀態" colKey="status" sortKey={invQKey} sortDir={invQDir} onSort={invQT} className="px-4 py-3" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {inventoryLoading ? (
              <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">載入中...</td></tr>
            ) : inventory.length === 0 ? (
              <tr><td colSpan="11" className="px-4 py-8 text-center text-gray-500">尚無庫存資料（只顯示已確認入庫的商品）</td></tr>
            ) : (
              sortedInventory.map((item, i) => (
                <tr key={item.productId || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-sm">{item.product?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{warehouse || item.product?.warehouseLocation || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {item.inventoryWarehouses?.length > 0
                      ? item.inventoryWarehouses.map(w => (
                          <span key={w} className="inline-block mr-1 mb-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">{w}</span>
                        ))
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-sm text-right">{item.purchaseQty ?? item.purchaseIncr ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.requisitionQty ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.transferOutQty ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.transferInQty ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.countAdjustQty ?? '-'}</td>
                  <td className={`px-4 py-3 text-sm font-bold text-right ${
                    (item.currentQty || 0) < 0 ? 'text-red-600' : (item.currentQty || 0) < 10 ? 'text-orange-600' : 'text-gray-900'
                  }`}>{item.currentQty}</td>
                  <td className="px-4 py-3 text-sm">{getStatusIcon(item.status)} {item.status}</td>
                  <td className="px-4 py-3 text-sm">
                    {(item.currentQty || 0) < 0 && (
                      <button
                        onClick={() => {
                          setAdjustModal({ productId: item.productId, productName: item.product?.name || '未知', currentQty: item.currentQty });
                          setAdjustForm({ warehouse: warehouse || '', targetQty: '0', reason: '' });
                        }}
                        className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 whitespace-nowrap"
                      >
                        調整庫存
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
