'use client';

import { Fragment, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { sortRows, useColumnSort, SortableTh } from '@/components/SortableTh';
import { usePeriodCheck } from '@/lib/hooks/usePeriodCheck';
import { getDisplayOrderNo, getSourceCategory } from '../_hooks/useCashierOrders';

export default function OrdersTab({
  // data
  activeTab,
  displayOrders,
  loading,
  accounts,
  // single-order execution state
  expandedOrderId,
  executeData, setExecuteData,
  executionResults,
  executingOrderId,
  rejectingOrderId, setRejectingOrderId,
  rejectReason, setRejectReason,
  // batch state
  selectedOrderIds,
  pendingOrders,
  // handlers
  toggleExpand,
  handleExecute,
  handleReject,
  handleToggleSelect,
  handleSelectAll,
  // search filter
  searchFilter,
  // deep-link highlight
  highlightOrderNo,
}) {
  const { data: session } = useSession();
  const isPendingTab = activeTab === 'pending';

  const { sortKey: cashSortKey, sortDir: cashSortDir, toggleSort: toggleCashSort } = useColumnSort('createdAt', 'desc');

  const sortedCashierOrders = useMemo(
    () =>
      sortRows(displayOrders, cashSortKey, cashSortDir, {
        orderNo: (o) => getDisplayOrderNo(o),
        sourceType: (o) => getSourceCategory(o.sourceType, o),
        supplierName: (o) => o.supplierName || '',
        warehouse: (o) => o.warehouse || '',
        paymentMethod: (o) => o.paymentMethod || '',
        netAmount: (o) => Number(o.netAmount || 0),
        summary: (o) => o.summary || '',
        note: (o) => o.note || '',
        createdAt: (o) => o.createdAt || '',
        status: (o) => o.status || (o.executions?.[0] ? '已執行' : ''),
      }),
    [displayOrders, cashSortKey, cashSortDir]
  );

  const expandedOrder = pendingOrders.find(o => o.id === expandedOrderId) || null;
  const { locked: execLocked, status: execLockStatus } = usePeriodCheck(executeData.executionDate, expandedOrder?.warehouse || null);

  return (
    <div className="bg-white rounded-lg shadow tbl-wrap">
      {!loading && displayOrders.length > 0 && (
        <div className="px-4 py-2 border-b text-xs text-gray-400 flex items-center gap-2">
          <span>共 {displayOrders.length} 筆</span>
          {searchFilter.sourceType && (
            <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">已套用類別篩選</span>
          )}
        </div>
      )}
      {loading ? (
        <div className="p-8 text-center text-gray-500">載入中...</div>
      ) : displayOrders.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          {activeTab === 'pending' ? '目前無待執行的付款單' :
           activeTab === 'executed' ? '無已執行記錄' :
           '無已退回記錄'}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-amber-50 border-b sticky top-0 z-10">
            <tr>
              {isPendingTab && (
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.size === pendingOrders.length && pendingOrders.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                </th>
              )}
              <SortableTh label="付款單號" colKey="orderNo" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="類別" colKey="sourceType" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="廠商" colKey="supplierName" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="館別" colKey="warehouse" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="付款方式" colKey="paymentMethod" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="金額" colKey="netAmount" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" align="right" />
              <SortableTh label="摘要" colKey="summary" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="備註" colKey="note" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="建立日期" colKey="createdAt" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <SortableTh label="狀態" colKey="status" sortKey={cashSortKey} sortDir={cashSortDir} onSort={toggleCashSort} className="px-4 py-3" />
              <th className="px-4 py-3 text-center whitespace-nowrap text-sm font-medium text-gray-700" style={{ minWidth: '90px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedCashierOrders.map(order => {
              const isExpanded = expandedOrderId === order.id;
              const exec = order.executions?.[0];
              const storedResult = executionResults[order.id];
              const isSelected = selectedOrderIds.has(order.id);
              const colSpan = isPendingTab ? 12 : 11;

              const isHighlighted = highlightOrderNo && order.orderNo === highlightOrderNo;
              return (
                <Fragment key={order.id}>
                  <tr
                    id={`cashier-row-${order.orderNo}`}
                    style={isHighlighted ? { background: '#fef3c7', boxShadow: 'inset 0 0 0 2px #f59e0b' } : undefined}
                    className={`border-b hover:bg-amber-50 transition-colors cursor-pointer ${!isHighlighted && isExpanded ? 'bg-amber-50' : ''} ${!isHighlighted && isSelected ? 'bg-amber-50/70' : ''}`}
                    onClick={() => toggleExpand(order)}>
                    {isPendingTab && (
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(order.id)}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-amber-800">{getDisplayOrderNo(order)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        { '進銷存': 'bg-blue-100 text-blue-700', '固定費用': 'bg-orange-100 text-orange-700', '租屋': 'bg-green-100 text-green-700', '貸款': 'bg-purple-100 text-purple-700', '工程': 'bg-rose-100 text-rose-700' }[getSourceCategory(order.sourceType, order)] || 'bg-gray-100 text-gray-600'
                      }`}>{getSourceCategory(order.sourceType, order)}</span>
                    </td>
                    <td className="px-4 py-3">{order.supplierName || '-'}</td>
                    <td className="px-4 py-3">{order.warehouse || '-'}</td>
                    <td className="px-4 py-3">{order.paymentMethod}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      NT$ {Number(order.netAmount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate" title={order.summary || ''}>{order.summary || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate" title={order.note || ''}>{order.note || '-'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        order.status === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === '已執行' ? 'bg-green-100 text-green-800' :
                        order.status === '已拒絕' ? 'bg-red-100 text-red-800' :
                        order.status === '已代墊' ? 'bg-purple-100 text-purple-800' :
                        order.status === '已退貨' ? 'bg-orange-100 text-orange-800' :
                        order.status === '部分退貨' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>{order.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {order.status === '待出納' && (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => toggleExpand(order)}
                            className="bg-amber-600 text-white px-3 py-1 rounded text-xs hover:bg-amber-700">
                            {isExpanded ? '收起' : '確認執行'}
                          </button>
                        </div>
                      )}
                      {order.status === '已執行' && (
                        <button onClick={() => toggleExpand(order)}
                          className="text-amber-600 hover:underline text-xs">
                          {isExpanded ? '收起' : '查看詳情'}
                        </button>
                      )}
                      {order.status === '已拒絕' && (
                        <button onClick={() => toggleExpand(order)}
                          className="text-amber-600 hover:underline text-xs">
                          {isExpanded ? '收起' : '查看原因'}
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Inline Expansion */}
                  {isExpanded && (
                    <tr className="bg-amber-50/50">
                      <td colSpan={colSpan} className="px-4 py-4">
                        <div className="space-y-4">
                          {/* Order Summary */}
                          <div className="bg-white rounded-lg border p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">付款單號</div>
                                <div className="font-semibold">{getDisplayOrderNo(order)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">廠商</div>
                                <div className="font-semibold">{order.supplierName || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">館別</div>
                                <div className="font-semibold">{order.warehouse || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">付款方式</div>
                                <div className="font-semibold">{order.paymentMethod}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">應付金額</div>
                                <div className="font-bold text-lg text-amber-700">NT$ {Number(order.netAmount).toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">摘要</div>
                                <div className="font-medium text-gray-800">{order.summary || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">備註</div>
                                <div className="text-gray-600">{order.note || '-'}</div>
                              </div>
                            </div>
                            {order.checkNo && (
                              <div className="mt-2 text-sm text-gray-600">
                                支票號碼: {order.checkNo} | 開票賬戶: {order.checkAccount || '-'}
                              </div>
                            )}
                          </div>

                          {/* Rejected info */}
                          {order.status === '已拒絕' && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="text-sm font-semibold text-red-700 mb-1">退回原因</div>
                              <div className="text-sm text-red-600">{order.rejectedReason || '(未提供原因)'}</div>
                              {order.rejectedBy && (
                                <div className="text-xs text-red-400 mt-1">
                                  退回人：{order.rejectedBy} | {order.rejectedAt ? new Date(order.rejectedAt).toLocaleString('zh-TW') : ''}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Traceability chain for executed orders */}
                          {order.status === '已執行' && exec && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                              <div className="text-sm font-semibold text-green-700 mb-2">追蹤鏈</div>
                              <div className="flex items-center gap-2 flex-wrap text-sm">
                                <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-medium">
                                  付款單: {getDisplayOrderNo(order)}
                                </span>
                                <span className="text-gray-400">-&gt;</span>
                                <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-medium">
                                  出納單: {exec.executionNo}
                                </span>
                                {(storedResult?.cashTransactionNo || exec.cashTransactionId) && (
                                  <>
                                    <span className="text-gray-400">-&gt;</span>
                                    <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-medium">
                                      現金流: {storedResult?.cashTransactionNo || `CF-${exec.cashTransactionId}`}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <div className="text-xs text-gray-500">執行日期</div>
                                  <div>{exec.executionDate}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">實付金額</div>
                                  <div className="font-medium">NT$ {Number(exec.actualAmount).toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">付款方式</div>
                                  <div>{exec.paymentMethod}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">執行人</div>
                                  <div>{exec.executedBy || '-'}</div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Execute Form - inline for pending orders */}
                          {order.status === '待出納' && (
                            <div className="bg-white border-2 border-amber-300 rounded-lg p-4">
                              <div className="text-sm font-bold text-amber-800 mb-3">出納確認執行</div>

                              {executeData.paymentMethod && executeData.paymentMethod !== order.paymentMethod && (
                                <div className="bg-orange-50 border border-orange-300 rounded p-2 mb-3 text-sm text-orange-700">
                                  注意：執行付款方式（{executeData.paymentMethod}）與付款單指定方式（{order.paymentMethod}）不同
                                </div>
                              )}

                              {/* 職責分離軟性警示 */}
                              {order.createdBy && session?.user?.email &&
                               order.createdBy === session.user.email && (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded p-2 mb-3">
                                  <span className="text-amber-500 text-base shrink-0">⚠</span>
                                  <p className="text-xs text-amber-800">
                                    <strong>職責分離提醒：</strong>此付款單由您本人建立，建議由其他人員執行出納，以符合內部控制原則。
                                  </p>
                                </div>
                              )}

                              <form onSubmit={(e) => handleExecute(e, order)} className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div>
                                    <label htmlFor="f-4" className="block text-xs font-medium text-gray-700 mb-1">執行日期</label>
                                    <input id="f-4" type="date" value={executeData.executionDate}
                                      onChange={e => setExecuteData({...executeData, executionDate: e.target.value})}
                                      className={`w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${execLocked ? 'border-red-400 bg-red-50' : ''}`} required />
                                    {execLocked && (
                                      <p className="mt-1 text-xs text-red-600">
                                        ⚠ 此月份已{execLockStatus}，執行將被擋。請至 <a href="/month-end" className="underline font-medium">月結管理</a> 解鎖。
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <label htmlFor="f-5" className="block text-xs font-medium text-gray-700 mb-1">實付金額</label>
                                    <input id="f-5" type="number" step="0.01" value={executeData.actualAmount}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const isLoan = (order.summary || '').includes('貸款還款');
                                        if (isLoan) {
                                          const extra = Math.max(0, Math.round(((parseFloat(val) || 0) - Number(order.netAmount)) * 100) / 100);
                                          setExecuteData({...executeData, actualAmount: val, extraAmount: extra > 0 ? extra : ''});
                                        } else {
                                          setExecuteData({...executeData, actualAmount: val});
                                        }
                                      }}
                                      className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                                  </div>
                                  {(order.summary || '').includes('貸款還款') && (
                                    <div>
                                      <label htmlFor="f-6" className="block text-xs font-medium text-indigo-700 mb-1">額外預付金額</label>
                                      <input id="f-6" type="number" step="0.01" value={executeData.extraAmount}
                                        onChange={e => {
                                          const extra = parseFloat(e.target.value) || 0;
                                          setExecuteData({...executeData, extraAmount: e.target.value, actualAmount: Number(order.netAmount) + extra});
                                        }}
                                        placeholder="0"
                                        className="w-full border border-indigo-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-indigo-50" />
                                    </div>
                                  )}
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      付款帳戶 *
                                      {order.accountId != null && order.accountId !== '' && (
                                        <span className="ml-1 inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                          ✓ 已從付款單帶入
                                          {String(executeData.accountId) !== String(order.accountId) && (
                                            <span className="text-amber-600 font-normal">（已手動更改）</span>
                                          )}
                                        </span>
                                      )}
                                    </label>
                                    <select value={String(executeData.accountId || '')}
                                      onChange={e => setExecuteData({...executeData, accountId: e.target.value})}
                                      className={`w-full border-2 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none ${
                                        executeData.accountId && String(executeData.accountId) === String(order.accountId)
                                          ? 'border-emerald-400 bg-emerald-50'
                                          : executeData.accountId
                                            ? 'border-amber-400 bg-amber-50'
                                            : 'border-red-300 bg-red-50'
                                      }`}>
                                      <option value="">-- 選擇帳戶 --</option>
                                      {accounts.filter(a => a.isActive).map(a => (
                                        <option key={a.id} value={String(a.id)}>
                                          {String(a.id) === String(order.accountId) ? '✓ ' : ''}{a.name} ({a.type}) - NT$ {Number(a.currentBalance).toLocaleString()}
                                        </option>
                                      ))}
                                    </select>
                                    {order.accountId != null && order.accountId !== '' && String(executeData.accountId) !== String(order.accountId) && executeData.accountId && (
                                      <button type="button"
                                        onClick={() => setExecuteData(prev => ({...prev, accountId: String(order.accountId)}))}
                                        className="mt-1 text-xs text-emerald-700 hover:underline">
                                        ↩ 恢復付款單原帳戶
                                      </button>
                                    )}
                                  </div>
                                  <div>
                                    <label htmlFor="f-17" className="block text-xs font-medium text-gray-700 mb-1">執行付款方式</label>
                                    <select id="f-17" value={executeData.paymentMethod}
                                      onChange={e => setExecuteData({...executeData, paymentMethod: e.target.value})}
                                      className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none">
                                      <option value="現金">現金</option>
                                      <option value="轉帳">轉帳</option>
                                      <option value="支票">支票</option>
                                      <option value="信用卡">信用卡</option>
                                      <option value="月結">月結</option>
                                      <option value="員工代付">員工代付</option>
                                    </select>
                                  </div>
                                </div>
                                {(order.summary || '').includes('貸款還款') && parseFloat(executeData.extraAmount) > 0 && (
                                  <div className="bg-indigo-50 border border-indigo-200 rounded p-2 text-sm text-indigo-800">
                                    付款單金額 NT$ {Number(order.netAmount).toLocaleString()} + 額外預付 NT$ {parseFloat(executeData.extraAmount).toLocaleString()} =
                                    <span className="font-bold ml-1">實付 NT$ {parseFloat(executeData.actualAmount).toLocaleString()}</span>
                                  </div>
                                )}
                                {/* 員工代墊款 */}
                                <div className="border-t pt-3">
                                  <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={executeData.isEmployeeAdvance}
                                      onChange={e => setExecuteData({...executeData, isEmployeeAdvance: e.target.checked})}
                                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                                    <span className="font-medium text-purple-800">此筆為員工代墊款</span>
                                  </label>
                                  {executeData.isEmployeeAdvance && (
                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                      <div>
                                        <label htmlFor="f-7" className="block text-xs font-medium text-purple-700 mb-1">代墊員工 *</label>
                                        <input id="f-7" type="text" value={executeData.advancedBy}
                                          onChange={e => setExecuteData({...executeData, advancedBy: e.target.value})}
                                          placeholder="員工姓名"
                                          className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-purple-50" />
                                      </div>
                                      <div>
                                        <label htmlFor="f-8" className="block text-xs font-medium text-purple-700 mb-1">代墊方式</label>
                                        <select id="f-8" value={executeData.advancePaymentMethod}
                                          onChange={e => setExecuteData({...executeData, advancePaymentMethod: e.target.value})}
                                          className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-purple-50">
                                          <option value="現金">現金</option>
                                          <option value="信用卡">信用卡</option>
                                          <option value="其他">其他</option>
                                        </select>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label htmlFor="f-9" className="block text-xs font-medium text-gray-700 mb-1">備註</label>
                                  <input id="f-9" type="text" value={executeData.note}
                                    onChange={e => setExecuteData({...executeData, note: e.target.value})}
                                    placeholder="選填..."
                                    className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setRejectingOrderId(rejectingOrderId === order.id ? null : order.id)}
                                    className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm hover:bg-red-50"
                                  >
                                    退回付款單
                                  </button>
                                  <div className="flex gap-3">
                                    <button type="button" onClick={() => setExpandedOrderId(null)}
                                      className="px-4 py-2 border rounded text-sm hover:bg-gray-50">取消</button>
                                    <button type="submit"
                                      disabled={executingOrderId === order.id}
                                      className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 font-medium disabled:opacity-50">
                                      {executingOrderId === order.id ? '執行中…' : '確認執行'}
                                    </button>
                                  </div>
                                </div>
                              </form>

                              {rejectingOrderId === order.id && (
                                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                                  <div className="text-sm font-semibold text-red-700 mb-2">退回付款單</div>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={rejectReason}
                                      onChange={e => setRejectReason(e.target.value)}
                                      placeholder="請輸入退回原因..."
                                      className="flex-1 border border-red-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:outline-none"
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleReject(order);
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={() => handleReject(order)}
                                      className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
                                    >
                                      確認退回
                                    </button>
                                    <button
                                      onClick={() => { setRejectingOrderId(null); setRejectReason(''); }}
                                      className="border border-gray-300 px-3 py-2 rounded text-sm hover:bg-gray-50"
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
