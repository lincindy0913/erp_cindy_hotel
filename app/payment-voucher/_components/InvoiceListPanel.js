'use client';

import Link from 'next/link';

export default function InvoiceListPanel({ loading, filteredInvoices, getSupplierName }) {
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 sticky top-0 z-10">
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
  );
}
