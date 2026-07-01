/**
 * GET /api/engineering/analytics?year=YYYY
 *
 * 工程「分析報表」三張表：
 *   1) monthly  — 該年度 月別營收趨勢（銷項/進項/毛利/實收，含稅口徑同預算報表）
 *   2) byClient — 該年度 業主(客戶)別 銷項分析（未稅金額/稅額/含稅/張數/佔比）
 *   3) byProject— 各工程案 累計收付款進度（估驗計價/已開銷項/已收款/已付款/未收）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const N = (v) => Number(v || 0);
const ymOf = (s) => {
  const m = /^(\d{4})-(\d{1,2})/.exec(String(s || ''));
  return m ? { year: parseInt(m[1], 10), month: parseInt(m[2], 10) } : null;
};

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear(), 10);

    const [projects, outputs, inputs, incomes, claims, contracts, payments] = await Promise.all([
      prisma.engineeringProject.findMany({ select: { id: true, name: true, clientName: true } }),
      prisma.engineeringOutputInvoice.findMany({ select: { projectId: true, clientName: true, invoiceDate: true, amount: true, taxAmount: true, totalAmount: true } }),
      prisma.engineeringInputInvoice.findMany({ select: { projectId: true, invoiceDate: true, totalAmount: true } }),
      prisma.engineeringIncome.findMany({ select: { projectId: true, receivedDate: true, amount: true } }),
      prisma.engineeringProgressClaim.findMany({ select: { projectId: true, certifiedAmount: true, status: true } }),
      prisma.engineeringContract.findMany({ select: { projectId: true, terms: { select: { id: true } } } }),
      prisma.paymentOrder.findMany({ where: { status: '已執行' }, select: { sourceRecordId: true, netAmount: true } }),
    ]);

    const projMap = new Map(projects.map((p) => [p.id, p]));
    const termToProject = new Map();
    for (const c of contracts) for (const t of c.terms) termToProject.set(t.id, c.projectId);

    // ── 1) 月別營收趨勢（該年度）──
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, output: 0, input: 0, income: 0 }));
    for (const o of outputs) { const d = ymOf(o.invoiceDate); if (d?.year === year) monthly[d.month - 1].output += N(o.totalAmount); }
    for (const o of inputs)  { const d = ymOf(o.invoiceDate); if (d?.year === year) monthly[d.month - 1].input  += N(o.totalAmount); }
    for (const r of incomes) { const d = ymOf(r.receivedDate); if (d?.year === year) monthly[d.month - 1].income += N(r.amount); }
    for (const m of monthly) m.gross = m.output - m.input;

    // ── 2) 業主(客戶)別 銷項分析（該年度）──
    const clientMap = new Map();
    for (const o of outputs) {
      const d = ymOf(o.invoiceDate); if (d?.year !== year) continue;
      const name = (o.clientName || projMap.get(o.projectId)?.clientName || '（未指定）').trim() || '（未指定）';
      if (!clientMap.has(name)) clientMap.set(name, { client: name, amount: 0, tax: 0, total: 0, count: 0 });
      const r = clientMap.get(name);
      r.amount += N(o.amount); r.tax += N(o.taxAmount); r.total += N(o.totalAmount); r.count += 1;
    }
    const byClient = [...clientMap.values()].sort((a, b) => b.total - a.total);
    const clientGrand = byClient.reduce((s, r) => s + r.total, 0);
    for (const r of byClient) r.pct = clientGrand > 0 ? Math.round((r.total / clientGrand) * 1000) / 10 : 0;

    // ── 3) 各工程案 累計收付款進度（全期）──
    const progMap = new Map();
    const ensure = (pid) => {
      if (!progMap.has(pid)) progMap.set(pid, { projectId: pid, name: projMap.get(pid)?.name || `#${pid}`, clientName: projMap.get(pid)?.clientName || '', certified: 0, output: 0, income: 0, paid: 0 });
      return progMap.get(pid);
    };
    for (const c of claims) if (['certified', '已審核'].includes(c.status)) ensure(c.projectId).certified += N(c.certifiedAmount);
    for (const o of outputs) ensure(o.projectId).output += N(o.totalAmount);
    for (const r of incomes) ensure(r.projectId).income += N(r.amount);
    for (const pay of payments) { const pid = termToProject.get(pay.sourceRecordId); if (pid != null) ensure(pid).paid += N(pay.netAmount); }
    const byProject = [...progMap.values()]
      .map((r) => ({ ...r, unreceived: r.output - r.income }))
      .sort((a, b) => b.output - a.output);

    return NextResponse.json({ year, monthly, byClient, byProject });
  } catch (error) {
    return handleApiError(error);
  }
}
