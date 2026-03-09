'use client';

import { useState, useEffect, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';

export default function CashierPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('pending');
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [rejectingOrderId, setRejectingOrderId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [executeData, setExecuteData] = useState({
    executionDate: new Date().toISOString().split('T')[0],
    actualAmount: 0,
    accountId: '',
    paymentMethod: '',
    note: '',
  });
  const [executionResults, setExecutionResults] = useState({});

  // Batch selection
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [batchAccountId, setBatchAccountId] = useState('');
  const [batchExecutionDate, setBatchExecutionDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchNote, setBatchNote] = useState('');
  const [batchExecuting, setBatchExecuting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchOrders(), fetchAccounts()]);
    setLoading(false);
  }

  async function fetchOrders() {
    try {
      const res = await fetch('/api/payment-orders');
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
  }

  async function fetchAccounts() {
    try {
      const res = await fetch('/api/cashflow/accounts');
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch { setAccounts([]); }
  }

  const pendingOrders = orders.filter(o => o.status === '待出納');
  const executedOrders = orders.filter(o => o.status === '已執行');
  const rejectedOrders = orders.filter(o => o.status === '已拒絕');

  function toggleExpand(order) {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      setRejectingOrderId(null);
    } else {
      setExpandedOrderId(order.id);
      setRejectingOrderId(null);
      setRejectReason('');
      setExecuteData({
        executionDate: new Date().toISOString().split('T')[0],
        actualAmount: order.netAmount,
        accountId: order.accountId?.toString() || '',
        paymentMethod: order.paymentMethod,
        note: '',
      });
    }
  }

  // Batch selection handlers
  function handleToggleSelect(orderId) {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrderIds(newSelected);
  }

  function handleSelectAll() {
    if (selectedOrderIds.size === pendingOrders.length && pendingOrders.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(pendingOrders.map(o => o.id)));
    }
  }

  const selectedOrders = pendingOrders.filter(o => selectedOrderIds.has(o.id));
  const selectedTotal = selectedOrders.reduce((sum, o) => sum + Number(o.netAmount), 0);

  // Group selected orders by payment method for summary
  const selectedByMethod = {};
  selectedOrders.forEach(o => {
    const method = o.paymentMethod || '未指定';
    if (!selectedByMethod[method]) selectedByMethod[method] = { count: 0, total: 0, orders: [] };
    selectedByMethod[method].count++;
    selectedByMethod[method].total += Number(o.netAmount);
    selectedByMethod[method].orders.push(o);
  });

  async function handleBatchExecute() {
    if (selectedOrderIds.size === 0) {
      alert('請至少勾選一筆付款單');
      return;
    }
    if (!batchAccountId) {
      alert('請選擇付款帳戶');
      return;
    }

    const confirmMsg = `確定要批次執行 ${selectedOrderIds.size} 筆付款單？\n總金額：NT$ ${selectedTotal.toLocaleString()}`;
    if (!confirm(confirmMsg)) return;

    setBatchExecuting(true);
    const results = [];
    const errors = [];

    for (const order of selectedOrders) {
      try {
        const res = await fetch('/api/cashier/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentOrderId: order.id,
            executionDate: batchExecutionDate,
            actualAmount: Number(order.netAmount),
            accountId: batchAccountId,
            paymentMethod: order.paymentMethod,
            note: batchNote || `批次執行`,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          results.push({ orderNo: order.orderNo, ...result });
          setExecutionResults(prev => ({
            ...prev,
            [order.id]: {
              executionNo: result.executionNo,
              cashTransactionNo: result.cashTransactionNo,
            }
          }));
        } else {
          const err = await res.json();
          errors.push({ orderNo: order.orderNo, error: err.error || err.message || '執行失敗' });
        }
      } catch {
        errors.push({ orderNo: order.orderNo, error: '網路錯誤' });
      }
    }

    setBatchExecuting(false);
    setSelectedOrderIds(new Set());

    let msg = `批次執行完成！\n成功：${results.length} 筆`;
    if (errors.length > 0) {
      msg += `\n失敗：${errors.length} 筆`;
      errors.forEach(e => { msg += `\n  - ${e.orderNo}: ${e.error}`; });
    }
    alert(msg);
    fetchOrders();
  }

  async function handleExecute(e, order) {
    e.preventDefault();
    if (!executeData.accountId) {
      alert('請選擇付款帳戶');
      return;
    }

    try {
      const res = await fetch('/api/cashier/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentOrderId: order.id,
          ...executeData,
          actualAmount: parseFloat(executeData.actualAmount),
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setExecutionResults(prev => ({
          ...prev,
          [order.id]: {
            executionNo: result.executionNo,
            cashTransactionNo: result.cashTransactionNo,
          }
        }));
        alert(`出納確認成功！\n執行單號：${result.executionNo}\n現金交易：${result.cashTransactionNo}`);
        setExpandedOrderId(null);
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || err.message || '執行失敗');
      }
    } catch {
      alert('操作失敗');
    }
  }

  async function handleReject(order) {
    if (!rejectReason.trim()) {
      alert('請輸入退回原因');
      return;
    }

    try {
      const res = await fetch(`/api/payment-orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason.trim() }),
      });
      if (res.ok) {
        alert('付款單已退回');
        setExpandedOrderId(null);
        setRejectingOrderId(null);
        setRejectReason('');
        fetchOrders();
      } else {
        const err = await res.json();
        alert(err.error || err.message || '退回失敗');
      }
    } catch {
      alert('操作失敗');
    }
  }

  const TABS = [
    { key: 'pending', label: `待執行 (${pendingOrders.length})` },
    { key: 'executed', label: `已執行 (${executedOrders.length})` },
    { key: 'rejected', label: `已退回 (${rejectedOrders.length})` },
  ];

  function getDisplayOrders() {
    switch (activeTab) {
      case 'pending': return pendingOrders;
      case 'executed': return executedOrders;
      case 'rejected': return rejectedOrders;
      default: return pendingOrders;
    }
  }

  const displayOrders = getDisplayOrders();
  const isPendingTab = activeTab === 'pending';

  return (
    <div className="min-h-screen page-bg-cashier">
      <Navigation borderColor="border-amber-600" />
      <NotificationBanner moduleFilter="cashier" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-amber-800 mb-6">出納作業</h2>

        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-amber-500">
            <p className="text-sm text-gray-500">待執行</p>
            <p className="text-2xl font-bold text-amber-700">{pendingOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">已執行</p>
            <p className="text-2xl font-bold text-green-700">{executedOrders.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">待執行總額</p>
            <p className="text-2xl font-bold text-blue-700">
              NT$ {pendingOrders.reduce((s, o) => s + o.netAmount, 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map(tab => (
            <button key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedOrderId(null); setSelectedOrderIds(new Set()); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-amber-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-amber-50 border border-gray-200'
              }`}
            >{tab.label}</button>
          ))}
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
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
              <thead className="bg-amber-50 border-b">
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
                  <th className="px-4 py-3 text-left">付款單號</th>
                  <th className="px-4 py-3 text-left">廠商</th>
                  <th className="px-4 py-3 text-left">館別</th>
                  <th className="px-4 py-3 text-left">付款方式</th>
                  <th className="px-4 py-3 text-right">金額</th>
                  <th className="px-4 py-3 text-left">建立日期</th>
                  <th className="px-4 py-3 text-left">狀態</th>
                  <th className="px-4 py-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {displayOrders.map(order => {
                  const isExpanded = expandedOrderId === order.id;
                  const exec = order.executions?.[0];
                  const storedResult = executionResults[order.id];
                  const isSelected = selectedOrderIds.has(order.id);
                  const colSpan = isPendingTab ? 9 : 8;

                  return (
                    <Fragment key={order.id}>
                      <tr className={`border-b hover:bg-amber-50 transition-colors cursor-pointer ${isExpanded ? 'bg-amber-50' : ''} ${isSelected ? 'bg-amber-50/70' : ''}`}
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
                        <td className="px-4 py-3 font-medium text-amber-800">{order.orderNo}</td>
                        <td className="px-4 py-3">{order.supplierName || '-'}</td>
                        <td className="px-4 py-3">{order.warehouse || '-'}</td>
                        <td className="px-4 py-3">{order.paymentMethod}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          NT$ {Number(order.netAmount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            order.status === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === '已執行' ? 'bg-green-100 text-green-800' :
                            order.status === '已拒絕' ? 'bg-red-100 text-red-800' :
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
                                    <div className="font-semibold">{order.orderNo}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">廠商</div>
                                    <div className="font-semibold">{order.supplierName || '-'}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">付款方式</div>
                                    <div className="font-semibold">{order.paymentMethod}</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">應付金額</div>
                                    <div className="font-bold text-lg text-amber-700">NT$ {Number(order.netAmount).toLocaleString()}</div>
                                  </div>
                                </div>
                                {order.checkNo && (
                                  <div className="mt-2 text-sm text-gray-600">
                                    支票號碼: {order.checkNo} | 開票賬戶: {order.checkAccount || '-'}
                                  </div>
                                )}
                                {order.note && (
                                  <div className="mt-2 text-sm text-gray-500">備註: {order.note}</div>
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
                                      付款單: {order.orderNo}
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

                                  <form onSubmit={(e) => handleExecute(e, order)} className="space-y-3">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">執行日期</label>
                                        <input type="date" value={executeData.executionDate}
                                          onChange={e => setExecuteData({...executeData, executionDate: e.target.value})}
                                          className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">實付金額</label>
                                        <input type="number" step="0.01" value={executeData.actualAmount}
                                          onChange={e => setExecuteData({...executeData, actualAmount: e.target.value})}
                                          className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">付款帳戶 *</label>
                                        <select value={executeData.accountId}
                                          onChange={e => setExecuteData({...executeData, accountId: e.target.value})}
                                          className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" required>
                                          <option value="">-- 選擇帳戶 --</option>
                                          {accounts.filter(a => a.isActive).map(a => (
                                            <option key={a.id} value={a.id}>
                                              {a.name} ({a.type}) - NT$ {Number(a.currentBalance).toLocaleString()}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">執行付款方式</label>
                                        <select value={executeData.paymentMethod}
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
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">備註</label>
                                      <input type="text" value={executeData.note}
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
                                          className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 font-medium">
                                          確認執行
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

        {/* Batch Execution Panel - only show on pending tab when items selected */}
        {isPendingTab && selectedOrderIds.size > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow border-2 border-amber-400 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-amber-800">
                批次執行（已選 {selectedOrderIds.size} 筆）
              </h3>
              <div className="text-right">
                <span className="text-sm text-gray-500">總金額</span>
                <span className="text-2xl font-bold text-amber-700 ml-2">NT$ {selectedTotal.toLocaleString()}</span>
              </div>
            </div>

            {/* Selected orders summary by payment method */}
            <div className="mb-4 bg-amber-50 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">依付款方式分類</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(selectedByMethod).map(([method, info]) => (
                  <div key={method} className="bg-white rounded-lg border p-3">
                    <div className="text-xs text-gray-500">{method}</div>
                    <div className="font-bold text-amber-700">NT$ {info.total.toLocaleString()}</div>
                    <div className="text-xs text-gray-400">{info.count} 筆</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected orders detail list */}
            <div className="mb-4 border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款單號</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">廠商</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款方式</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedOrders.map(o => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 font-medium text-amber-800">{o.orderNo}</td>
                      <td className="px-3 py-2">{o.supplierName || '-'}</td>
                      <td className="px-3 py-2">{o.paymentMethod}</td>
                      <td className="px-3 py-2 text-right font-medium">NT$ {Number(o.netAmount).toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 font-bold">
                    <td colSpan="3" className="px-3 py-2 text-right">合計</td>
                    <td className="px-3 py-2 text-right text-amber-700">NT$ {selectedTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Batch execution form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">執行日期</label>
                <input type="date" value={batchExecutionDate}
                  onChange={e => setBatchExecutionDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">付款帳戶 *</label>
                <select value={batchAccountId}
                  onChange={e => setBatchAccountId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" required>
                  <option value="">-- 選擇帳戶 --</option>
                  {accounts.filter(a => a.isActive).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type}) - 餘額 NT$ {Number(a.currentBalance).toLocaleString()}
                    </option>
                  ))}
                </select>
                {batchAccountId && (() => {
                  const acct = accounts.find(a => a.id === parseInt(batchAccountId));
                  if (acct) {
                    const remaining = Number(acct.currentBalance) - selectedTotal;
                    return (
                      <p className={`text-xs mt-1 ${remaining < 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        執行後餘額：NT$ {remaining.toLocaleString()}
                        {remaining < 0 && ' (餘額不足！)'}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <input type="text" value={batchNote}
                  onChange={e => setBatchNote(e.target.value)}
                  placeholder="選填..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSelectedOrderIds(new Set())}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消選取
              </button>
              <button
                onClick={handleBatchExecute}
                disabled={batchExecuting || !batchAccountId}
                className={`px-6 py-2 rounded-lg text-sm font-medium ${
                  batchExecuting || !batchAccountId
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {batchExecuting ? '執行中...' : `批次確認執行 (${selectedOrderIds.size} 筆)`}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
