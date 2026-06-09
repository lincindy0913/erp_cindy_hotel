'use client';

import { SortableTh } from '@/components/SortableTh';
import { formatNum } from '@/lib/format-utils';
import { StatusBadge, getDueDateColor, getDueDateLabel } from './shared';

export default function CheckTable({
  data,
  showActions = true,
  showSelect = false,
  sortKey,
  sortDir,
  toggleSort,
  selectedIds,
  setSelectedIds,
  toggleSelectId,
  deletingCheckId,
  reissueLoading,
  openClear,
  openVoid,
  openEdit,
  handleDelete,
  handleReissue,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-base">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr className="bg-gray-50">
            {showSelect && (
              <th className="px-3 py-2 text-left w-10">
                <input type="checkbox"
                  checked={data.length > 0 && data.every(c => selectedIds.includes(c.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(prev => [...new Set([...prev, ...data.map(c => c.id)])]);
                    else setSelectedIds(prev => prev.filter(id => !data.some(c => c.id === id)));
                  }} />
              </th>
            )}
            <SortableTh label="狀態" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
            <SortableTh label="支票號碼" colKey="checkNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
            <SortableTh label="類型" colKey="checkTypeLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
            <SortableTh label="金額" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" align="right" />
            <SortableTh label="到期日" colKey="dueDate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
            <SortableTh label="帳戶" colKey="account" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
            <SortableTh label="館別" colKey="warehouse" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
            {showActions && <th className="px-3 py-2 text-center text-base font-medium text-gray-700">操作</th>}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={showSelect ? 9 : 8} className="px-3 py-8 text-center text-gray-400">無資料</td></tr>
          ) : data.map(c => (
            <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
              {showSelect && (
                <td className="px-3 py-2">
                  {(c.status === 'pending' || c.status === 'due') && (
                    <input type="checkbox" checked={selectedIds.includes(c.id)}
                      onChange={() => toggleSelectId(c.id)} />
                  )}
                </td>
              )}
              <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
              <td className="px-3 py-2">
                <span className="font-mono text-sm">{c.checkNumber}</span>
                {c.reissueOfCheck && (
                  <span className="block text-sm text-amber-600 mt-0.5">重新開票（原退票 {c.reissueOfCheck.checkNo}）</span>
                )}
              </td>
              <td className="px-3 py-2">{c.checkType === 'payable' ? '應付' : '應收'}</td>
              <td className="px-3 py-2 text-right font-medium">${formatNum(c.amount)}</td>
              <td className={`px-3 py-2 ${getDueDateColor(c.dueDate)}`}>
                {c.dueDate}
                <span className="text-sm ml-1">{(c.status === 'pending' || c.status === 'due') ? getDueDateLabel(c.dueDate) : ''}</span>
              </td>
              <td className="px-3 py-2 text-sm">
                {c.checkType === 'payable' ? c.sourceAccount?.name : c.destinationAccount?.name}
              </td>
              <td className="px-3 py-2">{c.warehouse || '-'}</td>
              {showActions && (
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {(c.status === 'pending' || c.status === 'due') && (
                      <>
                        <button onClick={() => openClear(c)}
                          className="px-2 py-1 text-sm bg-green-50 text-green-700 rounded hover:bg-green-100">兌現</button>
                        <button onClick={() => openVoid(c)}
                          className="px-2 py-1 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200">作廢</button>
                        <button onClick={() => openEdit(c)}
                          className="px-2 py-1 text-sm bg-violet-50 text-violet-700 rounded hover:bg-violet-100">編輯</button>
                      </>
                    )}
                    {c.status === 'bounced' && c.checkType === 'payable' && (
                      <>
                        {(c.reissuedByChecks || []).length > 0 ? (
                          <span className="text-sm text-green-600">已重新開票 → {c.reissuedByChecks[0].checkNo}</span>
                        ) : (
                          <button
                            onClick={() => handleReissue(c)}
                            disabled={reissueLoading === c.id}
                            className="px-2 py-1 text-sm bg-amber-50 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50">
                            {reissueLoading === c.id ? '處理中…' : '重新開票'}
                          </button>
                        )}
                      </>
                    )}
                    {c.status === 'pending' && (
                      <button onClick={() => handleDelete(c)} disabled={deletingCheckId === c.id}
                        className="px-2 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
                        {deletingCheckId === c.id ? '刪除中…' : '刪除'}
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
