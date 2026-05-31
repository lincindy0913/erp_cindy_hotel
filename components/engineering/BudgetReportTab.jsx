'use client';
import { useState, useMemo, Fragment } from 'react';

function fmt(n) {
  if (n == null || n === '') return '－';
  return Number(n).toLocaleString('zh-TW', { maximumFractionDigits: 0 });
}

function pct(n) {
  if (n == null || !isFinite(n)) return '－';
  return `${(n * 100).toFixed(1)}%`;
}

function getActualPaid(po) {
  if (po.status === '已執行' && po.executions && po.executions.length > 0) {
    return po.executions.reduce((s, e) => s + Number(e.actualAmount || 0), 0);
  }
  return Number(po.amount || 0);
}

function marginColor(v) {
  if (v == null || !isFinite(v)) return 'text-gray-400';
  if (v < 0) return 'text-red-600';
  if (v < 0.05) return 'text-orange-500';
  return 'text-green-700';
}

function KpiCard({ label, value, sub, color }) {
  const cls = {
    amber: { border: 'border-amber-100', label: 'text-amber-600', value: 'text-amber-700' },
    green: { border: 'border-green-100', label: 'text-green-600', value: 'text-green-700' },
    blue:  { border: 'border-blue-100',  label: 'text-blue-600',  value: 'text-blue-700'  },
  }[color] || {};
  return (
    <div className={`bg-white rounded-xl border ${cls.border} px-5 py-4`}>
      <p className={`text-xs mb-1 ${cls.label}`}>{label}</p>
      <p className={`text-3xl font-bold ${cls.value}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function DetailRow({ label, value, base, baseLabel }) {
  const v = Number(value || 0);
  const rate = base && base > 0 ? v / base : null;
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 text-xs">{label}</span>
      <div className="text-right">
        <span className="font-mono text-xs">{fmt(v)}</span>
        {rate != null && (
          <span className="text-gray-400 text-xs ml-2">
            {(rate * 100).toFixed(1)}%{baseLabel ? `占${baseLabel}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function ProfitRow({ label, value, rate, sub }) {
  const v = Number(value || 0);
  return (
    <div className="py-1 border-b border-gray-100 last:border-0">
      <div className="flex justify-between items-center">
        <span className="text-gray-500 text-xs">{label}</span>
        <span className={`font-mono text-xs font-semibold ${v < 0 ? 'text-red-600' : 'text-green-700'}`}>
          {fmt(v)}{rate != null && isFinite(rate) ? `　${(rate * 100).toFixed(1)}%` : ''}
        </span>
      </div>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

export default function BudgetReportTab({ projects, contracts, paymentOrders, progressClaims, dashStats }) {
  const [expanded, setExpanded] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState('進行中');

  function toggle(pid) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  // termId → projectId lookup
  const termProjectMap = useMemo(() => {
    const m = new Map();
    for (const c of contracts) {
      for (const t of c.terms || []) m.set(t.id, c.projectId);
    }
    return m;
  }, [contracts]);

  // 廠商已付（已執行）per project，透過 sourceRecordId→termId→projectId 推導
  const paidByProject = useMemo(() => {
    const m = {};
    for (const po of paymentOrders) {
      if (po.status !== '已執行') continue;
      const projId = po.sourceRecordId != null ? termProjectMap.get(po.sourceRecordId) : null;
      if (projId == null) continue;
      const k = String(projId);
      m[k] = (m[k] || 0) + getActualPaid(po);
    }
    return m;
  }, [paymentOrders, termProjectMap]);

  const projectMetrics = useMemo(() => {
    return projects.map(p => {
      const pid = String(p.id);
      const stat = dashStats.byProject?.[pid] || {};

      const clientContract = Number(p.clientContractAmount || 0);
      const outputInvoices = stat.outputInvoices || 0;
      const income         = stat.income || 0;
      const inputInvoices  = stat.inputInvoices || 0;
      const materialCost   = stat.materialCost || 0;

      const projContracts  = contracts.filter(c => c.projectId === p.id);
      const mainContracts  = projContracts.filter(c => (c.contractType || '主合約') === '主合約');
      const vendorContract = mainContracts.reduce((s, c) => s + Number(c.totalAmount || 0), 0);
      const vendorPaid     = paidByProject[pid] || 0;

      const certifiedAmount = progressClaims
        .filter(pc => pc.projectId === p.id && pc.status === 'certified')
        .reduce((s, pc) => s + Number(pc.certifiedAmount || 0), 0);

      const retention = projContracts.reduce(
        (s, c) => s + (c.terms || []).reduce((ts, t) => ts + Number(t.retentionAmount || 0), 0), 0
      );

      const estimatedProfit  = clientContract - vendorContract;
      const estimatedMargin  = clientContract > 0 ? estimatedProfit / clientContract : null;
      const accountingProfit = outputInvoices - inputInvoices;
      const accountingMargin = outputInvoices > 0 ? accountingProfit / outputInvoices : null;
      const actualProfit     = income - vendorPaid;
      const actualMargin     = income > 0 ? actualProfit / income : null;
      const paymentRate      = vendorContract > 0 ? vendorPaid / vendorContract : null;

      return {
        p, pid,
        clientContract, outputInvoices, certifiedAmount, income,
        vendorContract, vendorPaid,
        inputInvoices, materialCost, retention,
        estimatedProfit, estimatedMargin,
        accountingProfit, accountingMargin,
        actualProfit, actualMargin,
        paymentRate,
      };
    });
  }, [projects, contracts, progressClaims, dashStats, paidByProject]);

  const filtered = useMemo(() =>
    statusFilter === '全部' ? projectMetrics : projectMetrics.filter(m => m.p.status === statusFilter),
    [projectMetrics, statusFilter]
  );

  // 全域 KPI（依篩選後工程案合計）
  const totals = useMemo(() => {
    const t = filtered.reduce((s, m) => ({
      clientContract: s.clientContract + m.clientContract,
      vendorContract: s.vendorContract + m.vendorContract,
      income:         s.income + m.income,
      vendorPaid:     s.vendorPaid + m.vendorPaid,
    }), { clientContract: 0, vendorContract: 0, income: 0, vendorPaid: 0 });
    return {
      ...t,
      estimatedMargin: t.clientContract > 0 ? (t.clientContract - t.vendorContract) / t.clientContract : null,
      actualMargin:    t.income > 0 ? (t.income - t.vendorPaid) / t.income : null,
      paymentRate:     t.vendorContract > 0 ? t.vendorPaid / t.vendorContract : null,
    };
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const c = { 全部: projectMetrics.length, 進行中: 0, 已結案: 0, 暫停: 0 };
    projectMetrics.forEach(m => { if (c[m.p.status] !== undefined) c[m.p.status]++; });
    return c;
  }, [projectMetrics]);

  return (
    <div className="space-y-4">
      {/* 三個核心指標卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          color="amber"
          label="預估毛利率"
          value={pct(totals.estimatedMargin)}
          sub={`業主合約 ${fmt(totals.clientContract)} − 廠商發包 ${fmt(totals.vendorContract)}`}
        />
        <KpiCard
          color="green"
          label="實際毛利率"
          value={pct(totals.actualMargin)}
          sub={`已收 ${fmt(totals.income)} − 已付 ${fmt(totals.vendorPaid)}`}
        />
        <KpiCard
          color="blue"
          label="付款執行率"
          value={pct(totals.paymentRate)}
          sub={`廠商已付 ${fmt(totals.vendorPaid)} ÷ 發包合計 ${fmt(totals.vendorContract)}`}
        />
      </div>

      {/* 狀態篩選列 */}
      <div className="flex gap-1 border-b border-gray-200">
        {['全部', '進行中', '已結案', '暫停'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${statusFilter === s ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {s}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
              {statusCounts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* 主表格 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">工程案</th>
              <th className="px-4 py-3 text-right font-medium">業主合約</th>
              <th className="px-4 py-3 text-right font-medium">廠商發包</th>
              <th className="px-4 py-3 text-right font-medium">預估毛利率</th>
              <th className="px-4 py-3 text-right font-medium">已收款</th>
              <th className="px-4 py-3 text-right font-medium">已付款</th>
              <th className="px-4 py-3 text-right font-medium">實際毛利率</th>
              <th className="px-4 py-3 text-right font-medium">付款進度</th>
              <th className="px-4 py-3 text-center font-medium w-16">明細</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">無資料</td></tr>
            ) : filtered.map(m => (
              <Fragment key={m.pid}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-amber-700">{m.p.code}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[180px]">{m.p.name}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(m.clientContract)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(m.vendorContract)}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${marginColor(m.estimatedMargin)}`}>
                    {pct(m.estimatedMargin)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(m.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(m.vendorPaid)}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${marginColor(m.actualMargin)}`}>
                    {pct(m.actualMargin)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${marginColor(m.paymentRate)}`}>
                    {pct(m.paymentRate)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggle(m.pid)}
                      className="text-xs text-amber-600 hover:text-amber-800 hover:underline">
                      {expanded.has(m.pid) ? '▲ 收起' : '▼ 展開'}
                    </button>
                  </td>
                </tr>

                {expanded.has(m.pid) && (
                  <tr className="bg-amber-50/60">
                    <td colSpan={9} className="px-6 py-4">
                      <div className="grid grid-cols-3 gap-8">

                        {/* 收入面 */}
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">收入面</p>
                          <DetailRow label="業主合約金額" value={m.clientContract} />
                          <DetailRow label="已開銷項發票" value={m.outputInvoices}  base={m.clientContract} />
                          <DetailRow label="估驗核定金額" value={m.certifiedAmount} base={m.clientContract} />
                          <DetailRow label="已收業主款"   value={m.income}          base={m.clientContract} />
                        </div>

                        {/* 成本面 */}
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">成本面</p>
                          <DetailRow label="廠商發包（主合約）" value={m.vendorContract} base={m.clientContract} />
                          <DetailRow label="廠商已付款"         value={m.vendorPaid}     base={m.vendorContract} baseLabel="發包" />
                          <DetailRow label="廠商進項發票"       value={m.inputInvoices}  base={m.vendorContract} baseLabel="發包" />
                          <DetailRow label="直接材料費"         value={m.materialCost} />
                          {m.retention > 0 && (
                            <DetailRow label="保留款餘額" value={m.retention} />
                          )}
                        </div>

                        {/* 損益 */}
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">損益</p>
                          <ProfitRow
                            label="預估毛利"
                            value={m.estimatedProfit}
                            rate={m.estimatedMargin}
                            sub="合約 − 廠商發包"
                          />
                          <ProfitRow
                            label="帳面毛利"
                            value={m.accountingProfit}
                            rate={m.accountingMargin}
                            sub="銷項發票 − 進項發票"
                          />
                          <ProfitRow
                            label="實際毛利"
                            value={m.actualProfit}
                            rate={m.actualMargin}
                            sub="已收款 − 已付款"
                          />
                        </div>

                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
