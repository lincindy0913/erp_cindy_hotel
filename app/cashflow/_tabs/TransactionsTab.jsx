'use client';

import { SortableTh } from '@/components/SortableTh';

const TX_TYPES = ['收入', '支出', '移轉'];

export default function TransactionsTab({
  accounts,
  suppliers,
  warehouses,
  accountingSubjects,
  categories,
  isLoggedIn,
  noCatStats,
  setActiveTab,
  txFilter,
  setTxFilter,
  txPage,
  setTxPage,
  txPagination,
  transactions,
  sortedTransactions,
  cfTxKey,
  cfTxDir,
  cfTxToggle,
  showTxForm,
  setShowTxForm,
  txForm,
  setTxForm,
  handleCreateTransaction,
  handleDeleteTransaction,
  fetchTransactions,
  formatMoney,
  getAccountName,
  getSupplierName,
  getCategoriesForType,
}) {
  return (
    <div>
      {/* 未分類提示 */}
      {noCatStats && noCatStats.noCategory > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="text-amber-700">
            有 <strong>{noCatStats.noCategory}</strong> 筆交易未設定損益科目，損益表將顯示為「未分類」。
          </span>
          <button onClick={() => setActiveTab('category-mgmt')}
            className="text-amber-800 underline text-xs hover:text-amber-900">前往損益科目管理 →</button>
        </div>
      )}
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-3">
          <div>
            <label htmlFor="f-3" className="block text-sm font-medium text-gray-700 mb-1">起始日期</label>
            <input id="f-3"
              type="date"
              value={txFilter.startDate}
              onChange={(e) => setTxFilter({ ...txFilter, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="f-4" className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <input id="f-4"
              type="date"
              value={txFilter.endDate}
              onChange={(e) => setTxFilter({ ...txFilter, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="f-5" className="block text-sm font-medium text-gray-700 mb-1">館別</label>
            <select id="f-5"
              value={txFilter.warehouse}
              onChange={(e) => setTxFilter({ ...txFilter, warehouse: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-37" className="block text-sm font-medium text-gray-700 mb-1">交易類別</label>
            <select id="f-37"
              value={txFilter.type}
              onChange={(e) => setTxFilter({ ...txFilter, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="移轉入">移轉入</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-38" className="block text-sm font-medium text-gray-700 mb-1">帳戶</label>
            <select id="f-38"
              value={txFilter.accountId}
              onChange={(e) => setTxFilter({ ...txFilter, accountId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.warehouse}-{a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-39" className="block text-sm font-medium text-gray-700 mb-1">來源</label>
            <select id="f-39"
              value={txFilter.sourceType}
              onChange={(e) => setTxFilter({ ...txFilter, sourceType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">全部</option>
              <option value="pms_income_settlement">PMS結算</option>
              <option value="pms_income_fee">PMS手續費</option>
              <option value="pms_manual_commission">PMS佣金</option>
              <option value="cashier_payment">出納付款</option>
              <option value="loan_payment">貸款還款</option>
              <option value="rental_income">租賃收入</option>
              <option value="fixed_expense">固定費用</option>
              <option value="common_expense">一般費用</option>
              <option value="check_payment">支票</option>
              <option value="cash_count_adjustment">盤點調整</option>
              <option value="reversal">沖銷</option>
              <option value="engineering_income">工程收入</option>
              <option value="purchase_allowance">退貨收入</option>
              <option value="manual">手動</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-6" className="block text-sm font-medium text-gray-700 mb-1">會計科目</label>
            <select id="f-6"
              value={txFilter.accountingSubject}
              onChange={(e) => setTxFilter({ ...txFilter, accountingSubject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">全部科目</option>
              {(() => {
                const groups = {};
                for (const s of accountingSubjects) {
                  const cat = s.category || '其他';
                  if (!groups[cat]) groups[cat] = [];
                  groups[cat].push(s);
                }
                return Object.entries(groups).map(([cat, items]) => (
                  <optgroup key={cat} label={cat}>
                    {items
                      .slice()
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map(s => (
                        <option key={s.id} value={s.code}>
                          {s.code}　{s.name}
                        </option>
                      ))}
                  </optgroup>
                ));
              })()}
            </select>
          </div>
        </div>
        <button
          onClick={() => { setTxPage(1); fetchTransactions(1); }}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 text-sm"
        >
          查詢
        </button>
      </div>

      {/* Add transaction button */}
      {isLoggedIn && (
        <div className="mb-4">
          <button
            onClick={() => setShowTxForm(!showTxForm)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm"
          >
            + 新增交易
          </button>
        </div>
      )}

      {/* Transaction form */}
      {showTxForm && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border-2 border-emerald-200">
          <h3 className="text-lg font-semibold mb-4">新增資金交易</h3>
          <form onSubmit={handleCreateTransaction}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label htmlFor="f-7" className="block text-sm font-medium text-gray-700 mb-1">交易日期 *</label>
                <input id="f-7"
                  type="date"
                  required
                  value={txForm.transactionDate}
                  onChange={(e) => setTxForm({ ...txForm, transactionDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="f-8" className="block text-sm font-medium text-gray-700 mb-1">類別 *</label>
                <select id="f-8"
                  required
                  value={txForm.type}
                  onChange={(e) => setTxForm({ ...txForm, type: e.target.value, categoryId: '', transferAccountId: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-54" className="block text-sm font-medium text-gray-700 mb-1">
                  館別{txForm.type !== '移轉' ? ' *' : ''}
                </label>
                <select id="f-54"
                  value={txForm.warehouse}
                  onChange={(e) => setTxForm({ ...txForm, warehouse: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">選擇館別</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="f-55" className="block text-sm font-medium text-gray-700 mb-1">
                  {txForm.type === '移轉' ? '來源帳戶' : '帳戶'} *
                </label>
                <select id="f-55"
                  required
                  value={txForm.accountId}
                  onChange={(e) => setTxForm({ ...txForm, accountId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">選擇帳戶</option>
                  {accounts.filter(a => a.isActive).map(a => (
                    <option key={a.id} value={a.id}>{a.warehouse}-{a.name} ({a.type})</option>
                  ))}
                </select>
              </div>

              {txForm.type === '移轉' && (
                <div>
                  <label htmlFor="f-40" className="block text-sm font-medium text-gray-700 mb-1">目的帳戶 *</label>
                  <select id="f-40"
                    required
                    value={txForm.transferAccountId}
                    onChange={(e) => setTxForm({ ...txForm, transferAccountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">選擇目的帳戶</option>
                    {accounts.filter(a => a.isActive && String(a.id) !== String(txForm.accountId)).map(a => (
                      <option key={a.id} value={a.id}>{a.warehouse}-{a.name} ({a.type})</option>
                    ))}
                  </select>
                </div>
              )}

              {txForm.type !== '移轉' && (
                <div>
                  <label htmlFor="f-41" className="block text-sm font-medium text-gray-700 mb-1">資金類別</label>
                  <select id="f-41"
                    value={txForm.categoryId}
                    onChange={(e) => setTxForm({ ...txForm, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">選擇類別</option>
                    {getCategoriesForType(txForm.type).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {txForm.type !== '移轉' && (
              <div>
                <label htmlFor="f-42" className="block text-sm font-medium text-gray-700 mb-1">廠商 *</label>
                <select id="f-42"
                  value={txForm.supplierId}
                  onChange={(e) => setTxForm({ ...txForm, supplierId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">選擇廠商</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              )}

              <div>
                <label htmlFor="f-43" className="block text-sm font-medium text-gray-700 mb-1">金額 *</label>
                <input id="f-43"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={txForm.amount}
                  onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="f-9" className="block text-sm font-medium text-gray-700 mb-1">付款單號</label>
                <input id="f-9"
                  type="text"
                  value={txForm.paymentNo}
                  onChange={(e) => setTxForm({ ...txForm, paymentNo: e.target.value })}
                  placeholder="關聯付款單號"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="f-10" className="block text-sm font-medium text-gray-700 mb-1">付款條件</label>
                <select id="f-10"
                  value={txForm.paymentTerms}
                  onChange={(e) => setTxForm({ ...txForm, paymentTerms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">無</option>
                  <option value="月結">月結</option>
                  <option value="現金">現金</option>
                  <option value="支票">支票</option>
                  <option value="轉帳">轉帳</option>
                  <option value="信用卡">信用卡</option>
                  <option value="員工代付">員工代付</option>
                </select>
              </div>

              <div>
                <label htmlFor="f-56" className="block text-sm font-medium text-gray-700 mb-1">
                  會計科目{txForm.type !== '移轉' ? ' *' : ''}
                </label>
                <input id="f-56"
                  type="text"
                  value={txForm.accountingSubject}
                  onChange={(e) => setTxForm({ ...txForm, accountingSubject: e.target.value })}
                  placeholder="會計科目"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasFee"
                    checked={txForm.hasFee}
                    onChange={(e) => setTxForm({ ...txForm, hasFee: e.target.checked, fee: e.target.checked ? txForm.fee : '' })}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="hasFee" className="text-sm text-gray-700">有手續費</label>
                </div>
                {txForm.hasFee && (
                  <div className="flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={txForm.fee}
                      onChange={(e) => setTxForm({ ...txForm, fee: e.target.value })}
                      placeholder="手續費金額"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>

              <div className="col-span-2 md:col-span-4">
                <label htmlFor="f-11" className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <input id="f-11"
                  type="text"
                  value={txForm.description}
                  onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                  placeholder="備註說明"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Invoice section - required for non-transfer transactions */}
            {txForm.type !== '移轉' && (
              <div className="border-t border-gray-200 pt-4 mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">發票資訊（必填）</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label htmlFor="f-12" className="block text-sm font-medium text-gray-700 mb-1">發票號碼 *</label>
                    <input id="f-12"
                      type="text"
                      value={txForm.invoiceNo}
                      onChange={(e) => setTxForm({ ...txForm, invoiceNo: e.target.value })}
                      placeholder="AB-12345678"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-13" className="block text-sm font-medium text-gray-700 mb-1">發票金額 *</label>
                    <input id="f-13"
                      type="number"
                      step="0.01"
                      min="0"
                      value={txForm.invoiceAmount}
                      onChange={(e) => setTxForm({ ...txForm, invoiceAmount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-14" className="block text-sm font-medium text-gray-700 mb-1">發票日期 *</label>
                    <input id="f-14"
                      type="date"
                      value={txForm.invoiceDate}
                      onChange={(e) => setTxForm({ ...txForm, invoiceDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-15" className="block text-sm font-medium text-gray-700 mb-1">發票稅項 *</label>
                    <select id="f-15"
                      value={txForm.taxType}
                      onChange={(e) => setTxForm({ ...txForm, taxType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">選擇稅項</option>
                      <option value="應稅">應稅</option>
                      <option value="零稅率">零稅率</option>
                      <option value="免稅">免稅</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="f-16" className="block text-sm font-medium text-gray-700 mb-1">發票稅金 *</label>
                    <input id="f-16"
                      type="number"
                      step="0.01"
                      min="0"
                      value={txForm.taxAmount}
                      onChange={(e) => setTxForm({ ...txForm, taxAmount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Transfer info */}
            {txForm.type === '移轉' && txForm.accountId && txForm.transferAccountId && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm">
                系統將自動建立 2 筆交易：
                <strong>{getAccountName(parseInt(txForm.accountId))}</strong> 轉出 →
                <strong>{getAccountName(parseInt(txForm.transferAccountId))}</strong> 轉入。
                此交易不計入收入或支出。
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm">儲存</button>
              <button type="button" onClick={() => setShowTxForm(false)} className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">取消</button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction list */}
      <div className="bg-white rounded-lg shadow-sm tbl-wrap">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <SortableTh label="交易編號" colKey="transactionNo" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="日期" colKey="transactionDate" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="類別" colKey="type" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="館別" colKey="warehouse" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="帳戶" colKey="accountName" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="廠商" colKey="supplierName" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="會計科目" colKey="accountingSubject" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="付款單號" colKey="paymentNo" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="金額" colKey="amount" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" align="right" />
              <SortableTh label="手續費" colKey="fee" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" align="right" />
              <SortableTh label="備註" colKey="description" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
              <SortableTh label="來源" colKey="sourceType" sortKey={cfTxKey} sortDir={cfTxDir} onSort={cfTxToggle} className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                  尚無交易紀錄，請先查詢或新增交易
                </td>
              </tr>
            ) : (
              sortedTransactions.map((tx, idx) => (
                <tr key={tx.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-sm font-mono">{tx.transactionNo}</td>
                  <td className="px-3 py-2 text-sm">{tx.transactionDate}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      tx.type === '收入' ? 'bg-green-100 text-green-800' :
                      tx.type === '支出' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm">{tx.warehouse || '-'}</td>
                  <td className="px-3 py-2 text-sm">{tx.account ? `${tx.account.name}` : '-'}</td>
                  <td className="px-3 py-2 text-sm">{tx.supplier?.name || (tx.supplierId ? getSupplierName(tx.supplierId) : '-')}</td>
                  <td className="px-3 py-2 text-sm">
                    {tx.category?.accountingSubject ? (
                      <div>
                        <div className="font-mono text-xs">{tx.category.accountingSubject.code}</div>
                        <div className="text-xs text-gray-500">{tx.category.accountingSubject.name}</div>
                      </div>
                    ) : (tx.accountingSubject || '-')}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono">{tx.paymentNo || '-'}</td>
                  <td className={`px-3 py-2 text-sm text-right font-semibold ${
                    tx.type === '收入' || tx.type === '移轉入' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {tx.type === '收入' || tx.type === '移轉入' ? '+' : '-'}{formatMoney(tx.amount)}
                  </td>
                  <td className="px-3 py-2 text-sm text-right">
                    {tx.hasFee ? formatMoney(tx.fee) : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm truncate max-w-[150px]" title={tx.description || ''}>
                    {tx.description || '-'}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {tx.sourceType ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        tx.sourceType.startsWith('pms_') ? 'bg-teal-100 text-teal-700' :
                        tx.sourceType === 'cashier_payment' ? 'bg-amber-100 text-amber-700' :
                        tx.sourceType.startsWith('loan_') ? 'bg-purple-100 text-purple-700' :
                        tx.sourceType.startsWith('rental_') ? 'bg-indigo-100 text-indigo-700' :
                        tx.sourceType.startsWith('fixed_') || tx.sourceType.includes('expense') ? 'bg-orange-100 text-orange-700' :
                        tx.sourceType.startsWith('check_') ? 'bg-cyan-100 text-cyan-700' :
                        tx.sourceType.startsWith('cash_count') ? 'bg-pink-100 text-pink-700' :
                        tx.sourceType === 'engineering_income' ? 'bg-blue-100 text-blue-700' :
                        tx.sourceType === 'purchase_allowance' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {{
                          pms_income_settlement: 'PMS結算',
                          pms_income_fee: 'PMS手續費',
                          pms_manual_commission: 'PMS佣金',
                          cashier_payment: '出納付款',
                          loan_payment: '貸款還款',
                          rental_income: '租賃收入',
                          rental_deposit_in: '租賃押金收',
                          rental_deposit_out: '租賃押金退',
                          rental_maintenance: '租賃維修',
                          rental_tax: '租賃稅費',
                          fixed_expense: '固定費用',
                          common_expense: '一般費用',
                          purchase_expense: '採購費用',
                          check_payment: '支票付款',
                          check_receipt: '支票收款',
                          check_bounce: '支票退票',
                          cash_count_adjustment: '盤點調整',
                          cash_count_shortage: '盤點短缺',
                          reversal: '沖銷',
                          reconciliation_adjustment: '對帳調整',
                          engineering_income: '工程收入',
                          purchase_allowance: '退貨收入',
                          manual: '手動',
                        }[tx.sourceType] || tx.sourceType}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">手動</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {txPagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-gray-600">
            共 {txPagination.totalCount.toLocaleString()} 筆，第 {txPagination.page}/{txPagination.totalPages} 頁
          </div>
          <div className="flex gap-1">
            <button
              disabled={txPagination.page <= 1}
              onClick={() => { const p = txPagination.page - 1; setTxPage(p); fetchTransactions(p); }}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-100"
            >上一頁</button>
            {Array.from({ length: Math.min(txPagination.totalPages, 7) }, (_, i) => {
              let pageNum;
              if (txPagination.totalPages <= 7) {
                pageNum = i + 1;
              } else if (txPagination.page <= 4) {
                pageNum = i + 1;
              } else if (txPagination.page >= txPagination.totalPages - 3) {
                pageNum = txPagination.totalPages - 6 + i;
              } else {
                pageNum = txPagination.page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => { setTxPage(pageNum); fetchTransactions(pageNum); }}
                  className={`px-3 py-1 text-sm border rounded ${
                    pageNum === txPagination.page ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-gray-100'
                  }`}
                >{pageNum}</button>
              );
            })}
            <button
              disabled={txPagination.page >= txPagination.totalPages}
              onClick={() => { const p = txPagination.page + 1; setTxPage(p); fetchTransactions(p); }}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-100"
            >下一頁</button>
          </div>
        </div>
      )}
    </div>
  );
}
