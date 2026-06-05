'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Navigation from '@/components/Navigation';
import FetchErrorBanner from '@/components/FetchErrorBanner';
import { todayStr } from '@/lib/localDate';
import { getActualPaid } from '@/lib/engineering/payment-utils';
import { formatNum } from '@/lib/engineering/format-utils';

const SUB_TABS = [
  { key: 'contracts', label: '合約與期數' },
  { key: 'materials', label: '材料使用' },
  { key: 'payments', label: '付款狀況' },
  { key: 'income', label: '收款狀況' },
  { key: 'inputInvoices', label: '進項發票' },
  { key: 'outputInvoices', label: '銷項發票' },
];

function StatusBadge({ status }) {
  const style =
    status === '進行中' ? 'bg-blue-100 text-blue-700' :
    status === '已結案' ? 'bg-green-100 text-green-700' :
    'bg-gray-100 text-gray-500';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${style}`}>{status}</span>;
}

function ProjectDetailInner() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [paymentOrders, setPaymentOrders] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [inputInvoices, setInputInvoices] = useState([]);
  const [outputInvoices, setOutputInvoices] = useState([]);
  const [progressClaims, setProgressClaims] = useState([]);
  const [unassignedInvCount, setUnassignedInvCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('contracts');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/engineering/projects/${id}`).then(r => r.json()),
      fetch(`/api/payment-orders?sourceType=engineering&all=true`).then(r => r.json()),
      fetch(`/api/engineering/income?projectId=${id}`).then(r => r.json()),
      fetch(`/api/engineering/input-invoices?projectId=${id}`).then(r => r.json()),
      fetch(`/api/engineering/output-invoices?projectId=${id}`).then(r => r.json()),
      fetch(`/api/engineering/progress-claims?projectId=${id}`).then(r => r.json()).catch(() => []),
      fetch('/api/notifications/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([proj, pos, inc, inInvs, outInvs, claims, ntf]) => {
      if (proj?.error) { setError(proj.error?.message || '找不到工程案'); return; }
      setProject(proj);
      const termIds = new Set(
        (proj.contracts || []).flatMap(c => (c.terms || []).map(t => t.id))
      );
      setPaymentOrders((Array.isArray(pos) ? pos : []).filter(po => termIds.has(po.sourceRecordId)));
      setIncomes(Array.isArray(inc) ? inc : []);
      setInputInvoices(Array.isArray(inInvs) ? inInvs : []);
      setOutputInvoices(Array.isArray(outInvs) ? outInvs : []);
      setProgressClaims(Array.isArray(claims) ? claims : []);
      const n17 = ntf?.notifications?.find(n => n.code === 'N17');
      setUnassignedInvCount(n17?.count || 0);
    }).catch(e => setError(e.message || '載入失敗')).finally(() => setLoading(false));
  }, [id]);

  const contracts = useMemo(() => project?.contracts || [], [project]);
  const materials = useMemo(() => project?.materials || [], [project]);

  const totalContracted = useMemo(() =>
    contracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0), [contracts]);

  const totalPaid = useMemo(() =>
    contracts.reduce((s, c) =>
      s + (c.terms || []).reduce((ts, t) =>
        ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行')
          .reduce((ps, po) => ps + getActualPaid(po), 0), 0), 0),
    [contracts, paymentOrders]);

  const totalIncome = useMemo(() =>
    incomes.reduce((s, i) => s + Number(i.amount || 0), 0), [incomes]);

  const sumInputInv = useMemo(() =>
    inputInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0), [inputInvoices]);

  const sumOutputInv = useMemo(() =>
    outputInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0), [outputInvoices]);

  // 未付期數
  const unpaidTerms = useMemo(() =>
    contracts.flatMap(c => (c.terms || []).filter(t =>
      !['paid', 'cancelled', 'void'].includes(t.status)
    )), [contracts]);
  const unpaidTermsAmount = useMemo(() =>
    unpaidTerms.reduce((s, t) => s + Number(t.amount || 0), 0), [unpaidTerms]);

  // 估驗計價合計
  const totalClaimed    = useMemo(() => progressClaims.reduce((s, c) => s + Number(c.claimAmount || 0), 0), [progressClaims]);
  const totalCertified  = useMemo(() => progressClaims.filter(c => c.certifiedAmount != null).reduce((s, c) => s + Number(c.certifiedAmount || 0), 0), [progressClaims]);
  const totalClaimRecvd = useMemo(() => progressClaims.reduce((s, c) => s + (c.incomes || []).reduce((ss, i) => ss + Number(i.amount || 0), 0), 0), [progressClaims]);

  const retentionStats = useMemo(() => {
    let totalRetained = 0;
    let totalReleased = 0;
    for (const c of contracts) {
      for (const t of c.terms || []) {
        if ((t.termType || 'regular') === 'regular') {
          totalRetained += Number(t.retentionAmount || 0);
        } else if (t.termType === 'retention_release' && t.status === 'paid') {
          totalReleased += Number(t.amount || 0);
        }
      }
    }
    return { totalRetained, totalReleased, balance: totalRetained - totalReleased };
  }, [contracts]);

  // ── 下一步建議（計算目前工程案需要處理的事項）────────────────
  const nextSteps = useMemo(() => {
    if (!project) return [];
    const today = todayStr();
    const steps = [];

    // 逾期未付期數
    const overdueTerms = contracts.flatMap(c =>
      (c.terms || []).filter(t =>
        t.dueDate && t.dueDate < today &&
        !['已付款', 'paid', 'cancelled', 'void'].includes(t.status)
      )
    );
    if (overdueTerms.length > 0) {
      steps.push({
        level: 'critical',
        msg: `${overdueTerms.length} 筆期數已逾期尚未付款`,
        action: { label: '前往合約與期數', tab: 'contracts' },
      });
    }

    // 待出納付款單
    const pendingCashier = paymentOrders.filter(po => po.status === '待出納');
    if (pendingCashier.length > 0) {
      steps.push({
        level: 'urgent',
        msg: `${pendingCashier.length} 筆付款單待出納執行`,
        action: { label: '前往付款狀況', tab: 'payments' },
        extra: { label: '前往出納', href: '/cashier' },
      });
    }

    // 草稿付款單
    const draftOrders = paymentOrders.filter(po => po.status === '草稿');
    if (draftOrders.length > 0) {
      steps.push({
        level: 'warning',
        msg: `${draftOrders.length} 筆付款單草稿尚未送出`,
        action: { label: '前往付款狀況', tab: 'payments' },
      });
    }

    // 合約已有但無進款登錄
    if (contracts.length > 0 && incomes.length === 0 && project.clientContractAmount) {
      steps.push({
        level: 'warning',
        msg: '尚無業主收款登錄',
        action: { label: '前往收款狀況', tab: 'income' },
      });
    }

    // 未分配分業進項發票
    if (unassignedInvCount > 0) {
      steps.push({
        level: 'warning',
        msg: `系統中有 ${unassignedInvCount} 張未分配分業進項發票，可能屬於本工程案`,
        action: { label: '前往進項發票', tab: 'inputInvoices' },
        extra: { label: '前往分配', href: '/company-expenses?tab=invoices' },
      });
    }

    return steps;
  }, [project, contracts, paymentOrders, incomes, unassignedInvCount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <FetchErrorBanner
            message={error || '找不到此工程案，可能已被刪除。'}
            onRetry={error ? () => window.location.reload() : undefined}
          />
          <div className="mt-4 text-center">
            <Link href="/engineering" className="text-amber-600 hover:underline text-sm">← 返回工程案列表</Link>
          </div>
        </div>
      </div>
    );
  }

  const budget = Number(project.budget) || 0;
  const contractedPct = budget > 0 ? Math.min((totalContracted / budget) * 100, 100) : 0;
  const paidPct = totalContracted > 0 ? Math.min((totalPaid / totalContracted) * 100, 100) : 0;
  const overBudget = budget > 0 && totalContracted > budget;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* 麵包屑 */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/engineering" className="hover:text-amber-600 hover:underline">工程會計</Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">{project.code} {project.name}</span>
        </div>

        {/* 工程案標題卡 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="font-mono text-sm bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded">{project.code}</span>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <StatusBadge status={project.status} />
                {overBudget && <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-600">超支</span>}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                {project.clientName && <span>業主：<span className="text-gray-700">{project.clientName}</span></span>}
                {(project.warehouseRef?.name || project.warehouse) && <span>館別：<span className="text-gray-700">{project.warehouseRef?.name || project.warehouse}</span></span>}
                {project.departmentRef?.name && <span>部門：<span className="text-gray-700">{project.departmentRef.name}</span></span>}
                {project.location && <span>地點：<span className="text-gray-700">{project.location}</span></span>}
                {project.startDate && <span>期間：<span className="text-gray-700">{project.startDate}{project.endDate ? ` ～ ${project.endDate}` : ''}</span></span>}
                {project.permitNo && <span>使照號碼：<span className="text-gray-700">{project.permitNo}</span></span>}
                {project.buildingNo && <span>建照號碼：<span className="text-gray-700">{project.buildingNo}</span></span>}
              </div>
              {project.note && <p className="mt-2 text-xs text-gray-400">{project.note}</p>}
            </div>
            <Link href="/engineering" className="text-xs text-gray-400 hover:text-amber-600 hover:underline shrink-0">← 返回列表</Link>
          </div>

          {/* KPI 統計列 */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 mt-5 pt-4 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">預算</p>
              <p className="font-bold text-gray-700">{budget > 0 ? `NT$ ${formatNum(budget)}` : <span className="text-gray-400 font-normal text-xs">未設定</span>}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">廠商發包</p>
              <p className={`font-bold ${overBudget ? 'text-red-600' : 'text-amber-700'}`}>NT$ {formatNum(totalContracted)}</p>
              {budget > 0 && <p className="text-xs text-gray-400 mt-0.5">{contractedPct.toFixed(1)}% 預算</p>}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">已付款</p>
              <p className="font-bold text-green-700">NT$ {formatNum(totalPaid)}</p>
              {totalContracted > 0 && <p className="text-xs text-gray-400 mt-0.5">{paidPct.toFixed(1)}% 發包</p>}
            </div>
            {retentionStats.totalRetained > 0 && (
              <div>
                <p className="text-xs text-orange-400 mb-0.5">保留款餘額</p>
                <p className={`font-bold ${retentionStats.balance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  NT$ {formatNum(retentionStats.balance)}
                </p>
                {retentionStats.totalReleased > 0 && (
                  <p className="text-xs text-green-500 mt-0.5">已撥 {formatNum(retentionStats.totalReleased)}</p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 mb-0.5">業主合約</p>
              <p className="font-bold text-indigo-700">
                {project.clientContractAmount ? `NT$ ${formatNum(project.clientContractAmount)}` : <span className="text-gray-400 font-normal text-xs">未設定</span>}
              </p>
            </div>
            <button type="button" onClick={() => setActiveTab('income')} className="text-left hover:bg-teal-50 rounded-lg px-2 -mx-2 transition-colors">
              <p className="text-xs text-teal-600 mb-0.5">收款累計</p>
              <p className="font-bold text-teal-700">NT$ {formatNum(totalIncome)}</p>
              {incomes.length > 0 && <p className="text-xs text-teal-400 mt-0.5">{incomes.length} 筆</p>}
            </button>
            <button type="button" onClick={() => setActiveTab('contracts')} className="text-left hover:bg-red-50 rounded-lg px-2 -mx-2 transition-colors">
              <p className="text-xs text-red-500 mb-0.5">未付期數</p>
              <p className={`font-bold text-sm ${unpaidTerms.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{unpaidTerms.length} 期</p>
              {unpaidTerms.length > 0 && <p className="text-xs text-red-400 mt-0.5">NT$ {formatNum(unpaidTermsAmount)}</p>}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setActiveTab('inputInvoices')} className="flex-1 text-left hover:bg-blue-50 rounded-lg px-2 -mx-1 transition-colors">
                <p className="text-xs text-blue-600 mb-0.5">進項發票</p>
                <p className="font-bold text-blue-700 text-sm">NT$ {formatNum(sumInputInv)}</p>
              </button>
              <button type="button" onClick={() => setActiveTab('outputInvoices')} className="flex-1 text-left hover:bg-green-50 rounded-lg px-2 -mx-1 transition-colors">
                <p className="text-xs text-green-600 mb-0.5">銷項發票</p>
                <p className="font-bold text-green-700 text-sm">NT$ {formatNum(sumOutputInv)}</p>
              </button>
            </div>
          </div>

          {/* 進度條 */}
          {(budget > 0 || totalContracted > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {budget > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span className={overBudget ? 'text-red-600 font-medium' : ''}>廠商發包 NT$ {formatNum(totalContracted)}</span>
                    <span>預算 NT$ {formatNum(budget)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : contractedPct > 80 ? 'bg-orange-400' : 'bg-amber-500'}`}
                      style={{ width: `${contractedPct}%` }} />
                  </div>
                </div>
              )}
              {totalContracted > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span className="text-green-700">已付 NT$ {formatNum(totalPaid)}</span>
                    <span>發包 NT$ {formatNum(totalContracted)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${paidPct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 財務一覽 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">財務一覽</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* 收入端 */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">收入端</p>
              {[
                { label: '業主合約額', val: Number(project.clientContractAmount || 0), color: 'text-indigo-700', bold: true },
                { label: '估驗申報', val: totalClaimed, color: 'text-gray-700', sub: progressClaims.length > 0 ? `${progressClaims.length} 期` : null },
                { label: '已核定', val: totalCertified, color: 'text-green-700' },
                { label: '收款累計', val: totalIncome, color: 'text-teal-700', bold: true },
                { label: '應收未收', val: Math.max(0, totalCertified - totalIncome), color: totalCertified > totalIncome ? 'text-orange-600' : 'text-gray-400' },
                { label: '銷項發票', val: sumOutputInv, color: 'text-green-600' },
              ].map(({ label, val, color, bold, sub }) => (
                <div key={label} className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">{label}{sub && <span className="ml-1 text-gray-400">({sub})</span>}</span>
                  <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${color}`}>
                    {val > 0 ? `NT$ ${formatNum(val)}` : <span className="text-gray-300">—</span>}
                  </span>
                </div>
              ))}
            </div>
            {/* 支出端 */}
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">支出端</p>
              {[
                { label: '廠商發包合計', val: totalContracted, color: 'text-amber-700', bold: true },
                { label: '已付款', val: totalPaid, color: 'text-green-700' },
                { label: `未付期數（${unpaidTerms.length} 期）`, val: unpaidTermsAmount, color: unpaidTerms.length > 0 ? 'text-red-600' : 'text-gray-400' },
                { label: '保留款餘額', val: retentionStats.balance, color: retentionStats.balance > 0 ? 'text-orange-600' : 'text-gray-400' },
                { label: '進項發票', val: sumInputInv, color: 'text-blue-600' },
              ].map(({ label, val, color, bold }) => (
                <div key={label} className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${color}`}>
                    {val > 0 ? `NT$ ${formatNum(val)}` : <span className="text-gray-300">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 下一步建議 */}
        {nextSteps.length > 0 && (
          <div className="space-y-2 mb-5">
            {nextSteps.map((s, i) => {
              const colors = {
                critical: 'bg-red-50 border-red-400 text-red-800',
                urgent:   'bg-orange-50 border-orange-400 text-orange-800',
                warning:  'bg-amber-50 border-amber-300 text-amber-800',
              };
              const btnColors = {
                critical: 'bg-red-600 text-white hover:bg-red-700',
                urgent:   'bg-orange-500 text-white hover:bg-orange-600',
                warning:  'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200',
              };
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-l-4 ${colors[s.level]}`}>
                  <span className="text-sm flex-1">{s.msg}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab(s.action.tab)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium ${btnColors[s.level]}`}
                  >
                    {s.action.label}
                  </button>
                  {s.extra && (
                    <Link
                      href={s.extra.href}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      {s.extra.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 子分頁 Tab 列 */}
        <div className="flex flex-wrap gap-1 mb-5 bg-white rounded-lg shadow p-1">
          {SUB_TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== 合約與期數 ===== */}
        {activeTab === 'contracts' && (
          <div className="space-y-4">
            {contracts.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
                此工程案尚無廠商合約，請至
                <Link href="/engineering?tab=contracts" className="text-amber-600 hover:underline mx-1">合約與期數</Link>
                分頁新增。
              </div>
            ) : contracts.map(c => {
              const terms = c.terms || [];
              const cPaid = terms.reduce((ts, t) =>
                ts + paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行')
                  .reduce((ps, po) => ps + getActualPaid(po), 0), 0);
              const paidTerms = terms.filter(t => {
                const p = paymentOrders.filter(po => po.sourceRecordId === t.id && po.status === '已執行')
                  .reduce((ps, po) => ps + getActualPaid(po), 0);
                return p >= Number(t.amount) && Number(t.amount) > 0;
              }).length;
              const cTotal = Number(c.totalAmount || 0);
              const cPaidPct = cTotal > 0 ? Math.min((cPaid / cTotal) * 100, 100) : 0;
              const isCompleted = c.status === 'completed';

              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* 合約標題 */}
                  <div className="px-5 py-4 bg-amber-50/50 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800">{c.supplier?.name || '未知廠商'}</span>
                          <span className="font-mono text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded">{c.contractNo}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isCompleted ? '已完成' : '進行中'}
                          </span>
                        </div>
                        {c.signDate && <p className="text-xs text-gray-400 mt-0.5">簽約日：{c.signDate}</p>}
                        {c.content && <p className="text-xs text-gray-500 mt-1">{c.content}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-gray-800">NT$ {formatNum(cTotal)}</div>
                        <div className="text-xs text-gray-400">{paidTerms}/{terms.length} 期・已付 {formatNum(cPaid)}</div>
                      </div>
                    </div>
                    {cTotal > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>付款進度</span>
                          <span>{cPaidPct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-green-400" style={{ width: `${cPaidPct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 期數表格 */}
                  {terms.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">期別</th>
                            <th className="px-4 py-2 text-right font-medium">金額</th>
                            <th className="px-4 py-2 text-left font-medium">應付日</th>
                            <th className="px-4 py-2 text-left font-medium">付款狀態</th>
                            <th className="px-4 py-2 text-left font-medium">付款單號</th>
                            <th className="px-4 py-2 text-left font-medium">備註</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {terms.map(t => {
                            const termPOs = paymentOrders.filter(po => po.sourceRecordId === t.id);
                            const executedPOs = termPOs.filter(po => po.status === '已執行');
                            const pendingPOs = termPOs.filter(po => po.status === '待出納');
                            const tPaid = executedPOs.reduce((s, po) => s + getActualPaid(po), 0);
                            const isFullyPaid = tPaid >= Number(t.amount) && Number(t.amount) > 0;
                            const hasPending = pendingPOs.length > 0;
                            const today = todayStr();
                            const isOverdue = t.dueDate && t.dueDate < today && !isFullyPaid;

                            return (
                              <tr key={t.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/40' : ''}`}>
                                <td className="px-4 py-2.5 font-medium text-gray-700">
                                  {t.termName || `第${t.termNo ?? '?'}期`}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium">NT$ {formatNum(t.amount)}</td>
                                <td className="px-4 py-2.5">
                                  <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                                    {t.dueDate || '－'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  {isFullyPaid ? (
                                    <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">已付清</span>
                                  ) : hasPending ? (
                                    <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">待出納</span>
                                  ) : isOverdue ? (
                                    <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">逾期未付</span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">未付</span>
                                  )}
                                  {tPaid > 0 && !isFullyPaid && (
                                    <span className="ml-1 text-xs text-green-600">已付 {formatNum(tPaid)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                                  {termPOs.map(po => (
                                    <div key={po.id}>
                                      <span className={po.status === '已執行' ? 'text-green-600' : po.status === '待出納' ? 'text-yellow-600' : 'text-gray-400'}>
                                        {po.orderNo}
                                      </span>
                                      <span className="ml-1 text-gray-300">{po.status}</span>
                                    </div>
                                  ))}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-400">{t.note || '－'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== 材料使用 ===== */}
        {activeTab === 'materials' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {materials.length === 0 ? (
              <div className="p-10 text-center text-gray-400">此工程案尚無材料使用記錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">品項／說明</th>
                      <th className="px-4 py-3 text-right font-medium">數量</th>
                      <th className="px-4 py-3 text-left font-medium">單位</th>
                      <th className="px-4 py-3 text-right font-medium">單價</th>
                      <th className="px-4 py-3 text-right font-medium">小計</th>
                      <th className="px-4 py-3 text-left font-medium">使用日</th>
                      <th className="px-4 py-3 text-left font-medium">領料單</th>
                      <th className="px-4 py-3 text-left font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {materials.map(m => {
                      const sub = Number(m.quantity) * Number(m.unitPrice);
                      return (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium">
                            {m.product ? `${m.product.code} ${m.product.name}` : (m.description || '－')}
                          </td>
                          <td className="px-4 py-2.5 text-right">{formatNum(m.quantity)}</td>
                          <td className="px-4 py-2.5 text-gray-500">{m.unit || '－'}</td>
                          <td className="px-4 py-2.5 text-right">{formatNum(m.unitPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-medium">NT$ {formatNum(sub)}</td>
                          <td className="px-4 py-2.5 text-gray-500">{m.usedAt || '－'}</td>
                          <td className="px-4 py-2.5">
                            {m.requisitionNo
                              ? <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded font-mono">{m.requisitionNo}</span>
                              : <span className="text-xs text-gray-300">未連結</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{m.note || '－'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-gray-600">合計</td>
                      <td className="px-4 py-2.5 text-right font-bold text-gray-800">
                        NT$ {formatNum(materials.reduce((s, m) => s + Number(m.quantity) * Number(m.unitPrice), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== 付款狀況 ===== */}
        {activeTab === 'payments' && (
          <div>
            {/* KPI 小卡 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: '草稿', status: '草稿', color: 'border-gray-200 text-gray-700' },
                { label: '待出納', status: '待出納', color: 'border-yellow-200 text-yellow-700' },
                { label: '已執行', status: '已執行', color: 'border-green-200 text-green-700' },
                { label: '已拒絕／作廢', status: ['已拒絕', '已作廢'], color: 'border-red-200 text-red-600' },
              ].map(({ label, status, color }) => {
                const pos = paymentOrders.filter(po =>
                  Array.isArray(status) ? status.includes(po.status) : po.status === status
                );
                const total = pos.reduce((s, o) => s + Number(o.netAmount || 0), 0);
                return (
                  <div key={label} className={`bg-white rounded-lg border px-4 py-3 ${color.split(' ')[0]}`}>
                    <p className={`text-xs mb-1 ${color.split(' ')[1]}`}>{label}</p>
                    <p className={`text-xl font-bold ${color.split(' ')[1]}`}>{pos.length}</p>
                    <p className="text-xs text-gray-400 mt-0.5">NT$ {formatNum(total)}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {paymentOrders.length === 0 ? (
                <div className="p-10 text-center text-gray-400">此工程案尚無付款單</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">付款單號</th>
                        <th className="px-4 py-3 text-left font-medium">廠商</th>
                        <th className="px-4 py-3 text-left font-medium">摘要</th>
                        <th className="px-4 py-3 text-right font-medium">金額</th>
                        <th className="px-4 py-3 text-left font-medium">付款方式</th>
                        <th className="px-4 py-3 text-left font-medium">應付日</th>
                        <th className="px-4 py-3 text-left font-medium">狀態</th>
                        <th className="px-4 py-3 text-left font-medium">建立日期</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paymentOrders.map(o => {
                        const statusColor =
                          o.status === '已執行' ? 'bg-green-100 text-green-700' :
                          o.status === '待出納' ? 'bg-yellow-100 text-yellow-800' :
                          o.status === '已拒絕' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700';
                        return (
                          <tr key={o.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono">{o.orderNo}</td>
                            <td className="px-4 py-2.5">{o.supplierName || '－'}</td>
                            <td className="px-4 py-2.5 text-gray-600">{o.summary || '－'}</td>
                            <td className="px-4 py-2.5 text-right font-medium">NT$ {formatNum(o.netAmount)}</td>
                            <td className="px-4 py-2.5 text-gray-500">{o.paymentMethod || '－'}</td>
                            <td className="px-4 py-2.5 text-gray-500">{o.dueDate || '－'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded text-xs ${statusColor}`}>{o.status}</span>
                            </td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">
                              {o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '－'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-gray-600">合計（已執行）</td>
                        <td className="px-4 py-2.5 text-right font-bold text-green-700">
                          NT$ {formatNum(paymentOrders.filter(o => o.status === '已執行').reduce((s, o) => s + getActualPaid(o), 0))}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 收款狀況 ===== */}
        {activeTab === 'income' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* 業主合約收款摘要 */}
            {project.clientContractAmount && (
              <div className="px-5 py-4 bg-teal-50/50 border-b border-gray-100 flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">業主合約金額</p>
                  <p className="font-bold text-indigo-700">NT$ {formatNum(project.clientContractAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">已收款合計</p>
                  <p className="font-bold text-teal-700">NT$ {formatNum(totalIncome)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">尚未收款</p>
                  <p className={`font-bold ${Number(project.clientContractAmount) - totalIncome > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    NT$ {formatNum(Number(project.clientContractAmount) - totalIncome)}
                  </p>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>收款進度</span>
                    <span>{Number(project.clientContractAmount) > 0 ? ((totalIncome / Number(project.clientContractAmount)) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500"
                      style={{ width: `${Number(project.clientContractAmount) > 0 ? Math.min((totalIncome / Number(project.clientContractAmount)) * 100, 100) : 0}%` }} />
                  </div>
                </div>
              </div>
            )}
            {incomes.length === 0 ? (
              <div className="p-10 text-center text-gray-400">此工程案尚無收款記錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">期數名稱</th>
                      <th className="px-4 py-3 text-right font-medium">收款金額</th>
                      <th className="px-4 py-3 text-left font-medium">收款日期</th>
                      <th className="px-4 py-3 text-left font-medium">收款帳戶</th>
                      <th className="px-4 py-3 text-left font-medium">會計科目</th>
                      <th className="px-4 py-3 text-left font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {incomes.map(i => (
                      <tr key={i.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium">{i.termName}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-teal-700">NT$ {formatNum(i.amount)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{i.receivedDate || '－'}</td>
                        <td className="px-4 py-2.5 text-gray-500">{i.account?.name || '－'}</td>
                        <td className="px-4 py-2.5 text-gray-500">{i.accountingSubject || '－'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{i.note || '－'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td className="px-4 py-2.5 text-sm font-semibold text-gray-600">合計 ({incomes.length} 筆)</td>
                      <td className="px-4 py-2.5 text-right font-bold text-teal-700">NT$ {formatNum(totalIncome)}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== 進項發票 ===== */}
        {activeTab === 'inputInvoices' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {inputInvoices.length === 0 ? (
              <div className="p-10 text-center text-gray-400">此工程案尚無廠商進項發票記錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">廠商</th>
                      <th className="px-4 py-3 text-left font-medium">合約</th>
                      <th className="px-4 py-3 text-left font-medium">發票號碼</th>
                      <th className="px-4 py-3 text-left font-medium">發票日期</th>
                      <th className="px-4 py-3 text-right font-medium">未稅金額</th>
                      <th className="px-4 py-3 text-right font-medium">稅額</th>
                      <th className="px-4 py-3 text-right font-medium">含稅合計</th>
                      <th className="px-4 py-3 text-left font-medium">類型</th>
                      <th className="px-4 py-3 text-left font-medium">狀態</th>
                      <th className="px-4 py-3 text-left font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inputInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">{inv.supplierName || inv.contract?.supplier?.name || '－'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{inv.contract?.contractNo || '－'}</td>
                        <td className="px-4 py-2.5 font-mono">{inv.invoiceNo || '－'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{inv.invoiceDate || '－'}</td>
                        <td className="px-4 py-2.5 text-right">{formatNum(inv.amount)}</td>
                        <td className="px-4 py-2.5 text-right">{formatNum(inv.taxAmount)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-blue-700">NT$ {formatNum(inv.totalAmount)}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{inv.invoiceType || '－'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${inv.status === '已入帳' ? 'bg-green-100 text-green-700' : inv.status === '已對帳' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{inv.note || '－'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-gray-600">合計 ({inputInvoices.length} 張)</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatNum(inputInvoices.reduce((s, i) => s + Number(i.amount || 0), 0))}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatNum(inputInvoices.reduce((s, i) => s + Number(i.taxAmount || 0), 0))}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-blue-700">NT$ {formatNum(sumInputInv)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== 銷項發票 ===== */}
        {activeTab === 'outputInvoices' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {outputInvoices.length === 0 ? (
              <div className="p-10 text-center text-gray-400">此工程案尚無業主銷項發票記錄</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">業主</th>
                      <th className="px-4 py-3 text-left font-medium">發票號碼</th>
                      <th className="px-4 py-3 text-left font-medium">發票日期</th>
                      <th className="px-4 py-3 text-right font-medium">未稅金額</th>
                      <th className="px-4 py-3 text-right font-medium">稅額</th>
                      <th className="px-4 py-3 text-right font-medium">含稅合計</th>
                      <th className="px-4 py-3 text-left font-medium">類型</th>
                      <th className="px-4 py-3 text-left font-medium">狀態</th>
                      <th className="px-4 py-3 text-left font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {outputInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">{inv.clientName || project.clientName || '－'}</td>
                        <td className="px-4 py-2.5 font-mono">{inv.invoiceNo || '－'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{inv.invoiceDate || '－'}</td>
                        <td className="px-4 py-2.5 text-right">{formatNum(inv.amount)}</td>
                        <td className="px-4 py-2.5 text-right">{formatNum(inv.taxAmount)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-green-700">NT$ {formatNum(inv.totalAmount)}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{inv.invoiceType || '－'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${inv.status === '已作廢' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{inv.note || '－'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-gray-600">合計 ({outputInvoices.length} 張)</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatNum(outputInvoices.reduce((s, i) => s + Number(i.amount || 0), 0))}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatNum(outputInvoices.reduce((s, i) => s + Number(i.taxAmount || 0), 0))}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-700">NT$ {formatNum(sumOutputInv)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default function EngineeringProjectPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
      </div>
    }>
      <ProjectDetailInner />
    </Suspense>
  );
}
