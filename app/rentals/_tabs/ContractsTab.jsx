'use client';

import Link from 'next/link';
import { todayStr, localDateStr } from '@/lib/localDate';
import { sortRows, SortableTh } from '@/components/SortableTh';
import { CONTRACT_STATUSES, getContractDisplayStatus } from '../_lib/rentalHelpers';
import StatusBadge from '../_components/StatusBadge';

const fmt = n => Number(n || 0).toLocaleString('zh-TW');

export default function ContractsTab({
  contracts,
  contractFilter, setContractFilter,
  contractSortKey, contractSortDir, contractToggleSort,
  reminderOpen, setReminderOpen,
  reminderThreshold, setReminderThreshold,
  contractMap, getRenewalDepth,
  fetchContracts, openContractModal, openRenewalModal,
  moveContract, deleteContract, forceDeleteContract, confirmMergeDelete,
  mergeDeleteModal, setMergeDeleteModal, mergeTargetId, setMergeTargetId,
  handleDepositAction, printContracts,
  markReminderSent, clearReminder,
  properties, tenants, fetchTenants,
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select value={contractFilter.status} onChange={e => setContractFilter(f => ({ ...f, status: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">全部狀態</option>
          {CONTRACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={contractFilter.propertyId} onChange={e => setContractFilter(f => ({ ...f, propertyId: e.target.value }))}
          className="border rounded px-2 py-1.5 text-sm">
          <option value="">全部物業</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={fetchContracts} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">查詢</button>
        <button onClick={printContracts} className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">🖨️ 列印</button>
        <button onClick={() => openContractModal()} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
          新增合約
        </button>
      </div>

      {/* 到期提醒管理 */}
      <div className="mb-4">
        <button onClick={() => setReminderOpen(o => !o)}
          className="flex items-center gap-2 text-sm font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 hover:bg-yellow-100">
          <span>🔔 到期提醒管理</span>
          <span className="text-xs text-yellow-500">{reminderOpen ? '▲ 收起' : '▼ 展開'}</span>
        </button>
        {reminderOpen && (() => {
          const today = todayStr();
          const thresholdDate = localDateStr(new Date(Date.now() + reminderThreshold * 86400000));
          const expiring = contracts.filter(c => c.status === 'active' && c.endDate >= today && c.endDate <= thresholdDate)
            .sort((a, b) => a.endDate.localeCompare(b.endDate));
          return (
            <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm text-gray-600">提醒天數：</label>
                {[30, 45, 60, 90].map(d => (
                  <button key={d} onClick={() => setReminderThreshold(d)}
                    className={`text-xs px-3 py-1 rounded-full ${reminderThreshold === d ? 'bg-yellow-500 text-white' : 'bg-white border text-gray-600 hover:bg-yellow-100'}`}>
                    {d} 天
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-2">共 {expiring.length} 筆合約在 {reminderThreshold} 天內到期</span>
              </div>
              {expiring.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">{reminderThreshold} 天內無即將到期合約</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-xs text-gray-500 border-b">
                      <th className="text-left pb-1">物業</th>
                      <th className="text-left pb-1">租客</th>
                      <th className="text-right pb-1">到期日</th>
                      <th className="text-right pb-1">剩餘天數</th>
                      <th className="text-center pb-1">上次提醒</th>
                      <th className="text-center pb-1">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiring.map(c => {
                      const days = Math.ceil((new Date(c.endDate) - new Date(today)) / 86400000);
                      const lastReminder = c.latestReminder;
                      const daysSince = lastReminder
                        ? Math.floor((Date.now() - new Date(lastReminder.sentAt)) / 86400000)
                        : null;
                      const isCooldown = daysSince != null && daysSince < 30;
                      return (
                        <tr key={c.id} className="border-b border-yellow-100">
                          <td className="py-1.5">
                            <button
                              onClick={async () => {
                                if (tenants.length === 0) await fetchTenants();
                                openContractModal(c);
                              }}
                              className="text-teal-700 hover:text-teal-900 hover:underline font-medium text-left">
                              {c.propertyName}
                            </button>
                          </td>
                          <td className="py-1.5 text-gray-600">{c.tenantName}</td>
                          <td className="py-1.5 text-right text-gray-700">{c.endDate}</td>
                          <td className="py-1.5 text-right">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${days <= 30 ? 'bg-red-100 text-red-700 font-semibold' : 'bg-yellow-100 text-yellow-700'}`}>{days} 天</span>
                          </td>
                          <td className="py-1.5 text-center text-xs text-gray-400">
                            {lastReminder
                              ? <span title={lastReminder.sentBy ? `由 ${lastReminder.sentBy} 提醒` : undefined}>{lastReminder.sentAt}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-1.5 text-center">
                            <button onClick={() => markReminderSent(c.id)}
                              disabled={isCooldown}
                              title={isCooldown ? `${lastReminder?.sentBy || '同事'} 於 ${daysSince} 天前已提醒` : '標記已提醒'}
                              className={`text-xs mr-2 ${isCooldown ? 'text-gray-400 cursor-default' : 'text-teal-600 hover:text-teal-800'}`}>
                              {isCooldown ? `${daysSince}天前已提醒` : '已提醒'}
                            </button>
                            {lastReminder && <button onClick={() => clearReminder(c.id)} className="text-xs text-gray-400 hover:text-gray-600">清除</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })()}
      </div>

      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <SortableTh label="序號" colKey="sortOrder" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-2 py-2 w-16" align="center" />
              <SortableTh label="分類" colKey="category" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-2 py-2 w-20" align="center" />
              <SortableTh label="合約編號" colKey="contractNo" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" />
              <SortableTh label="物業" colKey="propertyName" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" />
              <SortableTh label="租客" colKey="tenantName" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" />
              <SortableTh label="起始日" colKey="startDate" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" />
              <SortableTh label="到期日" colKey="endDate" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" />
              <SortableTh label="月租" colKey="monthlyRent" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" align="right" />
              <SortableTh label="押金" colKey="depositAmount" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" align="right" />
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">押金狀態</th>
              <SortableTh label="狀態" colKey="status" sortKey={contractSortKey} sortDir={contractSortDir} onSort={contractToggleSort} className="px-3 py-2" align="center" />
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-8 text-gray-400">暫無資料</td></tr>
            ) : (() => {
              const contractAccessors = {
                sortOrder: c => c.property?.sortOrder ?? 999999,
                category: c => c.property?.category || '',
                monthlyRent: c => Number(c.monthlyRent || 0),
                depositAmount: c => Number(c.depositAmount || 0),
              };
              const sortedContracts = contractSortKey === 'sortOrder'
                ? [...contracts].sort((a, b) => {
                    const ao = a.property?.sortOrder ?? 999999;
                    const bo = b.property?.sortOrder ?? 999999;
                    return ao !== bo ? ao - bo : a.id - b.id;
                  })
                : sortRows(contracts, contractSortKey, contractSortDir, contractAccessors);
              return sortedContracts.map((c, rowIdx) => {
              const today = todayStr();
              const daysToExpire = Math.ceil((new Date(c.endDate) - new Date()) / (1000 * 60 * 60 * 24));
              const isExpiring = c.status === 'active' && daysToExpire <= 60 && daysToExpire > 0;
              const CATEGORY_COLORS = { '公司': 'bg-blue-100 text-blue-800', '湯三姐': 'bg-purple-100 text-purple-800' };

              return (
                <tr key={c.id} className={`border-t hover:bg-gray-50 ${isExpiring ? 'bg-yellow-50' : ''}`}>
                  <td className="px-2 py-2 text-center text-xs text-gray-500 font-mono">{rowIdx + 1}</td>
                  <td className="px-2 py-2 text-center">
                    {c.property?.category
                      ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[c.property.category] || 'bg-gray-100 text-gray-700'}`}>{c.property.category}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.contractNo}
                    {c.previousContractId && (
                      <span className="ml-1 text-[10px] text-teal-700 font-normal">(續約)</span>
                    )}
                    {c.renewedByContract && (
                      <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-normal cursor-default"
                        title={`已被 ${c.renewedByContract.contractNo} 續約`}>
                        已續約 ↗
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{c.propertyName}</td>
                  <td className="px-3 py-2">{c.tenantName}</td>
                  <td className="px-3 py-2 text-xs">{c.startDate}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.endDate}
                    {isExpiring && <span className="ml-1 text-yellow-600 font-medium">({daysToExpire}天)</span>}
                  </td>
                  <td className="px-3 py-2 text-right">${fmt(c.monthlyRent)}</td>
                  <td className="px-3 py-2 text-right">${fmt(c.depositAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    {Number(c.depositAmount) > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        {c.depositReceived
                          ? <span className="text-xs text-green-600">已收</span>
                          : <button onClick={() => handleDepositAction(c.id, 'depositReceive')} className="text-xs text-blue-600 hover:underline">收押金</button>
                        }
                        {c.depositReceived && !c.depositRefunded && !c.depositRefundPaymentOrderId && (
                          <button onClick={() => handleDepositAction(c.id, 'depositRefund')} className="text-xs text-orange-600 hover:underline ml-1">退押金</button>
                        )}
                        {c.depositRefundPaymentOrderId && !c.depositRefunded && (
                          <Link href="/cashier" className="text-xs text-teal-600 hover:underline ml-1">待出納</Link>
                        )}
                        {c.depositRefunded && <span className="text-xs text-gray-500 ml-1">已退</span>}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge value={getContractDisplayStatus(c)} list={CONTRACT_STATUSES} />
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <button onClick={() => openContractModal(c)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">編輯</button>
                    {['active', 'expired'].includes(c.status) && (
                      <button onClick={() => openRenewalModal(c)} className="text-teal-600 hover:text-teal-800 text-xs mr-2">續約</button>
                    )}
                    {c.status === 'pending' && (
                      <button onClick={() => deleteContract(c.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                    )}
                    {c.status !== 'pending' && (
                      <button
                        onClick={() => forceDeleteContract(c)}
                        className="text-orange-500 hover:text-orange-700 text-xs ml-1"
                        title="刪除重複登打的合約（須無已收款記錄）">
                        刪除(重複)
                      </button>
                    )}
                  </td>
                </tr>
              );
            });
            })()}
          </tbody>
        </table>
      </div>

      {/* ── 移轉收款並刪除 Dialog ── */}
      {mergeDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMergeDeleteModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-700 mb-3">⚠️ 移轉收款並刪除重複合約</h3>
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800 space-y-1">
              <div><span className="font-medium">合約：</span>{mergeDeleteModal.contract.contractNo}</div>
              <div><span className="font-medium">物業：</span>{mergeDeleteModal.contract.propertyName}</div>
              <div><span className="font-medium">已收款：</span>{mergeDeleteModal.paidCount} 筆（將移轉至目標合約）</div>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              請選擇要將收款記錄移轉到的目標合約（通常為同物業的正式合約）：
            </p>
            <select
              value={mergeTargetId}
              onChange={e => setMergeTargetId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mb-4">
              <option value="">── 請選擇目標合約 ──</option>
              {contracts
                .filter(c => c.id !== mergeDeleteModal.contract.id && c.propertyId === mergeDeleteModal.contract.propertyId)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.contractNo}｜{c.tenantName}｜{c.startDate}～{c.endDate}｜{c.status}
                  </option>
                ))}
            </select>
            <p className="text-xs text-gray-400 mb-4">
              移轉後：目標合約中同月份若已有收款則保留目標合約資料；若目標無該月份則移轉過去。此操作無法還原。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setMergeDeleteModal(null)} className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">取消</button>
              <button
                onClick={confirmMergeDelete}
                disabled={!mergeTargetId}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                確認移轉並刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
