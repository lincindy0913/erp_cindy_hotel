import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get('warehouse');

    // Get unpaid expenses (status != '已完成')
    const where = { status: { not: '已完成' } };
    if (warehouse) where.warehouse = warehouse;

    const unpaidExpenses = await prisma.expense.findMany({
      where,
      select: {
        id: true,
        invoiceNo: true,
        invoiceDate: true,
        amount: true,
        status: true,
        supplierName: true,
        warehouse: true
      },
      orderBy: { invoiceDate: 'asc' }
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Calculate aging buckets
    const buckets = [
      { range: '0-30天', min: 0, max: 30, count: 0, amount: 0 },
      { range: '31-60天', min: 31, max: 60, count: 0, amount: 0 },
      { range: '61-90天', min: 61, max: 90, count: 0, amount: 0 },
      { range: '90天以上', min: 91, max: Infinity, count: 0, amount: 0 }
    ];

    const enrichedItems = [];

    for (const exp of unpaidExpenses) {
      const invoiceDate = exp.invoiceDate ? new Date(exp.invoiceDate) : null;
      let daysDiff = 0;

      if (invoiceDate) {
        daysDiff = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24));
      }

      const amt = Number(exp.amount);

      // Find the right bucket
      for (const bucket of buckets) {
        if (daysDiff >= bucket.min && daysDiff <= bucket.max) {
          bucket.count += 1;
          bucket.amount += amt;
          break;
        }
      }

      enrichedItems.push({
        ...exp,
        amount: amt,
        daysOutstanding: daysDiff
      });
    }

    // Round bucket amounts
    const formattedBuckets = buckets.map(b => ({
      range: b.range,
      count: b.count,
      amount: Math.round(b.amount)
    }));

    // Top unpaid items (by amount)
    const topUnpaid = enrichedItems
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20)
      .map(item => ({
        id: item.id,
        invoiceNo: item.invoiceNo,
        invoiceDate: item.invoiceDate,
        supplierName: item.supplierName,
        warehouse: item.warehouse,
        amount: Math.round(item.amount),
        daysOutstanding: item.daysOutstanding,
        status: item.status
      }));

    const totalUnpaid = enrichedItems.reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      buckets: formattedBuckets,
      topUnpaid,
      totalUnpaid: Math.round(totalUnpaid),
      totalCount: enrichedItems.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}
