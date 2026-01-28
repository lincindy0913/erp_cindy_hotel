'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PaymentVoucherPage() {
  const params = useParams();
  const invoiceId = params?.invoiceId ? parseInt(params.invoiceId) : null;
  
  const [voucherData, setVoucherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (invoiceId) {
      fetchVoucherData();
    } else {
      setError('缺少發票ID');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function fetchVoucherData() {
    try {
      setLoading(true);
      const response = await fetch(`/api/payment-voucher/${invoiceId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '取得傳票資料失敗');
      }
      
      const data = await response.json();
      setVoucherData(data);
      setError(null);
    } catch (err) {
      console.error('取得傳票資料失敗:', err);
      setError(err.message || '取得傳票資料失敗');
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="min-h-screen page-bg-finance flex items-center justify-center">
        <p className="text-gray-600">載入中...</p>
      </div>
    );
  }

  if (error || !voucherData) {
    return (
      <div className="min-h-screen page-bg-finance flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '找不到傳票資料'}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/sales" className="link-sales">
              返回發票列表
            </Link>
            <Link href="/finance" className="link-finance">
              返回付款頁面
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 導航欄（列印時隱藏） */}
      <nav className="bg-white shadow-lg border-b-4 border-indigo-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">📦 進銷存系統</h1>
            <div className="flex gap-4">
              <button
                onClick={handlePrint}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                🖨️ 列印
              </button>
              <Link
                href="/sales"
                className="link-sales"
              >
                返回發票列表
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 傳票內容 */}
      <div className="max-w-4xl mx-auto p-8 print:p-4">
        {/* 標題 */}
        <div className="text-center mb-8 print:mb-4">
          <h2 className="text-3xl font-bold mb-2">付款傳票</h2>
          <p className="text-gray-600">Payment Voucher</p>
        </div>

        {/* 上半部：基本資料 */}
        <div className="border-2 border-gray-800 rounded-lg p-6 mb-6 print:mb-4">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="text-sm text-gray-600 mb-1">廠商</div>
              <div className="text-lg font-semibold">{voucherData.supplierName || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">管別</div>
              <div className="text-lg font-semibold">{voucherData.warehouse || '-'}</div>
            </div>
          </div>

          {/* 發票資料 */}
          <div className="border-t border-gray-300 pt-4 mb-4">
            <h3 className="text-lg font-semibold mb-3">發票資料</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">發票號</div>
                <div className="text-base font-medium">{voucherData.invoice.invoiceNo}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">發票日期</div>
                <div className="text-base font-medium">{voucherData.invoice.invoiceDate}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">小計</div>
                <div className="text-base font-medium">NT$ {voucherData.invoice.amount.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">稅額 (5%)</div>
                <div className="text-base font-medium">NT$ {voucherData.invoice.tax.toFixed(2)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-sm text-gray-600 mb-1">總金額</div>
                <div className="text-2xl font-bold text-blue-600">
                  NT$ {voucherData.invoice.totalAmount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* 進貨單資料 */}
          {voucherData.items.length > 0 && (
            <div className="border-t border-gray-300 pt-4">
              <h3 className="text-lg font-semibold mb-3">進貨單資料</h3>
              <div className="space-y-2">
                {Array.from(new Set(voucherData.items.map(item => item.purchaseNo))).map(purchaseNo => (
                  <div key={purchaseNo} className="flex gap-4 text-sm">
                    <span className="font-medium">{purchaseNo}</span>
                    <span className="text-gray-600">
                      {voucherData.items.find(item => item.purchaseNo === purchaseNo)?.purchaseDate || ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 下半部：價格比對 */}
        <div className="border-2 border-gray-800 rounded-lg p-6 print:mb-4">
          <h3 className="text-xl font-bold mb-4 text-center">價格比對表</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-800">
                  <th className="px-3 py-2 text-left text-sm font-semibold border-r border-gray-300">序號</th>
                  <th className="px-3 py-2 text-left text-sm font-semibold border-r border-gray-300">產品代碼</th>
                  <th className="px-3 py-2 text-left text-sm font-semibold border-r border-gray-300">產品名稱</th>
                  <th className="px-3 py-2 text-left text-sm font-semibold border-r border-gray-300">進貨單號</th>
                  <th className="px-3 py-2 text-right text-sm font-semibold border-r border-gray-300">數量</th>
                  <th className="px-3 py-2 text-right text-sm font-semibold border-r border-gray-300">單價</th>
                  <th className="px-3 py-2 text-right text-sm font-semibold">狀態</th>
                </tr>
              </thead>
              <tbody>
                {voucherData.items.map((item, index) => (
                  <tr 
                    key={index} 
                    className={`border-b border-gray-300 ${item.isPriceHigher ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-3 py-2 text-sm border-r border-gray-200">{index + 1}</td>
                    <td className="px-3 py-2 text-sm border-r border-gray-200">{item.productCode}</td>
                    <td className="px-3 py-2 text-sm border-r border-gray-200 font-medium">{item.productName}</td>
                    <td className="px-3 py-2 text-sm border-r border-gray-200">{item.purchaseNo}</td>
                    <td className="px-3 py-2 text-sm text-right border-r border-gray-200">{item.quantity}</td>
                    <td className="px-3 py-2 text-sm text-right border-r border-gray-200">
                      {item.isPriceHigher ? (
                        // 異常時：同時顯示兩個價格
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-red-600">
                            當前 NT$ {item.currentPrice.toFixed(2)}
                            <span className="text-xs text-red-500 ml-1">▲</span>
                          </span>
                          <span className="text-xs text-gray-500 line-through mt-0.5">
                            歷史 NT$ {item.minHistoricalPrice.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        // 正常時：只顯示當前價格
                        <span className="font-medium">
                          NT$ {item.currentPrice.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      {item.isPriceHigher ? (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                          ⚠️ 價格異常
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
                          ✓ 正常
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-800">
                  <td colSpan="5" className="px-3 py-2 text-sm font-semibold text-right">
                    總計：
                  </td>
                  <td className="px-3 py-2 text-sm font-bold text-right border-r border-gray-300">
                    NT$ {voucherData.items.reduce((sum, item) => sum + (item.currentPrice * item.quantity), 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 價格異常說明 */}
          {voucherData.items.some(item => item.isPriceHigher) && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start">
                <span className="text-red-600 text-xl mr-2">⚠️</span>
                <div>
                  <div className="font-semibold text-red-800 mb-1">價格異常提醒</div>
                  <div className="text-sm text-red-700">
                    以下品項的當前價格高於歷史最低價，請注意：
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      {voucherData.items.filter(item => item.isPriceHigher).map((item, idx) => (
                        <li key={idx}>
                          {item.productName}: 當前 NT$ {item.currentPrice.toFixed(2)} / 歷史最低 NT$ {item.minHistoricalPrice.toFixed(2)} 
                          (差額: NT$ {item.priceDifference.toFixed(2)})
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 列印時間 */}
        <div className="text-center text-sm text-gray-500 mt-6 print:mt-4">
          列印時間：{new Date().toLocaleString('zh-TW')}
        </div>
      </div>

      {/* 列印樣式 */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          nav {
            display: none;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  );
}

