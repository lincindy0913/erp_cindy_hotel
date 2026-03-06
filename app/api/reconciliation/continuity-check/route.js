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
      return NextResponse.json({ error: { code: 'REQUIRED_FIELD_MISSING', message: '請指定月份 (month=YYYYMM)' } }, { status: 400 });
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

    const results = [];

    for (const account of bankAccounts) {
      // Check if reconciliation exists for this month
      const reconciliation = await prisma.bankReconciliation.findFirst({
        where: {
          accountId: account.id,
          reconciliationMonth: monthPrefix,
        },
      });

      // Count unreconciled transactions
      const unreconciledTxCount = await prisma.cashTransaction.count({
        where: {
          accountId: account.id,
          transactionDate: { startsWith: monthPrefix },
          reconciliationId: null,
        },
      });

      // Check for post-seal transactions
      let postSealTxCount = 0;
      if (reconciliation?.sealedAt) {
        postSealTxCount = await prisma.cashTransaction.count({
          where: {
            accountId: account.id,
            transactionDate: { startsWith: monthPrefix },
            createdAt: { gt: new Date(reconciliation.sealedAt) },
          },
        });
      }

      let continuityStatus = 'pending';
      if (reconciliation) {
        if (unreconciledTxCount === 0 && postSealTxCount === 0 && Number(reconciliation.difference || 0) === 0) {
          continuityStatus = 'complete';
        } else if (reconciliation.continuitySignOffNote) {
          continuityStatus = 'partial';
        }
      }

      results.push({
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
      });
    }

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
