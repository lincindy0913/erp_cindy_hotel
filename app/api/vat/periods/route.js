/**
 * GET  /api/vat/periods?year=&warehouse=   — 列出全年6期申報記錄
 * POST /api/vat/periods                    — 計算（或重算）指定期別的 VAT 數字
 *
 * POST body: { year, period, warehouse?, carryForwardInOverride? }
 *   - 若不帶 carryForwardInOverride，自動從上一期 carryForwardOut 帶入
 *   - 若有帶，以手動輸入值優先（適用首年或跨系統移轉）
 *
 * outputTax = salesMaster.tax + EngineeringOutputInvoice.taxAmount（自動計算）
 * manualOutputAdjustment = 手動補充（PMS/租屋等無正式發票收入稅額，重算後保留不清除）
 * 應納稅額 = max(0, outputTax + manualOutputAdjustment - inputTax - carryForwardIn)
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { vatPeriodDates, getPreviousCarryForward } from '@/lib/vat-periods';

export const dynamic = 'force-dynamic';

function serializePeriod(rec) {
  return {
    ...rec,
    outputTax:              Number(rec.outputTax),
    manualOutputAdjustment: Number(rec.manualOutputAdjustment),
    inputTax:               Number(rec.inputTax),
    carryForwardIn:         Number(rec.carryForwardIn),
    taxPayable:             Number(rec.taxPayable),
    carryForwardOut:        Number(rec.carryForwardOut),
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
    filedAt:   rec.filedAt ? rec.filedAt.toISOString() : null,
  };
}

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

    const result = Array.from({ length: 6 }, (_, i) => {
      const p   = i + 1;
      const rec = records.find(r => r.period === p);
      const { periodStart, periodEnd } = vatPeriodDates(year, p);
      if (rec) return serializePeriod(rec);
      return {
        id: null, year, period: p, warehouse,
        periodStart, periodEnd,
        outputTax: 0, manualOutputAdjustment: 0,
        inputTax: 0, carryForwardIn: 0,
        taxPayable: 0, carryForwardOut: 0,
        status: '未計算', filedBy: null, filedAt: null, note: null,
      };
    });

    const totalPayable      = result.reduce((s, r) => s + r.taxPayable, 0);
    const finalCarryForward = result[5].carryForwardOut;

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

    // VAT3: 依狀態給出明確的錯誤訊息
    const existing = await prisma.vatFilingPeriod.findUnique({
      where: { year_period_warehouse: { year, period, warehouse: wh } },
    });
    if (existing) {
      if (existing.status === '已繳納') {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `第 ${period} 期已繳納完成，不可重算。如有誤請聯繫財務主管。`,
          422
        );
      }
      if (existing.status === '已申報') {
        return createErrorResponse(
          'VALIDATION_FAILED',
          `第 ${period} 期已提交申報，請先透過「退回草稿」解鎖後再重算。`,
          422
        );
      }
    }

    // VAT1-A: 銷項（SalesMaster）—— 注意：SalesMaster 無 warehouse 欄位，此為全館合計
    const salesAgg = await prisma.salesMaster.aggregate({
      where: {
        invoiceDate: { gte: periodStart, lte: periodEnd },
        status:      { not: '已作廢' },
      },
      _sum: { tax: true },
    });
    const salesOutputTax = Number(salesAgg._sum.tax || 0);

    // VAT1-B: 工程銷項發票（EngineeringOutputInvoice）—— 支援 warehouse 篩選（透過 project）
    const engOutputAgg = await prisma.engineeringOutputInvoice.aggregate({
      where: {
        invoiceDate: { gte: periodStart, lte: periodEnd },
        status:      { not: '已作廢' },
        ...(wh ? { project: { warehouse: wh } } : {}),
      },
      _sum: { taxAmount: true },
    });
    const engOutputTax = Number(engOutputAgg._sum.taxAmount || 0);

    // 自動計算的銷項合計（不含手動調整，重算時手動調整保留不清除）
    const outputTax = salesOutputTax + engOutputTax;

    // VAT1-C: 手動調整（PMS/租屋等無發票收入，重算時從既有記錄保留）
    const manualOutputAdjustment = Number(existing?.manualOutputAdjustment ?? 0);

    // ── 進項（PurchaseMaster）────────────────────────────────────────────────
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

    // ── 留抵帶入 ──────────────────────────────────────────────────────────────
    const carryForwardIn = carryForwardInOverride !== undefined
      ? Number(carryForwardInOverride)
      : await getPreviousCarryForward(prisma, year, period, wh);

    // ── VAT position（含手動調整）────────────────────────────────────────────
    const totalOutput    = outputTax + manualOutputAdjustment;
    const netPosition    = totalOutput - inputTax - carryForwardIn;
    const taxPayable     = Math.max(0,  netPosition);
    const carryForwardOut = Math.max(0, -netPosition);

    const record = await prisma.vatFilingPeriod.upsert({
      where: { year_period_warehouse: { year, period, warehouse: wh } },
      create: {
        year, period, warehouse: wh,
        periodStart, periodEnd,
        outputTax, manualOutputAdjustment,
        inputTax, carryForwardIn,
        taxPayable, carryForwardOut,
        status: '草稿',
      },
      update: {
        periodStart, periodEnd,
        outputTax,   // 重算時更新自動部分
        // manualOutputAdjustment 不在此更新（保留使用者手動輸入的值）
        inputTax, carryForwardIn,
        taxPayable, carryForwardOut,
      },
    });

    return NextResponse.json(serializePeriod(record), { status: existing ? 200 : 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
