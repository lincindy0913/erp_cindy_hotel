'use client';

import { formatNum } from '@/lib/format-utils';
import CheckTable from './CheckTable';

export default function PendingTab({
  summary,
  selectedIds, setSelectedIds, toggleSelectId,
  openBatchClearModal,
  checksPagination, goToPage,
  pendingPayable, pendingReceivable,
  sortedPendingPayable, chkPPk, chkPPd, chkPPt,
  sortedPendingReceivable, chkPRk, chkPRd, chkPRt,
  deletingCheckId, reissueLoading,
  openClear, openVoid, openEdit,
  handleDelete, handleReissue,
}) {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
            <div className="text-sm text-red-600 font-medium">逾期應付</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{summary.overduePayable?.count || 0}</div>
            <div className="text-base text-red-500">${formatNum(summary.overduePayable?.total)}</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
            <div className="text-sm text-orange-600 font-medium">逾期應收</div>
            <div className="text-2xl font-bold text-orange-700 mt-1">{summary.overdueReceivable?.count || 0}</div>
            <div className="text-base text-orange-500">${formatNum(summary.overdueReceivable?.total)}</div>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
            <div className="text-sm text-yellow-700 font-medium">7日內到期</div>
            <div className="text-2xl font-bold text-yellow-800 mt-1">{summary.dueSoon7?.count || 0}</div>
            <div className="text-base text-yellow-600">${formatNum(summary.dueSoon7?.total)}</div>
          </div>
          <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
            <div className="text-sm text-violet-600 font-medium">30日內到期</div>
            <div className="text-2xl font-bold text-violet-700 mt-1">{summary.dueSoon30?.count || 0}</div>
            <div className="text-base text-violet-500">${formatNum(summary.dueSoon30?.total)}</div>
          </div>
        </div>
      )}

      {/* Batch clear bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 px-4 py-3 rounded-lg border border-violet-200">
          <span className="text-base text-violet-700">已選擇 {selectedIds.length} 張支票</span>
          <button onClick={openBatchClearModal}
            className="px-4 py-1.5 text-base bg-violet-600 text-white rounded-lg hover:bg-violet-700">
            批次兌現
          </button>
          <button onClick={() => setSelectedIds([])}
            className="px-3 py-1.5 text-base border border-violet-300 text-violet-600 rounded-lg hover:bg-violet-100">
            取消選擇
          </button>
        </div>
      )}

      {/* Pagination */}
      {checksPagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm">
          <span className="text-gray-500">
            共 {checksPagination.total.toLocaleString()} 筆，第 {checksPagination.page} / {checksPagination.totalPages} 頁
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(1)} disabled={checksPagination.page === 1}
              className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50">«</button>
            <button onClick={() => goToPage(checksPagination.page - 1)} disabled={checksPagination.page === 1}
              className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50">‹</button>
            {Array.from({ length: Math.min(5, checksPagination.totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(checksPagination.page - 2, checksPagination.totalPages - 4));
              const p = start + i;
              return (
                <button key={p} onClick={() => goToPage(p)}
                  className={`px-2 py-1 rounded border text-sm ${p === checksPagination.page ? 'bg-violet-600 text-white border-violet-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => goToPage(checksPagination.page + 1)} disabled={checksPagination.page === checksPagination.totalPages}
              className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50">›</button>
            <button onClick={() => goToPage(checksPagination.totalPages)} disabled={checksPagination.page === checksPagination.totalPages}
              className="px-2 py-1 rounded border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50">»</button>
          </div>
        </div>
      )}

      {/* Payable section */}
      <div>
        <h3 className="text-lg font-bold text-gray-700 mb-2 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-400"></span>
          應付支票 ({pendingPayable.length})
        </h3>
        <CheckTable data={sortedPendingPayable} showActions={true} showSelect={true}
          sortKey={chkPPk} sortDir={chkPPd} toggleSort={chkPPt}
          selectedIds={selectedIds} setSelectedIds={setSelectedIds} toggleSelectId={toggleSelectId}
          deletingCheckId={deletingCheckId} reissueLoading={reissueLoading}
          openClear={openClear} openVoid={openVoid} openEdit={openEdit}
          handleDelete={handleDelete} handleReissue={handleReissue} />
      </div>

      {/* Receivable section */}
      <div>
        <h3 className="text-lg font-bold text-gray-700 mb-2 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-400"></span>
          應收支票 ({pendingReceivable.length})
        </h3>
        <CheckTable data={sortedPendingReceivable} showActions={true} showSelect={true}
          sortKey={chkPRk} sortDir={chkPRd} toggleSort={chkPRt}
          selectedIds={selectedIds} setSelectedIds={setSelectedIds} toggleSelectId={toggleSelectId}
          deletingCheckId={deletingCheckId} reissueLoading={reissueLoading}
          openClear={openClear} openVoid={openVoid} openEdit={openEdit}
          handleDelete={handleDelete} handleReissue={handleReissue} />
      </div>
    </div>
  );
}
