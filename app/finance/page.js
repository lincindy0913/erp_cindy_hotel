'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';

export default function PaymentPage() {
  const [payments, setPayments] = useState([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [allInvoices, setAllInvoices] = useState([]); // 所有發票資料，用於顯示詳細資訊
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [expandedPayments, setExpandedPayments] = useState(new Set()); // 追蹤展開的付款ID
  const [editingPaymentStatus, setEditingPaymentStatus] = useState(null); // 追蹤正在編輯狀態的付款ID
  
  // 篩選條件
  const [filterData, setFilterData] = useState({
    yearMonth: '', // 銷帳年月（發票日期）
    supplierId: '',
    warehouse: '' // 管別
  });

  // 表單資料
  const [formData, setFormData] = useState({
    paymentNo: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: '支票',
    // 支票相關欄位
    checkIssueDate: '', // 開票日期
    checkDate: '', // 支票日期
    checkNo: '', // 支票號碼
    checkAccount: '' // 開票賬戶
  });

  useEffect(() => {
    fetchPayments();
    fetchSuppliers();
    fetchAllInvoices();
  }, []);

  async function fetchPayments() {
    try {
      const response = await fetch('/api/payments');
      const data = await response.json();
      setPayments(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('取得付款列表失敗:', error);
      setPayments([]);
      setLoading(false);
    }
  }

  async function fetchSuppliers() {
    try {
      const response = await fetch('/api/suppliers');
      const data = await response.json();
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得廠商列表失敗:', error);
      setSuppliers([]);
    }
  }

  async function fetchAllInvoices() {
    try {
      const response = await fetch('/api/sales');
      const data = await response.json();
      setAllInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('取得發票列表失敗:', error);
      setAllInvoices([]);
    }
  }

  // 查詢未付款的發票
  async function fetchUnpaidInvoices() {
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams();
      if (filterData.yearMonth) params.append('yearMonth', filterData.yearMonth);
      if (filterData.supplierId) params.append('supplierId', filterData.supplierId);
      if (filterData.warehouse) params.append('warehouse', filterData.warehouse);
      
      const url = `/api/sales/unpaid?${params.toString()}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const invoices = Array.isArray(data) ? data : [];
      setUnpaidInvoices(invoices);
      setSelectedInvoiceIds(new Set()); // 清空已選發票
      
      if (invoices.length === 0) {
        alert('查詢完成，但沒有找到未付款的發票。\n\n請檢查：\n1. 篩選條件是否正確\n2. 是否有建立發票資料\n3. 該發票是否已被付款');
      }
    } catch (error) {
      console.error('取得未付款發票失敗:', error);
      setUnpaidInvoices([]);
      alert('查詢失敗：' + (error.message || '請稍後再試'));
    } finally {
      setLoadingInvoices(false);
    }
  }

  function getSupplierName(supplierId) {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier ? supplier.name : '未知廠商';
  }

  function handleInvoiceToggle(invoiceId) {
    const newSelected = new Set(selectedInvoiceIds);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoiceIds(newSelected);
  }

  function handleSelectAll() {
    if (selectedInvoiceIds.size === unpaidInvoices.length && unpaidInvoices.length > 0) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(unpaidInvoices.map(inv => inv.id)));
    }
  }

  function calculateTotal() {
    let total = 0;
    selectedInvoiceIds.forEach(invoiceId => {
      const invoice = unpaidInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        total += parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0));
      }
    });
    return total.toFixed(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (selectedInvoiceIds.size === 0) {
      alert('請至少勾選一張發票進行付款');
      return;
    }

    // 支票相關欄位驗證
    if (formData.paymentMethod === '支票') {
      if (!formData.checkIssueDate) {
        alert('請輸入開票日期');
        return;
      }
      if (!formData.checkDate) {
        alert('請輸入支票日期');
        return;
      }
      if (!formData.checkNo) {
        alert('請輸入支票號碼');
        return;
      }
      if (!formData.checkAccount) {
        alert('請輸入開票賬戶');
        return;
      }
    }

    try {
      const paymentData = {
        ...formData,
        paymentNo: formData.paymentNo.trim() || '', // 如果為空或只有空格，傳空字串讓後端自動產生
        invoiceIds: Array.from(selectedInvoiceIds),
        amount: calculateTotal()
      };

      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      if (response.ok) {
        alert('付款紀錄新增成功！');
        setShowAddForm(false);
        setSelectedInvoiceIds(new Set());
        setUnpaidInvoices([]);
        setFilterData({
          yearMonth: '',
          supplierId: '',
          warehouse: ''
        });
        setFormData({
          paymentNo: '',
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: '支票',
          checkIssueDate: '',
          checkDate: '',
          checkNo: '',
          checkAccount: ''
        });
        fetchPayments();
      } else {
        const error = await response.json();
        alert('新增失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('新增付款紀錄失敗:', error);
      alert('新增付款紀錄失敗，請稍後再試');
    }
  }

  async function handleDelete(paymentId) {
    if (!confirm('確定要刪除這筆付款紀錄嗎？')) return;
    
    try {
      const response = await fetch(`/api/payments/${paymentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('付款紀錄刪除成功！');
        fetchPayments();
      } else {
        const error = await response.json();
        alert('刪除失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('刪除付款紀錄失敗:', error);
      alert('刪除付款紀錄失敗，請稍後再試');
    }
  }

  // 取得付款記錄中的發票資訊
  function getInvoicesForPayment(payment) {
    if (payment.invoiceIds && Array.isArray(payment.invoiceIds)) {
      return payment.invoiceIds;
    }
    // 兼容舊格式
    if (payment.salesId) {
      return [payment.salesId];
    }
    return [];
  }

  // 取得發票詳細資料
  function getInvoiceDetails(invoiceId) {
    return allInvoices.find(inv => inv.id === invoiceId);
  }

  // 切換查看詳細資訊
  function handleViewDetails(paymentId) {
    const newExpanded = new Set(expandedPayments);
    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId); // 如果已展開，則收合
    } else {
      newExpanded.add(paymentId); // 如果未展開，則展開
    }
    setExpandedPayments(newExpanded);
  }

  async function handleUpdatePaymentStatus(paymentId, newStatus) {
    try {
      const response = await fetch(`/api/payments/${paymentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        alert('付款狀態更新成功！');
        setEditingPaymentStatus(null);
        fetchPayments();
      } else {
        const error = await response.json();
        alert('更新失敗：' + (error.error || '未知錯誤'));
      }
    } catch (error) {
      console.error('更新付款狀態失敗:', error);
      alert('更新付款狀態失敗，請稍後再試');
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-800">📦 進銷存系統</h1>
            <div className="flex gap-6 text-sm flex-wrap">
              <Link href="/" className="hover:text-blue-600">儀表板</Link>
              <Link href="/products" className="hover:text-blue-600">主資料</Link>
              <Link href="/suppliers" className="hover:text-blue-600">廠商</Link>
              <Link href="/purchasing" className="hover:text-blue-600">進貨</Link>
              <Link href="/sales" className="hover:text-blue-600">發票登錄/核銷</Link>
              <Link href="/finance" className="font-medium text-blue-600">付款</Link>
              <Link href="/inventory" className="hover:text-blue-600">庫存</Link>
              <Link href="/analytics" className="hover:text-blue-600">分析</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">付款管理</h2>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm) {
                setSelectedInvoiceIds(new Set());
                setUnpaidInvoices([]);
                setFilterData({
                  yearMonth: '',
                  supplierId: '',
                  warehouse: ''
                });
              }
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            ➕ 新增付款
          </button>
        </div>

        {/* 新增付款表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">新增付款紀錄</h3>
            <form onSubmit={handleSubmit}>
              {/* 篩選條件 */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">篩選未付款的發票</h4>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      銷帳年月
                    </label>
                    <input
                      type="month"
                      value={filterData.yearMonth}
                      onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      廠商
                    </label>
                    <select
                      value={filterData.supplierId}
                      onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部廠商</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      管別
                    </label>
                    <select
                      value={filterData.warehouse}
                      onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部管別</option>
                      <option value="麗格">麗格</option>
                      <option value="麗軒">麗軒</option>
                      <option value="民宿">民宿</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchUnpaidInvoices}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  查詢未付款發票
                </button>
              </div>

              {/* 未付款發票列表（勾選） */}
              {loadingInvoices ? (
                <div className="text-center py-8 text-gray-500">載入中...</div>
              ) : unpaidInvoices.length > 0 ? (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-md font-semibold">請勾選要支付的發票（共 {unpaidInvoices.length} 張）</h4>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {selectedInvoiceIds.size === unpaidInvoices.length ? '取消全選' : '全選'}
                    </button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 w-12">
                            <input
                              type="checkbox"
                              checked={selectedInvoiceIds.size === unpaidInvoices.length && unpaidInvoices.length > 0}
                              onChange={handleSelectAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票號</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票日期</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">管別</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">總金額</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">狀態</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {unpaidInvoices.map((invoice) => {
                          const isSelected = selectedInvoiceIds.has(invoice.id);
                          return (
                            <tr key={invoice.id} className={isSelected ? 'bg-blue-50' : ''}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleInvoiceToggle(invoice.id)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-sm font-medium">{invoice.invoiceNo || invoice.salesNo}</td>
                              <td className="px-3 py-2 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                              <td className="px-3 py-2 text-sm">{invoice.supplierName || getSupplierName(invoice.supplierId)}</td>
                              <td className="px-3 py-2 text-sm">{invoice.warehouse || '-'}</td>
                              <td className="px-3 py-2 text-sm font-semibold">
                                NT$ {parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0)).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-sm">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  invoice.status === '已核銷' ? 'bg-green-100 text-green-800' :
                                  invoice.status === '待核銷' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {invoice.status || '待核銷'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm">
                                <Link
                                  href={`/payment-voucher/${invoice.id}`}
                                  target="_blank"
                                  className="text-green-600 hover:underline text-sm"
                                >
                                  🖨️ 列印傳票
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {selectedInvoiceIds.size > 0 && (
                    <div className="mt-4 text-right">
                      <span className="text-sm text-gray-600">已選 {selectedInvoiceIds.size} 張發票，總金額：</span>
                      <span className="text-xl font-bold text-blue-600 ml-2">NT$ {calculateTotal()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                  <div className="text-center text-yellow-800">
                    <p className="text-sm font-medium mb-2">⚠️ 尚未查詢或沒有未付款的發票</p>
                    <p className="text-xs text-yellow-600">
                      請先設定篩選條件（可選），然後點擊「查詢未付款發票」按鈕
                    </p>
                  </div>
                </div>
              )}

              {/* 付款資訊 */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款單號</label>
                  <input
                    type="text"
                    value={formData.paymentNo || '自動產生'}
                    readOnly
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">系統自動產生</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款日期 *</label>
                  <input
                    type="date"
                    required
                    value={formData.paymentDate}
                    onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款方式 *</label>
                  <select
                    required
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option>支票</option>
                    <option>現金</option>
                    <option>轉帳</option>
                    <option>信用卡</option>
                  </select>
                </div>
              </div>

              {/* 支票相關欄位 */}
              {formData.paymentMethod === '支票' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h4 className="text-md font-semibold mb-3">支票資訊 *</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">開票日期 *</label>
                      <input
                        type="date"
                        required={formData.paymentMethod === '支票'}
                        value={formData.checkIssueDate}
                        onChange={(e) => setFormData({ ...formData, checkIssueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">支票日期 *</label>
                      <input
                        type="date"
                        required={formData.paymentMethod === '支票'}
                        value={formData.checkDate}
                        onChange={(e) => setFormData({ ...formData, checkDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼 *</label>
                      <input
                        type="text"
                        required={formData.paymentMethod === '支票'}
                        value={formData.checkNo}
                        onChange={(e) => setFormData({ ...formData, checkNo: e.target.value })}
                        placeholder="輸入支票號碼"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">開票賬戶 *</label>
                      <input
                        type="text"
                        required={formData.paymentMethod === '支票'}
                        value={formData.checkAccount}
                        onChange={(e) => setFormData({ ...formData, checkAccount: e.target.value })}
                        placeholder="輸入開票賬戶"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按鈕 */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedInvoiceIds(new Set());
                    setUnpaidInvoices([]);
                    setFilterData({
                      yearMonth: '',
                      supplierId: '',
                      warehouse: ''
                    });
                    setFormData({
                      paymentNo: '',
                      paymentDate: new Date().toISOString().split('T')[0],
                      paymentMethod: '支票',
                      checkIssueDate: '',
                      checkDate: '',
                      checkNo: '',
                      checkAccount: ''
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={selectedInvoiceIds.size === 0}
                  className={`px-6 py-2 rounded-lg ${
                    selectedInvoiceIds.size === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  儲存
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 付款列表 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款單號</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款方式</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">發票數量</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款狀態</th>
                {payments.some(p => p.checkNo) && (
                  <>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">支票號碼</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">開票日期</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={payments.some(p => p.checkNo) ? 9 : 7} className="px-4 py-8 text-center text-gray-500">載入中...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={payments.some(p => p.checkNo) ? 9 : 7} className="px-4 py-8 text-center text-gray-500">尚無付款紀錄</td>
                </tr>
              ) : (
                payments.map((payment, index) => {
                  const invoiceIds = getInvoicesForPayment(payment);
                  const isExpanded = expandedPayments.has(payment.id);
                  const isEditingStatus = editingPaymentStatus === payment.id;
                  const paymentStatus = payment.status || '未完成';
                  return (
                    <Fragment key={payment.id}>
                      <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm">{payment.paymentNo}</td>
                        <td className="px-4 py-3 text-sm">{payment.paymentDate}</td>
                        <td className="px-4 py-3 text-sm">{payment.paymentMethod}</td>
                        <td className="px-4 py-3 text-sm">{invoiceIds.length} 張</td>
                        <td className="px-4 py-3 text-sm font-semibold">NT$ {parseFloat(payment.amount).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">
                          {isEditingStatus ? (
                            <select
                              value={paymentStatus}
                              onChange={(e) => handleUpdatePaymentStatus(payment.id, e.target.value)}
                              onBlur={() => setEditingPaymentStatus(null)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            >
                              <option value="未完成">未完成</option>
                              <option value="已完成">已完成</option>
                            </select>
                          ) : (
                            <span 
                              className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 ${
                                paymentStatus === '已完成' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}
                              onClick={() => setEditingPaymentStatus(payment.id)}
                              title="點擊編輯"
                            >
                              {paymentStatus}
                            </span>
                          )}
                        </td>
                        {payments.some(p => p.checkNo) && (
                          <>
                            <td className="px-4 py-3 text-sm">{payment.checkNo || '-'}</td>
                            <td className="px-4 py-3 text-sm">{payment.checkIssueDate || '-'}</td>
                          </>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleViewDetails(payment.id)}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              {isExpanded ? '收起' : '查看'}
                            </button>
                            {invoiceIds.length > 0 && invoiceIds.length === 1 && (
                              <Link
                                href={`/payment-voucher/${invoiceIds[0]}`}
                                target="_blank"
                                className="text-green-600 hover:underline text-sm"
                              >
                                🖨️ 列印傳票
                              </Link>
                            )}
                            <button
                              onClick={() => handleDelete(payment.id)}
                              className="text-red-600 hover:underline text-sm"
                            >
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* 展開的詳細資訊 */}
                      {isExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan={payments.some(p => p.checkNo) ? 9 : 7} className="px-4 py-4">
                            <div className="space-y-4">
                              {/* 付款基本資訊 */}
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-4 border-b border-gray-300">
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">付款單號</div>
                                  <div className="text-sm font-semibold">{payment.paymentNo}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">付款日期</div>
                                  <div className="text-sm font-semibold">{payment.paymentDate}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">付款方式</div>
                                  <div className="text-sm font-semibold">{payment.paymentMethod}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">發票數量</div>
                                  <div className="text-sm font-semibold">{invoiceIds.length} 張</div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">付款狀態</div>
                                  <div className="text-sm">
                                    {editingPaymentStatus === payment.id ? (
                                      <select
                                        value={paymentStatus}
                                        onChange={(e) => handleUpdatePaymentStatus(payment.id, e.target.value)}
                                        onBlur={() => setEditingPaymentStatus(null)}
                                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        autoFocus
                                      >
                                        <option value="未完成">未完成</option>
                                        <option value="已完成">已完成</option>
                                      </select>
                                    ) : (
                                      <span 
                                        className={`px-2 py-1 rounded text-xs cursor-pointer hover:opacity-80 inline-block ${
                                          paymentStatus === '已完成' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}
                                        onClick={() => setEditingPaymentStatus(payment.id)}
                                        title="點擊編輯"
                                      >
                                        {paymentStatus}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 金額資訊 */}
                              <div className="pb-4 border-b border-gray-300">
                                <div className="text-xs text-gray-500 mb-1">付款金額</div>
                                <div className="text-2xl font-bold text-blue-600">
                                  NT$ {parseFloat(payment.amount).toFixed(2)}
                                </div>
                              </div>

                              {/* 支票相關資訊 */}
                              {payment.paymentMethod === '支票' && (payment.checkNo || payment.checkIssueDate || payment.checkDate || payment.checkAccount) && (
                                <div className="pb-4 border-b border-gray-300">
                                  <div className="text-sm font-semibold mb-3 text-gray-700">支票資訊</div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {payment.checkIssueDate && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">開票日期</div>
                                        <div className="text-sm font-semibold">{payment.checkIssueDate}</div>
                                      </div>
                                    )}
                                    {payment.checkDate && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">支票日期</div>
                                        <div className="text-sm font-semibold">{payment.checkDate}</div>
                                      </div>
                                    )}
                                    {payment.checkNo && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">支票號碼</div>
                                        <div className="text-sm font-semibold">{payment.checkNo}</div>
                                      </div>
                                    )}
                                    {payment.checkAccount && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">開票賬戶</div>
                                        <div className="text-sm font-semibold">{payment.checkAccount}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 支付發票列表 */}
                              {invoiceIds.length > 0 && (
                                <div>
                                  <div className="flex justify-between items-center mb-3">
                                    <div className="text-sm font-semibold text-gray-700">支付的發票詳情（共 {invoiceIds.length} 張）</div>
                                    <div className="flex gap-2">
                                      {invoiceIds.map(invoiceId => {
                                        const invoice = getInvoiceDetails(invoiceId);
                                        if (!invoice) return null;
                                        return (
                                          <Link
                                            key={invoiceId}
                                            href={`/payment-voucher/${invoiceId}`}
                                            target="_blank"
                                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                                          >
                                            🖨️ 列印傳票
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
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
                                          
                                          // 從發票的 items 中取得廠商和管別資訊
                                          let supplierId = null;
                                          let warehouse = '-';
                                          
                                          // 優先從發票本身取得（如果有的話）
                                          if (invoice.supplierId) {
                                            supplierId = invoice.supplierId;
                                          } else if (invoice.items && invoice.items.length > 0) {
                                            // 從第一個 item 取得 supplierId
                                            supplierId = invoice.items[0].supplierId;
                                          }
                                          
                                          // 取得管別資訊
                                          if (invoice.warehouse) {
                                            warehouse = invoice.warehouse;
                                          } else if (invoice.items && invoice.items.length > 0) {
                                            // 從第一個 item 的 purchaseId 查找進貨單取得管別
                                            const firstPurchaseId = invoice.items[0].purchaseId;
                                            // 這裡需要從 purchases 中查找，但我們先使用發票本身的資訊
                                            // 如果沒有，則顯示 '-'
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
                                          <td className="px-3 py-2 text-right text-blue-600">
                                            NT$ {parseFloat(payment.amount).toFixed(2)}
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
      </main>
    </div>
  );
}
