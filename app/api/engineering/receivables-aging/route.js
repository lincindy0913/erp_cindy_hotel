/**
 * GET /api/engineering/receivables-aging
 * 應收帳款帳齡分析：以銷項發票為基礎，計算每張未收齊發票的逾期天數
 * 帳齡分組：未到期 / 1-30天 / 31-60天 / 61-90天 / 90天以上
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function daysDiff(dateStr, today) {
  if (!dateStr) return null;
  return Math.floor((new Date(today) - new Date(dateStr)) / 86400000);
}

function agingBucket(days) {
  if (days === null) return 'no_due';
  if (days < 0)   return 'current';
  if (days <= 30)  return 'days_1_30';
  if (days <= 60)  return 'days_31_60';
  if (days <= 90)  return 'days_61_90';
  return 'days_90plus';
}

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ENGINEERING_VIEW);
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const today = searchParams.get('asOf') || new Date().toISOString().slice(0, 10);
    const projectId = searchParams.get('projectId');

    const where = { status: '已開立' };
    if (projectId) where.projectId = parseInt(projectId);

    const invoices = await prisma.engineeringOutputInvoice.findMany({
      where,
      include: {
        project:  { select: { id: true, code: true, name: true, clientName: true } },
        incomes:  { select: { id: true, termName: true, receivedDate: true, amount: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
    });

    const bucketTotals = {
      current:     { label: '未到期',   invoices: [], totalAmount: 0, unpaidAmount: 0 },
      days_1_30:   { label: '逾期 1-30 天',  invoices: [], totalAmount: 0, unpaidAmount: 0 },
      days_31_60:  { label: '逾期 31-60 天', invoices: [], totalAmount: 0, unpaidAmount: 0 },
      days_61_90:  { label: '逾期 61-90 天', invoices: [], totalAmount: 0, unpaidAmount: 0 },
      days_90plus: { label: '逾期 90 天以上', invoices: [], totalAmount: 0, unpaidAmount: 0 },
      no_due:      { label: '無到期日',  invoices: [], totalAmount: 0, unpaidAmount: 0 },
    };

    let grandTotal = 0;
    let grandReceived = 0;
    let grandUnpaid = 0;

    for (const inv of invoices) {
      const total    = Number(inv.totalAmount);
      const received = (inv.incomes || []).reduce((s, r) => s + Number(r.amount), 0);
      const unpaid   = Math.max(0, total - received);
      if (unpaid <= 0.01) continue; // 已收齊，不列入

      const overdueDays = daysDiff(inv.dueDate, today);
      const bucket = agingBucket(overdueDays);
      const record = {
        id:          inv.id,
        projectCode: inv.project?.code,
        projectName: inv.project?.name,
        clientName:  inv.project?.clientName || inv.clientName,
        invoiceNo:   inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        dueDate:     inv.dueDate,
        overdueDays: overdueDays,
        totalAmount: total,
        receivedAmount: received,
        unpaidAmount: unpaid,
      };
      bucketTotals[bucket].invoices.push(record);
      bucketTotals[bucket].totalAmount  += total;
      bucketTotals[bucket].unpaidAmount += unpaid;
      grandTotal    += total;
      grandReceived += received;
      grandUnpaid   += unpaid;
    }

    return NextResponse.json({
      asOf: today,
      buckets: bucketTotals,
      summary: { totalAmount: grandTotal, receivedAmount: grandReceived, unpaidAmount: grandUnpaid, invoiceCount: Object.values(bucketTotals).reduce((s, b) => s + b.invoices.length, 0) },
    });
  } catch (e) { return handleApiError(e); }
}
