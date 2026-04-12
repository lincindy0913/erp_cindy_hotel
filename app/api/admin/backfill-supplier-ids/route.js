/**
 * POST /api/admin/backfill-supplier-ids
 *
 * 回填 CashTransaction.supplierId：
 *   - sourceType = 'cashier_payment' → 從 PaymentOrder.supplierId 補
 *   - sourceType IN ('check_payment','check_receipt','check_bounce') → 從 Check.supplierId 補
 *
 * 僅更新 supplierId 為 null 且 sourceRecordId 有值的記錄。
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  if (!auth.ok) return auth.response;

  try {
    let updatedPayment = 0;
    let updatedCheck = 0;

    // 1. 回填 cashier_payment（出納付款）
    const paymentTxs = await prisma.cashTransaction.findMany({
      where: {
        sourceType: 'cashier_payment',
        supplierId: null,
        sourceRecordId: { not: null },
      },
      select: { id: true, sourceRecordId: true },
    });

    if (paymentTxs.length > 0) {
      const orderIds = [...new Set(paymentTxs.map(t => t.sourceRecordId))];
      const orders = await prisma.paymentOrder.findMany({
        where: { id: { in: orderIds }, supplierId: { not: null } },
        select: { id: true, supplierId: true },
      });
      const orderMap = new Map(orders.map(o => [o.id, o.supplierId]));

      for (const tx of paymentTxs) {
        const sid = orderMap.get(tx.sourceRecordId);
        if (sid) {
          await prisma.cashTransaction.update({
            where: { id: tx.id },
            data: { supplierId: sid },
          });
          updatedPayment++;
        }
      }
    }

    // 2. 回填 check_payment / check_receipt / check_bounce（支票兌現/退票）
    const checkTxs = await prisma.cashTransaction.findMany({
      where: {
        sourceType: { in: ['check_payment', 'check_receipt', 'check_bounce'] },
        supplierId: null,
        sourceRecordId: { not: null },
      },
      select: { id: true, sourceRecordId: true },
    });

    if (checkTxs.length > 0) {
      const checkIds = [...new Set(checkTxs.map(t => t.sourceRecordId))];
      const checks = await prisma.check.findMany({
        where: { id: { in: checkIds }, supplierId: { not: null } },
        select: { id: true, supplierId: true },
      });
      const checkMap = new Map(checks.map(c => [c.id, c.supplierId]));

      for (const tx of checkTxs) {
        const sid = checkMap.get(tx.sourceRecordId);
        if (sid) {
          await prisma.cashTransaction.update({
            where: { id: tx.id },
            data: { supplierId: sid },
          });
          updatedCheck++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      updatedPayment,
      updatedCheck,
      total: updatedPayment + updatedCheck,
      message: `已回填 ${updatedPayment} 筆出納付款、${updatedCheck} 筆支票兌現/退票`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
