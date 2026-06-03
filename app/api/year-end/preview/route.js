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
    const blockers    = [];

    // ── 1. Check all 12 months closed ───────────────────────────────────
    const closedMonthRows = await prisma.monthEndStatus.findMany({
      where: { year, status: { in: ['已結帳', '已鎖定'] } },
      select: { month: true },
      distinct: ['month'],
    });
    if (closedMonthRows.length < 12) {
      const closedSet    = new Set(closedMonthRows.map(r => r.month));
      const unclosed     = Array.from({ length: 12 }, (_, i) => i + 1).filter(m => !closedSet.has(m));
      blockers.push(`尚未月結的月份：${unclosed.join('、')} 月（共 ${unclosed.length} 個月）`);
    }

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

    // ── 6. VAT carry-forward (第6期留抵帶出 → 下一年度開帳) ──────────────
    const period6 = await prisma.vatFilingPeriod.findUnique({
      where: { year_period_warehouse: { year, period: 6, warehouse: null } },
      select: { carryForwardOut: true, status: true },
    });
    const vatCarryForward = Number(period6?.carryForwardOut ?? 0);
    if (period6 === null) {
      blockers.push('第 6 期（11–12 月）VAT 申報尚未計算，年結後留抵稅額無法確認');
    } else if (period6.status === '草稿') {
      blockers.push(`第 6 期 VAT 申報為草稿狀態（留抵帶出 $${vatCarryForward.toLocaleString()}），建議先確認申報後再結轉`);
    }

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
