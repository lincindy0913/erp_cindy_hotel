import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter, assertWarehouseAccess } from '@/lib/warehouse-access';
import { assertPeriodOpen } from '@/lib/period-lock';
import { requireMoney } from '@/lib/safe-parse';

export const dynamic = 'force-dynamic';

// Generate check number: CHK-YYYYMMDD-XXXX
async function generateCheckNo() {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `CHK-${dateStr}-`;

  const existing = await prisma.check.findMany({
    where: { checkNo: { startsWith: prefix } },
    select: { checkNo: true }
  });

  let maxSeq = 0;
  for (const c of existing) {
    const seq = parseInt(c.checkNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

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

    // Auto-update: any check with status='pending' and dueDate <= today => 'due'
    const today = new Date().toISOString().split('T')[0];
    await prisma.check.updateMany({
      where: {
        status: 'pending',
        dueDate: { lte: today }
      },
      data: { status: 'due' }
    });

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

    const TAKE = 1000;
    const checks = await prisma.check.findMany({
      where,
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } },
        reissueOfCheck: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
        reissuedByChecks: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: TAKE + 1,
    });

    const hasMore = checks.length > TAKE;
    const data = hasMore ? checks.slice(0, TAKE) : checks;
    return NextResponse.json(data, hasMore ? { headers: { 'X-Has-More': 'true' } } : {});
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

    // Auto-generate checkNo
    const checkNo = await generateCheckNo();

    // Determine initial status based on dueDate
    const today = new Date().toISOString().split('T')[0];
    const initialStatus = data.dueDate <= today ? 'due' : 'pending';

    const newCheck = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, data.dueDate, data.warehouse || null);

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

    return NextResponse.json(newCheck, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
