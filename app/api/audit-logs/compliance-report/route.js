import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// spec18 v3: Monthly compliance report
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM format

    if (!month) {
      return NextResponse.json({ error: '請指定月份 (month=YYYY-MM)', code: 'REQUIRED_FIELD_MISSING' }, { status: 400 });
    }

    const [year, m] = month.split('-');
    const startDate = new Date(`${year}-${m}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const dateFilter = { createdAt: { gte: startDate, lt: endDate } };

    // Total operations count
    const totalOps = await prisma.auditLog.count({ where: dateFilter });

    // Critical operations count
    const criticalActions = [
      'cashier.execute', 'cashier.void', 'cash_transaction.reverse',
      'month_end.close', 'month_end.unlock', 'year_end.close',
      'cash_count.approve', 'backup.restore', 'loan_record.confirm',
    ];
    const criticalOps = await prisma.auditLog.count({
      where: { ...dateFilter, action: { in: criticalActions } },
    });

    // Anomaly operations
    const anomalyOps = await prisma.auditLog.count({
      where: { ...dateFilter, level: 'attempt' },
    });

    // Unauthorized access attempts
    const unauthorizedAttempts = await prisma.auditLog.count({
      where: { ...dateFilter, action: 'attempt.unauthorized' },
    });

    // Locked period modification attempts
    const lockedModAttempts = await prisma.auditLog.count({
      where: { ...dateFilter, action: 'attempt.modify_locked' },
    });

    // Operations by level
    const byLevel = await prisma.auditLog.groupBy({
      by: ['level'],
      where: dateFilter,
      _count: true,
    });

    // Operations by user
    const byUser = await prisma.auditLog.groupBy({
      by: ['userName', 'userEmail'],
      where: dateFilter,
      _count: true,
      orderBy: { _count: { _all: 'desc' } },
      take: 10,
    });

    // Compliance score calculation (0-100)
    let complianceScore = 100;
    if (anomalyOps > 0) complianceScore -= Math.min(30, anomalyOps * 5);
    if (unauthorizedAttempts > 0) complianceScore -= Math.min(20, unauthorizedAttempts * 10);
    if (lockedModAttempts > 0) complianceScore -= Math.min(20, lockedModAttempts * 10);
    complianceScore = Math.max(0, complianceScore);

    return NextResponse.json({
      month,
      totalOperations: totalOps,
      criticalOperations: criticalOps,
      anomalyOperations: anomalyOps,
      unauthorizedAttempts,
      lockedPeriodAttempts: lockedModAttempts,
      complianceScore,
      byLevel: byLevel.reduce((acc, l) => { acc[l.level] = l._count; return acc; }, {}),
      topUsers: byUser.map(u => ({
        userName: u.userName,
        userEmail: u.userEmail,
        operationCount: u._count,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
