import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// GET: per-supplier payment health — delay = executionDate - dueDate (days)
// Positive = paid late, negative = paid early, 0 = on time
export async function GET() {
  const auth = await requireAnyPermission([PERMISSIONS.PURCHASING_VIEW]);
  if (!auth.ok) return auth.response;

  try {
    const orders = await prisma.paymentOrder.findMany({
      where: {
        status: '已執行',
        dueDate: { not: null },
        supplierId: { not: null },
      },
      select: {
        supplierId: true,
        supplierName: true,
        dueDate: true,
        netAmount: true,
        executions: {
          where: { status: '已確認' },
          orderBy: { executionDate: 'asc' },
          take: 1,
          select: { executionDate: true },
        },
      },
    });

    // Group by supplierId
    const bySupplier = {};
    for (const o of orders) {
      const exec = o.executions[0];
      if (!exec) continue; // no execution record yet

      const delay = daysBetween(o.dueDate, exec.executionDate);
      if (delay === null) continue;

      const sid = o.supplierId;
      if (!bySupplier[sid]) {
        bySupplier[sid] = {
          supplierId: sid,
          supplierName: o.supplierName || `廠商 #${sid}`,
          delays: [],
          totalAmount: 0,
        };
      }
      bySupplier[sid].delays.push(delay);
      bySupplier[sid].totalAmount += Number(o.netAmount);
    }

    const result = Object.values(bySupplier).map(s => {
      const delays = s.delays;
      const total = delays.length;
      const late = delays.filter(d => d > 0).length;
      const avg = delays.reduce((a, b) => a + b, 0) / total;
      const max = Math.max(...delays);
      const lateRate = total > 0 ? late / total : 0;

      // health level: 'good' | 'warning' | 'bad'
      const health = lateRate <= 0.1 ? 'good' : lateRate <= 0.3 ? 'warning' : 'bad';

      return {
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        totalPayments: total,
        latePayments: late,
        lateRate: Math.round(lateRate * 100),      // percentage
        avgDelayDays: Math.round(avg * 10) / 10,   // 1 decimal
        maxDelayDays: max,
        totalAmount: Math.round(s.totalAmount),
        health,
      };
    });

    // Sort: worst first
    result.sort((a, b) => b.avgDelayDays - a.avgDelayDays);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
