/**
 * POST /api/year-end/preview
 *
 * 年度結轉「預演」：讀取實際數字，展示若現在執行結轉會發生什麼。
 * 純唯讀，不修改任何資料。
 *
 * Response:
 *   cashAccounts  — 每個帳戶的 currentBalance（= 結轉後 openingBalance）
 *   pl            — 損益摘要（netIncome / grossRevenue / COGS / expenses）
 *   inventory     — 期末存貨預估值
 *   blockers      — 阻擋結轉的條件（若有）
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { calcProfitLoss } from '@/lib/year-end/plCalc';
import { calcAllQtysForWarehouse } from '@/lib/inventory-helpers';
import { vatPeriodDates } from '@/lib/vat-periods';
import { checkYearEndBlockers } from '@/lib/year-end/blockerChecks';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year } = body;

    if (!year) return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供年份', 400);

    // Block if already completed
    const existing = await prisma.yearEndRollover.findUnique({ where: { year } });
    if (existing?.status === '已完成') {
      return createErrorResponse('YEAR_END_ALREADY_EXISTS', `${year} 年度已完成結轉`, 400);
    }

    const yearStart   = `${year}-01-01`;
    const yearEndDate = `${year}-12-31`;

    // ── 1. Blocker checks（與正式 POST 共用同一函式）────────────────────
    const blockers = await checkYearEndBlockers(prisma, year);

    // ── 2. Cash account preview ─────────────────────────────────────────
    const cashAccounts = await prisma.cashAccount.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true, accountCode: true, currentBalance: true, openingBalance: true },
      orderBy: { name: 'asc' },
    });

    const cashPreview = cashAccounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      accountCode: a.accountCode,
      currentOpeningBalance: Number(a.openingBalance),
      newOpeningBalance: Number(a.currentBalance),   // currentBalance → next year's openingBalance
      change: Number(a.currentBalance) - Number(a.openingBalance),
    }));

    const totalCashBalance = cashAccounts.reduce((s, a) => s + Number(a.currentBalance), 0);

    // ── 3. Inventory preview (read-only, no DB write) ────────────────────
    const inStockProducts = await prisma.product.findMany({
      where: { isInStock: true, isActive: true },
      select: { id: true, costPrice: true },
    });

    const qtyMap             = await calcAllQtysForWarehouse(prisma, null);
    let   closingInventoryValue = 0;
    let   negativeCount      = 0;
    const productCount       = inStockProducts.length;

    for (const product of inStockProducts) {
      const qty       = qtyMap.get(product.id) || 0;
      const unitCost  = Number(product.costPrice);
      if (qty < 0) { negativeCount++; continue; }
      closingInventoryValue += qty * unitCost;
    }

    // ── 4. P&L preview ──────────────────────────────────────────────────
    const pl = await calcProfitLoss(prisma, {
      year, yearStart, yearEndDate,
      closingInventory: closingInventoryValue,
    });

    // ── 5. Balance sheet preview ─────────────────────────────────────────
    const loans = await prisma.loanMaster.findMany({
      where: { status: '使用中' },
      select: { loanName: true, currentBalance: true, bankName: true },
    });
    const totalLoanBalance = loans.reduce((s, l) => s + Number(l.currentBalance), 0);

    // ── 6. VAT carry-forward info（顯示用，blocker 已由 checkYearEndBlockers 處理）
    const period6 = await prisma.vatFilingPeriod.findUnique({
      where: { year_period_warehouse: { year, period: 6, warehouse: null } },
      select: { carryForwardOut: true, status: true },
    });
    const vatCarryForward = Number(period6?.carryForwardOut ?? 0);

    return NextResponse.json({
      year,
      blockers,
      canProceed: blockers.length === 0,
      cashAccounts: cashPreview,
      totalCashBalance,
      inventory: {
        productCount,
        negativeCount,
        closingValue: closingInventoryValue,
      },
      pl: {
        grossRevenue:    pl.grossRevenue,
        totalCOGS:       pl.totalCOGS,
        grossProfit:     pl.grossProfit,
        totalExpenses:   pl.totalExpenses + pl.totalDeptExpenses,
        netIncome:       pl.netIncome,
        cogsBreakdown:   {
          openingInventory: pl.openingInventory,
          purchases:        pl.totalPurchase,
          closingInventory: pl.closingInventory,
        },
      },
      liabilities: {
        totalLoanBalance,
        loans: loans.map(l => ({ name: l.loanName, bank: l.bankName, balance: Number(l.currentBalance) })),
      },
      vat: {
        period6Status:    period6?.status ?? null,
        carryForwardOut:  vatCarryForward,
        note: vatCarryForward > 0
          ? `下一年度進項留抵帶入 $${vatCarryForward.toLocaleString()}，請在第 1 期申報時手動帶入 carryForwardInOverride`
          : '本年度無留抵稅額結轉',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
