import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, assertWarehouseAccess } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { validateBody } from '@/lib/validate-body';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { checkIdempotency, saveIdempotency } from '@/lib/idempotency';
import { requireMoney } from '@/lib/safe-parse';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const warehouse = searchParams.get('warehouse');
    const supplierId = searchParams.get('supplierId');
    const sourceType = searchParams.get('sourceType');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const keyword = searchParams.get('keyword');
    const page = parseInt(searchParams.get('page')) || 0;  // 0 = 不分頁（向下相容）
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 200);
    const all = searchParams.get('all') === 'true';

    const where = {};
    if (status) where.status = status;
    if (warehouse) where.warehouse = warehouse;
    if (supplierId) where.supplierId = parseInt(supplierId);
    if (sourceType) {
      // Support category-based filtering (maps to multiple sourceType values)
      const categoryMap = {
        '進銷存': ['payment_order', 'purchasing', 'check_reissue'],
        '固定費用': ['common_expense', 'fixed_expense', 'expense'],
        '租屋': ['rental_deposit_out', 'rental_deposit_in', 'rental'],
        '貸款': ['loan_predeposit', 'loan_payment'],
        '工程': ['engineering'],
      };
      if (categoryMap[sourceType]) {
        where.sourceType = { in: categoryMap[sourceType] };
      } else {
        where.sourceType = sourceType;
      }
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom + 'T00:00:00.000Z');
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword, mode: 'insensitive' } },
        { supplierName: { contains: keyword, mode: 'insensitive' } },
        { summary: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    const formatOrder = (o) => ({
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
    });

    // 不分頁模式（向下相容：page 未帶或 all=true），上限 5000 筆
    if (all || page === 0) {
      const orders = await prisma.paymentOrder.findMany({
        where,
        include: { executions: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });
      return NextResponse.json(orders.map(formatOrder));
    }

    // 分頁模式
    const skip = (page - 1) * limit;
    const [orders, totalCount] = await Promise.all([
      prisma.paymentOrder.findMany({
        where,
        include: { executions: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.paymentOrder.count({ where }),
    ]);

    return NextResponse.json({
      data: orders.map(formatOrder),
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const cachedRes = checkIdempotency(request);
  if (cachedRes) return cachedRes;

  const authPost = await requirePermission(PERMISSIONS.FINANCE_CREATE);
  if (!authPost.ok) return authPost.response;

  try {
    const session = authPost.session;
    const rawData = await request.json();

    // Validate and sanitize request body
    const { ok: bodyOk, data, error: bodyError } = validateBody(rawData, {
      invoiceIds:           { type: 'array', required: true, itemType: 'number', maxItems: 100 },
      paymentMethod:        { type: 'string', required: true, maxLength: 50 },
      netAmount:            { type: 'number', required: true, min: 0, max: 9999999999 },
      warehouse:            { type: 'string', maxLength: 100 },
      supplierId:           { type: 'number', integer: true },
      supplierName:         { type: 'string', maxLength: 255 },
      amount:               { type: 'number', min: 0, max: 9999999999 },
      discount:             { type: 'number', min: 0, max: 9999999999 },
      dueDate:              { type: 'string', maxLength: 20 },
      note:                 { type: 'string', maxLength: 1000 },
      checkAccountId:       { type: 'number', integer: true },
      checkAccount:         { type: 'string', maxLength: 100 },
      checkIssueDate:       { type: 'string', maxLength: 20 },
      checkDueDate:         { type: 'string', maxLength: 20 },
      checkNo:              { type: 'string', maxLength: 100 },
      accountId:            { type: 'number', integer: true },
      isEmployeeAdvance:    { type: 'boolean' },
      advancedBy:           { type: 'string', maxLength: 100 },
      advancePaymentMethod: { type: 'string', maxLength: 50 },
      sourceType:           { type: 'string', maxLength: 50 },
      sourceRecordId:       { type: 'number', integer: true },
      creditCardTx:         { type: 'boolean' },
      creditCardAccountId:  { type: 'number', integer: true },
    });
    if (!bodyOk) {
      return createErrorResponse('VALIDATION_FAILED', bodyError, 400);
    }

    // Validate monetary amount within Decimal(12,2) range
    requireMoney(data.netAmount, '淨額', { min: 0 });

    const now = new Date();
    const isCheck = data.paymentMethod === '支票';
    const checkAccountId = data.checkAccountId ? parseInt(data.checkAccountId) : null;
    let checkAccountName = data.checkAccount || null;
    if (isCheck && checkAccountId) {
      const acc = await prisma.cashAccount.findUnique({ where: { id: checkAccountId }, select: { name: true } });
      if (acc) checkAccountName = acc.name;
    }

    const result = await prisma.$transaction(async (tx) => {
      // ── 關帳鎖定檢查：禁止在已關帳月份建立付款單 ──
      const lockDate = data.dueDate || now.toISOString().split('T')[0];
      await assertPeriodOpen(tx, lockDate, data.warehouse || null);

      // ── 冪等檢查：同一 sourceType + sourceRecordId 不可重複建立 ──
      if (data.sourceType && data.sourceRecordId != null) {
        const dup = await tx.paymentOrder.findFirst({
          where: {
            sourceType: data.sourceType,
            sourceRecordId: parseInt(data.sourceRecordId),
            status: { notIn: ['已作廢'] },
          },
        });
        if (dup) {
          throw new Error(`IDEMPOTENT:此來源記錄已有付款單 ${dup.orderNo}，請勿重複建立`);
        }
      }

      // Auto-generate orderNo 在 transaction 內，避免序號衝突
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const prefix = `PAY-${dateStr}-`;
      const existing = await tx.paymentOrder.findMany({
        where: { orderNo: { startsWith: prefix } },
        select: { orderNo: true },
      });
      let maxSeq = 0;
      for (const item of existing) {
        const seq = parseInt(item.orderNo.substring(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const orderNo = `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;

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
          accountId: isCheck && checkAccountId ? checkAccountId : (data.accountId ? parseInt(data.accountId) : null),
          checkNo: data.checkNo || null,
          checkAccount: checkAccountName,
          checkIssueDate: data.checkIssueDate || null,
          checkDueDate: data.checkDueDate || null,
          summary: data.summary || null,
          note: data.note || null,
          status: data.status === '待出納' ? '待出納' : '草稿',
          sourceType: data.sourceType || null,
          sourceRecordId: data.sourceRecordId != null ? parseInt(data.sourceRecordId) : null,
          createdBy: session?.user?.email || null,
        },
      });

      // 支票付款：自動建立 Check 記錄（開票帳戶連動資金帳戶 → sourceAccountId）
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
        const checkNumber = (data.checkNo && String(data.checkNo).trim()) || `PAY-${orderNo}`;
        const dueDate = data.checkDueDate || data.checkDate || now.toISOString().split('T')[0];

        check = await tx.check.create({
          data: {
            checkNo,
            checkType: 'payable',
            checkNumber,
            amount: data.netAmount,
            issueDate: data.checkIssueDate || now.toISOString().split('T')[0],
            dueDate,
            status: 'pending',
            drawerType: 'company',
            payeeName: data.supplierName || null,
            supplierId: data.supplierId ? parseInt(data.supplierId) : null,
            paymentId: order.id,
            invoiceIds: data.invoiceIds,
            warehouse: data.warehouse || null,
            sourceAccountId: checkAccountId || undefined,
            note: (data.note && String(data.note).trim()) ? `付款單 ${orderNo} - ${data.note}` : `自動建立 - 付款單 ${orderNo}`,
            createdBy: session?.user?.email || null,
          },
        });

        // 付款單的 checkNo 存成「顯示用支票號碼」（與支票管理頁面一致）
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: { checkNo: checkNumber },
        });
        order.checkNo = checkNumber;
      }

      // 員工代墊款：自動建立 EmployeeAdvance 記錄
      let advance = null;
      if (data.isEmployeeAdvance && data.advancedBy) {
        const advDateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const advPrefix = `ADV-${advDateStr}-`;
        const existingAdv = await tx.employeeAdvance.findMany({
          where: { advanceNo: { startsWith: advPrefix } },
          select: { advanceNo: true },
        });
        let maxAdvSeq = 0;
        for (const item of existingAdv) {
          const seq = parseInt(item.advanceNo.substring(advPrefix.length)) || 0;
          if (seq > maxAdvSeq) maxAdvSeq = seq;
        }
        const advanceNo = `${advPrefix}${String(maxAdvSeq + 1).padStart(4, '0')}`;

        advance = await tx.employeeAdvance.create({
          data: {
            advanceNo,
            employeeName: data.advancedBy,
            paymentMethod: data.advancePaymentMethod || data.paymentMethod || '現金',
            sourceType: 'payment_order',
            sourceRecordId: order.id,
            sourceDescription: `${data.supplierName || ''} - ${orderNo}`,
            paymentOrderId: order.id,
            paymentOrderNo: orderNo,
            amount: data.netAmount,
            status: '待結算',
            warehouse: data.warehouse || null,
            createdBy: session?.user?.email || null,
          },
        });
      }

      return { order, check, advance, orderNo };
    });

    const order = result.order;

    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.PAYMENT_ORDER_CREATE,
        targetModule: 'payment-orders',
        targetRecordId: order.id,
        targetRecordNo: result.orderNo,
        afterState: { invoiceIds: data.invoiceIds, netAmount: data.netAmount, checkCreated: isCheck },
      });
    }

    const resBody = {
      ...order,
      amount: Number(order.amount),
      discount: Number(order.discount),
      netAmount: Number(order.netAmount),
      linkedCheckNo: result.check?.checkNo || null,
      linkedAdvanceNo: result.advance?.advanceNo || null,
    };
    saveIdempotency(request, resBody, 201);
    return NextResponse.json(resBody, { status: 201 });
  } catch (error) {

    return handleApiError(error, '/api/payment-orders');
  }
}
