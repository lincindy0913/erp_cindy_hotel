'use client';

import Link from 'next/link';

function formatMoney(val) {
  if (val == null || isNaN(val)) return '0';
  return Number(val).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function RentalTab({
  rentalPayments, rentalReconLoading,
  rentalReconYear, setRentalReconYear,
  rentalReconMonth, setRentalReconMonth,
  rentalReconAccountId, setRentalReconAccountId,
  rentalReconMethodFilter, setRentalReconMethodFilter,
  rentalReconSearch, setRentalReconSearch,
  fetchRentalPayments,
  accounts,
}) {
  const filtered = rentalPayments.filter(p => {
    if (!rentalReconSearch) return true;
    const q = rentalReconSearch.toLowerCase();
    return (
      (p.propertyName || '').toLowerCase().includes(q) ||
      (p.tenantName || '').toLowerCase().includes(q) ||
      (p.matchTransferRef || '').toLowerCase().includes(q) ||
      (p.matchBankAccountName || '').toLowerCase().includes(q) ||
      (p.accountName || '').toLowerCase().includes(q) ||
      (p.accountCode || '').toLowerCase().includes(q)
    );
  });
  const totalAmount = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);
  const transferCount = filtered.filter(p => p.paymentMethod === 'transfer').length;
  const transferTotal = filtered.filter(p => p.paymentMethod === 'transfer').reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="f-35" className="text-sm font-medium text-gray-600">年份</label>
            <input id="f-35" type="number" value={rentalReconYear} onChange={e => setRentalReconYear(Number(e.target.value))}
              className="border rounded px-2 py-1 w-20 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-36" className="text-sm font-medium text-gray-600">月份</label>
            <select id="f-36" value={rentalReconMonth} onChange={e => setRentalReconMonth(e.target.value)}
              className="border rounded px-2 py-1 text-sm">
              <option value="">全部</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1} 月</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-25" className="text-sm font-medium text-gray-600">收款帳戶</label>
            <select id="f-25" value={rentalReconAccountId} onChange={e => setRentalReconAccountId(e.target.value)}
              className="border rounded px-2 py-1 text-sm min-w-[180px]">
              <option value="">全部收款帳戶</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.type ? `（${a.type}）` : ''}{a.warehouse ? ` · ${a.warehouse}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="f-37" className="text-sm font-medium text-gray-600">付款方式</label>
            <select id="f-37" value={rentalReconMethodFilter} onChange={e => setRentalReconMethodFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm">
              <option value="">全部</option>
              <option value="transfer">轉帳</option>
              <option value="現金">現金</option>
              <option value="支票">支票</option>
              <option value="匯款">匯款</option>
            </select>
          </div>
          <input type="text" value={rentalReconSearch} onChange={e => setRentalReconSearch(e.target.value)}
            placeholder="搜尋物業/租客/轉帳參考號/收款帳戶"
            className="border rounded px-2 py-1 text-sm w-48" />
          <button onClick={fetchRentalPayments} disabled={rentalReconLoading}
            className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded hover:bg-violet-700 disabled:opacity-50">
            {rentalReconLoading ? '載入中…' : '查詢'}
          </button>
          <Link href="/rentals?tab=cashier" target="_blank"
            className="text-xs text-violet-600 underline ml-2">前往收租工作台</Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-violet-500">
          <p className="text-xs text-gray-500">收款筆數</p>
          <p className="text-xl font-bold text-violet-700">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-green-500">
          <p className="text-xs text-gray-500">合計金額</p>
          <p className="text-xl font-bold text-green-700">${formatMoney(totalAmount)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">轉帳筆數</p>
          <p className="text-xl font-bold text-blue-700">{transferCount}</p>
          <p className="text-xs text-gray-400">${formatMoney(transferTotal)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-3 border-l-4 border-gray-400">
          <p className="text-xs text-gray-500">非轉帳筆數</p>
          <p className="text-xl font-bold text-gray-700">{filtered.length - transferCount}</p>
          <p className="text-xs text-gray-400">${formatMoney(totalAmount - transferTotal)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-violet-50 sticky top-0 z-10 border-b">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">收款日期</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">物業</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">租客</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">年/月</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600">金額</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">付款方式</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-teal-700">收款帳戶</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-violet-700">轉帳參考號</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-violet-700">匯款戶名</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600">備註</th>
            </tr>
          </thead>
          <tbody>
            {rentalReconLoading ? (
              <tr><td colSpan={10} className="text-center py-10 text-gray-400">載入中…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-10 text-gray-400">暫無資料</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="border-t hover:bg-violet-50">
                <td className="px-3 py-2 text-gray-700">{p.paymentDate}</td>
                <td className="px-3 py-2">{p.propertyName}</td>
                <td className="px-3 py-2 text-gray-600">{p.tenantName}</td>
                <td className="px-3 py-2 text-gray-500">{p.incomeYear}/{String(p.incomeMonth).padStart(2, '0')}</td>
                <td className="px-3 py-2 text-right font-medium text-green-700">${formatMoney(p.amount)}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${p.paymentMethod === 'transfer' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {p.paymentMethod === 'transfer' ? '轉帳' : (p.paymentMethod || '-')}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-teal-800" title={p.accountWarehouse || ''}>
                  <span className="font-medium">{p.accountName || '—'}</span>
                  {p.accountCode ? <span className="text-gray-400 ml-1">({p.accountCode})</span> : null}
                  {p.accountType ? <span className="block text-[10px] text-gray-400">{p.accountType}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-violet-700">{p.matchTransferRef || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{p.matchBankAccountName || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{p.matchNote || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
