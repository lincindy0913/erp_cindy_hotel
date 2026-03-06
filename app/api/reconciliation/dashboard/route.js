import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET: Dashboard overview for reconciliation
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.RECONCILIATION_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')) : now.getFullYear();
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')) : now.getMonth() + 1;

    // Get all bank accounts (type = '銀行存款')
    const bankAccounts = await prisma.cashAccount.findMany({
      where: {
        type: '銀行存款',
        isActive: true
      },
      orderBy: [{ warehouse: 'asc' }, { name: 'asc' }]
    });

    // Get reconciliations for this month
    const reconciliations = await prisma.bankReconciliation.findMany({
      where: {
        statementYear: year,
        statementMonth: month
      }
    });

    const reconMap = {};
    reconciliations.forEach(r => {
      reconMap[r.accountId] = r;
    });

    // Build dashboard items
    const items = bankAccounts.map(account => {
      const recon = reconMap[account.id];
      let status = 'not_started';
      let difference = 0;
      let reconciliationId = null;

      if (recon) {
        status = recon.status; // 'draft' or 'confirmed'
        difference = Number(recon.difference);
        reconciliationId = recon.id;
      }

      return {
        accountId: account.id,
        accountName: account.name,
        accountCode: account.accountCode,
        warehouse: account.warehouse,
        status,
        difference,
        reconciliationId,
        currentBalance: Number(account.currentBalance)
      };
    });

    // Summary counts
    const totalAccounts = items.length;
    const completedCount = items.filter(i => i.status === 'confirmed').length;
    const inProgressCount = items.filter(i => i.status === 'draft').length;
    const notStartedCount = items.filter(i => i.status === 'not_started').length;
    const hasDifferenceCount = items.filter(i => i.status === 'confirmed' && i.difference !== 0).length;

    return NextResponse.json({
      year,
      month,
      items,
      summary: {
        totalAccounts,
        completedCount,
        inProgressCount,
        notStartedCount,
        hasDifferenceCount
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
