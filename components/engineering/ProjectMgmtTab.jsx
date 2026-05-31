'use client';
import { useState } from 'react';
import Link from 'next/link';
import { todayStr } from '@/lib/localDate';

function formatNum(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getActualPaid(po) {
  if (po.status === '已執行' && po.executions && po.executions.length > 0) {
    return po.executions.reduce((s, e) => s + Number(e.actualAmount || 0), 0);
  }
  return Number(po.amount || 0);
}

export default function ProjectMgmtTab({
  projects, contracts, paymentOrders, warehouseDepartments, dashStats,
  onMarkTermPaid, onUnmarkTermPaid, onOpenPaymentModal, onSwitchTab,
}) {
  const [mgmtStatusFilter, setMgmtStatusFilter] = useState('進行中');
  const [mgmtView, setMgmtView] = useState('card');
  const [expandedProjects, setExpandedProjects] = useState(new Set());

  const today = todayStr();
  const activeProjects = projects.filter(p => p.status === '進行中');
  const kpiTotalBudget = projects.reduce((s, p) => s + (Number(p.budget) || 0), 0);
  const kpiTotalContracted = contracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
  const kpiTotalPaid = contracts.reduce((s, c) =>
    s + (c.terms || []).reduce((ts, t) => {
      const paid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行')
        .reduce((ps, po) => ps + getActualPaid(po), 0);
      return ts + paid;
    }, 0), 0);

  const mgmtFiltered = mgmtStatusFilter === '全部' ? projects : projects.filter(p => p.status === mgmtStatusFilter);
  const statusCounts = { 全部: projects.length, 進行中: 0, 已結案: 0, 暫停: 0 };
  projects.forEach(p => { if (statusCounts[p.status] !== undefined) statusCounts[p.status]++; });

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">進行中工程案</p>
          <p className="text-2xl font-bold text-amber-700">{activeProjects.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">共 {projects.length} 件</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">總預算</p>
          <p className="text-lg font-bold text-gray-800">NT$ {formatNum(kpiTotalBudget)}</p>
          <p className="text-xs text-gray-400 mt-0.5">含所有工程案</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-100 px-4 py-3">
          <p className="text-xs text-blue-600 mb-1">合約承諾金額</p>
          <p className="text-lg font-bold text-blue-700">NT$ {formatNum(kpiTotalContracted)}</p>
          <p className="text-xs text-blue-400 mt-0.5">{kpiTotalBudget > 0 ? `預算使用 ${((kpiTotalContracted / kpiTotalBudget) * 100).toFixed(1)}%` : '－'}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-100 px-4 py-3">
          <p className="text-xs text-green-600 mb-1">已付款</p>
          <p className="text-lg font-bold text-green-700">NT$ {formatNum(kpiTotalPaid)}</p>
          <p className="text-xs text-green-400 mt-0.5">{kpiTotalContracted > 0 ? `合約執行 ${((kpiTotalPaid / kpiTotalContracted) * 100).toFixed(1)}%` : '－'}</p>
        </div>
      </div>

      {/* 狀態篩選 + 視圖切換 */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-1">
          {['全部', '進行中', '已結案', '暫停'].map(s => (
            <button key={s} onClick={() => setMgmtStatusFilter(s)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${mgmtStatusFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {s}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${mgmtStatusFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 pb-1">
          {[{ key: 'card', label: '卡片', icon: '⊞' }, { key: 'table', label: '列表', icon: '☰' }, { key: 'supplier', label: '廠商', icon: '🏭' }].map(v => (
            <button key={v.key} onClick={() => setMgmtView(v.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${mgmtView === v.key ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表視圖 */}
      {mgmtView === 'table' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">工程案</th>
                <th className="px-4 py-3 text-left font-medium">狀態</th>
                <th className="px-4 py-3 text-left font-medium">業主 / 館別</th>
                <th className="px-4 py-3 text-right font-medium">廠商/期數</th>
                <th className="px-4 py-3 text-right font-medium">預算</th>
                <th className="px-4 py-3 font-medium" style={{width:'160px'}}>合約/預算</th>
                <th className="px-4 py-3 font-medium" style={{width:'160px'}}>已付/合約</th>
                <th className="px-4 py-3 text-right font-medium text-blue-600">進項發票</th>
                <th className="px-4 py-3 text-right font-medium text-green-600">銷項發票</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mgmtFiltered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">尚無符合條件的工程案</td></tr>
              ) : mgmtFiltered.map(proj => {
                const pcs = contracts.filter(c => c.projectId === proj.id);
                const budget = Number(proj.budget) || 0;
                const contracted = pcs.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
                const paid = pcs.reduce((s, c) =>
                  s + (c.terms || []).reduce((ts, t) =>
                    ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0), 0), 0);
                const totalTerms = pcs.reduce((s, c) => s + (c.terms || []).length, 0);
                const paidTerms = pcs.reduce((s, c) =>
                  s + (c.terms || []).filter(t => paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0) >= Number(t.amount) && Number(t.amount) > 0).length, 0);
                const overBudget = budget > 0 && contracted > budget;
                const contractedPct = budget > 0 ? Math.min((contracted / budget) * 100, 100) : 0;
                const paidPct = contracted > 0 ? Math.min((paid / contracted) * 100, 100) : 0;
                const overdueTerms = pcs.reduce((s, c) =>
                  s + (c.terms || []).filter(t => {
                    if (!t.dueDate) return false;
                    const isPaid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0) >= Number(t.amount);
                    return !isPaid && t.dueDate < today;
                  }).length, 0);
                const inputInvTotal  = dashStats.byProject[String(proj.id)]?.inputInvoices  || 0;
                const outputInvTotal = dashStats.byProject[String(proj.id)]?.outputInvoices || 0;
                const statusStyle = proj.status === '進行中' ? 'bg-blue-100 text-blue-700' : proj.status === '已結案' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';
                return (
                  <tr key={proj.id} className={`hover:bg-gray-50 ${overBudget ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/engineering/${proj.id}`} className="font-medium text-amber-700 hover:underline">{proj.code}</Link>
                      <div className="text-xs text-gray-500 truncate max-w-[180px]">{proj.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>{proj.status}</span>
                      {overBudget && <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">超支</span>}
                      {overdueTerms > 0 && <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-600">逾期 {overdueTerms}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>{proj.clientName || '—'}</div>
                      <div>{proj.warehouseRef?.name || proj.warehouse || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      <div className="text-gray-700">{pcs.length} 家廠商</div>
                      <div className="text-gray-400">{paidTerms}/{totalTerms} 期</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">{budget > 0 ? `NT$ ${formatNum(budget)}` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${overBudget ? 'bg-red-500' : contractedPct > 80 ? 'bg-orange-400' : 'bg-amber-400'}`} style={{ width: `${contractedPct || (budget === 0 && contracted > 0 ? 100 : 0)}%` }} />
                        </div>
                        <span className={`text-xs whitespace-nowrap ${overBudget ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {budget > 0 ? `${contractedPct.toFixed(0)}%` : `NT$ ${formatNum(contracted)}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${paidPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{paidPct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {inputInvTotal > 0 ? (
                        <button type="button" onClick={() => onSwitchTab?.('inputInvoices')} className="text-blue-700 font-medium hover:underline">NT$ {formatNum(inputInvTotal)}</button>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {outputInvTotal > 0 ? (
                        <button type="button" onClick={() => onSwitchTab?.('outputInvoices')} className="text-green-700 font-medium hover:underline">NT$ {formatNum(outputInvTotal)}</button>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {mgmtFiltered.length > 0 && (() => {
              const tot = mgmtFiltered;
              const tBudget = tot.reduce((s, p) => s + (Number(p.budget) || 0), 0);
              const tContracts = tot.reduce((s, p) => s + contracts.filter(c => c.projectId === p.id).reduce((cs, c) => cs + Number(c.totalAmount || 0), 0), 0);
              const tPaid = tot.reduce((s, p) => s + contracts.filter(c => c.projectId === p.id).reduce((cs, c) =>
                cs + (c.terms || []).reduce((ts, t) => ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0), 0), 0), 0);
              const tInputInv  = tot.reduce((s, p) => s + (dashStats.byProject[String(p.id)]?.inputInvoices  || 0), 0);
              const tOutputInv = tot.reduce((s, p) => s + (dashStats.byProject[String(p.id)]?.outputInvoices || 0), 0);
              return (
                <tfoot className="bg-gray-50 font-semibold text-sm border-t border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-gray-700" colSpan={4}>合計（{tot.length} 件）</td>
                    <td className="px-4 py-3 text-right text-gray-700">NT$ {formatNum(tBudget)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">合約 NT$ {formatNum(tContracts)}</td>
                    <td className="px-4 py-3 text-xs text-green-700">已付 NT$ {formatNum(tPaid)}</td>
                    <td className="px-4 py-3 text-right text-xs text-blue-700">{tInputInv > 0 ? `NT$ ${formatNum(tInputInv)}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-green-700">{tOutputInv > 0 ? `NT$ ${formatNum(tOutputInv)}` : '—'}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      )}

      {/* 廠商彙整視圖 */}
      {mgmtView === 'supplier' && (() => {
        const supplierMap = {};
        for (const proj of mgmtFiltered) {
          const pcs = contracts.filter(c => c.projectId === proj.id);
          for (const c of pcs) {
            const sid = c.supplierId || `_${c.supplier?.name || '未知'}`;
            if (!supplierMap[sid]) supplierMap[sid] = { name: c.supplier?.name || '未知廠商', contracted: 0, paid: 0, totalTerms: 0, paidTerms: 0, overdueTerms: 0, projects: new Set(), contracts: [] };
            const sm = supplierMap[sid];
            sm.projects.add(proj.code || proj.name);
            const cTotal = Number(c.totalAmount || 0);
            const cPaid = (c.terms || []).reduce((ts, t) => ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0), 0);
            const cPaidTerms = (c.terms || []).filter(t => paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0) >= Number(t.amount) && Number(t.amount) > 0).length;
            const cOverdue = (c.terms || []).filter(t => { if (!t.dueDate) return false; const isPaid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0) >= Number(t.amount); return !isPaid && t.dueDate < today; }).length;
            sm.contracted += cTotal; sm.paid += cPaid; sm.totalTerms += (c.terms || []).length;
            sm.paidTerms += cPaidTerms; sm.overdueTerms += cOverdue;
            sm.contracts.push({ projectCode: proj.code, contractNo: c.contractNo, amount: cTotal, paid: cPaid, terms: c.terms?.length || 0, paidTerms: cPaidTerms, status: c.status });
          }
        }
        const supplierList = Object.values(supplierMap).sort((a, b) => b.contracted - a.contracted);
        if (supplierList.length === 0) return <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">尚無廠商資料</div>;
        return (
          <div className="space-y-3">
            {supplierList.map((s, i) => {
              const paidPct = s.contracted > 0 ? Math.min((s.paid / s.contracted) * 100, 100) : 0;
              return (
                <div key={i} className={`bg-white rounded-xl border ${s.overdueTerms > 0 ? 'border-orange-200' : 'border-gray-200'} p-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">{s.name}</span>
                        {s.overdueTerms > 0 && <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-600 font-medium">逾期 {s.overdueTerms} 期</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">參與 {s.projects.size} 個工程案：{[...s.projects].join('、')}</div>
                    </div>
                    <div className="text-right shrink-0 text-sm">
                      <div className="font-semibold text-gray-800">NT$ {formatNum(s.contracted)}</div>
                      <div className="text-xs text-green-600">已付 NT$ {formatNum(s.paid)}</div>
                      <div className="text-xs text-gray-400">{s.paidTerms}/{s.totalTerms} 期完成</div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1"><span>付款進度</span><span>{paidPct.toFixed(1)}%</span></div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-green-400" style={{ width: `${paidPct}%` }} /></div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {s.contracts.map((c, j) => (
                      <div key={j} className="flex items-center gap-3 text-xs text-gray-600 bg-gray-50 rounded px-3 py-1.5">
                        <span className="text-gray-400 font-mono">{c.projectCode}</span>
                        <span className="font-mono text-gray-500">{c.contractNo}</span>
                        <span className="ml-auto text-gray-700">NT$ {formatNum(c.amount)}</span>
                        <span className="text-green-600">已付 {formatNum(c.paid)}</span>
                        <span className={`px-1.5 py-0.5 rounded ${c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{c.paidTerms}/{c.terms} 期</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 flex justify-between text-sm font-semibold text-gray-700">
              <span>共 {supplierList.length} 家廠商</span>
              <span>合約 NT$ {formatNum(supplierList.reduce((s, v) => s + v.contracted, 0))}　已付 NT$ {formatNum(supplierList.reduce((s, v) => s + v.paid, 0))}</span>
            </div>
          </div>
        );
      })()}

      {/* 卡片視圖 */}
      {mgmtView === 'card' && mgmtFiltered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">尚無符合條件的工程案</div>
      )}
      {mgmtView === 'card' && mgmtFiltered.map(proj => {
        const projContracts = contracts.filter(c => c.projectId === proj.id);
        const budget = Number(proj.budget) || 0;
        const totalContracted = projContracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
        const totalPaid = projContracts.reduce((s, c) =>
          s + (c.terms || []).reduce((ts, t) => ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0), 0), 0);
        const totalTerms = projContracts.reduce((s, c) => s + (c.terms || []).length, 0);
        const paidTerms = projContracts.reduce((s, c) => s + (c.terms || []).filter(t => {
          const p = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0);
          return p >= Number(t.amount) && Number(t.amount) > 0;
        }).length, 0);
        const overBudget = budget > 0 && totalContracted > budget;
        const contractedPct = budget > 0 ? Math.min((totalContracted / budget) * 100, 100) : 0;
        const paidOfContractedPct = totalContracted > 0 ? Math.min((totalPaid / totalContracted) * 100, 100) : 0;
        const isExpanded = expandedProjects.has(proj.id);
        const statusStyle = proj.status === '進行中' ? 'bg-blue-100 text-blue-700' : proj.status === '已結案' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';

        return (
          <div key={proj.id} className={`bg-white rounded-xl border ${overBudget ? 'border-red-300' : 'border-gray-200'} overflow-hidden`}>
            <button className="w-full px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors text-left"
              onClick={() => setExpandedProjects(prev => { const next = new Set(prev); next.has(proj.id) ? next.delete(proj.id) : next.add(proj.id); return next; })}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>{proj.status}</span>
                  {overBudget && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">超支</span>}
                  <span className="font-semibold text-gray-800">{proj.code} {proj.name}</span>
                  <Link href={`/engineering/${proj.id}`} onClick={e => e.stopPropagation()} className="text-xs text-amber-600 hover:underline ml-1">詳情</Link>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {proj.clientName && <span>業主：{proj.clientName}</span>}
                  {(proj.warehouseRef?.name || proj.warehouse) && <span>館別：{proj.warehouseRef?.name || proj.warehouse}</span>}
                  {proj.startDate && <span>{proj.startDate}{proj.endDate ? ` ～ ${proj.endDate}` : ''}</span>}
                  <span>{projContracts.length} 家廠商・{totalTerms} 個期數</span>
                </div>
              </div>
              <div className="hidden md:block w-72 shrink-0 text-right space-y-2">
                {budget > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span className={overBudget ? 'text-red-600 font-medium' : ''}>合約 {formatNum(totalContracted)}</span>
                      <span>預算 {formatNum(budget)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : contractedPct > 80 ? 'bg-orange-400' : 'bg-amber-500'}`} style={{ width: `${contractedPct}%` }} />
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                    <span className="text-green-700">已付 {formatNum(totalPaid)}</span>
                    <span>{paidTerms}/{totalTerms} 期完成</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${paidOfContractedPct}%` }} />
                  </div>
                </div>
              </div>
              <span className="text-gray-400 text-sm mt-1 shrink-0">{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                {projContracts.length === 0 ? (
                  <p className="text-sm text-gray-400">尚無合約</p>
                ) : (
                  <div className="space-y-3">
                    {projContracts.map(c => {
                      const terms = c.terms || [];
                      const cPaid = terms.reduce((ts, t) => ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0), 0);
                      const cPaidTerms = terms.filter(t => { const p = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0); return p >= Number(t.amount) && Number(t.amount) > 0; }).length;
                      const cTotal = Number(c.totalAmount || 0);
                      const cPaidPct = cTotal > 0 ? Math.min((cPaid / cTotal) * 100, 100) : 0;
                      return (
                        <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between gap-4 mb-2">
                            <div>
                              <span className="font-medium text-gray-800 text-sm">{c.supplier?.name}</span>
                              <span className="ml-2 text-xs text-gray-400 font-mono">{c.contractNo}</span>
                              <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{c.status === 'completed' ? '已完成' : '進行中'}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-semibold text-gray-800">NT$ {formatNum(cTotal)}</div>
                              <div className="text-xs text-gray-400">{cPaidTerms}/{terms.length} 期・已付 {formatNum(cPaid)}</div>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${cPaidPct}%` }} />
                          </div>
                          {terms.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {terms.map(t => {
                                const tPaid = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行').reduce((ps, po) => ps + getActualPaid(po), 0);
                                const isFullyPaid = tPaid >= Number(t.amount) && Number(t.amount) > 0;
                                const hasPending = paymentOrders.some(po => po.sourceRecordId === t.id && po.status === '待出納');
                                return (
                                  <span key={t.id}
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${isFullyPaid ? 'bg-green-100 text-green-700' : hasPending ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}
                                    title={`${t.termName}：NT$ ${formatNum(t.amount)}${t.dueDate ? `  到期：${t.dueDate}` : ''}`}>
                                    {t.termName || `第${t.sortOrder ?? '？'}期`}{isFullyPaid ? ' ✓' : hasPending ? ' ⏳' : ''}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
