import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';
import { getCategoryId } from '@/lib/cash-category-helper';
import { requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { PERMISSIONS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// Generate transaction number: CF-YYYYMMDD-XXXX
async function generateTransactionNo(date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await prisma.cashTransaction.findMany({
    where: { transactionNo: { startsWith: prefix } },
    select: { transactionNo: true }
  });

  let maxSeq = 0;
  for (const t of existing) {
    const seq = parseInt(t.transactionNo.substring(prefix.length)) || 0;
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

// Recalculate account balance
async function recalcBalance(accountId) {
  const incomes = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '收入' },
    _sum: { amount: true }
  });
  const expenses = await prisma.cashTransaction.aggregate({
    where: { accountId, type: '支出' },
    _sum: { amount: true }
  });
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const newBalance = Number(account.openingBalance) + Number(incomes._sum.amount || 0) - Number(expenses._sum.amount || 0);
  await prisma.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: newBalance }
  });
}

export async function GET(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_VIEW);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const check = await prisma.check.findUnique({
      where: { id },
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } },
        reissueOfCheck: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
        reissuedByChecks: { select: { id: true, checkNo: true, checkNumber: true, status: true } },
      }
    });

    if (!check) {
      return createErrorResponse('NOT_FOUND', '找不到支票', 404);
    }

    return NextResponse.json(check);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const check = await prisma.check.findUnique({
      where: { id },
      include: {
        sourceAccount: { select: { id: true, name: true } },
        destinationAccount: { select: { id: true, name: true } }
      }
    });

    if (!check) {
      return createErrorResponse('NOT_FOUND', '找不到支票', 404);
    }

    // If already cleared and trying to do non-bounce action
    if (check.status === 'cleared' && data.action !== 'bounce') {
      return createErrorResponse('CHECK_ALREADY_CLEARED', '支票已兌現，無法修改', 400);
    }

    // Handle special actions
    if (data.action === 'clear') {
      if (check.status !== 'pending' && check.status !== 'due') {
        return createErrorResponse('VALIDATION_FAILED', '只有待兌現或到期的支票才能兌現', 400);
      }

      const clearDate = data.clearDate || new Date().toISOString().split('T')[0];
      const actualAmount = data.actualAmount ? parseFloat(data.actualAmount) : Number(check.amount);
      const clearedBy = data.clearedBy || null;

      // Create CashTransaction
      const transactionNo = await generateTransactionNo(clearDate);

      let accountId, txType, sourceType;
      if (check.checkType === 'payable') {
        // Payable check: money goes out from source account
        accountId = check.sourceAccountId;
        txType = '支出';
        sourceType = 'check_payment';
      } else {
        // Receivable check: money comes in to destination account
        accountId = check.destinationAccountId;
        txType = '收入';
        sourceType = 'check_receipt';
      }

      if (!accountId) {
        return createErrorResponse('VALIDATION_FAILED', '支票未關聯帳戶，無法兌現', 400);
      }

      // Create transaction
      const categoryId = await getCategoryId(prisma, sourceType);
      const transaction = await prisma.cashTransaction.create({
        data: {
          transactionNo,
          transactionDate: clearDate,
          type: txType,
          warehouse: check.warehouse,
          accountId,
          categoryId,
          amount: actualAmount,
          description: `支票兌現 - ${check.checkNo} (${check.checkNumber})`,
          sourceType,
          sourceRecordId: check.id,
          status: '已確認'
        }
      });

      // Update check
      const updatedCheck = await prisma.check.update({
        where: { id },
        data: {
          status: 'cleared',
          clearDate,
          actualAmount,
          clearedBy,
          cashTransactionId: transaction.id
        },
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });

      // Recalculate balance
      await recalcBalance(accountId);

      return NextResponse.json(updatedCheck);
    }

    if (data.action === 'bounce') {
      if (check.status !== 'pending' && check.status !== 'due' && check.status !== 'cleared') {
        return createErrorResponse('VALIDATION_FAILED', '無法將此狀態的支票標記為退票', 400);
      }

      const updateData = {
        status: 'bounced',
        bouncedReason: data.bouncedReason || null
      };

      // If was cleared, create reverse transaction
      if (check.status === 'cleared' && check.cashTransactionId) {
        const reverseDate = new Date().toISOString().split('T')[0];
        const reverseTransactionNo = await generateTransactionNo(reverseDate);

        let accountId, txType;
        if (check.checkType === 'payable') {
          // Reverse: money comes back (income to source account)
          accountId = check.sourceAccountId;
          txType = '收入';
        } else {
          // Reverse: money goes out (expense from destination account)
          accountId = check.destinationAccountId;
          txType = '支出';
        }

        if (accountId) {
          const bounceCatId = await getCategoryId(prisma, 'check_bounce');
          await prisma.cashTransaction.create({
            data: {
              transactionNo: reverseTransactionNo,
              transactionDate: reverseDate,
              type: txType,
              warehouse: check.warehouse,
              accountId,
              categoryId: bounceCatId,
              amount: Number(check.actualAmount || check.amount),
              description: `支票退票沖回 - ${check.checkNo} (${check.checkNumber})`,
              sourceType: 'check_bounce',
              sourceRecordId: check.id,
              status: '已確認'
            }
          });

          // Recalculate balance
          await recalcBalance(accountId);
        }
      }

      const updatedCheck = await prisma.check.update({
        where: { id },
        data: updateData,
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });

      return NextResponse.json(updatedCheck);
    }

    if (data.action === 'void') {
      if (check.status !== 'pending' && check.status !== 'due') {
        return createErrorResponse('VALIDATION_FAILED', '只有待兌現或到期的支票才能作廢', 400);
      }

      const updatedCheck = await prisma.check.update({
        where: { id },
        data: {
          status: 'void',
          voidReason: data.voidReason || null
        },
        include: {
          sourceAccount: { select: { id: true, name: true, accountCode: true } },
          destinationAccount: { select: { id: true, name: true, accountCode: true } }
        }
      });

      return NextResponse.json(updatedCheck);
    }

    // Regular update (no action) - only if not cleared
    if (check.status === 'cleared') {
      return createErrorResponse('CHECK_ALREADY_CLEARED', '支票已兌現，無法修改', 400);
    }

    const updateData = {};
    if (data.checkNumber !== undefined) updateData.checkNumber = data.checkNumber;
    if (data.amount !== undefined) updateData.amount = parseFloat(data.amount);
    if (data.issueDate !== undefined) updateData.issueDate = data.issueDate;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.drawerType !== undefined) updateData.drawerType = data.drawerType;
    if (data.drawerName !== undefined) updateData.drawerName = data.drawerName;
    if (data.sourceAccountId !== undefined) updateData.sourceAccountId = data.sourceAccountId ? parseInt(data.sourceAccountId) : null;
    if (data.payeeName !== undefined) updateData.payeeName = data.payeeName;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId ? parseInt(data.supplierId) : null;
    if (data.destinationAccountId !== undefined) updateData.destinationAccountId = data.destinationAccountId ? parseInt(data.destinationAccountId) : null;
    if (data.warehouse !== undefined) updateData.warehouse = data.warehouse;
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.bankBranch !== undefined) updateData.bankBranch = data.bankBranch;
    if (data.note !== undefined) updateData.note = data.note;

    const updatedCheck = await prisma.check.update({
      where: { id },
      data: updateData,
      include: {
        sourceAccount: { select: { id: true, name: true, accountCode: true } },
        destinationAccount: { select: { id: true, name: true, accountCode: true } }
      }
    });

    return NextResponse.json(updatedCheck);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  const auth = await requirePermission(PERMISSIONS.CHECK_CREATE);
  if (!auth.ok) return auth.response;
  
  try {
    const id = parseInt(params.id);

    const check = await prisma.check.findUnique({ where: { id } });
    if (!check) {
      return createErrorResponse('NOT_FOUND', '找不到支票', 404);
    }

    if (check.status !== 'pending') {
      return createErrorResponse('VALIDATION_FAILED', '只有待處理狀態的支票才能刪除', 400);
    }

    await prisma.check.delete({ where: { id } });

    return NextResponse.json({ success: true, message: '支票已刪除' });
  } catch (error) {
    return handleApiError(error);
  }
}
