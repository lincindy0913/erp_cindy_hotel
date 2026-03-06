import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// spec18 v3: Query critical decisions (batch approvals, expense confirmations, etc.)
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const month = searchParams.get('month'); // YYYY-MM format
    const userId = searchParams.get('userId');

    const criticalActions = [
      'cashier.execute', 'cashier.void',
      'cash_transaction.reverse',
      'month_end.close', 'month_end.unlock',
      'year_end.close', 'year_end.unlock',
      'cash_count.approve', 'cash_count.reject',
      'backup.restore',
      'loan_record.confirm',
    ];

    const where = {
      action: { in: criticalActions },
    };

    if (month) {
      const [year, m] = month.split('-');
      const startDate = new Date(`${year}-${m}-01T00:00:00.000Z`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      where.createdAt = { gte: startDate, lt: endDate };
    }

    if (userId) {
      where.userId = parseInt(userId);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Summary stats
    const summary = {
      totalDecisions: total,
      byAction: {},
    };

    const actionCounts = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: true,
    });
    actionCounts.forEach(ac => {
      summary.byAction[ac.action] = ac._count;
    });

    return NextResponse.json({
      data: logs.map(log => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
      summary,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
