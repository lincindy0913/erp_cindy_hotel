'use client';

import { sortRows, SortableTh } from '@/components/SortableTh';
import { getTenantDisplayName } from '../_lib/rentalHelpers';

export default function TenantsTab({
  tenants,
  tenantSearch, setTenantSearch,
  tenantSortKey, tenantSortDir, tenantToggleSort,
  fetchTenants, openTenantModal, deleteTenant,
  getCreditColor,
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input type="text" placeholder="搜尋姓名/公司/電話/代碼/物業..." value={tenantSearch}
          onChange={e => setTenantSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchTenants()}
          className="border rounded px-3 py-1.5 text-sm w-72" />
        <button onClick={fetchTenants} className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm hover:bg-teal-700">搜尋</button>
        <button onClick={() => openTenantModal()} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 ml-auto">
          新增租客
        </button>
      </div>

      <div className="bg-white rounded-lg shadow tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-teal-50 sticky top-0 z-10">
            <tr>
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">序號</th>
              <SortableTh label="資產編號" colKey="assetNo" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" align="center" />
              <SortableTh label="代碼" colKey="tenantCode" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" />
              <SortableTh label="類型" colKey="tenantType" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" />
              <SortableTh label="姓名/公司" colKey="displayName" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" />
              <SortableTh label="電話" colKey="phone" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" />
              <SortableTh label="物業" colKey="propertyNames" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" />
              <SortableTh label="有效合約" colKey="activeContractCount" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" align="center" />
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">狀態</th>
              <SortableTh label="信用評等" colKey="creditScore" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" align="center" />
              <SortableTh label="黑名單" colKey="isBlacklisted" sortKey={tenantSortKey} sortDir={tenantSortDir} onSort={tenantToggleSort} className="px-3 py-2" align="center" />
              <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const tenantAccessors = {
                displayName: t => getTenantDisplayName(t),
                creditScore: t => { const oc = t.contracts?.filter(c => c.status === 'overdue').length || 0; return oc === 0 ? 0 : oc <= 2 ? 1 : 2; },
                isBlacklisted: t => t.isBlacklisted ? 1 : 0,
                propertyNames: t => (t.properties || []).map(p => p.name).join(', '),
                // 一位租客可對多物業 → 以最小資產編號排序
                assetNo: t => Math.min(9999, ...(t.properties || []).map(p => p.sortOrder ?? 9999)),
              };
              const _sorted = sortRows(tenants, tenantSortKey, tenantSortDir, tenantAccessors);
              const isRetired = t => (t.activeContractCount || 0) === 0 &&
                ((t.contracts || []).some(c => c.status === 'terminated' || c.status === 'expired') || (t.terminatedContractCount || 0) > 0);
              const sorted = [
                ..._sorted.filter(t => !isRetired(t)),
                ..._sorted.filter(t => isRetired(t)),
              ];
              if (sorted.length === 0) return (
                <tr><td colSpan={12} className="text-center py-8 text-gray-400">暫無資料</td></tr>
              );
              return sorted.map((t, idx) => {
                const activeContracts = (t.contracts || []).filter(c => c.status === 'active' || c.status === 'pending');
                const retiredContracts = (t.contracts || []).filter(c => c.status === 'terminated' || c.status === 'expired');
                return (
                  <tr key={t.id}
                    onClick={() => openTenantModal(t)}
                    className={`border-t cursor-pointer hover:bg-teal-50/40 transition-colors ${t.isBlacklisted ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-700 font-mono">{(t.properties || []).map(p => p.sortOrder).filter(x => x != null).join(', ') || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.tenantCode}</td>
                    <td className="px-3 py-2">{t.tenantType === 'company' ? '公司' : '個人'}</td>
                    <td className="px-3 py-2 font-medium">
                      {getTenantDisplayName(t)}
                      {t.isBlacklisted && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded font-bold align-middle">黑名單</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{t.phone}</td>
                    <td className="px-3 py-2">
                      {t.properties && t.properties.length > 0
                        ? <div className="flex flex-wrap gap-1">
                            {t.properties.map(p => (
                              <span key={p.id} className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded">{p.name}</span>
                            ))}
                          </div>
                        : <span className="text-gray-400 text-xs">-</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-center">{t.activeContractCount}</td>
                    <td className="px-3 py-2 text-center">
                      {activeContracts.length > 0
                        ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 border border-green-300 rounded font-medium">出租中</span>
                        : retiredContracts.length > 0
                          ? <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded">已退租</span>
                          : <span className="text-gray-300 text-xs">-</span>
                      }
                    </td>
                    <td className={`px-3 py-2 text-center font-medium ${getCreditColor(t.contracts?.filter(c => c.status === 'overdue').length || 0)}`}>
                      {(() => {
                        const oc = t.contracts?.filter(c => c.status === 'overdue').length || 0;
                        if (oc === 0) return '良好';
                        if (oc <= 2) return '注意';
                        return '警示';
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {t.isBlacklisted ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded">黑名單</span> : '-'}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openTenantModal(t)} className="text-blue-600 hover:text-blue-800 text-xs mr-2">編輯</button>
                      <button onClick={() => deleteTenant(t.id)} className="text-red-600 hover:text-red-800 text-xs">刪除</button>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
