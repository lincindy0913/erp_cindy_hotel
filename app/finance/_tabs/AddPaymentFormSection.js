'use client';

import Link from 'next/link';

export default function AddPaymentFormSection({
  // form state
  filterData, setFilterData,
  formData, setFormData,
  formSaving, setFormSaving,
  loadingInvoices,
  unpaidInvoices, setUnpaidInvoices,
  selectedInvoiceIds, setSelectedInvoiceIds,
  // handlers
  fetchUnpaidInvoices,
  handleSubmit,
  handleInvoiceToggle,
  handleSelectAll,
  calculateTotal,
  resetFilterAndForm,
  getSupplierName,
  setShowAddForm,
  // options
  suppliers,
  paymentTermsOptions, setPaymentTermsOptions,
  showTermsManager, setShowTermsManager,
  newTermName, setNewTermName,
  paymentMethodOptions, setPaymentMethodOptions,
  showMethodManager, setShowMethodManager,
  newMethodName, setNewMethodName,
  cashAccounts,
  paymentAmountError,
  setPaymentAmountError,
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-indigo-200">
      <h3 className="text-lg font-semibold mb-4">新增付款單（草稿）</h3>
      <form onSubmit={handleSubmit}>
        {/* 篩選條件 */}
        <div className="bg-gray-50 border rounded-lg p-4 mb-6">
          <h4 className="text-md font-semibold mb-3">篩選未付款的發票</h4>
          <div className="grid grid-cols-4 gap-4 mb-3">
            <div>
              <label htmlFor="f" className="block text-sm font-medium text-gray-700 mb-1">銷帳年月</label>
              <input id="f"
                type="month"
                value={filterData.yearMonth}
                onChange={(e) => setFilterData({ ...filterData, yearMonth: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="f-2" className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
              <select id="f-2"
                value={filterData.supplierId}
                onChange={(e) => setFilterData({ ...filterData, supplierId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">全部廠商</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-30" className="block text-sm font-medium text-gray-700 mb-1">管別</label>
              <select id="f-30"
                value={filterData.warehouse}
                onChange={(e) => setFilterData({ ...filterData, warehouse: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs"
                >
                  管理選項
                </button>
              </label>
              <select
                value={filterData.paymentTerms}
                onChange={(e) => setFilterData({ ...filterData, paymentTerms: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                <button type="button" onClick={() => setShowTermsManager(false)} className="text-gray-400 hover:text-gray-600 text-sm">關閉</button>
              </div>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newTermName}
                  onChange={(e) => setNewTermName(e.target.value)}
                  placeholder="輸入新付款條件名稱"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
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
                className="text-sm text-indigo-600 hover:underline"
              >
                {selectedInvoiceIds.size === unpaidInvoices.length ? '取消全選' : '全選'}
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 w-12">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.size === unpaidInvoices.length && unpaidInvoices.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                      <tr key={invoice.id} className={isSelected ? 'bg-indigo-50' : ''}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleInvoiceToggle(invoice.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm">{invoice.warehouse || '-'}</td>
                        <td className="px-3 py-2 text-sm">{invoice.invoiceTitle || '-'}</td>
                        <td className="px-3 py-2 text-sm">{invoice.supplierName || getSupplierName(invoice.supplierId)}</td>
                        <td className="px-3 py-2 text-sm font-medium">
                          <Link href={`/sales?edit=${invoice.id}`} target="_blank" className="text-indigo-600 hover:underline">
                            {invoice.invoiceNo || invoice.salesNo}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                        <td className="px-3 py-2 text-sm font-semibold">
                          NT$ {parseFloat(invoice.totalAmount || (invoice.amount || 0) + (invoice.tax || 0)).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <Link href={`/payment-voucher/${invoice.id}`} target="_blank" className="text-green-600 hover:underline text-sm">列印傳票</Link>
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
                <span className="text-xl font-bold text-indigo-600 ml-2">NT$ {calculateTotal()}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="text-center text-yellow-800">
              <p className="text-sm font-medium mb-2">尚未查詢或沒有未付款的發票</p>
              <p className="text-xs text-yellow-600">請先設定篩選條件（可選），然後點擊「查詢未付款發票」按鈕</p>
            </div>
          </div>
        )}

        {/* 付款資訊 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">付款單號</label>
            <input id="f-3" type="text" value="自動產生" readOnly disabled className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed" />
            <p className="text-xs text-gray-500 mt-1">系統自動產生 PAY-YYYYMMDD-XXXX</p>
          </div>
          <div>
            <label htmlFor="button-type-button-onclic" className="block text-sm font-medium text-gray-700 mb-1">
              付款方式 *
              <button type="button" onClick={() => setShowMethodManager(!showMethodManager)} className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs">管理選項</button>
            </label>
            <select id="button-type-button-onclic"
              required
              value={formData.paymentMethod}
              onChange={(e) => {
                const next = e.target.value;
                if (next === '支票') {
                  const last = typeof window !== 'undefined' && window.localStorage.getItem('finance_lastCheck');
                  const lastCheck = last ? (() => { try { return JSON.parse(last); } catch { return null; } })() : null;
                  if (lastCheck) {
                    setFormData(prev => ({
                      ...prev,
                      paymentMethod: next,
                      checkIssueDate: lastCheck.checkIssueDate || prev.checkIssueDate,
                      checkDate: lastCheck.checkDate || prev.checkDate,
                      checkAccountId: lastCheck.checkAccountId || prev.checkAccountId
                    }));
                    return;
                  }
                }
                setFormData({ ...formData, paymentMethod: next });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        {/* 付款資訊欄位 - 依付款方式顯示不同欄位 */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <h4 className="text-md font-semibold mb-3">
            付款資訊
            {formData.paymentMethod === '支票' && (
              <span className="ml-2 text-sm font-normal text-amber-600">
                （支票付款將自動建立支票記錄，可至支票管理頁面追蹤）
              </span>
            )}
          </h4>

          {formData.paymentMethod === '支票' ? (
            /* 支票付款：付款(開票)日期、支票日期、支票號碼、開票帳戶、支票金額、會計折讓、備註 */
            <div className="space-y-4">
              <p className="text-sm text-amber-700">
                支票付款將在儲存後自動建立支票記錄，可至
                <Link href="/checks" className="text-indigo-600 hover:underline font-semibold mx-1">支票管理</Link>
                頁面追蹤兌現與到期。
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">付款(開票)日期 *</label>
                  <input id="f-4"
                    type="date"
                    required
                    value={formData.checkIssueDate}
                    onChange={(e) => setFormData({ ...formData, checkIssueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">支票日期 *</label>
                  <input id="f-5"
                    type="date"
                    required
                    value={formData.checkDate}
                    onChange={(e) => setFormData({ ...formData, checkDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">支票號碼 *</label>
                  <input id="f-6"
                    type="text"
                    required
                    value={formData.checkNo}
                    onChange={(e) => setFormData({ ...formData, checkNo: e.target.value })}
                    placeholder="請輸入支票號碼"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="f-7" className="block text-sm font-medium text-gray-700 mb-1">開票帳戶 *</label>
                  <select id="f-7"
                    required
                    value={formData.checkAccountId}
                    onChange={(e) => setFormData({ ...formData, checkAccountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">請選擇資金帳戶（開票帳戶）</option>
                    {cashAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}{acc.warehouse ? ` (${acc.warehouse})` : ''} - {acc.type}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">連動「資金帳戶管理」設定</p>
                </div>
                <div>
                  <label htmlFor="f-25" className="block text-sm font-medium text-gray-700 mb-1">支票金額 *</label>
                  <input id="f-25"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    readOnly
                    value={formData.paymentAmount}
                    className={`w-full px-3 py-2 border rounded-lg bg-gray-50 ${paymentAmountError ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-300'}`}
                  />
                  {selectedInvoiceIds.size > 0 && !paymentAmountError && (
                    <p className="text-xs text-gray-500 mt-1">
                      已依勾選發票總額 NT$ {calculateTotal()} - 折讓 NT$ {parseFloat(formData.discount || 0).toFixed(2)} 自動帶入
                    </p>
                  )}
                  {paymentAmountError && (
                    <p className="text-xs text-red-600 mt-1 font-medium">{paymentAmountError}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="f-8" className="block text-sm font-medium text-gray-700 mb-1">會計折讓</label>
                  <input id="f-8"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="f-9" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                  <textarea id="f-9"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    placeholder="輸入備註事項..."
                    rows="2"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* 現金/轉帳/信用卡/員工代墊款/月結：付款日期、付款金額、付款帳戶、會計折讓、備註 */
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-10" className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
                <input id="f-10"
                  type="date"
                  value={formData.paymentDate}
                  onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="f-11" className="block text-sm font-medium text-gray-700 mb-1">付款帳戶</label>
                <select id="f-11"
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">請選擇帳戶</option>
                  {cashAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}{acc.warehouse ? ` (${acc.warehouse})` : ''} - {acc.type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="f-26" className="block text-sm font-medium text-gray-700 mb-1">會計折讓</label>
                <input id="f-26"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="f-12" className="block text-sm font-medium text-gray-700 mb-1">付款金額 *</label>
                <input id="f-12"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.paymentAmount}
                  onChange={(e) => {
                    setFormData({ ...formData, paymentAmount: e.target.value });
                    if (setPaymentAmountError) setPaymentAmountError(null);
                  }}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${paymentAmountError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-indigo-500'}`}
                />
                {selectedInvoiceIds.size > 0 && !paymentAmountError && (
                  <p className="text-xs text-gray-500 mt-1">
                    發票總金額 NT$ {calculateTotal()} - 折讓 NT$ {parseFloat(formData.discount || 0).toFixed(2)} = NT$ {(parseFloat(calculateTotal()) - parseFloat(formData.discount || 0)).toFixed(2)}
                  </p>
                )}
                {paymentAmountError && (
                  <p className="text-xs text-red-600 mt-1 font-medium">{paymentAmountError}</p>
                )}
              </div>
              {/* 員工代墊款欄位 - 付款方式為員工代付或信用卡時顯示 */}
              {(formData.paymentMethod === '員工代付' || formData.paymentMethod === '信用卡') && (
                <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-purple-800 mb-2">員工代墊資訊（存檔後自動連動代墊款管理）</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f-13" className="block text-xs font-medium text-purple-700 mb-1">代墊員工 *</label>
                      <input id="f-13"
                        type="text"
                        value={formData.advancedBy}
                        onChange={(e) => setFormData({ ...formData, advancedBy: e.target.value })}
                        placeholder="員工姓名"
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="f-14" className="block text-xs font-medium text-purple-700 mb-1">代墊方式</label>
                      <select id="f-14"
                        value={formData.advancePaymentMethod || formData.paymentMethod}
                        onChange={(e) => setFormData({ ...formData, advancePaymentMethod: e.target.value })}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white text-sm"
                      >
                        <option value="現金">現金</option>
                        <option value="信用卡">信用卡</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <label htmlFor="f-15" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <textarea id="f-15"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="輸入備註事項..."
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* 操作按鈕 */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              setShowAddForm(false);
              setSelectedInvoiceIds(new Set());
              setUnpaidInvoices([]);
              setFormSaving(false);
              resetFilterAndForm();
            }}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          {(() => {
            const checkIncomplete = formData.paymentMethod === '支票' && (
              !formData.checkIssueDate?.trim() || !formData.checkDate?.trim() ||
              !formData.checkNo?.trim() || !formData.checkAccountId
            );
            const isDisabled = selectedInvoiceIds.size === 0 || formSaving || checkIncomplete;
            return (
              <button
                type="submit"
                disabled={isDisabled}
                title={checkIncomplete ? '請填寫支票付款必填欄位（付款日期、支票日期、票號、帳戶）' : ''}
                className={`px-6 py-2 rounded-lg ${isDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                {formSaving ? '儲存中…' : '儲存草稿'}
              </button>
            );
          })()}
        </div>
      </form>
    </div>
  );
}
