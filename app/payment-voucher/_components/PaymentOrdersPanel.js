'use client';

import { Fragment } from 'react';
import Link from 'next/link';

export default function PaymentOrdersPanel({
  loading,
  filteredOrders,
  selectedOrderIds,
  batchPrinting,
  expandedOrderId,
  toggleSelectOrder,
  toggleSelectAll,
  batchPrintVouchers,
  toggleExpand,
  printPaymentVoucher,
  getInvoiceNo,
  getStatusBadge,
}) {
  return (
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
          <thead className="bg-gray-50 sticky top-0 z-10">
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
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link
                          href={`/finance?highlight=${order.orderNo}`}
                          className="text-indigo-700 hover:text-indigo-900 hover:underline"
                          title="在財務付款管理中查看詳細"
                        >
                          {order.orderNo}
                        </Link>
                      </td>
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
  );
}
