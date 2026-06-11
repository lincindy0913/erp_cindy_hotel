'use client';

import Link from 'next/link';
import Navigation from '@/components/Navigation';
import HelpButton from '@/components/HelpButton';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExcelBatchImport from '@/components/ExcelBatchImport';
import { todayStr } from '@/lib/localDate';
import { useInventory } from './_hooks/useInventory';
import WarehouseSelect from './_components/WarehouseSelect';
import { QueryTab } from './_tabs/QueryTab';
import { InboundTab } from './_tabs/InboundTab';
import { RequisitionTab } from './_tabs/RequisitionTab';
import { TransferTab } from './_tabs/TransferTab';
import { CountTab } from './_tabs/CountTab';
import { AdjustModal } from './_tabs/AdjustModal';

const TABS = [
  { key: 'query', label: '庫存查詢', icon: '📦' },
  { key: 'inbound', label: '待入庫', icon: '📥' },
  { key: 'requisition', label: '領用單', icon: '📤' },
  { key: 'transfer', label: '調撥單', icon: '🔄' },
  { key: 'count', label: '盤點', icon: '📋' },
];

export default function InventoryPage() {
  const inv = useInventory();

  return (
    <div className="min-h-screen page-bg-inventory">
      <Navigation borderColor="border-amber-500" />
      {inv.inventoryError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <FetchErrorBanner message={inv.inventoryError} onRetry={inv.fetchInventory} />
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">庫存管理</h2>
            {inv.calcMode && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                {inv.calcMode === 'snapshot' ? '快照計算' : '即時計算'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <HelpButton anchor="四採購與庫存" />
            {inv.activeTab === 'count' && (
              <ExcelBatchImport
                title="庫存盤點批次匯入"
                hint="上傳實際盤點數量，系統自動比對帳面數量並計算差異，建立一張盤點記錄。"
                columns={[
                  { key: 'productCode', header: '商品代碼',  example: 'PROD-001',  required: true,  width: 14 },
                  { key: 'productName', header: '商品名稱',  example: '礦泉水',    required: false, width: 18, note: '僅供參考' },
                  { key: 'actualQty',   header: '實際數量',  example: '50',        required: true,  width: 10 },
                  { key: 'warehouse',   header: '倉庫',      example: '館別A',     required: false, width: 12, note: '留空用目前篩選' },
                  { key: 'note',        header: '備註',      example: '',          required: false, width: 16 },
                ]}
                onImport={async rows => {
                  const res = await fetch('/api/inventory/stock-counts/import-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows, warehouse: inv.warehouse, countDate: todayStr() }),
                  });
                  const json = await res.json();
                  if (res.ok) { inv.fetchStockCounts(); return json; }
                  throw new Error(json.error || '匯入失敗');
                }}
                buttonClass="bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 flex items-center gap-1.5 text-sm font-medium"
              />
            )}
            <WarehouseSelect
              value={inv.warehouse}
              onChange={inv.setWarehouse}
              warehouseList={inv.warehouseList}
              placeholder="全部館別/倉庫"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
            />
            <Link href="/settings#warehouses" className="text-sm text-amber-600 hover:underline">倉庫設定</Link>
          </div>
        </div>

        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => inv.setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                inv.activeTab === t.key
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {inv.activeTab === 'inbound' && inv.inboundError && (
          <div className="mb-4"><FetchErrorBanner message={inv.inboundError} onRetry={inv.fetchPendingInbound} /></div>
        )}
        {inv.activeTab === 'requisition' && inv.requisitionError && (
          <div className="mb-4"><FetchErrorBanner message={inv.requisitionError} onRetry={inv.fetchRequisitions} /></div>
        )}
        {inv.activeTab === 'transfer' && inv.transferError && (
          <div className="mb-4"><FetchErrorBanner message={inv.transferError} onRetry={inv.fetchTransfers} /></div>
        )}

        {inv.activeTab === 'count' && inv.countError && (
          <div className="mb-4"><FetchErrorBanner message={inv.countError} onRetry={inv.fetchStockCounts} /></div>
        )}

        {inv.activeTab === 'query' && <QueryTab {...inv} />}
        {inv.activeTab === 'inbound' && <InboundTab {...inv} />}
        {inv.activeTab === 'requisition' && <RequisitionTab {...inv} />}
        {inv.activeTab === 'transfer' && <TransferTab {...inv} />}
        {inv.activeTab === 'count' && <CountTab {...inv} />}
      </main>

      <AdjustModal {...inv} />
    </div>
  );
}
