'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { SortableTh } from '@/components/SortableTh';

export default function PaymentOrdersTable({
  // data
  loading,
  sortedDisplayOrders,
  displayOrders,
  activeTab,
  expandedOrders,
  selectedOrderIds,
  highlightOrderNo,
  batchSubmitting,
  submittingOrderId,
  isLoggedIn,
  cashAccounts,
  allInvoices,
  // sort
  finSortKey,
  finSortDir,
  toggleFinSort,
  // handlers
  handleOrderToggle,
  handleSelectAllOrders,
  handleBatchSubmitToCashier,
  handleViewDetails,
  handleSubmitToCashier,
  handleVoid,
  handleDelete,
  handleResubmit,
  getStatusBadge,
  getDisplayOrders,
  getInvoicesForOrder,
  getInvoiceDetails,
  getSupplierName,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm tbl-wrap">
      {/* 批量操作列：草稿/已拒絕 有勾選時顯示 */}
      {selectedOrderIds.size > 0 && (activeTab === 'draft' || activeTab === 'rejected') && (
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between">
          <span className="text-sm text-indigo-800">
            已勾選 <strong>{selectedOrderIds.size}</strong> 筆付款單
          </span>
          <button
            type="button"
            onClick={handleBatchSubmitToCashier}
            disabled={batchSubmitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
          >
            {batchSubmitting ? '提交中…' : '批量提交出納'}
          </button>
        </div>
      )}
      <table className="w-full">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            {(activeTab === 'draft' || activeTab === 'rejected') && (
              <th className="px-3 py-3 text-left text-sm font-medium text-gray-700 w-12">
                <input
                  type="checkbox"
                  checked={
                    getDisplayOrders().filter(o => o.status === '草稿' || o.status === '已拒絕').length > 0 &&
                    selectedOrderIds.size === getDisplayOrders().filter(o => o.status === '草稿' || o.status === '已拒絕').length
                  }
                  onChange={handleSelectAllOrders}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
            )}
            <SortableTh label="付款單號" colKey="orderNo" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <SortableTh label="廠商" colKey="supplierName" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <SortableTh label="館別" colKey="warehouse" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <SortableTh label="付款方式" colKey="paymentMethod" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <SortableTh label="發票數" colKey="invoiceCount" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <SortableTh label="折讓" colKey="discount" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" align="right" />
            <SortableTh label="淨額" colKey="netAmount" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" align="right" />
            <SortableTh label="狀態" colKey="status" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <SortableTh label="建立日期" colKey="createdAt" sortKey={finSortKey} sortDir={finSortDir} onSort={toggleFinSort} className="px-4 py-3" />
            <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan={(activeTab === 'draft' || activeTab === 'rejected') ? 11 : 10} className="px-4 py-8 text-center text-gray-500">載入中...</td>
            </tr>
          ) : displayOrders.length === 0 ? (
            <tr>
              <td colSpan={(activeTab === 'draft' || activeTab === 'rejected') ? 11 : 10} className="px-4 py-8 text-center text-gray-500">
                {activeTab === 'draft' ? '目前無草稿付款單' :
                 activeTab === 'pending' ? '目前無待出納的付款單' :
                 activeTab === 'executed' ? '目前無已執行的付款單' :
                 '目前無已拒絕的付款單'}
              </td>
            </tr>
          ) : (
            sortedDisplayOrders.map((order, index) => {
              const invoiceIds = getInvoicesForOrder(order);
              const isExpanded = expandedOrders.has(order.id);
              return (
                <Fragment key={order.id}>
                  <tr
                    id={`order-row-${order.id}`}
                    style={order.orderNo === highlightOrderNo
                      ? { background: '#fef3c7', boxShadow: 'inset 0 0 0 2px #f59e0b' }
                      : undefined}
                    className={`${order.orderNo === highlightOrderNo ? '' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 transition-colors`}
                  >
                    {(activeTab === 'draft' || activeTab === 'rejected') && (
                      <td className="px-3 py-3">
                        {(order.status === '草稿' || order.status === '已拒絕') ? (
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.has(order.id)}
                            onChange={() => handleOrderToggle(order.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="w-4 inline-block" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm font-medium text-indigo-700">{order.orderNo}</td>
                    <td className="px-4 py-3 text-sm">{order.supplierName || '-'}</td>
                    <td className="px-4 py-3 text-sm">{order.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-sm">{order.paymentMethod}</td>
                    <td className="px-4 py-3 text-sm">{invoiceIds.length} 張</td>
                    <td className="px-4 py-3 text-sm text-right">{order.discount > 0 ? `NT$ ${Number(order.discount).toLocaleString()}` : '-'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">NT$ {Number(order.netAmount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap gap-1 justify-center">
                        <button
                          onClick={() => handleViewDetails(order.id)}
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          {isExpanded ? '收起' : '查看'}
                        </button>
                        {order.status === '草稿' && isLoggedIn && (
                          <>
                            <button
                              onClick={() => handleSubmitToCashier(order.id)}
                              disabled={submittingOrderId === order.id}
                              className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs hover:bg-yellow-600 disabled:opacity-50"
                            >
                              {submittingOrderId === order.id ? '提交中…' : '提交出納'}
                            </button>
                            <button
                              onClick={() => handleVoid(order.id)}
                              className="text-gray-500 hover:underline text-xs"
                            >
                              作廢
                            </button>
                            <button
                              onClick={() => handleDelete(order.id)}
                              className="text-red-600 hover:underline text-xs"
                            >
                              刪除
                            </button>
                          </>
                        )}
                        {order.status === '待出納' && isLoggedIn && (
                          <button
                            onClick={() => handleVoid(order.id)}
                            className="text-gray-500 hover:underline text-xs"
                          >
                            作廢
                          </button>
                        )}
                        {order.status === '已拒絕' && isLoggedIn && (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">已拒絕，請修改後重新送出</span>
                        )}
                        {order.status === '已拒絕' && isLoggedIn && (
                          <>
                            <button
                              onClick={() => handleResubmit(order.id)}
                              disabled={submittingOrderId === order.id}
                              className="bg-yellow-500 text-white px-2 py-0.5 rounded text-xs hover:bg-yellow-600 disabled:opacity-50"
                            >
                              {submittingOrderId === order.id ? '提交中…' : '重新提交'}
                            </button>
                            <button
                              onClick={() => handleVoid(order.id)}
                              className="text-gray-500 hover:underline text-xs"
                            >
                              作廢
                            </button>
                            <button
                              onClick={() => handleDelete(order.id)}
                              className="text-red-600 hover:underline text-xs"
                            >
                              刪除
                            </button>
                          </>
                        )}
                        {order.status === '已執行' && order.executions?.[0] && (
                          <span className="text-xs text-gray-500">{order.executions[0].executionNo}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* 展開的詳細資訊 */}
                  {isExpanded && (
                    <tr
                      style={order.orderNo === highlightOrderNo ? { background: '#fffbeb', boxShadow: 'inset 0 0 0 2px #f59e0b' } : undefined}
                      className={order.orderNo === highlightOrderNo ? '' : 'bg-indigo-50'}
                    >
                      <td colSpan={(activeTab === 'draft' || activeTab === 'rejected') ? 11 : 10} className="px-4 py-4">
                        <div className="space-y-4">
                          {/* 已拒絕：顯示退回提示（退回原因由下方紅色區塊顯示） */}
                          {order.status === '已拒絕' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <div className="text-sm font-semibold text-amber-800 mb-1">付款單已被拒絕</div>
                              <p className="text-xs text-amber-600">請修改資料後，點擊「重新送出」即會回到出納待執行列表。</p>
                            </div>
                          )}
                          {/* 拒絕原因（已拒絕狀態，若有） */}
                          {order.status === '已拒絕' && order.rejectedReason && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="text-sm font-semibold text-red-700 mb-1">退回原因</div>
                              <div className="text-sm text-red-600">{order.rejectedReason}</div>
                              {order.rejectedBy && (
                                <div className="text-xs text-red-400 mt-1">退回人：{order.rejectedBy} | {order.rejectedAt ? new Date(order.rejectedAt).toLocaleString('zh-TW') : ''}</div>
                              )}
                            </div>
                          )}

                          {/* 追蹤鏈 (traceability chain) - 顯示於已執行的付款單 */}
                          {order.status === '已執行' && order.executions?.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="text-sm font-semibold text-green-700 mb-2">追蹤鏈</div>
                              <div className="flex items-center gap-2 flex-wrap text-sm">
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                  發票: {getInvoicesForOrder(order).map(id => {
                                    const inv = getInvoiceDetails(id);
                                    return inv ? (inv.invoiceNo || inv.salesNo || `#${id}`) : `#${id}`;
                                  }).join(', ')}
                                </span>
                                <span className="text-gray-400">-&gt;</span>
                                <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs">
                                  付款單: {order.orderNo}
                                </span>
                                <span className="text-gray-400">-&gt;</span>
                                <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                  出納單: {order.executions[0].executionNo}
                                </span>
                                {order.executions[0].cashTransactionId && (
                                  <>
                                    <span className="text-gray-400">-&gt;</span>
                                    <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs">
                                      現金流: CF-{order.executions[0].cashTransactionId}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 付款基本資訊 */}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-4 border-b border-gray-300">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">付款單號</div>
                              <div className={`text-sm font-semibold ${order.orderNo === highlightOrderNo ? 'text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded' : ''}`}>{order.orderNo}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">廠商</div>
                              <div className="text-sm font-semibold">{order.supplierName || '-'}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">付款方式</div>
                              <div className="text-sm font-semibold">{order.paymentMethod}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">發票數量</div>
                              <div className="text-sm font-semibold">{invoiceIds.length} 張</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">狀態</div>
                              <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadge(order.status)}`}>
                                {order.status}
                              </span>
                            </div>
                          </div>

                          {/* 金額資訊 */}
                          <div className="pb-4 border-b border-gray-300">
                            <div className="grid grid-cols-3 gap-4">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">發票總額</div>
                                <div className="text-lg font-semibold">
                                  NT$ {Number(order.amount).toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">會計折讓</div>
                                <div className="text-lg font-semibold">
                                  {order.discount > 0 ? `NT$ ${Number(order.discount).toLocaleString()}` : '-'}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">應付淨額</div>
                                <div className="text-2xl font-bold text-indigo-600">
                                  NT$ {Number(order.netAmount).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 付款資訊 */}
                          <div className="pb-4 border-b border-gray-300">
                            <div className="text-sm font-semibold mb-3 text-gray-700">付款資訊</div>
                            {order.paymentMethod === '支票' ? (
                              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                                <p className="text-sm text-amber-700">
                                  支票付款 — 請至
                                  <Link href="/checks" className="text-indigo-600 hover:underline font-semibold mx-1">支票管理</Link>
                                  頁面查看支票詳情與兌現狀態
                                </p>
                                {order.checkNo && (
                                  <p className="text-sm text-gray-600 mt-1">關聯支票號碼：{order.checkNo}</p>
                                )}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {order.dueDate && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">付款日期</div>
                                    <div className="text-sm font-semibold">{order.dueDate}</div>
                                  </div>
                                )}
                                {order.accountId && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">付款帳戶</div>
                                    <div className="text-sm font-semibold">
                                      {(() => {
                                        const acc = cashAccounts.find(a => a.id === order.accountId);
                                        return acc ? `${acc.name}${acc.warehouse ? ` (${acc.warehouse})` : ''}` : `帳戶 #${order.accountId}`;
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {order.note && (
                              <div className="mt-3">
                                <div className="text-xs text-gray-500 mb-1">備註</div>
                                <div className="text-sm">{order.note}</div>
                              </div>
                            )}
                          </div>

                          {/* 出納執行資訊 */}
                          {order.executions?.length > 0 && (
                            <div className="pb-4 border-b border-gray-300">
                              <div className="text-sm font-semibold mb-3 text-gray-700">出納執行記錄</div>
                              {order.executions.map(exec => (
                                <div key={exec.id} className="bg-white rounded border p-3 text-sm">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                      <div className="text-xs text-gray-500">執行單號</div>
                                      <div className="font-medium">{exec.executionNo}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-gray-500">執行日期</div>
                                      <div>{exec.executionDate}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-gray-500">實付金額</div>
                                      <div className="font-medium">NT$ {Number(exec.actualAmount).toLocaleString()}</div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-gray-500">執行人</div>
                                      <div>{exec.executedBy || '-'}</div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 支付發票列表 */}
                          {invoiceIds.length > 0 && (
                            <div>
                              <div className="flex justify-between items-center mb-3">
                                <div className="text-sm font-semibold text-gray-700">支付的發票詳情（共 {invoiceIds.length} 張）</div>
                                <div className="flex gap-2">
                                  <Link
                                    href={`/payment-voucher/${order.id}`}
                                    target="_blank"
                                    className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                                  >
                                    列印傳票
                                  </Link>
                                </div>
                              </div>
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-100 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">序號</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">發票號</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">發票日期</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">廠商</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">管別</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">小計</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">稅額</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">總金額</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 bg-white">
                                    {invoiceIds.map((invoiceId, idx) => {
                                      const invoice = getInvoiceDetails(invoiceId);
                                      if (!invoice) {
                                        return (
                                          <tr key={idx} className="hover:bg-gray-50">
                                            <td colSpan="8" className="px-3 py-2 text-gray-500 text-center">
                                              發票 ID {invoiceId} 不存在
                                            </td>
                                          </tr>
                                        );
                                      }
                                      const amount = parseFloat(invoice.amount || 0);
                                      const tax = parseFloat(invoice.tax || 0);
                                      const totalAmount = parseFloat(invoice.totalAmount || amount + tax);

                                      let supplierId = invoice.supplierId || null;
                                      let warehouse = invoice.warehouse || '-';

                                      if (!supplierId && invoice.items && invoice.items.length > 0) {
                                        supplierId = invoice.items[0].supplierId;
                                      }

                                      const supplierName = supplierId ? getSupplierName(supplierId) : '未知廠商';

                                      return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                          <td className="px-3 py-2 font-medium">{invoice.invoiceNo || invoice.salesNo || '-'}</td>
                                          <td className="px-3 py-2 text-gray-600">{invoice.invoiceDate || invoice.salesDate || '-'}</td>
                                          <td className="px-3 py-2">{supplierName}</td>
                                          <td className="px-3 py-2">{warehouse}</td>
                                          <td className="px-3 py-2 text-right">NT$ {amount.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right">NT$ {tax.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right font-semibold">NT$ {totalAmount.toFixed(2)}</td>
                                        </tr>
                                      );
                                    })}
                                    {/* 總計列 */}
                                    <tr className="bg-gray-100 font-semibold">
                                      <td colSpan="5" className="px-3 py-2 text-right">總計：</td>
                                      <td className="px-3 py-2 text-right">
                                        NT$ {invoiceIds.reduce((sum, invoiceId) => {
                                          const invoice = getInvoiceDetails(invoiceId);
                                          if (!invoice) return sum;
                                          return sum + parseFloat(invoice.amount || 0);
                                        }, 0).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        NT$ {invoiceIds.reduce((sum, invoiceId) => {
                                          const invoice = getInvoiceDetails(invoiceId);
                                          if (!invoice) return sum;
                                          return sum + parseFloat(invoice.tax || 0);
                                        }, 0).toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-indigo-600">
                                        NT$ {Number(order.netAmount).toLocaleString()}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
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
  );
}
