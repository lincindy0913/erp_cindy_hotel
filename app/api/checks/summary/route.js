import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CHECK_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Overdue payable checks (past due, not cleared/void)
    const overduePayable = await prisma.check.findMany({
      where: {
        checkType: 'payable',
        status: { in: ['pending', 'due'] },
        dueDate: { lt: today }
      }
    });
    const overduePayableTotal = overduePayable.reduce((sum, c) => sum + Number(c.amount), 0);

    // Overdue receivable checks (past due, not cleared/void)
    const overdueReceivable = await prisma.check.findMany({
      where: {
        checkType: 'receivable',
        status: { in: ['pending', 'due'] },
        dueDate: { lt: today }
      }
    });
    const overdueReceivableTotal = overdueReceivable.reduce((sum, c) => sum + Number(c.amount), 0);

    // Due within 7 days (from today to +7 days)
    const dueSoon7 = await prisma.check.findMany({
      where: {
        status: { in: ['pending', 'due'] },
        dueDate: { gte: today, lte: in7Days }
      }
    });
    const dueSoon7Payable = dueSoon7.filter(c => c.checkType === 'payable');
    const dueSoon7Receivable = dueSoon7.filter(c => c.checkType === 'receivable');

    // Due within 30 days (from today to +30 days)
    const dueSoon30 = await prisma.check.findMany({
      where: {
        status: { in: ['pending', 'due'] },
        dueDate: { gte: today, lte: in30Days }
      }
    });
    const dueSoon30Payable = dueSoon30.filter(c => c.checkType === 'payable');
    const dueSoon30Receivable = dueSoon30.filter(c => c.checkType === 'receivable');

    // Monthly statistics (if year/month provided)
    let monthlyStats = null;
    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

      const monthlyChecks = await prisma.check.findMany({
        where: {
          dueDate: { gte: startDate, lte: endDate }
        }
      });

      const payableChecks = monthlyChecks.filter(c => c.checkType === 'payable');
      const receivableChecks = monthlyChecks.filter(c => c.checkType === 'receivable');
      const clearedChecks = monthlyChecks.filter(c => c.status === 'cleared');
      const bouncedChecks = monthlyChecks.filter(c => c.status === 'bounced');

      monthlyStats = {
        total: monthlyChecks.length,
        totalAmount: monthlyChecks.reduce((sum, c) => sum + Number(c.amount), 0),
        payable: {
          count: payableChecks.length,
          total: payableChecks.reduce((sum, c) => sum + Number(c.amount), 0)
        },
        receivable: {
          count: receivableChecks.length,
          total: receivableChecks.reduce((sum, c) => sum + Number(c.amount), 0)
        },
        cleared: {
          count: clearedChecks.length,
          total: clearedChecks.reduce((sum, c) => sum + Number(c.actualAmount || c.amount), 0)
        },
        bounced: {
          count: bouncedChecks.length,
          total: bouncedChecks.reduce((sum, c) => sum + Number(c.amount), 0)
        }
      };
    }

    return NextResponse.json({
      overduePayable: {
        count: overduePayable.length,
        total: overduePayableTotal
      },
      overdueReceivable: {
        count: overdueReceivable.length,
        total: overdueReceivableTotal
      },
      dueSoon7: {
        count: dueSoon7.length,
        total: dueSoon7.reduce((sum, c) => sum + Number(c.amount), 0),
        payable: {
          count: dueSoon7Payable.length,
          total: dueSoon7Payable.reduce((sum, c) => sum + Number(c.amount), 0)
        },
        receivable: {
          count: dueSoon7Receivable.length,
          total: dueSoon7Receivable.reduce((sum, c) => sum + Number(c.amount), 0)
        }
      },
      dueSoon30: {
        count: dueSoon30.length,
        total: dueSoon30.reduce((sum, c) => sum + Number(c.amount), 0),
        payable: {
          count: dueSoon30Payable.length,
          total: dueSoon30Payable.reduce((sum, c) => sum + Number(c.amount), 0)
        },
        receivable: {
          count: dueSoon30Receivable.length,
          total: dueSoon30Receivable.reduce((sum, c) => sum + Number(c.amount), 0)
        }
      },
      monthlyStats
    });
  } catch (error) {
    return handleApiError(error);
  }
}
