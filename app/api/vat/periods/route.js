/**
 * GET  /api/vat/periods?year=&warehouse=   — 列出全年6期申報記錄
 * POST /api/vat/periods                    — 計算（或重算）指定期別的 VAT 數字
 *
 * POST body: { year, period, warehouse?, carryForwardInOverride? }
 *   - 若不帶 carryForwardInOverride，自動從上一期 carryForwardOut 帶入
 *   - 若有帶，以手動輸入值優先（適用首年或跨系統移轉）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { vatPeriodDates, getPreviousCarryForward } from '@/lib/vat-periods';

export const dynamic = 'force-dynamic';

// ── GET: list all 6 periods for a year ───────────────────────────────────────
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const year      = parseInt(searchParams.get('year'));
    const warehouse = searchParams.get('warehouse') || null;

    if (!year) return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供年份', 400);

    const records = await prisma.vatFilingPeriod.findMany({
      where: { year, warehouse },
      orderBy: { period: 'asc' },
    });

    // Fill in any missing periods with zeroes for display
    const result = Array.from({ length: 6 }, (_, i) => {
      const p   = i + 1;
      const rec = records.find(r => r.period === p);
      const { periodStart, periodEnd } = vatPeriodDates(year, p);
      if (rec) {
        return {
          ...rec,
          outputTax:       Number(rec.outputTax),
          inputTax:        Number(rec.inputTax),
          carryForwardIn:  Number(rec.carryForwardIn),
          taxPayable:      Number(rec.taxPayable),
          carryForwardOut: Number(rec.carryForwardOut),
          createdAt: rec.createdAt.toISOString(),
          updatedAt: rec.updatedAt.toISOString(),
          filedAt:   rec.filedAt ? rec.filedAt.toISOString() : null,
        };
      }
      return {
        id: null, year, period: p, warehouse,
        periodStart, periodEnd,
        outputTax: 0, inputTax: 0, carryForwardIn: 0,
        taxPayable: 0, carryForwardOut: 0,
        status: '未計算', filedBy: null, filedAt: null, note: null,
      };
    });

    // Summary
    const totalPayable      = result.reduce((s, r) => s + r.taxPayable, 0);
    const finalCarryForward = result[5].carryForwardOut; // period 6 carry-forward = next year opening

    return NextResponse.json({ year, warehouse, periods: result, totalPayable, finalCarryForward });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── POST: calculate (upsert) one period ──────────────────────────────────────
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year, period, warehouse, carryForwardInOverride } = body;

    if (!year || !period) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供 year 和 period（1–6）', 400);
    }
    if (period < 1 || period > 6) {
      return createErrorResponse('VALIDATION_FAILED', 'period 必須在 1–6 之間', 400);
    }

    const { periodStart, periodEnd } = vatPeriodDates(year, period);
    const wh = warehouse ?? null;

    // Block re-calculation if already filed
    const existing = await prisma.vatFilingPeriod.findUnique({
      where: { year_period_warehouse: { year, period, warehouse: wh } },
    });
    if (existing && existing.status !== '草稿') {
      return createErrorResponse(
        'VALIDATION_FAILED',
        `第 ${period} 期已${existing.status}，無法重新計算。如需修改請先重設狀態。`,
        422
      );
    }

    // ── Calculate output tax (銷項) from SalesMaster ─────────────────────
    const salesAgg = await prisma.salesMaster.aggregate({
      where: {
        invoiceDate: { gte: periodStart, lte: periodEnd },
        status:      { not: '已作廢' },
        ...(wh ? {} : {}), // sales don't have warehouse in this model
      },
      _sum: { tax: true },
    });
    const outputTax = Number(salesAgg._sum.tax || 0);

    // ── Calculate input tax (進項) from PurchaseMaster ───────────────────
    const purchaseWhere = {
      purchaseDate: { gte: periodStart, lte: periodEnd },
      status:       { notIn: ['已作廢', '已退貨'] },
    };
    if (wh) purchaseWhere.warehouse = wh;

    const purchaseAgg = await prisma.purchaseMaster.aggregate({
      where: purchaseWhere,
      _sum: { tax: true },
    });
    const inputTax = Number(purchaseAgg._sum.tax || 0);

    // ── Carry-forward ─────────────────────────────────────────────────────
    const carryForwardIn = carryForwardInOverride !== undefined
      ? Number(carryForwardInOverride)
      : await getPreviousCarryForward(prisma, year, period, wh);

    // ── VAT position ─────────────────────────────────────────────────────
    // taxPayable = MAX(0, outputTax - inputTax - carryForwardIn)
    // carryForwardOut = MAX(0, inputTax + carryForwardIn - outputTax)
    const netPosition    = outputTax - inputTax - carryForwardIn;
    const taxPayable     = Math.max(0, netPosition);
    const carryForwardOut = Math.max(0, -netPosition);

    const record = await prisma.vatFilingPeriod.upsert({
      where: { year_period_warehouse: { year, period, warehouse: wh } },
      create: {
        year, period, warehouse: wh,
        periodStart, periodEnd,
        outputTax, inputTax, carryForwardIn,
        taxPayable, carryForwardOut,
        status: '草稿',
      },
      update: {
        periodStart, periodEnd,
        outputTax, inputTax, carryForwardIn,
        taxPayable, carryForwardOut,
      },
    });

    return NextResponse.json({
      ...record,
      outputTax:       Number(record.outputTax),
      inputTax:        Number(record.inputTax),
      carryForwardIn:  Number(record.carryForwardIn),
      taxPayable:      Number(record.taxPayable),
      carryForwardOut: Number(record.carryForwardOut),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
