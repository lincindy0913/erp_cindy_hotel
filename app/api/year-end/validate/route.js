/**
 * POST /api/year-end/validate
 *
 * 年結前置檢查：
 *   blockers — 硬停條件（與 preview / 正式 POST 共用 checkYearEndBlockers）
 *   warnings — 建議先處理但不阻擋執行（AP、支票、銀行對帳、負庫存）
 *   valid    — blockers.length === 0（與 POST 相同標準，不會出現「validate 說 OK 但 POST 被擋」的情形）
 *
 * monthStatuses — 每館 × 12 個月的詳細狀態，供 UI 顯示，不影響 valid。
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { checkYearEndBlockers } from '@/lib/year-end/blockerChecks';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.YEAREND_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { year } = body;

    if (!year) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供年份', 400);
    }

    // ── 已完成結轉 ────────────────────────────────────────────────────────
    const existing = await prisma.yearEndRollover.findUnique({ where: { year } });
    if (existing?.status === '已完成') {
      return NextResponse.json({
        valid: false,
        alreadyCompleted: true,
        blockers: [`${year} 年度已完成結轉，無法重複執行`],
        warnings: [],
        monthStatuses: [],
        summary: null,
      });
    }

    // ── 1. 硬停條件（與 preview / POST 共用同一函式）──────────────────────
    const blockers = await checkYearEndBlockers(prisma, year);

    // ── 2. 月結詳細狀態（每館 × 12 個月，顯示用，不影響 valid）──────────
    const warehouses = await prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const monthStatuses = [];
    for (let m = 1; m <= 12; m++) {
      const monthData = { month: m, warehouses: [] };

      for (const wh of warehouses) {
        const status = await prisma.monthEndStatus.findFirst({
          where: { year, month: m, warehouse: wh.name },
        });
        monthData.warehouses.push({
          warehouseId:   wh.id,
          warehouseName: wh.name,
          status:        status?.status || '未結帳',
          isLocked:      status?.status === '已鎖定',
          isClosed:      status?.status === '已結帳' || status?.status === '已鎖定',
        });
      }

      // 全館（warehouse = null）
      const generalStatus = await prisma.monthEndStatus.findFirst({
        where: { year, month: m, warehouse: null },
      });
      monthData.warehouses.push({
        warehouseId:   null,
        warehouseName: '全館',
        status:        generalStatus?.status || '未結帳',
        isLocked:      generalStatus?.status === '已鎖定',
        isClosed:      generalStatus?.status === '已結帳' || generalStatus?.status === '已鎖定',
      });

      monthStatuses.push(monthData);
    }

    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;

    // ── 3. Advisory warnings（不阻擋執行）────────────────────────────────
    const warnings = [];

    // 3-a. 月份狀態詳細：已月結但未鎖定 → amber 提示
    const notLockedMonths = monthStatuses.filter(m =>
      m.warehouses.some(w => w.isClosed && !w.isLocked)
    );
    if (notLockedMonths.length > 0) {
      const details = notLockedMonths.flatMap(m =>
        m.warehouses
          .filter(w => w.isClosed && !w.isLocked)
          .map(w => `${m.month}月（${w.warehouseName}）`)
      );
      warnings.push({
        type: 'info',
        message: `${details.length} 個月份已結帳但尚未鎖定（可執行年結，但建議先鎖定防止誤改）`,
        details: details.slice(0, 10),
        count: details.length,
      });
    }

    // 3-b. 未沖銷 AP 發票
    const uncollectedAP = await prisma.salesMaster.count({
      where: {
        invoiceDate: { gte: yearStart, lte: yearEnd },
        status: { not: '已沖銷' },
      },
    });
    if (uncollectedAP > 0) {
      warnings.push({
        type: 'warning',
        message: `${uncollectedAP} 筆發票尚未沖銷`,
        count: uncollectedAP,
      });
    }

    // 3-c. 未兌現支票
    const unclearedChecks = await prisma.check.count({
      where: {
        status: { in: ['pending', 'due'] },
        dueDate: { gte: yearStart, lte: yearEnd },
      },
    });
    if (unclearedChecks > 0) {
      warnings.push({
        type: 'warning',
        message: `${unclearedChecks} 張支票尚未兌現`,
        count: unclearedChecks,
      });
    }

    // 3-d. 負庫存品項（使用 calcAllQtysForWarehouse 以與年結邏輯一致）
    // 簡版：計算採購入庫 - 銷售，不走完整庫存計算（validate 為快速預覽）
    const inStockProducts = await prisma.product.findMany({
      where: { isInStock: true, isActive: true },
      select: {
        id: true, code: true, name: true,
        purchaseDetails: { select: { quantity: true, status: true } },
      },
    });
    const productIds = inStockProducts.map(p => p.id);
    const soldGroups = productIds.length > 0
      ? await prisma.salesDetail.groupBy({
          by: ['productId'],
          where: { productId: { in: productIds } },
          _sum: { quantity: true },
        })
      : [];
    const soldMap = new Map(soldGroups.map(g => [g.productId, Number(g._sum.quantity || 0)]));
    const negativeProducts = [];
    for (const p of inStockProducts) {
      const purchased = p.purchaseDetails.filter(d => d.status === '已入庫').reduce((s, d) => s + (d.quantity || 0), 0);
      const qty = purchased - (soldMap.get(p.id) || 0);
      if (qty < 0) negativeProducts.push({ id: p.id, code: p.code, name: p.name, quantity: qty });
    }
    if (negativeProducts.length > 0) {
      warnings.push({
        type: 'warning',
        message: `${negativeProducts.length} 項商品庫存為負數`,
        details: negativeProducts.slice(0, 5).map(p => `${p.code} ${p.name}: ${p.quantity}`),
        count: negativeProducts.length,
      });
    }

    // 3-e. 銀行對帳（12 月）未完成
    const bankAccounts = await prisma.cashAccount.findMany({
      where: { isActive: true, type: '銀行存款' },
      select: { id: true, name: true },
    });
    if (bankAccounts.length > 0) {
      const confirmedRecs = await prisma.bankReconciliation.findMany({
        where: {
          statementYear: year, statementMonth: 12,
          status: 'confirmed',
          accountId: { in: bankAccounts.map(a => a.id) },
        },
        select: { accountId: true },
      });
      const reconciledSet = new Set(confirmedRecs.map(r => r.accountId));
      const unreconciled  = bankAccounts.filter(a => !reconciledSet.has(a.id)).map(a => a.name);
      if (unreconciled.length > 0) {
        warnings.push({
          type: 'warning',
          message: `${unreconciled.length} 個銀行帳戶 12 月份對帳未完成`,
          details: unreconciled.slice(0, 5),
          count: unreconciled.length,
        });
      }
    }

    // ── 4. valid = blockers 清空（與 POST 完全一致）──────────────────────
    const valid = blockers.length === 0;

    const summary = {
      totalMonths: 12,
      closedMonths: monthStatuses.filter(m => m.warehouses.every(w => w.isClosed)).length,
      lockedMonths: monthStatuses.filter(m => m.warehouses.every(w => w.isLocked)).length,
      uncollectedAP,
      unclearedChecks,
      negativeInventoryCount: negativeProducts.length,
      unreconciledAccountCount: bankAccounts.filter(a =>
        !new Set((warnings.find(w => w.message.includes('銀行'))?.details || [])).has(a.name)
      ).length,
      warehouseCount: warehouses.length,
    };

    // 持久化預檢結果
    if (existing) {
      await prisma.yearEndRollover.update({
        where: { id: existing.id },
        data: {
          preCheckResults: {
            valid,
            checkedAt: new Date().toISOString(),
            blockers,
            warnings: warnings.map(w => ({ type: w.type, message: w.message, count: w.count })),
            summary,
          },
        },
      }).catch(() => {});
    }

    return NextResponse.json({ valid, alreadyCompleted: false, blockers, warnings, monthStatuses, summary });
  } catch (error) {
    return handleApiError(error);
  }
}
