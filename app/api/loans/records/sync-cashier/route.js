import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// POST: Sync cashier execution status back to loan records
// Checks PaymentOrders linked to loan records — if executed, mark as 已預付 with actual amounts
export async function POST(request) {
  const auth = await requireAnyPermission([PERMISSIONS.LOAN_VIEW, PERMISSIONS.LOAN_CREATE, PERMISSIONS.CASHFLOW_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const year = body.year || new Date().getFullYear();
    const month = body.month || (new Date().getMonth() + 1);

    // Find loan records that are 待出納 and have a paymentOrderId
    const pendingRecords = await prisma.loanMonthlyRecord.findMany({
      where: {
        recordYear: year,
        recordMonth: month,
        status: '待出納',
        paymentOrderId: { not: null }
      }
    });

    if (pendingRecords.length === 0) {
      return NextResponse.json({ synced: 0, message: '沒有待同步的記錄' });
    }

    // Get the linked PaymentOrders
    const orderIds = pendingRecords.map(r => r.paymentOrderId).filter(Boolean);
    const orders = await prisma.paymentOrder.findMany({
      where: { id: { in: orderIds } },
      include: {
        executions: {
          select: { actualAmount: true, executionDate: true, accountId: true }
        }
      }
    });
    const orderMap = {};
    for (const o of orders) { orderMap[o.id] = o; }

    const synced = [];

    for (const rec of pendingRecords) {
      const order = orderMap[rec.paymentOrderId];
      if (!order) continue;

      if (order.status === '已執行') {
        // Sum actual amounts from all executions
        const totalActual = order.executions.reduce((s, e) => s + Number(e.actualAmount), 0);
        const latestExec = order.executions[order.executions.length - 1];

        await prisma.loanMonthlyRecord.update({
          where: { id: rec.id },
          data: {
            status: '已預付',
            actualTotal: totalActual || Number(order.netAmount),
            actualDebitDate: latestExec?.executionDate || null,
            deductAccountId: latestExec?.accountId || rec.deductAccountId
          }
        });
        synced.push({
          recordId: rec.id,
          loanId: rec.loanId,
          orderNo: order.orderNo,
          actualTotal: totalActual,
          newStatus: '已預付'
        });
      }
    }

    return NextResponse.json({
      synced: synced.length,
      details: synced,
      message: synced.length > 0
        ? `已同步 ${synced.length} 筆記錄為「已預付」`
        : '目前無已執行的出納單需同步'
    });
  } catch (error) {
    return handleApiError(error);
  }
}
