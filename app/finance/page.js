'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/Navigation';

export default function PaymentPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
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

  // 付款條件選項管理
  const [paymentTermsOptions, setPaymentTermsOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showTermsManager, setShowTermsManager] = useState(false);
  const [newTermName, setNewTermName] = useState('');

  // 付款方式選項管理
  const [paymentMethodOptions, setPaymentMethodOptions] = useState(['月結', '現金', '支票', '轉帳', '信用卡', '員工代付']);
  const [showMethodManager, setShowMethodManager] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');

  // 開票賬戶選項管理（可搜尋下拉）
  const [checkAccountOptions, setCheckAccountOptions] = useState([]);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  // 篩選條件
  const [filterData, setFilterData] = useState({
    yearMonth: '', // 銷帳年月（發票日期）
    supplierId: '',
    warehouse: '', // 管別
    paymentTerms: '' // 付款條件
  });

  // 表單資料
  const [formData, setFormData] = useState({
    paymentNo: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: '月結',
    checkIssueDate: '', // 開票日期
    checkDate: '', // 支票（轉帳）日期
    checkNo: '', // 支票號碼
    checkAccount: '', // 開票賬戶
    note: '', // 備註
    discount: '', // 會計折讓
    paymentAmount: '' // 付款金額
  });

  useEffect(() => {
    fetchPayments();
    fetchSuppliers();
    fetchAllInvoices();
  }, []);

  // 從現有付款紀錄中提取開票賬戶選項
  useEffect(() => {
    if (payments.length > 0) {
      const accounts = [...new Set(payments.map(p => p.checkAccount).filter(Boolean))];
      setCheckAccountOptions(prev => {
        const merged = [...new Set([...prev, ...accounts])];
        return merged;
      });
    }
  }, [payments]);

  // 當勾選的發票變動時，自動更新付款金額
  useEffect(() => {
    if (selectedInvoiceIds.size > 0) {
      const total = parseFloat(calculateTotal()) || 0;
      const discountNum = parseFloat(formData.discount) || 0;
      setFormData(prev => ({
        ...prev,
        paymentAmount: (total - discountNum).toFixed(2)
      }));
    }
  }, [selectedInvoiceIds]);

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
      if (filterData.paymentTerms) params.append('paymentTerms', filterData.paymentTerms);
      
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

    // 欄位驗證
    if (!formData.checkIssueDate) {
      alert('請輸入開票日期');
      return;
    }
    if (!formData.checkDate) {
      alert('請輸入支票（轉帳）日期');
      return;
    }

    // 會計折讓與付款金額驗證
    const invoiceTotal = parseFloat(calculateTotal());
    const discountVal = parseFloat(formData.discount) || 0;
    const paymentAmountVal = parseFloat(formData.paymentAmount) || 0;
    const expectedPayment = invoiceTotal - discountVal;

    if (Math.abs(expectedPayment - paymentAmountVal) > 0.01) {
      alert(`付款金額驗證失敗！\n\n發票總金額：NT$ ${invoiceTotal.toFixed(2)}\n會計折讓：NT$ ${discountVal.toFixed(2)}\n應付金額：NT$ ${expectedPayment.toFixed(2)}\n輸入付款金額：NT$ ${paymentAmountVal.toFixed(2)}\n\n「發票總金額 - 會計折讓」必須等於「付款金額」`);
      return;
    }

    try {
      const paymentData = {
        ...formData,
        paymentNo: formData.paymentNo.trim() || '', // 如果為空或只有空格，傳空字串讓後端自動產生
        invoiceIds: Array.from(selectedInvoiceIds),
        amount: paymentAmountVal,
        discount: discountVal
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
          warehouse: '',
          paymentTerms: ''
        });
        setFormData({
          paymentNo: '',
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethod: '月結',
          checkIssueDate: '',
          checkDate: '',
          checkNo: '',
          checkAccount: '',
          note: '',
          discount: '',
          paymentAmount: ''
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
    <div className="min-h-screen page-bg-finance">
      <Navigation borderColor="border-indigo-500" />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">付款管理</h2>
          {isLoggedIn && (
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) {
                  setSelectedInvoiceIds(new Set());
                  setUnpaidInvoices([]);
                  setFilterData({
                    yearMonth: '',
                    supplierId: '',
                    warehouse: '',
                    paymentTerms: ''
                  });
                  // 自動帶入最近一筆付款的開票日期和支票（轉帳）日期
                  const latestPayment = payments.length > 0 ? payments[payments.length - 1] : null;
                  setFormData({
                    paymentNo: '',
                    paymentDate: new Date().toISOString().split('T')[0],
                    paymentMethod: '月結',
                    checkIssueDate: latestPayment?.checkIssueDate || '',
                    checkDate: latestPayment?.checkDate || '',
                    checkNo: '',
                    checkAccount: '',
                    note: '',
                    discount: '',
                    paymentAmount: ''
                  });
                }
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              ➕ 新增付款
            </button>
          )}
        </div>

        {/* 新增付款表單 */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-blue-200">
            <h3 className="text-lg font-semibold mb-4">新增付款紀錄</h3>
            <form onSubmit={handleSubmit}>
              {/* 篩選條件 */}
              <div className="bg-gray-50 border rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">篩選未付款的發票</h4>
                <div className="grid grid-cols-4 gap-4 mb-3">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      付款條件
                      <button
                        type="button"
                        onClick={() => setShowTermsManager(!showTermsManager)}
                        className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                      >
                        管理選項
                      </button>
                    </label>
                    <select
                      value={filterData.paymentTerms}
                      onChange={(e) => setFilterData({ ...filterData, paymentTerms: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部條件</option>
                      {paymentTermsOptions.map(term => (
                        <option key={term} value={term}>{term}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 付款條件管理面板 */}
                {showTermsManager && (
                  <div className="bg-white border border-gray-300 rounded-lg p-4 mb-3">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="text-sm font-semibold text-gray-700">管理付款條件選項</h5>
                      <button
                        type="button"
                        onClick={() => setShowTermsManager(false)}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        關閉
                      </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={newTermName}
                        onChange={(e) => setNewTermName(e.target.value)}
                        placeholder="輸入新付款條件名稱"
                        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newTermName.trim();
                            if (trimmed && !paymentTermsOptions.includes(trimmed)) {
                              setPaymentTermsOptions([...paymentTermsOptions, trimmed]);
                              setNewTermName('');
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newTermName.trim();
                          if (trimmed && !paymentTermsOptions.includes(trimmed)) {
                            setPaymentTermsOptions([...paymentTermsOptions, trimmed]);
                            setNewTermName('');
                          }
                        }}
                        className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        新增
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {paymentTermsOptions.map(term => (
                        <span key={term} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-sm">
                          {term}
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentTermsOptions(paymentTermsOptions.filter(t => t !== term));
                              if (filterData.paymentTerms === term) {
                                setFilterData({ ...filterData, paymentTerms: '' });
                              }
                            }}
                            className="text-red-400 hover:text-red-600 ml-1"
                            title={`刪除「${term}」`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">館別</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票抬頭</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">廠商</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票號</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">發票日期</th>
                          <th className="px-3 py-2 text-left text-sm font-medium text-gray-700">總金額</th>
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
                              <td className="px-3 py-2 text-sm">{invoice.warehouse || '-'}</td>
                              <td className="px-3 py-2 text-sm">{invoice.invoiceTitle || '-'}</td>
                              <td className="px-3 py-2 text-sm">{invoice.supplierName || getSupplierName(invoice.supplierId)}</td>
                              <td className="px-3 py-2 text-sm font-medium">{invoice.invoiceNo || invoice.salesNo}</td>
                              <td className="px-3 py-2 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                              <td className="px-3 py-2 text-sm font-semibold">
                                NT$ {parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0)).toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-sm">
                                <div className="flex gap-2">
                                  <Link
                                    href="/sales"
                                    target="_blank"
                                    className="text-blue-600 hover:underline text-sm"
                                  >
                                    編輯
                                  </Link>
                                  <Link
                                    href={`/payment-voucher/${invoice.id}`}
                                    target="_blank"
                                    className="text-green-600 hover:underline text-sm"
                                  >
                                    列印傳票
                                  </Link>
                                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    付款方式 *
                    <button
                      type="button"
                      onClick={() => setShowMethodManager(!showMethodManager)}
                      className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                    >
                      管理選項
                    </button>
                  </label>
                  <select
                    required
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {paymentMethodOptions.map(method => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                  {showMethodManager && (
                    <div className="mt-2 bg-gray-50 border border-gray-300 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-gray-700">管理付款方式選項</span>
                        <button type="button" onClick={() => setShowMethodManager(false)} className="text-gray-400 hover:text-gray-600 text-xs">關閉</button>
                      </div>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={newMethodName}
                          onChange={(e) => setNewMethodName(e.target.value)}
                          placeholder="輸入新付款方式"
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = newMethodName.trim();
                              if (trimmed && !paymentMethodOptions.includes(trimmed)) {
                                setPaymentMethodOptions([...paymentMethodOptions, trimmed]);
                                setNewMethodName('');
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = newMethodName.trim();
                            if (trimmed && !paymentMethodOptions.includes(trimmed)) {
                              setPaymentMethodOptions([...paymentMethodOptions, trimmed]);
                              setNewMethodName('');
                            }
                          }}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        >
                          新增
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {paymentMethodOptions.map(method => (
                          <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border rounded-full text-xs">
                            {method}
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentMethodOptions(paymentMethodOptions.filter(m => m !== method));
                                if (formData.paymentMethod === method) {
                                  setFormData({ ...formData, paymentMethod: paymentMethodOptions[0] || '' });
                                }
                              }}
                              className="text-red-400 hover:text-red-600"
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 付款資訊欄位 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="text-md font-semibold mb-3">付款資訊</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">開票日期 *</label>
                    <input
                      type="date"
                      required
                      value={formData.checkIssueDate}
                      onChange={(e) => setFormData({ ...formData, checkIssueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">支票（轉帳）日期 *</label>
                    <input
                      type="date"
                      required
                      value={formData.checkDate}
                      onChange={(e) => setFormData({ ...formData, checkDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼</label>
                    <input
                      type="text"
                      value={formData.checkNo}
                      onChange={(e) => setFormData({ ...formData, checkNo: e.target.value })}
                      placeholder="輸入支票號碼"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      開票賬戶
                      <button
                        type="button"
                        onClick={() => setShowAccountManager(!showAccountManager)}
                        className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                      >
                        管理選項
                      </button>
                    </label>
                    <input
                      type="text"
                      value={accountSearch !== '' ? accountSearch : formData.checkAccount}
                      onChange={(e) => {
                        setAccountSearch(e.target.value);
                        setShowAccountDropdown(true);
                        if (e.target.value === '') {
                          setFormData({ ...formData, checkAccount: '' });
                        }
                      }}
                      onFocus={() => setShowAccountDropdown(true)}
                      onBlur={() => setTimeout(() => setShowAccountDropdown(false), 200)}
                      placeholder="搜尋或選擇開票賬戶..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {showAccountDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {checkAccountOptions
                          .filter(opt => !accountSearch || opt.toLowerCase().includes(accountSearch.toLowerCase()))
                          .map(opt => (
                            <div
                              key={opt}
                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 text-sm ${formData.checkAccount === opt ? 'bg-blue-100 font-semibold' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFormData({ ...formData, checkAccount: opt });
                                setAccountSearch('');
                                setShowAccountDropdown(false);
                              }}
                            >
                              {opt}
                            </div>
                          ))}
                        {checkAccountOptions.filter(opt => !accountSearch || opt.toLowerCase().includes(accountSearch.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-400">無匹配選項</div>
                        )}
                      </div>
                    )}
                    {showAccountManager && (
                      <div className="mt-2 bg-gray-50 border border-gray-300 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-gray-700">管理開票賬戶選項</span>
                          <button type="button" onClick={() => setShowAccountManager(false)} className="text-gray-400 hover:text-gray-600 text-xs">關閉</button>
                        </div>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            placeholder="輸入新開票賬戶名稱"
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = newAccountName.trim();
                                if (trimmed && !checkAccountOptions.includes(trimmed)) {
                                  setCheckAccountOptions([...checkAccountOptions, trimmed]);
                                  setNewAccountName('');
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = newAccountName.trim();
                              if (trimmed && !checkAccountOptions.includes(trimmed)) {
                                setCheckAccountOptions([...checkAccountOptions, trimmed]);
                                setNewAccountName('');
                              }
                            }}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                          >
                            新增
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {checkAccountOptions.map(account => (
                            <span key={account} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border rounded-full text-xs">
                              {account}
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckAccountOptions(checkAccountOptions.filter(a => a !== account));
                                  if (formData.checkAccount === account) {
                                    setFormData({ ...formData, checkAccount: '' });
                                  }
                                }}
                                className="text-red-400 hover:text-red-600"
                              >
                                x
                              </button>
                            </span>
                          ))}
                          {checkAccountOptions.length === 0 && (
                            <span className="text-xs text-gray-400">尚未新增任何賬戶</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">會計折讓</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.discount}
                      onChange={(e) => {
                        const discount = e.target.value;
                        const total = parseFloat(calculateTotal()) || 0;
                        const discountNum = parseFloat(discount) || 0;
                        setFormData({
                          ...formData,
                          discount: discount,
                          paymentAmount: (total - discountNum).toFixed(2)
                        });
                      }}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">付款金額 *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formData.paymentAmount}
                      onChange={(e) => setFormData({ ...formData, paymentAmount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {selectedInvoiceIds.size > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        發票總金額 NT$ {calculateTotal()} - 折讓 NT$ {parseFloat(formData.discount || 0).toFixed(2)} = NT$ {(parseFloat(calculateTotal()) - parseFloat(formData.discount || 0)).toFixed(2)}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                    <textarea
                      value={formData.note}
                      onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                      placeholder="輸入備註事項..."
                      rows="2"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

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
                      warehouse: '',
                      paymentTerms: ''
                    });
                    setFormData({
                      paymentNo: '',
                      paymentDate: new Date().toISOString().split('T')[0],
                      paymentMethod: '月結',
                      checkIssueDate: '',
                      checkDate: '',
                      checkNo: '',
                      checkAccount: '',
                      note: '',
                      discount: '',
                      paymentAmount: ''
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
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">會計折讓</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款金額</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">付款狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">開票日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">支票（轉帳）日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">備註</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-gray-500">載入中...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="11" className="px-4 py-8 text-center text-gray-500">尚無付款紀錄</td>
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
                        <td className="px-4 py-3 text-sm">{payment.discount ? `NT$ ${parseFloat(payment.discount).toFixed(2)}` : '-'}</td>
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
                        <td className="px-4 py-3 text-sm">{payment.checkIssueDate || '-'}</td>
                        <td className="px-4 py-3 text-sm">{payment.checkDate || '-'}</td>
                        <td className="px-4 py-3 text-sm truncate max-w-[150px]" title={payment.note || ''}>{payment.note || '-'}</td>
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
                            {isLoggedIn && (
                              <button
                                onClick={() => handleDelete(payment.id)}
                                className="text-red-600 hover:underline text-sm"
                              >
                                刪除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* 展開的詳細資訊 */}
                      {isExpanded && (
                        <tr className="bg-blue-50">
                          <td colSpan="11" className="px-4 py-4">
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
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">會計折讓</div>
                                    <div className="text-lg font-semibold">
                                      {payment.discount ? `NT$ ${parseFloat(payment.discount).toFixed(2)}` : '-'}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">付款金額</div>
                                    <div className="text-2xl font-bold text-blue-600">
                                      NT$ {parseFloat(payment.amount).toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 付款資訊 */}
                              {(payment.checkIssueDate || payment.checkDate || payment.checkNo || payment.checkAccount || payment.note) && (
                                <div className="pb-4 border-b border-gray-300">
                                  <div className="text-sm font-semibold mb-3 text-gray-700">付款資訊</div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {payment.checkIssueDate && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">開票日期</div>
                                        <div className="text-sm font-semibold">{payment.checkIssueDate}</div>
                                      </div>
                                    )}
                                    {payment.checkDate && (
                                      <div>
                                        <div className="text-xs text-gray-500 mb-1">支票（轉帳）日期</div>
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
                                  {payment.note && (
                                    <div className="mt-3">
                                      <div className="text-xs text-gray-500 mb-1">備註</div>
                                      <div className="text-sm">{payment.note}</div>
                                    </div>
                                  )}
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
