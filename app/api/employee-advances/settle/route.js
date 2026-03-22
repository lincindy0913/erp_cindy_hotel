import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getCategoryId } from '@/lib/cash-category-helper';
import { recalcBalance } from '@/lib/recalc-balance';

export const dynamic = 'force-dynamic';

// POST: 結算員工代墊款 (資金移轉：公司帳戶 → 員工)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
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

      const totalAmount = advances.reduce((sum, a) => sum + Number(a.amount), 0);

      // Generate transaction number
      const dateStr = settleDate.replace(/-/g, '');
      const txPrefix = `CF-${dateStr}-`;
      const existingTx = await tx.cashTransaction.findMany({
        where: { transactionNo: { startsWith: txPrefix } },
        select: { transactionNo: true },
      });
      let maxTxSeq = 0;
      for (const item of existingTx) {
        const seq = parseInt(item.transactionNo.substring(txPrefix.length)) || 0;
        if (seq > maxTxSeq) maxTxSeq = seq;
      }
      const txNo = `${txPrefix}${String(maxTxSeq + 1).padStart(4, '0')}`;

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
        const privateTxSeq = maxTxSeq + 2; // next sequence after the main tx
        privateTxNo = `${txPrefix}${String(privateTxSeq).padStart(4, '0')}`;

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

    const privateMsg = result.privateAmount > 0
      ? `\n老闆私帳 NT$ ${result.privateAmount.toLocaleString()} 已記入股東往來 (${result.privateTxNo})`
      : '';
    return NextResponse.json({
      message: `成功結算 ${result.settledCount} 筆代墊款，公費 NT$ ${result.totalAmount.toLocaleString()}${privateMsg}`,
      ...result,
    }, { status: 200 });
  } catch (error) {
    console.error('POST /api/employee-advances/settle error:', error);
    return handleApiError(error);
  }
}
