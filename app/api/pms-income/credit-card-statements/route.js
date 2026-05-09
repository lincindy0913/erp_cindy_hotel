import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function serializeStatement(s) {
  return {
    ...s,
    // expose both naming conventions for front-end compatibility
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

// GET: 列出對帳單（含與 PMS 比對結果）
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const warehouse  = searchParams.get('warehouse');
    const yearMonth  = searchParams.get('yearMonth');   // YYYY-MM
    const status     = searchParams.get('status');

    const where = {};
    if (warehouse) where.warehouse = warehouse;
    if (status)    where.status = status;
    if (yearMonth) {
      where.billingDate = { gte: `${yearMonth}-01`, lte: `${yearMonth}-31` };
    }

    const statements = await prisma.creditCardStatement.findMany({
      where,
      orderBy: [{ billingDate: 'desc' }, { id: 'asc' }],
    });

    // 附帶 PMS 當日信用卡合計（供前端顯示，statement 建立時已快照 pmsBilledAmount）
    return NextResponse.json(statements.map(serializeStatement));
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: 新增信用卡對帳單
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.PMS_IMPORT);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    const required = ['warehouse', 'provider', 'billingDate', 'settlementDate', 'billedAmount', 'feeAmount', 'netAmount'];
    for (const f of required) {
      if (!data[f] && data[f] !== 0) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', `${f} 為必填`, 400);
      }
    }

    const billedAmount  = Number(data.billedAmount);
    const adjustment    = Number(data.adjustment ?? 0);
    const feeAmount     = Number(data.feeAmount);
    const serviceFee    = Number(data.serviceFee ?? 0);
    const otherFee      = Number(data.otherFee ?? 0);
    const netAmount     = Number(data.netAmount);

    // 驗算撥款淨額公式
    const computed = billedAmount - feeAmount + adjustment - serviceFee - otherFee;
    if (Math.abs(computed - netAmount) > 1) {
      return createErrorResponse(
        'VALIDATION_FAILED',
        `撥款淨額驗算不符：${billedAmount} - ${feeAmount} ± ${adjustment} - ${serviceFee} - ${otherFee} = ${computed.toFixed(0)}，但輸入為 ${netAmount}`,
        400
      );
    }

    // 查詢 PMS 對應業務日的信用卡合計
    let pmsBilledAmount = null;
    try {
      const pmsRecords = await prisma.pmsIncomeRecord.findMany({
        where: {
          warehouse: data.warehouse,
          businessDate: data.billingDate,
          entryType: '借方',
          pmsColumnName: { contains: '信用卡' },
        },
        select: { amount: true },
      });
      if (pmsRecords.length > 0) {
        pmsBilledAmount = pmsRecords.reduce((s, r) => s + Number(r.amount), 0);
      }
    } catch (_) {}

    const diffAmount = pmsBilledAmount != null ? billedAmount - pmsBilledAmount : null;
    const status = pmsBilledAmount == null
      ? '未核對'
      : Math.abs(diffAmount) < 0.5
        ? '已核對'
        : '有差異';

    const stmt = await prisma.creditCardStatement.create({
      data: {
        warehouse:    data.warehouse,
        provider:     data.provider || null,
        bankName:     data.provider || null,
        merchantId:   data.merchantCode || null,
        billingDate:  data.billingDate,
        paymentDate:  data.settlementDate || null,
        bankAccountId: data.bankAccountId ? parseInt(data.bankAccountId) : null,
        totalAmount:  billedAmount,
        adjustment,
        totalFee:     feeAmount,
        serviceFee,
        otherFee,
        netAmount,
        pmsAmount:    pmsBilledAmount,
        difference:   diffAmount,
        cardBreakdown: data.cardBreakdown || null,
        status,
        note:         data.note || null,
        importedBy:   auth.user?.name || auth.user?.email || null,
      },
    });

    return NextResponse.json(serializeStatement(stmt), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
