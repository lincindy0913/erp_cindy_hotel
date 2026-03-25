import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { assertWarehouseAccess } from '@/lib/warehouse-access';

export const dynamic = 'force-dynamic';

// GET: 取得單筆代墊款
export async function GET(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.EXPENSE_VIEW);
    if (!auth.ok) return auth.response;

    const id = parseInt(params.id);
    const record = await prisma.employeeAdvance.findUnique({ where: { id } });
    if (!record) {
      return createErrorResponse('NOT_FOUND', '找不到代墊款記錄', 404);
    }
    return NextResponse.json(record);
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT: 編輯代墊款（僅限待結算狀態）
export async function PUT(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
    if (!auth.ok) return auth.response;

    const id = parseInt(params.id);
    const body = await request.json();

    const existing = await prisma.employeeAdvance.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到代墊款記錄', 404);
    }

    const wa = assertWarehouseAccess(auth.session, existing.warehouse);
    if (!wa.ok) return wa.response;

    if (existing.status !== '待結算') {
      return createErrorResponse('VALIDATION_FAILED', `無法編輯：目前狀態為「${existing.status}」，僅「待結算」可編輯`, 400);
    }

    const updateData = {};
    if (body.employeeName !== undefined) updateData.employeeName = body.employeeName;
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount);
    if (body.expenseName !== undefined) updateData.expenseName = body.expenseName || null;
    if (body.summary !== undefined) updateData.summary = body.summary || null;
    if (body.sourceDescription !== undefined) updateData.sourceDescription = body.sourceDescription || null;
    if (body.warehouse !== undefined) updateData.warehouse = body.warehouse || null;
    if (body.note !== undefined) updateData.note = body.note || null;

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.employeeAdvance.update({
        where: { id },
        data: updateData,
      });

      // 同步更新關聯的 PaymentOrder 金額（如有）
      if (existing.paymentOrderId && body.amount !== undefined) {
        const newAmount = parseFloat(body.amount);
        const linkedAdvances = await tx.employeeAdvance.findMany({
          where: { paymentOrderId: existing.paymentOrderId },
        });
        const totalAmount = linkedAdvances.reduce((sum, a) => sum + Number(a.amount), 0);
        await tx.paymentOrder.update({
          where: { id: existing.paymentOrderId },
          data: { amount: totalAmount, netAmount: totalAmount },
        });

        // 同步更新關聯的 CommonExpenseRecord 金額
        const linkedRecord = await tx.commonExpenseRecord.findFirst({
          where: { paymentOrderId: existing.paymentOrderId },
        });
        if (linkedRecord) {
          await tx.commonExpenseRecord.update({
            where: { id: linkedRecord.id },
            data: { totalDebit: totalAmount, totalCredit: totalAmount },
          });
        }
      }

      return record;
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE: 刪除代墊款（僅限待結算狀態），連動刪除關聯資料
export async function DELETE(request, { params }) {
  try {
    const auth = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
    if (!auth.ok) return auth.response;

    const id = parseInt(params.id);

    const existing = await prisma.employeeAdvance.findUnique({ where: { id } });
    if (!existing) {
      return createErrorResponse('NOT_FOUND', '找不到代墊款記錄', 404);
    }

    const wa = assertWarehouseAccess(auth.session, existing.warehouse);
    if (!wa.ok) return wa.response;

    if (existing.status !== '待結算') {
      return createErrorResponse('VALIDATION_FAILED', `無法刪除：目前狀態為「${existing.status}」，僅「待結算」可刪除`, 400);
    }

    await prisma.$transaction(async (tx) => {
      // 刪除此筆代墊款
      await tx.employeeAdvance.delete({ where: { id } });

      // 檢查同一 PaymentOrder 是否還有其他代墊款
      if (existing.paymentOrderId) {
        const remaining = await tx.employeeAdvance.findMany({
          where: { paymentOrderId: existing.paymentOrderId },
        });

        if (remaining.length === 0) {
          // 沒有其他代墊款了，連動刪除 PaymentOrder 和 CommonExpenseRecord
          const linkedRecord = await tx.commonExpenseRecord.findFirst({
            where: { paymentOrderId: existing.paymentOrderId },
          });

          if (linkedRecord) {
            // 回沖 DepartmentExpense & MonthlyAggregation
            if (linkedRecord.status === '已確認' && linkedRecord.expenseMonth) {
              const [yearStr, monthStr] = linkedRecord.expenseMonth.split('-');
              const year = parseInt(yearStr);
              const month = parseInt(monthStr);
              const dept = linkedRecord.warehouse || '未指定';
              const amount = Number(linkedRecord.totalDebit);

              const exDept = await tx.departmentExpense.findFirst({
                where: { year, month, department: dept },
              });
              if (exDept) {
                const newAmt = Number(exDept.totalAmount) - amount;
                if (newAmt <= 0) await tx.departmentExpense.delete({ where: { id: exDept.id } });
                else await tx.departmentExpense.update({ where: { id: exDept.id }, data: { totalAmount: newAmt } });
              }

              const exAgg = await tx.monthlyAggregation.findFirst({
                where: { aggregationType: 'expense', year, month, warehouse: dept },
              });
              if (exAgg) {
                await tx.monthlyAggregation.update({
                  where: { id: exAgg.id },
                  data: { totalAmount: { decrement: amount }, recordCount: { decrement: 1 } },
                });
              }
            }

            // 刪除分錄
            await tx.recordEntryLine.deleteMany({ where: { recordId: linkedRecord.id } });
            // 刪除費用記錄
            await tx.commonExpenseRecord.delete({ where: { id: linkedRecord.id } });
          }

          // 刪除付款單
          await tx.paymentOrder.delete({ where: { id: existing.paymentOrderId } });
        } else {
          // 還有其他代墊款，更新 PaymentOrder 金額
          const totalAmount = remaining.reduce((sum, a) => sum + Number(a.amount), 0);
          await tx.paymentOrder.update({
            where: { id: existing.paymentOrderId },
            data: { amount: totalAmount, netAmount: totalAmount },
          });

          // 同步更新 CommonExpenseRecord
          const linkedRecord = await tx.commonExpenseRecord.findFirst({
            where: { paymentOrderId: existing.paymentOrderId },
          });
          if (linkedRecord) {
            await tx.commonExpenseRecord.update({
              where: { id: linkedRecord.id },
              data: { totalDebit: totalAmount, totalCredit: totalAmount },
            });
          }
        }
      }
    });

    return NextResponse.json({ message: '代墊款記錄已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
