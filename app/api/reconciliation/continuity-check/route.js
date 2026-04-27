import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// spec17 v3: Reconciliation continuity verification for month-end
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYYMM format

    if (!month) {
      return NextResponse.json({ error: '請指定月份 (month=YYYYMM)', code: 'REQUIRED_FIELD_MISSING' }, { status: 400 });
    }

    const year = parseInt(month.substring(0, 4));
    const m = parseInt(month.substring(4, 6));
    const monthPrefix = `${year}-${String(m).padStart(2, '0')}`;

    // Get all non-credit-card bank accounts
    const bankAccounts = await prisma.cashAccount.findMany({
      where: {
        isActive: true,
        type: { not: '信用卡' },
      },
      select: { id: true, name: true, type: true, warehouse: true },
    });

    const accountIds = bankAccounts.map(a => a.id);

    // Batch-load reconciliations and unreconciled counts in parallel
    const [reconciliations, unreconciledGroups] = await Promise.all([
      prisma.bankReconciliation.findMany({
        where: { accountId: { in: accountIds }, reconciliationMonth: monthPrefix },
      }),
      prisma.cashTransaction.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          transactionDate: { startsWith: monthPrefix },
          reconciliationId: null,
        },
        _count: { id: true },
      }),
    ]);

    const reconciliationMap = new Map(reconciliations.map(r => [r.accountId, r]));
    const unreconciledMap = new Map(unreconciledGroups.map(g => [g.accountId, g._count.id]));

    // Post-seal counts still need per-account query (each has different sealedAt)
    const sealedAccounts = reconciliations.filter(r => r.sealedAt);
    const postSealCounts = await Promise.all(
      sealedAccounts.map(r =>
        prisma.cashTransaction.count({
          where: {
            accountId: r.accountId,
            transactionDate: { startsWith: monthPrefix },
            createdAt: { gt: new Date(r.sealedAt) },
          },
        }).then(count => [r.accountId, count])
      )
    );
    const postSealMap = new Map(postSealCounts);

    const results = bankAccounts.map(account => {
      const reconciliation = reconciliationMap.get(account.id) || null;
      const unreconciledTxCount = unreconciledMap.get(account.id) || 0;
      const postSealTxCount = postSealMap.get(account.id) || 0;

      let continuityStatus = 'pending';
      if (reconciliation) {
        if (unreconciledTxCount === 0 && postSealTxCount === 0 && Number(reconciliation.difference || 0) === 0) {
          continuityStatus = 'complete';
        } else if (reconciliation.continuitySignOffNote) {
          continuityStatus = 'partial';
        }
      }

      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        warehouse: account.warehouse,
        hasReconciliation: !!reconciliation,
        reconciliationStatus: reconciliation?.status || null,
        unreconciledTransactions: unreconciledTxCount,
        postSealTransactions: postSealTxCount,
        difference: reconciliation ? Number(reconciliation.difference || 0) : null,
        continuityStatus,
        continuitySignOffNote: reconciliation?.continuitySignOffNote || null,
      };
    });

    const overallStatus = results.every(r => r.continuityStatus === 'complete') ? 'complete'
      : results.some(r => r.continuityStatus === 'pending') ? 'pending'
      : 'partial';

    return NextResponse.json({
      month: monthPrefix,
      overallStatus,
      accounts: results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
