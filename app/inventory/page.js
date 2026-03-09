'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import ExportButtons from '@/components/ExportButtons';
import { EXPORT_CONFIGS } from '@/lib/export-columns';

const TABS = [
  { key: 'query', label: '庫存查詢', icon: '📦' },
  { key: 'requisition', label: '領用單', icon: '📤' },
  { key: 'transfer', label: '調撥單', icon: '🔄' },
  { key: 'count', label: '盤點', icon: '📋' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [activeTab, setActiveTab] = useState('query');
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');

  // 庫存查詢
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [calcMode, setCalcMode] = useState(null);

  // 領用單
  const [requisitions, setRequisitions] = useState([]);
  const [requisitionLoading, setRequisitionLoading] = useState(false);
  const [reqForm, setReqForm] = useState({ warehouse: '', department: '', productId: '', productName: '', quantity: '', note: '' });
  const [products, setProducts] = useState([]);
  const [reqSubmitting, setReqSubmitting] = useState(false);

  // 調撥單
  const [transfers, setTransfers] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [trfForm, setTrfForm] = useState({ fromWarehouse: '', toWarehouse: '', productId: '', productName: '', quantity: '', note: '' });
  const [trfSubmitting, setTrfSubmitting] = useState(false);

  // 盤點
  const [stockCounts, setStockCounts] = useState([]);
  const [countLoading, setCountLoading] = useState(false);
  const [countForm, setCountForm] = useState({ warehouse: '', countDate: todayStr(), items: [] });
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetchWarehouses();
  }, []);

  async function fetchWarehouses() {
    try {
      const res = await fetch('/api/warehouse-departments');
      if (res.ok) {
        const data = await res.json();
        const names = Object.keys(typeof data === 'object' ? data : {});
        setWarehouses(names);
        if (names.length > 0 && !warehouse) setWarehouse(names[0]);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeTab === 'query') fetchInventory();
    if (activeTab === 'requisition') fetchRequisitions();
    if (activeTab === 'transfer') fetchTransfers();
    if (activeTab === 'count') {
      fetchStockCounts();
      fetchInventory();
    }
    if (activeTab === 'requisition' || activeTab === 'transfer' || activeTab === 'count') fetchProducts();
  }, [activeTab, warehouse]);

  useEffect(() => {
    if (activeTab === 'count' && warehouse) setCountForm(prev => ({ ...prev, warehouse }));
    if (activeTab === 'requisition' && warehouse) setReqForm(prev => ({ ...prev, warehouse }));
    if (activeTab === 'transfer' && warehouse) {
      setTrfForm(prev => ({ ...prev, fromWarehouse: warehouse }));
    }
  }, [activeTab, warehouse]);

  async function fetchInventory() {
    setInventoryLoading(true);
    try {
      const url = warehouse ? `/api/inventory?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory';
      const res = await fetch(url);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.data || []);
      setInventory(arr);
      if (data?.calculationMode) setCalcMode(data.calculationMode);
    } catch {
      setInventory([]);
    }
    setInventoryLoading(false);
  }

  async function fetchProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data?.products || data?.data || []);
      setProducts(arr.filter(p => p.isInStock !== false));
    } catch { setProducts([]); }
  }

  async function fetchRequisitions() {
    setRequisitionLoading(true);
    try {
      const url = warehouse ? `/api/inventory/requisitions?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/requisitions';
      const res = await fetch(url);
      const data = await res.ok ? await res.json() : [];
      setRequisitions(Array.isArray(data) ? data : []);
    } catch { setRequisitions([]); }
    setRequisitionLoading(false);
  }

  async function fetchTransfers() {
    setTransferLoading(true);
    try {
      const url = warehouse ? `/api/inventory/transfers?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/transfers';
      const res = await fetch(url);
      const data = await res.ok ? await res.json() : [];
      setTransfers(Array.isArray(data) ? data : []);
    } catch { setTransfers([]); }
    setTransferLoading(false);
  }

  async function fetchStockCounts() {
    setCountLoading(true);
    try {
      const url = warehouse ? `/api/inventory/stock-counts?warehouse=${encodeURIComponent(warehouse)}` : '/api/inventory/stock-counts';
      const res = await fetch(url);
      const data = await res.ok ? await res.json() : [];
      setStockCounts(Array.isArray(data) ? data : []);
    } catch { setStockCounts([]); }
    setCountLoading(false);
  }

  async function submitRequisition() {
    if (!reqForm.warehouse || !reqForm.productId || !reqForm.quantity || Number(reqForm.quantity) < 1) {
      showToast('請填寫倉庫、產品、數量', 'error');
      return;
    }
    setReqSubmitting(true);
    try {
      const res = await fetch('/api/inventory/requisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: reqForm.warehouse,
          department: reqForm.department || undefined,
          productId: Number(reqForm.productId),
          quantity: Number(reqForm.quantity),
          requisitionDate: todayStr(),
          note: reqForm.note || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setReqForm(prev => ({ ...prev, productId: '', productName: '', quantity: '', note: '' }));
        showToast('領用單已建立');
        fetchRequisitions();
        fetchInventory();
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setReqSubmitting(false);
  }

  async function submitTransfer() {
    if (!trfForm.fromWarehouse || !trfForm.toWarehouse || trfForm.fromWarehouse === trfForm.toWarehouse) {
      showToast('來源與目標倉庫不可相同', 'error');
      return;
    }
    if (!trfForm.productId || !trfForm.quantity || Number(trfForm.quantity) < 1) {
      showToast('請填寫產品、數量', 'error');
      return;
    }
    setTrfSubmitting(true);
    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWarehouse: trfForm.fromWarehouse,
          toWarehouse: trfForm.toWarehouse,
          productId: Number(trfForm.productId),
          quantity: Number(trfForm.quantity),
          transferDate: todayStr(),
          note: trfForm.note || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setTrfForm(prev => ({ ...prev, productId: '', productName: '', quantity: '', note: '' }));
        showToast('調撥單已建立');
        fetchTransfers();
        fetchInventory();
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setTrfSubmitting(false);
  }

  async function submitStockCount() {
    if (!countForm.warehouse) {
      showToast('請選擇倉庫', 'error');
      return;
    }
    const items = countForm.items.filter(i => i.productId && (i.actualQty != null || i.systemQty != null));
    if (items.length === 0) {
      showToast('請至少新增一筆盤點明細', 'error');
      return;
    }
    const payload = items.map(i => ({
      productId: Number(i.productId),
      systemQty: Number(i.systemQty) || 0,
      actualQty: (Number(i.actualQty) ?? Number(i.systemQty)) || 0,
    }));
    setCountSubmitting(true);
    try {
      const res = await fetch('/api/inventory/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse: countForm.warehouse,
          countDate: countForm.countDate || todayStr(),
          items: payload,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setCountForm(prev => ({ ...prev, items: [] }));
        showToast('盤點已建立');
        fetchStockCounts();
        fetchInventory();
      } else {
        showToast(result.error?.message || '建立失敗', 'error');
      }
    } catch { showToast('建立失敗', 'error'); }
    setCountSubmitting(false);
  }

  function addCountItem() {
    const invItem = inventory.find(i => i.productId && !countForm.items.some(c => c.productId === i.productId));
    if (!invItem) {
      showToast('請先選擇庫存中的產品', 'error');
      return;
    }
    setCountForm(prev => ({
      ...prev,
      items: [...prev.items, { productId: invItem.productId, productName: invItem.product?.name, systemQty: invItem.currentQty || 0, actualQty: invItem.currentQty || 0 }],
    }));
  }

  function updateCountItem(idx, field, value) {
    setCountForm(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
    }));
  }

  function removeCountItem(idx) {
    setCountForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  function getStatusIcon(status) {
    switch (status) {
      case '正常': return '🟢';
      case '偏低': return '🟠';
      case '不足': return '🔴';
      case '過多': return '🔵';
      default: return '⚪';
    }
  }

  return (
    <div className="min-h-screen page-bg-inventory">
      <Navigation borderColor="border-amber-500" />
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-gray-700'}`}>
          {toast.msg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">庫存管理</h2>
            {calcMode && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                {calcMode === 'snapshot' ? '快照計算' : '即時計算'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={warehouse}
              onChange={e => setWarehouse(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
            >
              <option value="">全部倉庫</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <Link href="/settings#warehouses" className="text-sm text-amber-600 hover:underline">倉庫設定</Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === t.key
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 庫存查詢 */}
        {activeTab === 'query' && (
          <>
            <div className="mb-4 flex justify-end">
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
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">產品</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">倉庫</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">進貨</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">銷貨</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">領用</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">調出</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">調入</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">盤點調整</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">現存量</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {inventoryLoading ? (
                    <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-500">載入中...</td></tr>
                  ) : inventory.length === 0 ? (
                    <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-500">尚無庫存資料</td></tr>
                  ) : (
                    inventory.map((item, i) => (
                      <tr key={item.productId || i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">{item.product?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm">{warehouse || item.product?.warehouseLocation || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.purchaseQty ?? item.purchaseIncr ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.salesQty ?? item.salesIncr ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.requisitionQty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.transferOutQty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.transferInQty ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{item.countAdjustQty ?? '-'}</td>
                        <td className={`px-4 py-3 text-sm font-bold text-right ${
                          (item.currentQty || 0) < 0 ? 'text-red-600' : (item.currentQty || 0) < 10 ? 'text-orange-600' : 'text-gray-900'
                        }`}>{item.currentQty}</td>
                        <td className="px-4 py-3 text-sm">{getStatusIcon(item.status)} {item.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 領用單 */}
        {activeTab === 'requisition' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">新增領用單（簡化）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">倉庫 *</label>
                  <select
                    value={reqForm.warehouse}
                    onChange={e => setReqForm(prev => ({ ...prev, warehouse: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇倉庫</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">部門</label>
                  <input
                    type="text"
                    value={reqForm.department}
                    onChange={e => setReqForm(prev => ({ ...prev, department: e.target.value }))}
                    placeholder="例：總務部"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">產品 *</label>
                  <select
                    value={reqForm.productId}
                    onChange={e => {
                      const p = products.find(x => x.id === Number(e.target.value));
                      setReqForm(prev => ({ ...prev, productId: e.target.value, productName: p?.name || '' }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇產品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">數量 *</label>
                  <input
                    type="number"
                    min="1"
                    value={reqForm.quantity}
                    onChange={e => setReqForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">備註</label>
                  <input
                    type="text"
                    value={reqForm.note}
                    onChange={e => setReqForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="選填"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <button
                onClick={submitRequisition}
                disabled={reqSubmitting}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                {reqSubmitting ? '送出中...' : '建立領用單'}
              </button>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <h3 className="text-lg font-semibold p-4 border-b">領用記錄</h3>
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">單號</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">倉庫</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">部門</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">產品</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">數量</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">日期</th>
                </tr></thead>
                <tbody>
                  {requisitionLoading ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
                    requisitions.length === 0 ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">尚無領用記錄</td></tr> :
                    requisitions.map(r => (
                      <tr key={r.id} className="border-t"><td className="px-4 py-2 text-sm">{r.requisitionNo}</td>
                        <td className="px-4 py-2 text-sm">{r.warehouse}</td><td className="px-4 py-2 text-sm">{r.department || '-'}</td>
                        <td className="px-4 py-2 text-sm">{r.product?.name || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right">{r.quantity}</td>
                        <td className="px-4 py-2 text-sm">{r.requisitionDate}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 調撥單 */}
        {activeTab === 'transfer' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">新增調撥單（簡化）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">來源倉庫 *</label>
                  <select
                    value={trfForm.fromWarehouse}
                    onChange={e => setTrfForm(prev => ({ ...prev, fromWarehouse: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">目標倉庫 *</label>
                  <select
                    value={trfForm.toWarehouse}
                    onChange={e => setTrfForm(prev => ({ ...prev, toWarehouse: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">產品 *</label>
                  <select
                    value={trfForm.productId}
                    onChange={e => {
                      const p = products.find(x => x.id === Number(e.target.value));
                      setTrfForm(prev => ({ ...prev, productId: e.target.value, productName: p?.name || '' }));
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇產品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">數量 *</label>
                  <input
                    type="number"
                    min="1"
                    value={trfForm.quantity}
                    onChange={e => setTrfForm(prev => ({ ...prev, quantity: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">備註</label>
                  <input
                    type="text"
                    value={trfForm.note}
                    onChange={e => setTrfForm(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="選填"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <button
                onClick={submitTransfer}
                disabled={trfSubmitting}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
              >
                {trfSubmitting ? '送出中...' : '建立調撥單'}
              </button>
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <h3 className="text-lg font-semibold p-4 border-b">調撥記錄</h3>
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">單號</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">來源</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">目標</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">產品</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">數量</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">日期</th>
                </tr></thead>
                <tbody>
                  {transferLoading ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
                    transfers.length === 0 ? <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">尚無調撥記錄</td></tr> :
                    transfers.flatMap(t => t.items?.map((i, idx) => (
                      <tr key={`${t.id}-${idx}`} className="border-t">
                        <td className="px-4 py-2 text-sm">{t.transferNo}</td>
                        <td className="px-4 py-2 text-sm">{t.fromWarehouse}</td>
                        <td className="px-4 py-2 text-sm">{t.toWarehouse}</td>
                        <td className="px-4 py-2 text-sm">{i.product?.name || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right">{i.quantity}</td>
                        <td className="px-4 py-2 text-sm">{t.transferDate}</td>
                      </tr>
                    )) || [])}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 盤點 */}
        {activeTab === 'count' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold mb-4">新增盤點（簡化）</h3>
              <p className="text-sm text-gray-500 mb-4">請先選擇倉庫，再從庫存中選產品並輸入實盤數量，系統會計算差異並更新庫存。</p>
              <div className="flex gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">倉庫 *</label>
                  <select
                    value={countForm.warehouse}
                    onChange={e => {
                      const v = e.target.value;
                      setCountForm(prev => ({ ...prev, warehouse: v }));
                      setWarehouse(v);
                    }}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">選擇倉庫</option>
                    {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">盤點日期</label>
                  <input
                    type="date"
                    value={countForm.countDate}
                    onChange={e => setCountForm(prev => ({ ...prev, countDate: e.target.value }))}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <button
                  onClick={addCountItem}
                  disabled={!countForm.warehouse || inventory.length === 0}
                  className="self-end px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                >
                  從庫存加入產品
                </button>
              </div>
              {countForm.items.length > 0 && (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
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
                              <input
                                type="number"
                                value={it.actualQty ?? ''}
                                onChange={e => updateCountItem(idx, 'actualQty', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-20 px-2 py-1 border rounded text-right"
                              />
                            </td>
                            <td className={`px-4 py-2 text-right font-medium ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>{diff}</td>
                            <td><button onClick={() => removeCountItem(idx)} className="text-red-500 hover:underline text-xs">刪除</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <button
                    onClick={submitStockCount}
                    disabled={countSubmitting}
                    className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
                  >
                    {countSubmitting ? '送出中...' : '確認盤點'}
                  </button>
                </>
              )}
            </div>
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <h3 className="text-lg font-semibold p-4 border-b">盤點記錄</h3>
              <table className="w-full">
                <thead className="bg-gray-50"><tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">單號</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">倉庫</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">日期</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">品項數</th>
                </tr></thead>
                <tbody>
                  {countLoading ? <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">載入中...</td></tr> :
                    stockCounts.length === 0 ? <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-500">尚無盤點記錄</td></tr> :
                    stockCounts.map(s => (
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
        )}
      </main>
    </div>
  );
}
