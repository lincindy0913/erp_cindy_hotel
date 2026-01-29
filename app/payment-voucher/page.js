'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function PaymentVoucherListPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterData, setFilterData] = useState({
    yearMonth: '',
    supplierId: '',
    warehouse: ''
  });
  const [filteredInvoices, setFilteredInvoices] = useState([]);

  useEffect(() => {
    fetchInvoices();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    filterInvoices();
  }, [invoices, filterData]);

  async function fetchInvoices() {
    try {
      const response = await fetch('/api/sales/with-info');
      const data = await response.json();
      setInvoices(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setInvoices([]);
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers');
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  function filterInvoices() {
    let filtered = [...invoices];

    // 篩選條件：銷帳年月（發票日期）
    if (filterData.yearMonth) {
      filtered = filtered.filter(invoice => {
        const invoiceYearMonth = invoice.invoiceDate ? invoice.invoiceDate.substring(0, 7) : '';
        return invoiceYearMonth === filterData.yearMonth;
      });
    }

    // 篩選條件：廠商
    if (filterData.supplierId) {
      filtered = filtered.filter(invoice => {
        return invoice.supplierId && invoice.supplierId === parseInt(filterData.supplierId);
      });
    }

    // 篩選條件：管別
    if (filterData.warehouse) {
      filtered = filtered.filter(invoice => {
        return invoice.warehouse && invoice.warehouse === filterData.warehouse;
      });
    }

    setFilteredInvoices(filtered);
  }

  function getSupplierName(invoice) {
    return invoice.supplierName || '未知廠商';
  }

  function getWarehouse(invoice) {
    return invoice.warehouse || '-';
  }

  return (
    <div className="min-h-screen page-bg-finance">
      <Navigation borderColor="border-indigo-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">列印傳票</h2>
        </div>

        {/* 篩選條件 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">篩選條件</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                銷帳年月
              </label>
              <input
                type="month"
                value={filterData.yearMonth}
                onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                廠商
              </label>
              <select
                value={filterData.supplierId}
                onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部廠商</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                管別
              </label>
              <select
                value={filterData.warehouse}
                onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部管別</option>
                <option value="麗格">麗格</option>
                <option value="麗軒">麗軒</option>
                <option value="民宿">民宿</option>
              </select>
            </div>
          </div>
        </div>

        {/* 發票列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">管別</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">總金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">載入中...</td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">沒有找到發票資料</td>
                </tr>
              ) : (
                filteredInvoices.map((invoice, index) => {
                  const totalAmount = parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0));
                  return (
                    <tr key={invoice.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm font-medium">{invoice.invoiceNo || invoice.salesNo || '-'}</td>
                      <td className="px-4 py-3 text-sm">{invoice.invoiceDate || invoice.salesDate || '-'}</td>
                      <td className="px-4 py-3 text-sm">{getSupplierName(invoice)}</td>
                      <td className="px-4 py-3 text-sm">{getWarehouse(invoice)}</td>
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
                          🖨️ 列印傳票
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

