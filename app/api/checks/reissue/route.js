import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

/**
 * 退票後重新開票：建立一筆新的付款單（支票）與新支票記錄，連動出納。
 * 原退票記錄保留；新支票存檔後於出納執行時會自動更新為已兌現，並在支票管理顯示。
 */
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const session = await getServerSession(authOptions);
    const data = await request.json();
    const bouncedCheckId = data.bouncedCheckId != null ? parseInt(data.bouncedCheckId) : null;

    if (!bouncedCheckId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請提供退票支票 ID (bouncedCheckId)', 400);
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const todayStr = now.toISOString().split('T')[0];

    const result = await prisma.$transaction(async (tx) => {
      // Re-fetch and verify INSIDE transaction to prevent race conditions
      const bounced = await tx.check.findUnique({
        where: { id: bouncedCheckId },
        include: { sourceAccount: { select: { id: true, name: true } } },
      });

      if (!bounced) throw new Error('NOT_FOUND:找不到該支票');
      if (bounced.status !== 'bounced') throw new Error('IDEMPOTENT:僅能對已退票的支票重新開票');
      if (bounced.checkType !== 'payable') throw new Error('VALIDATION:僅支援應付支票重新開票');

      // Period lock check — new check dueDate is todayStr
      await assertPeriodOpen(tx, todayStr, bounced.warehouse);

      // 是否已重新開票過
      const existingReissue = await tx.check.findFirst({
        where: { reissueOfCheckId: bouncedCheckId },
      });
      if (existingReissue) throw new Error('IDEMPOTENT:此退票已重新開票過，請至出納或支票管理查看新支票');

      const orderPrefix = `PAY-${dateStr}-`;
      const existingOrders = await tx.paymentOrder.findMany({
        where: { orderNo: { startsWith: orderPrefix } },
      });
      let maxSeq = 0;
      for (const o of existingOrders) {
        const seq = parseInt(o.orderNo.substring(orderPrefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const orderNo = `${orderPrefix}${String(maxSeq + 1).padStart(4, '0')}`;

      const netAmount = Number(bounced.amount);
      const supplierName = bounced.payeeName || (bounced.supplierId
        ? (await tx.supplier.findUnique({ where: { id: bounced.supplierId }, select: { name: true } }))?.name
        : null) || '';

      const order = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: bounced.invoiceIds || [],
          supplierId: bounced.supplierId,
          supplierName: supplierName || null,
          warehouse: bounced.warehouse,
          paymentMethod: '支票',
          amount: netAmount,
          discount: 0,
          netAmount,
          dueDate: todayStr,
          accountId: null,
          checkNo: null,
          checkAccount: bounced.sourceAccount?.name || null,
          checkIssueDate: todayStr,
          checkDueDate: todayStr,
          summary: `重新開票（原退票 ${bounced.checkNo}）`,
          note: `退票後重新開票，原支票號：${bounced.checkNumber}`,
          status: '待出納',
          sourceType: 'check_reissue',
          sourceRecordId: bouncedCheckId,
          createdBy: session?.user?.email || null,
        },
      });

      const chkPrefix = `CHK-${dateStr}-`;
      const existingChecks = await tx.check.findMany({
        where: { checkNo: { startsWith: chkPrefix } },
        select: { checkNo: true },
      });
      let maxChkSeq = 0;
      for (const c of existingChecks) {
        const seq = parseInt(c.checkNo.substring(chkPrefix.length)) || 0;
        if (seq > maxChkSeq) maxChkSeq = seq;
      }
      const checkNo = `${chkPrefix}${String(maxChkSeq + 1).padStart(4, '0')}`;
      const checkNumber = `重開-${bounced.checkNumber}`;

      const newCheck = await tx.check.create({
        data: {
          checkNo,
          checkType: 'payable',
          checkNumber,
          amount: netAmount,
          issueDate: todayStr,
          dueDate: todayStr,
          status: 'pending',
          drawerType: bounced.drawerType || 'company',
          payeeName: supplierName || bounced.payeeName,
          supplierId: bounced.supplierId,
          paymentId: order.id,
          invoiceIds: bounced.invoiceIds,
          warehouse: bounced.warehouse,
          sourceAccountId: bounced.sourceAccountId,
          reissueOfCheckId: bouncedCheckId,
          note: `重新開票（原退票 ${bounced.checkNo}）`,
          createdBy: session?.user?.email || null,
        },
      });

      await tx.paymentOrder.update({
        where: { id: order.id },
        data: { checkNo: checkNumber },
      });

      return { order, newCheck };
    });

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CHECK_REISSUE,
        targetModule: 'checks',
        targetRecordId: bouncedCheckId,
        targetRecordNo: result.newCheck.checkNo,
        beforeState: { bouncedCheckId, bouncedCheckNo: data.bouncedCheckId },
        afterState: { orderNo: result.order.orderNo, newCheckNo: result.newCheck.checkNo, newCheckId: result.newCheck.id },
        note: `退票重新開票 → ${result.newCheck.checkNo}`,
      });
    }

    return NextResponse.json({
      ok: true,
      orderNo: result.order.orderNo,
      checkNo: result.newCheck.checkNo,
      checkId: result.newCheck.id,
      message: '已建立重新開票之付款單，請至出納執行付款後，新支票將顯示於支票管理並可標記為已兌現。',
    }, { status: 201 });
  } catch (e) {
    return handleApiError(e, '/api/checks/reissue');
  }
}
