'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AnalyticsPage() {
  const [products, setProducts] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceComparison, setPriceComparison] = useState([]);
  const [departmentExpenses, setDepartmentExpenses] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [timeRange, setTimeRange] = useState('6');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchProducts();
    fetchPriceComparison();
    fetchDepartmentExpenses();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchPriceHistory(selectedProduct);
    } else {
      setPriceHistory([]);
    }
  }, [selectedProduct]);

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得產品列表失敗:', error);
      setProducts([]);
    }
  }

  async function fetchPriceHistory(productId) {
    try {
      const response = await fetch(`/api/price-history?productId=${productId}`);
      const data = await response.json();
      setPriceHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得歷史價格失敗:', error);
      setPriceHistory([]);
    }
  }

  async function fetchPriceComparison() {
    try {
      const response = await fetch('/api/price-comparison');
      const data = await response.json();
      setPriceComparison(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得比價資料失敗:', error);
      setPriceComparison([]);
    }
  }

  async function fetchDepartmentExpenses() {
    try {
      const response = await fetch(`/api/department-expenses?year=${selectedYear}`);
      const data = await response.json();
      setDepartmentExpenses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得部門支出失敗:', error);
      setDepartmentExpenses([]);
    }
  }

  // 按月份分組部門支出
  const groupedExpenses = departmentExpenses.reduce((acc, exp) => {
    const key = `${exp.year}-${exp.month}`;
    if (!acc[key]) {
      acc[key] = { year: exp.year, month: exp.month, total: 0, items: [] };
    }
    acc[key].total += parseFloat(exp.totalAmount || 0);
    acc[key].items.push(exp);
    return acc;
  }, {});

  return (
    <div className="min-h-screen page-bg-analytics">
      <nav className="bg-white shadow-lg border-b-4 border-cyan-500">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">📦 進銷存系統</h1>
            <div className="flex gap-2 text-sm flex-wrap">
              <Link href="/" className="link-dashboard">儀表板</Link>
              <Link href="/products" className="link-products">主資料</Link>
              <Link href="/suppliers" className="link-suppliers">廠商</Link>
              <Link href="/purchasing" className="link-purchasing">進貨</Link>
              <Link href="/sales" className="link-sales">發票登錄/核銷</Link>
              <Link href="/finance" className="link-finance">付款</Link>
              <Link href="/inventory" className="link-inventory">庫存</Link>
              <Link href="/analytics" className="link-analytics active font-medium">分析</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">決策分析</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* 歷史價格分析 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">📈 歷史價格分析</h3>
            <div className="space-y-4">
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">選擇產品...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              
              {priceHistory.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">日期</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">供應商</th>
                        <th className="px-3 py-2 text-right text-sm font-medium text-gray-700">價格</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {priceHistory.slice(0, 10).map(ph => (
                        <tr key={ph.id}>
                          <td className="px-3 py-2 text-sm">{ph.purchaseDate}</td>
                          <td className="px-3 py-2 text-sm">{ph.supplierName}</td>
                          <td className="px-3 py-2 text-sm text-right">NT$ {parseFloat(ph.unitPrice).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
                  {selectedProduct ? '該產品尚無歷史價格資料' : '請選擇產品查看歷史價格'}
                </div>
              )}
            </div>
          </div>

          {/* 比價分析 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">💰 供應商比價</h3>
            <div className="space-y-4">
              {priceComparison.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">產品</th>
                        <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">供應商</th>
                        <th className="px-3 py-2 text-right text-sm font-medium text-gray-700">價格</th>
                        <th className="px-3 py-2 text-center text-sm font-medium text-gray-700">最低價</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {priceComparison.map((comp, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 text-sm">{comp.productName}</td>
                          <td className="px-3 py-2 text-sm">{comp.supplierName}</td>
                          <td className="px-3 py-2 text-sm text-right">NT$ {parseFloat(comp.unitPrice).toFixed(2)}</td>
                          <td className="px-3 py-2 text-center">
                            {comp.isMinPrice ? (
                              <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                ✓ 最低
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
                  尚無比價資料
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 部門支出 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">🏢 部門支出分析</h3>
          <div className="space-y-4">
            <select
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(parseInt(e.target.value));
                fetchDepartmentExpenses();
              }}
            >
              {[2024, 2023, 2022].map(year => (
                <option key={year} value={year}>{year} 年</option>
              ))}
            </select>
            
            {departmentExpenses.length > 0 ? (
              <div className="overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">年月</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">部門</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">類別</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">稅額</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">總金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {departmentExpenses.map(exp => (
                      <tr key={exp.id}>
                        <td className="px-4 py-3 text-sm">{exp.year}年{exp.month}月</td>
                        <td className="px-4 py-3 text-sm">{exp.department}</td>
                        <td className="px-4 py-3 text-sm">{exp.category}</td>
                        <td className="px-4 py-3 text-sm text-right">NT$ {parseFloat(exp.tax).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right">NT$ {parseFloat(exp.totalAmount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64 bg-gray-50 rounded flex items-center justify-center text-gray-500">
                尚無部門支出資料
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
