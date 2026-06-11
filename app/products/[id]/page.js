'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';

export default function ProductDetailPage() {
  const params = useParams();
  const productId = params.id;

  const [product, setProduct] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchProductPurchases = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch(`/api/products/${productId}/purchases`);
      if (!response.ok) {
        if (response.status === 404) {
          setNotFound(true);
        } else {
          setFetchError('查詢失敗：伺服器錯誤，請稍後再試');
        }
        setLoading(false);
        return;
      }
      const data = await response.json();
      setProduct(data.product);
      setPurchases(data.purchases || []);
      setLoading(false);
    } catch (err) {
      setFetchError('載入失敗：' + (err.message || '請稍後再試'));
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchProductPurchases();
  }, [fetchProductPurchases]);

  // 計算統計數據
  const totalQuantity = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalAmount = purchases.reduce((sum, p) => sum + p.subtotal, 0);
  const avgUnitPrice = purchases.length > 0
    ? (totalAmount / totalQuantity).toFixed(2)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-blue-500" />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-20 text-gray-500">載入中...</div>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation borderColor="border-blue-500" />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-20">
            <p className="text-red-500 text-lg mb-4">找不到此產品</p>
            <Link href="/products" className="text-blue-600 hover:underline">
              返回產品列表
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation borderColor="border-blue-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {fetchError && <FetchErrorBanner message={fetchError} onRetry={fetchProductPurchases} />}
        {/* 返回按鈕與標題 */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/products"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            返回產品列表
          </Link>
          <h2 className="text-2xl font-bold">產品詳情</h2>
        </div>

        {/* 產品基本資訊 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">基本資訊</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-sm text-gray-500">產品編碼</span>
              <p className="font-medium">{product.code}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">產品名稱</span>
              <p className="font-medium">{product.name}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">類別</span>
              <p className="font-medium">{product.category || '-'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">單位</span>
              <p className="font-medium">{product.unit || '-'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">成本價</span>
              <p className="font-medium">NT$ {product.costPrice}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">數量</span>
              <p className="font-medium">{product.salesPrice}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">列入庫存</span>
              <p className="font-medium">{product.isInStock ? '是' : '否'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">倉庫位置</span>
              <p className="font-medium">{product.warehouseLocation || '-'}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">會計科目</span>
              <p className="font-medium">{product.accountingSubject || '-'}</p>
            </div>
          </div>
        </div>

        {/* 採購統計摘要 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">採購次數</p>
            <p className="text-2xl font-bold text-blue-600">{purchases.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">總採購數量</p>
            <p className="text-2xl font-bold text-green-600">{totalQuantity}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">總採購金額</p>
            <p className="text-2xl font-bold text-orange-600">NT$ {totalAmount.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">平均單價</p>
            <p className="text-2xl font-bold text-purple-600">NT$ {avgUnitPrice}</p>
          </div>
        </div>

        {/* 採購記錄表格 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">採購記錄</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">進貨單號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">廠商</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">館別</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">部門</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">數量</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">單價</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">小計</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">備註</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                    尚無採購記錄
                  </td>
                </tr>
              ) : (
                purchases.map((record, index) => (
                  <tr key={record.purchaseId + '-' + index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-mono">{record.purchaseNo}</td>
                    <td className="px-4 py-3 text-sm">{record.purchaseDate}</td>
                    <td className="px-4 py-3 text-sm">{record.supplierName}</td>
                    <td className="px-4 py-3 text-sm">{record.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-sm">{record.department || '-'}</td>
                    <td className="px-4 py-3 text-sm">{record.quantity}</td>
                    <td className="px-4 py-3 text-sm">NT$ {record.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-blue-600">NT$ {record.subtotal.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{record.note || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        record.status === '已入庫' ? 'bg-green-100 text-green-800' :
                        record.status === '待入庫' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {record.status}
                      </span>
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
