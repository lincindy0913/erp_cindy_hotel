import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';
import { assertVersion } from '@/lib/optimistic-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const order = await prisma.paymentOrder.findUnique({
      where: { id },
      include: { executions: true },
    });

    if (!order) {
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
    }

    if (order.warehouse) {
      const wa = assertWarehouseAccess(auth.session, order.warehouse);
      if (!wa.ok) return wa.response;
    }

    return NextResponse.json({
      ...order,
      amount: Number(order.amount),
      discount: Number(order.discount),
      netAmount: Number(order.netAmount),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_EDIT);
  if (!auth.ok) return auth.response;

  try {
    const session = auth.session;
    const id = parseInt(params.id);
    const data = await request.json();

    const result = await prisma.$transaction(async (tx) => {
      // Re-read inside transaction for idempotency
      const order = await tx.paymentOrder.findUnique({ where: { id } });
      if (!order) throw new Error('NOT_FOUND:付款單不存在');

      // Optimistic locking
      assertVersion(order, data.version, '付款單');

      if (order.warehouse) {
        const wa = assertWarehouseAccess(session, order.warehouse);
        if (!wa.ok) throw new Error('VALIDATION:無權限存取此館別');
      }

      // Period lock: use dueDate or createdAt
      const lockDate = order.dueDate || order.createdAt?.toISOString?.() || new Date().toISOString();
      await assertPeriodOpen(tx, lockDate, order.warehouse);

      // ── Submit action (draft -> pending) ──
      if (data.action === 'submit') {
        if (order.status !== '草稿') {
          throw new Error('IDEMPOTENT:此付款單已非草稿狀態');
        }
        await tx.paymentOrder.update({
          where: { id },
          data: { status: '待出納', version: { increment: 1 } },
        });
        return { action: 'submit', order, afterStatus: '待出納', message: '付款單已提交出納' };
      }

      // ── Resubmit action (rejected -> pending) ──
      if (data.action === 'resubmit') {
        if (order.status !== '已拒絕') {
          throw new Error('IDEMPOTENT:此付款單不在已拒絕狀態');
        }
        await tx.paymentOrder.update({
          where: { id },
          data: {
            status: '待出納',
            rejectedBy: null,
            rejectedAt: null,
            rejectedReason: null,
          },
        });
        return { action: 'resubmit', order, afterStatus: '待出納', message: '付款單已重新提交出納' };
      }

      // ── Reject action ──
      if (data.action === 'reject') {
        if (order.status !== '待出納') {
          throw new Error('IDEMPOTENT:此付款單不在待出納狀態');
        }
        await tx.paymentOrder.update({
          where: { id },
          data: {
            status: '待出納',
            rejectedBy: session?.user?.email || null,
            rejectedAt: new Date(),
            rejectedReason: data.reason || null,
          },
        });
        return { action: 'reject', order, afterStatus: '待出納', message: '付款單已退回至待出納，請於付款頁修改後重新送出' };
      }

      // ── Void action ──
      if (data.action === 'void') {
        if (order.status === '已作廢') {
          throw new Error('IDEMPOTENT:此付款單已作廢');
        }
        await tx.paymentOrder.update({
          where: { id },
          data: { status: '已作廢', version: { increment: 1 } },
        });
        return { action: 'void', order, afterStatus: '已作廢', message: '付款單已作廢' };
      }

      // ── General update (draft / pending / rejected only) ──
      if (order.status !== '草稿' && order.status !== '待出納' && order.status !== '已拒絕') {
        throw new Error('VALIDATION:此狀態不可修改');
      }

      const updateData = {};
      if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
      if (data.accountId !== undefined) updateData.accountId = data.accountId ? parseInt(data.accountId) : null;
      if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
      if (data.checkNo !== undefined) updateData.checkNo = data.checkNo;
      if (data.checkAccount !== undefined) updateData.checkAccount = data.checkAccount;
      if (data.checkIssueDate !== undefined) updateData.checkIssueDate = data.checkIssueDate;
      if (data.checkDueDate !== undefined) updateData.checkDueDate = data.checkDueDate;
      if (data.note !== undefined) updateData.note = data.note;
      if (data.summary !== undefined) updateData.summary = data.summary;
      if (data.supplierName !== undefined) updateData.supplierName = data.supplierName;
      if (data.discount !== undefined) updateData.discount = data.discount;
      if (data.netAmount !== undefined) updateData.netAmount = data.netAmount;
      if (data.amount !== undefined) updateData.amount = data.amount;
      if (data.status === '待出納') {
        updateData.status = '待出納';
        updateData.rejectedBy = null;
        updateData.rejectedAt = null;
        updateData.rejectedReason = null;
      }
      if (order.status === '待出納' && Object.keys(updateData).length > 0) {
        updateData.rejectedBy = null;
        updateData.rejectedAt = null;
        updateData.rejectedReason = null;
      }

      await tx.paymentOrder.update({ where: { id }, data: { ...updateData, version: { increment: 1 } } });
      return { action: 'update', order, afterState: updateData, message: '付款單已更新' };
    });

    // Audit (outside transaction — non-critical)
    if (session) {
      const auditAction = result.action === 'void' ? AUDIT_ACTIONS.PAYMENT_ORDER_VOID : AUDIT_ACTIONS.PAYMENT_ORDER_UPDATE;
      const note = result.action === 'reject' ? data.reason
        : result.action === 'void' ? `付款單作廢 ${result.order.orderNo}`
        : result.action === 'submit' ? '提交出納'
        : result.action === 'resubmit' ? '重新提交出納'
        : `修改付款單 ${result.order.orderNo}`;

      await auditFromSession(prisma, session, {
        action: auditAction,
        targetModule: 'payment-orders',
        targetRecordId: id,
        targetRecordNo: result.order.orderNo,
        beforeState: { status: result.order.status, amount: Number(result.order.amount), paymentMethod: result.order.paymentMethod },
        afterState: result.afterState || { status: result.afterStatus },
        note,
      });
    }

    return NextResponse.json({ message: result.message });
  } catch (error) {




    return handleApiError(error, '/api/payment-orders/[id]');
  }
}

export async function DELETE(request, { params }) {
  const authDel = await requirePermission(PERMISSIONS.FINANCE_EDIT);
  if (!authDel.ok) return authDel.response;

  try {
    const session = authDel.session;
    const id = parseInt(params.id);

    const deletedOrder = await prisma.$transaction(async (tx) => {
      // Re-read inside transaction
      const order = await tx.paymentOrder.findUnique({ where: { id } });
      if (!order) throw new Error('NOT_FOUND:付款單不存在');

      if (order.warehouse) {
        const wa = assertWarehouseAccess(session, order.warehouse);
        if (!wa.ok) throw new Error('VALIDATION:無權限存取此館別');
      }

      // Period lock
      const lockDate = order.dueDate || order.createdAt?.toISOString?.() || new Date().toISOString();
      await assertPeriodOpen(tx, lockDate, order.warehouse);

      // Cannot delete executed orders
      if (order.status === '已執行') {
        throw new Error('VALIDATION:已執行的付款單不可刪除');
      }

      await tx.paymentOrder.delete({ where: { id } });
      return order;
    });

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.PAYMENT_ORDER_DELETE,
        targetModule: 'payment-orders',
        targetRecordId: id,
        targetRecordNo: deletedOrder.orderNo,
        beforeState: { orderNo: deletedOrder.orderNo, status: deletedOrder.status, amount: Number(deletedOrder.amount), supplierName: deletedOrder.supplierName },
        note: `刪除付款單 ${deletedOrder.orderNo}`,
      });
    }

    return NextResponse.json({ message: '付款單已刪除' });
  } catch (error) {


    return handleApiError(error, '/api/payment-orders/[id]');
  }
}
