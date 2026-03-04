import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createErrorResponse, handleApiError } from '@/lib/error-handler';

export const dynamic = 'force-dynamic';

// Helper: recalculate account balance from opening + all transactions
async function recalcBalance(tx, accountId) {
  const account = await tx.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const transactions = await tx.cashTransaction.findMany({
    where: { accountId },
    select: { type: true, amount: true, fee: true, hasFee: true }
  });

  let balance = Number(account.openingBalance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    const fee = t.hasFee ? Number(t.fee) : 0;

    if (t.type === '收入') {
      balance += amt;
    } else if (t.type === '支出') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉') {
      balance -= amt;
      balance -= fee;
    } else if (t.type === '移轉入') {
      balance += amt;
    }
  }

  await tx.cashAccount.update({
    where: { id: accountId },
    data: { currentBalance: balance }
  });
}

// Generate transaction number: CF-YYYYMMDD-XXXX
async function generateTransactionNo(tx, date) {
  const dateStr = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const prefix = `CF-${dateStr}-`;

  const existing = await tx.cashTransaction.findMany({
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

export async function PUT(request, { params }) {
  try {
    const id = parseInt(params.id);
    const data = await request.json();

    const existing = await prisma.loanMonthlyRecord.findUnique({
      where: { id },
      include: { loan: true }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '還款記錄不存在', 404);
    }

    // Step 2: 核實 (Confirm actual amounts)
    if (data.actualPrincipal !== undefined && data.actualInterest !== undefined) {
      const actualPrincipal = parseFloat(data.actualPrincipal);
      const actualInterest = parseFloat(data.actualInterest);
      const actualTotal = actualPrincipal + actualInterest;
      const today = new Date().toISOString().split('T')[0];
      const accountId = existing.deductAccountId || existing.loan.deductAccountId;

      const result = await prisma.$transaction(async (tx) => {
        // Generate transaction numbers for principal and interest
        const principalTxNo = await generateTransactionNo(tx, today);
        const interestTxNo = await generateTransactionNo(tx, today);
        // Ensure unique: if same prefix, increment
        const finalInterestTxNo = interestTxNo === principalTxNo
          ? principalTxNo.replace(/(\d{4})$/, (m) => String(parseInt(m) + 1).padStart(4, '0'))
          : interestTxNo;

        // Create CashTransaction for principal (支出)
        const principalTx = await tx.cashTransaction.create({
          data: {
            transactionNo: principalTxNo,
            transactionDate: data.actualDebitDate || today,
            type: '支出',
            warehouse: existing.loan.warehouse || null,
            accountId,
            amount: actualPrincipal,
            fee: 0,
            hasFee: false,
            description: `貸款本金 - ${existing.loan.loanName} (${existing.recordYear}/${existing.recordMonth})`,
            sourceType: 'loan_payment',
            sourceRecordId: id,
            status: '已確認'
          }
        });

        // Create CashTransaction for interest (支出)
        const interestTx = await tx.cashTransaction.create({
          data: {
            transactionNo: finalInterestTxNo,
            transactionDate: data.actualDebitDate || today,
            type: '支出',
            warehouse: existing.loan.warehouse || null,
            accountId,
            amount: actualInterest,
            fee: 0,
            hasFee: false,
            description: `貸款利息 - ${existing.loan.loanName} (${existing.recordYear}/${existing.recordMonth})`,
            sourceType: 'loan_payment',
            sourceRecordId: id,
            status: '已確認'
          }
        });

        // Update the monthly record
        const updated = await tx.loanMonthlyRecord.update({
          where: { id },
          data: {
            actualPrincipal,
            actualInterest,
            actualTotal,
            actualDebitDate: data.actualDebitDate || today,
            statementNo: data.statementNo || null,
            status: '已核實',
            confirmedAt: new Date(),
            confirmedBy: data.confirmedBy || null,
            note: data.note !== undefined ? data.note : existing.note
          }
        });

        // Recalculate account balance
        await recalcBalance(tx, accountId);

        // Update LoanMaster.currentBalance -= actualPrincipal
        await tx.loanMaster.update({
          where: { id: existing.loanId },
          data: {
            currentBalance: {
              decrement: actualPrincipal
            }
          }
        });

        return updated;
      });

      return NextResponse.json({
        ...result,
        estimatedPrincipal: Number(result.estimatedPrincipal),
        estimatedInterest: Number(result.estimatedInterest),
        estimatedTotal: Number(result.estimatedTotal),
        actualPrincipal: Number(result.actualPrincipal),
        actualInterest: Number(result.actualInterest),
        actualTotal: Number(result.actualTotal),
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        confirmedAt: result.confirmedAt ? result.confirmedAt.toISOString() : null
      });
    }

    // Regular update (note, estimated amounts, etc.)
    const updateData = {};
    if (data.estimatedPrincipal !== undefined) updateData.estimatedPrincipal = parseFloat(data.estimatedPrincipal);
    if (data.estimatedInterest !== undefined) updateData.estimatedInterest = parseFloat(data.estimatedInterest);
    if (data.estimatedPrincipal !== undefined || data.estimatedInterest !== undefined) {
      const ep = data.estimatedPrincipal !== undefined ? parseFloat(data.estimatedPrincipal) : Number(existing.estimatedPrincipal);
      const ei = data.estimatedInterest !== undefined ? parseFloat(data.estimatedInterest) : Number(existing.estimatedInterest);
      updateData.estimatedTotal = ep + ei;
    }
    if (data.note !== undefined) updateData.note = data.note || null;
    if (data.status !== undefined) updateData.status = data.status;

    const updated = await prisma.loanMonthlyRecord.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({
      ...updated,
      estimatedPrincipal: Number(updated.estimatedPrincipal),
      estimatedInterest: Number(updated.estimatedInterest),
      estimatedTotal: Number(updated.estimatedTotal),
      actualPrincipal: updated.actualPrincipal !== null ? Number(updated.actualPrincipal) : null,
      actualInterest: updated.actualInterest !== null ? Number(updated.actualInterest) : null,
      actualTotal: updated.actualTotal !== null ? Number(updated.actualTotal) : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const id = parseInt(params.id);

    const existing = await prisma.loanMonthlyRecord.findUnique({
      where: { id },
      include: { loan: true }
    });

    if (!existing) {
      return createErrorResponse('NOT_FOUND', '還款記錄不存在', 404);
    }

    if (existing.status === '暫估') {
      // Simple delete for estimated records
      await prisma.loanMonthlyRecord.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    if (existing.status === '已核實') {
      // Delete record + associated CashTransactions + recalculate balance + rollback currentBalance
      const accountId = existing.deductAccountId || existing.loan.deductAccountId;
      const actualPrincipal = Number(existing.actualPrincipal) || 0;

      await prisma.$transaction(async (tx) => {
        // Delete associated CashTransactions
        await tx.cashTransaction.deleteMany({
          where: {
            sourceType: 'loan_payment',
            sourceRecordId: id
          }
        });

        // Delete the record
        await tx.loanMonthlyRecord.delete({ where: { id } });

        // Recalculate account balance
        await recalcBalance(tx, accountId);

        // Rollback LoanMaster.currentBalance += actualPrincipal
        await tx.loanMaster.update({
          where: { id: existing.loanId },
          data: {
            currentBalance: {
              increment: actualPrincipal
            }
          }
        });
      });

      return NextResponse.json({ success: true });
    }

    // For other statuses (跳過, etc.), just delete
    await prisma.loanMonthlyRecord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
