// @deprecated — 舊版月調節表系統。新功能請在 /api/reconciliation/ 開發。
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// PATCH: 更新存摺明細（配對/解除配對/標例外）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const lineId = parseInt((await params).lineId);
    const data   = await request.json();

    const patchData = {
      matchStatus:  data.matchStatus  ?? undefined,
      note:         data.note         ?? undefined,
      description:  data.description  ?? undefined,
    };

    if ('matchedTxId' in data) {
      if (data.matchedTxId != null) {
        // 人工配對
        patchData.matchedTxId = parseInt(data.matchedTxId);
        patchData.matchScore  = null;
        patchData.matchedBy   = auth.session?.user?.email ?? 'manual';
      } else {
        // 解除配對
        patchData.matchedTxId = null;
        patchData.matchScore  = null;
        patchData.matchedBy   = null;
      }
    }

    const updated = await prisma.bankReconLine.update({
      where: { id: lineId },
      data: patchData,
    });

    return NextResponse.json({
      ...updated,
      creditAmount:   Number(updated.creditAmount),
      debitAmount:    Number(updated.debitAmount),
      runningBalance: updated.runningBalance != null ? Number(updated.runningBalance) : null,
      createdAt:      updated.createdAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除存摺明細行
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CASHFLOW_VIEW);
  if (!auth.ok) return auth.response;

  try {
    await prisma.bankReconLine.delete({ where: { id: parseInt((await params).lineId) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
