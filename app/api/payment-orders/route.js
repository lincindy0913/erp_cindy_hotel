import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const warehouse = searchParams.get('warehouse');
    const supplierId = searchParams.get('supplierId');

    const where = {};
    if (status) where.status = status;
    if (warehouse) where.warehouse = warehouse;
    if (supplierId) where.supplierId = parseInt(supplierId);

    const orders = await prisma.paymentOrder.findMany({
      where,
      include: { executions: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(orders.map(o => ({
      ...o,
      amount: Number(o.amount),
      discount: Number(o.discount),
      netAmount: Number(o.netAmount),
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      rejectedAt: o.rejectedAt ? o.rejectedAt.toISOString() : null,
      executions: o.executions.map(e => ({
        ...e,
        actualAmount: Number(e.actualAmount),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    })));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const data = await request.json();

    if (!data.invoiceIds || !data.paymentMethod || data.netAmount === undefined) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必要欄位', 400);
    }

    // Auto-generate orderNo: PAY-YYYYMMDD-XXXX
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `PAY-${dateStr}-`;

    const existing = await prisma.paymentOrder.findMany({
      where: { orderNo: { startsWith: prefix } },
    });

    let maxSeq = 0;
    for (const item of existing) {
      const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
    const orderNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

    const isCheck = data.paymentMethod === '支票';

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: data.invoiceIds,
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName || null,
          warehouse: data.warehouse || null,
          paymentMethod: data.paymentMethod,
          amount: data.amount || 0,
          discount: data.discount || 0,
          netAmount: data.netAmount,
          dueDate: data.dueDate || null,
          accountId: data.accountId ? parseInt(data.accountId) : null,
          checkNo: data.checkNo || null,
          checkAccount: data.checkAccount || null,
          checkIssueDate: data.checkIssueDate || null,
          checkDueDate: data.checkDueDate || null,
          note: data.note || null,
          status: data.status === '待出納' ? '待出納' : '草稿',
          createdBy: session?.user?.email || null,
        },
      });

      // 支票付款：自動建立 Check 記錄
      let check = null;
      if (isCheck) {
        const chkDateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const chkPrefix = `CHK-${chkDateStr}-`;
        const existingChecks = await tx.check.findMany({
          where: { checkNo: { startsWith: chkPrefix } },
          select: { checkNo: true }
        });
        let maxChkSeq = 0;
        for (const c of existingChecks) {
          const seq = parseInt(c.checkNo.substring(chkPrefix.length)) || 0;
          if (seq > maxChkSeq) maxChkSeq = seq;
        }
        const checkNo = `${chkPrefix}${String(maxChkSeq + 1).padStart(4, '0')}`;
        const checkNumber = `PAY-${orderNo}`;
        const dueDate = now.toISOString().split('T')[0];

        check = await tx.check.create({
          data: {
            checkNo,
            checkType: 'payable',
            checkNumber,
            amount: data.netAmount,
            issueDate: now.toISOString().split('T')[0],
            dueDate,
            status: 'pending',
            drawerType: 'company',
            payeeName: data.supplierName || null,
            supplierId: data.supplierId ? parseInt(data.supplierId) : null,
            paymentId: order.id,
            invoiceIds: data.invoiceIds,
            warehouse: data.warehouse || null,
            note: `自動建立 - 付款單 ${orderNo}`,
            createdBy: session?.user?.email || null,
          },
        });

        // 更新付款單的 checkNo 欄位關聯
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { checkNo: checkNumber },
        });
        order.checkNo = checkNumber;
      }

      return { order, check };
    });

    const order = result.order;

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.PAYMENT_ORDER_CREATE,
        targetModule: 'payment-orders',
        targetRecordId: order.id,
        targetRecordNo: orderNo,
        afterState: { invoiceIds: data.invoiceIds, netAmount: data.netAmount, checkCreated: isCheck },
      });
    }

    return NextResponse.json({
      ...order,
      amount: Number(order.amount),
      discount: Number(order.discount),
      netAmount: Number(order.netAmount),
      linkedCheckNo: result.check?.checkNo || null,
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
