import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// spec16 v5: Accounts payable aging analysis
export async function GET() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Get all unpaid invoices (status != 已核銷)
    const unpaidInvoices = await prisma.salesMaster.findMany({
      where: { status: { not: '已核銷' } },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    // Aging buckets
    const buckets = { '0-30': [], '30-60': [], '60-90': [], '90+': [] };
    let totalUnpaid = 0;

    unpaidInvoices.forEach(inv => {
      const invoiceDate = new Date(inv.invoiceDate);
      const daysDiff = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
      const amount = Number(inv.totalAmount || 0);
      totalUnpaid += amount;

      const entry = {
        invoiceId: inv.id,
        invoiceNo: inv.salesNo,
        invoiceDate: inv.invoiceDate,
        supplierName: inv.supplier?.name || '',
        amount,
        daysOutstanding: daysDiff,
      };

      if (daysDiff <= 30) buckets['0-30'].push(entry);
      else if (daysDiff <= 60) buckets['30-60'].push(entry);
      else if (daysDiff <= 90) buckets['60-90'].push(entry);
      else buckets['90+'].push(entry);
    });

    const bucketSummary = Object.entries(buckets).map(([range, items]) => ({
      range,
      count: items.length,
      total: items.reduce((sum, i) => sum + i.amount, 0),
      percentage: totalUnpaid > 0
        ? ((items.reduce((sum, i) => sum + i.amount, 0) / totalUnpaid) * 100).toFixed(1)
        : 0,
    }));

    // Cash pressure forecast (7/14/30 days)
    const cashAccounts = await prisma.cashAccount.findMany({
      where: { isActive: true },
      select: { currentBalance: true },
    });
    const currentCash = cashAccounts.reduce((sum, a) => sum + Number(a.currentBalance || 0), 0);

    // Pending checks due
    const checksDue7 = await prisma.check.findMany({
      where: {
        checkType: 'payable',
        status: { in: ['pending', 'due'] },
        dueDate: { lte: new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0] },
      },
      select: { amount: true },
    });
    const checksDue14 = await prisma.check.findMany({
      where: {
        checkType: 'payable',
        status: { in: ['pending', 'due'] },
        dueDate: { lte: new Date(today.getTime() + 14 * 86400000).toISOString().split('T')[0] },
      },
      select: { amount: true },
    });
    const checksDue30 = await prisma.check.findMany({
      where: {
        checkType: 'payable',
        status: { in: ['pending', 'due'] },
        dueDate: { lte: new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0] },
      },
      select: { amount: true },
    });

    const outflow7 = checksDue7.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const outflow14 = checksDue14.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const outflow30 = checksDue30.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    const cashPressure = [
      { days: 7, pendingOutflow: outflow7, predictedBalance: currentCash - outflow7, sufficiency: currentCash > 0 ? (((currentCash - outflow7) / currentCash) * 100).toFixed(1) : 0 },
      { days: 14, pendingOutflow: outflow14, predictedBalance: currentCash - outflow14, sufficiency: currentCash > 0 ? (((currentCash - outflow14) / currentCash) * 100).toFixed(1) : 0 },
      { days: 30, pendingOutflow: outflow30, predictedBalance: currentCash - outflow30, sufficiency: currentCash > 0 ? (((currentCash - outflow30) / currentCash) * 100).toFixed(1) : 0 },
    ];

    // Overdue items (>60 days, amount > 50000)
    const overdueHighRisk = [...buckets['60-90'], ...buckets['90+']]
      .filter(i => i.amount > 50000)
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      totalUnpaid,
      currentCash,
      buckets: bucketSummary,
      cashPressure,
      overdueHighRisk,
      riskLevel: overdueHighRisk.length > 0 ? 'high' : (totalUnpaid > currentCash ? 'medium' : 'low'),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
