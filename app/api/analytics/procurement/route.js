import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const warehouse = searchParams.get('warehouse');

    // Build where clause
    const where = { status: { not: '已作廢' } };
    if (startDate || endDate) {
      where.purchaseDate = {};
      if (startDate) where.purchaseDate.gte = startDate;
      if (endDate) where.purchaseDate.lte = endDate;
    }
    if (warehouse) where.warehouse = warehouse;

    // Fetch all qualifying purchases with supplier info
    const purchases = await prisma.purchaseMaster.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        details: {
          include: {
            product: { select: { id: true, name: true, category: true } }
          }
        }
      }
    });

    // === Top 10 suppliers by purchase amount ===
    const supplierTotals = {};
    let grandTotal = 0;

    for (const p of purchases) {
      const suppName = p.supplier?.name || '未知供應商';
      const suppId = p.supplierId;
      const amt = Number(p.totalAmount);
      grandTotal += amt;

      if (!supplierTotals[suppId]) {
        supplierTotals[suppId] = { supplierId: suppId, name: suppName, amount: 0, count: 0 };
      }
      supplierTotals[suppId].amount += amt;
      supplierTotals[suppId].count += 1;
    }

    const sortedSuppliers = Object.values(supplierTotals)
      .sort((a, b) => b.amount - a.amount);

    const topSuppliers = sortedSuppliers.slice(0, 10).map(s => ({
      ...s,
      amount: Math.round(s.amount),
      percentage: grandTotal > 0 ? Math.round((s.amount / grandTotal) * 10000) / 100 : 0
    }));

    // === Supplier concentration: top 3 share ===
    const top3Amount = sortedSuppliers.slice(0, 3).reduce((sum, s) => sum + s.amount, 0);
    const concentration = grandTotal > 0 ? Math.round((top3Amount / grandTotal) * 10000) / 100 : 0;

    // === Monthly purchase trend ===
    const monthlyMap = {};
    for (const p of purchases) {
      const m = p.purchaseDate ? p.purchaseDate.substring(0, 7) : null;
      if (!m) continue;
      if (!monthlyMap[m]) monthlyMap[m] = { month: m, amount: 0, count: 0 };
      monthlyMap[m].amount += Number(p.totalAmount);
      monthlyMap[m].count += 1;
    }

    const monthlyTrend = Object.values(monthlyMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({ ...m, amount: Math.round(m.amount) }));

    // === Category breakdown ===
    const categoryMap = {};
    for (const p of purchases) {
      for (const d of p.details) {
        const cat = d.product?.category || '未分類';
        if (!categoryMap[cat]) categoryMap[cat] = { category: cat, amount: 0, count: 0 };
        const detailAmt = Number(d.unitPrice) * d.quantity;
        categoryMap[cat].amount += detailAmt;
        categoryMap[cat].count += 1;
      }
    }

    const categoryBreakdown = Object.values(categoryMap)
      .sort((a, b) => b.amount - a.amount)
      .map(c => ({
        ...c,
        amount: Math.round(c.amount),
        percentage: grandTotal > 0 ? Math.round((c.amount / grandTotal) * 10000) / 100 : 0
      }));

    return NextResponse.json({
      topSuppliers,
      concentration,
      monthlyTrend,
      categoryBreakdown,
      totalAmount: Math.round(grandTotal),
      totalOrders: purchases.length
    });
  } catch (error) {
    return handleApiError(error);
  }
}
