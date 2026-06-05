'use client';

import FetchErrorBanner from '@/components/FetchErrorBanner';
import ExportButtons from '@/components/ExportButtons';
import WhQuickBtns from '../_components/WhQuickBtns';

export default function OtaCommissionTab({
  otaWarehouse, setOtaWarehouse,
  commSource, setCommSource,
  commHistRows, commHistLoading, commHistError,
  commEditId, setCommEditId,
  commEditData, setCommEditData,
  commEditSaving,
  reconLogs, reconLogsLoading, reconLogsError,
  warehouseList,
  fetchCommHistory,
  fetchReconLogs,
  saveEditComm,
  startEditComm,
  confirmCommission,
  cancelCommission,
}) {
  return (
    <div>
      {/* KPI 摘要 */}
      {commHistRows.length > 0 && (() => {
        const active     = commHistRows.filter(r => r.status !== '已取消');
        const totalAmt   = active.reduce((s, r) => s + Number(r.commissionAmount), 0);
        const draftAmt   = active.filter(r => r.status === '草稿').reduce((s, r) => s + Number(r.commissionAmount), 0);
        const paidAmt    = active.filter(r => r.status === '已付款' || r.paymentOrder?.status === '已執行').reduce((s, r) => s + Number(r.commissionAmount), 0);
        const pendingAmt = active.filter(r => r.status === '待出納').reduce((s, r) => s + Number(r.commissionAmount), 0);
        const draftCnt   = active.filter(r => r.status === '草稿').length;
        const pendingCnt = active.filter(r => r.status === '待出納').length;
        const paidCnt    = active.filter(r => r.status === '已付款' || r.paymentOrder?.status === '已執行').length;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-1">傭金總額（有效）</div>
              <div className="text-xl font-bold text-gray-800">NT$ {totalAmt.toLocaleString()}</div>
              <div className="text-xs text-gray-400 mt-1">{active.length} 筆</div>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
              <div className="text-xs text-blue-400 mb-1">草稿（待確認）</div>
              <div className="text-xl font-bold text-blue-600">NT$ {draftAmt.toLocaleString()}</div>
              <div className="text-xs text-blue-400 mt-1">{draftCnt} 筆</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-1">待出納</div>
              <div className="text-xl font-bold text-amber-600">NT$ {pendingAmt.toLocaleString()}</div>
              <div className="text-xs text-gray-400 mt-1">{pendingCnt} 筆</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-1">已付款</div>
              <div className="text-xl font-bold text-green-600">NT$ {paidAmt.toLocaleString()}</div>
              <div className="text-xs text-gray-400 mt-1">{paidCnt} 筆</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-xs text-gray-400 mb-1">已付款率</div>
              <div className="text-xl font-bold text-indigo-600">
                {totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0}%
              </div>
              <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full"
                  style={{ width: `${totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        );
      })()}

      <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cs" className="block text-xs text-gray-500 mb-1">OTA 來源</label>
          <select id="cs" className="border rounded-lg px-3 py-1.5 text-sm"
            value={commSource} onChange={e => setCommSource(e.target.value)}>
            <option value="">全部</option>
            <option value="Booking">Booking.com</option>
            <option value="Agoda">Agoda</option>
            <option value="Expedia">Expedia</option>
          </select>
        </div>
        <div>
          <label htmlFor="f" className="block text-xs text-gray-500 mb-1">館別</label>
          <select id="f" className="border rounded-lg px-3 py-1.5 text-sm"
            value={otaWarehouse} onChange={e => setOtaWarehouse(e.target.value)}>
            <option value="">全部</option>
            {warehouseList.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <WhQuickBtns list={warehouseList} value={otaWarehouse} onChange={setOtaWarehouse} />
        </div>
        <button onClick={fetchCommHistory} disabled={commHistLoading}
          className="px-5 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {commHistLoading ? '載入中…' : '重新整理'}
        </button>
        {commHistRows.length > 0 && (
          <ExportButtons
            data={commHistRows.map(r => ({
              ...r,
              poStatus: r.paymentOrder?.status || '',
              orderNo: r.paymentOrder?.orderNo || '',
            }))}
            columns={[
              { header: '月份',     key: 'commissionMonth' },
              { header: 'OTA來源',  key: 'otaSource' },
              { header: '館別',     key: 'warehouse' },
              { header: '傭金金額',  key: 'commissionAmount', format: 'number' },
              { header: '付款方式',  key: 'paymentMethod' },
              { header: '廠商',     key: 'supplierName' },
              { header: '傭金狀態',  key: 'status' },
              { header: '出納狀態',  key: 'poStatus' },
              { header: '付款單號',  key: 'orderNo' },
              { header: '確認者',   key: 'confirmedBy' },
              { header: '備註',     key: 'note' },
            ]}
            filename={`OTA傭金_${otaWarehouse || '全部'}`}
            title="OTA 傭金記錄"
          />
        )}
      </div>
      {commHistError && <FetchErrorBanner message={commHistError} onRetry={fetchCommHistory} />}

      <div className="bg-white rounded-xl shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-gray-500">
              <th className="px-3 py-2 text-left">月份</th>
              <th className="px-3 py-2 text-left">OTA 來源</th>
              <th className="px-3 py-2 text-left">館別</th>
              <th className="px-3 py-2 text-right">傭金金額</th>
              <th className="px-3 py-2 text-left">付款方式</th>
              <th className="px-3 py-2 text-left">廠商</th>
              <th className="px-3 py-2 text-center">傭金狀態</th>
              <th className="px-3 py-2 text-center">出納狀態</th>
              <th className="px-3 py-2 text-left">付款單號</th>
              <th className="px-3 py-2 text-left">確認者</th>
              <th className="px-3 py-2 text-left">備註</th>
              <th className="px-3 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {commHistLoading && (
              <tr><td colSpan={12} className="text-center py-8 text-gray-400">載入中…</td></tr>
            )}
            {!commHistLoading && commHistRows.length === 0 && (
              <tr><td colSpan={12} className="text-center py-8 text-gray-400">尚無傭金記錄</td></tr>
            )}
            {commHistRows.map(r => {
              const isPaid      = r.status === '已付款' || r.paymentOrder?.status === '已執行';
              const isCancelled = r.status === '已取消';
              const isDraft     = r.status === '草稿';
              const isPending   = r.status === '待出納' && !isPaid;
              const isEditing   = commEditId === r.id;
              const statusColor = isCancelled ? 'bg-gray-100 text-gray-400'
                : isPaid    ? 'bg-green-100 text-green-700'
                : isDraft   ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700';
              const statusLabel = isCancelled ? '已取消' : isPaid ? '已付款' : r.status;
              const poColor = !r.paymentOrder ? ''
                : (r.paymentOrder.status === '已執行' || r.paymentOrder.status === '已付款') ? 'text-green-600 font-semibold'
                : r.paymentOrder.status === '已取消' ? 'text-gray-400 line-through'
                : 'text-amber-600';
              const canEdit = (isDraft || isPending) && !isPaid && !isCancelled;
              return (
                <tr key={r.id} className={`hover:bg-gray-50 ${isCancelled ? 'opacity-50' : ''} ${isDraft ? 'bg-blue-50/40' : ''} ${isEditing ? 'bg-indigo-50' : ''}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono">{r.commissionMonth}</td>
                  <td className="px-3 py-2.5">{r.otaSource}</td>
                  <td className="px-3 py-2.5 text-gray-500">{r.warehouse}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                    {isEditing ? (
                      <input type="number" min="1" step="1"
                        className="border rounded px-2 py-0.5 w-28 text-right text-sm"
                        value={commEditData.commissionAmount}
                        onChange={e => setCommEditData(p => ({ ...p, commissionAmount: e.target.value }))} />
                    ) : `NT$ ${r.commissionAmount.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {isEditing ? (
                      <select className="border rounded px-2 py-0.5 text-sm"
                        value={commEditData.paymentMethod}
                        onChange={e => setCommEditData(p => ({ ...p, paymentMethod: e.target.value }))}>
                        <option>轉帳</option><option>匯款</option><option>現金</option><option>支票</option><option>信用卡</option><option>月結</option>
                      </select>
                    ) : r.paymentMethod}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{r.supplierName || '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 text-center text-sm ${poColor}`}>
                    {r.paymentOrder?.status || (isDraft ? '未建立' : '—')}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-gray-400">
                    {r.paymentOrder?.orderNo || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs">{r.confirmedBy || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[140px] truncate">
                    {isEditing ? (
                      <input type="text" className="border rounded px-2 py-0.5 w-full text-sm"
                        placeholder="備註"
                        value={commEditData.note}
                        onChange={e => setCommEditData(p => ({ ...p, note: e.target.value }))} />
                    ) : <span title={r.note}>{r.note || '—'}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      {isEditing ? (
                        <>
                          <button onClick={saveEditComm} disabled={commEditSaving}
                            className="px-2 py-0.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                            {commEditSaving ? '…' : '儲存'}
                          </button>
                          <button onClick={() => setCommEditId(null)}
                            className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                            取消編輯
                          </button>
                        </>
                      ) : (
                        <>
                          {canEdit && (
                            <button onClick={() => startEditComm(r)}
                              className="px-2 py-0.5 text-xs rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                              編輯
                            </button>
                          )}
                          {isDraft && (
                            <button onClick={() => confirmCommission(r.id)}
                              className="px-2 py-0.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium">
                              確認送出
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => cancelCommission(r.id)}
                              className="px-2 py-0.5 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100">
                              取消
                            </button>
                          )}
                          {isPaid && (
                            <span className="text-xs text-green-600 font-semibold">已付款</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 比對記錄 */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">OTA 比對記錄（最近 100 次）</h3>
          <button onClick={fetchReconLogs} disabled={reconLogsLoading}
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50">
            {reconLogsLoading ? '載入中…' : '重新整理'}
          </button>
        </div>
        {reconLogsError && <FetchErrorBanner message={reconLogsError} onRetry={fetchReconLogs} />}
        <div className="bg-white rounded-xl shadow tbl-wrap">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-gray-500 text-xs">
                <th className="px-3 py-2 text-left">比對時間</th>
                <th className="px-3 py-2 text-left">月份</th>
                <th className="px-3 py-2 text-left">來源</th>
                <th className="px-3 py-2 text-left">館別</th>
                <th className="px-3 py-2 text-center">OTA筆</th>
                <th className="px-3 py-2 text-center">系統筆</th>
                <th className="px-3 py-2 text-center">配對</th>
                <th className="px-3 py-2 text-center">OTA未配</th>
                <th className="px-3 py-2 text-center">系統未配</th>
                <th className="px-3 py-2 text-center">差異筆</th>
                <th className="px-3 py-2 text-right">OTA總額</th>
                <th className="px-3 py-2 text-right">系統總額</th>
                <th className="px-3 py-2 text-right">差異</th>
                <th className="px-3 py-2 text-right">佣金</th>
                <th className="px-3 py-2 text-left">執行者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reconLogsLoading && (
                <tr><td colSpan={15} className="text-center py-6 text-gray-400">載入中…</td></tr>
              )}
              {!reconLogsLoading && reconLogs.length === 0 && (
                <tr><td colSpan={15} className="text-center py-6 text-gray-400">尚無比對記錄</td></tr>
              )}
              {reconLogs.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('zh-TW', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.reconcileMonth}</td>
                  <td className="px-3 py-2">{r.otaSource}</td>
                  <td className="px-3 py-2 text-gray-500">{r.warehouse}</td>
                  <td className="px-3 py-2 text-center">{r.otaRowCount}</td>
                  <td className="px-3 py-2 text-center">{r.bnbRowCount}</td>
                  <td className="px-3 py-2 text-center text-green-600 font-semibold">{r.matchedCount}</td>
                  <td className={`px-3 py-2 text-center ${r.unmatchedOtaCnt > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{r.unmatchedOtaCnt}</td>
                  <td className={`px-3 py-2 text-center ${r.unmatchedBnbCnt > 0 ? 'text-amber-500 font-semibold' : 'text-gray-400'}`}>{r.unmatchedBnbCnt}</td>
                  <td className={`px-3 py-2 text-center ${r.issueCount > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{r.issueCount}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.otaTotal.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-xs">{r.bnbTotal.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right text-xs font-semibold ${Math.abs(r.diff) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {r.diff === 0 ? '—' : r.diff > 0 ? `+${r.diff.toLocaleString()}` : r.diff.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-600">{r.otaCommission.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{r.createdBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
