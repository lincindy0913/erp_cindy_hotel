import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, assertWarehouseAccess } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';
import { requireMoney } from '@/lib/safe-parse';
import { todayStr } from '@/lib/localDate';
import { nextSequence } from '@/lib/sequence-generator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.CHECK_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const checkType = searchParams.get('checkType');
    const status = searchParams.get('status');
    const warehouse = searchParams.get('warehouse');
    const supplierId = searchParams.get('supplierId');
    const dueDateFrom = searchParams.get('dueDateFrom');
    const dueDateTo = searchParams.get('dueDateTo');

    // Build filter
    const where = {};
    if (checkType) where.checkType = checkType;
    if (status) where.status = status;
    if (warehouse) where.warehouse = warehouse;
    if (supplierId) where.supplierId = parseInt(supplierId);

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    if (dueDateFrom && dueDateTo) {
      where.dueDate = { gte: dueDateFrom, lte: dueDateTo };
    } else if (dueDateFrom) {
      where.dueDate = { gte: dueDateFrom };
    } else if (dueDateTo) {
      where.dueDate = { lte: dueDateTo };
    }

    const page     = Math.max(1, parseInt(searchParams.get('page')     || '1'));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50')));

    const [total, checks] = await Promise.all([
      prisma.check.count({ where }),
      prisma.check.findMany({
        where,
        include: {
          sourceAccount:    { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } },
          reissueOfCheck:   { select: { id: true, checkNo: true, checkNumber: true, status: true } },
          reissuedByChecks: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
        },
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      data: checks,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.checkType || !data.checkNumber || !data.amount || !data.dueDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少必填欄位：支票類型、支票號碼、金額、到期日', 400);
    }

    // Validate checkType-specific required fields
    if (data.checkType === 'payable' && !data.sourceAccountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '應付支票必須指定來源帳戶', 400);
    }
    if (data.checkType === 'receivable' && !data.destinationAccountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '應收支票必須指定目的帳戶', 400);
    }

    // Validate amount (with Decimal(12,2) max enforcement)
    const parsedCheckAmount = requireMoney(data.amount, '支票金額', { min: 0.01 });

    // Validate checkNumber uniqueness within same warehouse
    const existingCheck = await prisma.check.findFirst({
      where: {
        checkNumber: data.checkNumber,
        warehouse: data.warehouse || null
      }
    });
    if (existingCheck) {
      return createErrorResponse('CHECK_NUMBER_DUPLICATE', '同一館別中已存在相同支票號碼', 409);
    }

    // Determine initial status based on dueDate
    const today = todayStr();
    const initialStatus = data.dueDate <= today ? 'due' : 'pending';

    const newCheck = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, data.dueDate, data.warehouse || null);

      // Generate checkNo inside transaction with FOR UPDATE row locking
      const dateStr = today.replace(/-/g, '');
      const checkNo = await nextSequence(tx, 'check', 'checkNo', `CHK-${dateStr}-`);

      return tx.check.create({
        data: {
          checkNo,
          checkType: data.checkType,
          checkNumber: data.checkNumber,
          amount: parsedCheckAmount,
          issueDate: data.issueDate || null,
          dueDate: data.dueDate,
          status: initialStatus,
          drawerType: data.drawerType || 'company',
          drawerName: data.drawerName || null,
          sourceAccountId: data.sourceAccountId ? parseInt(data.sourceAccountId) : null,
          payeeName: data.payeeName || null,
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          destinationAccountId: data.destinationAccountId ? parseInt(data.destinationAccountId) : null,
          paymentId: data.paymentId ? parseInt(data.paymentId) : null,
          invoiceIds: data.invoiceIds || null,
          warehouse: data.warehouse || null,
          bankName: data.bankName || null,
          bankBranch: data.bankBranch || null,
          note: data.note || null,
          createdBy: data.createdBy || null
        },
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });
    });

    await auditFromSession(prisma, auth.session, {
      action: AUDIT_ACTIONS.CHECK_CREATE,
      targetModule: 'checks',
      targetRecordId: newCheck.id,
      targetRecordNo: newCheck.checkNo,
      afterState: {
        checkNo: newCheck.checkNo,
        checkType: newCheck.checkType,
        checkNumber: newCheck.checkNumber,
        amount: Number(newCheck.amount),
        dueDate: newCheck.dueDate,
        status: newCheck.status,
        payeeName: newCheck.payeeName,
        drawerName: newCheck.drawerName,
        warehouse: newCheck.warehouse,
      },
      note: `建立支票 ${newCheck.checkNo}（${newCheck.checkType === 'payable' ? '應付' : '應收'}，金額 ${Number(newCheck.amount).toLocaleString()}）`,
    }).catch(e => console.error('[AUDIT_FAIL] check create:', e.message));

    return NextResponse.json(newCheck, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
