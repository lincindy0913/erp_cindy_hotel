import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Helper: generate sequence number
async function generateNo(tx, model, prefix) {
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const fullPrefix = `${prefix}-${today}-`;

  let maxSeq = 0;
  if (model === 'paymentOrder') {
    const existing = await tx.paymentOrder.findMany({
      where: { orderNo: { startsWith: fullPrefix } },
      select: { orderNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.orderNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  } else if (model === 'commonExpenseRecord') {
    const existing = await tx.commonExpenseRecord.findMany({
      where: { recordNo: { startsWith: fullPrefix } },
      select: { recordNo: true }
    });
    for (const item of existing) {
      const seq = parseInt(item.recordNo.substring(fullPrefix.length)) || 0;
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  return `${fullPrefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// POST: Execute fixed-type template
// Creates: PaymentOrder + CommonExpenseRecord with entry lines
export async function POST(request) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();

    // Validate required fields
    if (!data.templateId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇費用範本', 400);
    }
    if (!data.warehouse?.trim()) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇館別', 400);
    }
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
      return createErrorResponse('VALIDATION_FAILED',
        `借貸不平衡：借方 ${debitTotal.toFixed(2)} ≠ 貸方 ${creditTotal.toFixed(2)}`, 400);
    }
    if (debitTotal <= 0) {
      return createErrorResponse('VALIDATION_FAILED', '金額必須大於 0', 400);
    }

    // Check for duplicate
    const duplicate = await prisma.commonExpenseRecord.findFirst({
      where: {
        templateId: parseInt(data.templateId),
        warehouse: data.warehouse.trim(),
        expenseMonth: data.expenseMonth.trim(),
        executionType: 'fixed',
        status: { not: '已作廢' }
      }
    });

    if (duplicate && !data.allowDuplicate) {
      return createErrorResponse('CONFLICT_UNIQUE',
        `此範本在 ${data.warehouse} ${data.expenseMonth} 已有記錄 (${duplicate.recordNo})，確定要再新增嗎？`,
        409, { duplicate: true });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create PaymentOrder
      const orderNo = await generateNo(tx, 'paymentOrder', 'PAY');
      const paymentOrder = await tx.paymentOrder.create({
        data: {
          orderNo,
          invoiceIds: [],
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName || null,
          warehouse: data.warehouse.trim(),
          paymentMethod: data.paymentMethod || '月結',
          amount: debitTotal,
          discount: 0,
          netAmount: debitTotal,
          dueDate: data.dueDate || null,
          note: `固定費用 - ${data.expenseMonth}`,
          status: '待出納',
          createdBy: data.createdBy.trim()
        }
      });

      // 2. Create CommonExpenseRecord
      const recordNo = await generateNo(tx, 'commonExpenseRecord', 'EXP');
      const record = await tx.commonExpenseRecord.create({
        data: {
          recordNo,
          templateId: parseInt(data.templateId),
          executionType: 'fixed',
          warehouse: data.warehouse.trim(),
          expenseMonth: data.expenseMonth.trim(),
          supplierId: data.supplierId ? parseInt(data.supplierId) : null,
          supplierName: data.supplierName || null,
          paymentMethod: data.paymentMethod || '月結',
          totalDebit: debitTotal,
          totalCredit: creditTotal,
          paymentOrderId: paymentOrder.id,
          paymentOrderNo: orderNo,
          status: '已確認',
          confirmedBy: data.createdBy.trim(),
          confirmedAt: new Date(),
          note: data.note || null,
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
          template: { select: { id: true, name: true } },
          entryLines: { orderBy: { sortOrder: 'asc' } }
        }
      });

      // 3. Sync DepartmentExpense
      const [yearStr, monthStr] = data.expenseMonth.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);

      const template = await tx.commonExpenseTemplate.findUnique({
        where: { id: parseInt(data.templateId) },
        include: { category: { select: { name: true } } }
      });
      const category = template?.category?.name || '固定費用';

      const existingDept = await tx.departmentExpense.findFirst({
        where: { year, month, department: data.warehouse.trim(), category }
      });

      if (existingDept) {
        await tx.departmentExpense.update({
          where: { id: existingDept.id },
          data: { totalAmount: Number(existingDept.totalAmount) + debitTotal }
        });
      } else {
        await tx.departmentExpense.create({
          data: { year, month, department: data.warehouse.trim(), category, tax: 0, totalAmount: debitTotal }
        });
      }

      // 4. Sync MonthlyAggregation
      const existingAgg = await tx.monthlyAggregation.findFirst({
        where: { aggregationType: 'expense', year, month, warehouse: data.warehouse.trim() }
      });

      if (existingAgg) {
        await tx.monthlyAggregation.update({
          where: { id: existingAgg.id },
          data: {
            totalAmount: { increment: debitTotal },
            recordCount: { increment: 1 }
          }
        });
      } else {
        await tx.monthlyAggregation.create({
          data: {
            aggregationType: 'expense',
            year, month,
            warehouse: data.warehouse.trim(),
            totalAmount: debitTotal,
            recordCount: 1
          }
        });
      }

      return {
        record,
        paymentOrderNo: orderNo,
        totalAmount: debitTotal
      };
    });

    return NextResponse.json({
      ...result.record,
      totalDebit: Number(result.record.totalDebit),
      totalCredit: Number(result.record.totalCredit),
      entryLines: result.record.entryLines.map(l => ({ ...l, amount: Number(l.amount) })),
      createdAt: result.record.createdAt.toISOString(),
      updatedAt: result.record.updatedAt.toISOString(),
      confirmedAt: result.record.confirmedAt?.toISOString() || null,
      linkedPaymentOrderNo: result.paymentOrderNo,
      totalAmount: result.totalAmount
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
