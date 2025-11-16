'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    try {
      const response = await fetch('/api/inventory');
      const data = await response.json();
      // 確保 data 是陣列
      setInventory(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得庫存列表失敗:', error);
      setInventory([]);
      setLoading(false);
    }
  }

  function getStatusIcon(status) {
    switch(status) {
      case '正常':
        return '🟢';
      case '偏低':
        return '🟠';
      case '不足':
        return '🔴';
      case '過多':
        return '🔵';
      default:
        return '⚪';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 導航欄 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-800">📦 進銷存系統</h1>
            <div className="flex gap-6 text-sm flex-wrap">
              <Link href="/" className="hover:text-blue-600">儀表板</Link>
              <Link href="/products" className="hover:text-blue-600">主資料</Link>
              <Link href="/suppliers" className="hover:text-blue-600">廠商</Link>
              <Link href="/customers" className="hover:text-blue-600">客戶</Link>
              <Link href="/purchasing" className="hover:text-blue-600">進貨</Link>
              <Link href="/sales" className="hover:text-blue-600">銷貨</Link>
              <Link href="/finance" className="hover:text-blue-600">財務</Link>
              <Link href="/inventory" className="font-medium text-blue-600">庫存</Link>
              <Link href="/analytics" className="hover:text-blue-600">分析</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6">庫存查詢</h2>

        {/* 搜尋區 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="搜尋產品..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>全部類別</option>
              <option>電子產品</option>
              <option>辦公用品</option>
            </select>
            <button className="px-6 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50">
              查詢
            </button>
          </div>
        </div>

        {/* 庫存列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">產品</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">倉庫位置</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">期初量</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">進貨</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">銷貨</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">現存量</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                    尚無庫存資料
                  </td>
                </tr>
              ) : (
                inventory.map((item, index) => (
                  <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm">{item.id}</td>
                    <td className="px-4 py-3 text-sm">
                      {item.product ? item.product.name : '未知產品'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.product ? (item.product.warehouseLocation || '-') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">{item.beginningQty}</td>
                    <td className="px-4 py-3 text-sm">{item.purchaseQty}</td>
                    <td className="px-4 py-3 text-sm">{item.salesQty}</td>
                    <td className={`px-4 py-3 text-sm font-bold ${
                      item.currentQty < 0 ? 'text-red-600' : 
                      item.currentQty < 10 ? 'text-orange-600' : 
                      'text-gray-900'
                    }`}>
                      {item.currentQty}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusIcon(item.status)} {item.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

