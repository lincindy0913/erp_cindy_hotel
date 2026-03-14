import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requireSession } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET: 月度信用卡對帳匯總 (per warehouse)
export async function GET(request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM

    if (!month) {
      return NextResponse.json({ error: '缺少 month 參數' }, { status: 400 });
    }

    const [y, m] = month.split('-');
    const prefix = `${y}/${m.padStart(2, '0')}`;

    // Get all statements for this month
    const statements = await prisma.creditCardStatement.findMany({
      where: { billingDate: { startsWith: prefix } },
      include: {
        batchLines: true,
        feeDetails: true,
      },
    });

    // Get all buildings (warehouses with type='building')
    const buildings = await prisma.warehouse.findMany({
      where: { type: 'building', parentId: null, isActive: true },
      orderBy: { id: 'asc' },
    });

    // Get merchant configs
    const configs = await prisma.creditCardMerchantConfig.findMany({
      where: { isActive: true },
    });

    // Get PMS credit card income for this month
    const startDate = `${y}-${m.padStart(2, '0')}-01`;
    const endDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    const endDate = `${y}-${m.padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const pmsRecords = await prisma.pmsIncomeRecord.findMany({
      where: {
        businessDate: { gte: startDate, lte: endDate },
        pmsColumnName: { contains: '信用卡' },
      },
    });

    // Group PMS by warehouse
    const pmsByWarehouse = {};
    for (const r of pmsRecords) {
      pmsByWarehouse[r.warehouse] = (pmsByWarehouse[r.warehouse] || 0) + Number(r.amount);
    }

    // Group statements by warehouseId
    const stmtByWarehouse = {};
    for (const s of statements) {
      if (!stmtByWarehouse[s.warehouseId]) stmtByWarehouse[s.warehouseId] = [];
      stmtByWarehouse[s.warehouseId].push(s);
    }

    // Build summary per warehouse
    const summary = buildings.map(b => {
      const stmts = stmtByWarehouse[b.id] || [];
      const config = configs.find(c => c.warehouseId === b.id);
      const totalCount = stmts.reduce((sum, s) => sum + s.totalCount, 0);
      const totalAmount = stmts.reduce((sum, s) => sum + Number(s.totalAmount), 0);
      const totalFee = stmts.reduce((sum, s) => sum + Number(s.totalFee), 0);
      const netAmount = stmts.reduce((sum, s) => sum + Number(s.netAmount), 0);
      const pmsAmount = pmsByWarehouse[b.name] || 0;
      const difference = pmsAmount - totalAmount;
      const stmtCount = stmts.length;
      const confirmedCount = stmts.filter(s => s.status === 'confirmed').length;
      const status = stmtCount === 0 ? 'no_data' :
        confirmedCount === stmtCount ? 'confirmed' :
        stmts.some(s => s.status === 'matched') ? 'partial' : 'pending';

      return {
        warehouseId: b.id,
        warehouse: b.name,
        merchantId: config?.merchantId || null,
        bankName: config?.bankName || null,
        stmtCount,
        confirmedCount,
        totalCount,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalFee: Math.round(totalFee * 100) / 100,
        netAmount: Math.round(netAmount * 100) / 100,
        pmsAmount: Math.round(pmsAmount * 100) / 100,
        difference: Math.round(difference * 100) / 100,
        status,
      };
    });

    // Grand total
    const grandTotal = {
      stmtCount: summary.reduce((s, r) => s + r.stmtCount, 0),
      totalCount: summary.reduce((s, r) => s + r.totalCount, 0),
      totalAmount: Math.round(summary.reduce((s, r) => s + r.totalAmount, 0) * 100) / 100,
      totalFee: Math.round(summary.reduce((s, r) => s + r.totalFee, 0) * 100) / 100,
      netAmount: Math.round(summary.reduce((s, r) => s + r.netAmount, 0) * 100) / 100,
      pmsAmount: Math.round(summary.reduce((s, r) => s + r.pmsAmount, 0) * 100) / 100,
      difference: Math.round(summary.reduce((s, r) => s + r.difference, 0) * 100) / 100,
    };

    return NextResponse.json({ summary, grandTotal, month });
  } catch (error) {
    return handleApiError(error);
  }
}
