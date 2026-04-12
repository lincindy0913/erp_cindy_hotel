import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST: Validate pre-conditions for year-end rollover
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year } = body;

    if (!year) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供年份', 400);
    }

    // 1. Check if already rolled over
    const existing = await prisma.yearEndRollover.findUnique({
      where: { year }
    });

    if (existing && existing.status === '已完成') {
      return NextResponse.json({
        valid: false,
        alreadyCompleted: true,
        monthStatuses: [],
        warnings: [{ type: 'error', message: `${year} 年度已完成結轉，無法重複執行` }]
      });
    }

    // 2. Get all warehouses
    const warehouses = await prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    // 3. Check all 12 months for the given year are locked (per warehouse)
    const monthStatuses = [];
    let allMonthsLocked = true;
    const unlockedMonths = [];

    for (let m = 1; m <= 12; m++) {
      const monthData = {
        month: m,
        warehouses: []
      };

      // Check per warehouse
      for (const wh of warehouses) {
        const status = await prisma.monthEndStatus.findFirst({
          where: {
            year,
            month: m,
            warehouse: wh.name
          }
        });

        const isLocked = status?.status === '已鎖定';
        monthData.warehouses.push({
          warehouseId: wh.id,
          warehouseName: wh.name,
          status: status?.status || '未結帳',
          isLocked
        });

        if (!isLocked) {
          allMonthsLocked = false;
          unlockedMonths.push(`${m}月 (${wh.name})`);
        }
      }

      // Also check general (no warehouse specified) month-end
      const generalStatus = await prisma.monthEndStatus.findFirst({
        where: {
          year,
          month: m,
          warehouse: null
        }
      });

      const generalLocked = generalStatus?.status === '已鎖定';
      monthData.warehouses.push({
        warehouseId: null,
        warehouseName: '全館',
        status: generalStatus?.status || '未結帳',
        isLocked: generalLocked
      });

      if (!generalLocked) {
        allMonthsLocked = false;
        if (!unlockedMonths.includes(`${m}月 (全館)`)) {
          unlockedMonths.push(`${m}月 (全館)`);
        }
      }

      monthStatuses.push(monthData);
    }

    // 4. Check for uncollected AP (SalesMaster with status != '已沖銷')
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const uncollectedAP = await prisma.salesMaster.count({
      where: {
        invoiceDate: { gte: yearStart, lte: yearEnd },
        status: { not: '已沖銷' }
      }
    });

    // 5. Check for uncleared checks
    const unclearedChecks = await prisma.check.count({
      where: {
        status: { in: ['pending', 'due'] },
        dueDate: { gte: yearStart, lte: yearEnd }
      }
    });

    // 6. Check for negative inventory (products with isInStock=true)
    const inStockProducts = await prisma.product.findMany({
      where: { isInStock: true, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        costPrice: true,
        purchaseDetails: {
          select: { quantity: true, status: true }
        }
      }
    });

    let negativeInventoryCount = 0;
    const negativeProducts = [];

    for (const product of inStockProducts) {
      // Calculate quantity from purchase details (in-stock items)
      const totalPurchased = product.purchaseDetails
        .filter(d => d.status === '已入庫')
        .reduce((sum, d) => sum + (d.quantity || 0), 0);

      // Get sold quantity from sales details
      const salesDetails = await prisma.salesDetail.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true }
      });
      const totalSold = salesDetails._sum.quantity || 0;

      const currentQty = totalPurchased - totalSold;
      if (currentQty < 0) {
        negativeInventoryCount++;
        negativeProducts.push({
          id: product.id,
          code: product.code,
          name: product.name,
          quantity: currentQty
        });
      }
    }

    // 7. Check bank reconciliation completeness (December of the year)
    const bankAccounts = await prisma.cashAccount.findMany({
      where: { isActive: true, type: '銀行存款' },
      select: { id: true, name: true, accountCode: true }
    });

    let unreconciledAccountCount = 0;
    const unreconciledAccounts = [];

    if (bankAccounts.length > 0) {
      const confirmedRecs = await prisma.bankReconciliation.findMany({
        where: {
          statementYear: year,
          status: 'confirmed',
          accountId: { in: bankAccounts.map(a => a.id) }
        },
        select: { accountId: true, statementMonth: true }
      });

      const reconciledDecemberSet = new Set(
        confirmedRecs
          .filter(r => r.statementMonth === 12)
          .map(r => r.accountId)
      );

      for (const account of bankAccounts) {
        if (!reconciledDecemberSet.has(account.id)) {
          unreconciledAccountCount++;
          unreconciledAccounts.push(account.name);
        }
      }
    }

    // Build warnings
    const warnings = [];

    if (!allMonthsLocked) {
      warnings.push({
        type: 'error',
        message: `${unlockedMonths.length} 個月份尚未鎖定`,
        details: unlockedMonths.slice(0, 10),
        count: unlockedMonths.length
      });
    }

    if (unreconciledAccountCount > 0) {
      warnings.push({
        type: 'warning',
        message: `${unreconciledAccountCount} 個銀行帳戶 12 月份對帳未完成`,
        details: unreconciledAccounts.slice(0, 5),
        count: unreconciledAccountCount
      });
    }

    if (uncollectedAP > 0) {
      warnings.push({
        type: 'warning',
        message: `${uncollectedAP} 筆發票尚未沖銷`,
        count: uncollectedAP
      });
    }

    if (unclearedChecks > 0) {
      warnings.push({
        type: 'warning',
        message: `${unclearedChecks} 張支票尚未兌現`,
        count: unclearedChecks
      });
    }

    if (negativeInventoryCount > 0) {
      warnings.push({
        type: 'warning',
        message: `${negativeInventoryCount} 項商品庫存為負數`,
        details: negativeProducts.slice(0, 5).map(p => `${p.code} ${p.name}: ${p.quantity}`),
        count: negativeInventoryCount
      });
    }

    // Valid if all months are locked (warnings are just advisory)
    const valid = allMonthsLocked;

    return NextResponse.json({
      valid,
      alreadyCompleted: false,
      monthStatuses,
      warnings,
      summary: {
        totalMonths: 12,
        lockedMonths: monthStatuses.filter(m =>
          m.warehouses.every(w => w.isLocked)
        ).length,
        uncollectedAP,
        unclearedChecks,
        negativeInventoryCount,
        unreconciledAccountCount,
        warehouseCount: warehouses.length
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
