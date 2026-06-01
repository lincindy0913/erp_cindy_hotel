import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function serializeStatement(s) {
  return {
    ...s,
    billedAmount:    Number(s.totalAmount),
    feeAmount:       Number(s.totalFee),
    totalAmount:     Number(s.totalAmount),
    totalFee:        Number(s.totalFee),
    adjustment:      Number(s.adjustment),
    serviceFee:      Number(s.serviceFee),
    otherFee:        Number(s.otherFee),
    netAmount:       Number(s.netAmount),
    pmsBilledAmount: s.pmsAmount != null ? Number(s.pmsAmount) : null,
    diffAmount:      s.difference != null ? Number(s.difference) : null,
    settlementDate:  s.paymentDate ?? null,
    merchantCode:    s.merchantId ?? null,
    createdAt:       s.createdAt.toISOString(),
    updatedAt:       s.updatedAt.toISOString(),
  };
}

// PATCH: 更新對帳單（未建帳前可修改）
export async function PATCH(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const id   = parseInt((await params).id);
    const data = await request.json();

    const existing = await prisma.creditCardStatement.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到對帳單', 404);
    if (existing.status === '已建帳') {
      return createErrorResponse('VALIDATION_FAILED', '已建帳的對帳單不可修改，請先沖銷現金流', 409);
    }

    const billedAmount = data.billedAmount != null ? Number(data.billedAmount) : Number(existing.totalAmount);
    const feeAmount    = data.feeAmount    != null ? Number(data.feeAmount)    : Number(existing.totalFee);

    // 重新計算比對
    let pmsAmount = existing.pmsAmount != null ? Number(existing.pmsAmount) : null;
    if (data.billingDate && data.billingDate !== existing.billingDate) {
      const recs = await prisma.pmsIncomeRecord.findMany({
        where: { warehouse: existing.warehouse, businessDate: data.billingDate, entryType: '借方', pmsColumnName: { contains: '信用卡' } },
        select: { amount: true },
      });
      pmsAmount = recs.length > 0 ? recs.reduce((s, r) => s + Number(r.amount), 0) : null;
    }
    const diffAmount = pmsAmount != null ? billedAmount - pmsAmount : null;
    const status = data.status ?? (
      pmsAmount == null ? '未核對' : Math.abs(diffAmount) < 0.5 ? '已核對' : '有差異'
    );

    const updated = await prisma.creditCardStatement.update({
      where: { id },
      data: {
        provider:      data.provider       ?? existing.provider,
        bankName:      data.provider       ?? existing.bankName,
        merchantId:    data.merchantCode   ?? existing.merchantId,
        billingDate:   data.billingDate    ?? existing.billingDate,
        paymentDate:   data.settlementDate ?? existing.paymentDate,
        bankAccountId: data.bankAccountId != null ? parseInt(data.bankAccountId) : existing.bankAccountId,
        totalAmount:   billedAmount,
        adjustment:    data.adjustment != null ? Number(data.adjustment) : Number(existing.adjustment),
        totalFee:      feeAmount,
        serviceFee:    data.serviceFee != null ? Number(data.serviceFee) : Number(existing.serviceFee),
        otherFee:      data.otherFee   != null ? Number(data.otherFee)   : Number(existing.otherFee),
        netAmount:     data.netAmount  != null ? Number(data.netAmount)  : Number(existing.netAmount),
        pmsAmount,
        difference:    diffAmount,
        cardBreakdown: data.cardBreakdown ?? existing.cardBreakdown,
        status,
        note:          data.note ?? existing.note,
      },
    });

    return NextResponse.json(serializeStatement(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除對帳單（未建帳才可刪）
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt((await params).id);
    const existing = await prisma.creditCardStatement.findUnique({ where: { id } });
    if (!existing) return createErrorResponse('NOT_FOUND', '找不到對帳單', 404);
    if (existing.status === '已建帳') {
      return createErrorResponse('VALIDATION_FAILED', '已建帳的對帳單不可刪除，請先至現金流沖銷', 409);
    }

    await prisma.creditCardStatement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
