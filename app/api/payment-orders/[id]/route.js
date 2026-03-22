import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const id = parseInt(params.id);
    const order = await prisma.paymentOrder.findUnique({
      where: { id },
      include: { executions: true },
    });

    if (!order) {
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
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
  try {
    const session = await getServerSession(authOptions);
    const id = parseInt(params.id);
    const data = await request.json();

    const order = await prisma.paymentOrder.findUnique({ where: { id } });
    if (!order) {
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
    }

    // Submit action (draft -> pending)
    if (data.action === 'submit') {
      if (order.status !== '草稿') {
        return createErrorResponse('VALIDATION_FAILED', '只能提交草稿狀態的付款單', 400);
      }
      await prisma.paymentOrder.update({
        where: { id },
        data: { status: '待出納' },
      });

      if (session) {
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.PAYMENT_ORDER_UPDATE,
          targetModule: 'payment-orders',
          targetRecordId: id,
          targetRecordNo: order.orderNo,
          note: '提交出納',
          beforeState: { status: '草稿' },
          afterState: { status: '待出納' },
        });
      }

      return NextResponse.json({ message: '付款單已提交出納' });
    }

    // Resubmit action (rejected -> pending)
    if (data.action === 'resubmit') {
      if (order.status !== '已拒絕') {
        return createErrorResponse('VALIDATION_FAILED', '只能重新提交已拒絕狀態的付款單', 400);
      }
      await prisma.paymentOrder.update({
        where: { id },
        data: {
          status: '待出納',
          rejectedBy: null,
          rejectedAt: null,
          rejectedReason: null,
        },
      });

      if (session) {
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.PAYMENT_ORDER_UPDATE,
          targetModule: 'payment-orders',
          targetRecordId: id,
          targetRecordNo: order.orderNo,
          note: '重新提交出納',
          beforeState: { status: '已拒絕' },
          afterState: { status: '待出納' },
        });
      }

      return NextResponse.json({ message: '付款單已重新提交出納' });
    }

    // Reject action：退回出納 → 狀態改回「待出納」，資料連動回付款端待出納 TAB，供修改後重新送出
    if (data.action === 'reject') {
      if (order.status !== '待出納') {
        return createErrorResponse('VALIDATION_FAILED', '只能退回待出納狀態的付款單', 400);
      }
      await prisma.paymentOrder.update({
        where: { id },
        data: {
          status: '待出納',
          rejectedBy: session?.user?.email || null,
          rejectedAt: new Date(),
          rejectedReason: data.reason || null,
        },
      });

      if (session) {
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.CASHIER_REJECT,
          targetModule: 'payment-orders',
          targetRecordId: id,
          targetRecordNo: order.orderNo,
          note: data.reason,
        });
      }

      return NextResponse.json({ message: '付款單已退回至待出納，請於付款頁修改後重新送出' });
    }

    // Void action
    if (data.action === 'void') {
      const updated = await prisma.paymentOrder.update({
        where: { id },
        data: { status: '已作廢' },
      });

      if (session) {
        await auditFromSession(prisma, session, {
          action: AUDIT_ACTIONS.PAYMENT_ORDER_VOID,
          targetModule: 'payment-orders',
          targetRecordId: id,
          targetRecordNo: order.orderNo,
          beforeState: { status: order.status, amount: Number(order.amount) },
          afterState: { status: '已作廢' },
          note: `付款單作廢 ${order.orderNo}`,
        });
      }

      return NextResponse.json({ message: '付款單已作廢' });
    }

    // General update (for draft and rejected status only)
    if (order.status !== '草稿' && order.status !== '待出納' && order.status !== '已拒絕') {
      return createErrorResponse('VALIDATION_FAILED', '此狀態不可修改', 400);
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
    // 待出納單被修改時清除「曾被退回」標記，視為已修正並重新送出
    if (order.status === '待出納' && Object.keys(updateData).length > 0) {
      updateData.rejectedBy = null;
      updateData.rejectedAt = null;
      updateData.rejectedReason = null;
    }

    await prisma.paymentOrder.update({ where: { id }, data: updateData });

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.PAYMENT_ORDER_UPDATE,
        targetModule: 'payment-orders',
        targetRecordId: id,
        targetRecordNo: order.orderNo,
        beforeState: { status: order.status, amount: Number(order.amount), paymentMethod: order.paymentMethod },
        afterState: updateData,
        note: `修改付款單 ${order.orderNo}`,
      });
    }

    return NextResponse.json({ message: '付款單已更新' });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    const id = parseInt(params.id);
    const order = await prisma.paymentOrder.findUnique({ where: { id } });

    if (!order) {
      return createErrorResponse('NOT_FOUND', '付款單不存在', 404);
    }

    if (order.status === '已執行') {
      return createErrorResponse('VALIDATION_FAILED', '已執行的付款單不可刪除', 400);
    }

    await prisma.paymentOrder.delete({ where: { id } });

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.PAYMENT_ORDER_DELETE,
        targetModule: 'payment-orders',
        targetRecordId: id,
        targetRecordNo: order.orderNo,
        beforeState: { orderNo: order.orderNo, status: order.status, amount: Number(order.amount), supplierName: order.supplierName },
        note: `刪除付款單 ${order.orderNo}`,
      });
    }

    return NextResponse.json({ message: '付款單已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
