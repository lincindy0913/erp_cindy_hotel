'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { SortableTh } from '@/components/SortableTh';

export default function ListView({
  // data
  mergedListForDisplay,
  invoiceTitles,
  products,
  loading,
  invoiceTotal,
  invoicePage,
  invoiceTotalPages,
  // search filters
  searchSupplier,
  searchInvoiceTitle,
  searchWarehouse,
  searchInvoiceType,
  searchDateFrom,
  searchDateTo,
  setSearchSupplier,
  setSearchInvoiceTitle,
  setSearchWarehouse,
  setSearchInvoiceType,
  setSearchDateFrom,
  setSearchDateTo,
  // sort
  saleInvKey,
  saleInvDir,
  toggleSaleInv,
  // checked for print
  checkedInvoiceIds,
  setCheckedInvoiceIds,
  // expand
  expandedInvoices,
  handleViewDetails,
  // actions
  fetchInvoices,
  handleEdit,
  handleDelete,
  handlePrintInvoices,
  isLoggedIn,
  // helpers
  getSupplierName,
}) {
  const router = useRouter();

  return (
    <>
    {/* 搜尋列 */}
    <div className="mb-4 bg-white rounded-lg shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchSupplier}
          onChange={(e) => setSearchSupplier(e.target.value)}
          placeholder="搜尋廠商名稱..."
          className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <select
          value={searchInvoiceTitle}
          onChange={(e) => setSearchInvoiceTitle(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="">全部抬頭</option>
          {invoiceTitles.map(t => (
            <option key={t.id} value={t.title}>{t.title}</option>
          ))}
        </select>
        <select
          value={searchWarehouse}
          onChange={(e) => setSearchWarehouse(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="">全部館別</option>
          <option value="麗格">麗格</option>
          <option value="麗軒">麗軒</option>
          <option value="民宿">民宿</option>
        </select>
        <select
          value={searchInvoiceType}
          onChange={(e) => setSearchInvoiceType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="">全部來源</option>
          <option value="進貨單">進貨單</option>
          <option value="租屋支出">租屋支出</option>
          <option value="固定費用">固定費用</option>
          <option value="折讓">折讓</option>
        </select>
        <div className="flex items-center gap-2">
          <label htmlFor="f-15" className="text-sm text-gray-600">起始日期</label>
          <input id="f-15"
            type="date"
            value={searchDateFrom}
            onChange={(e) => setSearchDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="f-16" className="text-sm text-gray-600">結束日期</label>
          <input id="f-16"
            type="date"
            value={searchDateTo}
            onChange={(e) => setSearchDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <button
          onClick={() => fetchInvoices(1)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          搜尋
        </button>
        {(searchSupplier || searchDateFrom || searchDateTo || searchInvoiceTitle || searchWarehouse || searchInvoiceType) && (
          <button
            onClick={() => {
              setSearchSupplier(''); setSearchDateFrom(''); setSearchDateTo('');
              setSearchInvoiceTitle(''); setSearchWarehouse(''); setSearchInvoiceType('');
              setTimeout(() => fetchInvoices(1), 0);
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            清除篩選
          </button>
        )}
      </div>
      {/* 列印按鈕列 */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={() => {
            const invoiceOnly = mergedListForDisplay.filter(i => !i._isAllowance);
            if (checkedInvoiceIds.size === invoiceOnly.length) {
              setCheckedInvoiceIds(new Set());
            } else {
              setCheckedInvoiceIds(new Set(invoiceOnly.map(inv => inv.id)));
            }
          }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          {checkedInvoiceIds.size === mergedListForDisplay.filter(i => !i._isAllowance).length && mergedListForDisplay.filter(i => !i._isAllowance).length > 0 ? '取消全選' : '全選'}
        </button>
        <span className="text-sm text-gray-500">
          已選 {checkedInvoiceIds.size} 筆
        </span>
        <button
          onClick={() => handlePrintInvoices()}
          disabled={checkedInvoiceIds.size === 0}
          className={`px-4 py-1.5 text-sm rounded-lg ${
            checkedInvoiceIds.size === 0
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          列印選取的發票
        </button>
      </div>
    </div>

    {/* 列表 */}
    <div className="bg-white rounded-lg shadow-sm tbl-wrap">
      <table className="w-full">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-3 w-10">
              <input
                type="checkbox"
                checked={checkedInvoiceIds.size === mergedListForDisplay.filter(i => !i._isAllowance).length && mergedListForDisplay.filter(i => !i._isAllowance).length > 0}
                onChange={() => {
                  const invoiceOnly = mergedListForDisplay.filter(i => !i._isAllowance);
                  if (checkedInvoiceIds.size === invoiceOnly.length) {
                    setCheckedInvoiceIds(new Set());
                  } else {
                    setCheckedInvoiceIds(new Set(invoiceOnly.map(inv => inv.id)));
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <SortableTh label="館別" colKey="warehouse" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <SortableTh label="發票抬頭" colKey="invoiceTitle" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <SortableTh label="廠商" colKey="supplierName" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <SortableTh label="發票號" colKey="invoiceNo" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <SortableTh label="發票日期" colKey="invoiceDate" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <SortableTh label="品項數" colKey="itemCount" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <SortableTh label="總金額" colKey="totalAmount" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" align="right" />
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">類型</th>
            <SortableTh label="付款狀態" colKey="paymentStatus" sortKey={saleInvKey} sortDir={saleInvDir} onSort={toggleSaleInv} className="px-4 py-3" />
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan="11" className="px-4 py-8 text-center text-gray-500">
                載入中...
              </td>
            </tr>
          ) : mergedListForDisplay.length === 0 ? (
            <tr>
              <td colSpan="11" className="px-4 py-8 text-center text-gray-500">
                {invoiceTotal === 0 ? '尚無符合條件的發票，請調整篩選條件' : '無符合篩選的發票'}
              </td>
            </tr>
          ) : (
            mergedListForDisplay.map((invoice, index) => {
              if (invoice._isAllowance) {
                return (
                  <tr key={invoice.id} className="bg-red-50 hover:bg-red-100 border-l-4 border-red-400">
                    <td className="px-3 py-3" />
                    <td className="px-4 py-3 text-sm">{invoice.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">-</td>
                    <td className="px-4 py-3 text-sm">{invoice.supplierName}</td>
                    <td className="px-4 py-3 text-sm font-mono text-red-700">{invoice.invoiceNo}</td>
                    <td className="px-4 py-3 text-sm">{invoice.invoiceDate}</td>
                    <td className="px-4 py-3 text-sm">{invoice.items.length > 0 ? `${invoice.items.length} 項` : '-'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-700">
                      - NT$ {Math.abs(invoice.totalAmount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-700 font-semibold">折讓</span>
                      {invoice.reason && <span className="ml-1 text-xs text-gray-500">{invoice.reason}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">{invoice.paymentStatus || '已確認'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">-</td>
                  </tr>
                );
              }
              const isExpanded = expandedInvoices.has(invoice.id);
              return (
                <Fragment key={invoice.id}>
                  <tr className={index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={checkedInvoiceIds.has(invoice.id)}
                        onChange={() => {
                          const next = new Set(checkedInvoiceIds);
                          if (next.has(invoice.id)) next.delete(invoice.id);
                          else next.add(invoice.id);
                          setCheckedInvoiceIds(next);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">{invoice.warehouse || '-'}</td>
                    <td className="px-4 py-3 text-sm">{invoice.invoiceTitle || '-'}</td>
                    <td className="px-4 py-3 text-sm">{invoice.supplierName || '-'}</td>
                    <td className="px-4 py-3 text-sm">{invoice.invoiceNo || invoice.salesNo}</td>
                    <td className="px-4 py-3 text-sm">{invoice.invoiceDate || invoice.salesDate}</td>
                    <td className="px-4 py-3 text-sm">{invoice.items ? invoice.items.length : 0} 項</td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-1">
                        {invoice.invoiceType === '業主私帳' && <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-800">業主發票私帳</span>}
                        {invoice.invoiceType === '租屋支出' && <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800">租屋支出</span>}
                        {invoice.invoiceType === '固定費用' && <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">固定費用</span>}
                        {(!invoice.invoiceType || invoice.invoiceType === '進貨單') && <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">進貨單</span>}
                        {invoice.status === '已退貨' && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200" title="已確認全額退貨">全額退貨</span>
                        )}
                        {invoice.status === '部分退貨' && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200" title="已確認部分退貨">部分退貨</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        invoice.paymentStatus === '已付款' ? 'bg-green-100 text-green-800' :
                        invoice.paymentStatus === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                        invoice.paymentStatus === '草稿' ? 'bg-gray-100 text-gray-800' :
                        invoice.paymentStatus === '已代墊' ? 'bg-purple-100 text-purple-800' :
                        invoice.paymentStatus === '已退貨' ? 'bg-orange-100 text-orange-800' :
                        invoice.paymentStatus === '部分退貨' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {invoice.paymentStatus || '未付款'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewDetails(invoice.id)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          {isExpanded ? '收起' : '查看'}
                        </button>
                        {isLoggedIn && (
                          <>
                            {!['草稿', '待出納', '已付款', '已退貨', '部分退貨'].includes(invoice.paymentStatus) && (
                              <button
                                onClick={() => handleEdit(invoice)}
                                className="text-green-600 hover:underline text-sm"
                              >
                                編輯
                              </button>
                            )}
                            {!['草稿', '待出納', '已付款', '已退貨', '部分退貨'].includes(invoice.paymentStatus) && (
                              <button
                                onClick={() => handleDelete(invoice.id)}
                                className="text-red-600 hover:underline text-sm"
                              >
                                刪除
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* 展開的詳細資訊 */}
                  {isExpanded && (
                    <tr className="bg-blue-50">
                      <td colSpan="11" className="px-4 py-4">
                        <div className="space-y-4">
                          {/* 發票基本資訊 */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-gray-300">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">發票號</div>
                              <div className="text-sm font-semibold">{invoice.invoiceNo || invoice.salesNo}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">發票日期</div>
                              <div className="text-sm font-semibold">{invoice.invoiceDate || invoice.salesDate}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">狀態</div>
                              <div className="text-sm">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  invoice.status === '已核銷' ? 'bg-green-100 text-green-800' :
                                  invoice.status === '待核銷' ? 'bg-yellow-100 text-yellow-800' :
                                  invoice.status === '已退貨' ? 'bg-orange-100 text-orange-800' :
                                  invoice.status === '部分退貨' ? 'bg-amber-100 text-amber-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {invoice.status || '待核銷'}
                                </span>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">品項數</div>
                              <div className="text-sm font-semibold">{invoice.items ? invoice.items.length : 0} 項</div>
                            </div>
                          </div>

                          {/* 金額資訊 */}
                          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-gray-300">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">小計</div>
                              <div className="text-sm font-semibold">
                                NT$ {parseFloat(invoice.amount || 0).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">稅額 (5%)</div>
                              <div className="text-sm font-semibold">
                                NT$ {parseFloat(invoice.tax || 0).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">總金額</div>
                              <div className="text-lg font-bold text-blue-600">
                                NT$ {parseFloat(invoice.totalAmount || invoice.amount + invoice.tax || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>

                          {/* 核銷品項列表 */}
                          {invoice.items && invoice.items.length > 0 && (
                            <div>
                              <div className="text-sm font-semibold mb-3 text-gray-700">核銷品項詳情</div>
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-100 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">序號</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">進貨單號</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">進貨日期</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">廠商</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">產品</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">數量</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">單價</th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">小計</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">備註</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 bg-white">
                                    {invoice.items.map((item, idx) => {
                                      const product = products.find(p => p.id === item.productId);
                                      const subtotal = (item.quantity || 0) * (item.unitPrice || 0);
                                      return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                          <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                                          <td className="px-3 py-2 font-medium">
                                            {item.purchaseNo ? (
                                              <button
                                                type="button"
                                                onClick={() => router.push(`/purchasing?editPurchaseNo=${encodeURIComponent(item.purchaseNo)}`)}
                                                className="text-blue-600 hover:underline"
                                              >
                                                {item.purchaseNo}
                                              </button>
                                            ) : '-'}
                                          </td>
                                          <td className="px-3 py-2 text-gray-600">{item.purchaseDate || '-'}</td>
                                          <td className="px-3 py-2">{item.supplierId ? getSupplierName(item.supplierId) : '未知廠商'}</td>
                                          <td className="px-3 py-2">{product ? product.name : '未知商品'}</td>
                                          <td className="px-3 py-2 text-right">{item.quantity || 0}</td>
                                          <td className="px-3 py-2 text-right">NT$ {parseFloat(item.unitPrice || 0).toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right font-semibold">NT$ {subtotal.toFixed(2)}</td>
                                          <td className="px-3 py-2 text-gray-500 text-xs">{item.note || '-'}</td>
                                        </tr>
                                      );
                                    })}
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

      {/* 分頁控制 */}
      {invoiceTotalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <span className="text-sm text-gray-500">
            共 {invoiceTotal} 筆，第 {invoicePage} / {invoiceTotalPages} 頁
          </span>
          <div className="flex gap-2">
            <button
              disabled={invoicePage <= 1}
              onClick={() => fetchInvoices(invoicePage - 1)}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
            >上一頁</button>
            {(() => {
              const pages = [];
              if (invoiceTotalPages <= 7) {
                for (let i = 1; i <= invoiceTotalPages; i++) pages.push(i);
              } else {
                for (let i = 1; i <= Math.min(3, invoiceTotalPages); i++) pages.push(i);
                if (invoicePage > 4) pages.push('…');
                for (let i = Math.max(invoicePage - 1, 4); i <= Math.min(invoicePage + 1, invoiceTotalPages - 3); i++) pages.push(i);
                if (invoicePage < invoiceTotalPages - 3) pages.push('…');
                for (let i = Math.max(invoiceTotalPages - 2, 4); i <= invoiceTotalPages; i++) pages.push(i);
              }
              return [...new Set(pages)].map((p, idx) =>
                p === '…' ? <span key={`e${idx}`} className="px-2 py-1 text-gray-400">…</span> :
                <button key={p} onClick={() => fetchInvoices(p)}
                  className={`px-3 py-1 border rounded text-sm ${p === invoicePage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
                  {p}
                </button>
              );
            })()}
            <button
              disabled={invoicePage >= invoiceTotalPages}
              onClick={() => fetchInvoices(invoicePage + 1)}
              className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
            >下一頁</button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
