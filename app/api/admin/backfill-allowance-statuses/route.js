/**
 * 補救歷史退貨單 — 補填進貨單/發票/付款單狀態
 * POST /api/admin/backfill-allowance-statuses
 * 需要 ADMIN 權限，執行後可刪除此檔案
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.ADMIN);
  if (!auth.ok) return auth.response;

  const stats = { purchaseUpdated: 0, invoiceUpdated: 0, paymentOrderUpdated: 0, skipped: 0 };

  // 取出所有「已確認」的退貨單
  const allowances = await prisma.purchaseAllowance.findMany({
    where: { status: '已確認' },
  });

  for (const a of allowances) {
    const isFullReturn = a.allowanceType === '全額退貨';
    const statusToSet = isFullReturn ? '已退貨' : '部分退貨';

    // 1. 付款單
    let poId = a.paymentOrderId;
    if (!poId && a.paymentOrderNo) {
      const po = await prisma.paymentOrder.findFirst({ where: { orderNo: a.paymentOrderNo } });
      if (po) poId = po.id;
    }
    if (poId) {
      const po = await prisma.paymentOrder.findUnique({ where: { id: poId }, select: { status: true } });
      if (po && po.status !== statusToSet) {
        await prisma.paymentOrder.update({ where: { id: poId }, data: { status: statusToSet } });
        stats.paymentOrderUpdated++;
      } else stats.skipped++;
    }

    // 2. 發票
    let invId = a.invoiceId;
    if (!invId && a.invoiceNo) {
      const inv = await prisma.salesMaster.findFirst({ where: { invoiceNo: a.invoiceNo } });
      if (inv) invId = inv.id;
    }
    if (invId) {
      const inv = await prisma.salesMaster.findUnique({ where: { id: invId }, select: { status: true } });
      if (inv && inv.status !== statusToSet) {
        await prisma.salesMaster.update({ where: { id: invId }, data: { status: statusToSet } });
        stats.invoiceUpdated++;
      } else stats.skipped++;
    }

    // 3. 進貨單
    let pmId = a.purchaseId;
    if (!pmId && a.purchaseNo) {
      const pm = await prisma.purchaseMaster.findUnique({ where: { purchaseNo: a.purchaseNo } });
      if (pm) pmId = pm.id;
    }
    if (pmId) {
      const pm = await prisma.purchaseMaster.findUnique({ where: { id: pmId }, select: { status: true } });
      if (pm && pm.status !== statusToSet) {
        await prisma.purchaseMaster.update({ where: { id: pmId }, data: { status: statusToSet } });
        stats.purchaseUpdated++;
      } else stats.skipped++;
    }
  }

  return NextResponse.json({
    message: '歷史退貨單狀態補填完成',
    totalAllowances: allowances.length,
    stats,
  });
}
