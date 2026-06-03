import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { requirePermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';
import { assertPeriodOpen } from '@/lib/period-lock';
import { nextCashTransactionNo } from '@/lib/sequence-generator';
import { auditFromSession, AUDIT_ACTIONS } from '@/lib/audit';
import { checkIdempotency, saveIdempotency } from '@/lib/idempotency';

export const dynamic = 'force-dynamic';

// POST: 結算員工代墊款 (資金移轉：公司帳戶 → 員工)
export async function POST(request) {
  try {
    const cached = checkIdempotency(request);
    if (cached) return cached;

    const auth = await requirePermission(PERMISSIONS.CASHIER_EXECUTE);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    const body = await request.json();
    const { advanceIds, accountId, settleDate, paymentMethod, note, billTotal, privateAmount, privateAccountId } = body;

    if (!advanceIds || !Array.isArray(advanceIds) || advanceIds.length === 0) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇要結算的代墊款', 400);
    }
    if (!accountId) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇付款帳戶', 400);
    }
    if (!settleDate) {
      return createErrorResponse('REQUIRED_FIELD_MISSING', '請選擇結算日期', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Fetch all advance records
      const advances = await tx.employeeAdvance.findMany({
        where: { id: { in: advanceIds.map(id => parseInt(id)) } },
      });

      if (advances.length === 0) {
        throw new Error('找不到代墊款紀錄');
      }

      // Verify all are pending
      const nonPending = advances.filter(a => a.status !== '待結算');
      if (nonPending.length > 0) {
        throw new Error(`以下代墊款已結算：${nonPending.map(a => a.advanceNo).join(', ')}`);
      }

      // Reject cross-warehouse batch — cashTransaction can only belong to one warehouse
      const warehouses = [...new Set(advances.map(a => a.warehouse ?? ''))];
      if (warehouses.length > 1) {
        const warehouseList = warehouses.filter(w => w !== '').join('、') || '（未指定館別）';
        throw new Error(`VALIDATION:批次結算不可跨館別，請分開結算。涉及館別：${warehouseList}`);
      }

      // Enforce period lock with the resolved warehouse
      await assertPeriodOpen(tx, settleDate, advances[0].warehouse ?? null);

      const totalAmount = advances.reduce((sum, a) => sum + Number(a.amount), 0);

      // Generate transaction number
      const txNo = await nextCashTransactionNo(tx, settleDate);

      // Group by employee for description
      const employeeNames = [...new Set(advances.map(a => a.employeeName))];
      const description = `員工代墊款結算 - ${employeeNames.join(', ')} (${advances.length}筆)`;

      // Create CashTransaction (支出 from company account)
      const categoryId = await getCategoryId(tx, 'employee_advance_settle');
      const cashTx = await tx.cashTransaction.create({
        data: {
          transactionNo: txNo,
          transactionDate: settleDate,
          type: '支出',
          warehouse: advances[0].warehouse,
          accountId: parseInt(accountId),
          categoryId,
          amount: totalAmount,
          description,
          sourceType: 'employee_advance_settle',
          sourceRecordId: advances[0].id,
          paymentNo: advances.map(a => a.advanceNo).join(','),
          status: '已確認',
          isAutoCreated: false,
          createdBy: session?.user?.id ? parseInt(session.user.id) : null,
        },
      });

      // Update all advance records to settled
      for (const adv of advances) {
        await tx.employeeAdvance.update({
          where: { id: adv.id },
          data: {
            status: '已結算',
            settledAmount: Number(adv.amount),
            settledDate: settleDate,
            settledAccountId: parseInt(accountId),
            settlementTxId: cashTx.id,
            settlementTxNo: txNo,
          },
        });
      }

      // Handle boss's private amount (股東往來)
      let privateTxNo = null;
      if (privateAmount && privateAmount > 0) {
        privateTxNo = await nextCashTransactionNo(tx, settleDate);

        const privateCategoryId = await getCategoryId(tx, 'shareholder_loan');

        await tx.cashTransaction.create({
          data: {
            transactionNo: privateTxNo,
            transactionDate: settleDate,
            type: '支出',
            warehouse: advances[0].warehouse,
            accountId: parseInt(accountId),
            categoryId: privateCategoryId,
            amount: parseFloat(privateAmount),
            description: `股東往來/老闆借支 — 信用卡帳單私帳部分 (帳單總額 ${billTotal?.toLocaleString()})`,
            sourceType: 'shareholder_loan',
            sourceRecordId: cashTx.id,
            paymentNo: txNo,
            status: '已確認',
            isAutoCreated: false,
            createdBy: session?.user?.id ? parseInt(session.user.id) : null,
          },
        });
      }

      // Recalculate account balance once at end (after all transactions created)
      await recalcBalance(tx, parseInt(accountId));

      return {
        settledCount: advances.length,
        totalAmount,
        cashTransactionNo: txNo,
        privateTxNo,
        privateAmount: privateAmount || 0,
        employeeNames,
      };
    });

    // Audit log
    if (session) {
      await auditFromSession(prisma, session, {
        action: AUDIT_ACTIONS.CASH_TRANSACTION_CREATE,
        targetModule: 'employee_advance',
        targetRecordNo: result.cashTransactionNo,
        afterState: { settledCount: result.settledCount, totalAmount: result.totalAmount, employeeNames: result.employeeNames },
        note: `員工代墊款結算 ${result.settledCount} 筆`,
      });
    }

    const privateMsg = result.privateAmount > 0
      ? `\n老闆私帳 NT$ ${result.privateAmount.toLocaleString()} 已記入股東往來 (${result.privateTxNo})`
      : '';
    const resBody = {
      message: `成功結算 ${result.settledCount} 筆代墊款，公費 NT$ ${result.totalAmount.toLocaleString()}${privateMsg}`,
      ...result,
    };
    saveIdempotency(request, resBody, 200);
    return NextResponse.json(resBody, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
