import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

// Helper: generate transaction number CF-YYYYMMDD-XXXX
async function generateTxNo(tx, dateStr) {
  const prefix = `CF-${dateStr.replace(/-/g, '')}-`;
  const existing = await tx.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });
  let maxSeq = 0;
  for (const item of existing) {
    const seq = parseInt(item.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// Helper: recalculate account balance from all transactions
async function recalcAccountBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  const allTx = await tx.cashTransaction.findMany({
    where: { accountId, status: '已確認' }
  });
  let balance = Number(account.openingBalance);
  for (const t of allTx) {
    const amt = Number(t.amount);
    const fee = Number(t.fee || 0);
    if (t.type === '收入' || t.type === '移轉入') {
      balance += amt;
    } else {
      balance -= amt;
    }
    if (fee > 0) balance -= fee;
  }
  await tx.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance }
  });
}

// Helper: sync DepartmentExpense (upsert by year/month/department/category)
// sign: +1 for add, -1 for reverse; directDiff: for edit mode, pass the diff directly
async function syncDepartmentExpense(tx, record, template, sign, directDiff) {
  const [yearStr, monthStr] = record.expenseMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const department = record.warehouse;
  const category = template?.category?.name || '未分類';
  const amount = directDiff !== undefined ? directDiff : Number(record.totalDebit) * sign;

  const existing = await tx.departmentExpense.findFirst({
    where: { year, month, department, category }
  });

  if (existing) {
    const newAmount = Number(existing.totalAmount) + amount;
    if (newAmount <= 0) {
      await tx.departmentExpense.delete({ where: { id: existing.id } });
    } else {
      await tx.departmentExpense.update({
        where: { id: existing.id },
        data: { totalAmount: newAmount }
      });
    }
  } else if (sign > 0) {
    await tx.departmentExpense.create({
      data: { year, month, department, category, tax: 0, totalAmount: amount }
    });
  }
}

// Helper: sync MonthlyAggregation for expense type
// sign: +1 for add, -1 for reverse; directDiff: for edit mode
async function syncMonthlyAggregation(tx, record, sign, directDiff) {
  const [yearStr, monthStr] = record.expenseMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const amount = directDiff !== undefined ? directDiff : Number(record.totalDebit) * sign;

  const existing = await tx.monthlyAggregation.findFirst({
    where: { aggregationType: 'expense', year, month, warehouse: record.warehouse }
  });

  if (existing) {
    await tx.monthlyAggregation.update({
      where: { id: existing.id },
      data: {
        totalAmount: { increment: amount },
        recordCount: { increment: sign }
      }
    });
  } else if (sign > 0) {
    await tx.monthlyAggregation.create({
      data: {
        aggregationType: 'expense',
        year, month,
        warehouse: record.warehouse,
        totalAmount: amount,
        recordCount: 1
      }
    });
  }
}

// Helper: create CashTransaction for expense and update account balance
async function createExpenseCashTransaction(tx, record, template) {
  const transactionDate = `${record.expenseMonth}-01`;
  const txNo = await generateTxNo(tx, transactionDate);

  // Find the matching cash account by warehouse, prefer 銀行存款 type
  let account = null;
  if (record.warehouse) {
    account = await tx.cashAccount.findFirst({
      where: { warehouse: record.warehouse, isActive: true },
      orderBy: { id: 'asc' }
    });
  }
  if (!account) {
    account = await tx.cashAccount.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' }
    });
  }
  if (!account) return null;

  const templateName = template?.name || '常見費用';
  const categoryId = await getCategoryId(tx, 'common_expense');
  const cashTx = await tx.cashTransaction.create({
    data: {
      transactionNo: txNo,
      transactionDate,
      type: '支出',
      warehouse: record.warehouse,
      accountId: account.id,
      categoryId,
      supplierId: record.supplierId,
      amount: Number(record.totalDebit),
      description: `常見費用 - ${templateName} - ${record.warehouse} - ${record.expenseMonth}`,
      sourceType: 'common_expense',
      sourceRecordId: record.id,
      status: '已確認',
      isAutoCreated: true,
      autoCreationReason: 'common_expense_confirm'
    }
  });

  await recalcAccountBalance(tx, account.id);
  return cashTx;
}

// Helper: reverse CashTransaction for expense void
async function reverseExpenseCashTransaction(tx, recordId) {
  const cashTx = await tx.cashTransaction.findFirst({
    where: { sourceType: 'common_expense', sourceRecordId: recordId, status: '已確認', isReversal: false }
  });
  if (!cashTx) return null;

  const transactionDate = new Date().toISOString().split('T')[0];
  const reversalTxNo = await generateTxNo(tx, transactionDate);

  const reversalTx = await tx.cashTransaction.create({
    data: {
      transactionNo: reversalTxNo,
      transactionDate,
      type: '收入',
      warehouse: cashTx.warehouse,
      accountId: cashTx.accountId,
      categoryId: cashTx.categoryId,
      supplierId: cashTx.supplierId,
      amount: Number(cashTx.amount),
      description: `沖銷 - ${cashTx.description}`,
      sourceType: 'common_expense',
      sourceRecordId: recordId,
      status: '已確認',
      isReversal: true,
      reversalOfId: cashTx.id,
      isAutoCreated: true,
      autoCreationReason: 'common_expense_void'
    }
  });

  // Mark original as reversed
  await tx.cashTransaction.update({
    where: { id: cashTx.id },
    data: { reversedById: reversalTx.id }
  });

  await recalcAccountBalance(tx, cashTx.accountId);
  return reversalTx;
}

function formatRecord(record) {
  return {
    ...record,
    totalDebit: Number(record.totalDebit),
    totalCredit: Number(record.totalCredit),
    entryLines: record.entryLines.map(l => ({ ...l, amount: Number(l.amount) })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    confirmedAt: record.confirmedAt ? record.confirmedAt.toISOString() : null,
    voidedAt: record.voidedAt ? record.voidedAt.toISOString() : null
  };
}

// GET: Get single record with entryLines
export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);

    const record = await prisma.commonExpenseRecord.findUnique({
      where: { id },
      include: {
        template: {
          select: { id: true, name: true, categoryId: true, category: true }
        },
        entryLines: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);
    }

    return NextResponse.json(formatRecord(record));
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: Confirm or Void a record
export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.commonExpenseRecord.findUnique({
      where: { id },
      include: {
        template: {
          select: { id: true, name: true, categoryId: true, category: { select: { name: true } } }
        }
      }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);
    }

    // Action: confirm
    if (data.action === 'confirm') {
      if (existing.status !== '待確認') {
        return createErrorResponse('VALIDATION_FAILED', `無法確認：目前狀態為「${existing.status}」`, 400);
      }

      const updated = await prisma.$transaction(async (tx) => {
        // 1. Update record status
        const record = await tx.commonExpenseRecord.update({
          where: { id },
          data: {
            status: '已確認',
            confirmedBy: data.confirmedBy || '系統',
            confirmedAt: new Date()
          },
          include: {
            template: { select: { id: true, name: true } },
            entryLines: { orderBy: { sortOrder: 'asc' } }
          }
        });

        // 2. Sync DepartmentExpense (+1)
        await syncDepartmentExpense(tx, existing, existing.template, 1);

        // 3. Sync MonthlyAggregation (+1)
        await syncMonthlyAggregation(tx, existing, 1);

        // 4. Create CashTransaction & update CashAccount balance
        await createExpenseCashTransaction(tx, existing, existing.template);

        return record;
      });

      return NextResponse.json(formatRecord(updated));
    }

    // Action: void
    if (data.action === 'void') {
      if (existing.status === '已作廢') {
        return createErrorResponse('VALIDATION_FAILED', '此記錄已作廢', 400);
      }

      if (!data.voidReason?.trim()) {
        return createErrorResponse('REQUIRED_FIELD_MISSING', '請輸入作廢原因', 400);
      }

      const wasConfirmed = existing.status === '已確認';

      const updated = await prisma.$transaction(async (tx) => {
        // 1. Update record status
        const record = await tx.commonExpenseRecord.update({
          where: { id },
          data: {
            status: '已作廢',
            voidedBy: data.voidedBy || '系統',
            voidedAt: new Date(),
            voidReason: data.voidReason.trim()
          },
          include: {
            template: { select: { id: true, name: true } },
            entryLines: { orderBy: { sortOrder: 'asc' } }
          }
        });

        // Only reverse synced data if it was previously confirmed
        if (wasConfirmed) {
          // 2. Reverse DepartmentExpense (-1)
          await syncDepartmentExpense(tx, existing, existing.template, -1);

          // 3. Reverse MonthlyAggregation (-1)
          await syncMonthlyAggregation(tx, existing, -1);

          // 4. Reverse CashTransaction & recalculate balance
          await reverseExpenseCashTransaction(tx, id);
        }

        return record;
      });

      return NextResponse.json(formatRecord(updated));
    }

    // Action: edit (update entry lines, amounts, note — sync to PaymentOrder)
    if (data.action === 'edit') {
      // Only allow edit when linked payment order is 待出納
      if (existing.paymentOrderId) {
        const po = await prisma.paymentOrder.findUnique({ where: { id: existing.paymentOrderId } });
        if (po && po.status !== '待出納') {
          return createErrorResponse('VALIDATION_FAILED', '付款單已執行，無法編輯', 400);
        }
      }

      if (!data.entryLines || data.entryLines.length === 0) {
        return createErrorResponse('VALIDATION_FAILED', '請至少有一筆分錄', 400);
      }

      const newDebitTotal = data.entryLines
        .filter(l => l.entryType === 'debit')
        .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
      const newCreditTotal = data.entryLines
        .filter(l => l.entryType === 'credit')
        .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

      if (newDebitTotal <= 0) {
        return createErrorResponse('VALIDATION_FAILED', '金額必須大於 0', 400);
      }
      if (Math.abs(newDebitTotal - newCreditTotal) > 0.01) {
        return createErrorResponse('VALIDATION_FAILED', `借貸不平衡：借方 ${newDebitTotal.toFixed(2)} ≠ 貸方 ${newCreditTotal.toFixed(2)}`, 400);
      }

      const oldDebitTotal = Number(existing.totalDebit);

      const updated = await prisma.$transaction(async (tx) => {
        // 1. Delete old entry lines
        await tx.recordEntryLine.deleteMany({ where: { recordId: id } });

        // 2. Update record with new entry lines
        const record = await tx.commonExpenseRecord.update({
          where: { id },
          data: {
            totalDebit: newDebitTotal,
            totalCredit: newCreditTotal,
            note: data.note !== undefined ? data.note : existing.note,
            paymentMethod: data.paymentMethod || existing.paymentMethod,
            entryLines: {
              create: data.entryLines.map((line, idx) => ({
                entryType: line.entryType,
                accountingCode: line.accountingCode || '',
                accountingName: line.accountingName || '',
                summary: line.summary || '',
                amount: parseFloat(line.amount),
                sortOrder: idx
              }))
            }
          },
          include: {
            template: { select: { id: true, name: true } },
            entryLines: { orderBy: { sortOrder: 'asc' } }
          }
        });

        // 3. Sync linked PaymentOrder
        if (existing.paymentOrderId) {
          await tx.paymentOrder.update({
            where: { id: existing.paymentOrderId },
            data: {
              amount: newDebitTotal,
              netAmount: newDebitTotal,
              paymentMethod: data.paymentMethod || existing.paymentMethod,
              note: data.note !== undefined ? data.note : undefined,
            }
          });
        }

        // 4. Sync linked EmployeeAdvance (if exists)
        if (existing.paymentOrderId) {
          const linkedAdvance = await tx.employeeAdvance.findFirst({
            where: { paymentOrderId: existing.paymentOrderId, status: '待結算' }
          });
          if (linkedAdvance) {
            await tx.employeeAdvance.update({
              where: { id: linkedAdvance.id },
              data: { amount: newDebitTotal }
            });
          }
        }

        // 5. Adjust DepartmentExpense & MonthlyAggregation if amount changed
        if (existing.status === '已確認' && Math.abs(oldDebitTotal - newDebitTotal) > 0.01) {
          const diff = newDebitTotal - oldDebitTotal;
          await syncDepartmentExpense(tx, existing, existing.template, 0, diff);
          await syncMonthlyAggregation(tx, existing, 0, diff);
        }

        return record;
      });

      return NextResponse.json(formatRecord(updated));
    }

    return createErrorResponse('VALIDATION_FAILED', '無效的操作，請指定 action: confirm、void 或 edit', 400);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: Only if linked payment order status = 待出納
export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
  if (!auth.ok) return auth.response;

  try {
    const id = parseInt(params.id);

    const existing = await prisma.commonExpenseRecord.findUnique({
      where: { id },
      include: {
        template: {
          select: { id: true, name: true, categoryId: true, category: { select: { name: true } } }
        }
      }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到費用記錄', 404);
    }

    // Check linked payment order status
    if (existing.paymentOrderId) {
      const po = await prisma.paymentOrder.findUnique({ where: { id: existing.paymentOrderId } });
      if (po && po.status !== '待出納') {
        return createErrorResponse('VALIDATION_FAILED', `無法刪除：付款單狀態為「${po.status}」，僅「待出納」狀態可刪除`, 400);
      }
    } else if (existing.status !== '待確認') {
      // No linked PO — fallback to old behavior
      return createErrorResponse('VALIDATION_FAILED', `無法刪除：目前狀態為「${existing.status}」，僅「待確認」狀態可刪除`, 400);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete linked EmployeeAdvance records
      if (existing.paymentOrderId) {
        await tx.employeeAdvance.deleteMany({
          where: { paymentOrderId: existing.paymentOrderId }
        });
      }

      // 2. Delete linked CashierExecution records (shouldn't exist for 待出納 but just in case)
      if (existing.paymentOrderId) {
        await tx.cashierExecution.deleteMany({
          where: { paymentOrderId: existing.paymentOrderId }
        });
      }

      // 3. Reverse DepartmentExpense & MonthlyAggregation if was confirmed
      if (existing.status === '已確認') {
        await syncDepartmentExpense(tx, existing, existing.template, -1);
        await syncMonthlyAggregation(tx, existing, -1);
      }

      // 4. Delete entry lines
      await tx.recordEntryLine.deleteMany({ where: { recordId: id } });

      // 5. Delete expense record
      await tx.commonExpenseRecord.delete({ where: { id } });

      // 6. Delete linked PaymentOrder
      if (existing.paymentOrderId) {
        await tx.paymentOrder.delete({ where: { id: existing.paymentOrderId } });
      }
    });

    return NextResponse.json({ message: '費用記錄及關聯付款單已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
