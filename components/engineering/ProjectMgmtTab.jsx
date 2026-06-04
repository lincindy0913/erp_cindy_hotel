'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useToast } from '@/context/ToastContext';
import { todayStr } from '@/lib/localDate';
import { getActualPaid } from '@/lib/engineering/payment-utils';
import { formatNum } from '@/lib/engineering/format-utils';

function warrantyStatus(endDate, today) {
  if (!endDate) return null;
  const days = Math.ceil((new Date(endDate) - new Date(today)) / 86400000);
  if (days < 0) return { label: '已過保', color: 'bg-gray-100 text-gray-400', urgent: false, days };
  if (days <= 30) return { label: `${days}天到期`, color: 'bg-red-100 text-red-600', urgent: true, days };
  if (days <= 90) return { label: `${days}天到期`, color: 'bg-orange-100 text-orange-600', urgent: true, days };
  return { label: '保固中', color: 'bg-purple-100 text-purple-700', urgent: false, days };
}

export default function ProjectMgmtTab({
  projects, contracts, paymentOrders, warehouseDepartments, dashStats,
  warrantyRecords = [], onWarrantyRefresh,
  onMarkTermPaid, onUnmarkTermPaid, onOpenPaymentModal, onSwitchTab,
}) {
  const [mgmtStatusFilter, setMgmtStatusFilter] = useState('進行中');
  const [mgmtView, setMgmtView] = useState('card');
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  // milestones: { [projectId]: milestone[] }
  const [milestonesMap, setMilestonesMap] = useState({});
  const [milestonesLoading, setMilestonesLoading] = useState({});
  // inline add form: { [projectId]: { name, completionPct, plannedDate } }
  const [addForms, setAddForms] = useState({});
  const [addSaving, setAddSaving] = useState({});
  // warranty record forms: { [projectId]: { reportDate, description, handler, cost, note } }
  const [warrantyForms, setWarrantyForms] = useState({});
  const [warrantySaving, setWarrantySaving] = useState({});

  const { showToast } = useToast();
  const today = todayStr();

  const fetchMilestones = useCallback(async (projectId) => {
    if (milestonesMap[projectId] !== undefined) return; // already loaded
    setMilestonesLoading(p => ({ ...p, [projectId]: true }));
    try {
      const res = await fetch(`/api/engineering/projects/${projectId}/milestones`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMilestonesMap(p => ({ ...p, [projectId]: Array.isArray(data) ? data : [] }));
    } catch (e) {
      console.error('[fetchMilestones]', e);
      showToast('里程碑載入失敗', 'error');
      setMilestonesMap(p => ({ ...p, [projectId]: [] }));
    }
    finally { setMilestonesLoading(p => ({ ...p, [projectId]: false })); }
  }, [milestonesMap, showToast]);

  function toggleCard(projectId) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) { next.delete(projectId); }
      else { next.add(projectId); fetchMilestones(projectId); }
      return next;
    });
  }

  async function completeMilestone(milestone) {
    try {
      const res = await fetch(`/api/engineering/milestones/${milestone.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', actualDate: todayStr() }),
      });
      if (!res.ok) throw new Error();
      setMilestonesMap(p => ({ ...p, [milestone.projectId]: (p[milestone.projectId] || []).map(m => m.id === milestone.id ? { ...m, status: 'completed', actualDate: todayStr() } : m) }));
    } catch { showToast('更新失敗', 'error'); }
  }

  async function reopenMilestone(milestone) {
    try {
      const res = await fetch(`/api/engineering/milestones/${milestone.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending', actualDate: null }),
      });
      if (!res.ok) throw new Error();
      setMilestonesMap(p => ({ ...p, [milestone.projectId]: (p[milestone.projectId] || []).map(m => m.id === milestone.id ? { ...m, status: 'pending', actualDate: null } : m) }));
    } catch { showToast('更新失敗', 'error'); }
  }

  async function deleteMilestone(milestone) {
    try {
      const res = await fetch(`/api/engineering/milestones/${milestone.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMilestonesMap(p => ({ ...p, [milestone.projectId]: (p[milestone.projectId] || []).filter(m => m.id !== milestone.id) }));
    } catch { showToast('刪除失敗', 'error'); }
  }

  async function addMilestone(projectId) {
    const form = addForms[projectId] || {};
    if (!form.name?.trim()) { showToast('請填寫里程碑名稱', 'error'); return; }
    setAddSaving(p => ({ ...p, [projectId]: true }));
    try {
      const res = await fetch(`/api/engineering/projects/${projectId}/milestones`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), completionPct: parseInt(form.completionPct || 0), plannedDate: form.plannedDate || null }),
      });
      if (!res.ok) throw new Error();
      const m = await res.json();
      setMilestonesMap(p => ({ ...p, [projectId]: [...(p[projectId] || []), m] }));
      setAddForms(p => ({ ...p, [projectId]: {} }));
    } catch { showToast('新增失敗', 'error'); }
    finally { setAddSaving(p => ({ ...p, [projectId]: false })); }
  }
  async function addWarrantyRecord(projectId) {
    const form = warrantyForms[projectId] || {};
    if (!form.reportDate) { showToast('請填寫報修日期', 'error'); return; }
    if (!form.description?.trim()) { showToast('請填寫問題描述', 'error'); return; }
    setWarrantySaving(p => ({ ...p, [projectId]: true }));
    try {
      const res = await fetch('/api/engineering/warranty-records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reportDate: form.reportDate, description: form.description.trim(), handler: form.handler?.trim() || null, cost: form.cost || null, note: form.note?.trim() || null }),
      });
      if (!res.ok) throw new Error();
      setWarrantyForms(p => ({ ...p, [projectId]: {} }));
      onWarrantyRefresh?.();
      showToast('已新增維修紀錄', 'success');
    } catch { showToast('新增失敗', 'error'); }
    finally { setWarrantySaving(p => ({ ...p, [projectId]: false })); }
  }

  async function resolveWarrantyRecord(record) {
    try {
      const res = await fetch(`/api/engineering/warranty-records/${record.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolvedDate: today }),
      });
      if (!res.ok) throw new Error();
      onWarrantyRefresh?.();
    } catch { showToast('更新失敗', 'error'); }
  }

  async function deleteWarrantyRecord(record) {
    try {
      const res = await fetch(`/api/engineering/warranty-records/${record.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onWarrantyRefresh?.();
    } catch { showToast('刪除失敗', 'error'); }
  }

  const activeProjects = projects.filter(p => p.status === '進行中');
  const kpiTotalBudget = projects.reduce((s, p) => s + (Number(p.budget) || 0), 0);
  // 只計主合約層，避免分包/工班重複加總
  const kpiTotalContracted = contracts.filter(c => (c.contractType || '主合約') === '主合約').reduce((s, c) => s + Number(c.totalAmount || 0), 0);
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
        {(() => {
          const withWarranty = projects.filter(p => p.warrantyEndDate);
          const expiring = withWarranty.filter(p => { const s = warrantyStatus(p.warrantyEndDate, today); return s && s.days >= 0 && s.days <= 90; });
          const overdue = withWarranty.filter(p => { const s = warrantyStatus(p.warrantyEndDate, today); return s && s.days < 0; });
          const pending = warrantyRecords.filter(r => r.status === 'pending').length;
          if (withWarranty.length === 0) return null;
          return (
            <div className={`bg-white rounded-xl border ${expiring.length > 0 ? 'border-orange-200' : 'border-purple-100'} px-4 py-3`}>
              <p className={`text-xs mb-1 ${expiring.length > 0 ? 'text-orange-600' : 'text-purple-600'}`}>保固追蹤</p>
              <p className={`text-lg font-bold ${expiring.length > 0 ? 'text-orange-600' : 'text-purple-700'}`}>{withWarranty.length - overdue.length} 件保固中</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {expiring.length > 0 && <span className="text-orange-500">⚠ {expiring.length} 件 90 天內到期　</span>}
                {pending > 0 && <span className="text-red-500">維修待處理 {pending} 筆</span>}
                {expiring.length === 0 && pending === 0 && '無即將到期'}
              </p>
            </div>
          );
        })()}
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
                <th className="px-4 py-3 font-medium text-blue-600" style={{width:'150px'}}>收款進度</th>
                <th className="px-4 py-3 font-medium text-purple-600" style={{width:'150px'}}>開票進度</th>
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
                const incomeTotal    = dashStats.byProject[String(proj.id)]?.income          || 0;
                const clientAmt = Number(proj.clientContractAmount || 0);
                const incomePct    = clientAmt > 0 ? Math.min((incomeTotal    / clientAmt) * 100, 100) : 0;
                const outputInvPct = clientAmt > 0 ? Math.min((outputInvTotal / clientAmt) * 100, 100) : 0;
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
                      {proj.warrantyEndDate && (() => { const ws = warrantyStatus(proj.warrantyEndDate, today); return ws ? <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${ws.color}`}>{ws.label}</span> : null; })()}
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
                    <td className="px-4 py-3 text-xs">
                      {clientAmt > 0 ? (
                        <>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-blue-600 font-medium">{incomeTotal > 0 ? formatNum(incomeTotal) : '—'}</span>
                            <span className="text-gray-400">{incomePct.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${incomePct}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-300 float-right">{incomeTotal > 0 ? formatNum(incomeTotal) : '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {clientAmt > 0 ? (
                        <>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-purple-600 font-medium">{outputInvTotal > 0 ? formatNum(outputInvTotal) : '—'}</span>
                            <span className="text-gray-400">{outputInvPct.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${outputInvPct}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-300 float-right">{outputInvTotal > 0 ? formatNum(outputInvTotal) : '—'}</span>
                      )}
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
              const tIncome    = tot.reduce((s, p) => s + (dashStats.byProject[String(p.id)]?.income       || 0), 0);
              const tOutputInv = tot.reduce((s, p) => s + (dashStats.byProject[String(p.id)]?.outputInvoices || 0), 0);
              const tClientAmt = tot.reduce((s, p) => s + (Number(p.clientContractAmount) || 0), 0);
              return (
                <tfoot className="bg-gray-50 font-semibold text-sm border-t border-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-gray-700" colSpan={4}>合計（{tot.length} 件）</td>
                    <td className="px-4 py-3 text-right text-gray-700">NT$ {formatNum(tBudget)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">合約 NT$ {formatNum(tContracts)}</td>
                    <td className="px-4 py-3 text-xs text-green-700">已付 NT$ {formatNum(tPaid)}</td>
                    <td className="px-4 py-3 text-xs text-blue-700">收款 NT$ {formatNum(tIncome)}{tClientAmt > 0 ? ` (${((tIncome / tClientAmt) * 100).toFixed(0)}%)` : ''}</td>
                    <td className="px-4 py-3 text-xs text-purple-700">開票 NT$ {formatNum(tOutputInv)}{tClientAmt > 0 ? ` (${((tOutputInv / tClientAmt) * 100).toFixed(0)}%)` : ''}</td>
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
        const clientAmt = Number(proj.clientContractAmount || 0);
        const incomeTotal = dashStats.byProject[String(proj.id)]?.income || 0;
        const outputInvTotal = dashStats.byProject[String(proj.id)]?.outputInvoices || 0;
        const incomePct = clientAmt > 0 ? Math.min((incomeTotal / clientAmt) * 100, 100) : 0;
        const outputInvPct = clientAmt > 0 ? Math.min((outputInvTotal / clientAmt) * 100, 100) : 0;
        const projMilestones = milestonesMap[proj.id] || [];
        const completedMilestones = projMilestones.filter(m => m.status === 'completed');
        const engineeringPct = completedMilestones.length > 0
          ? Math.max(...completedMilestones.map(m => m.completionPct))
          : 0;
        const isExpanded = expandedProjects.has(proj.id);
        const statusStyle = proj.status === '進行中' ? 'bg-blue-100 text-blue-700' : proj.status === '已結案' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';

        return (
          <div key={proj.id} className={`bg-white rounded-xl border ${overBudget ? 'border-red-300' : 'border-gray-200'} overflow-hidden`}>
            <button className="w-full px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors text-left"
              onClick={() => toggleCard(proj.id)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>{proj.status}</span>
                  {overBudget && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">超支</span>}
                  {proj.warrantyEndDate && (() => { const ws = warrantyStatus(proj.warrantyEndDate, today); return ws ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${ws.color}`}>{ws.label}</span> : null; })()}
                  <span className="font-semibold text-gray-800">{proj.code} {proj.name}</span>
                  <Link href={`/engineering/${proj.id}`} onClick={e => e.stopPropagation()} className="text-xs text-amber-600 hover:underline ml-1">詳情</Link>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {proj.clientName && <span>業主：{proj.clientName}</span>}
                  {(proj.warehouseRef?.name || proj.warehouse) && <span>館別：{proj.warehouseRef?.name || proj.warehouse}</span>}
                  {proj.startDate && <span>{proj.startDate}{proj.endDate ? ` ～ ${proj.endDate}` : ''}</span>}
                  {proj.warrantyEndDate && <span className="text-purple-500">保固至 {proj.warrantyEndDate}{proj.warrantyMonths ? `（${proj.warrantyMonths}個月）` : ''}</span>}
                  <span>{projContracts.length} 家廠商・{totalTerms} 個期數</span>
                </div>
              </div>
              <div className="hidden md:block w-80 shrink-0 space-y-1.5">
                {budget > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span className={overBudget ? 'text-red-600 font-medium' : ''}>合約 {formatNum(totalContracted)}</span>
                      <span className="text-gray-400">預算 {formatNum(budget)}　{contractedPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : contractedPct > 80 ? 'bg-orange-400' : 'bg-amber-500'}`} style={{ width: `${contractedPct}%` }} />
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-green-700 font-medium">付款 {formatNum(totalPaid)}</span>
                    <span className="text-gray-400">{paidTerms}/{totalTerms} 期　{paidOfContractedPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${paidOfContractedPct}%` }} />
                  </div>
                </div>
                {clientAmt > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-blue-600 font-medium">收款 {formatNum(incomeTotal)}</span>
                      <span className="text-gray-400">業主 {formatNum(clientAmt)}　{incomePct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${incomePct}%` }} />
                    </div>
                  </div>
                )}
                {clientAmt > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-purple-600 font-medium">開票 {formatNum(outputInvTotal)}</span>
                      <span className="text-gray-400">{outputInvPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${outputInvPct}%` }} />
                    </div>
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-amber-700 font-medium">工程 {engineeringPct > 0 ? `${engineeringPct}%` : (projMilestones.length === 0 && !isExpanded ? '點擊展開設定' : '尚無里程碑')}</span>
                    {engineeringPct > 0 && <span className="text-gray-400">{completedMilestones.length}/{projMilestones.length} 個里程碑</span>}
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${engineeringPct}%` }} />
                  </div>
                </div>
              </div>
              <span className="text-gray-400 text-sm mt-1 shrink-0">{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50 space-y-4">
                {/* ── 工程里程碑 ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-600">工程里程碑</span>
                    <span className="text-xs text-amber-700 font-medium">{engineeringPct > 0 ? `目前完成 ${engineeringPct}%` : '尚無完成的里程碑'}</span>
                  </div>
                  {milestonesLoading[proj.id] ? (
                    <p className="text-xs text-gray-400">載入中…</p>
                  ) : (
                    <>
                      {projMilestones.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {projMilestones.map(m => (
                            <div key={m.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${m.status === 'completed' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-gray-200 text-gray-600'}`}>
                              <span className="font-medium">{m.name}</span>
                              <span className={`font-bold ${m.status === 'completed' ? 'text-amber-600' : 'text-gray-400'}`}>{m.completionPct}%</span>
                              {m.status === 'completed'
                                ? <button onClick={() => reopenMilestone(m)} className="text-gray-400 hover:text-amber-600 ml-0.5" title="取消完成">✓</button>
                                : <button onClick={() => completeMilestone(m)} className="text-gray-300 hover:text-amber-600 ml-0.5" title="標記完成">○</button>}
                              <button onClick={() => deleteMilestone(m)} className="text-gray-300 hover:text-red-500 ml-0.5">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 新增里程碑 inline form */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          value={addForms[proj.id]?.name || ''}
                          onChange={e => setAddForms(p => ({ ...p, [proj.id]: { ...(p[proj.id] || {}), name: e.target.value } }))}
                          placeholder="里程碑名稱（例：主體完工）"
                          className="border rounded px-2 py-1 text-xs flex-1 min-w-[140px]"
                        />
                        <input
                          type="number" min="0" max="100"
                          value={addForms[proj.id]?.completionPct ?? ''}
                          onChange={e => setAddForms(p => ({ ...p, [proj.id]: { ...(p[proj.id] || {}), completionPct: e.target.value } }))}
                          placeholder="完成度 %"
                          className="border rounded px-2 py-1 text-xs w-20"
                        />
                        <input
                          type="date"
                          value={addForms[proj.id]?.plannedDate || ''}
                          onChange={e => setAddForms(p => ({ ...p, [proj.id]: { ...(p[proj.id] || {}), plannedDate: e.target.value } }))}
                          className="border rounded px-2 py-1 text-xs w-32"
                        />
                        <button
                          onClick={() => addMilestone(proj.id)}
                          disabled={addSaving[proj.id]}
                          className="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {addSaving[proj.id] ? '…' : '＋ 新增'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* ── 保固維修記錄 ── */}
                {proj.warrantyEndDate && (() => {
                  const projRecords = warrantyRecords.filter(r => r.projectId === proj.id);
                  const ws = warrantyStatus(proj.warrantyEndDate, today);
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-600">保固與維修</span>
                          {ws && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ws.color}`}>{ws.label}</span>}
                          {proj.warrantyNote && <span className="text-[10px] text-gray-400">{proj.warrantyNote}</span>}
                        </div>
                        <span className="text-xs text-gray-400">保固至 {proj.warrantyEndDate}</span>
                      </div>
                      {projRecords.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {projRecords.map(r => (
                            <div key={r.id} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${r.status === 'resolved' ? 'bg-green-50 border border-green-100' : 'bg-orange-50 border border-orange-100'}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-medium text-gray-700">{r.reportDate}</span>
                                  {r.handler && <span className="text-gray-500">【{r.handler}】</span>}
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>{r.status === 'resolved' ? '已解決' : '待處理'}</span>
                                  {r.resolvedDate && <span className="text-green-500">解決：{r.resolvedDate}</span>}
                                  {r.cost && <span className="text-gray-500">費用：{Number(r.cost).toLocaleString('zh-TW')}</span>}
                                </div>
                                <div className="text-gray-600 mt-0.5">{r.description}</div>
                                {r.note && <div className="text-gray-400 mt-0.5">{r.note}</div>}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {r.status === 'pending' && <button onClick={() => resolveWarrantyRecord(r)} className="text-green-600 hover:underline text-[11px]">解決</button>}
                                <button onClick={() => deleteWarrantyRecord(r)} className="text-red-400 hover:text-red-600 text-[11px]">×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {projRecords.length === 0 && <p className="text-xs text-gray-400 mb-2">保固期間尚無維修紀錄</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <input type="date" value={warrantyForms[proj.id]?.reportDate || today}
                          onChange={e => setWarrantyForms(p => ({ ...p, [proj.id]: { ...(p[proj.id] || {}), reportDate: e.target.value } }))}
                          className="border rounded px-2 py-1 text-xs w-32" />
                        <input value={warrantyForms[proj.id]?.description || ''}
                          onChange={e => setWarrantyForms(p => ({ ...p, [proj.id]: { ...(p[proj.id] || {}), description: e.target.value } }))}
                          placeholder="問題描述（必填）"
                          className="border rounded px-2 py-1 text-xs flex-1 min-w-[160px]" />
                        <input value={warrantyForms[proj.id]?.handler || ''}
                          onChange={e => setWarrantyForms(p => ({ ...p, [proj.id]: { ...(p[proj.id] || {}), handler: e.target.value } }))}
                          placeholder="處理人員"
                          className="border rounded px-2 py-1 text-xs w-24" />
                        <button onClick={() => addWarrantyRecord(proj.id)} disabled={warrantySaving[proj.id]}
                          className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:opacity-50 whitespace-nowrap">
                          {warrantySaving[proj.id] ? '…' : '＋ 新增'}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── 合約明細 ── */}
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
