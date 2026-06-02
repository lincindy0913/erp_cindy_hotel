'use client';

import { SortableTh } from '@/components/SortableTh';

const STATUS_BADGES = {
  '暫估': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '待出納': 'bg-orange-100 text-orange-800 border-orange-300',
  '已預付': 'bg-blue-100 text-blue-800 border-blue-300',
  '已核實': 'bg-green-100 text-green-800 border-green-300',
  '跳過': 'bg-gray-100 text-gray-600 border-gray-300',
  '已結清': 'bg-blue-100 text-blue-800 border-blue-300'
};

function formatCurrency(val) {
  if (val === null || val === undefined) return '-';
  return Number(val).toLocaleString('zh-TW');
}

function formatDate(d) {
  if (!d) return '-';
  return d;
}

export default function RecordsTab({
  loans,
  records,
  recFilterLoan,
  setRecFilterLoan,
  recFilterYear,
  setRecFilterYear,
  recFilterMonth,
  setRecFilterMonth,
  recFilterStatus,
  setRecFilterStatus,
  sortedLoanRecords,
  loanRecKey,
  loanRecDir,
  toggleLoanRec,
  isLoggedIn,
  openConfirmModal,
  deleteRecord,
  now,
}) {
  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center">
        <select value={recFilterLoan} onChange={e => setRecFilterLoan(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部貸款</option>
          {loans.map(l => <option key={l.id} value={l.id}>{l.loanName}</option>)}
        </select>
        <select value={recFilterYear} onChange={e => setRecFilterYear(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
          {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select value={recFilterMonth} onChange={e => setRecFilterMonth(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部月份</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <select value={recFilterStatus} onChange={e => setRecFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部狀態</option>
          <option value="暫估">暫估</option>
          <option value="已核實">已核實</option>
          <option value="跳過">跳過</option>
        </select>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl shadow-sm" style={{ overflow: 'clip' }}>
        <div className="tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0 z-10">
              <tr>
                <SortableTh label="年/月" colKey="ym" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" />
                <SortableTh label="貸款編號" colKey="loanCode" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" />
                <SortableTh label="貸款名稱" colKey="loanName" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" />
                <SortableTh label="還款日" colKey="dueDate" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="center" />
                <SortableTh label="狀態" colKey="status" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="center" />
                <SortableTh label="暫估合計" colKey="estimatedTotal" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                <SortableTh label="實際本金" colKey="actualPrincipal" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                <SortableTh label="實際利息" colKey="actualInterest" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                <SortableTh label="實際合計" colKey="actualTotal" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="right" />
                <SortableTh label="核實日期" colKey="confirmedAt" sortKey={loanRecKey} sortDir={loanRecDir} onSort={toggleLoanRec} className="px-4 py-3" align="center" />
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-8 text-gray-400">暫無還款記錄</td>
                </tr>
              ) : sortedLoanRecords.map(rec => (
                <tr key={rec.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{rec.recordYear}/{String(rec.recordMonth).padStart(2, '0')}</td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{rec.loan?.loanCode}</td>
                  <td className="px-4 py-3">{rec.loan?.loanName}</td>
                  <td className="px-4 py-3 text-center">{formatDate(rec.dueDate)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${STATUS_BADGES[rec.status] || 'bg-gray-100'}`}>
                      {rec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(rec.estimatedTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualPrincipal !== null ? formatCurrency(rec.actualPrincipal) : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{rec.actualInterest !== null ? formatCurrency(rec.actualInterest) : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-green-700">{rec.actualTotal !== null ? formatCurrency(rec.actualTotal) : '-'}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{rec.confirmedAt ? rec.confirmedAt.split('T')[0] : '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {isLoggedIn && (
                      <div className="flex gap-1 justify-center">
                        {rec.status === '暫估' && (
                          <button onClick={() => openConfirmModal(rec)} className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                            核實
                          </button>
                        )}
                        <button onClick={() => deleteRecord(rec)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">
                          刪除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
