// @deprecated — 舊版月調節表系統。新功能請在 /api/reconciliation/ 開發。
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { RECON_LINE_STATUS } from '@/lib/recon-statuses';

export const dynamic = 'force-dynamic';

// POST: 新增存摺明細行
export async function POST(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const data = await request.json();

    const stmt = await prisma.bankStatement.findUnique({ where: { id } });
    if (!stmt) return createErrorResponse('NOT_FOUND', '找不到調節表', 404);

    // 支援批次新增（array）或單筆（object）
    const rows = Array.isArray(data) ? data : [data];

    const created = await prisma.$transaction(
      rows.map(r => prisma.bankReconLine.create({
        data: {
          bankStatementId: id,
          txDate:          r.txDate,
          description:     r.description || null,
          creditAmount:    Number(r.creditAmount ?? 0),
          debitAmount:     Number(r.debitAmount  ?? 0),
          runningBalance:  r.runningBalance != null ? Number(r.runningBalance) : null,
          matchedTxId:     r.matchedTxId   ? parseInt(r.matchedTxId) : null,
          matchStatus:     r.matchedTxId   ? RECON_LINE_STATUS.MATCHED : RECON_LINE_STATUS.UNMATCHED,
          note:            r.note || null,
        },
      }))
    );

    return NextResponse.json(created.map(l => ({
      ...l,
      creditAmount:   Number(l.creditAmount),
      debitAmount:    Number(l.debitAmount),
      runningBalance: l.runningBalance != null ? Number(l.runningBalance) : null,
      createdAt:      l.createdAt.toISOString(),
    })), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
