'use client';

import { useState, useEffect, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';
import NotificationBanner from '@/components/NotificationBanner';

// Determine the correct display order number based on source
function getDisplayOrderNo(order) {
  // Check payment: show checkNo (PAY-PAY-...)
  if (order.paymentMethod === '支票' && order.checkNo) return order.checkNo;
  // Loan payment: ensure LN- prefix (fix legacy PAY- prefixed loan orders)
  if ((order.summary || '').includes('貸款還款') && order.orderNo.startsWith('PAY-')) {
    return order.orderNo.replace(/^PAY-/, 'LN-');
  }
  return order.orderNo;
}

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
    extraAmount: '',
    accountId: '',
    paymentMethod: '',
    note: '',
    isEmployeeAdvance: false,
    advancedBy: '',
    advancePaymentMethod: '現金',
  });
  const [executionResults, setExecutionResults] = useState({});

  // Batch selection
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [batchAccounts, setBatchAccounts] = useState([{ accountId: '', amount: '' }]);
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
        extraAmount: '',
        accountId: order.accountId?.toString() || '',
        paymentMethod: order.paymentMethod,
        note: '',
        isEmployeeAdvance: false,
        advancedBy: '',
        advancePaymentMethod: '現金',
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

  // Batch accounts helpers
  const batchAccountsTotal = batchAccounts.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const batchAmountDiff = Math.round((selectedTotal - batchAccountsTotal) * 100) / 100;

  async function handleBatchExecute() {
    if (selectedOrderIds.size === 0) {
      alert('請至少勾選一筆付款單');
      return;
    }
    const validAccounts = batchAccounts.filter(a => a.accountId && parseFloat(a.amount) > 0);
    if (validAccounts.length === 0) {
      alert('請新增至少一個資金帳戶並輸入金額');
      return;
    }
    if (Math.abs(batchAmountDiff) > 0.01) {
      alert(`資金帳戶總額 NT$ ${batchAccountsTotal.toLocaleString()} 與付款單總額 NT$ ${selectedTotal.toLocaleString()} 不符，差額 NT$ ${batchAmountDiff.toLocaleString()}`);
      return;
    }

    // Check duplicate accounts
    const accIds = validAccounts.map(a => a.accountId);
    if (new Set(accIds).size !== accIds.length) {
      alert('不可重複選擇相同帳戶');
      return;
    }

    const accountSummary = validAccounts.map(a => {
      const acct = accounts.find(ac => ac.id === parseInt(a.accountId));
      return `${acct?.name || '帳戶'}: NT$ ${parseFloat(a.amount).toLocaleString()}`;
    }).join('\n');

    const confirmMsg = `確定要批次執行 ${selectedOrderIds.size} 筆付款單？\n總金額：NT$ ${selectedTotal.toLocaleString()}\n\n資金來源：\n${accountSummary}`;
    if (!confirm(confirmMsg)) return;

    setBatchExecuting(true);
    try {
      const res = await fetch('/api/cashier/batch-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrderIds),
          accounts: validAccounts.map(a => ({
            accountId: parseInt(a.accountId),
            amount: parseFloat(a.amount),
          })),
          executionDate: batchExecutionDate,
          note: batchNote || '批次執行',
        }),
      });

      let result;
      try {
        result = await res.json();
      } catch {
        alert(`批次執行失敗 (HTTP ${res.status})：伺服器回應無法解析`);
        setBatchExecuting(false);
        return;
      }
      if (res.ok) {
        alert(result.message || '批次執行成功');
        setSelectedOrderIds(new Set());
        setBatchAccounts([{ accountId: '', amount: '' }]);
        fetchOrders();
        fetchAccounts();
      } else {
        const msg = result?.error?.message || result?.error?.details?.message || result?.message || JSON.stringify(result);
        alert(`批次執行失敗：${msg}`);
      }
    } catch (err) {
      console.error('Batch execute error:', err);
      alert('批次執行失敗: ' + (err?.message || String(err)));
    }
    setBatchExecuting(false);
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

  // Report tab state
  const [reportDateFrom, setReportDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [reportDateTo, setReportDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  async function fetchReportData() {
    setReportLoading(true);
    try {
      const res = await fetch('/api/payment-orders');
      const data = await res.json();
      const allOrders = Array.isArray(data) ? data : [];
      // Filter executed orders with execution date in range
      const filtered = allOrders.filter(o => {
        if (o.status !== '已執行') return false;
        const exec = o.executions?.[0];
        if (!exec) return false;
        const execDate = exec.executionDate;
        return execDate >= reportDateFrom && execDate <= reportDateTo;
      });
      // Sort by execution date
      filtered.sort((a, b) => {
        const da = a.executions?.[0]?.executionDate || '';
        const db = b.executions?.[0]?.executionDate || '';
        return da.localeCompare(db);
      });
      setReportData(filtered);
    } catch { setReportData([]); }
    setReportLoading(false);
  }

  // Group report data by payment method
  const reportByMethod = {};
  reportData.forEach(o => {
    const exec = o.executions?.[0];
    const method = exec?.paymentMethod || o.paymentMethod || '未指定';
    if (!reportByMethod[method]) reportByMethod[method] = { count: 0, total: 0 };
    reportByMethod[method].count++;
    reportByMethod[method].total += Number(exec?.actualAmount ?? o.netAmount);
  });
  const reportTotal = reportData.reduce((sum, o) => {
    const exec = o.executions?.[0];
    return sum + Number(exec?.actualAmount ?? o.netAmount);
  }, 0);

  // Group report data by account
  const reportByAccount = {};
  reportData.forEach(o => {
    const exec = o.executions?.[0];
    if (!exec) return;
    const accId = exec.accountId;
    const acct = accounts.find(a => a.id === accId);
    const accName = acct ? `${acct.name} (${acct.type})` : `帳戶#${accId}`;
    if (!reportByAccount[accName]) reportByAccount[accName] = { count: 0, total: 0 };
    reportByAccount[accName].count++;
    reportByAccount[accName].total += Number(exec.actualAmount);
  });

  const TABS = [
    { key: 'pending', label: `待執行 (${pendingOrders.length})` },
    { key: 'executed', label: `已執行 (${executedOrders.length})` },
    { key: 'rejected', label: `已退回 (${rejectedOrders.length})` },
    { key: 'report', label: '出納報表' },
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
        {activeTab !== 'report' && <div className="grid grid-cols-3 gap-4 mb-6">
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
        </div>}

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
        {activeTab !== 'report' && <div className="bg-white rounded-lg shadow overflow-hidden">
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
                  <th className="px-4 py-3 text-left">摘要</th>
                  <th className="px-4 py-3 text-left">備註</th>
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
                  const colSpan = isPendingTab ? 11 : 10;

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
                        <td className="px-4 py-3 font-medium text-amber-800">{getDisplayOrderNo(order)}</td>
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
                                          onChange={e => setExecuteData({...executeData, actualAmount: e.target.value, extraAmount: ''})}
                                          className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" required />
                                      </div>
                                      {(order.summary || '').includes('貸款還款') && (
                                        <div>
                                          <label className="block text-xs font-medium text-indigo-700 mb-1">額外預付金額</label>
                                          <input type="number" step="0.01" value={executeData.extraAmount}
                                            onChange={e => {
                                              const extra = parseFloat(e.target.value) || 0;
                                              setExecuteData({...executeData, extraAmount: e.target.value, actualAmount: Number(order.netAmount) + extra});
                                            }}
                                            placeholder="0"
                                            className="w-full border border-indigo-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-indigo-50" />
                                        </div>
                                      )}
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
                                            <label className="block text-xs font-medium text-purple-700 mb-1">代墊員工 *</label>
                                            <input type="text" value={executeData.advancedBy}
                                              onChange={e => setExecuteData({...executeData, advancedBy: e.target.value})}
                                              placeholder="員工姓名"
                                              className="w-full border border-purple-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none bg-purple-50" />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-purple-700 mb-1">代墊方式</label>
                                            <select value={executeData.advancePaymentMethod}
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
        </div>}

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
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">館別</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">付款方式</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">摘要</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedOrders.map(o => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 font-medium text-amber-800">{getDisplayOrderNo(o)}</td>
                      <td className="px-3 py-2">{o.supplierName || '-'}</td>
                      <td className="px-3 py-2">{o.warehouse || '-'}</td>
                      <td className="px-3 py-2">{o.paymentMethod}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={o.note || ''}>{o.note || '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">NT$ {Number(o.netAmount).toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-amber-50 font-bold">
                    <td colSpan="5" className="px-3 py-2 text-right">合計</td>
                    <td className="px-3 py-2 text-right text-amber-700">NT$ {selectedTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Batch execution form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">執行日期</label>
                <input type="date" value={batchExecutionDate}
                  onChange={e => setBatchExecutionDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <input type="text" value={batchNote}
                  onChange={e => setBatchNote(e.target.value)}
                  placeholder="選填..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
              </div>
            </div>

            {/* Multiple funding accounts */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">資金帳戶 *</label>
                <button type="button"
                  onClick={() => setBatchAccounts(prev => [...prev, { accountId: '', amount: '' }])}
                  className="text-sm text-amber-600 hover:text-amber-800 font-medium">
                  + 新增帳戶
                </button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">帳戶</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-40">支出金額</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-36">帳戶餘額</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-36">執行後餘額</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {batchAccounts.map((ba, idx) => {
                      const acct = ba.accountId ? accounts.find(a => a.id === parseInt(ba.accountId)) : null;
                      const currentBal = acct ? Number(acct.currentBalance) : 0;
                      const payAmount = parseFloat(ba.amount) || 0;
                      const afterBal = currentBal - payAmount;
                      // Already selected account IDs (excluding current row)
                      const usedIds = batchAccounts.filter((_, i) => i !== idx).map(a => a.accountId).filter(Boolean);
                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <select value={ba.accountId}
                              onChange={e => {
                                const newAccounts = [...batchAccounts];
                                newAccounts[idx] = { ...newAccounts[idx], accountId: e.target.value };
                                setBatchAccounts(newAccounts);
                              }}
                              className="w-full border rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none">
                              <option value="">-- 選擇帳戶 --</option>
                              {accounts.filter(a => a.isActive && !usedIds.includes(String(a.id))).map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.type})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.01" min="0"
                              value={ba.amount}
                              onChange={e => {
                                const newAccounts = [...batchAccounts];
                                newAccounts[idx] = { ...newAccounts[idx], amount: e.target.value };
                                setBatchAccounts(newAccounts);
                              }}
                              placeholder="0"
                              className="w-full border rounded px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {acct ? `NT$ ${currentBal.toLocaleString()}` : '-'}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium ${acct && afterBal < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                            {acct ? `NT$ ${afterBal.toLocaleString()}` : '-'}
                            {acct && afterBal < 0 && <span className="text-xs ml-1">(不足)</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {batchAccounts.length > 1 && (
                              <button type="button"
                                onClick={() => setBatchAccounts(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 hover:text-red-600 text-lg leading-none">
                                &times;
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2 text-right">合計</td>
                      <td className="px-3 py-2 text-right">NT$ {batchAccountsTotal.toLocaleString()}</td>
                      <td colSpan="3" className="px-3 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/* Validation message */}
              {batchAccounts.some(a => a.accountId) && (
                <div className={`mt-2 text-sm p-2 rounded ${
                  Math.abs(batchAmountDiff) < 0.01
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {Math.abs(batchAmountDiff) < 0.01
                    ? `資金帳戶合計 NT$ ${batchAccountsTotal.toLocaleString()} = 付款單總額 NT$ ${selectedTotal.toLocaleString()} ✓`
                    : `差額 NT$ ${batchAmountDiff.toLocaleString()}（付款單總額 NT$ ${selectedTotal.toLocaleString()} − 帳戶合計 NT$ ${batchAccountsTotal.toLocaleString()}）`
                  }
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setSelectedOrderIds(new Set()); setBatchAccounts([{ accountId: '', amount: '' }]); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消選取
              </button>
              <button
                onClick={handleBatchExecute}
                disabled={batchExecuting || Math.abs(batchAmountDiff) > 0.01 || !batchAccounts.some(a => a.accountId)}
                className={`px-6 py-2 rounded-lg text-sm font-medium ${
                  batchExecuting || Math.abs(batchAmountDiff) > 0.01 || !batchAccounts.some(a => a.accountId)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {batchExecuting ? '執行中...' : `批次確認執行 (${selectedOrderIds.size} 筆)`}
              </button>
            </div>
          </div>
        )}
        {/* Report Tab */}
        {activeTab === 'report' && (
          <div className="print-area">
            {/* Filter controls - hidden when printing */}
            <div className="bg-white rounded-lg shadow p-4 mb-4 no-print">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">起始日期</label>
                  <input type="date" value={reportDateFrom}
                    onChange={e => setReportDateFrom(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
                  <input type="date" value={reportDateTo}
                    onChange={e => setReportDateTo(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                </div>
                <button onClick={fetchReportData}
                  disabled={reportLoading}
                  className="bg-amber-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50 font-medium">
                  {reportLoading ? '查詢中...' : '查詢'}
                </button>
                {reportData.length > 0 && (
                  <button onClick={() => window.print()}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    列印報表
                  </button>
                )}
              </div>
            </div>

            {/* Printable Report：兩段式表格 - 出納支出 + 付款帳戶 */}
            {reportData.length > 0 && (
              <div className="print-content bg-white rounded-lg shadow" id="cashier-report">
                {/* Report Header */}
                <div className="p-6 pb-2 border-b">
                  <h2 className="text-xl font-bold text-center mb-1">出納執行報表</h2>
                  <p className="text-center text-sm text-gray-600 mb-3">
                    報表期間：{reportDateFrom} 至 {reportDateTo}
                  </p>
                  <div className="flex justify-between text-xs text-gray-500 mb-2">
                    <span>列印日期：{new Date().toLocaleDateString('zh-TW')} {new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {/* 依付款方式/依資金帳戶（僅畫面、不列印時顯示） */}
                  <div className="grid grid-cols-2 gap-4 mb-2 no-print">
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">依付款方式</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(reportByMethod).map(([method, info]) => (
                          <span key={method} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                            {method}：{info.count} 筆 / NT$ {info.total.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">依資金帳戶</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(reportByAccount).map(([accName, info]) => (
                          <span key={accName} className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
                            {accName}：{info.count} 筆 / NT$ {info.total.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-6">
                  {/* 第一段：出納支出 */}
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-2">出納支出</h3>
                    <table className="w-full text-xs border-collapse report-table border border-gray-300">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">付款單號</th>
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">廠商</th>
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">館別</th>
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">付款方式</th>
                          <th className="py-2 px-2 text-right font-semibold border-r border-gray-300">金額</th>
                          <th className="py-2 px-2 text-left font-semibold">摘要</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.map((order) => {
                          const exec = order.executions?.[0];
                          const amount = Number(exec?.actualAmount ?? order.netAmount);
                          return (
                            <tr key={order.id} className="border-b border-gray-200">
                              <td className="py-1.5 px-2 border-r border-gray-200 font-medium">{getDisplayOrderNo(order)}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200">{order.supplierName || '-'}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200">{order.warehouse || '-'}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200">{exec?.paymentMethod || order.paymentMethod}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200 text-right font-medium">NT$ {amount.toLocaleString()}</td>
                              <td className="py-1.5 px-2 whitespace-pre-wrap">{order.note || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-400">
                          <td className="py-2 px-2 border-r border-gray-300" colSpan={4}>共{reportData.length}筆</td>
                          <td className="py-2 px-2 text-right border-r border-gray-300">合計</td>
                          <td className="py-2 px-2 text-right font-bold">NT$ {reportTotal.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* 第二段：付款帳戶 */}
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 mb-2">付款帳戶</h3>
                    <table className="w-full text-xs border-collapse report-table border border-gray-300">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">出納單號</th>
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">執行日期</th>
                          <th className="py-2 px-2 text-left font-semibold border-r border-gray-300">資金帳戶</th>
                          <th className="py-2 px-2 text-right font-semibold border-r border-gray-300">支出金額</th>
                          <th className="py-2 px-2 text-left font-semibold">備註</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.map((order) => {
                          const exec = order.executions?.[0];
                          const acct = exec ? accounts.find(a => a.id === exec.accountId) : null;
                          const amount = Number(exec?.actualAmount ?? order.netAmount);
                          return (
                            <tr key={order.id} className="border-b border-gray-200">
                              <td className="py-1.5 px-2 border-r border-gray-200 font-medium">{exec?.executionNo || '-'}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200">{exec?.executionDate || '-'}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200">{acct?.name || '-'}</td>
                              <td className="py-1.5 px-2 border-r border-gray-200 text-right font-medium">NT$ {amount.toLocaleString()}</td>
                              <td className="py-1.5 px-2 whitespace-pre-wrap">{exec?.note || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-400">
                          <td className="py-2 px-2 border-r border-gray-300" colSpan={3}>共{reportData.length}筆</td>
                          <td className="py-2 px-2 text-right border-r border-gray-300">合計</td>
                          <td className="py-2 px-2 text-right font-bold">NT$ {reportTotal.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Signature lines */}
                <div className="p-6 pt-8">
                  <div className="grid grid-cols-3 gap-8 text-sm">
                    <div className="text-center">
                      <div className="border-b border-gray-400 pb-8 mb-2"></div>
                      <div className="text-gray-600">製表人</div>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-gray-400 pb-8 mb-2"></div>
                      <div className="text-gray-600">覆核人</div>
                    </div>
                    <div className="text-center">
                      <div className="border-b border-gray-400 pb-8 mb-2"></div>
                      <div className="text-gray-600">核准人</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!reportLoading && reportData.length === 0 && (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                請選擇日期區間後按「查詢」
              </div>
            )}
          </div>
        )}
      </main>

      {/* Print styles：確保出納兩段表格與框線正確列印 */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .print-content {
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-content .report-table {
            font-size: 10pt;
            border: 1px solid #333 !important;
          }
          .print-content .report-table th,
          .print-content .report-table td {
            padding: 4px 6px;
            border: 1px solid #333 !important;
          }
          .print-content .report-table thead tr {
            background: #f3f4f6 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-content .report-table tfoot tr {
            background: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4 landscape;
            margin: 10mm 12mm;
          }
        }
      `}</style>
    </div>
  );
}
