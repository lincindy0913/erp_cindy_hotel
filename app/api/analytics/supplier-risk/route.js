import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

// spec16 v5: Supplier risk concentration analysis
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.ANALYTICS_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYYMM format

    let dateFilter = {};
    if (month) {
      const year = month.substring(0, 4);
      const m = month.substring(4, 6);
      const prefix = `${year}-${m}`;
      dateFilter = { purchaseDate: { startsWith: prefix } };
    } else {
      // Default: current month
      const now = new Date();
      const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      dateFilter = { purchaseDate: { startsWith: prefix } };
    }

    const wf = applyWarehouseFilter(auth.session, dateFilter);
    if (!wf.ok) return wf.response;

    // Get all purchases for the period
    const purchases = await prisma.purchaseMaster.findMany({
      where: dateFilter,
      select: { supplierId: true, totalAmount: true },
    });

    const totalAmount = purchases.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);

    // Group by supplier
    const supplierMap = {};
    purchases.forEach(p => {
      if (p.supplierId) {
        supplierMap[p.supplierId] = (supplierMap[p.supplierId] || 0) + Number(p.totalAmount || 0);
      }
    });

    const supplierIds = Object.keys(supplierMap).map(Number);
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true },
    });
    const supplierNameMap = {};
    suppliers.forEach(s => { supplierNameMap[s.id] = s.name; });

    // Sort by amount desc
    const ranked = Object.entries(supplierMap)
      .map(([id, amount]) => ({
        supplierId: Number(id),
        supplierName: supplierNameMap[Number(id)] || 'Unknown',
        amount,
        percentage: totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate HHI index
    const hhi = ranked.reduce((sum, s) => {
      const share = totalAmount > 0 ? s.amount / totalAmount : 0;
      return sum + share * share;
    }, 0);

    // Top concentration
    const top1Pct = ranked.length > 0 ? Number(ranked[0].percentage) : 0;
    const top3Pct = ranked.slice(0, 3).reduce((sum, s) => sum + Number(s.percentage), 0);

    // Risk assessment
    const risks = [];
    if (top1Pct > 20) risks.push({ type: 'top1_concentration', message: `最大供應商佔比 ${top1Pct}% (門檻: 20%)`, severity: 'high' });
    if (top3Pct > 50) risks.push({ type: 'top3_concentration', message: `前三供應商佔比 ${top3Pct.toFixed(1)}% (門檻: 50%)`, severity: 'medium' });
    if (hhi > 0.15) risks.push({ type: 'hhi_high', message: `HHI指數 ${hhi.toFixed(4)} (門檻: 0.15)`, severity: 'medium' });
    if (supplierIds.length < 15) risks.push({ type: 'low_diversity', message: `供應商數量 ${supplierIds.length} (建議: ≥15)`, severity: 'low' });

    return NextResponse.json({
      totalAmount,
      supplierCount: supplierIds.length,
      top1Concentration: top1Pct,
      top3Concentration: Number(top3Pct.toFixed(1)),
      hhiIndex: Number(hhi.toFixed(4)),
      suppliers: ranked,
      risks,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
