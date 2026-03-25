import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { applyWarehouseFilter } from '@/lib/warehouse-access';
import { validateWarehouse } from '@/lib/master-data-validator';
import { assertPeriodOpen } from '@/lib/period-lock';

export const dynamic = 'force-dynamic';

// GET: List records with filters (month, warehouse, status, templateId)
export async function GET(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const warehouse = searchParams.get('warehouse');
    const status = searchParams.get('status');
    const templateId = searchParams.get('templateId');
    const executionType = searchParams.get('type'); // purchase or fixed
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 50;

    const where = {};
    if (month) where.expenseMonth = month;
    if (warehouse) where.warehouse = warehouse;
    if (status) where.status = status;
    if (templateId) where.templateId = parseInt(templateId);
    if (executionType) where.executionType = executionType;

    // Warehouse-level access control
    const wf = applyWarehouseFilter(auth.session, where);
    if (!wf.ok) return wf.response;

    // If filtering by payment status, we need to join with PaymentOrder
    const paymentStatusFilter = searchParams.get('paymentStatus');

    const [records, total] = await Promise.all([
      prisma.commonExpenseRecord.findMany({
        where,
        include: {
          template: {
            select: { id: true, name: true, categoryId: true, category: true }
          },
          entryLines: {
            orderBy: { sortOrder: 'asc' }
          }
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.commonExpenseRecord.count({ where })
    ]);

    // Fetch linked payment order statuses
    const paymentOrderIds = records.map(r => r.paymentOrderId).filter(Boolean);
    const paymentOrders = paymentOrderIds.length > 0
      ? await prisma.paymentOrder.findMany({
          where: { id: { in: paymentOrderIds } },
          select: { id: true, status: true }
        })
      : [];
    const poStatusMap = new Map(paymentOrders.map(po => [po.id, po.status]));

    const allResults = records.map(r => {
      const poStatus = r.paymentOrderId ? poStatusMap.get(r.paymentOrderId) : null;
      // Map payment order status to display status
      let paymentStatus = null;
      if (poStatus === '待出納') paymentStatus = '待出納';
      else if (poStatus === '已執行') paymentStatus = '已付款';
      else if (poStatus === '已代墊') paymentStatus = '已代墊';
      else if (poStatus) paymentStatus = poStatus;

      return {
        ...r,
        totalDebit: Number(r.totalDebit),
        totalCredit: Number(r.totalCredit),
        paymentStatus,
        entryLines: r.entryLines.map(line => ({
          ...line,
          amount: Number(line.amount)
        })),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
        voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null
      };
    });

    // Filter by payment status if requested
    const result = paymentStatusFilter
      ? allResults.filter(r => r.paymentStatus === paymentStatusFilter)
      : allResults;

    return NextResponse.json({
      records: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST: Create record from template execution
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const data = await request.json();

    if (!data.templateId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用範本', 400);
    }
    if (!data.warehouse?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    }
    const whErr = await validateWarehouse(data.warehouse);
    if (whErr) return createErrorResponse('VALIDATION_FAILED', whErr, 400);
    if (!data.expenseMonth?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用月份', 400);
    }
    if (!data.entryLines || data.entryLines.length === 0) {
      return createErrorResponse('VALIDATION_FAILED', '請至少新增一筆分錄', 400);
    }
    if (!data.createdBy?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '缺少建立者資訊', 400);
    }

    // Validate debit = credit balance
    const debitTotal = data.entryLines
      .filter(l => l.entryType === 'debit')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
    const creditTotal = data.entryLines
      .filter(l => l.entryType === 'credit')
      .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

    if (Math.abs(debitTotal - creditTotal) > 0.01) {
      return createErrorResponse('VALIDATION_FAILED', `借貸不平衡：借方 ${debitTotal.toFixed(2)} ≠ 貸方 ${creditTotal.toFixed(2)}`, 400);
    }

    if (debitTotal <= 0) {
      return createErrorResponse('VALIDATION_FAILED', '金額必須大於 0', 400);
    }

    // Check for duplicate: same template + warehouse + month (only non-voided)
    const duplicate = await prisma.commonExpenseRecord.findFirst({
      where: {
        templateId: parseInt(data.templateId),
        warehouse: data.warehouse.trim(),
        expenseMonth: data.expenseMonth.trim(),
        status: { not: '已作廢' }
      }
    });

    if (duplicate && !data.allowDuplicate) {
      return createErrorResponse('CONFLICT_UNIQUE', `此範本在 ${data.warehouse} ${data.expenseMonth} 已有記錄 (${duplicate.recordNo})，確定要再新增嗎？`, 409, { duplicate: true });
    }

    // Parse expenseMonth for period lock check (format: "YYYY-MM")
    const [year, month] = data.expenseMonth.trim().split('-');
    const periodDateStr = `${year}-${String(month).padStart(2, '0')}-01`;

    const record = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, periodDateStr, data.warehouse.trim());

      // Generate recordNo: EXP-YYYYMMDD-XXXX
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const todayStart = `EXP-${dateStr}-`;

      const lastRecord = await tx.commonExpenseRecord.findFirst({
        where: {
          recordNo: { startsWith: todayStart }
        },
        orderBy: { recordNo: 'desc' }
      });

      let seq = 1;
      if (lastRecord) {
        const lastSeq = parseInt(lastRecord.recordNo.split('-').pop());
        seq = lastSeq + 1;
      }
      const recordNo = `${todayStart}${String(seq).padStart(4, '0')}`;

      return tx.commonExpenseRecord.create({
        data: {
          recordNo,
          templateId: parseInt(data.templateId),
          warehouse: data.warehouse.trim(),
          expenseMonth: data.expenseMonth.trim(),
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName?.trim() || null,
          paymentMethod: data.paymentMethod?.trim() || null,
          totalDebit: debitTotal,
          totalCredit: creditTotal,
          status: '待確認',
          note: data.note?.trim() || null,
          createdBy: data.createdBy.trim(),
          entryLines: {
            create: data.entryLines.map((line, idx) => ({
              entryType: line.entryType,
              accountingCode: line.accountingCode,
              accountingName: line.accountingName,
              summary: line.summary || '',
              amount: parseFloat(line.amount),
              sortOrder: line.sortOrder ?? idx
            }))
          }
        },
        include: {
          template: {
            select: { id: true, name: true }
          },
          entryLines: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      });
    });

    const result = {
      ...record,
      totalDebit: Number(record.totalDebit),
      totalCredit: Number(record.totalCredit),
      entryLines: record.entryLines.map(line => ({
        ...line,
        amount: Number(line.amount)
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
