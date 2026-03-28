'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function PaymentVoucherListPage() {
  const { data: session } = useSession();
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [paymentOrders, setPaymentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('monthly'); // 'monthly' | 'orders' | 'invoices'
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [filterData, setFilterData] = useState({
    yearMonth: '',
    supplierId: '',
    warehouse: ''
  });
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  // Batch print state
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [batchPrinting, setBatchPrinting] = useState(false);

  // Monthly voucher state (spec23 v3)
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = today.toISOString().slice(0, 10);
  const [voucherFilter, setVoucherFilter] = useState({
    supplierId: '',
    startDate: firstOfMonth,
    endDate: todayStr,
    warehouse: ''
  });
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [voucherPreview, setVoucherPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Monthly batch state
  const [suppliersWithData, setSuppliersWithData] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState(new Set());
  const [monthlyBatchPrinting, setMonthlyBatchPrinting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    filterInvoices();
  }, [invoices, filterData]);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchInvoices(), fetchSuppliers(), fetchPaymentOrders()]);
    setLoading(false);
  }

  async function fetchInvoices() {
    try {
      const response = await fetch('/api/sales/with-info');
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setInvoices([]);
    }
  }

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers?all=true');
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  async function fetchPaymentOrders() {
    try {
      const response = await fetch('/api/payment-orders');
      const data = await response.json();
      setPaymentOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得付款單列表失敗:', error);
      setPaymentOrders([]);
    }
  }

  function filterInvoices() {
    let filtered = [...invoices];
    if (filterData.yearMonth) {
      filtered = filtered.filter(invoice => {
        const invoiceYearMonth = invoice.invoiceDate ? invoice.invoiceDate.substring(0, 7) : '';
        return invoiceYearMonth === filterData.yearMonth;
      });
    }
    if (filterData.supplierId) {
      filtered = filtered.filter(invoice => invoice.supplierId && invoice.supplierId === parseInt(filterData.supplierId));
    }
    if (filterData.warehouse) {
      filtered = filtered.filter(invoice => invoice.warehouse && invoice.warehouse === filterData.warehouse);
    }
    setFilteredInvoices(filtered);
  }

  function getFilteredOrders() {
    let filtered = [...paymentOrders];
    if (filterData.supplierId) filtered = filtered.filter(o => o.supplierId === parseInt(filterData.supplierId));
    if (filterData.warehouse) filtered = filtered.filter(o => o.warehouse === filterData.warehouse);
    return filtered;
  }

  function getSupplierName(invoice) {
    return invoice.supplierName || '未知廠商';
  }

  function getInvoiceNo(invoiceId) {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    return invoice ? (invoice.invoiceNo || invoice.salesNo || `#${invoiceId}`) : `#${invoiceId}`;
  }

  function getStatusBadge(status) {
    const map = {
      '草稿': 'bg-gray-100 text-gray-800',
      '待出納': 'bg-yellow-100 text-yellow-800',
      '已執行': 'bg-green-100 text-green-800',
      '已拒絕': 'bg-red-100 text-red-800',
      '已作廢': 'bg-gray-200 text-gray-500',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  function toggleExpand(orderId) {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  }

  // ---- Monthly Voucher (spec23 v3) ----
  async function fetchVoucherPreview() {
    if (!voucherFilter.supplierId || !voucherFilter.startDate || !voucherFilter.endDate) return;
    setPreviewLoading(true);
    setVoucherPreview(null);
    try {
      const params = new URLSearchParams({
        supplierId: voucherFilter.supplierId,
        startDate: voucherFilter.startDate,
        endDate: voucherFilter.endDate,
        warehouse: voucherFilter.warehouse,
      });
      const res = await fetch(`/api/payment-vouchers/preview?${params}`);
      if (res.ok) {
        const data = await res.json();
        setVoucherPreview(data);
      } else {
        const err = await res.json();
        setVoucherPreview({ error: err.error?.message || '無進貨資料' });
      }
    } catch {
      setVoucherPreview({ error: '載入失敗' });
    }
    setPreviewLoading(false);
  }

  async function printPaymentVoucher(orderId) {
    try {
      const res = await fetch(`/api/export/payment-voucher/${orderId}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        alert('列印失敗：' + (err.error?.message || err.error || '未知錯誤'));
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      alert('列印失敗：' + (e.message || '網路錯誤'));
    }
  }

  async function printMonthlyVoucher(showPriceNote = true) {
    if (!voucherFilter.supplierId || !voucherFilter.startDate || !voucherFilter.endDate) return;
    const params = new URLSearchParams({
      supplierId: voucherFilter.supplierId,
      startDate: voucherFilter.startDate,
      endDate: voucherFilter.endDate,
      warehouse: voucherFilter.warehouse,
      showPriceNote: showPriceNote ? 'true' : 'false',
    });
    const url = `/api/export/voucher-monthly?${params}`;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        alert('列印失敗：' + (err.error?.message || err.error || '未知錯誤'));
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      alert('列印失敗：' + (e.message || '網路錯誤'));
    }
  }

  // Monthly supplier list fetch
  async function fetchSuppliersWithData() {
    if (!voucherFilter.startDate || !voucherFilter.endDate) return;
    setSuppliersLoading(true);
    setSearchExecuted(true);
    try {
      const params = new URLSearchParams({
        startDate: voucherFilter.startDate,
        endDate: voucherFilter.endDate,
      });
      if (voucherFilter.warehouse) params.set('warehouse', voucherFilter.warehouse);
      const res = await fetch(`/api/payment-vouchers/suppliers-with-data?${params}`);
      const data = await res.json();
      setSuppliersWithData(Array.isArray(data) ? data : []);
    } catch {
      setSuppliersWithData([]);
    }
    setSuppliersLoading(false);
  }

  function handleSearch() {
    setVoucherPreview(null);
    setSelectedSupplierIds(new Set());
    fetchSuppliersWithData();
  }

  function toggleSelectSupplier(supplierId) {
    setSelectedSupplierIds(prev => {
      const next = new Set(prev);
      if (next.has(supplierId)) next.delete(supplierId);
      else next.add(supplierId);
      return next;
    });
  }

  function toggleSelectAllSuppliers() {
    if (selectedSupplierIds.size === suppliersWithData.length) {
      setSelectedSupplierIds(new Set());
    } else {
      setSelectedSupplierIds(new Set(suppliersWithData.map(s => s.id)));
    }
  }

  async function batchPrintMonthlyVouchers() {
    if (selectedSupplierIds.size === 0 || !voucherFilter.startDate || !voucherFilter.endDate) return;
    setMonthlyBatchPrinting(true);
    try {
      const res = await fetch('/api/export/voucher-monthly/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startDate: voucherFilter.startDate,
          endDate: voucherFilter.endDate,
          warehouse: voucherFilter.warehouse,
          supplierIds: Array.from(selectedSupplierIds),
          showPriceNote: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        alert('批量列印失敗：' + (err.error?.message || err.error || '未知錯誤'));
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      alert('批量列印失敗：' + (e.message || '網路錯誤'));
    } finally {
      setMonthlyBatchPrinting(false);
    }
  }

  // Batch select helpers
  function toggleSelectOrder(orderId) {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleSelectAll(orders) {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
    }
  }

  async function batchPrintVouchers() {
    if (selectedOrderIds.size === 0) return;
    setBatchPrinting(true);
    try {
      const res = await fetch('/api/export/payment-voucher/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids: Array.from(selectedOrderIds) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        alert('批量列印失敗：' + (err.error?.message || err.error || '未知錯誤'));
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      alert('批量列印失敗：' + (e.message || '網路錯誤'));
    } finally {
      setBatchPrinting(false);
    }
  }

  const filteredOrders = getFilteredOrders();
  const preview = voucherPreview;
  const isLandscape = preview?.printConfig?.orientation === 'landscape';
  const dateColumns = preview?.printConfig?.dateColumns || 0;
  const noteCount = preview?.priceNoteSummary?.noteCount || 0;

  return (
    <div className="min-h-screen page-bg-finance">
      <Navigation borderColor="border-indigo-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">傳票列印</h2>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'monthly', label: '月度廠商傳票' },
            { key: 'orders', label: `付款單追蹤 (${filteredOrders.length})` },
            { key: 'invoices', label: `發票列表 (${filteredInvoices.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-indigo-50 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ======== Monthly Voucher (spec23 v3) ======== */}
        {activeView === 'monthly' && (
          <div className="space-y-4">
            {/* Filter Panel */}
            <div className="bg-white rounded-lg shadow-sm p-6 border">
              <h3 className="text-base font-semibold text-gray-700 mb-4">廠商傳票</h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">進貨起始日 *</label>
                  <input
                    type="date"
                    value={voucherFilter.startDate}
                    onChange={e => { setVoucherFilter(v => ({ ...v, startDate: e.target.value })); setSearchExecuted(false); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">進貨結束日 *</label>
                  <input
                    type="date"
                    value={voucherFilter.endDate}
                    onChange={e => { setVoucherFilter(v => ({ ...v, endDate: e.target.value })); setSearchExecuted(false); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                  <select
                    value={voucherFilter.warehouse}
                    onChange={e => { setVoucherFilter(v => ({ ...v, warehouse: e.target.value })); setSearchExecuted(false); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">全館</option>
                    <option value="麗格">麗格</option>
                    <option value="麗軒">麗軒</option>
                    <option value="民宿">民宿</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleSearch}
                    disabled={!voucherFilter.startDate || !voucherFilter.endDate || suppliersLoading}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {suppliersLoading ? '搜尋中...' : '搜尋'}
                  </button>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">廠商（選填，用於單筆預覽/列印）</label>
                  <select
                    value={voucherFilter.supplierId}
                    onChange={e => { setVoucherFilter(v => ({ ...v, supplierId: e.target.value })); setVoucherPreview(null); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">選擇廠商...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Single supplier preview/print buttons */}
              {voucherFilter.supplierId && voucherFilter.startDate && voucherFilter.endDate && (
                <div className="mt-4 flex items-center gap-3 pt-3 border-t">
                  <button
                    onClick={fetchVoucherPreview}
                    disabled={previewLoading}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                  >
                    {previewLoading ? '載入中...' : '預覽資訊'}
                  </button>
                  <button
                    onClick={() => printMonthlyVoucher(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
                  >
                    列印傳票
                  </button>
                </div>
              )}
            </div>

            {/* Preview Info + Print (spec23 v3) */}
            {previewLoading && (
              <div className="text-center py-8 text-gray-400">載入傳票資訊中...</div>
            )}

            {preview && !preview.error && (
              <div className="bg-white rounded-lg shadow-sm p-6 border">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-gray-800">{preview.supplier?.name}</span>
                      <span className="text-sm text-gray-500">{voucherFilter.startDate} ~ {voucherFilter.endDate} · {voucherFilter.warehouse || '全館'}</span>
                    </div>
                    {/* Orientation hint */}
                    {dateColumns > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>
                          共 <strong>{dateColumns}</strong> 個進貨日期，
                          {isLandscape
                            ? <span className="text-indigo-600 font-medium">將自動使用 A4 橫式列印</span>
                            : <span className="text-gray-600">使用 A4 直式列印</span>
                          }
                        </span>
                      </div>
                    )}
                    {/* Price notes hint */}
                    {noteCount > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          <span className="text-indigo-600 font-medium">{noteCount} 項品名</span>附有歷史較低價參考資訊
                          （{preview.priceNoteSummary?.noteItems?.join('、')}）
                        </span>
                      </div>
                    )}
                    {/* Maker name */}
                    <div className="text-xs text-gray-400">
                      製表人：{preview.printConfig?.makerName}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => printMonthlyVoucher(true)}
                      className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <span>📄</span>
                      <span>列印傳票</span>
                    </button>
                    {noteCount > 0 && (
                      <button
                        onClick={() => printMonthlyVoucher(false)}
                        className="px-5 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors text-center"
                      >
                        列印（不含附記）
                      </button>
                    )}
                  </div>
                </div>

                {/* Items summary table */}
                {preview.items?.length > 0 && (
                  <div className="mt-4 overflow-auto max-h-60">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500">品名</th>
                          <th className="px-3 py-2 text-right text-gray-500">單價</th>
                          <th className="px-3 py-2 text-center text-gray-500">歷史比價</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.items.map((item, i) => (
                          <tr key={i} className={item.isPriceNote ? 'bg-indigo-50' : ''}>
                            <td className="px-3 py-1.5">{item.productName}</td>
                            <td className="px-3 py-1.5 text-right">${item.currentUnitPrice}</td>
                            <td className="px-3 py-1.5 text-center">
                              {item.isPriceNote ? (
                                <span className="text-xs text-gray-500">
                                  歷史最低 ${item.priceComparison?.recentMin}（{item.priceComparison?.priceDiff} · {item.priceComparison?.diffRate}）
                                </span>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {preview?.error && (
              <div className="bg-red-50 rounded-lg p-4 text-sm text-red-600 border border-red-200">
                {preview.error}
              </div>
            )}

            {/* Supplier list with checkboxes for batch print */}
            {searchExecuted && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-gray-700">
                    {voucherFilter.startDate} ~ {voucherFilter.endDate} 有進貨資料的廠商
                  </h3>
                  {suppliersWithData.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={suppliersWithData.length > 0 && selectedSupplierIds.size === suppliersWithData.length}
                        onChange={toggleSelectAllSuppliers}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-600">全選</span>
                    </label>
                  )}
                  <span className="text-sm text-gray-500">
                    已選擇 <strong className="text-indigo-600">{selectedSupplierIds.size}</strong> 家
                  </span>
                </div>
                <button
                  onClick={batchPrintMonthlyVouchers}
                  disabled={selectedSupplierIds.size === 0 || monthlyBatchPrinting}
                  className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {monthlyBatchPrinting ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      產生 PDF 中...
                    </>
                  ) : (
                    <>批量列印傳票 ({selectedSupplierIds.size})</>
                  )}
                </button>
              </div>
              {suppliersLoading ? (
                <div className="p-8 text-center text-gray-400">載入廠商列表中...</div>
              ) : suppliersWithData.length === 0 ? (
                <div className="p-8 text-center text-gray-400">該月份無進貨資料</div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[400px] overflow-auto">
                  {suppliersWithData.map((s, idx) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-indigo-50 transition-colors ${
                        selectedSupplierIds.has(s.id) ? 'bg-indigo-50/50' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSupplierIds.has(s.id)}
                        onChange={() => toggleSelectSupplier(s.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-gray-800 flex-1">{s.name}</span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{s.count} 筆進貨</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* ======== Filter bar for other views ======== */}
        {activeView !== 'monthly' && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">篩選條件</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">銷帳年月</label>
                <input
                  type="month"
                  value={filterData.yearMonth}
                  onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
                <select
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
                <label className="block text-sm font-medium text-gray-700 mb-1">館別</label>
                <select
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
        )}

        {/* ======== Payment Orders ======== */}
        {activeView === 'orders' && (
          <div className="space-y-6">
          {/* Batch print toolbar */}
          {filteredOrders.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4 border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                    onChange={() => toggleSelectAll(filteredOrders)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">全選</span>
                </label>
                <span className="text-sm text-gray-500">
                  已選擇 <strong className="text-indigo-600">{selectedOrderIds.size}</strong> 張傳票
                </span>
              </div>
              <button
                onClick={batchPrintVouchers}
                disabled={selectedOrderIds.size === 0 || batchPrinting}
                className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {batchPrinting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    產生 PDF 中...
                  </>
                ) : (
                  <>批量列印 ({selectedOrderIds.size})</>
                )}
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                      onChange={() => toggleSelectAll(filteredOrders)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款單號</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">淨額</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">追蹤鏈</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">載入中...</td></tr>
                ) : filteredOrders.length === 0 ? (
                  <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">沒有找到付款單資料</td></tr>
                ) : (
                  filteredOrders.map((order, index) => {
                    const isExpanded = expandedOrderId === order.id;
                    const exec = order.executions?.[0];
                    const invoiceIds = Array.isArray(order.invoiceIds) ? order.invoiceIds : [];

                    return (
                      <Fragment key={order.id}>
                        <tr className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.has(order.id)}
                              onChange={() => toggleSelectOrder(order.id)}
                              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-indigo-700">{order.orderNo}</td>
                          <td className="px-4 py-3 text-sm">{order.supplierName || '-'}</td>
                          <td className="px-4 py-3 text-sm">{order.warehouse || '-'}</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold">NT$ {Number(order.netAmount).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-gray-500">{invoiceIds.length > 0 ? `${invoiceIds.length}張發票` : '-'}</span>
                              <span className="text-gray-300">|</span>
                              <span className="text-indigo-600 font-medium">{order.orderNo}</span>
                              {exec && (
                                <>
                                  <span className="text-gray-300">|</span>
                                  <span className="text-amber-600 font-medium">{exec.executionNo}</span>
                                </>
                              )}
                              {exec?.cashTransactionId && (
                                <>
                                  <span className="text-gray-300">|</span>
                                  <span className="text-emerald-600 font-medium">CF-{exec.cashTransactionId}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex gap-2 justify-center">
                              <button onClick={() => toggleExpand(order.id)} className="text-indigo-600 hover:underline text-xs">
                                {isExpanded ? '收起' : '詳情'}
                              </button>
                              <button
                                onClick={() => printPaymentVoucher(order.id)}
                                className="text-green-600 hover:underline text-xs font-medium"
                              >
                                列印PDF
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-indigo-50/50">
                            <td colSpan="8" className="px-4 py-4">
                              <div className="space-y-4">
                                <div className="bg-white border border-indigo-200 rounded-lg p-4">
                                  <div className="text-sm font-semibold text-indigo-700 mb-3">完整追蹤鏈</div>
                                  <div className="flex items-center gap-2 flex-wrap text-sm">
                                    <div className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-xs">
                                      <div className="font-semibold mb-0.5">發票</div>
                                      {invoiceIds.length > 0 ? invoiceIds.map(id => getInvoiceNo(id)).join(', ') : '(無)'}
                                    </div>
                                    <span className="text-gray-400 text-lg">-&gt;</span>
                                    <div className="bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-lg text-xs">
                                      <div className="font-semibold mb-0.5">付款單</div>
                                      {order.orderNo}
                                    </div>
                                    {exec && (
                                      <>
                                        <span className="text-gray-400 text-lg">-&gt;</span>
                                        <div className="bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg text-xs">
                                          <div className="font-semibold mb-0.5">出納單</div>
                                          {exec.executionNo}
                                        </div>
                                      </>
                                    )}
                                    {exec?.cashTransactionId && (
                                      <>
                                        <span className="text-gray-400 text-lg">-&gt;</span>
                                        <div className="bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg text-xs">
                                          <div className="font-semibold mb-0.5">現金流</div>
                                          CF-{exec.cashTransactionId}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <div className="bg-white border rounded-lg p-4">
                                  <div className="text-sm font-semibold text-gray-700 mb-2">付款單詳情</div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                    <div><div className="text-xs text-gray-500">付款方式</div><div>{order.paymentMethod}</div></div>
                                    <div><div className="text-xs text-gray-500">發票總額</div><div>NT$ {Number(order.amount).toLocaleString()}</div></div>
                                    <div><div className="text-xs text-gray-500">折讓</div><div>{order.discount > 0 ? `NT$ ${Number(order.discount).toLocaleString()}` : '-'}</div></div>
                                    <div><div className="text-xs text-gray-500">應付淨額</div><div className="font-bold text-indigo-700">NT$ {Number(order.netAmount).toLocaleString()}</div></div>
                                  </div>
                                  {order.note && <div className="mt-2 text-sm text-gray-500">備註: {order.note}</div>}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* ======== Invoice List ======== */}
        {activeView === 'invoices' && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票號</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票日期</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">總金額</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">載入中...</td></tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">沒有找到發票資料</td></tr>
                ) : (
                  filteredInvoices.map((invoice, index) => {
                    const totalAmount = parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0));
                    return (
                      <tr key={invoice.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium">{invoice.invoiceNo || invoice.salesNo || '-'}</td>
                        <td className="px-4 py-3 text-sm">{invoice.invoiceDate || invoice.salesDate || '-'}</td>
                        <td className="px-4 py-3 text-sm">{getSupplierName(invoice)}</td>
                        <td className="px-4 py-3 text-sm">{invoice.warehouse || '-'}</td>
                        <td className="px-4 py-3 text-sm font-semibold">NT$ {totalAmount.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            invoice.status === '已核銷' ? 'bg-green-100 text-green-800' :
                            invoice.status === '待核銷' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {invoice.status || '待核銷'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/payment-voucher/${invoice.id}`}
                            target="_blank"
                            className="text-green-600 hover:underline text-sm font-medium"
                          >
                            列印傳票
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
